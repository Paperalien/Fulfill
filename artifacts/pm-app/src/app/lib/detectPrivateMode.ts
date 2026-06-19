// Best-effort private/incognito-window detection.
//
// There is no reliable, standardized way to detect private browsing — browsers
// deliberately make it hard (to stop paywalls and fingerprinting). We use the
// one portable signal that still works across Chromium, Firefox and modern
// Safari: in a private/incognito window the Storage API reports a much smaller
// quota than in a normal window, because private windows get a small, capped,
// in-memory storage budget instead of a disk-backed one.
//
// This is a HEURISTIC, tuned to avoid FALSE POSITIVES — we never want to tell a
// normal user they're private when they aren't. On any error, missing API, or a
// quota at/above the ceiling we return `false`. A false negative (missing a
// private window) is safe: the welcome panel always shows the data-persistence
// warning regardless, and a positive result here only adds a stronger nudge to
// sign in.
//
// Note: some Chromium incognito windows report a quota above this ceiling and so
// won't be detected — that's the conservative trade-off described above.

/**
 * Quota (bytes) below which we treat the window as private. Normal windows get a
 * disk-based quota in the multi-GB range; private windows are capped far lower.
 * 300 MB sits comfortably between the two for typical devices.
 */
export const PRIVATE_QUOTA_CEILING_BYTES = 300 * 1024 * 1024;

export async function detectPrivateMode(): Promise<boolean> {
  try {
    const storage =
      typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.estimate !== 'function') return false;
    const { quota } = await storage.estimate();
    if (typeof quota !== 'number' || Number.isNaN(quota)) return false;
    return quota < PRIVATE_QUOTA_CEILING_BYTES;
  } catch {
    return false;
  }
}
