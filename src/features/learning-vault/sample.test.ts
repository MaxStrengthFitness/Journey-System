/**
 * The sample marks real lines. Each string sample.ts copies is checked here
 * against where it says it comes from, so a rebuilt corpus or an edited
 * definition that changes a line fails this test instead of leaving a sample
 * mark on a line nobody can find. (Tests may import the Academy JSON; source
 * files never do.)
 */
import { describe, expect, it } from "vitest";
import cues from "../academy/content/cues.json";
import performance from "../academy/content/performance.json";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { methodLines } from "../machine-codex/format";
import { learningRefKey } from "../learning/ref";
import { blockKeyFor } from "./blocks";
import { applyMarkup } from "./markup";
import { createSandboxStore } from "./markup-store";
import { PRACTICE_STUDIOS, SAMPLE_LINES, SAMPLE_PAGES, sampleSeed } from "./sample";
import { queueGroups, signalSentence, strikeSignals } from "./submissions";
import type { MachineDefinition } from "../../types/machines";

const NOW = new Date("2026-10-19T14:00:00.000Z");
const SOLON = { id: "solon", name: "Solon" };

const legPressLines = new Set(
  methodLines((MACHINE_DEFINITIONS as Record<string, Partial<MachineDefinition>>)["m-leg-press"]).map((l) => l.text),
);
const cuePhrases = new Set((cues as { cues: { phrases: string[] }[] }).cues.flatMap((c) => c.phrases));
const loadUpTopic = (performance as { topics: { id: string; blocks: { text: string }[] }[] }).topics.find(
  (t) => t.id === "performance-gradual-load-up",
);
const loadUpBlocks = new Set((loadUpTopic?.blocks ?? []).map((b) => b.text));

const sourceOf = (from: string): Set<string> =>
  from === "leg-press" ? legPressLines : from === "cues" ? cuePhrases : loadUpBlocks;

describe("the sample's lines are real", () => {
  it("finds the sources", () => {
    expect(legPressLines.size).toBeGreaterThan(20);
    expect(cuePhrases.size).toBeGreaterThan(50);
    expect(loadUpBlocks.size).toBeGreaterThan(5);
  });

  for (const [name, line] of Object.entries(SAMPLE_LINES)) {
    it(`${name} is word for word where it says it is (${line.from})`, () => {
      expect(sourceOf(line.from).has(line.text)).toBe(true);
    });
  }

  it("every strike, note and quote in the seed is one of those lines", () => {
    const known = new Map(Object.values(SAMPLE_LINES).map((l) => [blockKeyFor(l.text), l.text]));
    const { markup, submissions } = sampleSeed(SOLON, NOW);
    for (const m of markup) {
      for (const s of m.strikes) {
        expect(known.get(s.blockKey)).toBe(s.originalText);
      }
      for (const n of m.notes) {
        expect(known.get(n.blockKey)).toBe(n.quote);
      }
    }
    for (const s of submissions) {
      if (s.blockKey) expect(known.get(s.blockKey)).toBe(s.quote);
    }
  });

  it("a Leg Press line sits on the Leg Press page, a phrase on the phrasebook, a topic block on the topic", () => {
    const pageOf: Record<string, string> = {
      "leg-press": learningRefKey(SAMPLE_PAGES.legPress.ref),
      cues: learningRefKey(SAMPLE_PAGES.cueing.ref),
      topic: learningRefKey(SAMPLE_PAGES.loadUp.ref),
    };
    const fromOf = new Map(Object.values(SAMPLE_LINES).map((l) => [blockKeyFor(l.text), l.from as string]));
    const { markup, submissions } = sampleSeed(SOLON, NOW);
    for (const m of markup) {
      for (const k of [...m.strikes.map((s) => s.blockKey), ...m.notes.map((n) => n.blockKey)]) {
        expect(pageOf[fromOf.get(k)!]).toBe(m.targetKey);
      }
    }
    for (const s of submissions) if (s.blockKey) expect(pageOf[fromOf.get(s.blockKey)!]).toBe(s.targetKey);
  });
});

