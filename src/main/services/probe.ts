import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolveFfmpegPath } from './ffmpeg'
import log from '../logger'

export type VideoMeta = {
  durationSec: number | null
  width: number | null
  height: number | null
  fps: number | null
  /** Whether the file has an audio stream at all. */
  hasAudio: boolean
  /** Audio stream bitrate in kbps — what `-c:a copy` will carry over. */
  audioKbps: number | null
  /** File size on disk; with duration this gives the source's overall bitrate. */
  sizeBytes: number | null
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
// " Stream #0:0[0x1](und): Video: h264 (High) …, yuv420p, 1920x1080 [SAR 1:1 …], 30 fps, …"
const VIDEO_STREAM_RE = /Stream #\d+:\d+.*: Video:/
const AUDIO_STREAM_RE = /Stream #\d+:\d+.*: Audio:/
const RESOLUTION_RE = /\b(\d{2,5})x(\d{2,5})\b/
const FPS_RE = /(\d+(?:\.\d+)?)\s+fps\b/
const BITRATE_RE = /(\d+(?:\.\d+)?)\s+kb\/s/

/**
 * Probed metadata is stable for a given file, so it is cached for the lifetime
 * of the process — keyed by path + mtime + size so an edited/replaced file is
 * re-probed. Users re-add the same clips repeatedly while tuning trim ranges.
 */
const cache = new Map<string, VideoMeta>()

function cacheKey(path: string): string {
  try {
    const st = statSync(path)
    return `${path}:${st.mtimeMs}:${st.size}`
  } catch {
    return path
  }
}

/**
 * Read duration / dimensions / frame rate from a video.
 *
 * `ffprobe` is not shipped by `ffmpeg-static`, so this parses the banner that
 * `ffmpeg -i <file>` writes to stderr. ffmpeg then exits non-zero ("At least
 * one output file must be specified") — expected, and not an error here.
 */
export function probeVideo(videoPath: string): Promise<VideoMeta> {
  const key = cacheKey(videoPath)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)

  return new Promise((resolve) => {
    const empty: VideoMeta = {
      durationSec: null,
      width: null,
      height: null,
      fps: null,
      hasAudio: false,
      audioKbps: null,
      sizeBytes: null
    }
    let binary: string
    try {
      binary = resolveFfmpegPath()
    } catch (err) {
      log.warn(`probe: cannot resolve ffmpeg — ${err instanceof Error ? err.message : String(err)}`)
      resolve(empty)
      return
    }

    const proc = spawn(binary, ['-hide_banner', '-i', videoPath], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    // A malformed file can make ffmpeg wait on input forever; never hang the UI.
    const timer = setTimeout(() => proc.kill('SIGKILL'), 15000)

    proc.stderr.on('data', (d: Buffer) => (stderr += d))

    proc.on('close', () => {
      clearTimeout(timer)
      const meta = { ...empty }
      try {
        meta.sizeBytes = statSync(videoPath).size
      } catch {
        /* unreadable — the size-based estimate just degrades to null */
      }
      const d = DURATION_RE.exec(stderr)
      if (d) meta.durationSec = Number(d[1]) * 3600 + Number(d[2]) * 60 + parseFloat(d[3])
      // Resolution and frame rate sit on the same line as the video stream, but
      // after the codec description — match the line first, then read from it.
      const streamLine = stderr.split('\n').find((l) => VIDEO_STREAM_RE.test(l))
      if (streamLine) {
        const r = RESOLUTION_RE.exec(streamLine)
        if (r) {
          meta.width = Number(r[1])
          meta.height = Number(r[2])
        }
        const f = FPS_RE.exec(streamLine)
        if (f) meta.fps = parseFloat(f[1])
      }
      const audioLine = stderr.split('\n').find((l) => AUDIO_STREAM_RE.test(l))
      if (audioLine) {
        meta.hasAudio = true
        const b = BITRATE_RE.exec(audioLine)
        if (b) meta.audioKbps = parseFloat(b[1])
      }
      cache.set(key, meta)
      resolve(meta)
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      log.warn(`probe failed for ${videoPath}: ${err.message}`)
      resolve(empty)
    })
  })
}
