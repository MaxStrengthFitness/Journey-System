/**
 * A ROUND, held: seeded, never Math.random, options shuffled with the answer
 * following its option, an order question always jumbled, and the end's one
 * sentence counted the same way the screen counts it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuizQuestion } from "../types";
import type { QuizItem } from "./decks";
import {
  buildRound,
  checkAnswer,
  dealQuestion,
  mulberry32,
  nextSeed,
  roundLine,
  roundSummary,
  shuffled,
} from "./round";

const src = { label: "Fixture", route: null };

function choice(id: string, deck: QuizItem["deck"], right: string, wrong: string[], fact?: string): QuizItem {
  return { id, deck, kind: "choice", prompt: `Q ${id}`, options: [right, ...wrong], answer: 0, explain: "Because.", source: src, fact };
}

const BANK: QuizItem[] = [
  ...Array.from({ length: 12 }, (_, i) => choice(`c${i}`, "cues", `right ${i}`, ["w1", "w2", "w3"])),
  ...Array.from({ length: 4 }, (_, i) => choice(`g${i}`, "glossary", `term ${i}`, ["x1", "x2", "x3"])),
  ...Array.from({ length: 3 }, (_, i) => choice(`m${i}`, "machines", `machine ${i}`, ["y1", "y2", "y3"], "machine:handoff")),
  {
    id: "o1",
    deck: "rep",
    kind: "order",
    prompt: "Order",
    options: ["one", "two", "three", "four"],
    answer: -1,
    explain: "In order.",
    source: src,
  },
  {
    id: "t1",
    deck: "rep",
    kind: "truefalse",
    prompt: "True?",
    options: ["True", "False"],
    answer: 1,
    explain: "No.",
    source: src,
  },
];

afterEach(() => vi.restoreAllMocks());

describe("mulberry32", () => {
  it("gives the same numbers for the same seed, in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBe(50);
  });

  it("differs between seeds, and nextSeed moves on", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(nextSeed(7)).not.toBe(7);
    expect(nextSeed(7)).toBe(nextSeed(7));
  });

  it("shuffles a copy, never the original", () => {
    const xs = [1, 2, 3, 4, 5];
    const out = shuffled(xs, mulberry32(3));
    expect(xs).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(xs);
  });
});

describe("buildRound", () => {
  it("never calls Math.random", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random called");
    });
    expect(() => buildRound(BANK, "mixed", 123)).not.toThrow();
    expect(() => buildRound(BANK, "cues", 9)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("deals the same round from the same seed, and another from another", () => {
    const a = buildRound(BANK, "cues", 99);
    const b = buildRound(BANK, "cues", 99);
    expect(a).toEqual(b);
    const c = buildRound(BANK, "cues", 100);
    expect(c.questions.map((q) => q.id)).not.toEqual(a.questions.map((q) => q.id));
  });

  it("deals ten from one deck and nothing from another", () => {
    const r = buildRound(BANK, "cues", 5);
    expect(r.deck).toBe("cues");
    expect(r.questions).toHaveLength(10);
    expect(r.questions.every((q) => q.deck === "cues")).toBe(true);
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(10);
  });

  it("deals all a small deck has, and never the same fact twice", () => {
    const r = buildRound(BANK, "machines", 5);
    // Three questions, one fact: one question.
    expect(r.questions).toHaveLength(1);
    expect(buildRound(BANK, "glossary", 5).questions).toHaveLength(4);
    expect(buildRound(BANK, "hutchins", 5).questions).toHaveLength(0);
    expect(buildRound(BANK, "cues", 5, 3).questions).toHaveLength(3);
  });

  it("mixes the decks in the Quick ten rather than filling it from the biggest", () => {
    const r = buildRound(BANK, "mixed", 77);
    expect(r.questions).toHaveLength(10);
    const decks = new Set(r.questions.map((q) => q.deck));
    expect(decks.size).toBe(4);
    expect(r.questions.filter((q) => q.deck === "machines")).toHaveLength(1);
  });

  it("shuffles a choice's options and the answer follows its option", () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const q of buildRound(BANK, "cues", seed).questions) {
        const original = BANK.find((b) => b.id === q.id) as QuizItem;
        expect(q.options[q.answer]).toBe(original.options[original.answer]);
        expect([...q.options].sort()).toEqual([...original.options].sort());
      }
    }
    const firsts = new Set(
      Array.from({ length: 20 }, (_, s) => buildRound(BANK, "cues", s).questions[0].answer),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("keeps True and False in their places", () => {
    const tf = BANK.find((q) => q.id === "t1") as QuizItem;
    for (let s = 0; s < 10; s++) {
      const dealt = dealQuestion(tf, mulberry32(s));
      expect(dealt.options).toEqual(["True", "False"]);
      expect(dealt.answer).toBe(1);
    }
  });

  it("keeps an order question's options in order and deals a jumbled pile", () => {
    const o = BANK.find((q) => q.id === "o1") as QuizItem;
    for (let s = 0; s < 40; s++) {
      const dealt = dealQuestion(o, mulberry32(s));
      expect(dealt.options).toEqual(o.options);
      expect(dealt.answer).toBe(-1);
      expect([...(dealt.deal ?? [])].sort()).toEqual([0, 1, 2, 3]);
      expect(dealt.deal).not.toEqual([0, 1, 2, 3]);
    }
  });

  it("does not change the bank it deals from", () => {
    const before = JSON.stringify(BANK);
    buildRound(BANK, "mixed", 1);
    buildRound(BANK, "rep", 1);
    expect(JSON.stringify(BANK)).toBe(before);
  });
});

describe("checkAnswer", () => {
  const q: QuizQuestion = { ...choice("x", "cues", "a", ["b", "c", "d"]), answer: 2 };
  const o = BANK.find((b) => b.id === "o1") as QuizQuestion;

  it("is right only on the answer", () => {
    expect(checkAnswer(q, 2)).toBe(true);
    expect(checkAnswer(q, 0)).toBe(false);
    expect(checkAnswer(q, [2])).toBe(false);
  });

  it("is right on an order question only when every item is in its place", () => {
    expect(checkAnswer(o, [0, 1, 2, 3])).toBe(true);
    expect(checkAnswer(o, [1, 0, 2, 3])).toBe(false);
    expect(checkAnswer(o, [0, 1, 2])).toBe(false);
    expect(checkAnswer(o, 0)).toBe(false);
  });
});

describe("roundSummary", () => {
  it("counts the right ones and lists the rest in the order asked", () => {
    const round = buildRound(BANK, "glossary", 4);
    const [a, b, c, d] = round.questions;
    const answers = [
      { questionId: a.id, right: true, picked: a.answer },
      { questionId: b.id, right: false, picked: (b.answer + 1) % 4 },
      { questionId: c.id, right: true, picked: c.answer },
    ];
    const s = roundSummary(round, answers);
    expect(s.right).toBe(2);
    expect(s.total).toBe(4);
    // b was wrong and d was never answered: both are missed, in order.
    expect(s.missed.map((q) => q.id)).toEqual([b.id, d.id]);
  });

  it("believes the answer, not a `right` flag", () => {
    const round = buildRound(BANK, "glossary", 4);
    const a = round.questions[0];
    const s = roundSummary(round, [{ questionId: a.id, right: true, picked: (a.answer + 1) % 4 }]);
    expect(s.right).toBe(0);
  });

  it("says it once, in words", () => {
    expect(roundLine(7, 10)).toBe("7 of 10 this round");
  });
});
