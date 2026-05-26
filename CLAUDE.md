# DogyMpegApp

Electron + React + TypeScript desktop app that wraps FFmpeg for video compression and ML-driven intelligent video cutting (a bundled ResNet18 ONNX model finds the frame most similar to a user-supplied sample image, then cuts at either the start or end of the matched sequence with `ffmpeg -c copy`).

This project was migrated from JavaFX (Java 21). The Java history is preserved in git but the working tree is Electron-only.

---

## Stack

- Electron 33+, Node 20+
- React 18 + TypeScript (strict)
- **Mantine v7** UI kit (`@mantine/core`, `/hooks`, `/modals`, `/notifications`)
- electron-vite (dev + build), electron-builder (packaging)
- FFmpeg via `ffmpeg-static` (override path supported in Settings)
- ML: `onnxruntime-node` (ResNet18 inference, CoreML on macOS / DirectML on Windows) + `sharp` (image resize/normalize) + `@tensorflow/tfjs-node` (cosine similarity, BLAS-backed)
- Persistence: `better-sqlite3` (sample images), `electron-store` (user prefs)
- Logging: `electron-log`
- Auto-update: `electron-updater` (GitHub Releases provider)

---

## Layout

- `src/main/` — Electron main process. `index.ts` is the entry. `services/` holds ffmpeg/onnx/similarity/frames/preprocess/cutting/compression. `ipc/` holds channel handlers, one file per feature. `db/` is the SQLite layer. `store.ts` is electron-store. `updater.ts` wires `electron-updater`.
- `src/preload/index.ts` — sole preload script. Exposes a typed `window.api` via `contextBridge.exposeInMainWorld`. All renderer↔main calls go through it; renderer never touches `ipcRenderer` directly.
- `src/preload/index.d.ts` — ambient types for `window.api`. Keep in sync with `index.ts`.
- `src/renderer/src/` — React app. `pages/` = top-level sections (Compression, Cutting). `components/` = reusable (VideoTable, ProgressModal, SettingsDialog, SampleImageTable, AboutDialog). No Node access; everything through `window.api`.
- `src/renderer/public/` — static files served at the renderer root. Contains `splash.gif` and `icon.png` (in-app header logo). These are copied from `resources/` — keep them in sync.
- `src/shared/types.ts` — types shared between main, preload, and renderer. Add all cross-boundary DTOs and enums here.
- `resources/` — packaged static assets. `models/resnet18_identity.onnx`, `icon.{icns,ico,png}`, `img/` (JavaFX-era icons used as buttons), `sample-images/` (permanent built-in samples seeded to SQLite on first launch).
- `electron.vite.config.ts` — Vite + electron-vite config. Three entry points (main/preload/renderer) with `@renderer` / `@shared` path aliases.
- `electron-builder.yml` — packaging config. Targets: mac dmg+pkg (x64+arm64), win nsis+msi, linux AppImage+deb (x64+arm64). `publish: github` so `electron-updater` finds release feeds.
- `.github/workflows/build.yml` — 5-job matrix (macOS arm64, macOS x64, Windows x64, Linux x64, Linux arm64) triggered on `v*` tags or `workflow_dispatch`. Tag pushes use `--publish always`; dispatches use `--publish never` and upload as workflow artifacts.

---

## Architecture conventions

### IPC (the full chain)

Every new feature that the renderer needs from main requires touching **four** places:

1. `src/main/ipc/<feature>.ts` — handler(s) registered with `ipcMain.handle`
2. `src/main/index.ts` — call `register<Feature>Handlers()` in `bootstrap()`
3. `src/preload/index.ts` — expose a typed wrapper on `window.api.<feature>` via `contextBridge`
4. `src/preload/index.d.ts` — add the matching ambient type so the renderer gets proper types

Shared DTO / enum types live in `src/shared/types.ts` and are imported by all three processes.

### Progress streams

Long-running jobs follow the `FileProgress[]` pattern:

