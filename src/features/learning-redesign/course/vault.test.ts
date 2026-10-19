import { describe, expect, it } from "vitest";
import glossaryFile from "../../academy/content/glossary.json";
import { TERM_SUMMARY_PICK, sentencesOf } from "../../learning-vault/entities";
import graphIndex from "../../learning-vault/graph-index.json";
import { EQUIPMENT_FROM, byLetter, filterVault, letterOf, lettersOf, vaultEntries } from "./vault";

const glossary = (glossaryFile as unknown as { glossary: { term: string; definition: string }[] }).glossary;
const termTopics = (graphIndex as unknown as { termTopics: Record<string, string[]> }).termTopics;

describe("vaultEntries", () => {
  const entries = vaultEntries(glossary, termTopics);

  it("holds every term once, A to Z", () => {
    expect(entries).toHaveLength(glossary.length);
    const terms = entries.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
    const sorted = [...terms].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    expect(terms).toEqual(sorted);
  });

  it("files the glossary's later terms as equipment, as the file lists them", () => {
    const equipment = new Set(glossary.slice(EQUIPMENT_FROM).map((g) => g.term));
    for (const e of entries) expect(e.kind).toBe(equipment.has(e.term) ? "equipment" : "method");
    expect(entries.some((e) => e.kind === "equipment")).toBe(true);
  });

  it("opens on the definition's own first words, never rewritten", () => {
    const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    for (const e of entries) {
      expect(e.summary.length).toBeGreaterThan(0);
      if (TERM_SUMMARY_PICK[e.term]) continue;
      expect(flat(e.definition).startsWith(flat(e.summary).slice(0, 20)), e.term).toBe(true);
    }
  });

  it("says what a term means where its opening does not, in the definition's own sentences", () => {
    const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const picked = entries.filter((e) => TERM_SUMMARY_PICK[e.term]);
    expect(picked.map((e) => e.term).sort()).toEqual(Object.keys(TERM_SUMMARY_PICK).sort());
    for (const e of picked) {
      const all = sentencesOf(e.definition);
      const want = TERM_SUMMARY_PICK[e.term].map((i) => all[i]).join(" ");
      expect(flat(e.summary), e.term).toBe(flat(want));
      for (const i of TERM_SUMMARY_PICK[e.term]) expect(flat(e.definition)).toContain(flat(all[i]));
    }
    // The same card words as the vault's own term cards (entities.ts).
    const stretch = entries.find((e) => e.term === "Stretch")!;
    expect(stretch.summary).toMatch(/^For our purposes, we refer to the stretched portion/);
  });

  it("names where each term is taught, from the generated index", () => {
    const withTopics = entries.filter((e) => e.topics.length > 0);
    expect(withTopics.length).toBeGreaterThan(0);
    for (const e of withTopics) expect(e.topics).toEqual(termTopics[e.term]);
  });

  it("is empty while the glossary loads", () => {
    expect(vaultEntries(null, termTopics)).toEqual([]);
  });
});

describe("filterVault", () => {
  const entries = vaultEntries(glossary, termTopics);

  it("filters by kind", () => {
    expect(filterVault(entries, { kind: "equipment", query: "" }).every((e) => e.kind === "equipment")).toBe(true);
    expect(filterVault(entries, { kind: "method", query: "" }).every((e) => e.kind === "method")).toBe(true);
    expect(filterVault(entries, { kind: "all", query: "" })).toHaveLength(entries.length);
  });

  it("finds every word of a search, a term that names it first", () => {
    const found = filterVault(entries, { kind: "all", query: "stack" });
    expect(found.length).toBeGreaterThan(1);
    expect(found[0].term.toLowerCase()).toContain("stack");
    const firstText = found.findIndex((e) => !e.term.toLowerCase().includes("stack"));
    if (firstText >= 0) expect(found.slice(firstText).every((e) => !e.term.toLowerCase().includes("stack"))).toBe(true);
  });

  it("finds nothing for words the glossary does not have", () => {
    expect(filterVault(entries, { kind: "all", query: "zzqx" })).toEqual([]);
  });
});

describe("letters", () => {
  it("files a term under its first letter or digit", () => {
    expect(letterOf("End Stop")).toBe("E");
    expect(letterOf("(TSC) Timed")).toBe("T");
    expect(letterOf("...")).toBe("#");
  });

  it("groups the cards under the letters that have them", () => {
    const entries = vaultEntries(glossary, termTopics);
    const groups = byLetter(entries);
    expect(groups.map((g) => g.letter)).toEqual(lettersOf(entries));
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(entries.length);
  });
});
