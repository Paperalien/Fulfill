import { logger } from "../lib/logger";
import { purgeExpiredTrash } from "./trashPurge";

const STARTUP_DELAY_MS = 5_000;
const DAILY_MS = 24 * 60 * 60 * 1_000;

/**
 * Starts the background job scheduler. Must be called once after the server
 * begins listening. Jobs run:
 *   - 5 seconds after startup (to avoid contention during boot)
 *   - Every 24 hours thereafter
 */
export function startScheduler(): void {
  const run = async (): Promise<void> => {
    try {
      await purgeExpiredTrash();
    } catch (err) {
      // Logged inside purgeExpiredTrash; re-catch here so the interval survives
      logger.error({ err }, "Scheduler: job run failed");
    }
  };

  setTimeout(() => {
    void run();
    setInterval(() => void run(), DAILY_MS);
  }, STARTUP_DELAY_MS);

  logger.info({ startupDelayMs: STARTUP_DELAY_MS, intervalMs: DAILY_MS }, "Background scheduler started");
}
