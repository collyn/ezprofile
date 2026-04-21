/**
 * Deterministic hardware profile resolution from a fingerprint seed.
 *
 * This is the **electron‑side** copy of the same algorithm used by the
 * frontend (`src/utils/fingerprint-utils.ts`).  Both must stay in sync.
 *
 * We duplicate rather than import because the Vite frontend and the
 * Electron main process use separate module graphs / bundlers.
 */

/* ── Inline preset pool ──────────────────────────────────────────── */
// We import from the generated barrel that electron's tsconfig can reach.
// The source of truth remains `src/data/hardware-presets.ts`, but we
// reference it via a re-export so the electron build can resolve it.

interface HardwarePreset {
  id: string;
  name: string;
  category: string;
  platform: string;
  gpuVendor: string;
  gpuRenderer: string;
  screenWidth: string;
  screenHeight: string;
  hardwareConcurrency: string;
  deviceMemory: string;
}

// ──────────────────────────────────────────────────────────────────
// We inline the full preset list here so the electron main process
// can resolve hardware without depending on the Vite module graph.
// This list must be kept in sync with `src/data/hardware-presets.ts`.
// ──────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

let _presetCache: HardwarePreset[] | null = null;

/**
 * Lazily load the preset pool by require()'ing the source TS module
 * at build time (electron-builder bundles it), or by importing it
 * directly since `electron/` and `src/data/` live in the same repo
 * and share tsconfig paths.
 *
 * Fallback: hardcoded minimal pool (should never happen in practice).
 */
function getPresetPool(): HardwarePreset[] {
  if (_presetCache) return _presetCache;

  try {
    // In the bundled electron app, `hardware-presets` is compiled alongside
    // the rest of the electron code.  We use a dynamic require so the
    // bundler includes it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/data/hardware-presets');
    _presetCache = mod.HARDWARE_PRESETS as HardwarePreset[];
  } catch {
    // Ultimate fallback — should not happen in production.
    console.warn('[fingerprint-utils] Could not load hardware presets, using empty pool');
    _presetCache = [];
  }

  return _presetCache;
}

/* ── Hash ────────────────────────────────────────────────────────── */

/**
 * djb2 — classic string‐hash by Daniel J. Bernstein.
 * Returns a positive 32‑bit integer.
 */
export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/* ── Core resolver ───────────────────────────────────────────────── */

export function resolveHardwareFromSeed(
  seed: string,
  platformFilter?: string,
): HardwarePreset {
  const allPresets = getPresetPool();
  const pool = platformFilter
    ? allPresets.filter((p) => p.platform === platformFilter)
    : allPresets;

  const effectivePool = pool.length > 0 ? pool : allPresets;
  const index = djb2Hash(seed) % effectivePool.length;
  return effectivePool[index];
}
