import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockReturning = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: mockReturning,
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  tasksTable: {
    deletedAt: "deleted_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  isNotNull: vi.fn((col) => ({ isNotNull: col })),
  lt: vi.fn((col, val) => ({ lt: col, val })),
  and: vi.fn((...args) => ({ and: args })),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { trashCutoffDate, purgeExpiredTrash } from "./trashPurge";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("trashCutoffDate", () => {
  it("returns a date 30 days in the past by default", () => {
    const before = new Date();
    const cutoff = trashCutoffDate();
    const after = new Date();

    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    // Allow 1 second of clock drift in the test
    expect(before.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(after.getTime() - cutoff.getTime()).toBeLessThanOrEqual(expectedMs + 1000);
  });

  it("respects a custom retentionDays value", () => {
    const cutoff7 = trashCutoffDate(7);
    const cutoff90 = trashCutoffDate(90);

    // Compute expected values the same way the function does to neutralise DST
    const expected7 = new Date();
    expected7.setDate(expected7.getDate() - 7);
    const expected90 = new Date();
    expected90.setDate(expected90.getDate() - 90);

    expect(Math.abs(cutoff7.getTime() - expected7.getTime())).toBeLessThan(1000);
    expect(Math.abs(cutoff90.getTime() - expected90.getTime())).toBeLessThan(1000);
  });
});

describe("purgeExpiredTrash", () => {
  beforeEach(() => {
    mockReturning.mockReset();
  });

  it("returns the count of purged tasks", async () => {
    mockReturning.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const result = await purgeExpiredTrash();
    expect(result.purgedCount).toBe(3);
  });

  it("returns 0 when no tasks are eligible", async () => {
    mockReturning.mockResolvedValue([]);
    const result = await purgeExpiredTrash();
    expect(result.purgedCount).toBe(0);
  });

  it("throws when the db call fails", async () => {
    mockReturning.mockRejectedValue(new Error("db error"));
    await expect(purgeExpiredTrash()).rejects.toThrow("db error");
  });
});
