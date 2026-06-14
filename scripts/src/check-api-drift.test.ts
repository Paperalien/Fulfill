import { describe, it, expect } from "vitest";
import {
  parseSpecEndpoints,
  parseRouterFile,
  parseRouteMounts,
  parseImports,
  collectImplEndpoints,
  diffEndpoints,
  normalizePathParams,
  type Endpoint,
} from "./check-api-drift";

// ── normalizePathParams ───────────────────────────────────────────────────────

describe("normalizePathParams", () => {
  it("converts {param} to :param", () => {
    expect(normalizePathParams("/workspaces/{workspaceId}/tasks")).toBe(
      "/workspaces/:workspaceId/tasks"
    );
  });

  it("converts multiple params", () => {
    expect(normalizePathParams("/workspaces/{workspaceId}/tasks/{taskId}")).toBe(
      "/workspaces/:workspaceId/tasks/:taskId"
    );
  });

  it("leaves paths without params unchanged", () => {
    expect(normalizePathParams("/healthz")).toBe("/healthz");
  });
});

// ── parseSpecEndpoints ────────────────────────────────────────────────────────

const SAMPLE_YAML = `
openapi: 3.1.0
info:
  title: Api
paths:
  /healthz:
    get:
      operationId: healthCheck
      summary: Health check
  /users/check-email:
    post:
      operationId: checkEmail
  /workspaces/{workspaceId}/tasks:
    get:
      operationId: getTasks
    post:
      operationId: createTask
  /workspaces/{workspaceId}/tasks/{taskId}:
    patch:
      operationId: updateTask
    delete:
      operationId: deleteTask
components:
  schemas:
    Task:
      type: object
`;

describe("parseSpecEndpoints", () => {
  it("extracts all methods and paths", () => {
    const endpoints = parseSpecEndpoints(SAMPLE_YAML);
    expect(endpoints).toHaveLength(6);
  });

  it("normalizes path params from {x} to :x", () => {
    const endpoints = parseSpecEndpoints(SAMPLE_YAML);
    const taskEndpoints = endpoints.filter((e) => e.path.includes("workspaceId"));
    expect(taskEndpoints.every((e) => e.path.includes(":workspaceId"))).toBe(true);
  });

  it("uppercases method names", () => {
    const endpoints = parseSpecEndpoints(SAMPLE_YAML);
    expect(endpoints.every((e) => e.method === e.method.toUpperCase())).toBe(true);
  });

  it("stops parsing after the paths section ends", () => {
    const endpoints = parseSpecEndpoints(SAMPLE_YAML);
    expect(endpoints.find((e) => e.path === "Task")).toBeUndefined();
  });

  it("includes correct methods", () => {
    const endpoints = parseSpecEndpoints(SAMPLE_YAML);
    expect(endpoints).toContainEqual({ method: "GET", path: "/healthz" });
    expect(endpoints).toContainEqual({ method: "POST", path: "/users/check-email" });
    expect(endpoints).toContainEqual({ method: "GET", path: "/workspaces/:workspaceId/tasks" });
    expect(endpoints).toContainEqual({ method: "POST", path: "/workspaces/:workspaceId/tasks" });
    expect(endpoints).toContainEqual({ method: "PATCH", path: "/workspaces/:workspaceId/tasks/:taskId" });
    expect(endpoints).toContainEqual({ method: "DELETE", path: "/workspaces/:workspaceId/tasks/:taskId" });
  });
});

// ── parseRouterFile ───────────────────────────────────────────────────────────

const SAMPLE_ROUTER = `
import { Router } from "express";
const router = Router({ mergeParams: true });

router.get("/", async (req, res) => { res.json([]); });
router.post("/", async (req, res) => { res.status(201).json({}); });
router.patch("/:taskId", async (req, res) => { res.json({}); });
router.delete("/:taskId", async (req, res) => { res.status(204).send(); });
router.delete("/:taskId/permanent", async (req, res) => { res.status(204).send(); });

export default router;
`;

