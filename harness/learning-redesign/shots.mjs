/**
 * LEARNING, PHOTOGRAPHED: the app's real LearningView with the redesign's
 * prototype bar (the Learning vault redesign, Oct 19 2026), for each design,
 * from a made-up Solon (sample.ts), with no database (stubs/).
 *
 *   node harness/learning-redesign/shots.mjs [design|all] [--only text] [--port 5251] [--out dir]
 *
 *   design   codex | vault | course | current | all (default all)
 *   --only   only the shots whose name includes the text ("machine",
 *            "phone", "step-", "quiz-portrait-light")
 *   --port   the Vite port (default LH_PORT, else 5251)
 *   --out    where the PNGs go (default %TEMP%\journey-learning\); one
 *            folder per design. Chrome's profile goes in <out>\chrome-profile.
 *
 * For each design: home, catalog, a machine (Leg Press, through a jump), an
 * Academy topic (Gradual Load Up), the glossary, the cueing page, and the
 * quiz (the design's own route, steps.mjs; not for current), each at
 *   portrait-light   820x1180, plus portrait-light-tall (the whole page)
 *   portrait-dark    820x1180
 *   landscape-light  1180x820
 *   phone-light      390x844
 * then the interactions in steps.mjs (step-<name>.png and -tall.png).
 *
 * Learning is a bounded shell with ONE scroller (.wk__scroll), so "tall"
 * grows the viewport until that scroller needs no scrolling. Every page is a
 * fresh load. Page errors are printed at the end. Chrome only; never ships.
 */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "../perf-lab/cdp.mjs";
import { quiz as QUIZ, steps as STEPS } from "./steps.mjs";

const here = resolve(import.meta.dirname);
const ALL = ["codex", "vault", "course", "current"];

/* ---------------- arguments ---------------- */
let which = "all";
let only = null;
let port = Number(process.env.LH_PORT) || 5251;
let out = join(tmpdir(), "journey-learning");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--only") only = argv[++i] ?? "";
  else if (a === "--port") port = Number(argv[++i]);
  else if (a === "--out") out = resolve(argv[++i] ?? out);
  else if (!a.startsWith("--")) which = a;
  else {
    console.error(`Unknown option ${a}`);
    process.exit(2);
  }
}
if (which !== "all" && !ALL.includes(which)) {
  console.error(`Unknown design "${which}". One of: ${ALL.join(", ")}, all.`);
  process.exit(2);
}
if (!Number.isInteger(port) || port <= 0) {
  console.error("--port needs a number");
  process.exit(2);
}
const designs = which === "all" ? ALL : [which];
process.env.LH_PORT = String(port); // vite.config.ts reads it
mkdirSync(out, { recursive: true });

/* ---------------- what to photograph ---------------- */
const enc = (ref) => encodeURIComponent(JSON.stringify(ref));
const PAGES = [
  { name: "home", query: "&view=learning" },
  { name: "catalog", query: "&view=machine-anatomy" },
  { name: "machine", query: "&view=machine-anatomy&machine=m-leg-press" },
  { name: "topic", query: `&view=academy&ref=${enc({ kind: "academy-topic", id: "performance-gradual-load-up" })}` },
  { name: "glossary", query: `&view=academy&ref=${enc({ kind: "academy-glossary" })}` },
  { name: "cueing", query: `&view=academy&ref=${enc({ kind: "academy-cueing" })}` },
  { name: "quiz", quiz: true },
];
const VIEWPORTS = [
  { name: "portrait", width: 820, height: 1180, theme: "light", tall: true },
  { name: "portrait", width: 820, height: 1180, theme: "dark" },
  { name: "landscape", width: 1180, height: 820, theme: "light" },
  { name: "phone", width: 390, height: 844, theme: "light" },
];

const jobs = [];
for (const design of designs) {
  for (const page of PAGES) {
    let query = page.query;
    let actions = [];
    if (page.quiz) {
      const q = QUIZ[design];
      if (!q) continue; // today's Learning has no quiz
      query = q.query;
      actions = q.actions ?? [];
    }
    for (const vp of VIEWPORTS) {
      const name = `${page.name}-${vp.name}-${vp.theme}`;
      const flat = !only || name.includes(only);
      const tall = Boolean(vp.tall) && (!only || `${name}-tall`.includes(only));
      if (flat || tall) jobs.push({ design, name, query, actions, vp, flat, tall });
    }
  }
  for (const step of STEPS[design] ?? []) {
    const name = `step-${step.name}`;
    const flat = !only || name.includes(only);
    const tall = !only || `${name}-tall`.includes(only);
    if (flat || tall) jobs.push({ design, name, query: step.query, actions: step.actions ?? [], vp: VIEWPORTS[0], flat, tall });
  }
}
if (!jobs.length) {
  console.log("Nothing to photograph for that --only.");
  process.exit(0);
}

