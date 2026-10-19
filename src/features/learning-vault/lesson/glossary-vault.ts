/**
 * THE GLOSSARY VAULT — the Academy's words as cards you can filter. Lifted
 * from the Interactive Course into the shared parts (the Learning vault
 * redesign, Oct 19 2026: AJ picked the mix, the Codex as the base with the
 * Course's glossary vault). GlossaryVault.tsx draws it.
 *
 * The glossary file lists its method terms first and its equipment terms
 * from the fortieth on (graph.ts EQUIPMENT_FROM; pages.ts reads it the same
 * way). A card shows a term, its first sentence (or, where the opening never
 * says what the term means, the sentences that do: TERM_SUMMARY_PICK in
 * entities.ts), and on "More" the whole definition and the Academy topics
 * that teach it (graph-index.json's termTopics, generated from the corpus).
 * The definition's words are the glossary page's own line (capitalised the
 * same way), so a studio's mark on a definition shows on its card too.
 *
 * PURE MODULE: no React.
 */

import { termSummary } from "../entities";
import { EQUIPMENT_FROM } from "../graph";
import { capitaliseFirst } from "../pages";
import graphIndexJson from "../graph-index.json";

export { EQUIPMENT_FROM };

/** Academy topic ids that teach each glossary term (graph-index.json, generated from the corpus). */
export const GLOSSARY_TERM_TOPICS: Record<string, string[]> = (graphIndexJson as unknown as { termTopics: Record<string, string[]> })
  .termTopics;

export type GlossaryKind = "method" | "equipment";
export type GlossaryFilter = "all" | GlossaryKind;

export interface GlossaryEntry {
  term: string;
  /** The letter it files under ("#" for a term that starts with neither). */
  letter: string;
  kind: GlossaryKind;
  /**
   * The definition's first sentence (or two when the first is short), or,
   * for a term in TERM_SUMMARY_PICK, the sentences picked for it, verbatim.
   */
  summary: string;
  /** The whole definition, as the glossary page's line reads it. */
  definition: string;
  /** Academy topic ids that teach it, most mentions first. */
  topics: string[];
}

export function letterOf(term: string): string {
  return (term.match(/[A-Za-z0-9]/)?.[0] ?? "#").toUpperCase();
}

/** Every term as a card, in the glossary page's order (A to Z, case aside). */
export function glossaryEntries(
  glossary: { term: string; definition: string }[] | null,
  termTopics: Record<string, string[]> | null | undefined = GLOSSARY_TERM_TOPICS,
): GlossaryEntry[] {
  if (!glossary) return [];
  return glossary
    .map((g, i): GlossaryEntry => {
      const definition = capitaliseFirst((g.definition ?? "").trim());
      return {
        term: g.term,
        letter: letterOf(g.term),
        kind: i >= EQUIPMENT_FROM ? "equipment" : "method",
        summary: termSummary(definition, g.term) || definition,
        definition,
        topics: termTopics?.[g.term] ?? [],
      };
    })
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

/** Lower-case words of a search, quotes and punctuation at the ends gone. */
function queryWords(query: string): string[] {
  return (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
}

/**
 * The cards a filter and a search leave. Every word of the search must be
 * in the term or its definition; a match in the term ranks first, so
 * "stop" puts End Stop before the definitions that only mention one.
 */
export function filterGlossary(entries: GlossaryEntry[], opts: { kind: GlossaryFilter; query: string }): GlossaryEntry[] {
  const words = queryWords(opts.query);
  const kept = entries.filter((e) => opts.kind === "all" || e.kind === opts.kind);
  if (words.length === 0) return kept;
  const inTerm: GlossaryEntry[] = [];
  const inText: GlossaryEntry[] = [];
  for (const e of kept) {
    const term = e.term.toLowerCase();
    const all = `${term} ${e.definition.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) continue;
    if (words.every((w) => term.includes(w))) inTerm.push(e);
    else inText.push(e);
  }
  return [...inTerm, ...inText];
}

/** The letters that have at least one card, in order. */
export function lettersOf(entries: GlossaryEntry[]): string[] {
  return [...new Set(entries.map((e) => e.letter))].sort((a, b) => a.localeCompare(b));
}

/** Cards grouped under their letters, in order (for the vault's A to Z). */
export function byLetter(entries: GlossaryEntry[]): { letter: string; entries: GlossaryEntry[] }[] {
  const map = new Map<string, GlossaryEntry[]>();
  for (const e of entries) map.set(e.letter, [...(map.get(e.letter) ?? []), e]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([letter, list]) => ({ letter, entries: list }));
}

/** The id a term's card carries, so a link to one word can scroll to it ("vtw-term-end-stop"). */
export function glossaryTermId(term: string): string {
  return `vtw-term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** The id a letter's heading carries in the grouped vault ("vtw-letter-E"). */
export function glossaryLetterId(letter: string): string {
  return `vtw-letter-${letter}`;
}
