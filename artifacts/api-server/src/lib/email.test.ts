import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Control what resend's emails.send() returns per test.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { sendInvitationEmail } from "./email";

const OPTS = {
  to: "invitee@example.com",
  inviterEmail: "owner@example.com",
  workspaceName: "QA Team",
  inviteUrl: "http://localhost:5173?invite=tok",
};

const originalKey = process.env.RESEND_API_KEY;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test_key";
});
afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

describe("sendInvitationEmail", () => {
  it("resolves when Resend reports no error", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
    await expect(sendInvitationEmail(OPTS)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("sends from the no-reply label, Reply-To the inviter, with a plaintext part", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
    await sendInvitationEmail(OPTS);

    const payload = mockSend.mock.calls[0][0];
    expect(payload.from).toBe("Fulfill <noreply@paperalien.com>");
    expect(payload.replyTo).toBe(OPTS.inviterEmail); // human inviter, not the sender
    expect(payload.text).toEqual(expect.stringContaining(OPTS.inviteUrl));
    expect(payload.text.length).toBeGreaterThan(0);
  });

  it("throws when Resend returns an error instead of swallowing it (R3)", async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: "Invalid API key" } });
    await expect(sendInvitationEmail(OPTS)).rejects.toThrow(/Invalid API key/);
  });

  it("throws a clear error when RESEND_API_KEY is unset, without attempting a send (R3)", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendInvitationEmail(OPTS)).rejects.toThrow(/RESEND_API_KEY/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
