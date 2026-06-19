// Remove the rows seeded by seed-account.mjs (the test user's personal workspace
// — cascades columns/sprints/tasks/members — plus the users row). Narrowly scoped
// to the seeded workspace/user from the session file; never truncates anything
// else. Pair with e2e-delete-user.mjs to also remove the Supabase auth identity.
//
//   E2E_SESSION=artifacts/api-server/.e2e-session.json node tests/e2e/unseed-account.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(`${REPO}/lib/db/`);
const pg = require("pg");

function parseEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const iKnowProd = process.argv.includes("--i-know-this-is-prod");
const env = parseEnv(path.join(REPO, "artifacts/api-server/.env"));
if (!env.DATABASE_URL) { console.error("DATABASE_URL missing from api-server/.env"); process.exit(1); }

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);
let dbHost; try { dbHost = new URL(env.DATABASE_URL).hostname; } catch { dbHost = "(unparseable)"; }
if (!LOCAL_HOSTS.has(dbHost) && !iKnowProd) {
  console.error(`DATABASE_URL points at non-local host: ${dbHost}. Refusing (use --i-know-this-is-prod).`);
  process.exit(3);
}

const SESSION_FILE = process.env.E2E_SESSION || path.join(REPO, "artifacts/api-server/.e2e-session.json");
const { userId, workspaceId } = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  if (workspaceId) {
    // Delete children explicitly (no reliance on FK cascade config), then the workspace.
    await client.query(`DELETE FROM tasks WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM sprints WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM columns WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  }
  if (userId) await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await client.query("COMMIT");
  console.log(`OK removed seeded workspace ${workspaceId ?? "(none)"} + user row on ${dbHost}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("unseed FAILED (rolled back):", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
