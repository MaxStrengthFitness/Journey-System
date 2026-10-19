/**
 * Count which Academy topics talk about which glossary term and which
 * machine, for the Learning vault's knowledge graph.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 *   npx tsx scripts/build-learning-graph.ts           writes the file
 *   npx tsx scripts/build-learning-graph.ts --check   says whether it is stale, writes nothing
 *
 * WHAT IT TOUCHES
 * ---------------
 * It reads the generated Academy corpus (src/features/academy/content/*.json),
 * the standard's machine names (src/data/machine-definitions.ts) and the
 * Academy's machine codes (routine-builder/academy.ts MACHINE_ABBR), and
 * writes ONE file: src/features/learning-vault/graph-index.json. Nothing else,
 * no network, no Firestore. Safe to run at any time; with --check it writes
 * nothing at all.
 *
 * WHY GENERATED AND COMMITTED
 * ---------------------------
 * The same reason as scripts/build-academy-content.ts: counting mentions
 * across 113,000 words on an iPad every time Learning opens would be slow and
 * would pull all thirteen module chunks, and the guesswork belongs where a
 * person can review it. The counting lives in
 * src/features/learning-vault/graph-index-build.ts; graph-index.test.ts runs
 * the same function over the committed corpus and fails when this file is
 * stale, so re-run this after scripts/build-academy-content.ts.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { join, relative } from "node:path";
import type {
  AcademyIndex,
  CardsFile,
  GlossaryFile,
  ModuleContent,
  OverviewsFile,
  ScriptsFile,
} from "../src/features/academy/types";

/*
 * The Academy's machine join (academy/academy-machines.ts) reads
 * src/data/machine-database.ts, which imports the machines' photos. Vite
 * handles those in the app and the tests; Node stops on ".webp". So the
 * house loader hook (lib/stub-assets.mjs, the FileMaker import's) loads each
 * picture as an empty string, and the modules that reach them are imported
 * dynamically, after the hook is in place.
 */
register("./lib/stub-assets.mjs", import.meta.url);
const { MACHINE_DEFINITIONS } = await import("../src/data/machine-definitions.ts");
const { buildGraphIndex, formatGraphIndex } = await import("../src/features/learning-vault/graph-index-build.ts");
const { MACHINE_ABBR } = await import("../src/features/routine-builder/academy.ts");

const CONTENT = join(process.cwd(), "src", "features", "academy", "content");
const OUT = join(process.cwd(), "src", "features", "learning-vault", "graph-index.json");
/** Over this the file is no longer "small", and Learning's chunk pays for it. */
const SIZE_LIMIT = 30 * 1024;

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(CONTENT, name), "utf8")) as T;
}

function main() {
  const check = process.argv.includes("--check");
  const index = readJson<AcademyIndex>("index.json");
  const modules = index.modules.map((m) => readJson<ModuleContent>(`${m.id}.json`));
  const catalogNames: Record<string, string> = {};
  for (const [id, def] of Object.entries(MACHINE_DEFINITIONS)) catalogNames[id] = def.name;

  const file = buildGraphIndex({
    index,
    modules,
    glossary: readJson<GlossaryFile>("glossary.json").glossary,
    cards: readJson<CardsFile>("cards.json").cards,
    scripts: readJson<ScriptsFile>("scripts.json").scripts,
    overviews: readJson<OverviewsFile>("overviews.json").overviews,
    catalogNames,
    codes: Object.values(MACHINE_ABBR),
  });
  const text = formatGraphIndex(file);
  const bytes = Buffer.byteLength(text, "utf8");
  const terms = Object.keys(file.termTopics).length;
  const machines = Object.keys(file.machineTopics).length;
  const empty = [...Object.entries(file.termTopics), ...Object.entries(file.machineTopics)]
    .filter(([, topics]) => topics.length === 0)
    .map(([key]) => key);

  console.log(`  ${terms} glossary terms, ${machines} machines, ${(bytes / 1024).toFixed(1)} KB`);
  if (empty.length > 0) console.log(`  No topic mentions: ${empty.join(", ")}`);
  if (bytes > SIZE_LIMIT) {
    console.error(`  Over the ${SIZE_LIMIT / 1024} KB budget. Not written.`);
    process.exit(1);
  }

  const before = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : null;
  if (check) {
    if (before === text) {
      console.log(`\n${relative(process.cwd(), OUT)} is up to date.`);
      return;
    }
    console.error(`\n${relative(process.cwd(), OUT)} is stale. Run: npx tsx scripts/build-learning-graph.ts`);
    process.exit(1);
  }
  if (before === text) {
    console.log(`\n${relative(process.cwd(), OUT)} unchanged.`);
    return;
  }
  writeFileSync(OUT, text);
  console.log(`\nWrote ${relative(process.cwd(), OUT)} (${file.corpusHash}).`);
}

main();
