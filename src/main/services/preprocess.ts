import sharp from 'sharp'

export const IMG_SIZE = 224
export const FRAME_PIXELS = IMG_SIZE * IMG_SIZE
export const FRAME_FLOATS = 3 * FRAME_PIXELS
/** Bytes per raw rgb24 frame as emitted by the ffmpeg pipe. */
export const FRAME_BYTES = 3 * FRAME_PIXELS

// ImageNet normalization constants — must match the ResNet18 training pipeline.
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/**
 * Normalize an interleaved rgb24 buffer (HWC) into CHW float planes written at
 * `dstOffset` inside `dst`. Plain typed-array loop — measured ~0.16 ms/frame,
 * see the cutting-pipeline notes in CLAUDE.md. Writing straight into the
 * caller's batch buffer avoids any per-frame allocation.
 */
export function normalizeToChw(src: Uint8Array, dst: Float32Array, dstOffset: number): void {
  for (let c = 0; c < 3; c++) {
    const mean = MEAN[c]
    const invStd = 1 / STD[c]
    const base = dstOffset + c * FRAME_PIXELS
    for (let p = 0; p < FRAME_PIXELS; p++) {
      dst[base + p] = (src[p * 3 + c] / 255 - mean) * invStd
    }
  }
}

/**
 * Decode + cover-crop an image file to 224×224 and normalize to CHW floats.
 * Used for sample images; video frames arrive pre-scaled from the ffmpeg pipe
 * (which replicates this cover-crop — see streamFrames in frames.ts).
 */
export async function preprocessImage(filePath: string): Promise<Float32Array> {
  const { data } = await sharp(filePath)
    .resize(IMG_SIZE, IMG_SIZE) // default fit 'cover': scale shorter side, center-crop
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = new Float32Array(FRAME_FLOATS)
  normalizeToChw(new Uint8Array(data.buffer, data.byteOffset, FRAME_BYTES), out, 0)
  return out
}
