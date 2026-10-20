/**
 * The playbooks deck waits with the playbooks (the Mix for everyone, Oct 20
 * 2026): its questions come from Journey's business notes, which head office
 * has not read yet. `floorDeck: false` leaves it out and nothing else.
 */
import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import { questionBank, type QuestionBankInput } from "./bank";

const base: QuestionBankInput = {
  glossary: null,
  cues: null,
  scripts: null,
  cards: null,
  defs: MACHINE_DEFINITIONS,
  names: (id) => id,
};

describe("questionBank's floorDeck", () => {
  it("deals the playbooks deck unless told not to, and leaves every other question as it was", () => {
    const all = questionBank(base);
    const without = questionBank({ ...base, floorDeck: false });
    expect(all.some((q) => q.deck === "playbooks")).toBe(true);
    expect(without.some((q) => q.deck === "playbooks")).toBe(false);
    expect(without.map((q) => q.id)).toEqual(all.filter((q) => q.deck !== "playbooks").map((q) => q.id));
  });
});
