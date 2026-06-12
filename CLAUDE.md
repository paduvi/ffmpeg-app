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
- ML: `onnxruntime-node` (ResNet18 inference, CoreML on macOS / DirectML on Windows, constant batch-16 inputs) + `sharp` (sample-image decode/resize); normalization and cosine similarity are plain TypeScript (`preprocess.ts`, `similarity.ts`)
- Persistence: `better-sqlite3` (sample images), `electron-store` (user prefs)
- Logging: `electron-log`
- Auto-update: `electron-updater` (GitHub Releases provider)

---

## Layout

- `src/main/` — Electron main process. `index.ts` is the entry. `services/` holds ffmpeg/onnx/similarity/frames/preprocess/cutting/compression/gpu/encoders/notify. `ipc/` holds channel handlers, one file per feature. `db/` is the SQLite layer. `store.ts` is electron-store. `updater.ts` wires `electron-updater`.
- `src/preload/index.ts` — sole preload script. Exposes a typed `window.api` via `contextBridge.exposeInMainWorld`. All renderer↔main calls go through it; renderer never touches `ipcRenderer` directly.
- `src/preload/index.d.ts` — ambient types for `window.api`. Keep in sync with `index.ts`.
- `src/renderer/src/` — React app. `pages/` = top-level sections (Compression, Cutting). `components/` = reusable (VideoTable, ProgressModal, SettingsDialog, SampleImageTable, AboutDialog). No Node access; everything through `window.api`.
- `src/renderer/public/` — static files served at the renderer root. Contains `splash.gif` and `icon.png` (in-app header logo). These are copied from `resources/` — keep them in sync.
- `src/shared/types.ts` — types shared between main, preload, and renderer. Add all cross-boundary DTOs and enums here.
- `resources/` — packaged static assets. `models/resnet18_identity.onnx`, `icon.{icns,ico,png}`, `img/` (JavaFX-era icons used as buttons), `sample-images/` (permanent built-in samples seeded to SQLite on first launch).
- `electron.vite.config.ts` — Vite + electron-vite config. Three entry points (main/preload/renderer) with `@renderer` / `@shared` path aliases.
- `electron-builder.yml` — packaging config. Targets: mac dmg+pkg+zip, win nsis+msi. **No arch arrays in the config** — arch comes from CLI flags (`--arm64`/`--x64`), one per invocation: config arch overrides the CLI and makes a single run build both arches, which races the pkg target on a shared intermediate file and packages host-arch sharp into the foreign-arch app. `publish: github` so `electron-updater` finds release feeds.
- `.github/workflows/build.yml` — prepare (version) → build jobs (Windows x64, macOS arm64, macOS Intel primary on `macos-15-intel` with a `macos-26-intel` fallback) → release job. Build jobs never publish (`--publish never`, upload artifacts); the release job alone has `permissions: contents: write` and publishes via `softprops/action-gh-release`. Shared build steps live in `.github/actions/build-electron-package/action.yml`. macOS Intel is optional for a release; Windows + macOS arm64 are required.

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

The remaining-time label in `ProgressModal` is derived renderer-side from `value` deltas (EMA-smoothed, shown once value ≥ 5 %). Services only ever send `FileProgress` — do not add ETA fields to the IPC payload.

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
2. BrowserWindow taskbar icon on Windows (ignored by macOS) — loaded via `process.resourcesPath/icon.png` in `window.ts`
3. In-app header logo — copied to `src/renderer/public/icon.png`, referenced as `./icon.png` in `App.tsx`

Keep the two copies in sync when updating the icon.

### ONNX execution providers

`src/main/services/onnx.ts` resolves the best EP per platform:

- macOS → `['coreml', 'cpu']` (CoreML uses Apple Neural Engine / Metal via the EP compiled into `libonnxruntime`)
- Windows → `['dml', 'cpu']` (DirectML uses GPU via DirectX 12; `DirectML.dll` is bundled by `onnxruntime-node`)

CPU is always last so ONNX falls back automatically if the primary EP can't handle an operator. In dev mode `ort.env.logLevel = 'verbose'` is set so you can see which EP was selected in logs (`All nodes placed on [CoreMLExecutionProvider]` etc.).

### Cutting progress phases

`cutting.ts` reports progress across two weighted phases:

```
Phase 1 — streaming extract+search  0 % → 90 %   (producer/consumer pipeline)
Phase 2 — ffmpeg cut                90 % → 100 %  (runFfmpeg progress callback)
```

