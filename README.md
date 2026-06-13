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

- **Runtime:** Electron 41 (ships its own Node 22 — end users install nothing)
- **UI:** React 18 + TypeScript + Mantine v7
- **Build:** electron-vite (dev) + electron-builder (packaging)
- **Core Engine:** FFmpeg via `ffmpeg-static` (bundled per platform; override path in Settings)
- **ML:** `onnxruntime-node` for batched inference (CoreML on macOS, DirectML on Windows), `sharp` for sample-image preprocessing
- **Storage:** `better-sqlite3` (sample images), `electron-store` (user preferences)
- **Auto-update:** `electron-updater` against GitHub Releases

## Prerequisites

- **Node.js for the dev/build toolchain — 20.19+ recommended** (the minimum Vite 7 supports; any 20.19+, 22, or 24 works). This is your development machine's Node; it is independent of the Node 22 that Electron bundles for the shipped app. On Windows, Node 24 needs the toolset workaround — see [Windows build notes](#windows-build-notes).
- npm
- A C/C++ toolchain to build the `better-sqlite3` native module (used as a fallback when no matching prebuilt binary is available):
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Windows:** Visual Studio (or Build Tools) with the **"Desktop development with C++"** workload (MSVC v142/v143). The clang-cl / LLVM toolset is **not** required.

## Getting Started

```bash
npm install
npm run dev
```

`npm install` builds `better-sqlite3` for the Electron runtime automatically (via the
`postinstall` step). `npm run dev` launches the app with Vite HMR for the renderer and
live restart for the main process.

### Windows build notes

Node 24's official Windows binaries are built with **ClangCL**, and Node's bundled
`common.gypi` then forces the `ClangCL` MSBuild toolset onto every native addon. Most dev
machines only have the MSVC toolset installed, so a from-source build would otherwise fail
with `MSB8020: The build tools for ClangCL cannot be found`, and because `better-sqlite3`
is an optional dependency npm would silently drop it (causing
`Cannot find module 'better-sqlite3'` at startup).

To avoid this, `npm install` runs `scripts/rebuild-native.mjs`, which on Windows sets
`npm_config_clang=0` so node-gyp uses the standard **MSVC v142/v143** toolset instead of
ClangCL. No Visual Studio changes are needed beyond the "Desktop development with C++"
workload. The workaround is Windows-only and has no effect on macOS builds.

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
npm run package:mac     # DMG + PKG + ZIP (current arch; CI builds both arches)
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

## Security advisories

`npm audit` reports **0 vulnerabilities**. Reaching that required several major upgrades:

- **`electron` 33 → 41** (runtime). The advisories were fixed in Electron 40+, but Electron
  is **capped at 41**: `better-sqlite3` 12.x ships no prebuilt binary for Electron 42's ABI
  and its C++ source does not compile against Electron 42's V8 headers. Bump past 41 only
  once `better-sqlite3` adds Electron 42 support.
- **`electron-builder` 25 → 26**, **`@electron/rebuild` 3 → 4** — packaging/build tooling.
- **`electron-vite` 2 → 5**, **`vite` 5 → 7** — dev/build tooling (vite is held at 7 because
  `electron-vite` 5 and `@vitejs/plugin-react` 4 do not yet support vite 8).
- **`esbuild`** is pinned to `0.28.1` via a top-level `overrides` entry. vite 7 and
  electron-vite 5 request older esbuild (`^0.27` / `^0.25`) that fall in the vulnerable
  range; the override forces the patched build across the whole tree. Revisit the override
  when those tools adopt esbuild ≥ 0.28.1 on their own.
- **`tmp` 0.2.3 → 0.2.7** — runtime dependency.

After upgrading Electron, **re-test packaging** (`npm run package:win` / `:mac`) before a
release — `electron-builder` 26 is a major bump.

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
