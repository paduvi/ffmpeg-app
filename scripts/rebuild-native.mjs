// Rebuilds native modules (better-sqlite3) against the Electron ABI after install.
//
// Why this wrapper instead of calling electron-rebuild directly:
// Node 24+ official Windows binaries are built with ClangCL, so process.config sets
// `clang: 1`. node-gyp copies that into the generated `build/config.gypi`, and the
// bundled `common.gypi` then forces `msbuild_toolset: ClangCL` on every native addon.
// Most Windows dev machines ship only the MSVC toolset (the "Desktop development with
// C++" workload), not the clang-cl/LLVM toolset, so the build fails with MSB8020.
// Setting `npm_config_clang=0` makes node-gyp write `clang: 0` into config.gypi, so the
// ClangCL condition is skipped and the standard MSVC v142/v143 toolset is used instead.
// (GYP_DEFINES=clang=0 does NOT work — it loses precedence to the strong clang:1.)
//
// This is Windows-only: on macOS clang is the correct, required toolchain, so we leave
// the environment untouched there.

import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Avoid recursion: the fallback `npm install` below can re-trigger this postinstall.
if (process.env.__NATIVE_REBUILD_GUARD) {
  process.exit(0)
}

const require = createRequire(import.meta.url)
const env = { ...process.env, __NATIVE_REBUILD_GUARD: '1' }

if (process.platform === 'win32') {
  env.npm_config_clang = '0'
}

function isPresent() {
  try {
    require.resolve('better-sqlite3/package.json')
    return true
  } catch {
    return false
  }
}

// If npm dropped the optional dependency because its own install-time build failed
// (same ClangCL cause, e.g. on an offline/corp network with no prebuilt available),
// reinstall it from source now that clang=0 is set so the build succeeds and stays.
if (!isPresent()) {
  console.log('[rebuild-native] better-sqlite3 missing — reinstalling from source')
  execSync('npm install better-sqlite3 --no-save --include=optional --build-from-source', {
    stdio: 'inherit',
    env
  })
}

// Rebuild against the Electron ABI (the runtime that actually loads the module).
execSync('electron-rebuild -f -w better-sqlite3', { stdio: 'inherit', env })
