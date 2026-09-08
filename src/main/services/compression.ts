import { cpus, homedir } from 'node:os'
import { join, basename, extname, dirname } from 'node:path'
import { mkdirSync, unlinkSync, existsSync, statSync } from 'node:fs'
import pLimit from 'p-limit'
import { runFfmpeg } from './ffmpeg'
import { resolveVideoEncoder, buildVideoArgs, GPU_ENCODE_CONCURRENCY } from './encoders'
import { probeVideo, type VideoMeta } from './probe'
import { recordThroughput } from './estimate'
import store from '../store'
import log from '../logger'
import type { AudioCodec, FileProgress, VideoEncoder } from '../../shared/types'

export type CompressionJob = {
  input: string
  output?: string
}

export type CompressionResult = {
  outputs: string[]
  outputDir: string
}

/** Leave a little room under the source bitrate for container overhead. */
const CAP_HEADROOM = 0.97

/**
 * Below this the cap is not worth applying: it means the output audio alone
 * costs about as much as the whole source, so no video setting can keep the
 * file from growing. Capping anyway would just wreck the picture for nothing.
 */
const MIN_USEFUL_CAP_BPS = 50_000

/** Nominal bitrates ffmpeg lands on for each codec at its defaults. */
const AUDIO_DEFAULT_KBPS: Record<AudioCodec, number> = { aac: 128, mp3: 128, opus: 96, copy: 128 }

/** What the *output* audio will cost: nothing when the file has no audio. */
function audioBitrateBps(codec: AudioCodec, meta: VideoMeta): number {
  if (!meta.hasAudio) return 0
  const kbps =
    codec === 'copy' ? (meta.audioKbps ?? AUDIO_DEFAULT_KBPS.copy) : AUDIO_DEFAULT_KBPS[codec]
  return kbps * 1000
}

function sizeOf(path: string): number | undefined {
  try {
    return statSync(path).size
  } catch {
    return undefined
  }
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

      const startedAt = Date.now()
      // Cached after the renderer's duration probe, so normally free here.
      const meta = await probeVideo(job.input)
      // The software retry below changes which encoder the measurement belongs to.
      let usedEncoder = encoder

      const inputBytes = meta.sizeBytes ?? undefined
      // Ceiling that keeps the output from outgrowing the source: the source's
      // whole bitrate, less what the output audio will cost, less a little
      // headroom for muxing overhead. No floor — a floor above the source's own
      // bitrate would silently stop the cap from binding at all.
      const rawCap =
        inputBytes && meta.durationSec
          ? ((inputBytes * 8) / meta.durationSec - audioBitrateBps(audioCodec, meta)) * CAP_HEADROOM
          : null
      const videoCapBps = rawCap !== null && rawCap >= MIN_USEFUL_CAP_BPS ? rawCap : undefined
      if (rawCap !== null && videoCapBps === undefined) {
        log.warn(
          `${basename(job.input)}: source is only ${Math.round(((inputBytes ?? 0) * 8) / (meta.durationSec ?? 1) / 1000)}kbps, less than the output audio alone — encoding uncapped`
        )
      }

      const encodeWith = async (enc: VideoEncoder, useHwaccel: boolean): Promise<void> => {
        const args = [
          ...(useHwaccel ? ['-hwaccel', 'auto'] : []),
          '-i', job.input,
          ...buildVideoArgs(enc, preset, crf, videoCapBps),
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
          usedEncoder = 'libx264'
          await encodeWith('libx264', false)
        }

        // Size guard. Hardware encoders take `-maxrate` as a target rather than
        // a ceiling, so they are given none and policed here instead: if one
        // produced a file larger than the source, redo it with libx264, whose
        // constrained-CRF respects the cap.
        let outputBytes = sizeOf(outputs[i])
        if (
          !signal.aborted &&
          usedEncoder !== 'libx264' &&
          inputBytes &&
          outputBytes &&
          outputBytes > inputBytes
        ) {
          log.warn(
            `${usedEncoder} output for ${job.input} is larger than the source (${outputBytes} > ${inputBytes}); re-encoding with libx264 under a ${Math.round((videoCapBps ?? 0) / 1000)}kbps cap`
          )
          perFile[i] = { ...perFile[i], value: 0, active: true }
          onProgress([...perFile])
          usedEncoder = 'libx264'
          await encodeWith('libx264', false)
          outputBytes = sizeOf(outputs[i])
        }

        perFile[i] = {
          ...perFile[i],
          value: 1,
          done: true,
          active: false,
          inputBytes,
          outputBytes
        }
        onProgress([...perFile])
        // Feed the measured speed back so future estimates sharpen (see estimate.ts).
        const encoding = { encoder: usedEncoder, preset }
        recordThroughput(
          { kind: 'compression' },
          {
            durationSec: meta.durationSec,
            pixels: meta.width && meta.height ? meta.width * meta.height : null,
            elapsedSec: (Date.now() - startedAt) / 1000
          },
          encoding
        )
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
