import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const {
  mockLimit,
  mockOrderBy,
  mockUpdateWhere,
  mockDeleteWhere,
  mockConflictDoNothing,
  mockTransaction,
} = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockConflictDoNothing: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        // Used by GET / (list) via innerJoin
        innerJoin: () => ({
          where: () => ({
            orderBy: mockOrderBy,
          }),
        }),
        // Used by single-row selects via .where().limit()
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: mockConflictDoNothing,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdateWhere,
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
    transaction: mockTransaction,
  },
}));

vi.mock("@workspace/db/schema", () => ({
  workspacesTable: {},
  columnsTable: {},
  workspaceMembersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import router from "./workspaces";

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { id: "user-1", email: "user@example.com" };

function makeReq(overrides: {
  user?: typeof USER | null;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  params?: Record<string, string>;
} = {}) {
  return {
    user: overrides.user === undefined ? USER : overrides.user,
    body: overrides.body ?? {},
    query: overrides.query ?? {},
    params: overrides.params ?? {},
    log: { error: vi.fn() },
  };
}

function makeRes() {
  const res = {} as { status: any; json: any; send: any };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function getHandler(path: string, method = "post") {
  const stack = (router as any).stack as any[];
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  return layer?.route?.stack?.[0]?.handle as Function;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /workspaces/ensure-personal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = { insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }) };
      return cb(tx);
    });
  });

  it("returns 401 when no user on request", async () => {
    const handler = getHandler("/ensure-personal");
    const res = makeRes();
    await handler(makeReq({ user: null }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns existing workspaceId and upserts member when workspace already exists", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "ws-existing" }]);
    mockConflictDoNothing.mockResolvedValueOnce(undefined);

    const handler = getHandler("/ensure-personal");
    const res = makeRes();
    await handler(makeReq(), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ workspaceId: "ws-existing" });
    expect(mockConflictDoNothing).toHaveBeenCalledOnce();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates new workspace via transaction when none exists", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const handler = getHandler("/ensure-personal");
    const res = makeRes();
    await handler(makeReq(), res, vi.fn());

    expect(mockTransaction).toHaveBeenCalledOnce();
    const { workspaceId } = res.json.mock.calls[0][0];
    expect(workspaceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 500 on database error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq();
    const res = makeRes();
    await getHandler("/ensure-personal")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});

describe("GET /workspaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the list of workspaces the user is a member of", async () => {
    const workspaces = [
      { id: "ws-personal", name: "Personal", isPersonal: true, memberCount: 1 },
      { id: "ws-team", name: "Team Alpha", isPersonal: false, memberCount: 3 },
    ];
    mockOrderBy.mockResolvedValueOnce(workspaces);

    const handler = getHandler("/", "get");
    const res = makeRes();
    await handler(makeReq(), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(workspaces);
  });

  it("returns 500 on database error", async () => {
    mockOrderBy.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq();
    const res = makeRes();
    await getHandler("/", "get")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});

describe("GET /workspaces/check-name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns available:true when name is not taken", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const handler = getHandler("/check-name", "get");
    const res = makeRes();
    await handler(makeReq({ query: { name: "New Team" } }), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ available: true });
  });

  it("returns available:false when name is already in use", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "ws-taken" }]);

    const handler = getHandler("/check-name", "get");
    const res = makeRes();
    await handler(makeReq({ query: { name: "Taken Name" } }), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ available: false });
  });

  it("returns 400 when name is missing", async () => {
    const handler = getHandler("/check-name", "get");
    const res = makeRes();
    await handler(makeReq({ query: {} }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when name exceeds 20 characters", async () => {
    const handler = getHandler("/check-name", "get");
    const res = makeRes();
    await handler(makeReq({ query: { name: "a".repeat(21) } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("POST /workspaces (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = { insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }) };
      return cb(tx);
    });
  });

  it("creates workspace and returns 201 with workspaceId and name", async () => {
    const handler = getHandler("/", "post");
    const res = makeRes();
    await handler(makeReq({ body: { name: "Team Alpha" } }), res, vi.fn());

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.name).toBe("Team Alpha");
    expect(body.workspaceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 400 when name is missing", async () => {
    const handler = getHandler("/", "post");
    const res = makeRes();
    await handler(makeReq({ body: {} }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when name exceeds 20 characters", async () => {
    const handler = getHandler("/", "post");
    const res = makeRes();
    await handler(makeReq({ body: { name: "a".repeat(21) } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 on duplicate name", async () => {
    mockTransaction.mockRejectedValueOnce({ code: "23505" });

    const handler = getHandler("/", "post");
    const res = makeRes();
    await handler(makeReq({ body: { name: "Taken" } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "A workspace with that name already exists" });
  });

  it("returns 500 on other database errors", async () => {
    mockTransaction.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq({ body: { name: "Valid" } });
    const res = makeRes();
    await getHandler("/", "post")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});

describe("PATCH /workspaces/:workspaceId/name (rename)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renames a shared workspace and returns updated name", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: false }]);
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const handler = getHandler("/:workspaceId/name", "patch");
    const res = makeRes();
    await handler(
      makeReq({ body: { name: "Renamed Team" }, params: { workspaceId: "ws-1" } }),
      res,
      vi.fn()
    );

    expect(mockUpdateWhere).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ workspaceId: "ws-1", name: "Renamed Team" });
  });

  it("returns 403 when trying to rename a personal workspace", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: true }]);

    const handler = getHandler("/:workspaceId/name", "patch");
    const res = makeRes();
    await handler(
      makeReq({ body: { name: "New Name" }, params: { workspaceId: "ws-personal" } }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty", async () => {
    const handler = getHandler("/:workspaceId/name", "patch");
    const res = makeRes();
    await handler(makeReq({ body: { name: "" }, params: { workspaceId: "ws-1" } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 on duplicate name", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: false }]);
    mockUpdateWhere.mockRejectedValueOnce({ code: "23505" });

    const handler = getHandler("/:workspaceId/name", "patch");
    const res = makeRes();
    await handler(
      makeReq({ body: { name: "Taken" }, params: { workspaceId: "ws-1" } }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("POST /workspaces/:workspaceId/leave", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the user from the workspace and returns 204", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: false }]);
    mockDeleteWhere.mockResolvedValueOnce(undefined);

    const handler = getHandler("/:workspaceId/leave");
    const res = makeRes();
    await handler(makeReq({ params: { workspaceId: "ws-1" } }), res, vi.fn());

    expect(mockDeleteWhere).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it("returns 403 when trying to leave a personal workspace", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: true }]);

    const handler = getHandler("/:workspaceId/leave");
    const res = makeRes();
    await handler(makeReq({ params: { workspaceId: "ws-personal" } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq({ params: { workspaceId: "ws-1" } });
    const res = makeRes();
    await getHandler("/:workspaceId/leave")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});
