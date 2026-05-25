import * as ort from 'onnxruntime-node'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import log from '../logger'

let session: ort.InferenceSession | null = null

export async function initOnnxSession(): Promise<void> {
  const modelPath = is.dev
    ? join(process.cwd(), 'resources', 'models', 'resnet18_identity.onnx')
    : join(process['resourcesPath'] as string, 'models', 'resnet18_identity.onnx')

  session = await ort.InferenceSession.create(modelPath)
  log.info(`ONNX session initialized (inputs: ${session.inputNames.join(', ')})`)
}

export function getOnnxSession(): ort.InferenceSession {
  if (!session) throw new Error('ONNX session not initialized — call initOnnxSession() first')
  return session
}
