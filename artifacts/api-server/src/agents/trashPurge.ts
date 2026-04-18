import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db/schema";
import { isNotNull, lt, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Returns the cutoff date for trash retention.
 * Tasks with deletedAt older than this date are eligible for hard-deletion.
 * Extracted as a pure function for testability.
 */
export function trashCutoffDate(retentionDays = DEFAULT_RETENTION_DAYS): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

/**
 * Hard-deletes all tasks that have been in the trash longer than the retention
 * period. Runs across all workspaces. Safe to call multiple times (idempotent).
 */
export async function purgeExpiredTrash(
  retentionDays = DEFAULT_RETENTION_DAYS
): Promise<{ purgedCount: number }> {
  const cutoff = trashCutoffDate(retentionDays);

  try {
    const purged = await db
      .delete(tasksTable)
      .where(
        and(isNotNull(tasksTable.deletedAt), lt(tasksTable.deletedAt, cutoff))
      )
      .returning({ id: tasksTable.id });

    const purgedCount = purged.length;
    if (purgedCount > 0) {
      logger.info({ purgedCount, cutoff }, "Purged expired trash tasks");
    }
    return { purgedCount };
  } catch (err) {
    logger.error({ err }, "Failed to purge expired trash");
    throw err;
  }
}
