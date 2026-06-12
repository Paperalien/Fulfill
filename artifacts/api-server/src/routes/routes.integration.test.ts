import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// ── Regression test for the route-shadowing bug (R1) ──────────────────────────
// Mounts the REAL routes/index.ts router (not handlers in isolation) so the actual
// Express mounting order is exercised. This is the test that would have caught the
// bug where `requireWorkspaceAccess` on `/workspaces/:workspaceId` shadowed the
// sibling literals `/workspaces/ensure-personal` and `/workspaces/check-name`.
//
// Contract asserted:
//   1. ensure-personal and check-name are REACHABLE (not 404'd by the member guard)
//   2. rename/leave ARE guarded → 403 for a non-member
//   3. a member passes the guard through to the rename handler (200)
//
// Only the DB connection and Supabase auth are mocked; routing, requireAuth and
// requireWorkspaceAccess run for real.

const { mockLimit, mockOrderBy, mockUpdateWhere, mockDeleteWhere, mockConflict } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockConflict: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const whereObj = { limit: mockLimit, orderBy: mockOrderBy };
  const fromObj = {
    where: () => whereObj,
    leftJoin: () => ({ where: () => ({ limit: mockLimit }) }),
    innerJoin: () => ({ where: () => ({ orderBy: mockOrderBy }) }),
  };
  return {
    db: {
      select: () => ({ from: () => fromObj }),
      insert: () => ({ values: () => ({ onConflictDoNothing: mockConflict }) }),
      update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
      delete: () => ({ where: mockDeleteWhere }),
      transaction: vi.fn(),
    },
  };
});

// email.ts does `new Resend(process.env.RESEND_API_KEY)` at import time, which throws
// when the key is absent (see R3). These tests don't send mail — stub the module.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: "stub" }, error: null })) };
  },
}));

// requireAuth validates the bearer token via supabase.auth.getUser — stub a user.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1", email: "user@example.com" } },
        error: null,
      })),
    },
  }),
}));

// Import after mocks so the router picks up the mocked db/auth.
const { default: router } = await import("./index");

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // pino-http normally attaches req.log; supply a no-op so error paths don't throw.
  app.use((req, _res, next) => {
    (req as any).log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use("/api", router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

const AUTH = { Authorization: "Bearer test-token" };

describe("routes/index.ts wiring — R1 route-shadowing regression", () => {
  it("ensure-personal is reachable (NOT shadowed by the :workspaceId member guard)", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "ws-personal" }]); // existing personal workspace
    mockConflict.mockResolvedValueOnce(undefined);

    const r = await fetch(`${base}/api/workspaces/ensure-personal`, { method: "POST", headers: AUTH });
    expect(r.status).toBe(200); // would be 404 under the shadowed wiring
    expect(await r.json()).toEqual({ workspaceId: "ws-personal" });
  });

  it("check-name is reachable (NOT shadowed)", async () => {
    mockLimit.mockResolvedValueOnce([]); // name is free

    const r = await fetch(`${base}/api/workspaces/check-name?name=Foo`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ available: true });
  });

  it("rename IS guarded → 403 for a non-member", async () => {
    // guard's leftJoin lookup: workspace exists, but user is not a member
    mockLimit.mockResolvedValueOnce([{ workspaceExists: "ws-1", isMember: null }]);

    const r = await fetch(`${base}/api/workspaces/ws-1/name`, {
      method: "PATCH",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(r.status).toBe(403);
    expect(mockUpdateWhere).not.toHaveBeenCalled(); // handler never ran
  });

  it("leave IS guarded → 403 for a non-member", async () => {
    mockLimit.mockResolvedValueOnce([{ workspaceExists: "ws-1", isMember: null }]);

    const r = await fetch(`${base}/api/workspaces/ws-1/leave`, { method: "POST", headers: AUTH });
    expect(r.status).toBe(403);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("rename passes the guard through to the handler for a member (200)", async () => {
    mockLimit
      .mockResolvedValueOnce([{ workspaceExists: "ws-1", isMember: "user-1" }]) // guard: member
      .mockResolvedValueOnce([{ isPersonal: false }]); // handler: shared workspace
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const r = await fetch(`${base}/api/workspaces/ws-1/name`, {
      method: "PATCH",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ workspaceId: "ws-1", name: "Renamed" });
    expect(mockUpdateWhere).toHaveBeenCalledOnce();
  });
});
