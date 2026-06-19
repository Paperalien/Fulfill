// One-command durable runner for the authed sign-in e2e flow.
//
//   pnpm e2e:signin            (from repo root)
//   node tests/e2e/run.mjs
//
// It self-heals the local environment, starts the servers if they aren't up,
// then: mint cloud user → seed local DB → drive Chrome → unseed → delete cloud
// user → stop any servers it started. Cleanup always runs, even on failure.
//
// Self-contained: depends only on scripts present on this branch
// (artifacts/api-server/scripts/e2e-{mint,delete}-user.mjs + the tests/e2e/*
// helpers). It does NOT use lib/db/scripts/* (separate db-maintenance branch).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync, spawn, execSync } from "node:child_process";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(REPO, "tests/e2e/.e2e-out");
const SESSION_FILE = path.join(REPO, "artifacts/api-server/.e2e-session.json");
fs.mkdirSync(OUT, { recursive: true });

function parseEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const apiEnv = parseEnv(path.join(REPO, "artifacts/api-server/.env"));
const node = process.execPath;
const run = (script, args = [], env = {}) =>
  execFileSync(node, [path.join(REPO, script), ...args], { stdio: "inherit", env: { ...process.env, ...env } });

function httpUp(url) {
  return new Promise((res) => {
    const req = http.get(url, (r) => { r.resume(); res(true); });
    req.on("error", () => res(false));
    req.setTimeout(1500, () => { req.destroy(); res(false); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(url, tries = 60) {
  for (let i = 0; i < tries; i++) { if (await httpUp(url)) return true; await sleep(1000); }
  return false;
}

// ── ensure-env: macOS/native tailwind-oxide binding (Linux node_modules misses it) ──
function ensureOxide() {
  const req = createRequire(`${REPO}/`);
  const oxideDir = fs.readdirSync(path.join(REPO, "node_modules/.pnpm")).find((d) => /^@tailwindcss\+oxide@/.test(d));
  if (!oxideDir) return; // tailwind not installed here; nothing to do
  const version = oxideDir.split("@").pop();
  const oxideEntry = path.join(REPO, "node_modules/.pnpm", oxideDir, "node_modules/@tailwindcss/oxide/index.js");
  try { req(oxideEntry); return; } catch { /* needs the platform binding */ }

  const platformPkg = {
    "darwin-arm64": "darwin-arm64", "darwin-x64": "darwin-x64",
    "linux-x64": "linux-x64-gnu", "linux-arm64": "linux-arm64-gnu",
    "win32-x64": "win32-x64-msvc",
  }[`${process.platform}-${process.arch}`];
  if (!platformPkg) throw new Error(`No oxide binding mapping for ${process.platform}-${process.arch}`);
  const pkg = `@tailwindcss/oxide-${platformPkg}`;
  console.log(`[ensure-env] fetching native binding ${pkg}@${version}…`);
  const work = path.join(OUT, "oxide-fetch");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  execSync(`npm pack ${pkg}@${version}`, { cwd: work, stdio: "inherit" });
  const tgz = fs.readdirSync(work).find((f) => f.endsWith(".tgz"));
  execSync(`tar xzf ${tgz}`, { cwd: work });
  const dest = path.join(REPO, "node_modules/.pnpm", `@tailwindcss+oxide-${platformPkg}@${version}`, "node_modules/@tailwindcss", `oxide-${platformPkg}`);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(work, "package"), dest, { recursive: true });
  const link = path.join(REPO, "node_modules/.pnpm", oxideDir, "node_modules/@tailwindcss", `oxide-${platformPkg}`);
  fs.rmSync(link, { force: true });
  fs.symlinkSync(path.relative(path.dirname(link), dest), link);
  req(oxideEntry); // throws if still broken
  console.log("[ensure-env] oxide binding installed");
}

function ensureCors() {
  const p = path.join(REPO, "artifacts/api-server/.env");
  let txt = fs.readFileSync(p, "utf8");
  if (!/^CORS_ALLOWED_ORIGINS=/m.test(txt)) {
    txt += (txt.endsWith("\n") ? "" : "\n") + "CORS_ALLOWED_ORIGINS=http://localhost:5173\n";
    fs.writeFileSync(p, txt);
    console.log("[ensure-env] added CORS_ALLOWED_ORIGINS to api-server/.env");
  }
}

async function ensureSchema() {
  const req = createRequire(`${REPO}/lib/db/`);
  const pg = req("pg");
  const pool = new pg.Pool({ connectionString: apiEnv.DATABASE_URL });
  const { rows } = await pool.query(
    `select
       exists(select 1 from information_schema.tables where table_schema='public' and table_name='workspace_members') as has_members,
       exists(select 1 from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='is_personal') as has_personal`
  );
  await pool.end();
  if (!rows[0].has_members || !rows[0].has_personal) {
    console.log("[ensure-env] local schema stale — running drizzle push…");
    execSync("pnpm -F @workspace/db run push", { cwd: REPO, stdio: "inherit", env: { ...process.env, DATABASE_URL: apiEnv.DATABASE_URL } });
  }
}

const started = [];
function startServer(name, cwd, env) {
  const log = fs.openSync(path.join(OUT, `${name}.log`), "w");
  const child = spawn("pnpm", ["run", "dev"], { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  started.push({ name, pid: child.pid });
  console.log(`[servers] started ${name} (pid ${child.pid}) → tests/e2e/.e2e-out/${name}.log`);
}
function stopStartedServers() {
  for (const s of started) {
    try { process.kill(-s.pid, "SIGTERM"); } catch { try { process.kill(s.pid, "SIGTERM"); } catch {} }
    console.log(`[servers] stopped ${s.name} (pid ${s.pid})`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
let minted = false;
let seeded = false;
try {
  console.log("== ensure-env ==");
  ensureOxide();
  ensureCors();
  await ensureSchema();

  console.log("== servers ==");
  if (!(await httpUp("http://localhost:3000/api/health"))) {
    startServer("api", path.join(REPO, "artifacts/api-server"), {
      ...apiEnv, RESEND_API_KEY: apiEnv.RESEND_API_KEY || "re_dummy", APP_URL: "http://localhost:5173", NODE_ENV: "development",
    });
  } else console.log("[servers] api already up");
  if (!(await httpUp("http://localhost:5173/"))) {
    startServer("web", path.join(REPO, "artifacts/pm-app"), {});
  } else console.log("[servers] web already up");
  if (!(await waitUp("http://localhost:3000/api/health"))) throw new Error("API never came up — see tests/e2e/.e2e-out/api.log");
  if (!(await waitUp("http://localhost:5173/"))) throw new Error("SPA never came up — see tests/e2e/.e2e-out/web.log");

  console.log("== mint cloud user ==");
  run("artifacts/api-server/scripts/e2e-mint-user.mjs", [], { E2E_SESSION: SESSION_FILE });
  minted = true;

  console.log("== seed local DB ==");
  run("tests/e2e/seed-account.mjs", [], { E2E_SESSION: SESSION_FILE });
  seeded = true;

  console.log("== drive browser ==");
  run("tests/e2e/signin-account-load.mjs", [], { E2E_SESSION: SESSION_FILE, OUT });

  console.log("\n✅ e2e:signin passed — artifacts in tests/e2e/.e2e-out/");
} catch (err) {
  console.error("\n❌ e2e:signin FAILED:", err.message);
  process.exitCode = 1;
} finally {
  console.log("== cleanup ==");
  if (seeded) { try { run("tests/e2e/unseed-account.mjs", [], { E2E_SESSION: SESSION_FILE }); } catch (e) { console.error("unseed error:", e.message); } }
  if (minted) { try { run("artifacts/api-server/scripts/e2e-delete-user.mjs", [], { E2E_SESSION: SESSION_FILE }); } catch (e) { console.error("delete-user error:", e.message); } }
  stopStartedServers();
}
