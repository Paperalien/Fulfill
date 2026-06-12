import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  workspacesTable,
  columnsTable,
  workspaceMembersTable,
} from "@workspace/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireWorkspaceAccess } from "../middlewares/requireWorkspaceAccess";

const router: IRouter = Router();

const WorkspaceNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(20, "Name must be 20 characters or fewer")
  .trim();

const CreateWorkspaceBody = z.object({ name: WorkspaceNameSchema });
const RenameWorkspaceBody = z.object({ name: WorkspaceNameSchema });

const DEFAULT_COLUMNS = [
  { name: "To Do", semanticStatus: "not-started", order: 0 },
  { name: "In Progress", semanticStatus: "in-progress", order: 1 },
  { name: "In Review", semanticStatus: "in-progress", order: 2 },
  { name: "Done", semanticStatus: "done", order: 3 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDuplicateNameError(err: unknown): boolean {
  return (err as any)?.code === "23505";
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /workspaces/ensure-personal
// Idempotent: find or create a personal workspace for the authenticated user.
// Also upserts the user into workspace_members for backfill safety.
// Seeds 4 default columns when creating a new workspace.
router.post("/ensure-personal", async (req, res) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(and(eq(workspacesTable.ownerId, user.id), eq(workspacesTable.isPersonal, true)))
      .limit(1);

    if (existing) {
      // Upsert membership — safety net for rows that pre-date the members table
      await db
        .insert(workspaceMembersTable)
        .values({ workspaceId: existing.id, userId: user.id })
        .onConflictDoNothing();
      res.json({ workspaceId: existing.id });
      return;
    }

    const workspaceId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(workspacesTable).values({
        id: workspaceId,
        name: "Personal",
        ownerId: user.id,
        isPersonal: true,
      });

      await tx.insert(workspaceMembersTable).values({ workspaceId, userId: user.id });

      await tx.insert(columnsTable).values(
        DEFAULT_COLUMNS.map((col) => ({
          id: crypto.randomUUID(),
          workspaceId,
          name: col.name,
          semanticStatus: col.semanticStatus,
          order: col.order,
        }))
      );
    });

    res.status(200).json({ workspaceId });
  } catch (err) {
    req.log.error(err, "Failed to ensure personal workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /workspaces
// List all workspaces the authenticated user is a member of.
// Personal workspace is always first (ordered by isPersonal DESC, then name ASC).
router.get("/", async (req, res) => {
  const user = req.user!;

  try {
    const rows = await db
      .select({
        id: workspacesTable.id,
        name: workspacesTable.name,
        isPersonal: workspacesTable.isPersonal,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int FROM workspace_members
          WHERE workspace_id = ${workspacesTable.id}
        )`,
      })
      .from(workspacesTable)
      .innerJoin(
        workspaceMembersTable,
        eq(workspaceMembersTable.workspaceId, workspacesTable.id)
      )
      .where(eq(workspaceMembersTable.userId, user.id))
      .orderBy(desc(workspacesTable.isPersonal));

    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list workspaces");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /workspaces/check-name?name=X
// Returns { available: boolean } — whether the name is free for a new shared workspace.
router.get("/check-name", async (req, res) => {
  const name = (req.query.name as string | undefined)?.trim() ?? "";

  if (!name || name.length > 20) {
    res.status(400).json({ error: "Name must be between 1 and 20 characters" });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(and(eq(workspacesTable.name, name), eq(workspacesTable.isPersonal, false)))
      .limit(1);

    res.json({ available: !existing });
  } catch (err) {
    req.log.error(err, "Failed to check workspace name");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workspaces
// Create a new shared workspace. Seeds 4 default columns.
router.post("/", async (req, res) => {
  const user = req.user!;
  const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name } = parsed.data;

  try {
    const workspaceId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(workspacesTable).values({
        id: workspaceId,
        name,
        ownerId: user.id,
        isPersonal: false,
      });

      await tx.insert(workspaceMembersTable).values({ workspaceId, userId: user.id });

      await tx.insert(columnsTable).values(
        DEFAULT_COLUMNS.map((col) => ({
          id: crypto.randomUUID(),
          workspaceId,
          name: col.name,
          semanticStatus: col.semanticStatus,
          order: col.order,
        }))
      );
    });

    res.status(201).json({ workspaceId, name });
  } catch (err) {
    if (isDuplicateNameError(err)) {
      res.status(409).json({ error: "A workspace with that name already exists" });
      return;
    }
    req.log.error(err, "Failed to create workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /workspaces/:workspaceId/name
// Rename a shared workspace. Personal workspaces cannot be renamed.
// requireWorkspaceAccess (applied here) verifies the caller is a member.
router.patch("/:workspaceId/name", requireWorkspaceAccess, async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const parsed = RenameWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name } = parsed.data;

  try {
    const [workspace] = await db
      .select({ isPersonal: workspacesTable.isPersonal })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (workspace?.isPersonal) {
      res.status(403).json({ error: "Personal workspace cannot be renamed" });
      return;
    }

    await db
      .update(workspacesTable)
      .set({ name })
      .where(eq(workspacesTable.id, workspaceId));

    res.json({ workspaceId, name });
  } catch (err) {
    if (isDuplicateNameError(err)) {
      res.status(409).json({ error: "A workspace with that name already exists" });
      return;
    }
    req.log.error(err, "Failed to rename workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workspaces/:workspaceId/leave
// Remove the authenticated user from the workspace.
// Personal workspaces cannot be left.
// requireWorkspaceAccess (applied here) verifies the caller is a member.
router.post("/:workspaceId/leave", requireWorkspaceAccess, async (req, res) => {
  const user = req.user!;
  const { workspaceId } = req.params as { workspaceId: string };

  try {
    const [workspace] = await db
      .select({ isPersonal: workspacesTable.isPersonal })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (workspace?.isPersonal) {
      res.status(403).json({ error: "Cannot leave your personal workspace" });
      return;
    }

    await db
      .delete(workspaceMembersTable)
      .where(
        and(
          eq(workspaceMembersTable.workspaceId, workspaceId),
          eq(workspaceMembersTable.userId, user.id)
        )
      );

    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to leave workspace");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
