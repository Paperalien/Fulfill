import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import { requireAuth } from "../middlewares/auth";
import { requireWorkspaceAccess } from "../middlewares/requireWorkspaceAccess";
import workspacesRouter from "./workspaces";
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

// Verify the authenticated user owns :workspaceId before any workspace-scoped handler runs
router.use("/workspaces/:workspaceId", requireWorkspaceAccess);

router.use("/workspaces", workspacesRouter);
router.use("/workspaces/:workspaceId/migrate", migrateRouter);
router.use("/workspaces/:workspaceId/tasks", tasksRouter);
router.use("/workspaces/:workspaceId/sprints", sprintsRouter);
router.use("/workspaces/:workspaceId/columns", columnsRouter);
router.use("/workspaces/:workspaceId/sprint-snapshots", sprintSnapshotsRouter);

export default router;
