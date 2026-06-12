import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import { requireAuth } from "../middlewares/auth";
import { requireWorkspaceAccess } from "../middlewares/requireWorkspaceAccess";
import workspacesRouter from "./workspaces";
import { workspaceInvitationsRouter, invitationsRouter } from "./invitations";
import migrateRouter from "./migrate";
import tasksRouter from "./tasks";
import sprintsRouter from "./sprints";
import columnsRouter from "./columns";
import sprintSnapshotsRouter from "./sprint-snapshots";

const router: IRouter = Router();

// Public routes (no auth required)
router.use(healthRouter);
router.use(usersRouter);

// All routes below require authentication
router.use(requireAuth);

// Non-scoped workspace routes (no :workspaceId in the path): ensure-personal,
// check-name, list, create — plus the self-guarded rename/leave handlers.
// NOTE: this must NOT be a `/workspaces/:workspaceId` prefix guard, because that
// greedily matches sibling literals like `/workspaces/ensure-personal`.
router.use("/workspaces", workspacesRouter);

// Workspace-scoped sub-resources: verify membership before each handler runs.
router.use("/workspaces/:workspaceId/invitations", requireWorkspaceAccess, workspaceInvitationsRouter);
router.use("/invitations", invitationsRouter);
router.use("/workspaces/:workspaceId/migrate", requireWorkspaceAccess, migrateRouter);
router.use("/workspaces/:workspaceId/tasks", requireWorkspaceAccess, tasksRouter);
router.use("/workspaces/:workspaceId/sprints", requireWorkspaceAccess, sprintsRouter);
router.use("/workspaces/:workspaceId/columns", requireWorkspaceAccess, columnsRouter);
router.use("/workspaces/:workspaceId/sprint-snapshots", requireWorkspaceAccess, sprintSnapshotsRouter);

export default router;