`STREAM_END = 0.90` is declared at the top of `cutting.ts`. Phase 1's value blends the producer fraction (pts/duration) with the consumed/produced ratio under a monotonic guard; it snaps to exactly `STREAM_END` before the cut starts. Early termination (match window complete) jumps straight to the boundary.

### Paths

- `app.getPath('userData')` — SQLite DB and electron-store prefs
- `~/ffmpeg-output/<yyyyMMddHHmmss>/` — compression and cutting outputs (local time, not UTC)
- `app.getPath('logs')` — electron-log output

---

## Platform support: macOS and Windows only (Linux removed June 2026)

Linux support (AppImage/deb) was dropped and the removal is executed: no `linux` block in `electron-builder.yml`, no Linux CI jobs, no `package:linux` script. Do not reintroduce Linux-specific code paths. (The `icon:` option in `window.ts` stays — Windows uses it for the taskbar; macOS ignores it.)

---

## GPU-first computation (implemented June 2026)

Requirement: every computation path should prefer the GPU when one is present, with automatic detection (NVIDIA, AMD, Intel, Apple). macOS and Windows only. CPU is always the fallback; a GPU failure must never fail a job — log and fall back.

Status: implemented — `gpu.ts` (detection, cached in electron-store), `encoders.ts` (probe + ladder + per-encoder quality mapping), `compression.ts` (GPU-first encode with per-file software retry), `ipc/gpu.ts` + Settings → Performance (status display, `hwEncoding` toggle, re-probe), and `-hwaccel auto` decode on both the cutting pipe and compression input (retry-without on failure). The Phase 2 ffmpeg-download contingency was **not built** — no evidence yet that any shipped ffmpeg build lacks hardware encoders (macOS verified: VideoToolbox present). The phase notes below are kept as design rationale.

Known ceiling: zero-copy GPU transcode (`-hwaccel videotoolbox -hwaccel_output_format videotoolbox`, keeping frames in GPU memory between decoder and encoder) is **rejected by the bundled ffmpeg 6.0 build** ("Unrecognised hwaccel output format") — verified June 2026; both paths measured identical. Revisit if the ffmpeg source is upgraded. The shipped pipeline decodes via `-hwaccel auto` and round-trips frames through system memory.

### Current state (verified June 2026)

| Path | Today | GPU gap |
|---|---|---|
| ONNX inference (`onnx.ts`) | CoreML (mac), DirectML (win) — already GPU | **none** on supported platforms |
| ffmpeg encode (`compression.ts`) | hardcoded `libx264` (CPU) | both platforms |
| ffmpeg decode (`frames.ts`, compression input) | software decode | both platforms |
| Cosine similarity (`similarity.ts`, tfjs-node) | CPU BLAS | none — intentionally CPU (see Out of scope) |

Facts that constrain the design (verified against installed packages):

- **Inference needs zero work**: CoreML (mac) and DirectML (win — covers NVIDIA/AMD/Intel via DirectX 12) both ship inside the `onnxruntime-node` npm package. The only CUDA wiring in the Node binding is for linux/x64 (`script/install-metadata.js`, v1.26.0) — dropping Linux eliminated the entire ONNX runtime-download problem (and its `app.asar.unpacked` writability headaches) from this plan.
- The bundled `ffmpeg-static` **on macOS** includes `h264_videotoolbox` / `hevc_videotoolbox` encoders and the `videotoolbox` hwaccel. The Windows build was **not** verified — capabilities must be probed at runtime, never assumed.

The plan is therefore encode/decode-only.

### Phase 1 — GPU detection + GPU-first encoding (biggest user-visible win)

1. `src/main/services/gpu.ts` — detect once at startup, cache in electron-store, expose a re-detect:
   - darwin: `system_profiler SPDisplaysDataType -json`
   - win32: PowerShell `Get-CimInstance Win32_VideoController`
   - DTO in `src/shared/types.ts`: `GpuInfo { vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'none'; model: string; vramMb?: number; driverVersion?: string }`
2. `src/main/services/encoders.ts` — capability probe: parse `ffmpeg -encoders`, then validate each candidate with a tiny real encode (`-f lavfi -i nullsrc=s=64x64:d=0.1 -c:v <enc> -f null -`), because a listed encoder ≠ a working driver. Cache the verdict keyed by the resolved ffmpeg path.
3. Encoder ladder (first *probed-working* wins): darwin → `h264_videotoolbox`; win32 NVIDIA → `h264_nvenc`, Intel → `h264_qsv`, AMD → `h264_amf`; both platforms → `libx264` last.
4. Quality/preset mapping — implemented in `buildVideoArgs()` (encoders.ts): videotoolbox `-q:v` = 100 − 2·CRF (constant quality needs Apple Silicon; Intel Macs encode at default bitrate); nvenc `-rc vbr -cq` = CRF with `p1`–`p7` presets; qsv `-global_quality` = CRF (ICQ mode, accepts libx264 preset names); amf CQP at CRF with speed/balanced/quality.
5. Per-file runtime fallback: if a hardware encode fails, retry that file once with `libx264` and log the downgrade.
6. Concurrency: cap concurrent GPU encodes at 4 on macOS / 2 on Windows (consumer NVENC drivers hard-fail beyond their session limit; VideoToolbox merely degrades); CPU encodes keep `pLimit(cpus().length)`.
7. New setting `hwEncoding: 'auto' | 'off'` (default `'auto'`) in `store.ts` + `Settings` type.

