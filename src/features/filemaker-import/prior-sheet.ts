/**
 * THE NUMBERING SHEET: a stated "sessions before Journey" for the clients
 * whose story predates FileMaker, written from a person's answer and never
 * without one (Oct 22 2026, Stage 3 of the Strongsville import, rule R13).
 *
 * Why: the importer numbers a client's imported sessions from 1 unless a
 * person has stated her total (`numberOffsetFor`). For the 21 Strongsville
 * clients whose Mindbody history starts years before FileMaker's (Kenda
 * Daniels: 183 Mindbody visits, 48 in FileMaker) that would store #1..#48
 * for sessions that are #136..#183, and an imported session is never
 * renumbered. So before their wave the leaders answer a sheet, one row per
 * client: the suggested total (Mindbody's count through the last FileMaker
 * day), Confirm or a number, and who answered. This file reads the sheet and
 * plans the records; the script writes them (`statePriorHistory`, the one
 * way a person's answer becomes the record: it keeps `importedCount` and
 * `from`). A row with no answer or no name is skipped and said: the prior
 * record is always someone's statement (`docs/business/migration-and-prior-
 * history.md`).
 */

import { statePriorHistory, type PriorHistory } from "../../lib/prior-history";

/** One row of the sheet as a person hands it back. */
export interface SheetRow {
  /** The Journey client document id. */
  clientId: string;
  name: string;
  /** Mindbody's count on the day it was last read, and that day. */
  mindbodyVisits: number | null;
  mindbodyAsOf: string | null;
  /** FileMaker visits in all, and the ones after the Mindbody count's day. */
  fmVisits: number;
  fmVisitsAfter: number;
  /** The last FileMaker day: what the stated total counts up to. */
  through: string;
  /** Mindbody's count plus the FileMaker visits after it: the total through the last FileMaker day. */
  suggested: number | null;
  /** The person's answer: "confirm", a whole number, or blank. */
  answer: string;
  /** Who answered. */
  by: string;
  note: string;
}

export const SHEET_COLUMNS = ["clientId", "name", "mindbodyVisits", "mindbodyAsOf", "fmVisits", "fmVisitsAfter", "through", "suggested", "answer", "by", "note"] as const;

/** The suggested total: Mindbody's count on its day, plus the FileMaker visits after that day. Null when Mindbody has no count. */
export function suggestedTotal(mindbodyVisits: number | null, fmVisitsAfter: number): number | null {
  if (mindbodyVisits === null || !Number.isFinite(mindbodyVisits)) return null;
  return Math.max(0, Math.trunc(mindbodyVisits)) + Math.max(0, Math.trunc(fmVisitsAfter));
}

export interface SheetPlan {
  /** Records to write, one per answered row. */
  writes: { clientId: string; name: string; sessions: number; record: ReturnType<typeof statePriorHistory> }[];
  /** Rows skipped, each with why. */
  skipped: { clientId: string; name: string; why: string }[];
}

/**
 * What the sheet says to write. A row needs an answer and a name; "confirm"
 * takes the suggested total; a number is the person's own; anything else is
 * skipped and said. An existing record a trainer typed is kept unless the
 * sheet names a different total (the person's newer word wins; `importedCount`
 * and `from` carry over either way).
 */
export function planSheet(rows: readonly SheetRow[], existing: ReadonlyMap<string, PriorHistory | null>): SheetPlan {
  const plan: SheetPlan = { writes: [], skipped: [] };
  for (const r of rows) {
    const answer = r.answer.trim().toLowerCase();
    const by = r.by.trim();
    if (!answer) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: "no answer" });
      continue;
    }
    if (!by) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: "answered, but nobody's name on it: a prior record is always someone's statement" });
      continue;
    }
    let sessions: number | null = null;
    if (answer === "confirm" || answer === "yes" || answer === "ok") sessions = r.suggested;
    else if (/^\d+$/.test(answer)) sessions = Number(answer);
    if (sessions === null || !Number.isFinite(sessions)) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: answer === "confirm" ? "confirm, but there is no suggested total (Mindbody has no count)" : `"${r.answer}" is neither confirm nor a number` });
      continue;
    }
    if (sessions < r.fmVisits) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: `${sessions} is fewer than the ${r.fmVisits} FileMaker visits the import would count inside it` });
      continue;
    }
    // The record's "through" is what the total counts up to: a studio day, never a spreadsheet's rewording of one.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.through)) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: `the last FileMaker day "${r.through}" is not a day (yyyy-mm-dd)` });
      continue;
    }
    const prior = existing.get(r.clientId) ?? null;
    if (prior && prior.sessions === sessions && prior.through === r.through) {
      plan.skipped.push({ clientId: r.clientId, name: r.name, why: "already stated, the same" });
      continue;
    }
    const note = [r.note.trim(), `Numbering sheet, the Strongsville import: Mindbody ${r.mindbodyVisits ?? "?"} as of ${r.mindbodyAsOf ?? "?"} + ${r.fmVisitsAfter} FileMaker visits after.`].filter(Boolean).join(" ");
    plan.writes.push({
      clientId: r.clientId,
      name: r.name,
      sessions,
      record: statePriorHistory(prior, { sessions, through: r.through, source: "filemaker", note }, { id: null, name: by }),
    });
  }
  return plan;
}
