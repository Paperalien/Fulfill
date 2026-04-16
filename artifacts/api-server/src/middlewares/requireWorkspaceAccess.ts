import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { workspacesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware for workspace-scoped routes. Must be mounted after requireAuth.
 * Verifies the authenticated user owns the workspace in :workspaceId.
 * Returns 404 if the workspace does not exist, 403 if the user is not the owner.
 */
export const requireWorkspaceAccess: RequestHandler = async (req, res, next) => {
  const { workspaceId } = req.params as { workspaceId?: string };
  if (!workspaceId) {
    next();
    return;
  }

  try {
    const [workspace] = await db
      .select({ ownerId: workspacesTable.ownerId })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId));

    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    if (workspace.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  } catch (err) {
    req.log.error(err, "Failed to verify workspace access");
    res.status(500).json({ error: "Internal server error" });
  }
};
