/**
 * PLAYBOOKS — what holds the drafts honest.
 *
 * A playbook is Claude's draft from Journey's notes, waiting on head office
 * (Corporate owns the method). So the test holds what a reader at head office
 * would otherwise have to check by hand:
 *   - every line cites a file that exists, from the allowed list, at a line
 *     that is inside it and not blank;
 *   - every route a page or a track points at is a real place (an Academy
 *     topic inside the module named, one of the 20 MSF machines, a playbook,
 *     a glossary term, a quiz deck), titled as that place titles itself;
 *   - no price anywhere ("Pricing can vary by location"), no "most popular",
 *     no guessed pronoun, no starting weight, no rep count stated as a rule;
 *   - Hutchins' definition is paraphrased, never quoted: no run of four words
 *     on the Hutchins page, or six anywhere, matches the definition as
 *     docs/business/the-floor.md records it;
 *   - every page is a draft.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import indexFile from "../../academy/content/index.json";
import glossaryFile from "../../academy/content/glossary.json";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import type { PlaybookPage, QuizDeckId, VaultRoute } from "../types";
import {
  HUTCHINS_LABEL,
  parsePlaybookSource,
  PILLARS,
  pillarOf,
  PLAYBOOK_DRAFT_LINE,
  playbookById,
  PLAYBOOKS,
  playbookSourceFiles,
  playbookSourceLabel,
  playbookSourcesLine,
  playbooksForPillar,
  SOURCE_TITLES,
  trackById,
  TRACKS,
} from "./index";
import { at } from "./write";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const fileCache = new Map<string, string[]>();
function linesOf(rel: string): string[] {
  const hit = fileCache.get(rel);
  if (hit) return hit;
  const lines = readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n").split("\n");
  fileCache.set(rel, lines);
  return lines;
}

interface IndexShape {
  modules: { id: string; title: string; topics: { id: string; title: string }[] }[];
}
const INDEX = indexFile as unknown as IndexShape;
const GLOSSARY_TERMS = new Set((glossaryFile as unknown as { glossary: { term: string }[] }).glossary.map((g) => g.term));
const DECKS: QuizDeckId[] = ["mixed", "glossary", "cues", "rep", "machines", "method", "hutchins", "playbooks"];
const PLAYBOOK_IDS = new Set(PLAYBOOKS.map((p) => p.id));

/** Every reader-facing string on a page: title, lede, section titles, block text, related. */
function pageWords(p: PlaybookPage): string[] {
  return [
    p.title,
    p.lede,
    ...p.sections.flatMap((s) => [s.title, ...s.blocks.map((b) => b.text)]),
    ...p.related.flatMap((r) => [r.title, r.why]),
  ];
}
const trackWords = TRACKS.flatMap((t) => [t.title, t.who, ...t.steps.flatMap((s) => [s.title, s.why])]);
const pillarWords = PILLARS.flatMap((p) => [p.title, p.blurb]);
const ALL_WORDS = [...PLAYBOOKS.flatMap(pageWords), ...trackWords, ...pillarWords, PLAYBOOK_DRAFT_LINE];