- The IPC `start` handler launches work in the background, stores an `AbortController` in `Map<jobId, AbortController>`, and returns `jobId` immediately.
- The service function accepts `onProgress: (progress: FileProgress[]) => void` and calls it whenever any file's state changes.
- The IPC handler converts each `onProgress` call into a `webContents.send('<feature>:progress', jobId, progress)` event.
- The renderer subscribes in `ProgressModal` and updates local state.

```ts
// FileProgress shape (src/shared/types.ts)
type FileProgress = {
  name: string
  value: number   // 0–1
  done: boolean
  active: boolean // true while being processed; shows animation at value=0
}
```

**Race condition prevention (`initialFiles` prop)**: The main process starts work before the renderer's `useEffect` has registered its IPC listener. Pass `initialFiles: FileProgress[]` to `ProgressModal` so it seeds the rows immediately from a pre-built array (constructed in the page component *before* calling `start()`). The effect only re-runs on `[opened, jobId, feature]` changes — `initialFiles` is intentionally excluded from the deps array with an `eslint-disable-next-line react-hooks/exhaustive-deps` comment.

### Cancellation

- Main side: each job's `AbortController` is stored in `Map<jobId, AbortController>`. On `cancel`, call `controller.abort()` and delete the entry.
- `runFfmpeg` in `src/main/services/ffmpeg.ts`:
  - Guards against already-aborted signals at the top of the Promise (`if (signal.aborted) { reject(new Error('ffmpeg aborted')); return }`).
  - Listens for `abort` to `proc.kill('SIGTERM')` (with a 3-second SIGKILL fallback).
  - The `close` handler rejects with `new Error('ffmpeg aborted')` when `signal.aborted` — it does **not** call `resolve()`. This lets callers distinguish cancellation from completion.
- Services (`compression.ts`, `cutting.ts`) wrap `runFfmpeg` in try/catch. On catch: delete any partial output file with `unlinkSync`, reset the `FileProgress` entry to `active: false`, then re-throw only for non-abort errors (`if (!signal.aborted) throw err`).

### Local filesystem images in the renderer

`file://` URLs cannot be loaded by the renderer in dev mode (running on `http://localhost`) due to mixed-content restrictions. Use the custom `local-file://` protocol instead:

