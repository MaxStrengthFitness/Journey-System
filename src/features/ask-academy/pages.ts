/**
 * THE ACADEMY AS PAGES — everything Ask the Academy can read, one list.
 *
 * Round: Ask the Academy, Oct 16 2026 (docs/rounds/2026-10-16-ask-the-academy.md).
 * AJ: "a more intelligent catalog for our academy information. Something that
 * we can almost go to and ask questions to."
 *
 * Claude reads exactly the Academy a trainer can open in Learning → Academy:
 * the content `scripts/build-academy-content.ts` builds from docs/msf-academy
 * (the modules' topics, the machine overviews, the scripts, the quick-reference
 * cards, the cue moments and the glossary). So every sentence an answer quotes
 * sits on a page that already exists in the app.
 *
 * Three things are tidied here, never in the content:
 *   - The same file is filed under more than one module (Exercise Substitutes
 *     is in three). A page whose words match an earlier page's (`sameTextKey`:
 *     spacing, line breaks and bullet marks aside, since one Drive folder was
 *     converted by a different tool) is kept once; the other ids go in
 *     `sameAs`, so a link or a test can name either.
 *   - Ten quick cards are titled with an abbreviation ("LP"), so a card takes
 *     the Academy's name for its machine, from that machine's script.
 *   - The glossary is read term by term. `intro-glossary` is the same 52 terms
 *     as glossary.json in one 5,900-word topic; a question about one term
 *     should send one term, not all of them.
 *
 * Pure: no React, no Firebase, no network. The JSON is handed in.
 */
import type {
  Block,
  CardsFile,
  CuesFile,
  GlossaryFile,
  MachineScript,
  ModuleContent,
  OverviewsFile,
  QuickCard,
  ScriptsFile,
} from "../academy/types";

export type AcademyPageKind = "topic" | "overview" | "script" | "card" | "term" | "cues";

export interface AcademyPage {
  /** Unique across the Academy: `topic:intro-mission`, `overview:leg-press`, `script:lower-body-lp`, `card:lp`, `term:<slug>`, `cues`. */
  id: string;
  kind: AcademyPageKind;
  /** Where it sits: a module's title, or "Machine overviews", "Scripts", "Quick reference", "Glossary", "Cues". */
  shelf: string;
  title: string;
  /** Plain text: what Claude reads, and what a quote is cut from. */
  text: string;
  /** Other ids whose text is exactly this page's (the same file under another module). */
  sameAs: string[];
}

export interface AcademyFiles {
  /** The modules, in the index's order. */
  modules: ModuleContent[];
  overviews: OverviewsFile;
  scripts: ScriptsFile;
  cards: CardsFile;
  cues: CuesFile;
  glossary: GlossaryFile;
}

/** The glossary as one topic; read term by term instead (see the header). */
export const GLOSSARY_TOPIC_ID = "intro-glossary";

/** A topic's or an overview's blocks as plain text, one block a line. */
export function blocksText(blocks: readonly Block[]): string {
  return blocks
    .map((b) => (b.kind === "bullet" ? `• ${b.text}` : b.text))
    .join("\n")
    .trim();
}

/*
 * The Academy's names for a machine. These are `scriptTitle` and `cardTitle`
 * from academy/academy-machines.ts, copied because that file can't be loaded
 * where this one runs (the server, the trial): it reaches the machine database
 * and its photos. pages.test.ts holds the copies to the originals.
 */

/** A script's opening phrase: "Leg Press - Custom gap…" → "Leg Press". */
export function academyScriptName(script: MachineScript): string {
  const summary = script.summary ?? script.abbr;
  return summary.split(/\s[-–—]\s/)[0].trim();
}

/** A card's title without "– Quick Reference Guide" (ten of them are then an abbreviation). */
export function academyCardName(card: QuickCard): string {
  return card.title.replace(/\s*[-–]\s*Quick Reference Guide\s*$/i, "").trim();
}

