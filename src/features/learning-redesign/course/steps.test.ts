import { describe, expect, it } from "vitest";
import { vaultSection } from "../../learning-vault/blocks";
import type { VaultBlock, VaultBlockKind, VaultSection } from "../../learning-vault/types";
import { STEP_MAX_WORDS, STEP_MIN_WORDS, cardNaming, chunkSteps, wordsIn, type StepCard } from "./steps";

let n = 0;
/** A line of `words` words, each line's words its own (keys are made from words). */
function line(words: number, kind: VaultBlockKind = "para", lead = ""): VaultBlock {
  n += 1;
  const body = Array.from({ length: Math.max(0, words - (lead ? lead.split(" ").length : 0)) }, (_, i) => `w${n}x${i}`).join(" ");
  const text = lead ? `${lead} ${body}`.trim() : body;
  return { key: `b-${n}`, kind, text };
}
const head = (text: string, kind: VaultBlockKind = "subheading"): VaultBlock => {
  n += 1;
  return { key: `h-${n}`, kind, text };
};
const sec = (id: string, title: string, blocks: VaultBlock[]): VaultSection => vaultSection(id, title, blocks);

/** Every line, as (section, block) pairs, in the order the cards hold them. */
function order(cards: StepCard[]): string[] {
  return cards.flatMap((c) => c.parts.flatMap((p) => p.blocks.map((b) => `${p.section}.${b}`)));
}
function all(sections: VaultSection[]): string[] {
  return sections.flatMap((s, si) => s.blocks.map((_, bi) => `${si}.${bi}`));
}
function lastBlock(card: StepCard, sections: VaultSection[]): VaultBlock {
  const p = card.parts[card.parts.length - 1];
  return sections[p.section].blocks[p.blocks[p.blocks.length - 1]];
}

describe("wordsIn", () => {
  it("counts words, and nothing for blank text", () => {
    expect(wordsIn("Touch and  go")).toBe(3);
    expect(wordsIn("   ")).toBe(0);
  });
});

describe("chunkSteps", () => {
  it("puts every line on exactly one card, in reading order", () => {
    const sections = [
      sec("a", "", [line(60), line(70), line(50)]),
      sec("b", "Posture", [line(40), head("Chest up"), line(90), line(30)]),
      sec("c", "Pace", [line(200), line(20)]),
    ];
    const cards = chunkSteps(sections);
    expect(order(cards)).toEqual(all(sections));
  });

  it("breaks at a section once a card has its minimum", () => {
    const sections = [sec("a", "One", [line(STEP_MIN_WORDS + 10)]), sec("b", "Two", [line(30)]), sec("c", "Three", [line(40)])];
    const cards = chunkSteps(sections);
    expect(cards[0].parts.map((p) => p.section)).toEqual([0]);
    // A short section shares a card with the next, each keeping its title.
    expect(cards[1].parts.map((p) => p.title)).toEqual(["Two", "Three"]);
  });

  it("never passes the maximum, unless one line is longer than a card", () => {
    const sections = [sec("a", "", [line(70), line(70), line(70), line(70)]), sec("b", "", [line(STEP_MAX_WORDS + 40)])];
    const cards = chunkSteps(sections);
    for (const c of cards) {
      const lines = c.parts.reduce((k, p) => k + p.blocks.length, 0);
      if (lines > 1) expect(c.words).toBeLessThanOrEqual(STEP_MAX_WORDS);
    }
    const big = cards.find((c) => c.words > STEP_MAX_WORDS);
    expect(big?.parts.reduce((k, p) => k + p.blocks.length, 0)).toBe(1);
  });

  it("never ends a card on a heading: the heading opens the next", () => {
    const sections = [sec("a", "", [line(70), line(60), head("The squeeze"), line(90), line(40)])];
    const cards = chunkSteps(sections);
    for (const c of cards) {
      const b = lastBlock(c, sections);
      expect(b.kind === "heading" || b.kind === "subheading").toBe(false);
    }
    expect(order(cards)).toEqual(all(sections));
  });

  it("says when a section continues from an earlier card", () => {
    const sections = [sec("a", "Long", [line(90), line(90), line(90)])];
    const cards = chunkSteps(sections);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards[0].parts[0].continued).toBe(false);
    expect(cards[1].parts[0].continued).toBe(true);
    expect(cards[1].parts[0].title).toBe("Long");
  });

  it("folds a last card of a few words into the one before", () => {
    const sections = [sec("a", "", [line(90)]), sec("b", "", [line(10)])];
    expect(chunkSteps(sections)).toHaveLength(1);
  });

  it("gives no card for a page with no lines (an empty tier's note)", () => {
    expect(chunkSteps([vaultSection("glance-empty", "Floor glance", [], "Nothing written for this machine yet.")])).toEqual([]);
    expect(chunkSteps([])).toEqual([]);
  });

  it("takes a machine's smaller cards when asked", () => {
    const sections = [sec("s", "Set up", [line(50, "line"), line(50, "line"), line(50, "line")])];
    expect(chunkSteps(sections, { min: 40, max: 110 }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("cardNaming", () => {
  it("finds the first card whose line names a dial, as whole words in any case", () => {
    const sections = [
      sec("setup", "Set up", [line(50, "line", "Seat Back Position: set to P2."), line(50, "line", "Shoulder Pads: set them snug.")]),
    ];
    const cards = chunkSteps(sections, { min: 40, max: 60 });
    expect(cards).toHaveLength(2);
    expect(cardNaming(cards, sections, "Shoulder Pads")).toBe(1);
    expect(cardNaming(cards, sections, "seat back position")).toBe(0);
  });

  it("answers -1 for a dial no line names, and never matches inside a word", () => {
    const sections = [sec("s", "", [line(20, "line", "The gap is set wide.")])];
    const cards = chunkSteps(sections);
    expect(cardNaming(cards, sections, "Seat Distance")).toBe(-1);
    expect(cardNaming(cards, sections, "ga")).toBe(-1);
    expect(cardNaming(cards, sections, "")).toBe(-1);
  });
});
