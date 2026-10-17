/**
 * THE BRIEFING'S LIST FOR TODAY, PHOTOGRAPHED: the app's real TodayList (the
 * briefing round, Oct 17 2026) at an iPad held upright (820 x 1180), light
 * and dark, and at a phone's width, in the states a trainer meets:
 *
 *   list           today's machines, as the briefing opens
 *   add-sheet      + Add a machine, open
 *   added          after one tap in the sheet (two taps in all)
 *   swap-sheet     Swap on Leg Press, open
 *   taken-out      after × on Lumbar, with Undo
 *   order          Lumbar straight into Leg Press: the warning, without a tap
 *   phone          390 wide
 *
 *   node harness/briefing/shots.mjs
 *
 * Writes PNGs to %TEMP%\journey-briefing\. Chrome only. Never ships.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";

const here = resolve(import.meta.dirname);
const out = join(tmpdir(), "journey-briefing");
mkdirSync(out, { recursive: true });

const server = await createServer({ configFile: join(here, "vite.config.ts"), root: here });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;
const chrome = await launchChrome(join(out, "chrome-profile"), { fresh: true });
const page = await connectPage(chrome.port);
await page.send("Page.enable");
await page.send("Runtime.enable");
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
  await sleep(300);
}

async function shoot(name, { width = 820, height = 1180 } = {}) {
  await sleep(450);
  const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`${name}.png`);
}

try {
  for (const theme of ["light", "dark"]) {
    await open("", { theme });
    await shoot(`list-${theme}`);
    await tap("Add a machine");
    await shoot(`add-sheet-${theme}`);
    await tap("Seated Pullover");
    await shoot(`added-${theme}`);
    console.log("  today:", JSON.stringify(await evaluate("window.__ids")));
    await tap("Swap Leg Press");
    await shoot(`swap-sheet-${theme}`);
    await open("", { theme });
    await tap("Take Lumbar out of today");
    await shoot(`taken-out-${theme}`);
  }
  await open("&order=1", { theme: "light" });
  await shoot("order-light");
  await open("", { width: 390, height: 844, theme: "dark" });
  await shoot("phone-dark", { width: 390, height: 844 });
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
process.exit(0);
