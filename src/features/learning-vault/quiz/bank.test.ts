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
import { PLAYBOOKS } from "../playbooks";
import { ACADEMY_QUESTIONS, FLOOR_QUESTIONS } from "./authored";
import { playbookRouteFor, questionBank, type QuestionBankInput } from "./bank";
import { DECKS, MIXED_DECKS, deckById, inQuickTen, isDeckId, playableDecks } from "./decks";
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
    // Every one of the method's six decks takes a turn.
    expect(new Set(mixed.questions.map((q) => q.deck))).toEqual(new Set(MIXED_DECKS));
    expect(spy).not.toHaveBeenCalled();
  });

  it("Quick ten deals only the method, never the playbooks (drafts head office has not read)", () => {
    expect([...MIXED_DECKS].sort()).toEqual(["cues", "glossary", "hutchins", "machines", "method", "rep"]);
    expect(inQuickTen("playbooks")).toBe(false);
    expect(bank.some((q) => q.deck === "playbooks")).toBe(true);
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const q of buildRound(bank, "mixed", seed).questions) {
        expect(q.deck, `seed ${seed}: ${q.id}`).not.toBe("playbooks");
        expect(MIXED_DECKS, q.id).toContain(q.deck);
      }
    }
    // The playbooks deck is still its own choice.
    expect(playableDecks(bank).map((d) => d.id)).toContain("playbooks");
    expect(buildRound(bank, "playbooks", 3).questions.every((q) => q.deck === "playbooks")).toBe(true);
    // And the picker says so in plain words.
    expect(deckById("mixed").blurb).toMatch(/the method/i);
    expect(deckById("mixed").blurb).not.toMatch(/every deck/i);
  });

  it("is not offered when only the playbooks and one method deck could deal", () => {
    const only = bank.filter((q) => q.deck === "playbooks" || q.deck === "rep");
    expect(playableDecks(only).map((d) => d.id)).toEqual(["rep", "playbooks"]);
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
    page("twenty-minutes", ["docs/business/the-floor.md:52-56", "docs/business/the-floor.md:66", "docs/business/the-floor.md:109"]),
    page("why-every-rule", ["docs/business/the-floor.md:22-31", "docs/business/the-floor.md:9"]),
    page("the-kit", ["docs/business/the-floor.md:58-60"]),
    page("renewals", ["docs/business/renewals.md:11"]),
  ];

  it("opens the playbook that cites the file most, and the definition's own page for Hutchins", () => {
    expect(playbookRouteFor(HUTCHINS_PATH, playbooks)).toEqual({ kind: "playbook", id: "twenty-minutes" });
    expect(playbookRouteFor(HUTCHINS_PATH, playbooks, { from: 7, to: 31 })).toEqual({ kind: "playbook", id: "why-every-rule" });
    expect(playbookRouteFor("docs/business/packages-and-pricing.md", playbooks)).toBeNull();
    expect(playbookRouteFor(HUTCHINS_PATH, null)).toBeNull();
  });

  it("opens the page that cites the question's own line, never just the file's busiest page", () => {
    const bank = questionBank({ ...input, playbooks });
    const hutchins = bank.filter((q) => q.deck === "hutchins");
    expect(hutchins.every((q) => q.source.route?.kind === "playbook" && q.source.route.id === "why-every-rule")).toBe(true);
    const floor = bank.find((q) => q.id === "f-twenty-minutes");
    expect(floor?.source.route).toEqual({ kind: "playbook", id: "twenty-minutes" });
    // The clicker (the-floor.md:59) is on the kit's page, though the twenty minutes cites the file more.
    expect(bank.find((q) => q.id === "f-clicker")?.source.route).toEqual({ kind: "playbook", id: "the-kit" });
    // "Nobody remembered" (:48) is cited by no page here: no door, never the wrong one.
    expect(bank.find((q) => q.id === "f-nobody-remembered")?.source.route).toBeNull();
    const renew = bank.find((q) => q.id === "f-ten-before");
    expect(renew?.source.route).toEqual({ kind: "playbook", id: "renewals" });
    const pkg = bank.find((q) => q.id === "f-never-expire");
    expect(pkg?.source.route).toBeNull();
    // Without them, no door: the source is named and nothing more.
    expect(questionBank(input).find((q) => q.id === "f-twenty-minutes")?.source.route).toBeNull();
  });

  it("with the real playbooks, every floor question opens a page that cites its line, or none", () => {
    const bank = questionBank({ ...input, playbooks: PLAYBOOKS });
    const cites = (pageId: string, path: string, from: number, to: number) =>
      (PLAYBOOKS.find((p) => p.id === pageId)?.sections ?? []).some((s) =>
        s.blocks.some((b) => {
          const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(b.source.trim());
          if (!m || m[1] !== path) return false;
          const a = Number(m[2]);
          const z = m[3] ? Number(m[3]) : a;
          return !(z < from || a > to);
        }),
      );
    for (const f of FLOOR_QUESTIONS) {
      const q = bank.find((x) => x.id === f.id);
      const route = q?.source.route ?? null;
      const { path, line, toLine } = f.support;
      const anyPage = PLAYBOOKS.some((p) => cites(p.id, path, line, toLine ?? line));
      if (!anyPage) {
        expect(route, f.id).toBeNull();
        continue;
      }
      expect(route?.kind, f.id).toBe("playbook");
      if (route?.kind === "playbook") expect(cites(route.id, path, line, toLine ?? line), `${f.id} -> ${route.id}`).toBe(true);
    }
    // The two the review found opening the twenty minutes.
    expect(bank.find((q) => q.id === "f-clicker")?.source.route).not.toEqual({ kind: "playbook", id: "the-twenty-minutes" });
    expect(bank.find((q) => q.id === "f-nobody-remembered")?.source.route).not.toEqual({ kind: "playbook", id: "the-twenty-minutes" });
  });
});

describe("machine names in the quiz", () => {
  const bank = questionBank(input);
  const machineish = bank.filter((q) => q.id.startsWith("m-") || q.id.startsWith("s-"));

  it("are the Academy's names, never the seed's capitals", () => {
    expect(machineish.length).toBeGreaterThan(5);
    for (const q of machineish) {
      for (const s of [q.prompt, q.explain, q.source.label, ...q.options]) {
        // A run of two capitalised words in capitals ("SEATED ABDOMINALS", "CX (4 WAY")
        // is the seed's name; the cards' own "NEVER" is a word, not a name.
        expect(/\b[A-Z]{2,}\s+\(?[A-Z0-9]{2,}/.test(s), `${q.id}: ${s}`).toBe(false);
      }
      for (const o of q.options) expect(/[A-Z]{3}/.test(o) && o === o.toUpperCase(), `${q.id}: ${o}`).toBe(false);
    }
    expect(bank.find((q) => q.id === "m-handoff-m-neck")?.options[0]).toBe("Cervical Extension");
    const handoff = bank.find((q) => q.id.startsWith("s-handoff"));
    expect(handoff?.prompt).toBe("Put the first rep in order on the Abdominals, Cervical Extension, Compound Row and Pulldown.");
  });

  it("match the written questions' names for the same machine", () => {
    const written = ACADEMY_QUESTIONS.flatMap((q) => q.options).filter((o) => o === "Cervical Extension");
    expect(written.length).toBeGreaterThan(0);
    expect(bank.find((q) => q.id === "m-never-m-neck")?.options[0]).toBe("Cervical Extension");
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
