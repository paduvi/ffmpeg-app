import { join, basename, extname } from 'node:path'
import type { CutJob, CutMode, FileProgress } from '../../shared/types'
import { unlinkSync, existsSync } from 'node:fs'
import pLimit from 'p-limit'
import { runFfmpeg } from './ffmpeg'
import { makeOutputDir } from './outputDir'
import { streamFrames, type FrameSampling } from './frames'
import { probeVideo } from './probe'
import { recordThroughput } from './estimate'
import { preprocessImage, normalizeToChw, FRAME_FLOATS } from './preprocess'
import { getEmbedding, getEmbeddings, cosineSimilarity, BATCH_SIZE } from './similarity'
import { getSampleImage } from '../db/sampleImages'
import log from '../logger'

const MIN_START_MS = 2000
const SIMILARITY_THRESHOLD = 0.9

/**
 * Concurrent cutting pipelines. Each pipeline is bound by its own ffmpeg
 * decode (a separate OS process); the shared ONNX session handles concurrent
 * run() calls and all pipelines submit the same constant batch shape, so
 * inference (~6 ms/batch) is nowhere near contention. Memory ≈ 20 MB per
 * pipeline (batch buffer + frame queue).
 */
const CUT_CONCURRENCY = 4

// Progress phases (must sum to 1):
//   streaming extract+search  0 → 0.90  (producer/consumer pipeline)
//   ffmpeg cut                0.90 → 1.00
// Trim mode skips the search entirely, so its cut phase starts at 0 instead.
const STREAM_END = 0.9

export type CuttingResult = { outputs: string[]; outputDir: string }