/* ---------------- the browser ---------------- */
const server = await createServer({ configFile: join(here, "vite.config.ts"), root: here });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;
const chrome = await launchChrome(join(out, "chrome-profile"), { fresh: true });
const page = await connectPage(chrome.port);
await page.send("Page.enable");
await page.send("Runtime.enable");

let label = "start";
const errors = [];
page.on("Runtime.exceptionThrown", (e) =>
  errors.push(`[${label}] ${e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text}`),
);
page.on("Runtime.consoleAPICalled", (e) => {
  if (e.type === "error") errors.push(`[${label}] ${e.args.map((a) => a.value ?? a.description).join(" ").slice(0, 400)}`);
});
// Every load the page makes, ours or Vite's own (a dependency it bundled late
// reloads the page under us; open() waits that out).
let loads = 0;
page.on("Page.loadEventFired", () => {
  loads += 1;
});
const evaluate = async (expression) =>
  (await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

async function metrics({ width, height }) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}

/** Waits until a condition (a JS expression) is true, or the time is up. */
async function until(expression, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(`Boolean(${expression})`)) return true;
    await sleep(150);
  }
  return false;
}

async function open(design, query, vp) {
  await metrics(vp);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: vp.theme }] });
  const loaded = page.once("Page.loadEventFired", () => true, 90_000);
  await page.send("Page.navigate", { url: `${base}?design=${design}&theme=${vp.theme}${query}` });
  await loaded;
  // Settle; if the page loaded again meanwhile (Vite), settle again.
  for (let tries = 0; tries < 4; tries++) {
    const before = loads;
    await until("window.__ready", 30_000);
    await evaluate("document.fonts.ready.then(() => true)").catch(() => {});
    // A design's chunk, an Academy chunk: wait for the loading mark to go.
    await sleep(300);
    await until("!document.querySelector('.lm')", 15_000);
    await sleep(700);
    if (loads === before) return;
    console.log("    (the page reloaded itself; waiting again)");
  }
}

/** The visible scroller (search hides the page; it stays mounted). */
const SCROLLER = `[...document.querySelectorAll(".wk__scroll")].find((s) => s.getClientRects().length > 0)`;

async function report(name, vp) {
  const facts = await evaluate(`(() => {
    const doc = document.documentElement;
    const bar = document.querySelector(".ld");
    // Rows of the prototype bar: a child starts a row when it sits below the last one.
    let rows = 0;
    let bottom = -Infinity;
    for (const r of bar ? [...bar.children].map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top) : []) {
      if (r.top >= bottom - 1) rows += 1;
      bottom = Math.max(r.top >= bottom - 1 ? r.bottom : bottom, r.bottom);
    }
    return { sideways: doc.scrollWidth > innerWidth + 1, rows, barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0 };
  })()`);
  const notes = [];
  if (facts.sideways) notes.push("SIDEWAYS SCROLL");
  if (facts.rows) notes.push(`bar ${facts.rows} row${facts.rows === 1 ? "" : "s"} ${facts.barH}px`);
  console.log(`  ${name}.png ${vp.width}x${vp.height}${notes.length ? " · " + notes.join(" · ") : ""}`);
  return facts.rows > 0;
}

async function shoot(dir, name, vp) {
  await sleep(250);
  const shot = await page.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale: 1 },
  });
  writeFileSync(join(dir, `${name}.png`), Buffer.from(shot.data, "base64"));
  // False when the page was not there to photograph (the bar is on every page).
  return report(name, vp);
}

/** The whole page: the viewport grows until .wk__scroll needs no scrolling. */
async function shootTall(dir, name, vp) {
  await sleep(250);
  const full = await evaluate(`(() => {
    const s = ${SCROLLER};
    if (!s) return 0;
    return Math.ceil(innerHeight - s.clientHeight + s.scrollHeight);
  })()`);
  if (!full) return false;
  const height = Math.max(vp.height, Math.min(full, 16000));
  await metrics({ width: vp.width, height });
  await sleep(400);
  const shot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: vp.width, height, scale: 1 },
  });
  writeFileSync(join(dir, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`  ${name}.png ${vp.width}x${height}`);
  await metrics(vp);
  return true;
}

