// Authed e2e flow: returning-user sign-in acknowledgment + post-login data load.
//
// Covers two fixes:
//   Issue 1 — a fresh browser whose email already has a server account sees the
//             "Welcome back" acknowledgment (not sign-up framing).
//   Issue 2 — after sign-in the board loads the account's existing tasks (and a
//             loading state is shown rather than a blank board).
//
// Prereqs (the orchestrator `run.mjs` handles all of these):
//   • API (:3000) + SPA (:5173) running against a DB seeded for the test user
//   • E2E_SESSION → session JSON from e2e-mint-user.mjs, augmented by run.mjs
//     with { email, taskTitles } for the seeded account
//   • OUT → directory for the recorded video + screenshots + report
//
// Standalone use mirrors authed-workspaces.mjs:
//   E2E_SESSION=../../artifacts/api-server/.e2e-session.json OUT=./.e2e-out node signin-account-load.mjs
import fs from "node:fs";
import { launchChrome } from "./_launch.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = process.env.OUT || ".";
const SHOTS = `${OUT}/signin-shots`;
const VIDEO = `${OUT}/signin-video`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

const SESSION = process.env.E2E_SESSION || `${OUT}/session.json`;
const { storageKey, session, email, taskTitles = [] } = JSON.parse(fs.readFileSync(SESSION, "utf8"));

const results = [];
let n = 0;
const browser = await launchChrome();
const pageErrors = [];

function makeShot(page) {
  return async function shot(label) {
    n += 1;
    const file = `${String(n).padStart(2, "0")}-${label.replace(/\W+/g, "-")}.png`;
    await page.screenshot({ path: `${SHOTS}/${file}` });
    return file;
  };
}
async function step(shot, label, fn) {
  try {
    await fn();
    const file = await shot(label);
    results.push({ label, status: "PASS", shot: file });
    console.log(`PASS  ${label}  (${file})`);
  } catch (e) {
    const file = await shot(`FAIL-${label}`);
    results.push({ label, status: "FAIL", shot: file, error: e.message.split("\n")[0] });
    console.log(`FAIL  ${label}  -> ${e.message.split("\n")[0]}  (${file})`);
  }
}

// ── Issue 1: fresh browser, existing-account email → "Welcome back" ───────────
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: VIDEO, size: { width: 1280, height: 900 } },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const shot = makeShot(page);

  await step(shot, "issue1 — first-run save prompt opens", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByText("Save across devices?").waitFor({ timeout: 10000 });
  });
  await step(shot, "issue1 — enter existing-account email", async () => {
    await page.getByRole("button", { name: "Yes, set me up" }).click();
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
  });
  await step(shot, 'issue1 — "Welcome back" acknowledgment (not sign-up)', async () => {
    await page.getByText("Welcome back").waitFor({ timeout: 10000 });
    await page.getByText(/already has an account/i).waitFor({ timeout: 4000 });
    if (await page.getByText("Save across devices?").isVisible().catch(() => false)) {
      throw new Error("sign-up framing still present");
    }
  });
  await ctx.close();
}

// ── Issue 2: inject real session → board loads the account's existing tasks ───
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: VIDEO, size: { width: 1280, height: 900 } },
  });
  await ctx.addInitScript(
    ([k, v]) => {
      try {
        window.localStorage.setItem(k, v);
        window.localStorage.setItem("fulfill:first-run-seen", "true");
      } catch {}
    },
    [storageKey, JSON.stringify(session)]
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const shot = makeShot(page);

  await step(shot, "issue2 — authenticated load (Personal workspace)", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^personal$/i }).first().waitFor({ timeout: 10000 });
    if (await page.getByText(/save across devices/i).count()) {
      throw new Error("anon popover present — not authed");
    }
  });
  await step(shot, "issue2 — existing tasks render (data not lost)", async () => {
    if (taskTitles.length === 0) throw new Error("no expected task titles in session file");
    let shown = 0;
    for (const t of taskTitles) {
      await page.getByText(t).first().waitFor({ timeout: 12000 }).then(() => shown++).catch(() => {});
    }
    if (shown !== taskTitles.length) {
      throw new Error(`only ${shown}/${taskTitles.length} seeded tasks visible`);
    }
  });
  await ctx.close();
}

await browser.close();

const videoFiles = fs.readdirSync(VIDEO).filter((f) => f.endsWith(".webm"));
const summary = {
  base: BASE,
  total: results.length,
  passed: results.filter((r) => r.status === "PASS").length,
  failed: results.filter((r) => r.status === "FAIL").length,
  pageErrors,
  video: videoFiles.map((f) => `${VIDEO}/${f}`),
  results,
};
fs.writeFileSync(`${OUT}/signin-report.json`, JSON.stringify(summary, null, 2));
console.log("\n==== SUMMARY ====");
console.log(`passed ${summary.passed}/${summary.total}, failed ${summary.failed}`);
console.log("video:", summary.video.join(", ") || "(none)");
console.log("pageErrors:", pageErrors.length ? pageErrors.join(" | ") : "none");

process.exitCode = summary.failed > 0 ? 1 : 0;
