// truncate-all.mjs — DEBUG ONLY. Empties every application table.
//
// Thin runner around truncate-all.sql that adds the same safety net as
// delete-user.mjs: it connects to whatever DATABASE_URL names in
// artifacts/api-server/.env and refuses to modify a non-local host
// (anything other than localhost/127.0.0.1/::1) unless you pass
// --i-know-this-is-prod. --dry-run runs inside a transaction and rolls back.
//
// The SQL itself lives in truncate-all.sql (single source of truth); you can
// still run that file directly with psql, but doing so bypasses these guards.
//
// Usage (from repo root):
//   node lib/db/scripts/truncate-all.mjs --dry-run            # preview, rolls back
//   node lib/db/scripts/truncate-all.mjs                      # local only
//   node lib/db/scripts/truncate-all.mjs --i-know-this-is-prod
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

function parseEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { dryRun: false, iKnowProd: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--i-know-this-is-prod") out.iKnowProd = true;
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const env = parseEnv(path.join(REPO, "artifacts/api-server/.env"));
if (!env.DATABASE_URL) { console.error("DATABASE_URL missing from api-server/.env"); process.exit(1); }

// Refuse to touch a non-local database unless the operator explicitly opts in.
// `--dry-run` still rolls back, so it's allowed against any host without the flag.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);
let dbHost;
try { dbHost = new URL(env.DATABASE_URL).hostname; } catch { dbHost = "(unparseable)"; }
const isLocal = LOCAL_HOSTS.has(dbHost);
if (!isLocal && !args.iKnowProd && !args.dryRun) {
  console.error(`DATABASE_URL points at a non-local host: ${dbHost}`);
  console.error("This looks like a remote/production database. Refusing to modify it.");
  console.error("Re-run with --i-know-this-is-prod to proceed (or --dry-run to preview safely).");
  process.exit(3);
}
if (!isLocal) console.warn(`WARNING: operating on non-local database host: ${dbHost}`);

const sql = fs.readFileSync(path.join(HERE, "truncate-all.sql"), "utf8");

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  if (args.dryRun) {
    await client.query("ROLLBACK");
    console.log(`[dry-run] truncate succeeded against ${dbHost}; rolled back, no data changed.`);
  } else {
    await client.query("COMMIT");
    console.log(`Truncated all application tables on ${dbHost}.`);
    console.log("Note: Supabase auth.users is untouched — clear it via the dashboard if needed.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED (rolled back, no data changed):", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
