# DogyMpegApp — Video Processing Utility

A cross-platform desktop app (macOS + Windows) built with **Electron**, **React**, and **TypeScript** that wraps **FFmpeg** for video compression and adds ML-driven intelligent cutting: a bundled ResNet18 ONNX model finds the frame most similar to a sample image and cuts there.

## Features

- **Video Compression** — GPU-first H.264 encoding (VideoToolbox on macOS; NVENC / QSV / AMF on Windows) with automatic per-file fallback to `libx264`. Configurable preset, CRF, and audio codec.
- **Intelligent Video Cutting** — finds the frame most similar to a sample image, then cuts with a fast stream-copy (`-c copy`). Two modes: **End of match** *(default, skips intros)* and **Start of match**.
- **Streaming pipeline** — extraction and similarity search overlap as one batched-inference pipeline; keyframe-only decoding plus early termination mean results often arrive before the whole video is read. Multiple videos process in parallel.
- **Batch processing** — multiple files at once, per-file progress with live ETA and one-click cancel; partial outputs from cancelled jobs are removed automatically.
- **GPU acceleration** — ONNX inference via CoreML (macOS) / DirectML (Windows); encode/decode via platform hardware. CPU fallback throughout.
- **Desktop niceties** — light/dark/system theme, completion notifications with Dock bounce (macOS) / taskbar flash (Windows) when backgrounded, and update checks on launch (Windows self-installs; macOS links to the releases page).

## Tech Stack

- **Runtime:** Electron 41 (bundles its own Node 22 — end users install nothing)
- **UI:** React 18 + TypeScript + Mantine v7
- **Build:** electron-vite + Vite 7 (dev), electron-builder (packaging)
- **Video:** FFmpeg via `ffmpeg-static` (override path in Settings)
- **ML:** `onnxruntime-node` for batched inference, `sharp` for sample-image decode; normalization and cosine similarity are plain TypeScript
- **Storage:** `better-sqlite3` (sample images), `electron-store` (preferences)
- **Updates:** `electron-updater` against GitHub Releases

## Prerequisites

- **Node.js 20.19+** for the dev/build toolchain (any 20.19+, 22, or 24). This is independent of the Node that Electron bundles for the shipped app.
- npm
- A C/C++ toolchain for the `better-sqlite3` native module (used only when no matching prebuilt binary exists):
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Windows:** Visual Studio / Build Tools with the **"Desktop development with C++"** workload (MSVC v142/v143)

## Getting Started

```bash
npm install   # postinstall rebuilds better-sqlite3 for the Electron runtime
npm run dev   # Vite HMR for the renderer, live restart for main
```

> **Windows:** `postinstall` runs `scripts/rebuild-native.mjs`, which forces the standard MSVC toolset (`npm_config_clang=0`) so `better-sqlite3` builds even on Node 24, whose binaries otherwise demand the ClangCL toolset. No-op on macOS.

## Build & Package

```bash
npm run build         # production bundle, no installer
npm run package       # installers for the current OS → release/
npm run package:mac   # DMG + PKG + ZIP (current arch; CI builds both)
npm run package:win   # NSIS + MSI (x64)
```

## Releasing

Push a `vX.Y.Z` tag. CI builds macOS Apple Silicon, macOS Intel (with a runner fallback), and Windows x64 in parallel, then a release job publishes the installers and `latest*.yml` update feeds to a GitHub Release. Installed apps update on next launch. A manual `workflow_dispatch` run (optional version input) builds artifacts without releasing.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Electron + Vite HMR |
| `npm run typecheck` | TypeScript checks (main, preload, renderer) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | Production bundle (no installer) |
| `npm run package` / `:mac` / `:win` | Build installers |

## License

MIT License — Copyright (c) 2016-2026 Dogy Inc.
