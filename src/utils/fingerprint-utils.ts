/**
 * Deterministic hardware profile resolution from a fingerprint seed.
 *
 * Given the same seed string, this module always returns the same
 * HardwarePreset — so two profiles sharing a seed will produce
 * identical hardware fingerprints.
 *
 * Algorithm:
 *   1. Hash the seed with djb2 (fast, portable, no crypto dep)
 *   2. Use the hash to pick a preset from the pool
 *   3. Optionally filter by platform first
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
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/* ── Core resolver ───────────────────────────────────────────────── */

/**
 * Given a seed, deterministically choose a HardwarePreset from the pool.
 *
 * If `platformFilter` is supplied ("windows" | "macos" | "linux"),
 * only presets matching that platform are considered.
 *
 * The mapping is **stable** as long as the preset pool stays the same.
 * Adding new presets may shift assignments — see "versioned pool" note
 * in the implementation plan.
 */
export function resolveHardwareFromSeed(
  seed: string,
  platformFilter?: string,
): HardwarePreset {
  const pool = platformFilter
    ? HARDWARE_PRESETS.filter((p) => p.platform === platformFilter)
    : HARDWARE_PRESETS;

  // Fallback: if filter produces an empty pool, use the full list
  const effectivePool = pool.length > 0 ? pool : HARDWARE_PRESETS;

  const index = djb2Hash(seed) % effectivePool.length;
  return effectivePool[index];
}

/**
 * Generate a random 9‑digit numeric seed string.
 */
export function generateRandomSeed(): string {
  const min = 100_000_000;
  const max = 999_999_999;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}
