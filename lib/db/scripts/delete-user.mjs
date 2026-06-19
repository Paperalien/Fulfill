// delete-user.mjs — DEBUG ONLY. Fully removes one user and their data.
//
// Why a script and not plain SQL: `workspaces.owner_id` is NOT NULL with an
// ON DELETE NO ACTION foreign key, so a user who owns any workspace cannot be
// deleted until those workspaces are dealt with. We can't "null the owner"
// (NOT NULL). Instead:
//   - personal workspaces      -> deleted (cascades columns/sprints/tasks/etc.)
//   - shared workspaces they own:
//       * another member exists -> ownership TRANSFERRED to that member
//         (everyone else keeps their data)
//       * sole member           -> workspace deleted
// Deleting the users row then cascades workspace_members.user_id and
// workspace_invitations.inviter_id automatically.
//
// Finally the Supabase auth identity is removed via the Auth Admin REST API so
// the account is fully gone.
//
// Usage (from repo root):
//   node lib/db/scripts/delete-user.mjs --email someone@example.com
//   node lib/db/scripts/delete-user.mjs --id <uuid>
//   node lib/db/scripts/delete-user.mjs --email x@y.com --dry-run   # preview, no writes
//   node lib/db/scripts/delete-user.mjs --email x@y.com --keep-auth # DB only
//
// Reads DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from
// artifacts/api-server/.env. It connects to whatever DATABASE_URL names — there
// is no separate "local mode". As a safety net it refuses to modify a non-local
// host (anything other than localhost/127.0.0.1/::1) unless you pass
// --i-know-this-is-prod. --dry-run is always allowed since it rolls back.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function parseEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { dryRun: false, keepAuth: false, iKnowProd: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--keep-auth") out.keepAuth = true;
    else if (a === "--i-know-this-is-prod") out.iKnowProd = true;
    else if (a === "--id") out.id = argv[++i];
    else if (a === "--email") out.email = argv[++i];
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  if (!out.id && !out.email) {
    console.error("Provide --email <email> or --id <uuid>. See header for usage.");
    process.exit(2);
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

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();

let userId;
let summary = { deletedWorkspaces: [], transferredWorkspaces: [] };

try {
  // Resolve the target user.
  if (args.id) {
    const r = await client.query("SELECT id, email FROM users WHERE id = $1", [args.id]);
    if (r.rowCount === 0) { console.error(`No user with id ${args.id}`); process.exit(1); }
    userId = r.rows[0].id;
    console.log(`Target: ${r.rows[0].email} (${userId})`);
  } else {
    const r = await client.query("SELECT id, email FROM users WHERE email = $1", [args.email]);
    if (r.rowCount === 0) { console.error(`No user with email ${args.email}`); process.exit(1); }
    if (r.rowCount > 1) {
      console.error(`Multiple users share email ${args.email}; re-run with --id <uuid>:`);
      for (const row of r.rows) console.error(`  ${row.id}`);
      process.exit(1);
    }
    userId = r.rows[0].id;
    console.log(`Target: ${args.email} (${userId})`);
  }

  await client.query("BEGIN");

  // Workspaces this user owns.
  const owned = await client.query(
    "SELECT id, name, is_personal FROM workspaces WHERE owner_id = $1",
    [userId],
  );

  for (const ws of owned.rows) {
    if (ws.is_personal) {
      await client.query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
      summary.deletedWorkspaces.push(`${ws.name} (personal)`);
      continue;
    }
    // Shared workspace: find another member to inherit it.
    const heir = await client.query(
      `SELECT user_id FROM workspace_members
         WHERE workspace_id = $1 AND user_id <> $2
         ORDER BY joined_at ASC LIMIT 1`,
      [ws.id, userId],
    );
    if (heir.rowCount === 0) {
      await client.query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
      summary.deletedWorkspaces.push(`${ws.name} (shared, no other members)`);
    } else {
      const newOwner = heir.rows[0].user_id;
      await client.query("UPDATE workspaces SET owner_id = $1 WHERE id = $2", [newOwner, ws.id]);
      summary.transferredWorkspaces.push(`${ws.name} -> ${newOwner}`);
    }
  }

  // Removing the user cascades workspace_members.user_id and
  // workspace_invitations.inviter_id. Invitations addressed TO this user
  // (invitee_email) are plain text and harmlessly remain.
  await client.query("DELETE FROM users WHERE id = $1", [userId]);

  if (args.dryRun) {
    await client.query("ROLLBACK");
    console.log("\n[dry-run] rolled back. Would have:");
  } else {
    await client.query("COMMIT");
    console.log("\nDatabase changes committed:");
  }
  for (const w of summary.deletedWorkspaces) console.log(`  deleted workspace:     ${w}`);
  for (const w of summary.transferredWorkspaces) console.log(`  transferred workspace: ${w}`);
  console.log(`  deleted user row + cascaded memberships/sent-invitations`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED (rolled back, no data changed):", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

// Remove the Supabase auth identity (unless --keep-auth or --dry-run).
if (args.dryRun) {
  console.log("[dry-run] would delete Supabase auth user", userId);
} else if (args.keepAuth) {
  console.log("--keep-auth: left Supabase auth identity intact");
} else if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — skipped auth deletion.");
  console.warn("Delete the auth user manually, or re-run with those set.");
} else {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (res.ok || res.status === 404) {
    console.log(res.status === 404 ? "Supabase auth user already gone." : "Deleted Supabase auth user.");
  } else {
    console.error(`Supabase auth deletion failed (HTTP ${res.status}): ${await res.text()}`);
    console.error("DB rows are already removed; delete the auth user manually in the dashboard.");
    process.exit(1);
  }
}

console.log("Done.");
