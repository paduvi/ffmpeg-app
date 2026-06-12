# DogyMpegApp — Video Processing Utility

DogyMpegApp is a cross-platform desktop GUI application built with **Electron**, **React**, and **TypeScript**, designed to simplify common video processing tasks. It acts as a user-friendly wrapper around **FFmpeg**, with an ML-driven feature that automatically finds the best cut point in a video based on a user-supplied sample image.

## Key Features

- **Video Compression** — Reduce video file sizes with customizable preset, CRF, and audio codec. Per-file progress bars with live percentage and cancellation.
- **Intelligent Video Cutting** — A bundled ResNet18 ONNX model finds the frame most similar to a sample image, then cuts there with a fast stream-copy (`-c copy`). Two cut modes:
  - **End of match** *(default)* — cuts after the matched sequence ends, useful for skipping intros.
  - **Start of match** — cuts at the first matching frame.
- **Streaming pipeline** — frame extraction and similarity search run as one overlapped pipeline with batched GPU inference; a completed match stops the decode early, so results often arrive before the whole video is read.
- **Batch Processing** — run multiple files with one-click cancellation; only fully-completed files are kept on disk (partial files from cancelled jobs are deleted automatically).
- **Theme Support** — Light, dark, and system theme via the File menu.
- **GPU Acceleration** — ONNX inference uses CoreML on macOS (Apple Neural Engine / Metal) and DirectML on Windows (GPU via DirectX 12) with automatic CPU fallback.
- **Auto-Update** — Installed apps check for new releases on launch and prompt to restart when an update is ready.
- **Cross-Platform** — Ships on macOS (Apple Silicon + Intel) and Windows.

## Technology Stack

- **Runtime:** Electron 33+ on Node 20+
- **UI:** React 18 + TypeScript + Mantine v7
- **Build:** electron-vite (dev) + electron-builder (packaging)
- **Core Engine:** FFmpeg via `ffmpeg-static` (bundled per platform; override path in Settings)
- **ML:** `onnxruntime-node` for batched inference (CoreML on macOS, DirectML on Windows), `sharp` for sample-image preprocessing
- **Storage:** `better-sqlite3` (sample images), `electron-store` (user preferences)
- **Auto-update:** `electron-updater` against GitHub Releases

## Prerequisites

- Node.js 20 or newer
- npm

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` launches the app with Vite HMR for the renderer and live restart for the main process.

## Build

Build the production bundle without packaging an installer:

```bash
npm run build
```

## Package

Produce installers for the current platform:

```bash
npm run package
```

Or target a specific platform:

```bash
npm run package:mac     # DMG + PKG (x64, arm64)
npm run package:win     # NSIS + MSI (x64)
```

Output lands in `release/`.

## Releasing

Tag a release on `main`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

CI builds macOS Apple Silicon, macOS Intel (with a runner fallback), and Windows x64 in parallel, then a dedicated release job publishes the artifacts plus the `latest*.yml` update feeds to a GitHub Release. Installed apps pick up the new version on next launch via `electron-updater`.

You can also trigger a manual run from the GitHub Actions tab (`workflow_dispatch`) and optionally pass a version override.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Electron + Vite HMR |
| `npm run typecheck` | TypeScript checks for main, preload, and renderer |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | Production bundle (no installer) |
| `npm run package` | Build installers for the current OS |
| `npm run package:mac` / `:win` | Build installers for a specific OS |

## License

This project is licensed under the MIT License.

Copyright (c) 2016-2026 Dogy Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
