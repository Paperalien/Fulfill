import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, workspacesTable, tasksTable, sprintsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const CheckEmailBody = z.object({ email: z.string().email() });

// POST /users/check-email — public, no auth required
// Returns whether the given email already has tasks or sprints on the server.
// Used to decide whether to show a merge confirmation before sending a magic link.
router.post("/users/check-email", async (req, res) => {
  const parsed = CheckEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email))
      .limit(1);

    if (users.length === 0) {
      res.json({ hasData: false });
      return;
    }

    const workspaces = await db
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.ownerId, users[0].id))
      .limit(1);

    if (workspaces.length === 0) {
      res.json({ hasData: false });
      return;
    }

    const workspaceId = workspaces[0].id;

    const [task] = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.workspaceId, workspaceId))
      .limit(1);

    if (task) {
      res.json({ hasData: true });
      return;
    }

    const [sprint] = await db
      .select({ id: sprintsTable.id })
      .from(sprintsTable)
      .where(eq(sprintsTable.workspaceId, workspaceId))
      .limit(1);

    res.json({ hasData: !!sprint });
  } catch (err) {
    req.log.error(err, "Failed to check email data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
