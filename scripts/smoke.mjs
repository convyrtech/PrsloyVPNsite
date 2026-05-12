import { firefox } from "playwright";
import fs from "fs";

const URL = "http://localhost:3000/en";
const OUT_DIR = "E:/VPN/scripts/smoke-out";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Chromium-family blocked by HKLM RemoteDebuggingAllowed=0 admin policy.
// Firefox uses Marionette protocol — bypasses the policy.
const browser = await firefox.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => pageErrors.push(`[pageerror] ${err.message}`));

console.log("Loading", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

// Wait for fonts to settle
await page.waitForTimeout(2000);

// Get page metrics
const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const viewportHeight = await page.evaluate(() => window.innerHeight);
console.log(`page height: ${totalHeight}px, viewport: ${viewportHeight}px`);

// Take screenshots across full page scroll (now: ScrollStage + NothingStage)
// Capture more frames so we can see both stages and the handoff.
const stagePositions = [0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.55, 0.65, 0.75, 0.85, 0.95, 1.0];
const stageScrollMax = totalHeight - viewportHeight;

for (const pos of stagePositions) {
  const y = Math.round(pos * stageScrollMax);
  await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: "instant" }), y);
  await page.waitForTimeout(800);
  const file = `${OUT_DIR}/scroll-${String(Math.round(pos * 100)).padStart(3, "0")}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ${(pos * 100).toFixed(0)}%  scrollY=${y}  ->  ${file}`);
}

console.log("\n=== CONSOLE ERRORS/WARNINGS ===");
if (consoleErrors.length === 0) console.log("(none)");
else consoleErrors.forEach((e) => console.log(e));

console.log("\n=== PAGE ERRORS ===");
if (pageErrors.length === 0) console.log("(none)");
else pageErrors.forEach((e) => console.log(e));

await browser.close();
