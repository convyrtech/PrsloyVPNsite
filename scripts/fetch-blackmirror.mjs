import { firefox } from "playwright";
import fs from "fs";

const URL = "https://codepen.io/robjoeol/pen/OPRYqMJ";

const browser = await firefox.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

// CodePen renders the pen inside an iframe with id "result"
const frame = page.frames().find((f) => f.url().includes("cdpn.io"));
if (!frame) {
  console.log("frame URLs:");
  for (const f of page.frames()) console.log("  ", f.url());
  await browser.close();
  process.exit(1);
}

await frame.waitForLoadState("networkidle");
const svgHtml = await frame.evaluate(() => {
  const svg = document.querySelector("svg");
  return svg ? svg.outerHTML : "(no svg found)";
});
const css = await frame.evaluate(() => {
  const styles = Array.from(document.querySelectorAll("style"));
  return styles.map((s) => s.textContent).join("\n\n/* === */\n\n");
});

fs.writeFileSync("E:/VPN/scripts/blackmirror-svg.html", svgHtml);
fs.writeFileSync("E:/VPN/scripts/blackmirror-css.css", css);
console.log("svg bytes:", svgHtml.length);
console.log("css bytes:", css.length);
console.log("svg head:", svgHtml.slice(0, 200));
console.log("css head:", css.slice(0, 400));

await browser.close();
