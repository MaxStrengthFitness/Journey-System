/**
 * THE GRAPH INDEX IS WHAT THE CODE WOULD WRITE (Learning vault redesign,
 * Oct 19 2026).
 *
 * graph-index.json is generated (scripts/build-learning-graph.ts) and
 * committed. This recomputes it with the same function from the committed
 * Academy corpus and fails when the two differ, so a rebuilt corpus that
 * forgot the second script is caught here, not by a trainer following a link
 * to the wrong topic. It also holds the file's promises: small, every topic
 * real, at most eight per entry, never both of a pair of twins.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import cards from "../academy/content/cards.json";
import consultation from "../academy/content/consultation.json";
import continuousTension from "../academy/content/continuous-tension.json";
import benefits from "../academy/content/benefits.json";
import equipment from "../academy/content/equipment.json";
import further from "../academy/content/further.json";
import glossary from "../academy/content/glossary.json";
import index from "../academy/content/index.json";
import instruction from "../academy/content/instruction.json";
import intro from "../academy/content/intro.json";
import mastery from "../academy/content/mastery.json";
import overviews from "../academy/content/overviews.json";
import performance from "../academy/content/performance.json";
import principles from "../academy/content/principles.json";
import programming from "../academy/content/programming.json";
import scripts from "../academy/content/scripts.json";
import summary from "../academy/content/summary.json";
import variations from "../academy/content/variations.json";
import type {
  AcademyIndex,
  CardsFile,
  GlossaryFile,
  ModuleContent,
  OverviewsFile,
  ScriptsFile,
} from "../academy/types";
import { MACHINE_ABBR } from "../routine-builder/academy";
import type { GraphIndexFile } from "./graph";
import { wordMatcher } from "./graph";
import {
  GLOSSARY_TOPIC_ID,
  TOPICS_PER_ENTRY,
  buildGraphIndex,
  findTwins,
  fnv1a,
  formatGraphIndex,
  rankTopics,
  type GraphCorpus,
} from "./graph-index-build";

const MODULES = [
  intro,
  benefits,
  principles,
  performance,
  continuousTension,
  programming,
  variations,
  equipment,
  instruction,
  mastery,
  consultation,
  further,
  summary,
] as unknown as ModuleContent[];

const INDEX = index as unknown as AcademyIndex;

function corpus(): GraphCorpus {
  const catalogNames: Record<string, string> = {};
  for (const [id, def] of Object.entries(MACHINE_DEFINITIONS)) catalogNames[id] = def.name;
  return {
    index: INDEX,
    modules: MODULES,
    glossary: (glossary as unknown as GlossaryFile).glossary,
    cards: (cards as unknown as CardsFile).cards,
    scripts: (scripts as unknown as ScriptsFile).scripts,
    overviews: (overviews as unknown as OverviewsFile).overviews,
    catalogNames,
    codes: Object.values(MACHINE_ABBR),
  };
}

const FILE = join(__dirname, "graph-index.json");
const committed = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const parsed = JSON.parse(committed) as GraphIndexFile;
const allTopicIds = new Set(INDEX.modules.flatMap((m) => m.topics.map((t) => t.id)));

describe("graph-index.json", () => {
  it("is exactly what the build script would write from the committed corpus", () => {
    const fresh = formatGraphIndex(buildGraphIndex(corpus()));
    // On a mismatch: npx tsx scripts/build-learning-graph.ts
    expect(fresh).toBe(committed);
  });

  it("stays small (under 30 KB): Learning's chunk carries it", () => {
    expect(Buffer.byteLength(committed, "utf8")).toBeLessThan(30 * 1024);
  });

  it("names the Academy index it was counted from", () => {
    expect(parsed.corpusHash.startsWith(`${INDEX.corpusHash}-`)).toBe(true);
    expect(parsed.corpusHash).toMatch(/^[0-9a-f]{12}-[0-9a-f]{8}$/);
  });

  it("has an entry for every glossary term and every standard machine", () => {
    const terms = (glossary as unknown as GlossaryFile).glossary.map((g) => g.term).sort();
    expect(Object.keys(parsed.termTopics).sort()).toEqual(terms);
    expect(Object.keys(parsed.machineTopics).sort()).toEqual(Object.keys(MACHINE_DEFINITIONS).sort());
  });

  it("points only at real topics, at most eight to an entry, never the same one twice", () => {
    for (const list of [...Object.values(parsed.termTopics), ...Object.values(parsed.machineTopics)]) {
      expect(list.length).toBeLessThanOrEqual(TOPICS_PER_ENTRY);
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(allTopicIds.has(id)).toBe(true);
    }
  });

  it("never lists both of a pair of twins for one entry", () => {
    const twins = findTwins(MODULES);
    for (const [key, list] of [...Object.entries(parsed.termTopics), ...Object.entries(parsed.machineTopics)]) {
      for (const id of list) {
        for (const other of twins.get(id) ?? []) {
          expect(list.includes(other), `${key}: ${id} and its twin ${other}`).toBe(false);
        }
      }
    }
  });

  it("never sends a term to the glossary topic (the term's own page is that definition)", () => {
    for (const list of Object.values(parsed.termTopics)) expect(list).not.toContain(GLOSSARY_TOPIC_ID);
  });

  it("sends the words the Academy titles a topic for to that topic", () => {
    expect(parsed.termTopics["Timed Static Contraction (TSC)"][0]).toBe("variations-timed-static-contraction-tsc");
    expect(parsed.termTopics["Exercise Induced Headache (EIH)"]).toContain("performance-eih");
    expect(parsed.termTopics["Lower Turnaround (Lower Turn/Bottom)"]).toContain("mastery-lower-turnarounds");
  });
});

describe("twins", () => {
  const twins = findTwins(MODULES);

  it("finds the Academy's reprints", () => {
    expect(twins.get("programming-faq")?.has("mastery-faq")).toBe(true);
    expect(twins.get("mastery-faq")?.has("programming-faq")).toBe(true);
    expect(twins.get("instruction-exercise-instruction-cues-and-timing")?.has("mastery-exercise-instruction-cues-and-timing")).toBe(true);
    // "Exercise Substitutes" three times over.
    expect([...(twins.get("programming-exercise-substitutes") ?? [])].sort()).toEqual([
      "further-exercise-substitutes",
      "mastery-exercise-substitutes",
    ]);
  });

  it("does not take two topics with one title for twins", () => {
    // Two "Introduction"s: Basic Principles' short one and the Executive Summary's.
    expect(twins.get("principles-introduction")?.has("summary-introduction") ?? false).toBe(false);
  });

  it("does not take two versions with different words for twins", () => {
    // The two Exercise Selection Templates share an opening and little else.
    expect(twins.get("programming-exercise-selection-template")?.has("mastery-exercise-selection-template") ?? false).toBe(false);
  });
});

describe("ranking", () => {
  const topic = (id: string, n: number, at: number, text: string) => ({ id, n, at, text });

  it("puts the most mentions first, ties in the teaching order", () => {
    const m = wordMatcher({ words: ["pace"], codes: [] });
    const topics = [topic("a", 1, 0, "pace"), topic("b", 2, 0, "pace pace"), topic("c", 3, 0, "pace")];
    expect(rankTopics(m, topics, new Map())).toEqual(["b", "a", "c"]);
  });

  it("stands a reprint in for its original when both say it, and keeps one of the pair", () => {
    const m = wordMatcher({ words: ["pace"], codes: [] });
    const topics = [topic("orig", 6, 0, "pace"), topic("other", 7, 0, "pace pace"), topic("reprint", 10, 0, "pace pace pace")];
    const twins = new Map([
      ["orig", new Set(["reprint"])],
      ["reprint", new Set(["orig"])],
    ]);
    expect(rankTopics(m, topics, twins)).toEqual(["orig", "other"]);
  });

  it("keeps the reprint when the original never says it", () => {
    const m = wordMatcher({ words: ["pace"], codes: [] });
    const topics = [topic("orig", 6, 0, "speed"), topic("reprint", 10, 0, "pace")];
    const twins = new Map([
      ["orig", new Set(["reprint"])],
      ["reprint", new Set(["orig"])],
    ]);
    expect(rankTopics(m, topics, twins)).toEqual(["reprint"]);
  });

  it("stops at the limit and answers nothing for a term with no forms", () => {
    const m = wordMatcher({ words: ["x-ray"], codes: [] });
    const topics = Array.from({ length: 12 }, (_, i) => topic(`t${i}`, 1, i, "x-ray"));
    expect(rankTopics(m, topics, new Map())).toHaveLength(TOPICS_PER_ENTRY);
    expect(rankTopics(null, topics, new Map())).toEqual([]);
  });
});

describe("fnv1a", () => {
  it("is 8 hex and changes with its input", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });
});
