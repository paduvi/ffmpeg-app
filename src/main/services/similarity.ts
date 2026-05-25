import * as tf from '@tensorflow/tfjs-node'
import * as ort from 'onnxruntime-node'
import { getOnnxSession } from './onnx'

export async function getEmbedding(pixels: Float32Array): Promise<Float32Array> {
  const session = getOnnxSession()
  const tensor = new ort.Tensor('float32', pixels, [1, 3, 224, 224])
  const result = await session.run({ [session.inputNames[0]]: tensor })
  return result[session.outputNames[0]].data as Float32Array
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  return tf.tidy(() => {
    const ta = tf.tensor1d(a)
    const tb = tf.tensor1d(b)
    const dot = tf.sum(tf.mul(ta, tb))
    const norm = (v: tf.Tensor1D): tf.Scalar => tf.norm(v) as tf.Scalar
    const denom = norm(ta).mul(norm(tb))
    return dot.div(denom).dataSync()[0]
  })
}
