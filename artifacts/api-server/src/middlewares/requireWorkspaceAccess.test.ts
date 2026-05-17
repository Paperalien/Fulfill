import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockLimit } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: mockLimit,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  workspacesTable: { id: "id" },
  workspaceMembersTable: { workspaceId: "workspace_id", userId: "user_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { requireWorkspaceAccess } from "./requireWorkspaceAccess";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string>, userId = "user-1") {
  return {
    params,
    user: { id: userId, email: "user@example.com" },
    log: { error: vi.fn() },
  };
}

function makeRes() {
  const res = {} as { status: any; json: any };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("requireWorkspaceAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls next() when the user is a workspace member", async () => {
    mockLimit.mockResolvedValueOnce([{ workspaceExists: "ws-1", isMember: "user-1" }]);
    const req = makeReq({ workspaceId: "ws-1" }, "user-1");
    const res = makeRes();
    const next = vi.fn();

    await requireWorkspaceAccess(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when the workspace does not exist", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const req = makeReq({ workspaceId: "no-such-ws" });
    const res = makeRes();

    await requireWorkspaceAccess(req as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Workspace not found" });
  });

  it("returns 403 when the user is not a member of the workspace", async () => {
    mockLimit.mockResolvedValueOnce([{ workspaceExists: "ws-1", isMember: null }]);
    const req = makeReq({ workspaceId: "ws-1" }, "intruder");
    const res = makeRes();

    await requireWorkspaceAccess(req as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  it("calls next() without querying when :workspaceId param is absent", async () => {
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    await requireWorkspaceAccess(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("returns 500 and logs on database error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("connection reset"));
    const req = makeReq({ workspaceId: "ws-1" });
    const res = makeRes();

    await requireWorkspaceAccess(req as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    expect(req.log.error).toHaveBeenCalled();
  });
});