### Phase 2 — Settings UI (+ ffmpeg download contingency)

- SettingsDialog gains a "Performance" section: detected GPU, effective backend per subsystem (Inference: CoreML / DirectML / CPU; Encode: VideoToolbox / NVENC / QSV / AMF / x264), the `hwEncoding` toggle, and a re-probe button. Standard 4-place IPC chain under `gpu:*`.
- **Contingency — build only if the Phase 1 probe shows the bundled Windows ffmpeg lacks hardware encoders**: `src/main/services/gpuRuntime.ts` downloads a full GPL build (BtbN ffmpeg-builds GitHub releases) via Electron `net` into `userData/gpu-runtimes/ffmpeg/<version>/`, sha256-verified, atomic rename, cancellable via the standard `Map<jobId, AbortController>` pattern, progress as `FileProgress[]` so `ProgressModal` is reused as-is. `resolveFfmpegPath()` preference becomes: user override → downloaded full build → bundled `ffmpeg-static`. (This downloader was originally mandatory for Linux CUDA inference; with Linux dropped it survives only as this contingency.)

### Phase 3 — decode acceleration

- Add `-hwaccel auto` before `-i` for frame extraction and compression input; on failure retry without it. Frame extraction feeds the streaming cutting pipeline (below), so this is user-visible end to end.

### Out of scope (deliberate)

- `tfjs-node-gpu` is rejected, and `@tensorflow/tfjs-node` is removed entirely by the cutting-pipeline rework below (see its Decision subsection).
- `sharp` stays on CPU: libvips has no GPU path.

### Invariants (apply to all phases)

- CPU is always present and last in every ladder; GPU failure → log + fall back, never fail the job.
- Never assume an encoder/EP exists — probe, cache, and re-probe when the ffmpeg path changes.
- Downloaded artifacts are sha256-verified, stored in versioned dirs, and activated only after atomic rename.

---

## Cutting pipeline: streaming + batched inference (implemented June 2026)