describe("parseRouterFile", () => {
  const prefixed = new Map([["router", "/workspaces/:workspaceId/tasks"]]);

  it("extracts all routes with prefix", () => {
    expect(parseRouterFile(SAMPLE_ROUTER, prefixed)).toHaveLength(5);
  });

  it('resolves "/" to just the prefix', () => {
    const endpoints = parseRouterFile(SAMPLE_ROUTER, prefixed);
    expect(endpoints).toContainEqual({ method: "GET", path: "/workspaces/:workspaceId/tasks" });
    expect(endpoints).toContainEqual({ method: "POST", path: "/workspaces/:workspaceId/tasks" });
  });

  it("appends sub-paths to the prefix", () => {
    const endpoints = parseRouterFile(SAMPLE_ROUTER, prefixed);
    expect(endpoints).toContainEqual({ method: "PATCH", path: "/workspaces/:workspaceId/tasks/:taskId" });
    expect(endpoints).toContainEqual({ method: "DELETE", path: "/workspaces/:workspaceId/tasks/:taskId" });
    expect(endpoints).toContainEqual({ method: "DELETE", path: "/workspaces/:workspaceId/tasks/:taskId/permanent" });
  });

  it("works with an empty prefix", () => {
    const endpoints = parseRouterFile(`router.get("/healthz", handler);`, new Map([["router", ""]]));
    expect(endpoints).toContainEqual({ method: "GET", path: "/healthz" });
  });

  it("ignores route calls on variables that are not mounted routers", () => {
    const src = `router.get("/", h); somethingElse.post("/nope", h);`;
    const endpoints = parseRouterFile(src, new Map([["router", "/x"]]));
    expect(endpoints).toEqual([{ method: "GET", path: "/x" }]);
  });

  it("attributes routes to the correct variable when a file has several routers", () => {
    const src = `
      wsInvRouter.post("/", h);
      invRouter.post("/:token/accept", h);
    `;
    const endpoints = parseRouterFile(
      src,
      new Map([
        ["wsInvRouter", "/workspaces/:workspaceId/invitations"],
        ["invRouter", "/invitations"],
      ]),
    );
    expect(endpoints).toContainEqual({ method: "POST", path: "/workspaces/:workspaceId/invitations" });
    expect(endpoints).toContainEqual({ method: "POST", path: "/invitations/:token/accept" });
  });
});

// ── parseRouteMounts ──────────────────────────────────────────────────────────

const SAMPLE_INDEX = `
import healthRouter from "./health";
import usersRouter from "./users";
import workspacesRouter from "./workspaces";
import tasksRouter from "./tasks";
import { workspaceInvitationsRouter, invitationsRouter } from "./invitations";
import { requireAuth } from "../middlewares/auth";
import { requireWorkspaceAccess } from "../middlewares/requireWorkspaceAccess";

const router = Router();
router.use(healthRouter);
router.use(usersRouter);
router.use(requireAuth);
router.use("/workspaces", workspacesRouter);
router.use("/workspaces/:workspaceId/tasks", requireWorkspaceAccess, tasksRouter);
router.use("/workspaces/:workspaceId/invitations", requireWorkspaceAccess, workspaceInvitationsRouter);
router.use("/invitations", invitationsRouter);

export default router;
`;

describe("parseRouteMounts", () => {
  it("maps routers with explicit prefix (keyed by variable)", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.get("workspacesRouter")).toBe("/workspaces");
  });

  it("resolves the mounted router past inline middleware", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.get("tasksRouter")).toBe("/workspaces/:workspaceId/tasks");
    expect(mounts.get("workspaceInvitationsRouter")).toBe("/workspaces/:workspaceId/invitations");
    expect(mounts.get("invitationsRouter")).toBe("/invitations");
  });

  it("maps routers without prefix as empty string", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.get("healthRouter")).toBe("");
    expect(mounts.get("usersRouter")).toBe("");
  });

  it("does not include middleware functions", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.has("requireAuth")).toBe(false);
    expect(mounts.has("requireWorkspaceAccess")).toBe(false);
  });
});

