/**
 * THE BRIEFING, PHOTOGRAPHED: the app's real BriefingScreen and TodayList
 * (the briefing round, Oct 17 2026) from a made-up client (sample.ts), at an
 * iPad held upright (820 wide), light and dark, and at a phone's width.
 *
 *   full-*         the whole briefing, top to bottom (one tall PNG)
 *   full-seen-*    the signed-in trainer trained the client since the Heads up
 *   full-flags-*   a low-back flag in Before you start
 *   list-*, add-sheet-*, added-*, swap-sheet-*, taken-out-*, order-light
 *                  today's list alone, in the states a trainer meets
 *
 *   node harness/briefing/shots.mjs            everything
 *   node harness/briefing/shots.mjs full       the whole briefing only
 *
 * Writes PNGs to %TEMP%\journey-briefing\ and prints any page error. Chrome
 * only. Never ships.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";

const here = resolve(import.meta.dirname);
const only = process.argv[2] ?? null;
const out = join(tmpdir(), "journey-briefing");
mkdirSync(out, { recursive: true });

const server = await createServer({ configFile: join(here, "vite.config.ts"), root: here });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;
const chrome = await launchChrome(join(out, "chrome-profile"), { fresh: true });
const page = await connectPage(chrome.port);
await page.send("Page.enable");
await page.send("Runtime.enable");
const errors = [];
page.on?.("Runtime.exceptionThrown", (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
page.on?.("Runtime.consoleAPICalled", (e) => {
  if (e.type === "error") errors.push(e.args.map((a) => a.value ?? a.description).join(" "));
});
const evaluate = async (expression) => (await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

/** Taps the first button whose aria-label or words match. */
const tap = (text) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || x.textContent.trim()).includes(${JSON.stringify(text)}));
    if (!b) return false;
    b.click();
    return true;
  })()`);

async function open(query, { width = 820, height = 1180, theme = "light" } = {}) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${base}?theme=${theme}${query}` });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await sleep(700);
}

async function shoot(name, { width = 820, height = 1180 } = {}) {
  await sleep(450);
  const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`${name}.png`);
}

/** The whole page, top to bottom, as one tall PNG. */
async function shootTall(name, { width = 820 } = {}) {
  await sleep(450);
  const full = await evaluate("Math.ceil(document.documentElement.scrollHeight)");
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: full, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(250);
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: full, scale: 1 } });
  writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`${name}.png: ${width}x${full}`);
}

try {
  for (const theme of ["light", "dark"]) {
    await open("", { theme });
    await shootTall(`full-${theme}`);
    await open("&seen=1", { theme });
    await shootTall(`full-seen-${theme}`);
  }
  await open("&flags=1", { theme: "light" });
  await shootTall("full-flags-light");
  // Question 3 open: the last sessions on today's machines, then all of them.
  await open("", { theme: "dark" });
  await tap("The last 8 sessions");
  await shootTall("full-perf-dark");
  await open("", { width: 390, height: 844, theme: "dark" });
  await shootTall("full-phone-dark", { width: 390 });

  if (only !== "full") {
    for (const theme of ["light", "dark"]) {
      await open("&view=list", { theme });
      await shoot(`list-${theme}`);
      await tap("Add a machine");
      await shoot(`add-sheet-${theme}`);
      await tap("Seated Pullover");
      await shoot(`added-${theme}`);
      console.log("  today:", JSON.stringify(await evaluate("window.__ids")));
      await tap("Swap Leg Press");
      await shoot(`swap-sheet-${theme}`);
      await open("&view=list", { theme });
      await tap("Take Lumbar out of today");
      await shoot(`taken-out-${theme}`);
    }
    await open("&view=list&order=1", { theme: "light" });
    await shoot("order-light");
  }
  if (errors.length) console.log("Page errors:\n  " + [...new Set(errors)].slice(0, 12).join("\n  "));
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
process.exit(0);
