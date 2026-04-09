import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { sprintSnapshotsTable } from "@workspace/db/schema";
import {
  GetSprintSnapshotsQueryParams,
  UpsertSprintSnapshotBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET / — all snapshots for workspace, optionally filtered by sprintId, ordered by date asc
router.get("/", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = GetSprintSnapshotsQueryParams.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { sprintId } = parsed.data;

  const snapshots = await db
    .select()
    .from(sprintSnapshotsTable)
    .where(
      sprintId
        ? and(
            eq(sprintSnapshotsTable.workspaceId, workspaceId),
            eq(sprintSnapshotsTable.sprintId, sprintId),
          )
        : eq(sprintSnapshotsTable.workspaceId, workspaceId),
    )
    .orderBy(asc(sprintSnapshotsTable.date));

  res.json(snapshots);
});

// POST / — upsert a sprint snapshot on (sprintId, date)
router.post("/", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = UpsertSprintSnapshotBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { sprintId, date, total, done } = parsed.data;

  const [snapshot] = await db
    .insert(sprintSnapshotsTable)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      sprintId,
      date,
      total,
      done,
    })
    .onConflictDoUpdate({
      target: [sprintSnapshotsTable.sprintId, sprintSnapshotsTable.date],
      set: { total, done },
    })
    .returning();

  res.status(201).json(snapshot);
});

export default router;
