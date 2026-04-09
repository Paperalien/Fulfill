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
    // Look for an existing workspace owned by this user
    const existing = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.ownerId, user.id))
      .limit(1);

    if (existing.length > 0) {
      res.json({ workspaceId: existing[0].id });
      return;
    }

    // Create a new personal workspace and seed default columns
    const workspaceId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(workspacesTable).values({
        id: workspaceId,
        name: "Personal",
        ownerId: user.id,
      });

      const defaultColumns = [
        { name: "To Do", semanticStatus: "not-started", order: 0 },
        { name: "In Progress", semanticStatus: "in-progress", order: 1 },
        { name: "In Review", semanticStatus: "in-progress", order: 2 },
        { name: "Done", semanticStatus: "done", order: 3 },
      ] as const;

      await tx.insert(columnsTable).values(
        defaultColumns.map((col) => ({
          id: crypto.randomUUID(),
          workspaceId,
          name: col.name,
          semanticStatus: col.semanticStatus,
          order: col.order,
        }))
      );
    });

    res.status(201).json({ workspaceId });
  } catch (err) {
    req.log.error(err, "Failed to ensure personal workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
