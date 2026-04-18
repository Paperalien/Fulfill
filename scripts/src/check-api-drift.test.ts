import { describe, it, expect } from "vitest";
import {
  parseSpecEndpoints,
  parseRouterFile,
  parseRouteMounts,
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
    // Should not include anything from 'components' section
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
  it("extracts all routes with prefix", () => {
    const endpoints = parseRouterFile(SAMPLE_ROUTER, "/workspaces/:workspaceId/tasks");
    expect(endpoints).toHaveLength(5);
  });

  it('resolves "/" to just the prefix', () => {
    const endpoints = parseRouterFile(SAMPLE_ROUTER, "/workspaces/:workspaceId/tasks");
    expect(endpoints).toContainEqual({ method: "GET", path: "/workspaces/:workspaceId/tasks" });
    expect(endpoints).toContainEqual({ method: "POST", path: "/workspaces/:workspaceId/tasks" });
  });

  it("appends sub-paths to the prefix", () => {
    const endpoints = parseRouterFile(SAMPLE_ROUTER, "/workspaces/:workspaceId/tasks");
    expect(endpoints).toContainEqual({ method: "PATCH", path: "/workspaces/:workspaceId/tasks/:taskId" });
    expect(endpoints).toContainEqual({ method: "DELETE", path: "/workspaces/:workspaceId/tasks/:taskId" });
    expect(endpoints).toContainEqual({ method: "DELETE", path: "/workspaces/:workspaceId/tasks/:taskId/permanent" });
  });

  it("works with an empty prefix", () => {
    const simple = `router.get("/healthz", handler);`;
    const endpoints = parseRouterFile(simple, "");
    expect(endpoints).toContainEqual({ method: "GET", path: "/healthz" });
  });
});

// ── parseRouteMounts ──────────────────────────────────────────────────────────

const SAMPLE_INDEX = `
import healthRouter from "./health";
import usersRouter from "./users";
import workspacesRouter from "./workspaces";
import tasksRouter from "./tasks";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(healthRouter);
router.use(usersRouter);
router.use(requireAuth);
router.use("/workspaces", workspacesRouter);
router.use("/workspaces/:workspaceId/tasks", tasksRouter);

export default router;
`;

describe("parseRouteMounts", () => {
  it("maps routers with explicit prefix", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.get("workspaces")).toBe("/workspaces");
    expect(mounts.get("tasks")).toBe("/workspaces/:workspaceId/tasks");
  });

  it("maps routers without prefix as empty string", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.get("health")).toBe("");
    expect(mounts.get("users")).toBe("");
  });

  it("does not include middleware functions", () => {
    const mounts = parseRouteMounts(SAMPLE_INDEX);
    expect(mounts.has("requireAuth")).toBe(false);
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
