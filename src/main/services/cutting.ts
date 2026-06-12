import { join, basename, extname } from 'node:path'
import type { CutMode, FileProgress } from '../../shared/types'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { runFfmpeg } from './ffmpeg'
import { streamFrames, type FrameSampling } from './frames'
import { preprocessImage, normalizeToChw, FRAME_FLOATS } from './preprocess'
import { getEmbedding, getEmbeddings, cosineSimilarity, BATCH_SIZE } from './similarity'
import { getSampleImage } from '../db/sampleImages'
import log from '../logger'

const MIN_START_MS = 2000
const SIMILARITY_THRESHOLD = 0.9

// Progress phases (must sum to 1):
//   streaming extract+search  0 → 0.90  (producer/consumer pipeline)
//   ffmpeg cut                0.90 → 1.00
const STREAM_END = 0.9

function makeOutputDir(): string {
  const now = new Date()
  const ts =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  const dir = join(homedir(), 'ffmpeg-output', ts)
  mkdirSync(dir, { recursive: true })
  return dir
}

export type CuttingResult = { outputs: string[]; outputDir: string }

export async function cutVideos(
  jobs: { input: string; sampleImageId: number }[],
  cutMode: CutMode,
  onProgress: (progress: FileProgress[]) => void,
  signal: AbortSignal
): Promise<CuttingResult> {
  const outputDir = makeOutputDir()
  const outputs: string[] = []

  const perFile: FileProgress[] = jobs.map((job) => ({
    name: basename(job.input),
    value: 0,
    done: false,
    active: false
  }))

  for (let i = 0; i < jobs.length; i++) {
    if (signal.aborted) break
    const { input, sampleImageId } = jobs[i]

    // Mark as active (value=0 → striped "Preparing…" animation in the modal)
    perFile[i] = { ...perFile[i], active: true, value: 0 }
    onProgress([...perFile])

    const sampleImage = getSampleImage(sampleImageId)
    if (!sampleImage) throw new Error(`Sample image ${sampleImageId} not found`)

    const sampleEmbedding = await getEmbedding(await preprocessImage(sampleImage.path))

    // ── Streaming phase: extraction and search overlap (0 → STREAM_END) ────
    // Frames arrive from the ffmpeg pipe as they are decoded and are scored in
    // constant-shape batches; a completed match window kills the producer
    // without decoding the rest of the video.
    const runStreamingSearch = async (
      useHwaccel: boolean,
      sampling: FrameSampling
    ): Promise<{ matchStartMs: number | null; matchEndMs: number | null }> => {
      const stream = streamFrames(input, signal, useHwaccel, sampling)

      let matchStartMs: number | null = null
      let matchEndMs: number | null = null
      let terminated = false
      let consumed = 0
      let lastValue = 0

      const batchBuf = new Float32Array(BATCH_SIZE * FRAME_FLOATS)
      const batchTs: number[] = []

      const reportStreamProgress = (): void => {
        const produced = stream.producedCount()
        const ratio = produced > 0 ? Math.min(consumed / produced, 1) : 0
        // Monotonic guard: produced/consumed ratios fluctuate as the pipeline
        // fills and drains; never let the bar move backwards.
        const value = Math.max(lastValue, STREAM_END * stream.producedFraction() * ratio)
        lastValue = value
        perFile[i] = { ...perFile[i], value, active: true }
        onProgress([...perFile])
      }

      const flushBatch = async (): Promise<void> => {
        if (batchTs.length === 0) return
        // Zero the padded tail so every run sees deterministic input; the padded
        // rows of the output are simply never read below.
        batchBuf.fill(0, batchTs.length * FRAME_FLOATS)
        const { data, dim } = await getEmbeddings(batchBuf)
        for (let r = 0; r < batchTs.length; r++) {
          const similarity = cosineSimilarity(
            sampleEmbedding,
            data.subarray(r * dim, (r + 1) * dim)
          )
          const ts = batchTs[r]
          log.debug(`Frame @${ts}ms similarity=${similarity.toFixed(4)}`)

          if (similarity >= SIMILARITY_THRESHOLD) {
            if (matchStartMs === null) matchStartMs = ts
            matchEndMs = ts

            // In "start" mode we can stop as soon as we find the first match
            if (cutMode === 'start') {
              terminated = true
              break
            }
          } else if (matchEndMs !== null) {
            // Similarity just dropped below threshold after a match run — the
            // window is complete; stop consuming and kill the producer.
            terminated = true
            break
          }
        }
        batchTs.length = 0
      }

      try {
        for await (const frame of stream.frames) {
          if (signal.aborted || terminated) break
          consumed++
          if (frame.timestampMs >= MIN_START_MS) {
            normalizeToChw(frame.pixels, batchBuf, batchTs.length * FRAME_FLOATS)
            batchTs.push(frame.timestampMs)
            // Adaptive flush: full batch, or producer idle (queue drained) — a
            // padded batch costs the same ~6 ms the consumer would spend waiting.
            if (batchTs.length === BATCH_SIZE || stream.pendingCount() === 0) {
              await flushBatch()
            }
          }
          reportStreamProgress()
        }
        if (!signal.aborted && !terminated) await flushBatch()
      } finally {
        stream.stop() // idempotent — early termination, abort, and errors all land here
      }

      return { matchStartMs, matchEndMs }
    }

    const searchWith = async (
      sampling: FrameSampling
    ): Promise<{ matchStartMs: number | null; matchEndMs: number | null }> => {
      try {
        return await runStreamingSearch(true, sampling)
      } catch (err) {
        if (signal.aborted) throw err
        // Hardware-accelerated decode can fail on exotic codecs even though
        // '-hwaccel auto' normally falls back by itself — retry fully in software.
        log.warn(
          `streaming search failed with hwaccel; retrying without: ${err instanceof Error ? err.message : String(err)}`
        )
        perFile[i] = { ...perFile[i], value: 0, active: true }
        onProgress([...perFile])
        return await runStreamingSearch(false, sampling)
      }
    }

    // Keyframe-only decoding is ~34× faster and costs no output precision (the
    // -c copy cut snaps to a keyframe regardless). A match window shorter than
    // one GOP can slip through it, so an empty result re-runs densely.
    let search = await searchWith('keyframes')
    if (search.matchStartMs === null && !signal.aborted) {
      log.info('No match at keyframe sampling — retrying with dense 1 frame/s sampling')
      perFile[i] = { ...perFile[i], value: 0, active: true }
      onProgress([...perFile])
      search = await searchWith('dense')
    }
    const { matchStartMs, matchEndMs } = search

    // Pick cut point based on mode; fall back to MIN_START_MS if no match
    const cutMs =
      cutMode === 'start'
        ? (matchStartMs ?? MIN_START_MS)
        : (matchEndMs ?? matchStartMs ?? MIN_START_MS)

    log.info(
      `Cut mode=${cutMode} matchStart=${matchStartMs}ms matchEnd=${matchEndMs}ms → cutting at ${cutMs}ms`
    )

    const stem = basename(input, extname(input))
    const ext = extname(input).replace('.', '') || 'mp4'
    const output = join(outputDir, `${stem}_cut.${ext}`)

    let cutSucceeded = false

    // ── Cut phase: ffmpeg stream copy (STREAM_END → 1.0) ───────────────────
    if (!signal.aborted) {
      // Snap to the phase boundary so the cut phase never goes backwards
      perFile[i] = { ...perFile[i], value: STREAM_END, active: true }
      onProgress([...perFile])

      try {
        await runFfmpeg(
          ['-ss', String(cutMs / 1000), '-i', input, '-c', 'copy', '-y', output],
          (value) => {
            perFile[i] = {
              ...perFile[i],
              value: STREAM_END + value * (1 - STREAM_END),
              active: true
            }
            onProgress([...perFile])
          },
          signal
        )
        outputs.push(output)
        cutSucceeded = true
      } catch (err) {
        // Delete the partial output file so cancelled/failed files don't litter the output dir
        if (existsSync(output)) {
          try {
            unlinkSync(output)
          } catch {
            /* ignore */
          }
        }
        perFile[i] = { ...perFile[i], active: false }
        onProgress([...perFile])
        if (!signal.aborted) throw err
      }
    } else {
      perFile[i] = { ...perFile[i], active: false }
      onProgress([...perFile])
    }

    if (cutSucceeded) {
      perFile[i] = { ...perFile[i], value: 1, done: true, active: false }
      onProgress([...perFile])
    }
  }

  return { outputs, outputDir }
}
