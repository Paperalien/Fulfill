// Seed a freshly-minted e2e user with a personal workspace + tasks in the LOCAL
// database, so the authed sign-in flow has data to load (and check-email reports
// the account as existing). Reads the session written by e2e-mint-user.mjs and
// augments it with { workspaceId, taskTitles } for the driver + unseed step.
//
// Self-contained on this branch — does NOT depend on lib/db/scripts/* (those
// live on a separate db-maintenance branch). Guarded to local DBs like the
// db-maintenance scripts: refuses a non-local host unless --i-know-this-is-prod.
//
//   E2E_SESSION=artifacts/api-server/.e2e-session.json node tests/e2e/seed-account.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

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
const sess = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
const { userId, email } = sess;

const wsId = randomUUID();
const col = { todo: randomUUID(), prog: randomUUID(), review: randomUUID(), done: randomUUID() };
const sprintId = randomUUID();
const tasks = [
  { title: "Wire up OTP sign-in flow",          col: col.done,   order: 0, pts: 5, tags: ["auth"],       due: null, prog: false },
  { title: 'Add "Welcome back" account panel',  col: col.review, order: 1, pts: 3, tags: ["auth", "ux"], due: "2026-06-25", prog: false },
  { title: "Fix blank-board flash after login", col: col.prog,   order: 2, pts: 3, tags: ["bug"],        due: "2026-06-22", prog: true },
  { title: "Sprint burndown chart polish",      col: col.prog,   order: 3, pts: 2, tags: ["charts"],     due: null, prog: true },
  { title: "Document deployment runbook",       col: col.todo,   order: 4, pts: 2, tags: ["docs"],       due: "2026-06-30", prog: false },
  { title: "Audit Row Level Security policies", col: col.todo,   order: 5, pts: 8, tags: ["security"],   due: null, prog: false },
];

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`INSERT INTO users (id,email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [userId, email]);
  await client.query(`INSERT INTO workspaces (id,name,owner_id,is_personal) VALUES ($1,'Personal',$2,true)`, [wsId, userId]);
  await client.query(`INSERT INTO workspace_members (workspace_id,user_id) VALUES ($1,$2)`, [wsId, userId]);
  for (const [id, name, order, sem] of [
    [col.todo, "To Do", 0, "not-started"],
    [col.prog, "In Progress", 1, "in-progress"],
    [col.review, "In Review", 2, "in-progress"],
    [col.done, "Done", 3, "done"],
  ]) {
    await client.query(`INSERT INTO columns (id,workspace_id,name,"order",semantic_status) VALUES ($1,$2,$3,$4,$5)`, [id, wsId, name, order, sem]);
  }
  await client.query(`INSERT INTO sprints (id,workspace_id,name,start_date,end_date,is_active) VALUES ($1,$2,'Sprint 7','2026-06-15','2026-06-29',true)`, [sprintId, wsId]);
  for (const t of tasks) {
    await client.query(
      `INSERT INTO tasks (id,workspace_id,title,notes,column_id,"order",story_points,due_date,tags,sprint_id,in_progress_at)
       VALUES ($1,$2,$3,'',$4,$5,$6,$7,$8,$9,${t.prog ? "now()" : "NULL"})`,
      [randomUUID(), wsId, t.title, t.col, t.order, t.pts, t.due, t.tags, sprintId]
    );
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("seed FAILED (rolled back):", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

sess.workspaceId = wsId;
sess.taskTitles = tasks.map((t) => t.title);
fs.writeFileSync(SESSION_FILE, JSON.stringify(sess, null, 2));
console.log(`OK seeded workspace ${wsId} with ${tasks.length} tasks for ${email} on ${dbHost}`);