```ts
// Before app.whenReady() — src/main/index.ts:
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, stream: true } }
])

// Inside bootstrap() — after app.whenReady():
protocol.handle('local-file', (request) =>
  net.fetch(`file://${request.url.slice('local-file://'.length)}`)
)
```

The renderer's Content Security Policy (`index.html`) includes `img-src 'self' local-file: data:`. Reference sample images as `src={\`local-file://${path}\`}` in JSX.

### Renderer asset paths

In production, the renderer runs from a `file://` URL. An **absolute** path like `/icon.png` resolves to the filesystem root and breaks. Always use **relative** paths:

```tsx
<img src="./icon.png" />          // ✓ works in both dev (http) and prod (file://)
<img src="/icon.png" />           // ✗ breaks in prod
```

### App icon

`resources/icon.png` serves three roles:
1. OS taskbar/dock/installer icon — referenced by `electron-builder.yml`
2. BrowserWindow taskbar icon on Linux — loaded via `process.resourcesPath/icon.png`
3. In-app header logo — copied to `src/renderer/public/icon.png`, referenced as `./icon.png` in `App.tsx`

Keep the two copies in sync when updating the icon.

### ONNX execution providers

`src/main/services/onnx.ts` resolves the best EP per platform:

- macOS → `['coreml', 'cpu']` (CoreML uses Apple Neural Engine / Metal via the EP compiled into `libonnxruntime`)
- Windows → `['dml', 'cpu']` (DirectML uses GPU via DirectX 12; `DirectML.dll` is bundled by `onnxruntime-node`)
- Linux → `['cpu']`

CPU is always last so ONNX falls back automatically if the primary EP can't handle an operator. In dev mode `ort.env.logLevel = 'verbose'` is set so you can see which EP was selected in logs (`All nodes placed on [CoreMLExecutionProvider]` etc.).

### Cutting progress phases

`cutting.ts` reports progress across three weighted phases so the bar moves throughout the entire operation, not just during the ffmpeg cut:

```
Phase 1 — frame extraction   0 % → 50 %   (frames.ts onProgress callback)
Phase 2 — similarity search  50 % → 90 %   (per-frame index in the loop)
Phase 3 — ffmpeg cut         90 % → 100 %  (runFfmpeg progress callback)
```

Phase constants are declared at the top of `cutting.ts` (`EXTRACT_END = 0.50`, `SEARCH_END = 0.90`). After `extractFrames` returns, the value is snapped to exactly `EXTRACT_END` to prevent a backwards jump.

### Paths

- `app.getPath('userData')` — SQLite DB and electron-store prefs
- `~/ffmpeg-output/<yyyyMMddHHmmss>/` — compression and cutting outputs (local time, not UTC)
- `app.getPath('logs')` — electron-log output

---

## Commands

```bash
npm install           # install (native modules rebuild via electron-rebuild in postinstall)
npm run dev           # Electron + Vite HMR
npm run typecheck     # tsc --noEmit for both Node and Web TS projects
npm run lint          # eslint
npm run build         # production bundle (no installer)
npm run package       # electron-builder for current OS
npm run package:mac   # DMG + PKG (x64, arm64)
npm run package:win   # NSIS + MSI (x64)
npm run package:linux # AppImage + deb (x64, arm64)
```

---

## Releasing

Push a tag `vX.Y.Z`; CI builds and publishes DMG/PKG/EXE/MSI/AppImage/deb plus the `latest*.yml` update feeds to a GitHub Release (`--publish always`; requires `GH_TOKEN`). Manual run: `workflow_dispatch` with an optional version input. Installed apps auto-check on launch (production only — gated on `app.isPackaged`) and show a "Restart Now / Later" dialog when an update is downloaded.

---

## Coding conventions

### Flags instead of `break` across try/finally

You cannot use `break` from inside a `catch` block to exit an outer `for` loop when there is an intervening `try/finally` — the `finally` still runs, but the break target would leave scope. Use a boolean flag instead:

```ts
let succeeded = false
try {
  await doWork()
  succeeded = true
} catch (err) {
  // cleanup, decide whether to re-throw
  if (!signal.aborted) throw err
} finally {
  cleanup() // always runs
}
if (succeeded) { /* mark done */ }
```

### Variable hoisting before try/finally

Declare variables that must be read *after* `finally { ... }` **before** the `try` block, not inside it:

```ts
let result: string | null = null  // ← hoisted
try {
  result = await compute()
} finally {
  cleanup()
}
if (result) { ... }  // ← accessible here
```

### Phase-weighted progress

When a job has multiple sequential sub-phases with different durations, declare phase boundaries as named constants and map each sub-phase callback linearly into its slice:

```ts
const PHASE1_END = 0.50
const PHASE2_END = 0.90
// Phase 1: onPhase1Progress(p) → value = p * PHASE1_END
// Phase 2: value = PHASE1_END + fraction * (PHASE2_END - PHASE1_END)
// Phase 3: value = PHASE2_END + ffmpegProgress * (1 - PHASE2_END)
```

After each phase completes, snap the value to the exact boundary before starting the next phase to prevent regressions on the progress bar.

### Optional progress callbacks in services

When adding progress reporting to a utility function that not all callers need, use an optional callback parameter rather than a required one:

```ts
export async function extractFrames(
  videoPath: string,
  signal: AbortSignal,
  onProgress?: (value: number) => void   // ← optional
): Promise<{ frames: Frame[]; cleanup: () => void }> {
```

Call it with a guard: `if (onProgress && totalSeconds > 0) onProgress(pts / totalSeconds)`.

### Service options as a dedicated enum/type

When a service function has a user-configurable behaviour with a small set of discrete choices, express it as a named type in `src/shared/types.ts` rather than a boolean flag:

```ts
// shared/types.ts
export type CutMode = 'start' | 'end'

// service signature
export async function cutVideos(
  jobs: ...,
  cutMode: CutMode,   // ← named type, not boolean
  onProgress: ...,
  signal: AbortSignal
)
```

This keeps the IPC argument list readable and makes the call site self-documenting.

### IPC handler default arguments

IPC handlers may receive optional arguments from old renderer versions (or test calls). Use default-parameter syntax in the handler signature:

```ts
ipcMain.handle('cutting:start',
  async (event, jobs: Job[], cutMode: CutMode = 'end') => { ... }
)
```

### ESLint: intentional exhaustive-deps exceptions

When a `useEffect` dependency is intentionally excluded (e.g., a seed value that should only be read on mount, not on every re-render), add the disable comment on the line **before** the dependency array and a short inline explanation after it:

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [opened, jobId, feature]) // intentionally exclude initialFiles — seeds once on open
```

### Custom Electron protocol

When the renderer must load local filesystem files, register a custom scheme **before** `app.whenReady()` and handle it **after**:

```ts
// Before app.whenReady() — top-level in main/index.ts:
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, stream: true } }
])

