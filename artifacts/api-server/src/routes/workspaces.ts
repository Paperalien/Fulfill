import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { workspacesTable, columnsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// POST /workspaces/ensure-personal
// Idempotent: find or create a personal workspace for the authenticated user.
// Seeds 4 default columns when creating a new workspace.
router.post("/ensure-personal", async (req, res) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Atomically find-or-create the personal workspace. The UNIQUE constraint on
    // workspaces.owner_id makes this race-safe: concurrent requests (double-tap,
    // retry, two tabs) cannot create duplicate workspaces. The losing INSERT
    // conflicts and returns nothing, so we fall back to selecting the winner's row.
    const workspaceId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(workspacesTable)
        .values({
          id: crypto.randomUUID(),
          name: "Personal",
          ownerId: user.id,
        })
        .onConflictDoNothing({ target: workspacesTable.ownerId })
        .returning({ id: workspacesTable.id });

      // A fresh workspace was created — seed its default columns.
      if (inserted.length > 0) {
        const newId = inserted[0].id;

        const defaultColumns = [
          { name: "To Do", semanticStatus: "not-started", order: 0 },
          { name: "In Progress", semanticStatus: "in-progress", order: 1 },
          { name: "In Review", semanticStatus: "in-progress", order: 2 },
          { name: "Done", semanticStatus: "done", order: 3 },
        ] as const;

        await tx.insert(columnsTable).values(
          defaultColumns.map((col) => ({
            id: crypto.randomUUID(),
            workspaceId: newId,
            name: col.name,
            semanticStatus: col.semanticStatus,
            order: col.order,
          }))
        );

        return newId;
      }

      // Workspace already existed (returning user or a concurrent request that
      // won the insert) — fetch and return it.
      const [existing] = await tx
        .select({ id: workspacesTable.id })
        .from(workspacesTable)
        .where(eq(workspacesTable.ownerId, user.id))
        .limit(1);

      if (!existing) {
        throw new Error("Workspace not found after insert conflict");
      }
      return existing.id;
    });

    res.status(200).json({ workspaceId });
  } catch (err) {
    req.log.error(err, "Failed to ensure personal workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
