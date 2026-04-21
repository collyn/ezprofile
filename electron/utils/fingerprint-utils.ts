/**
 * Deterministic hardware profile resolution from a fingerprint seed.
 *
 * This is the **electron‑side** copy of the same algorithm used by the
 * frontend (`src/utils/fingerprint-utils.ts`).  Both must stay in sync.
 */

import { HARDWARE_PRESETS, type HardwarePreset } from '../data/hardware-presets';

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
  const pool = platformFilter
    ? HARDWARE_PRESETS.filter((p) => p.platform === platformFilter)
    : HARDWARE_PRESETS;

  const effectivePool = pool.length > 0 ? pool : HARDWARE_PRESETS;
  if (effectivePool.length === 0) {
    throw new Error('[fingerprint-utils] No hardware presets available in Electron bundle');
  }

  const index = djb2Hash(seed) % effectivePool.length;
  return effectivePool[index];
}