// Inside bootstrap(), after await app.whenReady():
protocol.handle('local-file', (request) =>
  net.fetch(`file://${request.url.slice('local-file://'.length)}`)
)
```

Also add the scheme to the renderer's Content Security Policy `img-src` directive (use `Content-Security-Policy`, not the Firefox-only `X-Content-Security-Policy`).

---

## Things not obvious from the code

- **`cos >= 0.9` threshold and 2-second start delay** — inherited from the JavaFX implementation. Intentional UX choices; preserve them when modifying the cutting logic.
- **`CutMode` default is `'end'`** — "End of match" cuts at the *last* similar frame, useful for skipping intros that match the sample. "Start of match" cuts at the *first* similar frame (legacy JavaFX behavior). The IPC handler defaults to `'end'` even if the renderer sends no value.
- **Compression hardcodes `libx264`** — only audio codec, preset, and CRF are user-configurable. Matches JavaFX version expectations.
- **Output directory timestamps use local time** — not UTC. Matches legacy app.
- **`@tensorflow/tfjs-node` is BLAS-only** — used purely for cosine similarity math, not GPU inference. It is a native module requiring `electron-rebuild` and `asarUnpack`. Do not remove it; manual Float32Array loops are ~10× slower.
- **Splash window and ONNX init are parallel** — they both start at the same time in `bootstrap()`; the 2-second `initServices()` delay ensures the splash is visible even when ONNX loads instantly on fast hardware.
- **`icon.png` is intentionally in two places** — `resources/icon.png` for the main process and packaging; `src/renderer/public/icon.png` for the renderer bundle. Keep them in sync.
- **No macOS auto-update on unsigned builds** — `updater.ts` skips the update check if `!app.isPackaged` and logs a notice. Do not treat a missing update prompt as a bug in dev.
- **deb does not auto-update** — electron-updater limitation. AppImage is the self-updating Linux artifact.
- **Partial file cleanup on cancel** — `runFfmpeg` now rejects (not resolves) when the signal is aborted. Callers delete the partial output before re-checking `signal.aborted`. Previously, cancelling a job left half-written files in `~/ffmpeg-output/`.
- **`local-file://` exists because `file://` is blocked in dev** — the renderer runs on `http://localhost:5173` in dev; mixed-content rules block `file://` image loads. The custom protocol proxies through `net.fetch` and works in both dev and prod.
- **Cutting progress is 3-phased** — frame extraction (0–50%), similarity search (50–90%), and the ffmpeg stream-copy cut (90–100%). The ffmpeg cut step is nearly instant (`-c copy`), which is why it only accounts for 10% of the visual progress.
