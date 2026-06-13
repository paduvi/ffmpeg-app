# DogyMpegApp

Electron + React + TypeScript desktop app that wraps FFmpeg for video compression and ML-driven intelligent video cutting (a bundled ResNet18 ONNX model finds the frame most similar to a user-supplied sample image, then cuts at either the start or end of the matched sequence with `ffmpeg -c copy`).

Migrated from JavaFX (Java 21); the Java history lives in git but the working tree is Electron-only. **macOS and Windows only** — no Linux (no `linux` block in `electron-builder.yml`, no Linux CI jobs, no `package:linux`). Do not reintroduce Linux code paths. (The `icon:` option in `window.ts` stays — Windows uses it for the taskbar; macOS ignores it.)

---

## Stack

- Electron 41 (bundles Node 22 at runtime); dev/build toolchain needs Node 20.19+ (the Vite 7 floor)
- React 18 + TypeScript (strict)
- **Mantine v7** UI kit (`@mantine/core`, `/hooks`, `/modals`, `/notifications`)
- electron-vite 5 + Vite 7 (dev + build), electron-builder 26 (packaging); `esbuild` pinned via a top-level `overrides` entry (see "Things not obvious")
- FFmpeg via `ffmpeg-static` (override path supported in Settings)
- ML: `onnxruntime-node` (ResNet18 inference, CoreML on macOS / DirectML on Windows, constant batch-16 inputs) + `sharp` (sample-image decode/resize); normalization and cosine similarity are plain TypeScript (`preprocess.ts`, `similarity.ts`)
- Persistence: `better-sqlite3` (sample images), `electron-store` (user prefs)
- Logging: `electron-log` · Auto-update: `electron-updater` (GitHub Releases provider)

---

## Layout

- `src/main/` — Electron main process. `index.ts` is the entry. `services/` holds ffmpeg/onnx/similarity/frames/preprocess/cutting/compression/gpu/encoders/notify. `ipc/` holds channel handlers, one file per feature. `db/` is the SQLite layer. `store.ts` is electron-store. `updater.ts` wires `electron-updater`.
- `src/preload/index.ts` — sole preload script. Exposes a typed `window.api` via `contextBridge.exposeInMainWorld`. All renderer↔main calls go through it; renderer never touches `ipcRenderer` directly.
- `src/preload/index.d.ts` — ambient types for `window.api`. Keep in sync with `index.ts`.
- `src/renderer/src/` — React app. `pages/` = top-level sections (Compression, Cutting). `components/` = reusable (VideoTable, ProgressModal, SettingsDialog, SampleImageTable, AboutDialog). `utils/` = renderer helpers (e.g. `localFile.ts`). No Node access; everything through `window.api`.
- `src/renderer/public/` — static files served at the renderer root. Contains `splash.gif` and `icon.png` (in-app header logo), copied from `resources/` — keep them in sync.
- `src/shared/types.ts` — types shared between main, preload, and renderer. Add all cross-boundary DTOs and enums here.
- `resources/` — packaged static assets. `models/resnet18_identity.onnx`, `icon.{icns,ico,png}`, `img/` (JavaFX-era icons used as buttons), `sample-images/` (permanent built-in samples seeded to SQLite on first launch).
- `scripts/rebuild-native.mjs` — postinstall native-module rebuild wrapper (see "Things not obvious").
- `electron.vite.config.ts` — Vite + electron-vite config. Three entry points (main/preload/renderer) with `@renderer` / `@shared` path aliases.
- `electron-builder.yml` — packaging config. Targets: mac dmg+pkg+zip, win nsis+msi. **No arch arrays in the config** — arch comes from CLI flags (`--arm64`/`--x64`), one per invocation: config arch overrides the CLI and makes a single run build both arches, which races the pkg target on a shared intermediate file and packages host-arch sharp into the foreign-arch app. `publish: github` so `electron-updater` finds release feeds.
- `.github/workflows/build.yml` — prepare (version) → build jobs (Windows x64, macOS arm64, macOS Intel primary on `macos-15-intel` with a `macos-26-intel` fallback) → release job. Build jobs never publish (`--publish never`, upload artifacts); the release job alone has `permissions: contents: write` and publishes via `softprops/action-gh-release`. Shared build steps live in `.github/actions/build-electron-package/action.yml`. macOS Intel is optional; Windows + macOS arm64 are required.

