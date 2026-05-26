import { join, basename, extname } from 'node:path'
import type { CutMode, FileProgress } from '../../shared/types'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { runFfmpeg } from './ffmpeg'
import { extractFrames } from './frames'
import { preprocessImage } from './preprocess'
import { getEmbedding, cosineSimilarity } from './similarity'
import { getSampleImage } from '../db/sampleImages'
import log from '../logger'

const MIN_START_MS = 2000
const SIMILARITY_THRESHOLD = 0.9

// Progress phase weights (must sum to 1):
//   extraction  0 → 0.50
//   similarity  0.50 → 0.90
//   ffmpeg cut  0.90 → 1.00
const EXTRACT_END = 0.50
const SEARCH_END = 0.90

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

    // ── Phase 1: frame extraction (progress 0 → EXTRACT_END) ──────────────
    const { frames, cleanup } = await extractFrames(
      input,
      signal,
      (extractProgress) => {
        perFile[i] = { ...perFile[i], value: extractProgress * EXTRACT_END, active: true }
        onProgress([...perFile])
      }
    )

    // Snap to phase boundary so phase 2 never goes backwards
    perFile[i] = { ...perFile[i], value: EXTRACT_END, active: true }
    onProgress([...perFile])

    let cutSucceeded = false
    try {
      // ── Phase 2: similarity search (progress EXTRACT_END → SEARCH_END) ──
      let matchStartMs: number | null = null
      let matchEndMs: number | null = null

      for (let fi = 0; fi < frames.length; fi++) {
        if (signal.aborted) break
        const frame = frames[fi]

        // Report per-frame progress within the search phase
        const searchFraction = frames.length > 1 ? fi / (frames.length - 1) : 1
        perFile[i] = {
          ...perFile[i],
          value: EXTRACT_END + searchFraction * (SEARCH_END - EXTRACT_END),
          active: true
        }
        onProgress([...perFile])

        if (frame.timestampMs < MIN_START_MS) continue

        const similarity = cosineSimilarity(
          sampleEmbedding,
          await getEmbedding(await preprocessImage(frame.path))
        )
        log.debug(`Frame @${frame.timestampMs}ms similarity=${similarity.toFixed(4)}`)

        if (similarity >= SIMILARITY_THRESHOLD) {
          if (matchStartMs === null) matchStartMs = frame.timestampMs
          matchEndMs = frame.timestampMs

          // In "start" mode we can stop as soon as we find the first match
          if (cutMode === 'start') break
        } else if (matchEndMs !== null) {
          // Similarity just dropped below threshold after a match run — we
          // have the complete window; no need to scan further.
          break
        }
      }

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

      // ── Phase 3: ffmpeg cut (progress SEARCH_END → 1.0) ─────────────────
      if (!signal.aborted) {
        try {
          await runFfmpeg(
            ['-ss', String(cutMs / 1000), '-i', input, '-c', 'copy', '-y', output],
            (value) => {
              perFile[i] = {
                ...perFile[i],
                value: SEARCH_END + value * (1 - SEARCH_END),
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
            try { unlinkSync(output) } catch { /* ignore */ }
          }
          perFile[i] = { ...perFile[i], active: false }
          onProgress([...perFile])
          if (!signal.aborted) throw err
        }
      } else {
        perFile[i] = { ...perFile[i], active: false }
        onProgress([...perFile])
      }
    } finally {
      cleanup()
    }

    if (cutSucceeded) {
      perFile[i] = { ...perFile[i], value: 1, done: true, active: false }
      onProgress([...perFile])
    }
  }

  return { outputs, outputDir }
}
