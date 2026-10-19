/**
 * "WHY WE TRAIN THIS WAY" never quotes the book.
 *
 * AJ's rule (Sep 27 2026): The Renaissance of Exercise is paraphrased with a
 * reference, never quoted. This reads Hutchins' definition as AJ recorded
 * it in docs/business/the-floor.md and fails if any string the quiz shows
 * (the Hutchins deck, and every written question besides) shares a run of
 * six or more consecutive words with it. It also holds the deck to the
 * floor's own clause table: eight clauses, each paraphrased and labelled.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "../types";
import { ACADEMY_QUESTIONS, FLOOR_QUESTIONS } from "./authored";
import { DECKS } from "./decks";
import {
  CLAUSES,
  FLOOR_NOTE,
  HUTCHINS_LABEL,
  HUTCHINS_LINES,
  HUTCHINS_PATH,
  HUTCHINS_QUESTIONS,
  pickThreeOthers,
} from "./hutchins";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const floorText = readFileSync(join(ROOT, HUTCHINS_PATH), "utf8").replace(/\r\n/g, "\n");
const floorLines = floorText.split("\n");

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** The quoted definition: the block quote that ends with "— Ken Hutchins". */
function definition(): string {
  const start = floorLines.findIndex((l) => l.startsWith('> "Exercise is'));
  const end = floorLines.findIndex((l, i) => i > start && /Ken Hutchins/.test(l));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return floorLines
    .slice(start, end)
    .map((l) => l.replace(/^>\s?/, ""))
    .join(" ");
}

function sixGrams(text: string): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(" "));
  return out;
}

function stringsOf(q: QuizQuestion): string[] {
  return [q.prompt, q.explain, q.source.label, ...q.options];
}

describe("the definition the deck rests on", () => {
  it("is where the deck says it is", () => {
    const def = definition();
    expect(words(def).length).toBeGreaterThan(30);
    const startLine = floorLines.findIndex((l) => l.startsWith('> "Exercise is')) + 1;
    expect(startLine).toBeGreaterThanOrEqual(HUTCHINS_LINES.from);
    expect(startLine).toBeLessThanOrEqual(HUTCHINS_LINES.to);
  });

  it("has a clause table of eight rows, and the deck paraphrases each", () => {
    const rows = floorLines.slice(HUTCHINS_LINES.from - 1, HUTCHINS_LINES.to).filter((l) => /^\| \*/.test(l));
    expect(rows).toHaveLength(8);
    expect(CLAUSES).toHaveLength(8);
  });
});

describe("never a quotation", () => {
  const grams = sixGrams(definition());

  it("shares no run of six words with the definition, anywhere in the Hutchins deck", () => {
    for (const q of HUTCHINS_QUESTIONS) {
      for (const s of stringsOf(q)) {
        for (const g of sixGrams(s)) expect(grams.has(g), `${q.id}: "${g}"`).toBe(false);
      }
    }
    for (const c of CLAUSES) {
      for (const s of [c.clause, c.built, c.why]) {
        for (const g of sixGrams(s)) expect(grams.has(g), `${c.id}: "${g}"`).toBe(false);
      }
    }
  });

  it("nor in any other written question, nor a deck's blurb", () => {
    for (const q of [...ACADEMY_QUESTIONS, ...FLOOR_QUESTIONS]) {
      for (const s of stringsOf(q)) {
        for (const g of sixGrams(s)) expect(grams.has(g), `${q.id}: "${g}"`).toBe(false);
      }
    }
    for (const d of DECKS) for (const g of sixGrams(d.blurb)) expect(grams.has(g), d.id).toBe(false);
  });

  it("would catch a quotation if one crept in (the check itself works)", () => {
    const quoted = "the body performs work of a demanding nature";
    expect([...sixGrams(quoted)].some((g) => grams.has(g))).toBe(true);
  });
});

/** The two questions that rest on AJ's note about the definition, not on the definition. */
const ON_THE_NOTE = new Set(["h-who", "h-reject"]);

