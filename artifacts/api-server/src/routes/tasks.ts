import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, columnsTable, sprintsTable } from "@workspace/db/schema";
import { eq, and, inArray, isNull, asc, max } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  BulkArchiveTasksBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

function nextDueDate(dueDate: string | null, recurrence: string): string {
  const base = dueDate ? new Date(dueDate) : new Date();
  if (recurrence === "daily") base.setDate(base.getDate() + 1);
  else if (recurrence === "weekly") base.setDate(base.getDate() + 7);
  else if (recurrence === "monthly") base.setMonth(base.getMonth() + 1);
  return base.toISOString().split("T")[0];
}

// GET / — all non-deleted tasks for the workspace, ordered by order asc
router.get("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };

  try {
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.workspaceId, workspaceId),
          isNull(tasksTable.deletedAt)
        )
      )
      .orderBy(asc(tasksTable.order));

    res.json(tasks);
  } catch (err) {
    req.log.error(err, "Failed to list tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create a new task
router.post("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  try {
    // Validate columnId and sprintId belong to this workspace
    const [col] = await db
      .select({ id: columnsTable.id })
      .from(columnsTable)
      .where(and(eq(columnsTable.id, body.columnId), eq(columnsTable.workspaceId, workspaceId)));
    if (!col) {
      res.status(400).json({ error: "Column not found in this workspace" });
      return;
    }

    if (body.sprintId) {
      const [sprint] = await db
        .select({ id: sprintsTable.id })
        .from(sprintsTable)
        .where(and(eq(sprintsTable.id, body.sprintId), eq(sprintsTable.workspaceId, workspaceId)));
      if (!sprint) {
        res.status(400).json({ error: "Sprint not found in this workspace" });
        return;
      }
    }

    // Compute order: max existing order + 1
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(tasksTable.order) })
      .from(tasksTable)
      .where(eq(tasksTable.workspaceId, workspaceId));

    const order = maxOrder != null ? maxOrder + 1 : 0;

    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(tasksTable).values({
      id,
      workspaceId,
      title: body.title,
      notes: body.notes ?? "",
      columnId: body.columnId,
      sprintId: body.sprintId ?? null,
      storyPoints: body.storyPoints ?? null,
      order,
      dueDate: body.dueDate ?? null,
      parentId: body.parentId ?? null,
      predecessorIds: body.predecessorIds ?? null,
      tags: body.tags ?? null,
      reminder: body.reminder ?? null,
      recurrence: body.recurrence ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, id));

    res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create task");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /bulk-archive — archive multiple tasks
router.patch("/bulk-archive", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = BulkArchiveTasksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { taskIds } = parsed.data;
  if (taskIds.length === 0) {
    res.json([]);
    return;
  }

  try {
    const now = new Date();

    await db
      .update(tasksTable)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(tasksTable.workspaceId, workspaceId),
          inArray(tasksTable.id, taskIds)
        )
      );

    const updated = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.workspaceId, workspaceId),
          inArray(tasksTable.id, taskIds)
        )
      );

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to bulk archive tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /:taskId — update task fields
router.patch("/:taskId", async (req, res) => {
  const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  try {
    // Fetch the current task
    const [existing] = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // Validate cross-workspace references if provided
    if (body.columnId && body.columnId !== existing.columnId) {
      const [col] = await db
        .select({ id: columnsTable.id })
        .from(columnsTable)
        .where(and(eq(columnsTable.id, body.columnId), eq(columnsTable.workspaceId, workspaceId)));
      if (!col) {
        res.status(400).json({ error: "Column not found in this workspace" });
        return;
      }
    }

    if (body.sprintId && body.sprintId !== existing.sprintId) {
      const [sprint] = await db
        .select({ id: sprintsTable.id })
        .from(sprintsTable)
        .where(and(eq(sprintsTable.id, body.sprintId), eq(sprintsTable.workspaceId, workspaceId)));
      if (!sprint) {
        res.status(400).json({ error: "Sprint not found in this workspace" });
        return;
      }
    }

    const now = new Date();
    const { inProgressAt: inProgressAtRaw, archivedAt: archivedAtRaw, deletedAt: deletedAtRaw, ...bodyRest } = body;
    const updateData: Partial<typeof tasksTable.$inferInsert> = {
      ...bodyRest,
      updatedAt: now,
    };
    const toDate = (v: string | null | undefined) =>
      typeof v === 'string' ? new Date(v) : v ?? undefined;
    updateData.inProgressAt = toDate(inProgressAtRaw);
    updateData.archivedAt = toDate(archivedAtRaw);
    updateData.deletedAt = toDate(deletedAtRaw);

    // Handle inProgressAt auto-set
    if (body.columnId && body.columnId !== existing.columnId) {
      const [newColumn] = await db
        .select()
        .from(columnsTable)
        .where(eq(columnsTable.id, body.columnId));

      if (newColumn) {
        // Auto-set inProgressAt if moving to in-progress and not yet set
        if (
          newColumn.semanticStatus === "in-progress" &&
          !existing.inProgressAt &&
          !("inProgressAt" in body && body.inProgressAt != null)
        ) {
          updateData.inProgressAt = now;
        }
      }
    }

    // Apply update
    await db
      .update(tasksTable)
      .set(updateData)
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    const [updated] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));

    // Handle recurrence spawning: if task has recurrence and is being moved to a 'done' column
    let spawned: typeof tasksTable.$inferSelect | null = null;

    if (body.columnId && body.columnId !== existing.columnId && updated.recurrence) {
      const [doneColumn] = await db
        .select()
        .from(columnsTable)
        .where(eq(columnsTable.id, body.columnId));

      if (doneColumn && doneColumn.semanticStatus === "done") {
        // Find the first not-started column in the workspace
        const [firstColumn] = await db
          .select()
          .from(columnsTable)
          .where(
            and(
              eq(columnsTable.workspaceId, workspaceId),
              eq(columnsTable.semanticStatus, "not-started")
            )
          )
          .orderBy(asc(columnsTable.order))
          .limit(1);

        if (firstColumn) {
          const [{ maxOrder }] = await db
            .select({ maxOrder: max(tasksTable.order) })
            .from(tasksTable)
            .where(eq(tasksTable.workspaceId, workspaceId));

          const spawnedOrder = maxOrder != null ? maxOrder + 1 : 0;
          const spawnedId = crypto.randomUUID();
          const spawnedNow = new Date();

          await db.insert(tasksTable).values({
            id: spawnedId,
            workspaceId: updated.workspaceId,
            title: updated.title,
            notes: updated.notes,
            columnId: firstColumn.id,
            sprintId: updated.sprintId,
            storyPoints: updated.storyPoints,
            order: spawnedOrder,
            dueDate: nextDueDate(updated.dueDate, updated.recurrence),
            inProgressAt: null,
            archivedAt: null,
            deletedAt: null,
            parentId: updated.parentId,
            predecessorIds: updated.predecessorIds,
            tags: updated.tags,
            reminder: updated.reminder,
            reminderDismissedAt: null,
            recurrence: updated.recurrence,
            createdAt: spawnedNow,
            updatedAt: spawnedNow,
          });

          const [spawnedTask] = await db
            .select()
            .from(tasksTable)
            .where(eq(tasksTable.id, spawnedId));

          spawned = spawnedTask ?? null;
        }
      }
    }

    res.json({ updated, spawned });
  } catch (err) {
    req.log.error(err, "Failed to update task");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:taskId — soft-delete (sets deletedAt; task moves to Trash)
router.delete("/:taskId", async (req, res) => {
  const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };

  try {
    const [existing] = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const now = new Date();
    await db
      .update(tasksTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete task");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:taskId/permanent — hard delete (removes row; used from Trash "Delete forever")
router.delete("/:taskId/permanent", async (req, res) => {
  const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };

  try {
    const [existing] = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await db
      .delete(tasksTable)
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.workspaceId, workspaceId)
        )
      );

    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to permanently delete task");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
