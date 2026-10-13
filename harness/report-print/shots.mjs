/**
 * THE CLIENT VIEW ON SCREEN, PHOTOGRAPHED: each sample report as ReportScreen
 * draws it, at an iPad held upright (820 wide), on its side (1180) and a
 * phone (390), in light and dark, to look at before an iPad walk.
 *
 *   node harness/report-print/shots.mjs            FULL and EVERYDAY
 *   node harness/report-print/shots.mjs BODY       just these
 *
 * Writes PNGs to %TEMP%\journey-report-print\screen-*.png. Chrome only.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";

const here = resolve(import.meta.dirname);
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["FULL", "EVERYDAY"];
const SIZES = [
  ["portrait", 820, 1180],
  ["landscape", 1180, 820],
  ["phone", 390, 844],
];
const out = join(tmpdir(), "journey-report-print");
mkdirSync(out, { recursive: true });

const server = await createServer({ configFile: join(here, "vite.config.ts"), root: here });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;
const chrome = await launchChrome(join(out, "chrome-profile"), { fresh: true });
const page = await connectPage(chrome.port);
await page.send("Page.enable");
await page.send("Runtime.enable");
const evaluate = async (expression) => (await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

try {
  for (const name of names) {
    for (const theme of ["light", "dark"]) {
      for (const [size, width, height] of SIZES) {
        await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: size === "phone" });
        await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
        const loaded = page.once("Page.loadEventFired");
        await page.send("Page.navigate", { url: `${base}?f=${name}&view=screen&theme=${theme}` });
        await loaded;
        await evaluate("document.fonts.ready.then(() => true)");
        await sleep(300);
        // The app's stylesheet holds the page to the screen's height (the shell scrolls), so measure the report.
        const full = await evaluate("Math.ceil(document.getElementById('root').scrollHeight)");
        const overflowX = await evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth");
        await page.send("Emulation.setDeviceMetricsOverride", { width, height: full, deviceScaleFactor: 1, mobile: size === "phone" });
        await sleep(150);
        const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: full, scale: 1 } });
        const file = join(out, `screen-${name}-${theme}-${size}.png`);
        writeFileSync(file, Buffer.from(shot.data, "base64"));
        console.log(`${name} ${theme} ${size}: ${width}x${full}${overflowX ? "  SIDEWAYS SCROLL" : ""}  ${file}`);
      }
    }
  }
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
process.exit(0);