export async function cutVideos(
  jobs: CutJob[],
  cutMode: CutMode,
  onProgress: (progress: FileProgress[]) => void,
  signal: AbortSignal
): Promise<CuttingResult> {
  const outputDir = makeOutputDir()
  const outputs = new Array<string>(jobs.length)

  const perFile: FileProgress[] = jobs.map((job) => ({
    name: basename(job.input),
    value: 0,
    done: false,
    active: false
  }))

  // One embedding per distinct sample image, shared by all parallel jobs.
  // The map stores the promise so concurrent tasks never compute it twice.
  const sampleEmbeddings = new Map<number, Promise<Float32Array>>()
  const sampleEmbeddingFor = (sampleImageId: number): Promise<Float32Array> => {
    let pending = sampleEmbeddings.get(sampleImageId)
    if (!pending) {
      const sampleImage = getSampleImage(sampleImageId)
      if (!sampleImage) throw new Error(`Sample image ${sampleImageId} not found`)
      pending = preprocessImage(sampleImage.path).then(getEmbedding)
      sampleEmbeddings.set(sampleImageId, pending)
    }
    return pending
  }

  const limit = pLimit(CUT_CONCURRENCY)

  const tasks = jobs.map((job, i) =>
    limit(async () => {
      if (signal.aborted) return
      const { input } = job
      const startedAt = Date.now()

      // Mark as active (value=0 → striped "Preparing…" animation in the modal)
      perFile[i] = { ...perFile[i], active: true, value: 0 }
      onProgress([...perFile])

      // Cached after the renderer's estimate probe, so normally free here.
      const meta = await probeVideo(input)

      // The user's window applies in every mode: it bounds the ML search and
      // always supplies the output's end, so a sample cut and a manual trim
      // compose instead of competing. A missing range means the whole video.
      const trim = job.trim
      const trimStartSec = Math.max(0, trim?.startSec ?? 0)
      // A null end means "to the end of the video"; prefer the probed duration
      // so the cut phase gets a real denominator for its progress bar.
      const trimEndSec = trim?.endSec ?? meta.durationSec ?? null
      if (trimEndSec !== null && trimEndSec <= trimStartSec) {
        throw new Error(
          `Trim range for ${basename(input)} is empty: end ${trimEndSec}s is not after start ${trimStartSec}s`
        )
      }
      // The 2-second start rule is inherited from the JavaFX app; an explicit
      // trim start raises that floor but never lowers it.
      const searchFloorMs = Math.max(MIN_START_MS, trimStartSec * 1000)
      const searchCeilingMs = trimEndSec === null ? Infinity : trimEndSec * 1000

      // ── Streaming phase: extraction and search overlap (0 → STREAM_END) ──
      // Frames arrive from the ffmpeg pipe as they are decoded and are scored
      // in constant-shape batches; a completed match window kills the producer
      // without decoding the rest of the video.
      const runStreamingSearch = async (
        sampleEmbedding: Float32Array,
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
            // Past the trim end nothing can affect the output — flush and stop.
            if (frame.timestampMs > searchCeilingMs) {
              await flushBatch()
              terminated = true
              break
            }
            if (frame.timestampMs >= searchFloorMs) {
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
        sampleEmbedding: Float32Array,
        sampling: FrameSampling
      ): Promise<{ matchStartMs: number | null; matchEndMs: number | null }> => {
        try {
          return await runStreamingSearch(sampleEmbedding, true, sampling)
        } catch (err) {
          if (signal.aborted) throw err
          // Hardware-accelerated decode can fail on exotic codecs even though
          // '-hwaccel auto' normally falls back by itself — retry fully in software.
          log.warn(
            `streaming search failed with hwaccel; retrying without: ${err instanceof Error ? err.message : String(err)}`
          )
          perFile[i] = { ...perFile[i], value: 0, active: true }
          onProgress([...perFile])
          return await runStreamingSearch(sampleEmbedding, false, sampling)
        }
      }

      /** Locate the cut point with the ML search. Returns seconds from the start. */
      const searchCutSeconds = async (): Promise<number> => {
        const { sampleImageId } = job
        if (sampleImageId == null) {
          throw new Error(`No sample image supplied for ${basename(input)}`)
        }
        const sampleEmbedding = await sampleEmbeddingFor(sampleImageId)

        // Keyframe-only decoding is ~34× faster and costs no output precision (the
        // -c copy cut snaps to a keyframe regardless). A match window shorter than
        // one GOP can slip through it, so an empty result re-runs densely.
        let search = await searchWith(sampleEmbedding, 'keyframes')
        if (search.matchStartMs === null && !signal.aborted) {
          log.info('No match at keyframe sampling — retrying with dense 1 frame/s sampling')
          perFile[i] = { ...perFile[i], value: 0, active: true }
          onProgress([...perFile])
          search = await searchWith(sampleEmbedding, 'dense')
        }
        const { matchStartMs, matchEndMs } = search

        // Pick cut point based on mode; with no match at all, keep the user's
        // window as-is rather than inventing a cut point.
        const noMatchMs = trimStartSec * 1000
        const cutMs =
          cutMode === 'start'
            ? (matchStartMs ?? noMatchMs)
            : (matchEndMs ?? matchStartMs ?? noMatchMs)

        log.info(
          `Cut mode=${cutMode} matchStart=${matchStartMs}ms matchEnd=${matchEndMs}ms → cutting at ${cutMs}ms`
        )
        return cutMs / 1000
      }

      const stem = basename(input, extname(input))
      const ext = extname(input).replace('.', '') || 'mp4'

      // 'trim' does no searching, so its stream copy owns the whole bar.
      const cutPhaseStart = cutMode === 'trim' ? 0 : STREAM_END

      // The ML search may push the start later; it can never pull it earlier
      // than the user's trim start, and the trim end always wins.
      let startSec =
        cutMode === 'trim' ? trimStartSec : Math.max(await searchCutSeconds(), trimStartSec)
      const endSec = trimEndSec
      // A match right at the end of the window would leave nothing to write.
      // Keeping the user's window beats emitting a zero-length file.
      if (endSec !== null && startSec >= endSec) {
        log.warn(
          `${basename(input)}: cut point ${startSec}s is at/after the trim end ${endSec}s — keeping the full trim window`
        )
        startSec = trimStartSec
      }
      const output = join(outputDir, `${stem}_${cutMode === 'trim' ? 'trim' : 'cut'}.${ext}`)

      log.info(
        `${basename(input)}: mode=${cutMode} output window ${startSec}s → ${endSec ?? 'end of file'}`
      )

      // Known output length — both for `-t` and as the progress denominator
      // (ffmpeg's own `Duration:` banner reports the *input* length).
      const outputSeconds = endSec !== null ? Math.max(endSec - startSec, 0) : undefined

      let cutSucceeded = false

      // ── Cut phase: ffmpeg stream copy (cutPhaseStart → 1.0) ──────────────
      if (!signal.aborted) {
        // Snap to the phase boundary so the cut phase never goes backwards
        perFile[i] = { ...perFile[i], value: cutPhaseStart, active: true }
        onProgress([...perFile])

        try {
          await runFfmpeg(
            [
              '-ss',
              String(startSec),
              '-i',
              input,
              // `-t` (output duration) rather than `-to`: with `-ss` before the
              // input, `-to` has meant different things across ffmpeg versions.
              ...(endSec !== null ? ['-t', String(endSec - startSec)] : []),
              '-c',
              'copy',
              '-y',
              output
            ],
            (value) => {
              perFile[i] = {
                ...perFile[i],
                value: cutPhaseStart + value * (1 - cutPhaseStart),
                active: true
              }
              onProgress([...perFile])
            },
            signal,
            outputSeconds
          )
          outputs[i] = output
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
        // Feed the measured speed back so future estimates sharpen (see estimate.ts).
        recordThroughput(
          { kind: 'cutting', cutMode },
          {
            durationSec: meta.durationSec,
            pixels: meta.width && meta.height ? meta.width * meta.height : null,
            elapsedSec: (Date.now() - startedAt) / 1000
          }
        )
      }
    })
  )

  await Promise.all(tasks)

  return { outputs: outputs.filter(Boolean), outputDir }
}
