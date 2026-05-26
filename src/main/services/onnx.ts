import * as ort from 'onnxruntime-node'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import log from '../logger'

let session: ort.InferenceSession | null = null

/**
 * Resolve the best execution provider for this platform.
 *
 * - macOS  → CoreML (uses Apple Neural Engine / GPU via Metal)
 *            bundled in libonnxruntime on both arm64 and x64
 * - Windows → DirectML (uses GPU via DirectX 12, CPU fallback)
 *            bundled as DirectML.dll in onnxruntime-node
 * - Linux   → CPU only (no GPU EP in the pre-built package)
 *
 * We always include 'cpu' last so ONNX falls back automatically if the
 * preferred EP can't handle an operator.
 */
function resolveExecutionProviders(): ort.InferenceSession.ExecutionProviderConfig[] {
  switch (process.platform) {
    case 'darwin':
      return ['coreml', 'cpu']
    case 'win32':
      return ['dml', 'cpu']
    default:
      return ['cpu']
  }
}

export async function initOnnxSession(): Promise<void> {
  const modelPath = is.dev
    ? join(process.cwd(), 'resources', 'models', 'resnet18_identity.onnx')
    : join(process['resourcesPath'] as string, 'models', 'resnet18_identity.onnx')

  const providers = resolveExecutionProviders()
  log.info(`ONNX execution providers (preference order): ${providers.join(', ')}`)

  // Enable verbose ONNX logging in dev so you can see which EP was actually
  // selected. Look for lines like "CoreMLExecutionProvider is enabled" in the
  // console / log file when running npm run dev.
  if (is.dev) {
    ort.env.logLevel = 'verbose'
  }

  session = await ort.InferenceSession.create(modelPath, { executionProviders: providers })
  log.info(`ONNX session initialized (inputs: ${session.inputNames.join(', ')})`)
}

export function getOnnxSession(): ort.InferenceSession {
  if (!session) throw new Error('ONNX session not initialized — call initOnnxSession() first')
  return session
}