Replaced the sequential flow in `cutting.ts` (extract **all** frames → search one-by-one) with a producer–consumer pipeline: each frame is consumed the moment ffmpeg emits it, inference runs in fixed-size batches, and the producer is killed early once the cut point is known. The outer per-video loop is unchanged. Implemented across `frames.ts` (pipe producer), `cutting.ts` (batched consumer), `preprocess.ts` + `similarity.ts` (plain TS). The pipe fast-path shipped as the only producer — the JPEG/tmpdir fallback was never needed (end-to-end test showed 0.99 similarity parity with sharp's cover-crop).

### Measured facts driving the design (June 2026, Apple Silicon dev machine)

- `resnet18_identity.onnx` input is `["batch_size", 3, 224, 224]` — **dynamic batch dim already; no model re-export needed**. Output `[N, 512]`.
- CPU EP: batch 1 = 40 ms/frame; batch 16 ≈ 12 ms/frame (~3× throughput). Flat beyond that (batch 64 ≈ 11.5 ms/frame).
- CoreML EP: steady state ≈ **0.36–0.38 ms/frame at every batch size from 16 through 128** — batch 16 already saturates the device, larger batches gain nothing. Compile time (first run per shape) scales linearly with batch size: 0.6 s @ 16 → 1.7 s @ 64 → 3.2 s @ 128. Submitting a different shape triggers a fresh compile.
- Consequence: **`BATCH_SIZE = 16` is the sweet spot** — larger batches buy zero throughput (flat ms/frame on both EPs), cost up to 5× more cold-start compile, and delay early-exit decisions while waiting to fill. Always submit the constant shape: pad any partial batch (and the single sample image) to 16 and discard padded outputs. One compiled shape per EP, zero recompiles.
- Plain-TS math is a rounding error (measured): normalize + HWC→CHW = **0.16 ms/frame** (150,528 px typed-array loop); 512-dim cosine = **0.5 µs**. Total JS-thread work ≈ 2.5 ms per batch of 16, vs ~1–1.6 s for the producer to deliver 16 frames — the JS thread is > 99 % idle. The parallelism lives in native land: ffmpeg is a separate OS process, sharp decodes/resizes on the libuv thread pool (measured 3.05× wall-clock speedup running 8 resizes via `Promise.all`; `pLimit(4)` matches the default `UV_THREADPOOL_SIZE=4`), and `session.run` executes on ORT's own threads / the ANE while the JS thread awaits.

### Design

- **Producer** — streaming variant of `extractFrames`: identical ffmpeg invocation (`select=not(mod(n\,30)),showinfo`), but each frame is enqueued as `{path, timestampMs}` as soon as it is safe to read. Completeness rule: `frame_N.jpg` is complete once the showinfo line for frame N+1 appears (the image2 muxer writes files strictly sequentially), or when ffmpeg exits (final frame). The queue holds only paths — frames are already on disk, so no backpressure cap is needed.
- **Keyframe sampling first, dense fallback** — the producer decodes only I-frames (`-skip_frame nokey`; measured **34× faster** extraction on 1080p H.264). No output precision is lost: the `-c copy` cut snaps to a keyframe regardless, and encoders place keyframes at scene cuts — exactly where match boundaries live. A match window shorter than one GOP can slip through, so a search that finds **no** match re-runs once with dense sampling (decode all, keep every 30th ≈ 1 frame/s). Two ffmpeg passes in the logs for a no-match video is the designed fallback, not a retry bug.
- **Producer fast-path (preferred)** — pipe instead of tmpdir: `-vf select=...,scale + crop to 224×224 -f rawvideo -pix_fmt rgb24 pipe:1` streams exactly 150,528 bytes per selected frame on stdout; pair the k-th frame with the k-th showinfo stderr line for its timestamp. Eliminates the JPEG encode/write/read/decode round-trip, the tmpdir, per-frame sharp, and the file-completeness rule; pipe backpressure naturally bounds memory. Parity caveat: the ffmpeg scale/crop must replicate sharp's cover-crop semantics (`.resize(224, 224)`, fit=cover) used for the sample image, or embeddings drift. The JPEG/tmpdir variant above is the fallback if the pipe proves finicky.
- **Consumer** — in `cutting.ts`: skip frames `< MIN_START_MS` (2-second rule preserved); accumulate 16; preprocess concurrently (`pLimit(4)`), each result written directly into its slice of a single `Float32Array(16·3·224·224)` (no per-frame tensor allocations); one `session.run`; plain-TS cosine against the sample embedding; apply the existing match logic (threshold `0.9`, start/end modes) in timestamp order.
- **Adaptive flush** — don't wait for a full batch: the pipeline is producer-bound (decode emits ~10–20 sampled frames/s; the consumer can score 150+ frames/s at batch 16), so when the queue drains with frames pending, flush immediately as a padded batch of 16. Padded inference costs the same ~6 ms the consumer would spend idling, and scoring frames sooner tightens early termination. Batch size therefore never gates latency — only the constant shape matters.
- **Early termination kills the producer**: when start-mode finds its first match, or end-mode sees the match window close (similarity drops after a match run), abort the extraction ffmpeg immediately. Today the entire video is decoded before search begins — skipping the remaining decode is often the dominant saving.
- **Cancellation**: the job's existing AbortController aborts producer and consumer together; tmpdir cleanup unchanged.
- **Progress becomes 2-phase** (supersedes the 3-phase model documented above): `0 → 0.90` driven by consumed frames (blend consumed/produced with the producer's pts/duration fraction; keep a monotonic guard; snap to `0.90` on early termination), `0.90 → 1.0` = the ffmpeg cut, unchanged.

### Decision: remove `@tensorflow/tfjs-node` (reverses the earlier "do not remove" note)

`tfjs-node-gpu` was reconsidered for GPU similarity math and is **rejected**; moreover tfjs is dropped entirely:

- The heavy compute (ResNet18, ~1.8 GFLOPs/frame) already runs on GPU via ONNX EPs. Cosine similarity is ~10³ FLOPs/frame — six orders of magnitude smaller. A second GPU runtime has nothing to win.
- `tfjs-node-gpu` is pinned to CUDA 11 (libtensorflow 2.9; effectively maintenance-mode), has no macOS support, and is Linux/CUDA-era tooling for a platform the app no longer ships.
- Bit-rot evidence: `@tensorflow/tfjs-node` 4.22 crashes outright on Node ≥ 24 (`util.isNullOrUndefined` was removed from node:util); it only still works in this app because Electron 33 pins Node 20.
- Both remaining tfjs uses are trivial in plain TS: preprocess normalize + HWC→CHW (~150K elements, sub-ms — and can write straight into the batch buffer, which tfjs cannot) and batched cosine (`[N,512]·[512]`, microseconds). The old "manual loops are ~10× slower" note measured relative BLAS speed; the absolute cost is < 1 ms per video either way.
- Payoff: 624 MB less in `node_modules` (measured), one less `electron-rebuild` in postinstall, one less asarUnpack native-module risk.

Removal touchpoints: `package.json` (dependency + postinstall), `electron-builder.yml` (asarUnpack entry), `electron.vite.config.ts` (externals list), and plain-TS rewrites of `preprocess.ts` + `similarity.ts`.

---

## Architecture decision: no native sidecar (June 2026)

A Rust/C/Go "compute backend" with Electron as UI-only was considered and rejected. The heavy parts are already native (ffmpeg = C in its own process; ORT = C++ on its own threads/ANE; libvips = C on the libuv pool); TypeScript orchestration is a measured ~0.2 % of the duty cycle. A sidecar would rewrite the cheap glue, keep the same native libraries, and add a second toolchain, nested-binary signing/notarization, an IPC protocol, and version-skew risk.

Revisit if any of these become true:

- Deep libav integration is needed (decode straight to tensors, GPU-resident frames) at well beyond desktop scale — Rust territory.
- The app leaves Electron entirely (a Tauri migration is the only coherent "Rust backend" story).
- In-process native crashes (ORT/sharp segfaults) become a stability problem — first reach for Electron's `utilityProcess` to isolate compute in a separate managed Node process, which gets the sidecar's crash isolation while staying TypeScript.

---

## Commands

```bash
npm install           # install (native modules rebuild via electron-rebuild in postinstall)
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
- **Compression is GPU-first (June 2026)** — `resolveVideoEncoder()` probes the platform ladder (VideoToolbox / NVENC / QSV / AMF) with a real test encode and caches the verdict per ffmpeg path; `libx264` is the universal fallback and the target of the per-file software retry. The user's preset/CRF settings are translated per encoder in `buildVideoArgs()`. GPU encodes are capped at 4 concurrent on macOS (VideoToolbox has no session limit, degrades gracefully) and 2 on Windows (consumer NVENC drivers hard-fail beyond the session limit); the `hwEncoding` toggle lives in Settings → Performance.
- **Output directory timestamps use local time** — not UTC. Matches legacy app.
- **`@tensorflow/tfjs-node` was removed (June 2026)** — normalization and cosine similarity are plain TypeScript (measured 0.16 ms + 0.5 µs per frame; see the cutting-pipeline section). Do not reintroduce it: it cost 624 MB plus an `electron-rebuild` step, and it crashes outright on Node ≥ 24.
- **Splash window and ONNX init are parallel** — they both start at the same time in `bootstrap()`; the 2-second `initServices()` delay ensures the splash is visible even when ONNX loads instantly on fast hardware.
- **`icon.png` is intentionally in two places** — `resources/icon.png` for the main process and packaging; `src/renderer/public/icon.png` for the renderer bundle. Keep them in sync.
- **No macOS auto-update on unsigned builds** — `updater.ts` skips the update check if `!app.isPackaged` and logs a notice. Do not treat a missing update prompt as a bug in dev.
- **Partial file cleanup on cancel** — `runFfmpeg` now rejects (not resolves) when the signal is aborted. Callers delete the partial output before re-checking `signal.aborted`. Previously, cancelling a job left half-written files in `~/ffmpeg-output/`.
- **Intel macs update from their own feed** — `updater.ts` sets `autoUpdater.channel = 'latest-x64'` on darwin/x64, so Intel installs fetch `latest-x64-mac.yml` (renamed from the Intel job's feed by the release workflow) while Apple Silicon uses the default `latest-mac.yml`. The two arches are deliberately not merged into one feed. If the channel name or the rename step ever drift apart, Intel auto-update breaks silently.
- **`local-file://` exists because `file://` is blocked in dev** — the renderer runs on `http://localhost:5173` in dev; mixed-content rules block `file://` image loads. The custom protocol proxies through `net.fetch` and works in both dev and prod.
- **Cutting progress is 2-phased** — streaming extract+search (0–90%) and the ffmpeg stream-copy cut (90–100%). Extraction and similarity search overlap in a producer/consumer pipeline; a completed match window kills the extraction ffmpeg early, so the bar can jump to 90% well before the whole video is decoded. That jump is expected behavior, not a bug.