describe("the deck", () => {
  it("has at least eight questions; each built on the definition is labelled as a paraphrase of the book", () => {
    expect(HUTCHINS_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    for (const q of HUTCHINS_QUESTIONS) {
      expect(q.deck).toBe("hutchins");
      expect(q.source.path).toBe(HUTCHINS_PATH);
      if (ON_THE_NOTE.has(q.id)) continue;
      expect(q.source.label, q.id).toBe(HUTCHINS_LABEL);
      expect(q.source.paraphrased, q.id).toBe(true);
    }
    expect(HUTCHINS_LABEL).toBe(
      "Paraphrased from Ken Hutchins' definition of exercise (The Renaissance of Exercise)",
    );
  });

  it("labels AJ's note as the floor's notes, never as the book (the-floor.md:9-12)", () => {
    for (const id of ON_THE_NOTE) {
      const q = HUTCHINS_QUESTIONS.find((x) => x.id === id);
      expect(q?.source, id).toEqual(FLOOR_NOTE);
      expect(q?.source.paraphrased, id).toBeUndefined();
    }
    expect(FLOOR_NOTE.label).toBe("Journey's notes · The floor");
    expect(FLOOR_NOTE.path).toBe(HUTCHINS_PATH);
    // The note says "almost every rule", and it is about a change to the app,
    // not adding a machine to a session (which any trainer may do).
    expect(floorText).toContain("almost every rule in the app");
    expect(HUTCHINS_QUESTIONS.find((q) => q.id === "h-who")?.prompt).toMatch(/^Almost every rule/);
    const reject = HUTCHINS_QUESTIONS.find((q) => q.id === "h-reject")?.prompt ?? "";
    expect(reject).toMatch(/change to Journey/);
    expect(reject).not.toMatch(/session/i);
  });

  it("puts no word in the floor's mouth that the floor never says", () => {
    // "said out loud" (the load is STATED on the Now Bar, the-floor.md:28) and
    // "calm" (the table says "No hype, no celebration", :26) were both added once.
    for (const w of ["out loud", "aloud", "calm"]) {
      expect(floorText.toLowerCase(), w).not.toContain(w);
      for (const q of HUTCHINS_QUESTIONS) expect(stringsOf(q).join(" ").toLowerCase(), `${q.id}: ${w}`).not.toContain(w);
      for (const c of CLAUSES) expect(`${c.clause} ${c.built} ${c.why}`.toLowerCase(), `${c.id}: ${w}`).not.toContain(w);
    }
    expect(CLAUSES.find((c) => c.id === "loading")?.why).toMatch(/stated on the Now Bar, never assumed/);
  });

  it("never offers a set to failure and inroading as each other's wrong answer", () => {
    const clause = (id: string) => CLAUSES.find((c) => c.id === id)?.clause as string;
    expect(HUTCHINS_QUESTIONS.find((q) => q.id === "h-demanding")?.options).not.toContain(clause("inroad"));
    expect(HUTCHINS_QUESTIONS.find((q) => q.id === "h-inroad")?.options).not.toContain(clause("demanding"));
    // Every other clause question keeps the clauses one, three and five steps on.
    CLAUSES.forEach((c, i) => {
      if (c.id === "demanding" || c.id === "inroad") return;
      expect(pickThreeOthers(i), c.id).toEqual([1, 3, 5].map((s) => (i + s) % CLAUSES.length));
    });
  });

  it("offers four different clauses on every clause question, the right one included", () => {
    for (const q of HUTCHINS_QUESTIONS.filter((x) => CLAUSES.some((c) => `h-${c.id}` === x.id))) {
      expect(new Set(q.options).size).toBe(4);
      const clause = CLAUSES.find((c) => `h-${c.id}` === q.id);
      expect(q.options[q.answer]).toBe(clause?.clause);
    }
  });

  it("claims nothing about the book beyond its title and author", () => {
    for (const q of HUTCHINS_QUESTIONS) {
      const text = stringsOf(q).join(" ");
      expect(text).not.toMatch(/\b(chapter|page|volume|vol\.|the book says|hutchins (said|says|wrote|writes))\b/i);
    }
  });
});
