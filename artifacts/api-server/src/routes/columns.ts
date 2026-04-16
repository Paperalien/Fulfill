import { Router, type IRouter } from "express";
import { eq, and, asc, max } from "drizzle-orm";
import { db } from "@workspace/db";
import { columnsTable, tasksTable } from "@workspace/db/schema";
import {
  CreateColumnBody,
  UpdateColumnBody,
  DeleteColumnQueryParams,
  ReorderColumnsBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET / — all columns for workspace, ordered by order asc
router.get("/", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId } = req.params as { workspaceId: string };

  const columns = await db
    .select()
    .from(columnsTable)
    .where(eq(columnsTable.workspaceId, workspaceId))
    .orderBy(asc(columnsTable.order));

  res.json(columns);
});

// POST / — create a column
router.post("/", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = CreateColumnBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, semanticStatus, color } = parsed.data;

  // Compute next order value
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(columnsTable.order) })
    .from(columnsTable)
    .where(eq(columnsTable.workspaceId, workspaceId));

  const nextOrder = maxOrder != null ? maxOrder + 1 : 0;

  const [column] = await db
    .insert(columnsTable)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      name,
      order: nextOrder,
      semanticStatus,
      color: color ?? null,
    })
    .returning();

  res.status(201).json(column);
});

// PATCH /:columnId — update column fields
router.patch("/:columnId", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId, columnId } = req.params as { workspaceId: string; columnId: string };
  const parsed = UpdateColumnBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updates: Partial<typeof columnsTable.$inferInsert> = {};
  const { name, semanticStatus, color, order } = parsed.data;

  if (name !== undefined) updates.name = name;
  if (semanticStatus !== undefined) updates.semanticStatus = semanticStatus;
  if (color !== undefined) updates.color = color ?? null;
  if (order !== undefined) updates.order = order;

  if (Object.keys(updates).length === 0) {
    const [existing] = await db
      .select()
      .from(columnsTable)
      .where(and(eq(columnsTable.id, columnId), eq(columnsTable.workspaceId, workspaceId)));

    if (!existing) {
      res.status(404).json({ error: "Column not found" });
      return;
    }

    res.json(existing);
    return;
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(columnsTable)
    .set(updates)
    .where(and(eq(columnsTable.id, columnId), eq(columnsTable.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Column not found" });
    return;
  }

  res.json(updated);
});

// DELETE /:columnId — reassign tasks then delete column
router.delete("/:columnId", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId, columnId } = req.params as { workspaceId: string; columnId: string };
  const parsed = DeleteColumnQueryParams.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { reassignToId } = parsed.data;

  // Validate source column exists in this workspace
  const [sourceCol] = await db
    .select({ id: columnsTable.id })
    .from(columnsTable)
    .where(and(eq(columnsTable.id, columnId), eq(columnsTable.workspaceId, workspaceId)));

  if (!sourceCol) {
    res.status(404).json({ error: "Column not found" });
    return;
  }

  if (reassignToId === columnId) {
    res.status(400).json({ error: "Cannot reassign to the same column" });
    return;
  }

  // Validate reassign target exists in this workspace
  const [targetCol] = await db
    .select({ id: columnsTable.id })
    .from(columnsTable)
    .where(and(eq(columnsTable.id, reassignToId), eq(columnsTable.workspaceId, workspaceId)));

  if (!targetCol) {
    res.status(400).json({ error: "Reassignment column not found in this workspace" });
    return;
  }

  await db.transaction(async (tx) => {
    // Reassign all tasks from deleted column to reassignToId
    await tx
      .update(tasksTable)
      .set({ columnId: reassignToId })
      .where(and(eq(tasksTable.columnId, columnId), eq(tasksTable.workspaceId, workspaceId)));

    // Delete the column
    await tx
      .delete(columnsTable)
      .where(and(eq(columnsTable.id, columnId), eq(columnsTable.workspaceId, workspaceId)));
  });

  res.status(204).send();
});

// POST /reorder — reorder columns by ordered list of IDs
router.post("/reorder", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = ReorderColumnsBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { columnIds } = parsed.data;

  await db.transaction(async (tx) => {
    for (let i = 0; i < columnIds.length; i++) {
      await tx
        .update(columnsTable)
        .set({ order: i, updatedAt: new Date() })
        .where(and(eq(columnsTable.id, columnIds[i]), eq(columnsTable.workspaceId, workspaceId)));
    }
  });

  const columns = await db
    .select()
    .from(columnsTable)
    .where(eq(columnsTable.workspaceId, workspaceId))
    .orderBy(asc(columnsTable.order));

  res.json(columns);
});

export default router;
