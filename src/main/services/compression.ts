import { cpus, homedir } from 'node:os'
import { join, basename, extname, dirname } from 'node:path'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import pLimit from 'p-limit'
import { runFfmpeg } from './ffmpeg'
import { resolveVideoEncoder, buildVideoArgs, GPU_ENCODE_CONCURRENCY } from './encoders'
import store from '../store'
import log from '../logger'
import type { FileProgress, VideoEncoder } from '../../shared/types'

export type CompressionJob = {
  input: string
  output?: string
}

export type CompressionResult = {
  outputs: string[]
  outputDir: string
}

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

export async function compressVideos(
  jobs: CompressionJob[],
  onProgress: (progress: FileProgress[]) => void,
  signal: AbortSignal
): Promise<CompressionResult> {
  const audioCodec = store.get('audioCodec')
  const preset = store.get('preset')
  const crf = store.get('crf')
  const ext = store.get('videoExtension') || 'mp4'

  const encoder = await resolveVideoEncoder()
  log.info(`Compression encoder: ${encoder}`)

  const outputDir = makeOutputDir()
  log.info(`Compression output dir: ${outputDir}`)

  const perFile: FileProgress[] = jobs.map((job) => ({
    name: basename(job.input),
    value: 0,
    done: false,
    active: false
  }))
  const outputs = new Array<string>(jobs.length)

  const limit = pLimit(encoder === 'libx264' ? cpus().length : GPU_ENCODE_CONCURRENCY)

  const tasks = jobs.map((job, i) =>
    limit(async () => {
      if (signal.aborted) return

      const stem = basename(job.input, extname(job.input))
      outputs[i] = job.output ?? join(outputDir, `${stem}.${ext}`)

      perFile[i] = { ...perFile[i], active: true }
      onProgress([...perFile])

      const encodeWith = async (enc: VideoEncoder, useHwaccel: boolean): Promise<void> => {
        const args = [
          ...(useHwaccel ? ['-hwaccel', 'auto'] : []),
          '-i', job.input,
          ...buildVideoArgs(enc, preset, crf),
          '-c:a', audioCodec,
          '-y', outputs[i]
        ]
        await runFfmpeg(
          args,
          (value) => {
            perFile[i] = { ...perFile[i], value, active: true }
            onProgress([...perFile])
          },
          signal
        )
      }

      try {
        try {
          await encodeWith(encoder, true)
        } catch (err) {
          // Hardware paths can fail on specific inputs (odd dimensions, exotic
          // pixel formats) even after a successful probe — retry the file
          // fully in software (libx264, no hwaccel) before giving up.
          if (signal.aborted) throw err
          if (existsSync(outputs[i])) {
            try { unlinkSync(outputs[i]) } catch { /* ignore */ }
          }
          log.warn(
            `${encoder} (+hwaccel) failed for ${job.input}; retrying in software: ${err instanceof Error ? err.message : String(err)}`
          )
          perFile[i] = { ...perFile[i], value: 0, active: true }
          onProgress([...perFile])
          await encodeWith('libx264', false)
        }
        perFile[i] = { ...perFile[i], value: 1, done: true, active: false }
        onProgress([...perFile])
      } catch (err) {
        // Delete the partial output file so cancelled/failed files don't litter the output dir
        if (outputs[i] && existsSync(outputs[i])) {
          try { unlinkSync(outputs[i]) } catch { /* ignore */ }
        }
        perFile[i] = { ...perFile[i], active: false }
        onProgress([...perFile])
        if (!signal.aborted) throw err
      }
    })
  )

  await Promise.all(tasks)

  const resolvedOutputDir = outputs.find(Boolean)
    ? dirname(outputs.find(Boolean)!)
    : outputDir

  return { outputs, outputDir: resolvedOutputDir }
}
