/**
 * THE WHOLE BANK, from the real corpus: big enough to play (150 or more once
 * the Academy's chunks are in), every question well formed and sourced,
 * every Learning source a door, and a round dealable from every deck.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import cardsFile from "../../academy/content/cards.json";
import cuesFile from "../../academy/content/cues.json";
import glossaryFile from "../../academy/content/glossary.json";
import index from "../../academy/content/index.json";
import scriptsFile from "../../academy/content/scripts.json";
import type { CueMoment, MachineScript, QuickCard } from "../../academy/types";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import type { MachineDefinition } from "../../../types/machines";
import type { PlaybookPage, QuizQuestion, VaultRoute } from "../types";
import { ACADEMY_QUESTIONS, FLOOR_QUESTIONS } from "./authored";
import { playbookRouteFor, questionBank, type QuestionBankInput } from "./bank";
import { DECKS, deckById, isDeckId, playableDecks } from "./decks";
import { HUTCHINS_PATH } from "./hutchins";
import { buildRound } from "./round";

const defs = MACHINE_DEFINITIONS as unknown as Record<string, Partial<MachineDefinition>>;
const input: QuestionBankInput = {
  glossary: (glossaryFile as { glossary: { term: string; definition: string }[] }).glossary,
  cues: (cuesFile as unknown as { cues: CueMoment[] }).cues,
  scripts: (scriptsFile as unknown as { scripts: MachineScript[] }).scripts,
  cards: (cardsFile as unknown as { cards: QuickCard[] }).cards,
  defs,
  names: (id) => (defs[id]?.name as string | undefined) ?? id,
};

const topicIds = new Set(
  (index as { modules: { id: string; topics: { id: string }[] }[] }).modules.flatMap((m) =>
    m.topics.map((t) => `${m.id}/${t.id}`),
  ),
);

afterEach(() => vi.restoreAllMocks());

describe("the bank", () => {
  const bank = questionBank(input);

  it("holds 150 or more questions once the chunks are in", () => {
    expect(bank.length).toBeGreaterThanOrEqual(150);
  });

  it("holds every written question, and the Hutchins and floor decks at size", () => {
    const supported = bank.filter((q) => "support" in q);
    expect(supported.length).toBeGreaterThanOrEqual(40 + 12);
    expect(bank.filter((q) => q.deck === "hutchins").length).toBeGreaterThanOrEqual(8);
    expect(bank.filter((q) => q.deck === "playbooks").length).toBeGreaterThanOrEqual(12);
  });

  it("gives every deck enough for a round", () => {
    for (const d of DECKS) {
      if (d.id === "mixed") continue;
      expect(bank.filter((q) => q.deck === d.id).length, d.id).toBeGreaterThanOrEqual(8);
    }
  });

  it("has one question per id", () => {
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
  });

  it("is well formed, question by question", () => {
    for (const q of bank) {
      expect(q.prompt.trim().length, q.id).toBeGreaterThan(5);
      expect(q.explain.trim().length, q.id).toBeGreaterThan(5);
      expect(q.source.label.trim().length, q.id).toBeGreaterThan(0);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
      expect(q.options.every((o) => o.trim().length > 0), q.id).toBe(true);
      if (q.kind === "order") {
        expect(q.answer).toBe(-1);
        expect(q.options.length).toBeGreaterThanOrEqual(3);
      } else {
        expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.id).toBeLessThan(q.options.length);
        expect(q.options.length, q.id).toBe(q.kind === "truefalse" ? 2 : 4);
      }
    }
  });

  it("never names a price, and never says he or she", () => {
    for (const q of bank) {
      const words = [q.prompt, q.explain, ...q.options].join(" ");
      expect(words, q.id).not.toContain("$");
      expect(/\b(he|she|his|her|him|hers)\b/i.test(words), `${q.id}: ${words}`).toBe(false);
    }
  });

  it("opens a real Learning page for every source that is one", () => {
    const check = (r: VaultRoute | null, q: QuizQuestion) => {
      if (!r) return;
      if (r.kind === "topic") expect(topicIds.has(`${r.moduleId}/${r.topicId}`), q.id).toBe(true);
      if (r.kind === "card") expect(input.cards?.some((c) => c.id === r.id), q.id).toBe(true);
      if (r.kind === "script") expect(input.scripts?.some((s) => s.id === r.id), q.id).toBe(true);
      if (r.kind === "machine") expect(defs[r.id], q.id).toBeTruthy();
      if (r.kind === "glossary") expect(input.glossary?.some((g) => g.term === r.term), q.id).toBe(true);
      if (r.kind === "cueing") expect((input.cues ?? [])[r.moment ?? 0], q.id).toBeTruthy();
    };
    for (const q of bank) {
      check(q.source.route, q);
      // Everything drawn from the Academy or the seed is a page in Learning.
      if (q.deck !== "hutchins" && q.deck !== "playbooks") expect(q.source.route, q.id).not.toBeNull();
    }
  });

  it("deals a round from every playable deck without repeating a fact, and never calls Math.random", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random called");
    });
    for (const d of playableDecks(bank)) {
      for (const seed of [1, 2, 3]) {
        const r = buildRound(bank, d.id, seed);
        expect(r.questions.length, d.id).toBe(Math.min(10, r.questions.length));
        expect(r.questions.length, d.id).toBeGreaterThanOrEqual(8);
        const facts = r.questions.map((q) => (q as { fact?: string }).fact).filter(Boolean);
        expect(new Set(facts).size).toBe(facts.length);
      }
    }
    const mixed = buildRound(bank, "mixed", 11);
    expect(mixed.questions).toHaveLength(10);
    expect(new Set(mixed.questions.map((q) => q.deck)).size).toBeGreaterThanOrEqual(7);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("before the chunks land", () => {
  it("still deals the written questions", () => {
    const bank = questionBank({ ...input, glossary: null, cues: null, scripts: null, cards: null, defs: {} });
    expect(bank.length).toBe(ACADEMY_QUESTIONS.length + FLOOR_QUESTIONS.length + bank.filter((q) => q.deck === "hutchins").length);
    expect(bank.some((q) => q.deck === "glossary" || q.deck === "cues")).toBe(false);
    expect(playableDecks(bank).map((d) => d.id)).toEqual(["mixed", "rep", "machines", "method", "hutchins", "playbooks"]);
  });
});

describe("Read it, for a question from docs/business", () => {
  const page = (id: string, sources: string[]): PlaybookPage => ({
    id,
    title: id,
    lede: "",
    pillar: "floor",
    status: "draft",
    sections: [{ id: "s", title: "S", blocks: sources.map((source) => ({ kind: "para" as const, text: "x", source })) }],
    related: [],
  });
  const playbooks = [
    page("twenty-minutes", ["docs/business/the-floor.md:50", "docs/business/the-floor.md:66", "docs/business/the-floor.md:109"]),
    page("why-every-rule", ["docs/business/the-floor.md:22-31", "docs/business/the-floor.md:9"]),
    page("renewals", ["docs/business/renewals.md:11"]),
  ];

  it("opens the playbook that cites the file most, and the definition's own page for Hutchins", () => {
    expect(playbookRouteFor(HUTCHINS_PATH, playbooks)).toEqual({ kind: "playbook", id: "twenty-minutes" });
    expect(playbookRouteFor(HUTCHINS_PATH, playbooks, { from: 7, to: 31 })).toEqual({ kind: "playbook", id: "why-every-rule" });
    expect(playbookRouteFor("docs/business/packages-and-pricing.md", playbooks)).toBeNull();
    expect(playbookRouteFor(HUTCHINS_PATH, null)).toBeNull();
  });

  it("is given to the floor and Hutchins questions when the playbooks are passed in", () => {
    const bank = questionBank({ ...input, playbooks });
    const hutchins = bank.filter((q) => q.deck === "hutchins");
    expect(hutchins.every((q) => q.source.route?.kind === "playbook" && q.source.route.id === "why-every-rule")).toBe(true);
    const floor = bank.find((q) => q.id === "f-twenty-minutes");
    expect(floor?.source.route).toEqual({ kind: "playbook", id: "twenty-minutes" });
    const renew = bank.find((q) => q.id === "f-ten-before");
    expect(renew?.source.route).toEqual({ kind: "playbook", id: "renewals" });
    const pkg = bank.find((q) => q.id === "f-never-expire");
    expect(pkg?.source.route).toBeNull();
    // Without them, no door: the source is named and nothing more.
    expect(questionBank(input).find((q) => q.id === "f-twenty-minutes")?.source.route).toBeNull();
  });
});

describe("the decks", () => {
  it("are the eight the contract names, in picker order, each with a title and a line", () => {
    expect(DECKS.map((d) => d.id)).toEqual(["mixed", "cues", "rep", "machines", "glossary", "method", "hutchins", "playbooks"]);
    expect(deckById("hutchins").title).toBe("Why we train this way");
    expect(deckById("cues").title).toBe("What would you say?");
    expect(deckById("rep").title).toBe("The repetition");
    expect(deckById("method").title).toBe("The method");
    expect(deckById("playbooks").title).toBe("The floor and the conversation");
    expect(deckById("mixed").title).toBe("Quick ten");
    for (const d of DECKS) expect(d.blurb.length).toBeGreaterThan(10);
    expect(isDeckId("cues")).toBe(true);
    expect(isDeckId("nope")).toBe(false);
  });

  it("never count, rank or keep a score in their words", () => {
    for (const d of DECKS) expect(`${d.title} ${d.blurb}`).not.toMatch(/\b(score|points?|streak|best|rank|level|badge)\b/i);
  });
});
