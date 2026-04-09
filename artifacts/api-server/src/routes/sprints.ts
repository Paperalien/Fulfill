import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sprintsTable, tasksTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { CreateSprintBody, UpdateSprintBody } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET / — all sprints for workspace, ordered by startDate
router.get("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };

  try {
    const sprints = await db
      .select()
      .from(sprintsTable)
      .where(eq(sprintsTable.workspaceId, workspaceId))
      .orderBy(asc(sprintsTable.startDate));

    res.json(sprints);
  } catch (err) {
    req.log.error(err, "Failed to list sprints");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create a new sprint
router.post("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = CreateSprintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  try {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(sprintsTable).values({
      id,
      workspaceId,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      isActive: body.isActive ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await db
      .select()
      .from(sprintsTable)
      .where(eq(sprintsTable.id, id));

    res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create sprint");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /:sprintId — update sprint fields
router.patch("/:sprintId", async (req, res) => {
  const { workspaceId, sprintId } = req.params as { workspaceId: string; sprintId: string };
  const parsed = UpdateSprintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  try {
    const [existing] = await db
      .select()
      .from(sprintsTable)
      .where(
        and(
          eq(sprintsTable.id, sprintId),
          eq(sprintsTable.workspaceId, workspaceId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }

    const now = new Date();

    // If setting isActive = true, enforce only one active sprint at a time
    if (body.isActive === true) {
      await db.transaction(async (tx) => {
        // Deactivate all other sprints in the workspace
        await tx
          .update(sprintsTable)
          .set({ isActive: false, updatedAt: now })
          .where(
            and(
              eq(sprintsTable.workspaceId, workspaceId),
              eq(sprintsTable.isActive, true)
            )
          );

        // Apply the update to the target sprint
        await tx
          .update(sprintsTable)
          .set({ ...body, updatedAt: now })
          .where(
            and(
              eq(sprintsTable.id, sprintId),
              eq(sprintsTable.workspaceId, workspaceId)
            )
          );
      });
    } else {
      await db
        .update(sprintsTable)
        .set({ ...body, updatedAt: now })
        .where(
          and(
            eq(sprintsTable.id, sprintId),
            eq(sprintsTable.workspaceId, workspaceId)
          )
        );
    }

    const [updated] = await db
      .select()
      .from(sprintsTable)
      .where(eq(sprintsTable.id, sprintId));

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to update sprint");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:sprintId — delete sprint, clearing tasks.sprintId first
router.delete("/:sprintId", async (req, res) => {
  const { workspaceId, sprintId } = req.params as { workspaceId: string; sprintId: string };

  try {
    const [existing] = await db
      .select()
      .from(sprintsTable)
      .where(
        and(
          eq(sprintsTable.id, sprintId),
          eq(sprintsTable.workspaceId, workspaceId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }

    await db.transaction(async (tx) => {
      // Null out sprintId on any tasks referencing this sprint
      // (the DB has onDelete: "set null" on this FK, but being explicit is safer)
      await tx
        .update(tasksTable)
        .set({ sprintId: null, updatedAt: new Date() })
        .where(eq(tasksTable.sprintId, sprintId));

      await tx
        .delete(sprintsTable)
        .where(
          and(
            eq(sprintsTable.id, sprintId),
            eq(sprintsTable.workspaceId, workspaceId)
          )
        );
    });

    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete sprint");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
