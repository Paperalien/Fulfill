import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const {
  mockLimit,
  mockInsertValues,
  mockOnConflictDoNothing,
  mockUpdateWhere,
  mockTransaction,
  mockSendInvitationEmail,
} = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoNothing: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockTransaction: vi.fn(),
  mockSendInvitationEmail: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
    update: () => ({
      set: () => ({
        where: mockUpdateWhere,
      }),
    }),
    transaction: mockTransaction,
  },
}));

vi.mock("@workspace/db/schema", () => ({
  workspacesTable: {},
  workspaceMembersTable: {},
  workspaceInvitationsTable: {},
  usersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("../lib/email", () => ({
  sendInvitationEmail: mockSendInvitationEmail,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { workspaceInvitationsRouter, invitationsRouter } from "./invitations";

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { id: "user-1", email: "alice@example.com" };

function makeReq(overrides: {
  user?: typeof USER | null;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) {
  return {
    user: overrides.user === undefined ? USER : overrides.user,
    body: overrides.body ?? {},
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

function getHandler(router: any, path: string, method = "post") {
  const stack = router.stack as any[];
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  return layer?.route?.stack?.[0]?.handle as Function;
}

// ── POST /workspaces/:workspaceId/invitations ─────────────────────────────────

describe("POST /workspaces/:workspaceId/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue(undefined);
    mockSendInvitationEmail.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        insert: () => ({ values: () => ({ onConflictDoNothing: mockOnConflictDoNothing }) }),
        update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
      };
      return cb(tx);
    });
  });

  it("creates invitation and sends email for a shared workspace", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: false, name: "Team Alpha" }]);

    const handler = getHandler(workspaceInvitationsRouter, "/");
    const res = makeRes();
    await handler(
      makeReq({ body: { email: "bob@example.com" }, params: { workspaceId: "ws-1" } }),
      res,
      vi.fn()
    );

    expect(mockInsertValues).toHaveBeenCalledOnce();
    expect(mockSendInvitationEmail).toHaveBeenCalledOnce();
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
        inviterEmail: "alice@example.com",
        workspaceName: "Team Alpha",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.inviteeEmail).toBe("bob@example.com");
    expect(body.id).toBeDefined();
    expect(body.expiresAt).toBeInstanceOf(Date);
  });

  it("returns 403 when inviting to a personal workspace", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: true, name: "Personal" }]);

    const handler = getHandler(workspaceInvitationsRouter, "/");
    const res = makeRes();
    await handler(
      makeReq({ body: { email: "bob@example.com" }, params: { workspaceId: "ws-personal" } }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when email is invalid", async () => {
    const handler = getHandler(workspaceInvitationsRouter, "/");
    const res = makeRes();
    await handler(
      makeReq({ body: { email: "not-an-email" }, params: { workspaceId: "ws-1" } }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const handler = getHandler(workspaceInvitationsRouter, "/");
    const res = makeRes();
    await handler(
      makeReq({ body: {}, params: { workspaceId: "ws-1" } }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 on database error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq({ body: { email: "bob@example.com" }, params: { workspaceId: "ws-1" } });
    const res = makeRes();
    await getHandler(workspaceInvitationsRouter, "/")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });

  it("returns 500 when email sending fails", async () => {
    mockLimit.mockResolvedValueOnce([{ isPersonal: false, name: "Team Alpha" }]);
    mockInsertValues.mockResolvedValueOnce(undefined);
    mockSendInvitationEmail.mockRejectedValueOnce(new Error("resend down"));

    const req = makeReq({ body: { email: "bob@example.com" }, params: { workspaceId: "ws-1" } });
    const res = makeRes();
    await getHandler(workspaceInvitationsRouter, "/")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});

// ── POST /invitations/:token/accept ───────────────────────────────────────────

describe("POST /invitations/:token/accept", () => {
  const VALID_INVITATION = {
    id: "inv-1",
    workspaceId: "ws-1",
    inviterId: "user-inviter",
    inviteeEmail: "bob@example.com",
    token: "valid-token",
    used: false,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
    createdAt: new Date(),
    acceptedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        insert: () => ({ values: () => ({ onConflictDoNothing: mockOnConflictDoNothing }) }),
        update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
      };
      return cb(tx);
    });
  });

  it("accepts a valid invitation and returns workspaceId", async () => {
    mockLimit.mockResolvedValueOnce([VALID_INVITATION]);

    const handler = getHandler(invitationsRouter, "/:token/accept");
    const res = makeRes();
    await handler(makeReq({ params: { token: "valid-token" } }), res, vi.fn());

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockOnConflictDoNothing).toHaveBeenCalledOnce();
    expect(mockUpdateWhere).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ workspaceId: "ws-1" });
  });

  it("returns 404 when token is not found", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const handler = getHandler(invitationsRouter, "/:token/accept");
    const res = makeRes();
    await handler(makeReq({ params: { token: "bad-token" } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 410 when invitation is already used", async () => {
    mockLimit.mockResolvedValueOnce([{ ...VALID_INVITATION, used: true }]);

    const handler = getHandler(invitationsRouter, "/:token/accept");
    const res = makeRes();
    await handler(makeReq({ params: { token: "valid-token" } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(410);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 410 when invitation has expired", async () => {
    mockLimit.mockResolvedValueOnce([
      { ...VALID_INVITATION, expiresAt: new Date(Date.now() - 1000) },
    ]);

    const handler = getHandler(invitationsRouter, "/:token/accept");
    const res = makeRes();
    await handler(makeReq({ params: { token: "valid-token" } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(410);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/expired/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq({ params: { token: "valid-token" } });
    const res = makeRes();
    await getHandler(invitationsRouter, "/:token/accept")(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(req.log.error).toHaveBeenCalled();
  });
});