/** Where a route goes, and the title that place gives itself. Null when it isn't a real place. */
function placeTitle(route: VaultRoute): string | null {
  switch (route.kind) {
    case "topic": {
      const mod = INDEX.modules.find((m) => m.id === route.moduleId);
      return mod?.topics.find((t) => t.id === route.topicId)?.title ?? null;
    }
    case "module":
      return INDEX.modules.find((m) => m.id === route.moduleId)?.title ?? null;
    case "machine":
      return MACHINE_DEFINITIONS[route.id]?.name ?? null;
    case "playbook":
      return playbookById(route.id)?.title ?? null;
    case "glossary":
      if (route.term === undefined) return "Glossary";
      return GLOSSARY_TERMS.has(route.term) ? route.term : null;
    case "cueing":
      return route.moment === undefined ? "Cueing phrasebook" : null;
    case "quiz":
      return route.deck && DECKS.includes(route.deck) ? "(quiz)" : null;
    default:
      return null;
  }
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function runs(text: string, n: number): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** The definition exactly as the-floor.md quotes it (the block quote that opens "Exercise is a process"). */
function hutchinsDefinition(): string {
  const lines = linesOf("docs/business/the-floor.md");
  const start = lines.findIndex((l) => l.startsWith('> "Exercise is a process'));
  const end = lines.findIndex((l, i) => i >= start && l.includes("within minimum time"));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThanOrEqual(start);
  return lines
    .slice(start, end + 1)
    .map((l) => l.replace(/^>\s?/, ""))
    .join(" ");
}

describe("pillars", () => {
  it("are the five shelves, in order, with the contract's titles", () => {
    expect(PILLARS.map((p) => [p.id, p.title])).toEqual([
      ["floor", "The floor and the protocol"],
      ["equipment", "Equipment and cueing"],
      ["programming", "Programming and adapting"],
      ["consult", "Consultations and packages"],
      ["retention", "Relationships and renewals"],
    ]);
    for (const p of PILLARS) expect(p.blurb.length).toBeGreaterThan(10);
  });

  it("each has at least one playbook, in reading order", () => {
    for (const p of PILLARS) expect(playbooksForPillar(p.id).length).toBeGreaterThan(0);
    const order = PILLARS.map((p) => p.id);
    const seen = PLAYBOOKS.map((p) => order.indexOf(p.pillar));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(pillarOf(playbookById("ford")!)?.title).toBe("Relationships and renewals");
  });
});

describe("playbook pages", () => {
  it("have unique, link-safe ids and are found by id", () => {
    expect(PLAYBOOK_IDS.size).toBe(PLAYBOOKS.length);
    for (const p of PLAYBOOKS) {
      expect(p.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(playbookById(p.id)).toBe(p);
    }
    expect(playbookById("nope")).toBeNull();
  });

  it("covers the eight pages the contract names, plus the kit", () => {
    expect([...PLAYBOOK_IDS].sort()).toEqual(
      [
        "first-sessions",
        "ford",
        "packages",
        "progress-report",
        "pulse",
        "renewals",
        "the-kit",
        "the-twenty-minutes",
        "why-every-rule",
      ].sort(),
    );
  });

  it("are every one a draft", () => {
    for (const p of PLAYBOOKS) expect(p.status).toBe("draft");
    expect(PLAYBOOK_DRAFT_LINE).toMatch(/draft/i);
    expect(PLAYBOOK_DRAFT_LINE).toMatch(/head office/);
  });

  it("each have a lede, 3 to 6 sections, and 2 to 8 lines a section", () => {
    for (const p of PLAYBOOKS) {
      expect(p.lede.trim().length, p.id).toBeGreaterThan(20);
      expect(p.sections.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.sections.length, p.id).toBeLessThanOrEqual(6);
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
      for (const s of p.sections) {
        expect(s.id, p.id).toMatch(/^[a-z0-9-]+$/);
        expect(s.title.trim().length, `${p.id}/${s.id}`).toBeGreaterThan(0);
        expect(s.blocks.length, `${p.id}/${s.id}`).toBeGreaterThanOrEqual(2);
        expect(s.blocks.length, `${p.id}/${s.id}`).toBeLessThanOrEqual(8);
        for (const b of s.blocks) {
          expect(["para", "bullet"]).toContain(b.kind);
          expect(b.text.trim().length, `${p.id}/${s.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never repeat the same line twice on one page", () => {
    for (const p of PLAYBOOKS) {
      const texts = p.sections.flatMap((s) => s.blocks.map((b) => b.text));
      expect(new Set(texts).size, p.id).toBe(texts.length);
    }
  });
});

describe("every line says where it came from", () => {
  const blocks = PLAYBOOKS.flatMap((p) =>
    p.sections.flatMap((s) => s.blocks.map((b) => ({ where: `${p.id}/${s.id}: ${b.text.slice(0, 40)}`, b }))),
  );

  it("as path:line or path:from-to, from a file on the allowed list", () => {
    for (const { where, b } of blocks) {
      const parsed = parsePlaybookSource(b.source);
      expect(parsed, where).not.toBeNull();
      expect(Object.keys(SOURCE_TITLES), where).toContain(parsed!.path);
    }
  });

  it("whose file exists and holds that line, and the line isn't blank", () => {
    for (const { where, b } of blocks) {
      const parsed = parsePlaybookSource(b.source)!;
      expect(existsSync(join(ROOT, parsed.path)), `${where} → ${parsed.path}`).toBe(true);
      const lines = linesOf(parsed.path);
      expect(parsed.to, `${where} → ${b.source} (file has ${lines.length} lines)`).toBeLessThanOrEqual(lines.length);
      expect(lines[parsed.from - 1].trim().length, `${where} → ${b.source} starts on a blank line`).toBeGreaterThan(0);
    }
  });

  it("and every allowed file still exists", () => {
    for (const path of Object.keys(SOURCE_TITLES)) expect(existsSync(join(ROOT, path)), path).toBe(true);
  });

  it("never the Academy's stale or excluded files", () => {
    for (const { where, b } of blocks) {
      expect(b.source, where).not.toMatch(/Consultation Script|Starting Weights|Research\.txt|MSF OVERVIEW/i);
    }
  });

  it("can be named for a reader", () => {
    expect(playbookSourceLabel(at("docs/business/the-floor.md", 66))).toBe("The floor · line 66");
    expect(playbookSourceLabel(at("docs/business/the-floor.md", 52, 53))).toBe("The floor · lines 52\u201353");
    expect(playbookSourceLabel("docs/other/thing.md:4")).toBe("thing.md · line 4");
    expect(playbookSourceLabel("not a source")).toBe("not a source");
    expect(at("a.md", 3, 3)).toBe("a.md:3");
    expect(parsePlaybookSource("a.md:0")).toBeNull();
    expect(parsePlaybookSource("a.md:5-3")).toBeNull();
    expect(parsePlaybookSource("C:/x/a b.txt:7-9")).toEqual({ path: "C:/x/a b.txt", from: 7, to: 9 });
  });

  it("and each page says which files it drew from", () => {
    const floor = playbookById("the-twenty-minutes")!;
    expect(playbookSourcesLine(floor)).toBe("Written from: The floor · History before Journey");
    expect(playbookSourceFiles(floor)).toEqual([
      "docs/business/the-floor.md",
      "docs/business/migration-and-prior-history.md",
    ]);
    for (const p of PLAYBOOKS) expect(playbookSourcesLine(p), p.id).toMatch(/^Written from: /);
  });
});

describe("every route is a real place", () => {
  const routes = [
    ...PLAYBOOKS.flatMap((p) => p.related.map((r) => ({ where: `${p.id} related`, r }))),
    ...TRACKS.flatMap((t) => t.steps.map((r) => ({ where: `${t.id} step`, r }))),
  ];

  it("and goes where it says", () => {
    for (const { where, r } of routes) {
      const title = placeTitle(r.route);
      expect(title, `${where}: ${JSON.stringify(r.route)}`).not.toBeNull();
    }
  });

  it("titled as the place titles itself", () => {
    for (const { where, r } of routes) {
      const title = placeTitle(r.route);
      if (r.route.kind === "quiz") continue;
      expect(r.title.toLowerCase(), `${where}: ${JSON.stringify(r.route)}`).toBe(title!.toLowerCase());
    }
  });

  it("with a one-line why", () => {
    for (const { where, r } of routes) {
      expect(r.why.trim().length, where).toBeGreaterThan(8);
      expect(r.why, where).not.toMatch(/\n/);
    }
  });

  it("and a page never points at itself", () => {
    for (const p of PLAYBOOKS) {
      for (const r of p.related) {
        expect(r.route.kind === "playbook" && r.route.id === p.id, p.id).toBe(false);
      }
      expect(p.related.length, p.id).toBeGreaterThan(0);
    }
  });
});

describe("tracks", () => {
  it("are the seven the contract names", () => {
    expect(TRACKS.map((t) => t.title)).toEqual([
      "Life Transformer 101",
      "Equipment and cueing",
      "Programming and adapting",
      "Consultations and packages",
      "Relationships and renewals",
      "For a head trainer",
      "For a studio leader",
    ]);
    expect(trackById("life-transformer-101")?.who).toBe("A new Life Transformer");
    expect(trackById("nope")).toBeNull();
  });

  it("each run 5 to 9 steps, none twice", () => {
    const ids = TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TRACKS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(5);
      expect(t.steps.length, t.id).toBeLessThanOrEqual(9);
      const keys = t.steps.map((s) => JSON.stringify(s.route));
      expect(new Set(keys).size, t.id).toBe(keys.length);
    }
  });

  it("point at the playbooks they're named for", () => {
    const ids = (trackId: string) =>
      trackById(trackId)!.steps.flatMap((s) => (s.route.kind === "playbook" ? [s.route.id] : []));
    expect(ids("relationships-and-renewals")).toEqual(
      expect.arrayContaining(["ford", "pulse", "progress-report", "renewals"]),
    );
    expect(ids("consultations-and-packages")).toContain("packages");
    expect(ids("life-transformer-101")).toEqual(expect.arrayContaining(["the-twenty-minutes", "why-every-rule"]));
  });

  it("keep no progress: a track is a list of places, nothing else", () => {
    for (const t of TRACKS) expect(Object.keys(t).sort()).toEqual(["id", "steps", "title", "who"]);
    for (const w of trackWords) expect(w).not.toMatch(/\b(points?|score|streak|badge|level up|leaderboard|completed?)\b/i);
  });
});

describe("the words", () => {
  it("never carry a price", () => {
    for (const w of ALL_WORDS) expect(w).not.toContain("$");
    expect(JSON.stringify({ PLAYBOOKS, TRACKS, PILLARS })).not.toContain("$");
  });

  it("never call a package most popular", () => {
    for (const w of ALL_WORDS) expect(w.toLowerCase()).not.toMatch(/most popular(?!")/);
  });

  it("never guess a client's pronoun", () => {
    for (const w of ALL_WORDS) expect(w, w).not.toMatch(/\b(she|her|hers|herself|he|him|his|himself)\b/i);
  });

  it("never give a starting weight", () => {
    for (const w of ALL_WORDS) expect(w, w).not.toMatch(/\b\d+\s*(lb|lbs)\b/i);
  });

  it("never make a rep count a rule: a rep range is always the protocol's advice", () => {
    for (const w of ALL_WORDS) {
      if (/\b(6|six)\s*(to|-|–)\s*(10|ten)\s+reps\b/i.test(w)) expect(w, w).toMatch(/advis/);
    }
  });

  it("never name the app's insides", () => {
    for (const w of ALL_WORDS) {
      expect(w, w).not.toMatch(/Firestore|README|\.tsx?\b|\.json\b|`|src\//);
    }
  });

  it("say Life Transformer for the trainer and Life Transformed for the package, never mixed up", () => {
    const packages = playbookById("packages")!;
    const text = pageWords(packages).join(" ");
    expect(text).toContain("Life Transformed: 18 months, 144 sessions.");
    expect(text).toContain("Life Transformer is you.");
  });
});

describe("Hutchins' definition", () => {
  const definition = hutchinsDefinition();
  const page = playbookById("why-every-rule")!;

  it("is labelled as a paraphrase, with the book named", () => {
    expect(HUTCHINS_LABEL).toBe(
      "Paraphrased from Ken Hutchins' definition of exercise (The Renaissance of Exercise)",
    );
    expect(page.sections[0].blocks[0].text).toBe(HUTCHINS_LABEL);
  });

  it("names all eight parts", () => {
    const parts = page.sections.find((s) => s.id === "parts")!;
    expect(parts.blocks).toHaveLength(8);
  });

  it("is read whole from the floor notes, so the checks below have something to check", () => {
    expect(words(definition).length).toBeGreaterThan(35);
    expect(definition).toMatch(/^"Exercise is a process/);
    expect(definition).toMatch(/within minimum time\."$/);
  });

  it("is never quoted on its own page: no four words in a row match it", () => {
    const quoted = runs(definition, 4);
    for (const w of pageWords(page)) {
      for (const run of runs(w, 4)) expect(quoted.has(run), `"${run}" in: ${w}`).toBe(false);
    }
  });

  it("is never quoted anywhere else either: no six words in a row match it", () => {
    const quoted = runs(definition, 6);
    for (const w of ALL_WORDS) {
      for (const run of runs(w, 6)) expect(quoted.has(run), `"${run}" in: ${w}`).toBe(false);
    }
  });

  it("is still where the page says it is", () => {
    const cited = page.sections[0].blocks[1].source;
    const parsed = parsePlaybookSource(cited)!;
    const lines = linesOf(parsed.path).slice(parsed.from - 1, parsed.to).join(" ");
    expect(lines).toContain("Exercise is a process");
    expect(lines).toContain("within minimum time");
  });
});
