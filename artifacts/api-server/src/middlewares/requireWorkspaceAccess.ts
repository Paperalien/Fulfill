import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { workspacesTable, workspaceMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Middleware for workspace-scoped routes. Must be mounted after requireAuth.
 * Verifies the authenticated user is a member of the workspace in :workspaceId.
 * Returns 404 if the workspace does not exist, 403 if the user is not a member.
 */
export const requireWorkspaceAccess: RequestHandler = async (req, res, next) => {
  const { workspaceId } = req.params as { workspaceId?: string };
  if (!workspaceId) {
    next();
    return;
  }

  try {
    const [result] = await db
      .select({
        workspaceExists: workspacesTable.id,
        isMember: workspaceMembersTable.userId,
      })
      .from(workspacesTable)
      .leftJoin(
        workspaceMembersTable,
        and(
          eq(workspaceMembersTable.workspaceId, workspacesTable.id),
          eq(workspaceMembersTable.userId, req.user!.id)
        )
      )
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!result) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    if (!result.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  } catch (err) {
    req.log.error(err, "Failed to verify workspace access");
    res.status(500).json({ error: "Internal server error" });
  }
};
