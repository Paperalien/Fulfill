import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ── Static / SPA serving contract (subdomain root) ────────────────────────────
// The app is served at the ROOT of its own subdomain (e.g. https://fulfill.paperalien.com),
// not under a /fulfill prefix. This test exercises the REAL app.ts wiring:
//   1. the SPA shell is served at / and for any deep client-side route
//   2. unmatched /api/* paths return a JSON 404 — never the HTML shell
//   3. real /api routes (healthz) still take precedence over the SPA fallback

// app.ts reads FRONTEND_DIST at module load — point it at a throwaway dist dir
// with a recognizable index.html BEFORE importing app.ts.
const distDir = mkdtempSync(path.join(tmpdir(), "fulfill-dist-"));
writeFileSync(
  path.join(distDir, "index.html"),
  "<!doctype html><html><head><title>FULFILL_SPA_SHELL</title></head><body></body></html>",
);
process.env.FRONTEND_DIST = distDir;

// app.ts → routes pull in db/auth/email which touch real services at import time;
// stub them so importing the app is side-effect free (mirrors routes.integration.test.ts).
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: "stub" }, error: null })) };
  },
}));
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
vi.mock("@workspace/db", () => ({ db: {} }));

const { default: app } = await import("./app");

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

describe("app.ts — SPA served at root", () => {
  it("serves the SPA shell at /", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(await r.text()).toContain("FULFILL_SPA_SHELL");
  });

  it("serves the SPA shell for a deep client-side route", async () => {
    const r = await fetch(`${base}/workspaces/abc/board`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("FULFILL_SPA_SHELL");
  });

  it("returns a JSON 404 (not the HTML shell) for an unknown /api path", async () => {
    const r = await fetch(`${base}/api/does-not-exist`, {
      headers: { Authorization: "Bearer test-token" }, // get past requireAuth to reach the fallback
    });
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ error: "Not found" });
  });

  it("still routes real /api endpoints (healthz) ahead of the SPA fallback", async () => {
    const r = await fetch(`${base}/api/healthz`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
  });
});