---

## Architecture conventions

### IPC (the full chain)

Every new feature the renderer needs from main touches **four** places:

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
  value: number // 0–1
  done: boolean
  active: boolean // true while being processed; shows animation at value=0
}
```

The remaining-time label in `ProgressModal` is derived renderer-side from `value` deltas (EMA-smoothed, shown once value ≥ 5 %). Services only ever send `FileProgress` — do not add ETA fields to the IPC payload.

**Race condition prevention (`initialFiles` prop)**: The main process starts work before the renderer's `useEffect` has registered its IPC listener. Pass `initialFiles: FileProgress[]` to `ProgressModal` so it seeds the rows immediately from a pre-built array (constructed in the page component _before_ calling `start()`). The effect only re-runs on `[opened, jobId, feature]` changes — `initialFiles` is intentionally excluded from the deps array with an `eslint-disable-next-line react-hooks/exhaustive-deps` comment.

### Cancellation

- Main side: each job's `AbortController` is stored in `Map<jobId, AbortController>`. On `cancel`, call `controller.abort()` and delete the entry.
- `runFfmpeg` in `src/main/services/ffmpeg.ts`:
  - Guards against already-aborted signals at the top of the Promise (`if (signal.aborted) { reject(new Error('ffmpeg aborted')); return }`).
  - Listens for `abort` to `proc.kill('SIGTERM')` (with a 3-second SIGKILL fallback).
  - The `close` handler **rejects** with `new Error('ffmpeg aborted')` when `signal.aborted` — it does not `resolve()`, so callers distinguish cancellation from completion.
- Services (`compression.ts`, `cutting.ts`) wrap `runFfmpeg` in try/catch. On catch: delete any partial output file with `unlinkSync`, reset the `FileProgress` entry to `active: false`, then re-throw only for non-abort errors (`if (!signal.aborted) throw err`). This keeps cancelled jobs from leaving half-written files in `~/ffmpeg-output/`.

### Local filesystem images in the renderer

`file://` URLs cannot be loaded by the renderer in dev mode (running on `http://localhost`) due to mixed-content restrictions. Use the custom `local-file://` protocol:

```ts
// Before app.whenReady() — src/main/index.ts:
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, stream: true } }
])

// Inside bootstrap() — after app.whenReady():
protocol.handle('local-file', (request) => {
  const encoded = new URL(request.url).pathname.replace(/^\/+/, '')
  return net.fetch(pathToFileURL(decodeURIComponent(encoded)).toString())
})
```

**The path must be percent-encoded into a single URL segment.** The renderer builds the URL via `localFileUrl(path)` (`src/renderer/src/utils/localFile.ts`): `` `local-file:///${encodeURIComponent(path)}` ``. A raw `` `local-file://${path}` `` breaks on Windows — a path like `C:\Users\…` puts the drive letter in the URL authority and Chromium mangles the backslashes / drops the colon (it works on macOS only because POSIX paths start with `/`). The handler decodes the single segment and rebuilds an absolute `file://` URL with `pathToFileURL` (from `node:url`). Reference images as `src={localFileUrl(s.path)}` in JSX. The renderer CSP (`index.html`) includes `img-src 'self' local-file: data:`.

### Renderer asset paths

In production the renderer runs from a `file://` URL, so an **absolute** path like `/icon.png` resolves to the filesystem root and breaks. Always use **relative** paths:

```tsx
<img src="./icon.png" />          // ✓ works in both dev (http) and prod (file://)
<img src="/icon.png" />           // ✗ breaks in prod
```

### App icon

`resources/icon.png` serves three roles, and is duplicated to `src/renderer/public/icon.png` for the renderer bundle — **keep the two copies in sync**:

1. OS taskbar/dock/installer icon — referenced by `electron-builder.yml`
2. BrowserWindow taskbar icon on Windows (ignored by macOS) — loaded via `process.resourcesPath/icon.png` in `window.ts`
3. In-app header logo — `src/renderer/public/icon.png`, referenced as `./icon.png` in `App.tsx`

### ONNX execution providers

`src/main/services/onnx.ts` resolves the best EP per platform; CPU is always last so ONNX falls back automatically if the primary EP can't handle an operator:

