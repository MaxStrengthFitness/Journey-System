/**
 * THE DEEP DIVE, PHOTOGRAPHED: the made-up long-standing client (sample.ts)
 * as the app's real Deep Dive draws it, at an iPad held upright (820 wide),
 * light and dark, for each range asked for.
 *
 *   node harness/deep-dive/shots.mjs              all, 90d
 *   node harness/deep-dive/shots.mjs all 12m      just these
 *   node harness/deep-dive/shots.mjs journey      only the Journey-recorded months, all
 *
 * Writes PNGs to %TEMP%\journey-deep-dive\ (the whole page, and each
 * screen's worth as -1, -2 ...). Chrome only. Never ships.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";

const here = resolve(import.meta.dirname);
const asked = process.argv.slice(2);
const runs = (asked.length ? asked : ["all", "90d"]).map((a) => (a === "journey" ? { range: "all", journey: true } : { range: a, journey: false }));
const out = join(tmpdir(), "journey-deep-dive");
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
  for (const run of runs) {
    for (const theme of ["light", "dark"]) {
      const width = 820;
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: 1180, deviceScaleFactor: 1, mobile: false });
      await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      const loaded = page.once("Page.loadEventFired");
      await page.send("Page.navigate", { url: `${base}?range=${run.range}&theme=${theme}${run.journey ? "&journey=1" : ""}` });
      await loaded;
      await evaluate("document.fonts.ready.then(() => true)");
      await sleep(400);
      const full = await evaluate("Math.ceil(document.getElementById('root').scrollHeight)");
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: full, deviceScaleFactor: 1, mobile: false });
      await sleep(150);
      const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: full, scale: 1 } });
      const name = `deep-dive-${run.journey ? "journey-" : ""}${run.range}-${theme}.png`;
      writeFileSync(join(out, name), Buffer.from(shot.data, "base64"));
      console.log(`${name}: ${width}x${full}`);
      // And screen-sized pieces, to read at the iPad's own size.
      for (let y = 0, i = 1; y < full; y += 1180, i += 1) {
        const piece = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(1180, full - y), scale: 1 } });
        writeFileSync(join(out, name.replace(".png", `-${i}.png`)), Buffer.from(piece.data, "base64"));
      }
    }
  }
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
process.exit(0);
