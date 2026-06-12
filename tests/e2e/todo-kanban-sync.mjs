import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = process.env.OUT || ".";
const SHOTS = `${OUT}/shots`;
const VIDEO = `${OUT}/video`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

const results = [];
let n = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: VIDEO, size: { width: 1280, height: 900 } },
});
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

const TASK = "Test task from To-Do";

// 1. Navigate
await step("load app (local mode)", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
});

// 2. Dismiss the "Save across devices?" popover
await step('dismiss "Save across devices?" via "Not now"', async () => {
  const notNow = page.getByRole("button", { name: /not now/i });
  await notNow.waitFor({ state: "visible", timeout: 5000 });
  await notNow.click();
  await page.waitForTimeout(400);
});

// 3. Confirm To-Do List with 0 tasks
await step('To-Do List shown with 0 tasks ("0 active tasks")', async () => {
  await page.getByText(/to-do list/i).first().waitFor({ timeout: 5000 });
  await page.getByText(/0 active tasks/i).first().waitFor({ timeout: 5000 });
});

// 4-6. Create a task in To-Do
await step('click "Add a task…"', async () => {
  await page.getByRole("button", { name: /add a task/i }).first().click();
  await page.waitForTimeout(400);
});
await step(`type title "${TASK}" and click Add`, async () => {
  // The inline add form input has placeholder "Task title" (NOT the search/filter box).
  const box = page.getByPlaceholder(/task title/i).first();
  await box.waitFor({ state: "visible", timeout: 5000 });
  await box.click();
  await box.fill(TASK);
  await shot("typed-title");
  await page.getByRole("button", { name: /^add$/i }).first().click();
  await page.waitForTimeout(700);
});

// 7. Assert task row appears
await step(`task row "${TASK}" appears in To-Do list`, async () => {
  await page.getByText(TASK, { exact: false }).first().waitFor({ timeout: 5000 });
});
// 8. Assert footer count incremented
await step('footer shows "1 active tasks"', async () => {
  await page.getByText(/1 active tasks/i).first().waitFor({ timeout: 5000 });
});

// 9. Go to Kanban
await step('navigate to Kanban', async () => {
  await page.getByRole("link", { name: /^kanban$/i }).click();
  await page.waitForTimeout(800);
});
// 10. Assert card appears in Kanban
await step(`"${TASK}" card visible on Kanban board`, async () => {
  await page.getByText(TASK, { exact: false }).first().waitFor({ timeout: 5000 });
});

// 11-14. Edit due date in Kanban (best-effort; date pickers are brittle)
// compute the target due date (+8 days) and some display candidates
const due = new Date();
due.setDate(due.getDate() + 8);
const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
const dayNum = String(due.getDate());

await step('open editor (hover card → click pencil) — "Edit Task" modal appears', async () => {
  // The pencil is hover-revealed and @hello-pangea/dnd swallows synthetic clicks,
  // so hover the card then issue a real mouse click at its top-right corner.
  const card = page.locator("div").filter({ hasText: TASK }).last();
  const box = await card.boundingBox();
  if (!box) throw new Error("card bounding box not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); // hover to reveal pencil
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width - 18, box.y + 20); // pencil, top-right
  await page.waitForTimeout(500);
  await page.getByText(/edit task/i).first().waitFor({ timeout: 4000 });
});

await step(`set Due Date to +8 days (${iso}) and Save`, async () => {
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.waitFor({ state: "visible", timeout: 4000 });
  await dateInput.fill(iso); // native date input accepts ISO yyyy-mm-dd
  await shot("due-date-filled");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await page.waitForTimeout(700);
});

await step(`Kanban card shows the due date (day "${dayNum}")`, async () => {
  // card now renders a due-date badge; match the day number on the board
  await page.getByText(new RegExp(`\\b${dayNum}\\b`)).first().waitFor({ timeout: 4000 });
});

// 15-16. Back to To-Do and confirm sync
await step("navigate back to To-Do", async () => {
  await page.getByRole("link", { name: /^to-do$/i }).click();
  await page.waitForTimeout(800);
});
await step(`To-Do row shows "${TASK}" AND the due date set in Kanban (sync intact)`, async () => {
  await page.getByText(TASK, { exact: false }).first().waitFor({ timeout: 5000 });
  // the due date set on the Kanban side must be reflected here (day number)
  await page.getByText(new RegExp(`\\b${dayNum}\\b`)).first().waitFor({ timeout: 5000 });
});

// finalize: close context so the video is flushed
await ctx.close();
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
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(summary, null, 2));
console.log("\n==== SUMMARY ====");
console.log(`passed ${summary.passed}/${summary.total}, failed ${summary.failed}`);
console.log("video:", summary.video.join(", ") || "(none)");
console.log("pageErrors:", pageErrors.length ? pageErrors.join(" | ") : "none");