- macOS → `['coreml', 'cpu']` (CoreML uses Apple Neural Engine / Metal via the EP compiled into `libonnxruntime`)
- Windows → `['dml', 'cpu']` (DirectML uses GPU via DirectX 12; `DirectML.dll` is bundled by `onnxruntime-node`)

In dev `ort.env.logLevel = 'verbose'` shows which EP was selected (`All nodes placed on [CoreMLExecutionProvider]` etc.).

### Paths

- `app.getPath('userData')` — SQLite DB and electron-store prefs
- `~/ffmpeg-output/<yyyyMMddHHmmss>/` — compression and cutting outputs (**local time, not UTC**)
- `app.getPath('logs')` — electron-log output

---

## GPU-first computation

Every computation path prefers the GPU when present, with automatic detection (NVIDIA, AMD, Intel, Apple). CPU is always the fallback; **a GPU failure must never fail a job — log and fall back.** Implementation: `gpu.ts` (detection, cached in electron-store), `encoders.ts` (probe + ladder + per-encoder quality mapping), `compression.ts` (GPU-first encode with per-file software retry), `ipc/gpu.ts` + Settings → Performance (status display + re-probe), and `-hwaccel auto` decode on both the cutting pipe and compression input (retry-without on failure).

- **Detection** (`gpu.ts`): darwin → `system_profiler SPDisplaysDataType -json`; win32 → PowerShell `Get-CimInstance Win32_VideoController`. DTO `GpuInfo { vendor: 'nvidia'|'amd'|'intel'|'apple'|'none'; model; vramMb?; driverVersion? }`. Cached in electron-store; Settings exposes a re-probe.
- **Encoder probe** (`encoders.ts`): parse `ffmpeg -encoders`, then validate each candidate with a tiny real encode (`-f lavfi -i nullsrc=s=64x64:d=0.1 -c:v <enc> -f null -`) — a _listed_ encoder ≠ a _working_ driver. Cache the verdict keyed by the resolved ffmpeg path; re-probe when that path changes.
- **Ladder** (first probed-working wins): darwin → `h264_videotoolbox`; win32 NVIDIA → `h264_nvenc`, Intel → `h264_qsv`, AMD → `h264_amf`; both platforms → `libx264` last (universal fallback + target of the per-file software retry).
- **Quality/preset mapping** (`buildVideoArgs()`): videotoolbox `-q:v` = 100 − 2·CRF (constant quality needs Apple Silicon; Intel Macs encode at default bitrate); nvenc `-rc vbr -cq` = CRF with `p1`–`p7` presets; qsv `-global_quality` = CRF (ICQ, accepts libx264 preset names); amf CQP at CRF with speed/balanced/quality.
- **Concurrency caps**: GPU encodes capped at 4 on macOS (VideoToolbox has no session limit, degrades gracefully) and 2 on Windows (consumer NVENC drivers hard-fail beyond the session limit); CPU encodes keep `pLimit(cpus().length)`.
- **GPU encoding is always on — no user toggle.** `resolveVideoEncoder()` always probes the hardware ladder; Settings → Performance only shows detected hardware + a re-detect button.

### Considered & rejected here

- **Zero-copy GPU transcode** (`-hwaccel videotoolbox -hwaccel_output_format videotoolbox`, frames staying in GPU memory between decoder and encoder) — rejected by the bundled ffmpeg 6.0 build ("Unrecognised hwaccel output format"); both paths measured identical anyway. The shipped pipeline decodes via `-hwaccel auto` and round-trips frames through system memory. Revisit if the ffmpeg source is upgraded.
- **Bundled-ffmpeg hardware-encoder download contingency** (`gpuRuntime.ts` fetching a full GPL build from BtbN releases) — designed but **not built**; no shipped ffmpeg has yet been found to lack hardware encoders. If ever needed: download via Electron `net` into `userData/gpu-runtimes/ffmpeg/<version>/`, sha256-verify, atomic-rename, surface progress as `FileProgress[]`; `resolveFfmpegPath()` preference becomes user override → downloaded build → bundled `ffmpeg-static`.
- `sharp` stays on CPU: libvips has no GPU path.

---

## Cutting pipeline: streaming + batched inference