/* ---------------- actions (steps.mjs) ---------------- */
async function act(action) {
  if (typeof action.wait === "number") return void (await sleep(action.wait));
  if (typeof action.tap === "string") {
    const ok = await evaluate(`(() => {
      const want = ${JSON.stringify(action.tap)};
      const name = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim();
      const seen = [...document.querySelectorAll("button, a, [role=button]")].filter((el) => el.getClientRects().length > 0);
      const pagePart = seen.filter((el) => !el.closest(".ld"));
      const pick =
        pagePart.find((el) => name(el) === want) ?? pagePart.find((el) => name(el).includes(want)) ??
        seen.find((el) => name(el) === want) ?? seen.find((el) => name(el).includes(want));
      if (!pick) return false;
      pick.scrollIntoView({ block: "center" });
      pick.click();
      return true;
    })()`);
    if (!ok) console.log(`    (nothing to tap called "${action.tap}")`);
    return void (await sleep(250));
  }
  if (typeof action.tapSelector === "string") {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(action.tapSelector)})].find((x) => x.getClientRects().length > 0);
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    })()`);
    if (!ok) console.log(`    (nothing on the page matches ${action.tapSelector})`);
    return void (await sleep(250));
  }
  if (typeof action.type === "string") {
    const ok = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(action.into ?? "textarea, input")});
      if (!el) return false;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(action.type)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    if (!ok) console.log(`    (no field ${action.into ?? "textarea, input"} to type into)`);
    return void (await sleep(200));
  }
  if (typeof action.press === "string") {
    await evaluate(`(() => {
      const t = document.activeElement ?? document.body;
      for (const type of ["keydown", "keyup"]) t.dispatchEvent(new KeyboardEvent(type, { key: ${JSON.stringify(action.press)}, bubbles: true }));
      return true;
    })()`);
    return void (await sleep(200));
  }
  console.log(`    (an action shots.mjs doesn't know: ${JSON.stringify(action)})`);
}

/* ---------------- the run ---------------- */
const t0 = Date.now();
try {
  // Warm Vite up: one page per design and section, so every chunk (and any
  // dependency Vite bundles late, which reloads the page) is in before the
  // first photograph.
  label = "warm-up";
  for (const design of designs) {
    for (const query of [PAGES[0].query, PAGES[2].query, PAGES[3].query]) await open(design, query, VIEWPORTS[0]);
  }
  // ...and give a late re-bundle its reload before anything is photographed.
  for (let quiet = loads, tries = 0; tries < 10; tries++) {
    await sleep(1000);
    if (loads === quiet) break;
    quiet = loads;
  }

  let current = null;
  for (const job of jobs) {
    const dir = join(out, job.design);
    mkdirSync(dir, { recursive: true });
    if (job.design !== current) {
      current = job.design;
      console.log(`${job.design} → ${dir}`);
    }
    label = `${job.design}/${job.name}`;
    // A page that reloaded or never drew between opening and the photograph
    // is opened again (Vite can reload it under us).
    for (let attempt = 1; attempt <= 3; attempt++) {
      await open(job.design, job.query, job.vp);
      const before = loads;
      for (const a of job.actions) await act(a);
      if (job.actions.length) await sleep(300);
      const drawn = await evaluate("Boolean(window.__ready && document.querySelector('.ld'))");
      if (drawn && loads === before) {
        let ok = true;
        if (job.flat) ok = (await shoot(dir, job.name, job.vp)) && ok;
        if (job.tall) ok = (await shootTall(dir, `${job.name}-tall`, job.vp)) && ok;
        if (ok && loads === before) break;
      }
      console.log(`    (${job.name} was not drawn${attempt < 3 ? "; again" : ""})`);
    }
  }
  console.log(`${jobs.length} page loads in ${Math.round((Date.now() - t0) / 1000)} s.`);
  if (errors.length) console.log("Page errors:\n  " + [...new Set(errors)].slice(0, 30).join("\n  "));
  else console.log("No page errors.");
} finally {
  page.close();
  await chrome.close();
  await server.close();
}
process.exit(0);