// ── parseImports ──────────────────────────────────────────────────────────────

describe("parseImports", () => {
  it("resolves default imports", () => {
    const imports = parseImports(SAMPLE_INDEX);
    expect(imports.get("healthRouter")).toEqual({ file: "health", named: false });
    expect(imports.get("tasksRouter")).toEqual({ file: "tasks", named: false });
  });

  it("resolves named imports (multiple from one file)", () => {
    const imports = parseImports(SAMPLE_INDEX);
    expect(imports.get("workspaceInvitationsRouter")).toEqual({ file: "invitations", named: true });
    expect(imports.get("invitationsRouter")).toEqual({ file: "invitations", named: true });
  });
});

// ── collectImplEndpoints ──────────────────────────────────────────────────────

describe("collectImplEndpoints", () => {
  it("resolves a default-export router mounted with inline middleware", () => {
    const index = `
import tasksRouter from "./tasks";
const router = Router();
router.use("/workspaces/:workspaceId/tasks", requireWorkspaceAccess, tasksRouter);
`;
    const tasksSrc = `
const router = Router();
router.get("/", h);
router.patch("/:taskId", h);
export default router;
`;
    const impl = collectImplEndpoints(index, () => tasksSrc, ["tasks.ts"]);
    expect(impl).toContainEqual({ method: "GET", path: "/workspaces/:workspaceId/tasks" });
    expect(impl).toContainEqual({ method: "PATCH", path: "/workspaces/:workspaceId/tasks/:taskId" });
  });

  it("resolves two named-export routers from one file at different prefixes", () => {
    const index = `
import { workspaceInvitationsRouter, invitationsRouter } from "./invitations";
const router = Router();
router.use("/workspaces/:workspaceId/invitations", requireWorkspaceAccess, workspaceInvitationsRouter);
router.use("/invitations", invitationsRouter);
`;
    const invSrc = `
export const workspaceInvitationsRouter = Router({ mergeParams: true });
workspaceInvitationsRouter.post("/", h);
export const invitationsRouter = Router();
invitationsRouter.post("/:token/accept", h);
`;
    const impl = collectImplEndpoints(index, () => invSrc, ["invitations.ts"]);
    expect(impl).toContainEqual({ method: "POST", path: "/workspaces/:workspaceId/invitations" });
    expect(impl).toContainEqual({ method: "POST", path: "/invitations/:token/accept" });
  });
});

// ── diffEndpoints ─────────────────────────────────────────────────────────────

describe("diffEndpoints", () => {
  const spec: Endpoint[] = [
    { method: "GET", path: "/tasks" },
    { method: "POST", path: "/tasks" },
    { method: "DELETE", path: "/tasks/:id" },
  ];

  const impl: Endpoint[] = [
    { method: "GET", path: "/tasks" },
    { method: "POST", path: "/tasks" },
    { method: "PATCH", path: "/tasks/:id" }, // extra
  ];

  it("identifies matched endpoints", () => {
    const { matched } = diffEndpoints(spec, impl);
    expect(matched).toHaveLength(2);
    expect(matched).toContainEqual({ method: "GET", path: "/tasks" });
    expect(matched).toContainEqual({ method: "POST", path: "/tasks" });
  });

  it("identifies missing endpoints (in spec, not implemented)", () => {
    const { missing } = diffEndpoints(spec, impl);
    expect(missing).toHaveLength(1);
    expect(missing).toContainEqual({ method: "DELETE", path: "/tasks/:id" });
  });

  it("identifies extra endpoints (implemented but not in spec)", () => {
    const { extra } = diffEndpoints(spec, impl);
    expect(extra).toHaveLength(1);
    expect(extra).toContainEqual({ method: "PATCH", path: "/tasks/:id" });
  });

  it("returns empty arrays when everything matches", () => {
    const { matched, missing, extra } = diffEndpoints(spec, spec);
    expect(matched).toHaveLength(3);
    expect(missing).toHaveLength(0);
    expect(extra).toHaveLength(0);
  });
});
