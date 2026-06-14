// Delete the throwaway test user created by e2e-mint-user.mjs from cloud Supabase auth.
// Run this at the END of every local authed e2e session — do not leave test users behind.
// See tests/e2e/README.md.
//
//   node artifacts/api-server/scripts/e2e-delete-user.mjs
//
// Env:
//   E2E_SESSION  path to the session JSON written by e2e-mint-user.mjs
//                (default: artifacts/api-server/.e2e-session.json)
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SESSION_FILE =
  process.env.E2E_SESSION || path.join(REPO, "artifacts/api-server/.e2e-session.json");

function parseEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const apiEnv = parseEnv(path.join(REPO, "artifacts/api-server/.env"));
const { userId, email } = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));

const admin = createClient(apiEnv.SUPABASE_URL, apiEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { error } = await admin.auth.admin.deleteUser(userId);
if (error) { console.error("deleteUser FAILED:", error.message); process.exit(1); }
fs.rmSync(SESSION_FILE, { force: true });
console.log("OK deleted test user:", userId, email);
console.log("OK removed session file:", SESSION_FILE);
