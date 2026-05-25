import { join, basename, extname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { runFfmpeg } from './ffmpeg'
import { extractFrames } from './frames'
import { preprocessImage } from './preprocess'
import { getEmbedding, cosineSimilarity } from './similarity'
import { getSampleImage } from '../db/sampleImages'
import log from '../logger'

const MIN_START_MS = 2000
const SIMILARITY_THRESHOLD = 0.9

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
  onAggregateProgress: (value: number) => void,
  signal: AbortSignal
): Promise<CuttingResult> {
  const outputDir = makeOutputDir()
  const outputs: string[] = []

  for (let jobIdx = 0; jobIdx < jobs.length; jobIdx++) {
    if (signal.aborted) break
    const { input, sampleImageId } = jobs[jobIdx]

    const sampleImage = getSampleImage(sampleImageId)
    if (!sampleImage) throw new Error(`Sample image ${sampleImageId} not found`)

    const sampleEmbedding = await getEmbedding(await preprocessImage(sampleImage.path))

    const { frames, cleanup } = await extractFrames(input, signal)

    try {
      let cutMs = MIN_START_MS

      for (const frame of frames) {
        if (signal.aborted) break
        if (frame.timestampMs < MIN_START_MS) continue

        const similarity = cosineSimilarity(
          sampleEmbedding,
          await getEmbedding(await preprocessImage(frame.path))
        )

        log.debug(`Frame @${frame.timestampMs}ms similarity=${similarity.toFixed(4)}`)

        if (similarity >= SIMILARITY_THRESHOLD) {
          cutMs = frame.timestampMs
          log.info(`Cut point found at ${cutMs}ms (similarity=${similarity.toFixed(4)})`)
          break
        }
      }

      const stem = basename(input, extname(input))
      const ext = extname(input).replace('.', '') || 'mp4'
      const output = join(outputDir, `${stem}_cut.${ext}`)

      await runFfmpeg(
        ['-ss', String(cutMs / 1000), '-i', input, '-c', 'copy', '-y', output],
        (v) => onAggregateProgress((jobIdx + v) / jobs.length),
        signal
      )

      outputs.push(output)
    } finally {
      cleanup()
    }

    onAggregateProgress((jobIdx + 1) / jobs.length)
  }

  return { outputs, outputDir }
}
