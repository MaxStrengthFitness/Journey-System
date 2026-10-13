/**
 * THE PRINT CHECK: every sample report prints on exactly ONE US Letter page.
 *
 * AJ, Oct 13 2026: the printed report was "a giant 3 page, im looking to get
 * this all on 1 page". The unit tests hold the estimate that picks roomy or
 * condensed (report-page.test.ts); this holds the drawing: the app's real
 * ReportSheet, the app's fonts, printed by Chrome to a PDF whose pages are
 * counted. It also says whether the sheet had to step down from the
 * estimate's density or shrink to fit, so an estimate that drifts from the
 * drawing shows up here before it shows up on a client's printer.
 *
 *   node harness/report-print/check.mjs            every sample
 *   node harness/report-print/check.mjs FULL BODY  just these
 *
 * Writes each PDF to %TEMP%\journey-report-print\ to look at. Exit 1 when a
 * sample prints past one page. Chrome only: Safari on an iPad is its own
 * printer, so walk one real print from an iPad too.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";

const here = resolve(import.meta.dirname);
const ALL = ["FULL", "EVERYDAY", "BODY", "NEW_CLIENT", "OVERFULL"];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
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

let failed = 0;
try {
  for (const name of names) {
    const loaded = page.once("Page.loadEventFired");
    await page.send("Page.navigate", { url: `${base}?f=${name}${process.env.REPORT_PRINT_ROWS ? "&raw=1" : ""}` });
    await loaded;
    await evaluate("document.fonts.ready.then(() => true)");
    let state = null;
    for (let i = 0; i < 100; i += 1) {
      state = await evaluate("window.__sheet");
      if (state?.ready) break;
      await sleep(100);
    }
    if (process.env.REPORT_PRINT_ROWS) {
      // Each row's drawn height, to set beside the estimate (report-page.ts moduleHeight).
      const rows = await evaluate(
        `[...document.querySelectorAll(".rs-head, .rs-row, .rs-foot")].map((e) => (e.getAttribute("data-row") || e.className) + " " + e.getBoundingClientRect().height.toFixed(1)).join("\\n")`,
      );
      console.log(rows.split("\n").map((r) => `      ${r}`).join("\n"));
    }
    const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 739, height: 979, scale: 1 } });
    writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
    const pdf = await page.send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
    const bytes = Buffer.from(pdf.data, "base64");
    writeFileSync(join(out, `${name}.pdf`), bytes);
    const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    const m = state?.measured;
    const drew = m
      ? `${m.density}${m.scale < 1 ? ` at ${Math.round(m.scale * 100)}%` : ""}${m.overflow ? `, ${m.overflow}px over` : ""}${m.flows ? ", runs onto a second page" : ""}`
      : "not measured";
    const estimate = state?.estimate === "over" ? `over by ${state.over}px` : state?.estimate;
    // OVERFULL is the trainer who wrote too much: it must run on (and say so), never lose its end.
    const ok = name === "OVERFULL" ? pages > 1 && !!m?.flows : pages === 1;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(11)} ${pages} page${pages === 1 ? "" : "s"} · estimate ${estimate} · drawn ${drew}`);
  }
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
console.log(`\nPDFs: ${out}`);
process.exit(failed ? 1 : 0);