/** Two pages are the same page when their words are: spacing, line breaks, bullet marks and case aside. */
export function sameTextKey(text: string): string {
  return text.replace(/•/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A lower-case slug for a glossary term's id. */
export function termSlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every page Ask the Academy can read, each text once, in the Academy's own order. */
export function academyPages(files: AcademyFiles): AcademyPage[] {
  const pages: AcademyPage[] = [];
  const byText = new Map<string, AcademyPage>();
  const add = (page: Omit<AcademyPage, "sameAs">) => {
    if (!page.text) return;
    const key = sameTextKey(page.text);
    const earlier = byText.get(key);
    if (earlier) {
      earlier.sameAs.push(page.id);
      return;
    }
    const kept: AcademyPage = { ...page, sameAs: [] };
    byText.set(key, kept);
    pages.push(kept);
  };

  for (const mod of files.modules) {
    for (const topic of mod.topics) {
      if (topic.id === GLOSSARY_TOPIC_ID) continue;
      add({ id: `topic:${topic.id}`, kind: "topic", shelf: mod.title, title: topic.title, text: blocksText(topic.blocks) });
    }
  }

  for (const o of files.overviews.overviews) {
    add({ id: `overview:${o.id}`, kind: "overview", shelf: "Machine overviews", title: o.title, text: blocksText(o.blocks) });
  }

  // The Academy's own name for each machine: a script's opening phrase ("Leg Press - Custom gap…").
  const academyName = new Map(files.scripts.scripts.flatMap((s) => (s.machineId ? [[s.machineId, academyScriptName(s)] as const] : [])));
  for (const s of files.scripts.scripts) {
    const machine = academyScriptName(s);
    const lines: string[] = [];
    if (s.summary) lines.push(s.summary);
    for (const beat of s.beats) {
      lines.push(beat.beat);
      for (const line of beat.lines) lines.push(line.spoken ? `Say: "${line.text}"` : line.text);
    }
    add({ id: `script:${s.id}`, kind: "script", shelf: `Scripts · ${s.workout}`, title: `${machine} script`, text: lines.join("\n").trim() });
  }

  for (const c of files.cards.cards) {
    const lines: string[] = [];
    if (c.intro) lines.push(c.intro);
    for (const section of c.sections) {
      lines.push(section.heading);
      for (const item of section.items) lines.push(`• ${item}`);
    }
    const machine = (c.machineId && academyName.get(c.machineId)) || academyCardName(c);
    add({ id: `card:${c.id}`, kind: "card", shelf: "Quick reference", title: `${machine} quick reference`, text: lines.join("\n").trim() });
  }

  const cueLines: string[] = [];
  for (const moment of files.cues.cues) {
    cueLines.push(moment.moment);
    for (const phrase of moment.phrases) cueLines.push(`• "${phrase}"`);
    for (const note of moment.notes) cueLines.push(note);
  }
  add({ id: "cues", kind: "cues", shelf: "Cues", title: "What to say, moment by moment", text: cueLines.join("\n").trim() });

  const seenTerms = new Set<string>();
  for (const g of files.glossary.glossary) {
    let id = `term:${termSlug(g.term)}`;
    for (let n = 2; seenTerms.has(id); n++) id = `term:${termSlug(g.term)}-${n}`;
    seenTerms.add(id);
    add({ id, kind: "term", shelf: "Glossary", title: g.term, text: `${g.term}: ${g.definition}`.trim() });
  }

  return pages;
}

/** The page an id names, through `sameAs` too; null when no page has it. */
export function pageById(pages: readonly AcademyPage[], id: string): AcademyPage | null {
  for (const p of pages) if (p.id === id || p.sameAs.includes(id)) return p;
  return null;
}

/** The list Claude picks from: one line a page, `id — shelf › title`. */
export function pageListText(pages: readonly AcademyPage[]): string {
  return pages.map((p) => `${p.id} — ${p.shelf} › ${p.title}`).join("\n");
}
