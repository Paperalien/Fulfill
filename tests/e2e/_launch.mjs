// Shared browser launcher for the e2e flows. Uses playwright-core driving the
// *system* Google Chrome — so there's no 300MB browser download and no separate
// `npm i playwright` inside tests/e2e. `playwright-core` is a root devDependency.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(`${REPO}/`);
export const { chromium } = require("playwright-core");

const CHROME_BY_OS = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

// Prefer Playwright's own channel resolution (cross-platform); fall back to the
// well-known executable path for this OS if the channel isn't registered.
export async function launchChrome(opts = {}) {
  try {
    return await chromium.launch({ channel: "chrome", ...opts });
  } catch {
    const executablePath = CHROME_BY_OS[process.platform];
    return await chromium.launch({ executablePath, ...opts });
  }
}
