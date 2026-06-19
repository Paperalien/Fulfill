// Mint a throwaway test user in cloud Supabase auth for local authed e2e testing.
// Creates the user, signs in, and writes the session to a JSON file the browser
// harness injects into localStorage. ALWAYS pair with e2e-delete-user.mjs cleanup.
// See tests/e2e/README.md for the full flow.
//
//   node artifacts/api-server/scripts/e2e-mint-user.mjs
//
// Env:
//   E2E_SESSION  path to write the session JSON (default: artifacts/api-server/.e2e-session.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// @supabase/supabase-js is a dependency of pm-app (not api-server), so resolve it
// from there — a bare specifier fails from this directory under pnpm's layout.
const require = createRequire(path.join(REPO, "artifacts/pm-app/package.json"));
const { createClient } = require("@supabase/supabase-js");
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
const appEnv = parseEnv(path.join(REPO, "artifacts/pm-app/.env"));

const SUPABASE_URL = apiEnv.SUPABASE_URL;
const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
const email = `fulfill-e2e+${Date.now()}@example.com`;
const password = `Test-${Math.random().toString(36).slice(2)}-${Date.now()}!`;

const admin = createClient(SUPABASE_URL, apiEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (cErr) { console.error("createUser FAILED:", cErr.message); process.exit(1); }

const anon = createClient(SUPABASE_URL, appEnv.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: signin, error: sErr } = await anon.auth.signInWithPassword({ email, password });
if (sErr) { console.error("signIn FAILED:", sErr.message); process.exit(1); }

fs.writeFileSync(
  SESSION_FILE,
  JSON.stringify(
    { userId: created.user.id, email, storageKey: `sb-${projectRef}-auth-token`, session: signin.session },
    null, 2
  )
);
console.log("OK created test user:", created.user.id, email);
console.log("OK session ->", SESSION_FILE);