A producer–consumer pipeline: each frame is consumed the moment ffmpeg emits it, inference runs in fixed-size batches, and the producer is killed early once the cut point is known. Videos run in parallel via `pLimit(CUT_CONCURRENCY = 4)`. The shared ONNX session accepts concurrent `run()` calls, every pipeline submits the same constant batch shape (no per-job CoreML recompiles), and sample embeddings are computed once per distinct sample image (promise-cached map). Implemented across `frames.ts` (pipe producer), `cutting.ts` (batched consumer), `preprocess.ts` + `similarity.ts` (plain TS).

- **Producer fast-path** (`frames.ts`): pipe, not tmpdir — `-vf select=...,scale + crop to 224×224 -f rawvideo -pix_fmt rgb24 pipe:1` streams exactly 150,528 bytes per selected frame on stdout; pair the k-th frame with the k-th `showinfo` stderr line for its timestamp. The ffmpeg scale/crop must replicate sharp's cover-crop (`.resize(224,224)`, fit=cover) used for the sample image, or embeddings drift.
- **Keyframe sampling first, dense fallback**: the producer decodes only I-frames (`-skip_frame nokey`, ~34× faster on 1080p H.264) — fine because the `-c copy` cut snaps to a keyframe anyway and encoders place keyframes at scene cuts. A match window shorter than one GOP can slip through, so a search that finds **no** match re-runs once with dense sampling (decode all, keep every 30th ≈ 1 frame/s). **Two ffmpeg passes for a no-match video is the designed fallback, not a bug.**
- **`BATCH_SIZE = 16`**: batch 16 already saturates CoreML (steady ≈0.37 ms/frame at any batch ≥16) and is ~3× CPU-EP throughput vs batch 1; larger batches add zero throughput, cost more cold-start compile, and delay early-exit. Always submit the constant shape — pad partial batches (and the single sample image) to 16 and discard padded outputs, so each EP compiles exactly one shape.
- **Consumer** (`cutting.ts`): skip frames `< MIN_START_MS` (2-second rule); accumulate 16; preprocess concurrently (`pLimit(4)` ≈ default `UV_THREADPOOL_SIZE`), writing each result directly into its slice of one `Float32Array(16·3·224·224)` (no per-frame tensor allocations); one `session.run`; plain-TS cosine against the sample embedding; apply match logic (threshold `0.9`, start/end modes) in timestamp order.
- **Adaptive flush**: the pipeline is producer-bound, so when the queue drains with frames pending, flush immediately as a padded batch of 16 rather than waiting to fill — scoring sooner tightens early termination at no throughput cost.
- **Early termination kills the producer**: when start-mode finds its first match, or end-mode sees the match window close (similarity drops after a match run), abort the extraction ffmpeg immediately. Skipping the remaining decode is often the dominant saving.
- **Progress is 2-phase**: `0 → 0.90` driven by consumed frames (blend consumed/produced with the producer's pts/duration fraction, monotonic guard, snap to `0.90` on early termination); `0.90 → 1.0` = the ffmpeg stream-copy cut (`STREAM_END = 0.90` at the top of `cutting.ts`). The bar can jump to 90 % well before the whole video is decoded — that's expected.

The JS thread is ~99 % idle; parallelism lives in native land (ffmpeg as a separate process, sharp on the libuv pool, `session.run` on ORT threads / the ANE). Normalize + HWC→CHW ≈ 0.16 ms/frame and 512-dim cosine ≈ 0.5 µs in plain TS — negligible, which is why no GPU/BLAS math library is used (see Considered & rejected).

---

## Considered & rejected (architecture)

- **Native sidecar (Rust/C/Go compute backend, Electron as UI-only)** — rejected. The heavy parts are already native (ffmpeg = C in its own process; ORT = C++ on its own threads/ANE; libvips = C on the libuv pool); TS orchestration is ~0.2 % of the duty cycle. A sidecar would rewrite the cheap glue, keep the same native libs, and add a second toolchain, nested-binary signing/notarization, an IPC protocol, and version-skew risk. Revisit only if: deep libav integration (decode straight to tensors / GPU-resident frames) at well beyond desktop scale is needed; the app leaves Electron (Tauri); or in-process native crashes (ORT/sharp segfaults) become a stability problem — for the last, first reach for Electron's `utilityProcess` (crash isolation while staying TypeScript).
- **`@tensorflow/tfjs-node` / `tfjs-node-gpu`** — rejected and removed. Cosine similarity is ~10³ FLOPs/frame — trivial in plain TS (sub-ms), and the heavy ResNet18 compute already runs on GPU via ONNX EPs, so a second GPU runtime wins nothing. `tfjs-node-gpu` is CUDA-11/Linux-only with no macOS support; `tfjs-node` crashes on Node ≥ 24 (`util.isNullOrUndefined` removed). Normalization + cosine are plain TS in `preprocess.ts` / `similarity.ts` (and can write straight into the batch buffer, which tfjs cannot). **Do not reintroduce.**

---

## Commands

```bash
npm install           # install (postinstall runs scripts/rebuild-native.mjs → electron-rebuild for better-sqlite3)
npm run dev           # Electron + Vite HMR
npm run typecheck     # tsc --noEmit for both Node and Web TS projects
npm run lint          # eslint
npm run build         # production bundle (no installer)
npm run package       # electron-builder for current OS
npm run package:mac   # DMG + PKG + ZIP (current arch only — CI builds both arches)
npm run package:win   # NSIS + MSI (x64)
```

---

## Releasing

Push a tag `vX.Y.Z`; build jobs upload artifacts and a dedicated release job publishes DMG/PKG/ZIP/EXE/MSI plus the `latest*.yml` update feeds and `.blockmap` files to a GitHub Release (no PAT needed — the release job grants `contents: write` to the default token). The two mac architectures are **not** merged: Apple Silicon ships the default `latest-mac.yml`; the release job renames the Intel feed to `latest-x64-mac.yml`, and Intel installs request it via `autoUpdater.channel = 'latest-x64'` in `updater.ts`. The mac `zip` target exists because electron-updater on macOS cannot update from a dmg. Manual run: `workflow_dispatch` with an optional version input (builds artifacts, no release). Installed apps auto-check on launch (production only — gated on `app.isPackaged`) and show a "Restart Now / Later" dialog when an update is downloaded.

---

## Coding conventions

### Flags instead of `break` across try/finally

You cannot `break` from a `catch` to exit an outer `for` loop across an intervening `try/finally`. Use a boolean flag:

```ts
let succeeded = false
try {
  await doWork()
  succeeded = true
} catch (err) {
  if (!signal.aborted) throw err
} finally {
  cleanup() // always runs
}
if (succeeded) {
  /* mark done */
}
```

### Variable hoisting before try/finally

Declare variables read _after_ `finally { ... }` **before** the `try` block:

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

Declare phase boundaries as named constants and map each sub-phase callback linearly into its slice; snap to the exact boundary after each phase so the bar never regresses:

```ts
const PHASE1_END = 0.5
const PHASE2_END = 0.9
// Phase 1: value = p * PHASE1_END
// Phase 2: value = PHASE1_END + fraction * (PHASE2_END - PHASE1_END)
// Phase 3: value = PHASE2_END + ffmpegProgress * (1 - PHASE2_END)
```

### Optional progress callbacks in services

For progress reporting not all callers need, use an optional callback and a guard:

```ts
export async function extractFrames(
  videoPath: string,
  signal: AbortSignal,
  onProgress?: (value: number) => void // ← optional
): Promise<{ frames: Frame[]; cleanup: () => void }>
// call: if (onProgress && totalSeconds > 0) onProgress(pts / totalSeconds)
```

### Service options as a dedicated enum/type

Express a user-configurable behaviour with a small discrete set as a named type in `src/shared/types.ts`, not a boolean — keeps IPC argument lists readable and call sites self-documenting:

```ts
export type CutMode = 'start' | 'end'
export async function cutVideos(jobs: ..., cutMode: CutMode, onProgress: ..., signal: AbortSignal)
```

### IPC handler default arguments

Handlers may receive optional args from old renderer versions; use default-parameter syntax:

```ts
ipcMain.handle('cutting:start', async (event, jobs: Job[], cutMode: CutMode = 'end') => { ... })
```

### ESLint: intentional exhaustive-deps exceptions

Put the disable comment on the line **before** the dependency array, with a short inline reason:

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [opened, jobId, feature]) // intentionally exclude initialFiles — seeds once on open
```

### Custom Electron protocol

Register a custom scheme **before** `app.whenReady()` and handle it **after** (full handler in "Local filesystem images in the renderer"). Percent-encode the path into one URL segment on the renderer side (`encodeURIComponent`) and decode + `pathToFileURL` on the main side — never interpolate a raw path, or Windows drive paths break. Add the scheme to the renderer's CSP `img-src` directive (use `Content-Security-Policy`, not the Firefox-only `X-Content-Security-Policy`).

---

## Things not obvious from the code

- **`cos >= 0.9` threshold and 2-second start delay** — inherited from the JavaFX implementation. Intentional UX choices; preserve them when modifying the cutting logic.
- **`CutMode` default is `'end'`** — "End of match" cuts at the _last_ similar frame (legacy JavaFX behavior — skips intros that match the sample); "Start of match" cuts at the _first_. The IPC handler defaults to `'end'` even if the renderer sends no value.
- **Output directory timestamps use local time**, not UTC. Matches the legacy app.
- **Splash window and ONNX init run in parallel** in `bootstrap()`; the 1-second `initServices()` delay ensures the splash is visible even when ONNX loads instantly on fast hardware.
- **No macOS auto-update on unsigned builds** — `updater.ts` skips the check if `!app.isPackaged` and logs a notice. A missing update prompt in dev is not a bug.
- **Intel macs update from their own feed** — `updater.ts` sets `autoUpdater.channel = 'latest-x64'` on darwin/x64, so Intel installs fetch `latest-x64-mac.yml` (renamed from the Intel job's feed by the release workflow) while Apple Silicon uses the default `latest-mac.yml`. The two arches are deliberately not merged. If the channel name and the rename step drift apart, Intel auto-update breaks silently.
- **`local-file://` exists because `file://` is blocked in dev** — the renderer runs on `http://localhost:5173`; mixed-content rules block `file://` image loads. The custom protocol proxies through `net.fetch` and works in dev and prod. A raw `local-file://${winPath}` silently fails on Windows (drive letter parsed as URL authority) — always go through `localFileUrl()` (encode) + `pathToFileURL` (decode).
- **GPU detection PowerShell isn't `powershell.exe` on PATH** — some machines ship only PowerShell 7 (`pwsh`). `gpu.ts` tries candidates in order: absolute `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (present even when not on PATH), then `pwsh.exe`, then `powershell.exe`. Detection **failures are not cached** (and a previously cached failure is ignored), so a transient failure self-heals next launch / re-probe instead of sticking as `vendor: 'none'`.
- **`postinstall` goes through `scripts/rebuild-native.mjs`, not `electron-rebuild` directly** — Node 24+ Windows binaries are ClangCL-built, so node-gyp writes `clang:1` into `config.gypi` and Node's `common.gypi` forces `msbuild_toolset: ClangCL` on every native addon. Most dev machines only have the MSVC toolset, so a from-source build fails with `MSB8020: ClangCL … cannot be found`; since `better-sqlite3` is an `optionalDependency`, npm then silently drops it (→ `Cannot find module 'better-sqlite3'`). The wrapper sets `npm_config_clang=0` on win32 only — node-gyp then writes `clang:0` and uses MSVC v142/v143. (`GYP_DEFINES=clang=0` does **not** work; it loses to the strong `clang:1`.) It also reinstalls `better-sqlite3` from source if npm dropped it, then runs `electron-rebuild`. No-op on macOS.
- **Electron is pinned at 41, not "latest"** — `better-sqlite3` 12.x ships prebuilts only up to Electron 41 (ABI 145) and its C++ source does not compile against Electron 42's V8 headers (`v8::External::Value`/`New` signatures changed). Electron 41 is past the patched-CVE line (fixed in 40+), so `npm audit` is satisfied. Do not bump past 41 until `better-sqlite3` adds support.
- **`esbuild` is force-pinned via `overrides`** — Vite 7 (`^0.27`) and electron-vite 5 (`^0.25`) request esbuild in a vulnerable range; `overrides: { "esbuild": "0.28.1" }` forces the patched build tree-wide so `npm audit` is clean. Vite stays at 7 (electron-vite 5 / `@vitejs/plugin-react` 4 don't support Vite 8 yet). Drop the override once those tools adopt esbuild ≥ 0.28.1.
- **`tmp` is not a dependency** — `node_modules/tmp` may still exist transitively under `electron-builder`; that's its dependency, not ours — don't `import` it.