describe("sampleSeed", () => {
  const seed = sampleSeed(SOLON, NOW);

  it("gives the open studio two crossed-out lines and two notes", () => {
    const mine = seed.markup.filter((m) => m.studioId === "solon");
    expect(mine.flatMap((m) => m.strikes)).toHaveLength(2);
    expect(mine.flatMap((m) => m.notes)).toHaveLength(2);
    expect(mine.every((m) => m.studioName === "Solon")).toBe(true);
  });

  it("gives each practice studio three crossed-out lines, and names no real studio", () => {
    for (const p of PRACTICE_STUDIOS) {
      const theirs = seed.markup.filter((m) => m.studioId === p.id);
      expect(theirs.flatMap((m) => m.strikes)).toHaveLength(3);
      expect(theirs.every((m) => m.studioName === p.name)).toBe(true);
      expect(theirs.flatMap((m) => m.notes)).toEqual([]);
    }
    expect(PRACTICE_STUDIOS.map((p) => p.name)).toEqual(["Practice Studio North", "Practice Studio East", "Practice Studio West"]);
    expect(new Set(seed.markup.map((m) => m.studioId))).toEqual(new Set(["solon", "practice-north", "practice-east", "practice-west"]));
  });

  it("crosses out one line at four studios, so head office reads 'Crossed out at 4 studios'", () => {
    const [top] = strikeSignals(seed.markup);
    expect(signalSentence(top)).toBe("Crossed out at 4 studios");
    expect(top.quote).toBe(SAMPLE_LINES.abd.text);
    expect(top.targetTitle).toBe("Leg Press");
    expect(top.studios.map((s) => s.studioName)).toEqual([
      "Practice Studio East",
      "Practice Studio North",
      "Practice Studio West",
      "Solon",
    ]);
    expect(new Set(top.studios.map((s) => s.reason)).size).toBe(4);
  });

  it("sends three submissions: a dispute and an addition waiting, one already taken", () => {
    const byStatus = seed.submissions.map((s) => `${s.intent}:${s.status}`);
    expect(byStatus).toEqual(["dispute:pending", "addition:pending", "dispute:taken"]);
    const taken = seed.submissions[2];
    expect(taken.decision?.byName).toBeTruthy();
    expect(taken.decision!.at > taken.at).toBe(true);
    expect(queueGroups(seed.submissions)).toHaveLength(3);
  });

  it("dates everything a few days before now, never after", () => {
    const stamps = [
      ...seed.markup.flatMap((m) => [...m.strikes.map((s) => s.at), ...m.notes.map((n) => n.at)]),
      ...seed.submissions.flatMap((s) => [s.at, ...(s.decision ? [s.decision.at] : [])]),
    ];
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    for (const at of stamps) {
      const t = Date.parse(at);
      expect(t).toBeLessThan(NOW.getTime());
      expect(NOW.getTime() - t).toBeLessThan(tenDays);
    }
  });

  it("is the sample people: a leader crosses out, anyone writes notes", () => {
    const people = new Set(seed.markup.flatMap((m) => [...m.strikes.map((s) => s.by.name), ...m.notes.map((n) => n.author.name)]));
    expect(people).toEqual(new Set(["Sam Lee", "Jordan Park"]));
    expect(new Set(seed.markup.flatMap((m) => m.strikes.map((s) => s.by.name)))).toEqual(new Set(["Sam Lee"]));
  });

  it("has unique ids and no undefined anywhere", () => {
    const ids = [...seed.markup.flatMap((m) => m.notes.map((n) => n.id)), ...seed.submissions.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const walk = (v: unknown): void => {
      expect(v).not.toBeUndefined();
      if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
    };
    walk(seed);
  });

  it("is the same sample for the same moment (no randomness)", () => {
    expect(sampleSeed(SOLON, NOW)).toEqual(seed);
  });

  it("seeds a store whose Leg Press page shows the open studio's marks", () => {
    const store = createSandboxStore(sampleSeed(SOLON, NOW));
    const m = store.markupFor("solon", "machine:m-leg-press");
    const lines = [SAMPLE_LINES.abd.text, SAMPLE_LINES.barelyTouch.text].map((text) => ({ key: blockKeyFor(text), kind: "line" as const, text }));
    const out = applyMarkup([{ id: "x", title: "Leg Press", blocks: lines }], m, { lens: "studio", showCrossed: true });
    expect(out.struck).toBe(1);
    expect(out.notes).toBe(1);
    expect(out.orphans).toEqual([]);
  });
});
