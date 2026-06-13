import { spawn } from 'node:child_process'
import { resolveFfmpegPath } from './ffmpeg'
import { detectGpu } from './gpu'
import store from '../store'
import log from '../logger'
import type { CompressionPreset, GpuVendor, VideoEncoder } from '../../shared/types'

/**
 * GPU encode concurrency cap. Windows stays at 2: consumer NVIDIA drivers
 * hard-fail NVENC sessions beyond a driver-dependent limit (as low as 2 on
 * older generations) — exceeding it errors, it doesn't slow down. macOS runs
 * 4: VideoToolbox has no session cap and only degrades gracefully, so the
 * extra streams overlap decode/IO at no risk. Either way a single hardware
 * encoder block bounds total throughput; CPU (libx264) keeps `cpus().length`.
 */
export const GPU_ENCODE_CONCURRENCY = process.platform === 'darwin' ? 4 : 2

function runFfmpegCapture(
  binary: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.stdout.on('data', (d: Buffer) => (output += d))
    proc.stderr.on('data', (d: Buffer) => (output += d))
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
    proc.on('error', () => {
      clearTimeout(timer)
      resolve({ code: null, output })
    })
  })
}

async function listEncoders(binary: string): Promise<Set<string>> {
  const { output } = await runFfmpegCapture(binary, ['-hide_banner', '-encoders'], 15000)
  const found = new Set<string>()
  for (const line of output.split('\n')) {
    // Encoder rows look like " V....D h264_videotoolbox  VideoToolbox H.264 Encoder"
    const m = /^\s*V\S{5}\s+([a-z0-9_]+)/.exec(line)
    if (m) found.add(m[1])
  }
  return found
}

/**
 * A listed encoder is not necessarily usable — drivers and hardware gate it at
 * runtime. Validate with a real 1-frame encode to a null sink.
 */
async function testEncode(binary: string, encoder: VideoEncoder): Promise<boolean> {
  const { code } = await runFfmpegCapture(
    binary,
    [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=size=256x256:rate=10:duration=0.1',
      '-c:v', encoder,
      '-f', 'null', '-'
    ],
    20000
  )
  return code === 0
}

function hwCandidates(vendor: GpuVendor): VideoEncoder[] {
  if (process.platform === 'darwin') return ['h264_videotoolbox']
  if (process.platform === 'win32') {
    switch (vendor) {
      case 'intel':
        return ['h264_qsv']
      case 'amd':
        return ['h264_amf']
      // NVIDIA machines often also have an iGPU; unknown vendor → try all.
      default:
        return ['h264_nvenc', 'h264_qsv', 'h264_amf']
    }
  }
  return []
}

/**
 * Resolve the video encoder for compression jobs: first probed-working
 * hardware encoder for this platform/GPU, else libx264. The probe result is
 * cached per ffmpeg binary path (changing the override in Settings re-probes).
 */
export async function resolveVideoEncoder(): Promise<VideoEncoder> {
  const binary = resolveFfmpegPath()
  const cached = store.get('encoderProbe')
  if (cached && cached.ffmpegPath === binary) return cached.encoder

  const gpu = await detectGpu()
  const available = await listEncoders(binary)

  let encoder: VideoEncoder = 'libx264'
  for (const candidate of hwCandidates(gpu.vendor)) {
    if (!available.has(candidate)) {
      log.info(`Encoder ${candidate}: not present in this ffmpeg build`)
      continue
    }
    if (await testEncode(binary, candidate)) {
      encoder = candidate
      break
    }
    log.warn(`Encoder ${candidate}: listed but failed the test encode`)
  }

  store.set('encoderProbe', { ffmpegPath: binary, encoder })
  log.info(`Encoder probe result: ${encoder}`)
  return encoder
}

const NVENC_PRESET: Record<CompressionPreset, string> = {
  ultrafast: 'p1',
  superfast: 'p1',
  veryfast: 'p2',
  faster: 'p3',
  fast: 'p4',
  medium: 'p4',
  slow: 'p5',
  slower: 'p6',
  veryslow: 'p7'
}

const AMF_QUALITY: Record<CompressionPreset, string> = {
  ultrafast: 'speed',
  superfast: 'speed',
  veryfast: 'speed',
  faster: 'speed',
  fast: 'speed',
  medium: 'balanced',
  slow: 'quality',
  slower: 'quality',
  veryslow: 'quality'
}

/**
 * Translate the user's libx264-style preset/CRF settings into each encoder's
 * own quality knobs (CRF: 0 best – 51 worst):
 *
 * - videotoolbox: `-q:v` 1–100, higher = better → q = 100 − crf·2. Constant
 *   quality needs Apple Silicon; Intel Macs encode at a default bitrate.
 * - nvenc: `-cq` mirrors the CRF range in VBR mode; presets are p1…p7.
 * - qsv: `-global_quality` enables ICQ mode; accepts libx264 preset names.
 * - amf: constant-QP mode; quality is speed/balanced/quality.
 */
export function buildVideoArgs(
  encoder: VideoEncoder,
  preset: CompressionPreset,
  crf: number
): string[] {
  switch (encoder) {
    case 'h264_videotoolbox': {
      const q = Math.min(100, Math.max(1, 100 - crf * 2))
      return ['-c:v', 'h264_videotoolbox', '-q:v', String(q)]
    }
    case 'h264_nvenc':
      return [
        '-c:v', 'h264_nvenc',
        '-preset', NVENC_PRESET[preset] ?? 'p4',
        '-rc', 'vbr', '-cq', String(crf), '-b:v', '0'
      ]
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', preset, '-global_quality', String(crf)]
    case 'h264_amf':
      return [
        '-c:v', 'h264_amf',
        '-quality', AMF_QUALITY[preset] ?? 'balanced',
        '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf)
      ]
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf)]
  }
}
