/**
 * THE DRY RUN'S WORDS: what the import found, what it would write, what waits.
 *
 * Read by a person deciding whether to go on (AJ), so it says each thing
 * once, in studio English, with the count first and a few examples after;
 * the whole list is in the JSON report beside it.
 */

import type { ClientPlan } from "./plan";
import type { Finding, Level } from "./visits";
import { shapeOf, type Visit } from "./visits";

export interface ClientReport {
  name: string;
  mindbodyClientId: string | null;
  siteId: string | null;
  /** The Journey record found (with Journey's own name for the client, to check the pairing), or why none was. */
  journey: { docId: string; homeStudio: string; journeyName: string | null } | { problem: string };
  /** Why a client found in Journey is left out of this run, when it is. */
  stopped: string | null;
  visits: Visit[];
  findings: Finding[];
  plan: ClientPlan | null;
  /** FileMaker's own count of the client's workouts (the profile's WorkoutCount). */
  fmWorkoutCount: number | null;
  /** The client's first appointment as Mindbody has it. */
  firstAppointment: string | null;
  /** Mindbody's count of the client's visits at the site, when Journey has it. */
  mindbodyVisits: number | null;
  /** A person has stated the client's sessions before Journey. */
  hasPriorHistory: boolean;
  /** The client's standing note in FileMaker, reported and not imported (yet). */
  hasWorkoutNotes: boolean;
}

const LEVEL_WORDS: Record<Level, string> = {
  held: "Not imported until fixed",
  look: "Imported; worth a look against the chart",
  handled: "Handled by a rule",
};

const EXAMPLES = 4;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The lines about one client. */
export function clientLines(r: ClientReport): string[] {
  const out: string[] = [];
  const shape = shapeOf(r.visits);
  out.push(`${r.name}  (Mindbody ${r.mindbodyClientId ?? "?"} on site ${r.siteId ?? "?"})`);
  if ("problem" in r.journey) out.push(`  NOT IMPORTED: ${r.journey.problem}`);
  else {
    out.push(`  Journey record clients/${r.journey.docId} (${r.journey.journeyName ?? "no name"}), home studio ${r.journey.homeStudio}`);
    if (r.stopped) out.push(`  NOT IMPORTED THIS RUN: ${r.stopped}`);
  }

  out.push(
    `  FileMaker: ${shape.visits} visits, ${shape.first ?? "-"} to ${shape.last ?? "-"}, ${shape.entries} machine entries on ${shape.machines} machines` +
      (r.fmWorkoutCount !== null ? `; FileMaker counts ${r.fmWorkoutCount} workouts` : ""),
  );
  if (r.fmWorkoutCount !== null && r.fmWorkoutCount - shape.visits > 1) {
    const extra = r.fmWorkoutCount - shape.visits - 1;
    out.push(`  ${extra} more workout${extra === 1 ? "" : "s"} in FileMaker than days with machines on them (beyond the one still open): workouts with nothing entered.`);
  }
  if (shape.repsBlankPercent > 0) out.push(`  Reps left blank on ${shape.repsBlankPercent}% of entries (imported as done, reps not recorded).`);
  if (r.firstAppointment && shape.first && daysBetween(r.firstAppointment, shape.first) > 21) {
    out.push(
      `  First visit ${r.firstAppointment} (Mindbody); FileMaker starts ${shape.first}. FileMaker doesn't hold the whole story:` +
        ` the total stays ${r.hasPriorHistory ? "the stated one" : "Mindbody's until a trainer confirms it on Account"}.`,
    );
  }
  if (r.mindbodyVisits !== null && r.mindbodyVisits > shape.visits + 5) {
    out.push(`  Mindbody counts ${r.mindbodyVisits} visits at the site.`);
  }
  if (r.hasWorkoutNotes) out.push("  Has a standing note in FileMaker (not imported yet: notes wait for your answer on how loud they come in).");

  if (r.plan && !r.stopped) {
    const toWrite = r.plan.sessions.filter((s) => !s.exists);
    const already = r.plan.sessions.length - toWrite.length;
    const logs = toWrite.reduce((n, s) => n + s.logs.length, 0);
    out.push(`  Would write ${toWrite.length} sessions and ${logs} sets` + (already ? ` (${already} already in Journey from an earlier run)` : "") + ".");
    const reasons = new Map<string, number>();
    for (const s of r.plan.skipped) {
      const key = s.why.startsWith("waiting for the machine table") ? "waiting for the machine table" : s.why;
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    for (const [why, n] of reasons) out.push(`  ${n} visit${n === 1 ? "" : "s"} left out: ${why}.`);
    if (r.plan.unmatched.length) {
      const names = r.plan.unmatched.join(", ");
      out.push(`  WAITS WHOLE for the machine table: ${names}${names.endsWith(".") ? "" : "."}`);
    }
    if (r.plan.held.length) out.push(`  ${r.plan.held.length} entr${r.plan.held.length === 1 ? "y" : "ies"} held back (the visit imports without ${r.plan.held.length === 1 ? "it" : "them"}).`);
  }

  for (const level of ["held", "look", "handled"] as Level[]) {
    const mine = r.findings.filter((f) => f.level === level);
    if (!mine.length) continue;
    out.push(`  ${LEVEL_WORDS[level]}:`);
    const byWhat = new Map<string, Finding[]>();
    for (const f of mine) (byWhat.get(f.what) ?? byWhat.set(f.what, []).get(f.what)!).push(f);
    for (const [what, list] of byWhat) {
      out.push(`    [${list.length}] ${what}`);
      for (const f of list.slice(0, EXAMPLES)) out.push(`          ${f.where}`);
      if (list.length > EXAMPLES) out.push(`          ... and ${list.length - EXAMPLES} more (in the JSON report)`);
    }
  }
  return out;
}

/** The whole run in a few lines, after the clients. */
export function summaryLines(clients: readonly ClientReport[], committed: boolean): string[] {
  const ready = clients.filter((c) => c.plan && !("problem" in c.journey) && !c.stopped);
  const sessions = ready.reduce((n, c) => n + c.plan!.sessions.filter((s) => !s.exists).length, 0);
  const sets = ready.reduce((n, c) => n + c.plan!.sessions.filter((s) => !s.exists).reduce((m, s) => m + s.logs.length, 0), 0);
  const waiting = new Set(ready.flatMap((c) => c.plan!.unmatched));
  const out = [
    `${clients.length} client${clients.length === 1 ? "" : "s"} in the files; ${ready.length} found in Journey and ready to import.`,
    `${committed ? "Wrote" : "Would write"} ${sessions} sessions and ${sets} sets.`,
  ];
  if (waiting.size) out.push(`${waiting.size} FileMaker machine name${waiting.size === 1 ? "" : "s"} still to match in the machine table: those clients wait.`);
  return out;
}
