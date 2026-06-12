import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = process.env.OUT || ".";
const SHOTS = `${OUT}/authed-shots`;
const VIDEO = `${OUT}/authed-video`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });
const SESSION = process.env.E2E_SESSION || `${OUT}/session.json`;
const { storageKey, session } = JSON.parse(fs.readFileSync(SESSION, "utf8"));

const results = [];
let n = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: VIDEO, size: { width: 1280, height: 900 } },
});
await ctx.addInitScript(
  ([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
  [storageKey, JSON.stringify(session)]
);
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

async function shot(label) {
  n += 1;
  const file = `${String(n).padStart(2, "0")}-${label.replace(/\W+/g, "-")}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}` });
  return file;
}
async function step(label, fn) {
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
const sw = () => page.getByRole("button", { name: /personal|qa team|qa renamed/i }).first();

// 1. Authenticated load
await step("authenticated load — Personal workspace active", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^personal$/i }).first().waitFor({ timeout: 8000 });
  if (await page.getByText(/save across devices/i).count()) throw new Error("anon popover present — not authed");
});

// 2. Open the workspace switcher
await step("open workspace switcher dropdown", async () => {
  await sw().click();
  await page.waitForTimeout(500);
  await page.getByText(/create workspace/i).first().waitFor({ timeout: 4000 });
});

// 3. Create a shared workspace "QA Team"
await step('choose "Create workspace"', async () => {
  await page.getByText(/create workspace/i).first().click();
  await page.waitForTimeout(500);
});
await step('enter name "QA Team" and submit', async () => {
  const box = page.getByRole("textbox").first();
  await box.waitFor({ state: "visible", timeout: 4000 });
  await box.fill("QA Team");
  await shot("typed-workspace-name");
  // submit via a Create/Save button, else Enter
  const create = page.getByRole("button", { name: /create|save|add/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click();
  else await box.press("Enter");
  await page.waitForTimeout(1200);
});

// 4. Assert active workspace is now QA Team
await step('active workspace switched to "QA Team"', async () => {
  await page.getByRole("button", { name: /qa team/i }).first().waitFor({ timeout: 5000 });
});

// 5. Rename it
await step("open switcher → Rename", async () => {
  await sw().click();
  await page.waitForTimeout(400);
  await page.getByText(/^rename/i).first().click();
  await page.waitForTimeout(500);
});
await step('rename to "QA Renamed" and save', async () => {
  const box = page.getByRole("textbox").first();
  await box.waitFor({ state: "visible", timeout: 4000 });
  await box.fill("QA Renamed");
  await shot("typed-rename");
  const save = page.getByRole("button", { name: /save|rename|confirm/i }).first();
  if (await save.isVisible().catch(() => false)) await save.click();
  else await box.press("Enter");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /qa renamed/i }).first().waitFor({ timeout: 5000 });
});

// 6. Invite a member (email send will fail — no Resend key; record honestly)
await step("open switcher → Invite member", async () => {
  await sw().click();
  await page.waitForTimeout(400);
  await page.getByText(/invite/i).first().click();
  await page.waitForTimeout(500);
});
await step("submit invite email (Resend disabled locally → expect error)", async () => {
  const box = page.getByRole("textbox").first();
  await box.waitFor({ state: "visible", timeout: 4000 });
  await box.fill("teammate@example.com");
  await shot("typed-invite-email");
  const send = page.getByRole("button", { name: /send|invite/i }).first();
  await send.click();
  await page.waitForTimeout(1500); // capture success OR error state
});
// close any open modal before moving on
await step("dismiss invite modal", async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
});

// 7. Planning Poker page renders
await step("navigate to Planning Poker", async () => {
  await page.getByRole("link", { name: /planning poker/i }).click();
  await page.waitForTimeout(1000);
  await page.getByText(/planning poker/i).first().waitFor({ timeout: 5000 });
});

// 8. Leave the shared workspace → back to Personal
await step("To-Do, then open switcher → Leave workspace", async () => {
  await page.getByRole("link", { name: /^to-do$/i }).click();
  await page.waitForTimeout(600);
  await sw().click();
  await page.waitForTimeout(400);
  await page.getByText(/^leave/i).first().click();
  await page.waitForTimeout(500);
  // confirm dialog if present
  const confirm = page.getByRole("button", { name: /leave|confirm|yes/i }).first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1200);
});
await step("active workspace back to Personal after leaving", async () => {
  await page.getByRole("button", { name: /^personal$/i }).first().waitFor({ timeout: 5000 });
});

await ctx.close();
await browser.close();

const videoFiles = fs.readdirSync(VIDEO).filter((f) => f.endsWith(".webm"));
const summary = {
  base: BASE, total: results.length,
  passed: results.filter((r) => r.status === "PASS").length,
  failed: results.filter((r) => r.status === "FAIL").length,
  pageErrors, video: videoFiles.map((f) => `${VIDEO}/${f}`), results,
};
fs.writeFileSync(`${OUT}/authed-report.json`, JSON.stringify(summary, null, 2));
console.log("\n==== SUMMARY ====");
console.log(`passed ${summary.passed}/${summary.total}, failed ${summary.failed}`);
console.log("video:", summary.video.join(", ") || "(none)");
console.log("pageErrors:", pageErrors.length ? pageErrors.join(" | ") : "none");
