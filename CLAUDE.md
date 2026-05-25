# DogyMpegApp

Electron + React + TypeScript desktop app that wraps FFmpeg for video compression and ML-driven intelligent video cutting (a bundled ResNet18 ONNX model finds the frame most similar to a user-supplied sample image, then cuts there with `ffmpeg -c copy`).

This project was migrated from JavaFX (Java 21). The Java history is preserved in git but the working tree is Electron-only.

## Stack

- Electron 33+, Node 20+
- React 18 + TypeScript (strict)
- **Mantine v7** UI kit (`@mantine/core`, `/hooks`, `/modals`, `/notifications`)
- electron-vite (dev + build), electron-builder (packaging)
- FFmpeg via `ffmpeg-static` (override path supported in Settings)
- ML: `onnxruntime-node` (ResNet18 inference) + `sharp` (image resize/normalize) + `@tensorflow/tfjs-node` (tensor ops — cosine similarity, BLAS-backed)
- Persistence: `better-sqlite3` (sample images), `electron-store` (user prefs)
- Logging: `electron-log`
- Auto-update: `electron-updater` (GitHub Releases provider)

## Layout

- `src/main/` — Electron main process. `index.ts` is the entry. `services/` holds ffmpeg/onnx/similarity/frames/preprocess/cutting. `ipc/` holds channel handlers, one file per feature. `db/` is the SQLite layer. `store.ts` is electron-store. `updater.ts` wires `electron-updater`.
- `src/preload/index.ts` — sole preload script. Exposes a typed `window.api` via `contextBridge.exposeInMainWorld`. All renderer↔main calls go through it; renderer never touches `ipcRenderer` directly.
- `src/preload/index.d.ts` — ambient types for `window.api`.
- `src/renderer/src/` — React app. `pages/` = top-level sections (Compression, Cutting). `components/` = reusable (VideoTable, ProgressModal, SettingsDialog, SampleImageTable, AboutDialog). No Node access; everything through `window.api`.
- `src/renderer/public/` — static files served at the renderer root. Contains `splash.gif` and `icon.png` (for the in-app logo in the header).
- `src/shared/types.ts` — types shared between main, preload, and renderer (job DTOs, enums).
- `resources/` — packaged static assets. `models/resnet18_identity.onnx`, `icon.{icns,ico,png}`, `sample-images/` (permanent built-in samples).
- `electron.vite.config.ts` — Vite + electron-vite config, one entry per process (main/preload/renderer) with `@renderer` / `@shared` path aliases.
- `electron-builder.yml` — packaging config. Targets: mac dmg+pkg (x64+arm64), win nsis+msi, linux AppImage+deb (x64+arm64). `publish: github` so `electron-updater` finds release feeds.
- `.github/workflows/build.yml` — 5-job matrix (macOS arm64, macOS x64, Windows x64, Linux x64, Linux arm64) triggered on `v*` tags or `workflow_dispatch`. Tag pushes use `--publish always` to create/update the GitHub Release; dispatches use `--publish never` and upload as workflow artifacts.

## Architecture conventions

- **UI**: prefer Mantine components (`Table`, `Modal`, `Button`, `Slider`, `Progress`, `NavLink`, `Menu`, `Select`, `TextInput`, `Switch`, `Group`, `Stack`, `AppShell`). Use `useDisclosure` for modal open/close. Notifications via `@mantine/notifications`. Only drop to custom CSS when Mantine can't express it.
- **IPC**: never expose raw `ipcRenderer` to the renderer. Add a handler in `src/main/ipc/<feature>.ts`, register it in `src/main/index.ts`, expose a typed function on `window.api` from `src/preload/index.ts`, and add the matching ambient type to `src/preload/index.d.ts`. Shared types live in `src/shared/types.ts`.
- **Progress streams**: long jobs return a `jobId` immediately and emit `<feature>:progress` events with `{ jobId, value: 0..1 }` and `<feature>:done` on completion.
- **Cancellation**: every job creates an `AbortController` stored in a `Map<jobId, AbortController>` on the main side; the renderer calls `api.<feature>.cancel(jobId)`, which aborts the signal and kills any child ffmpeg process via `proc.kill('SIGTERM')`.
- **Paths**: `app.getPath('userData')` for the SQLite file and prefs; `~/ffmpeg-output/<yyyyMMddHHmmss>/` for output files (same scheme as the legacy JavaFX app); `app.getPath('logs')` for logs.
- **FFmpeg binary**: resolved by `src/main/services/ffmpeg.ts::resolveFfmpegPath()`. Default = the path exported by `ffmpeg-static` (adjusted for `app.asar.unpacked` in production). Override via the `useDefaultFfmpeg` + `ffmpegLocation` settings keys.
- **ONNX model**: loaded once in `src/main/services/onnx.ts`. In dev: `resources/models/resnet18_identity.onnx`. In packaged builds: `process.resourcesPath/models/resnet18_identity.onnx` (mapped via `extraResources` in `electron-builder.yml`).
- **App icon**: `resources/icon.png` serves three purposes: (1) OS taskbar/dock/installer — referenced by `electron-builder.yml`; (2) BrowserWindow taskbar icon on Linux — loaded via `extraResources` → `process.resourcesPath/icon.png`; (3) in-app header logo — copied to `src/renderer/public/icon.png` and referenced as `/icon.png` in `App.tsx`.

## Commands

- `npm install` — install dependencies (native modules build during postinstall via `electron-rebuild`)
- `npm run dev` — Electron + Vite HMR
- `npm run typecheck` — `tsc --noEmit` for both Node and Web TS projects
- `npm run lint` — eslint
- `npm run build` — production bundle (no installer)
- `npm run package` — `electron-builder` for the current OS
- `npm run package:mac` / `:win` / `:linux` — target a specific platform

## Releasing

Push a tag `vX.Y.Z`; CI builds and publishes DMG/PKG/EXE/MSI/AppImage/deb plus the `latest*.yml` update feeds to a GitHub Release (`--publish always`; requires `GH_TOKEN` in the workflow env). Manual run: `workflow_dispatch` with an optional version input. Installed apps auto-check on launch (production builds only — gated on `app.isPackaged`) and show a "Restart Now / Later" dialog when an update is downloaded.

## Things not obvious from the code

- The 2-second start-delay and `cos >= 0.9` similarity threshold for cut detection are inherited from the original JavaFX implementation. Both are intentional UX choices, not arbitrary — preserve them when touching the cutting logic.
- Compression hardcodes `libx264` for video; only audio codec, preset, and CRF are user-configurable. This matches the JavaFX version's behavior and user expectations.
- Output directory naming uses local time, not UTC, to match what the legacy app produced.
- `@tensorflow/tfjs-node` is used only for tensor math (cosine similarity, normalization). It is a native module requiring `electron-rebuild` in postinstall and `asarUnpack` in electron-builder. Do not remove it — manual Float32Array loops are an order of magnitude slower on large embedding vectors.
- `icon.png` lives in two places intentionally: `resources/` (main process + packaging) and `src/renderer/public/` (renderer bundle). Keep them in sync when updating the icon.
- macOS auto-update requires a signed + notarized build. Unsigned dev builds log "auto-update disabled (dev build)" and skip — don't treat the missing update flow as a bug on local mac builds.
- deb installs do not auto-update (electron-updater limitation). AppImage is the auto-updating Linux artifact.
- The splash window runs in parallel with `initOnnxSession()` (they both start simultaneously); the 2-second minimum delay in `initServices()` ensures the splash is visible even if ONNX loads faster.
