/**
 * THE QUESTION BANK — every question the quiz can deal, built once from what
 * Learning has already loaded.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 * Three kinds of question go in, and each says where it came from:
 * - built from the Academy's own data (generate.ts): the glossary, the cueing
 *   phrasebook, the machine scripts, the machine definitions, the cards;
 * - written by hand with the exact words they rest on (authored.ts): the
 *   protocol from the Academy's topics, and the floor and the conversation
 *   from docs/business;
 * - Hutchins' definition of exercise, paraphrased clause by clause
 *   (hutchins.ts).
 *
 * Built in memory, never stored. The Academy's chunks arrive one by one
 * (glossary, cues, scripts, cards); a source still loading is null and its
 * questions are simply not there yet, while the written ones always are.
 *
 * "READ IT"
 * ---------
 * A question from an Academy page opens that page. A question from
 * docs/business has no Learning page of its own; when the Life Transformer
 * playbooks are passed in, it opens the playbook page that cites that file
 * most (for Hutchins, the one that cites the definition's lines), and
 * otherwise it names its source and offers no door.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { CueMoment, MachineScript, QuickCard } from "../../academy/types";
import type { MachineDefinition } from "../../../types/machines";
import type { PlaybookPage, QuizQuestion, VaultRoute } from "../types";
import { ACADEMY_QUESTIONS, FLOOR_QUESTIONS } from "./authored";
import type { QuizItem } from "./decks";
import { cueQuestions, glossaryQuestions, machineQuestions, scriptQuestions } from "./generate";
import { HUTCHINS_LINES, HUTCHINS_PATH, HUTCHINS_QUESTIONS } from "./hutchins";

export interface QuestionBankInput {
  glossary: { term: string; definition: string }[] | null;
  cues: CueMoment[] | null;
  scripts: MachineScript[] | null;
  cards: QuickCard[] | null;
  defs: Record<string, Partial<MachineDefinition>>;
  names: (machineId: string) => string;
  /** The Life Transformer playbooks, so a question from docs/business can open the page written from it. */
  playbooks?: PlaybookPage[] | null;
}

/** "docs/business/the-floor.md:22-31" → the path and the lines it cites. */
function parseCite(source: string): { path: string; from: number; to: number } | null {
  const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(source.trim());
  if (!m) return null;
  const from = Number(m[2]);
  const to = m[3] ? Number(m[3]) : from;
  return { path: m[1], from, to };
}

/**
 * The playbook page that cites `path` most often (within `lines`, when
 * given), as a route; null when none cites it. Ties go to the earlier page.
 */
export function playbookRouteFor(
  path: string,
  playbooks: readonly PlaybookPage[] | null | undefined,
  lines?: { from: number; to: number },
): VaultRoute | null {
  if (!playbooks || playbooks.length === 0) return null;
  let best: { id: string; count: number } | null = null;
  for (const page of playbooks) {
    let count = 0;
    for (const section of page.sections) {
      for (const block of section.blocks) {
        const cite = parseCite(block.source);
        if (!cite || cite.path !== path) continue;
        if (lines && (cite.to < lines.from || cite.from > lines.to)) continue;
        count++;
      }
    }
    if (count > 0 && (!best || count > best.count)) best = { id: page.id, count };
  }
  return best ? { kind: "playbook", id: best.id } : null;
}

function withRoute<T extends QuizItem>(q: T, route: VaultRoute | null): T {
  if (!route || q.source.route) return q;
  return { ...q, source: { ...q.source, route } };
}

export function questionBank(input: QuestionBankInput): QuizQuestion[] {
  const hutchinsRoute = playbookRouteFor(HUTCHINS_PATH, input.playbooks, HUTCHINS_LINES);
  const routeByPath = new Map<string, VaultRoute | null>();
  const floorRoute = (path: string | undefined): VaultRoute | null => {
    if (!path) return null;
    if (!routeByPath.has(path)) routeByPath.set(path, playbookRouteFor(path, input.playbooks));
    return routeByPath.get(path) ?? null;
  };

  const all: QuizItem[] = [
    ...glossaryQuestions(input.glossary),
    ...cueQuestions(input.cues),
    ...scriptQuestions(input.scripts, input.names),
    ...machineQuestions(input.defs, input.cards, input.names),
    ...ACADEMY_QUESTIONS,
    ...HUTCHINS_QUESTIONS.map((q) => withRoute(q, hutchinsRoute)),
    ...FLOOR_QUESTIONS.map((q) => withRoute(q, floorRoute(q.source.path))),
  ];

  // One question per id: the first one wins, so a built question never
  // doubles a written one that happens to share its id.
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const q of all) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}
