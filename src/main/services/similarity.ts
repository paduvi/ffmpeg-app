import * as ort from 'onnxruntime-node'
import { getOnnxSession } from './onnx'
import { FRAME_FLOATS, IMG_SIZE } from './preprocess'

/**
 * Constant batch shape for every inference call. CoreML compiles one graph per
 * input shape (~0.6 s); submitting a different shape triggers a recompile, so
 * callers always send exactly BATCH_SIZE frames — pad the tail with zeros and
 * ignore the padded rows of the output. Measured: 6 ms steady-state per batch
 * of 16 on Apple Silicon; flat per-frame cost beyond 16 (see CLAUDE.md).
 */
export const BATCH_SIZE = 16

export type EmbeddingBatch = {
  /** Row-major [BATCH_SIZE, dim] embedding matrix. */
  data: Float32Array
  dim: number
}

/** Run one constant-shape batch (BATCH_SIZE × FRAME_FLOATS floats) through the model. */
export async function getEmbeddings(batch: Float32Array): Promise<EmbeddingBatch> {
  const session = getOnnxSession()
  const tensor = new ort.Tensor('float32', batch, [BATCH_SIZE, 3, IMG_SIZE, IMG_SIZE])
  const result = await session.run({ [session.inputNames[0]]: tensor })
  const out = result[session.outputNames[0]]
  return { data: out.data as Float32Array, dim: Number(out.dims[1]) }
}

/** Embed a single preprocessed image by padding it into slot 0 of a constant batch. */
export async function getEmbedding(pixels: Float32Array): Promise<Float32Array> {
  const batch = new Float32Array(BATCH_SIZE * FRAME_FLOATS)
  batch.set(pixels, 0)
  const { data, dim } = await getEmbeddings(batch)
  return data.slice(0, dim)
}

/** Plain-loop cosine similarity — measured ~0.5 µs for 512-dim vectors. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }
  return dot / Math.sqrt(na * nb)
}
