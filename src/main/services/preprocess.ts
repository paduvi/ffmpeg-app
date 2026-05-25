import * as tf from '@tensorflow/tfjs-node'
import sharp from 'sharp'

// Module-level constants — created once, reused across calls
const MEAN = tf.tensor1d([0.485, 0.456, 0.406])
const STD = tf.tensor1d([0.229, 0.224, 0.225])

export async function preprocessImage(filePath: string): Promise<Float32Array> {
  const { data } = await sharp(filePath)
    .resize(224, 224)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // tf.tidy() disposes all intermediate tensors automatically
  return tf.tidy(() => {
    return tf
      .tensor3d(new Uint8Array(data), [224, 224, 3], 'int32')
      .toFloat()
      .div(tf.scalar(255))
      .sub(MEAN)              // broadcast subtract per-channel mean
      .div(STD)               // broadcast divide by per-channel std
      .transpose([2, 0, 1])  // HWC → CHW (required by ResNet)
      .reshape([3 * 224 * 224])
      .dataSync() as Float32Array
  })
}
