import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { columnsTable, sprintsTable, tasksTable } from "@workspace/db/schema";
import { eq, max } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

const toDate = (s: string | null | undefined): Date | null =>
  s ? new Date(s) : null;

const LocalColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().int(),
  semanticStatus: z.enum(["not-started", "in-progress", "done"]),
  color: z.string().nullable().optional(),
});

const LocalSprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
});

const LocalTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().default(""),
  columnId: z.string(),
  sprintId: z.string().nullable().optional(),
  storyPoints: z.number().int().nullable().optional(),
  order: z.number().int(),
  dueDate: z.string().nullable().optional(),
  inProgressAt: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  predecessorIds: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  reminder: z.string().nullable().optional(),
  reminderDismissedAt: z.string().nullable().optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
});

const MigrateBody = z.object({
  columns: z.array(LocalColumnSchema),
  sprints: z.array(LocalSprintSchema),
  tasks: z.array(LocalTaskSchema),
});

// POST /workspaces/:workspaceId/migrate
// Atomically uploads all local data to the server workspace in a single DB transaction.
// - Columns are deduplicated by name + semanticStatus (reuses existing if matched).
// - Sprints are created fresh.
// - Tasks are created with local IDs remapped to server IDs, including
//   columnId, sprintId, parentId, and predecessorIds.
router.post("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = MigrateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { columns: localColumns, sprints: localSprints, tasks: localTasks } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // ── Columns ───────────────────────────────────────────────────────────
      // Get existing columns and figure out the max order so new ones append.
      const existingCols = await tx
        .select()
        .from(columnsTable)
        .where(eq(columnsTable.workspaceId, workspaceId));

      const [{ maxColOrder }] = await tx
        .select({ maxColOrder: max(columnsTable.order) })
        .from(columnsTable)
        .where(eq(columnsTable.workspaceId, workspaceId));

      let nextColOrder = (maxColOrder ?? -1) + 1;
      const colIdMap = new Map<string, string>();

      for (const localCol of localColumns) {
        const match = existingCols.find(
          (c) => c.name === localCol.name && c.semanticStatus === localCol.semanticStatus
        );
        if (match) {
          colIdMap.set(localCol.id, match.id);
        } else {
          const newId = crypto.randomUUID();
          await tx.insert(columnsTable).values({
            id: newId,
            workspaceId,
            name: localCol.name,
            semanticStatus: localCol.semanticStatus,
            order: nextColOrder++,
            color: localCol.color ?? null,
          });
          colIdMap.set(localCol.id, newId);
        }
      }

      // ── Sprints ───────────────────────────────────────────────────────────
      const sprintIdMap = new Map<string, string>();

      for (const localSprint of localSprints) {
        const newId = crypto.randomUUID();
        await tx.insert(sprintsTable).values({
          id: newId,
          workspaceId,
          name: localSprint.name,
          startDate: localSprint.startDate,
          endDate: localSprint.endDate,
          isActive: localSprint.isActive,
        });
        sprintIdMap.set(localSprint.id, newId);
      }

      // ── Tasks ─────────────────────────────────────────────────────────────
      // Assign server IDs upfront so we can remap parentId and predecessorIds.
      const taskIdMap = new Map<string, string>();
      for (const localTask of localTasks) {
        taskIdMap.set(localTask.id, crypto.randomUUID());
      }

      const sortedTasks = [...localTasks].sort((a, b) => a.order - b.order);

      for (const localTask of sortedTasks) {
        const serverId = taskIdMap.get(localTask.id)!;
        const serverColumnId = colIdMap.get(localTask.columnId) ?? localTask.columnId;
        const serverSprintId = localTask.sprintId
          ? (sprintIdMap.get(localTask.sprintId) ?? null)
          : null;
        const serverParentId = localTask.parentId
          ? (taskIdMap.get(localTask.parentId) ?? null)
          : null;
        const serverPredecessorIds = localTask.predecessorIds?.map(
          (pid: string) => taskIdMap.get(pid) ?? pid
        ) ?? null;

        await tx.insert(tasksTable).values({
          id: serverId,
          workspaceId,
          title: localTask.title,
          notes: localTask.notes,
          columnId: serverColumnId,
          sprintId: serverSprintId,
          storyPoints: localTask.storyPoints ?? null,
          order: localTask.order,
          dueDate: localTask.dueDate ?? null,
          inProgressAt: toDate(localTask.inProgressAt),
          archivedAt: toDate(localTask.archivedAt),
          deletedAt: toDate(localTask.deletedAt),
          parentId: serverParentId,
          predecessorIds: serverPredecessorIds,
          tags: localTask.tags ?? null,
          reminder: localTask.reminder ?? null,
          reminderDismissedAt: localTask.reminderDismissedAt ?? null,
          recurrence: localTask.recurrence ?? null,
        });
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Migration failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
