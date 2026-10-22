/**
 * WHAT A FILEMAKER ENTRY MEANS, AND WHAT A VISIT IS.
 *
 * The data is not perfect and was never going to be (AJ, Oct 12 2026: "the
 * data is not going to be perfect. So we have to be able to kind of navigate
 * that"). The three sample clients (two at Strongsville, one at
 * Solon) taught the rules below; each one is AJ's answer or what the chart
 * itself shows.
 *
 * ONE ENTRY (one machine on one visit), read in this order:
 *   - a 0 in the reps column: NOT PERFORMED (AJ: "zero in either column
 *     either means it wasn't performed. Or to take it out"). The weight is
 *     kept for the record; nothing counts it.
 *   - a 0 in the next-time column with no count beside it: NOT PERFORMED too
 *     (the Solon sample, Dec 22 2025: three machines, reps blank, next time 0). With a
 *     count beside it the count wins: Solon wrote 0 there beside eleven
 *     timed holds of 60 to 120 seconds, which were plainly done.
 *   - a weight and a blank reps column: DONE, REPS NOT RECORDED. FileMaker
 *     never fills a weight in by itself (AJ: "no trainer puts it in"), so a
 *     weight is a trainer's entry: the machine was done and the clicker's
 *     count was not written down. Strongsville left reps blank on two thirds
 *     of the long Strongsville sample's entries; Solon on 2% of its sample's.
 *   - a whole number from 1 to 20: REPS.
 *   - a whole number of 30 or more: SECONDS, a timed hold. Solon writes them
 *     in the reps column with nothing else to say so (the sample's Pullover,
 *     Bicep and Chest Fly: 60, 90, 120 from January 2026); no rep count in
 *     the samples went above 15.
 *   - a number with a decimal on a machine done one side at a time: LEFT and
 *     RIGHT (Solon's Torso Rotation: "7.6" is 7 left, 6 right).
 *   - a minus before any of these: the same, without the minus. Willoughby
 *     wrote "-10" and "-12" at the weight of the visits either side, its try
 *     at marking rep quality (AJ, Oct 12 2026: "we dont have to mind that").
 *   - anything else (21 to 29, a decimal elsewhere, "7.1" which may be seven
 *     and ten): UNCLEAR, held back for a person.
 *
 * ONE VISIT is a client's entries on one day (AJ, Oct 12 2026: the date is
 * the visit's key). The order they were done in is FileMaker's WorkoutOrder,
 * ties and gaps broken by the sheet's row order. The same machine twice on
 * one day keeps the first entry with something on it and holds a second
 * such entry back; a blank entry never displaces one.
 */

import type { WorkoutLine } from "./records";

/** Reps above this and below SECONDS_FROM are neither, and a person looks. */
export const REPS_MAX = 20;
/** A count from here up is a timed hold in seconds. */
export const SECONDS_FROM = 30;
/**
 * The longest hold a trainer times (the Strongsville audit, Oct 21 2026: 1,001
 * of 1,009 counts of 30 or more were holds of 30 to 120 seconds; the eight
 * others were a weight typed in the reps column, 246, 910, or a hold on a
 * machine nobody holds). Above it the entry is held back and listed.
 */
export const HOLD_MAX_SECONDS = 120;
/**
 * Movements lifted for reps, never held: a count of 30 or more on one of
 * these is a slip (Hip ADD 68 × 92, Pulldown 120 × 116, a Leg Press 240 × 246),
 * held back and listed. A studio's own unit of a leg press (the Hoist) counts
 * by its id.
 */
export const NEVER_HELD_MOVEMENTS: ReadonlySet<string> = new Set(["m-hip-add", "m-hip-abd", "m-leg-curl", "m-pulldown", "m-lumbar", "m-leg-press"]);

/** Whether a timed hold is a real reading on this Journey machine (its movement when it is a studio's own unit). */
export function holdsAllowedOn(machineId: string, movement?: string | null): boolean {
  if (NEVER_HELD_MOVEMENTS.has(machineId) || (movement && NEVER_HELD_MOVEMENTS.has(movement))) return false;
  return !/leg-press/i.test(machineId);
}

/** A weight nobody lifts on these machines: over it, the entry is a typing slip (13137, 2000, 1000) and is held. */
export const WEIGHT_MAX = 400;
/** A weight this many times the client's usual on the machine is a slip too (8410 on a Lumbar at 84). */
export const WEIGHT_RATIO = 4;
/** The median rule needs this many weighted entries on the machine to know the client's usual. */
export const WEIGHT_RATIO_MIN_ENTRIES = 3;

export type SetReading =
  | { kind: "reps"; reps: number }
  | { kind: "seconds"; seconds: number }
  | { kind: "sides"; left: number; right: number }
  | { kind: "not-recorded" }
  | { kind: "not-performed" }
  | { kind: "empty" }
  | { kind: "unclear"; why: string };

/**
 * A left.right count. Excel keeps no trailing zero, so one digit after the
 * point may have lost one: "7.6" is 7 and 6, but "7.1" may be 7 and 1 or 7
 * and 10, and "7.2" 7 and 2 or 7 and 20, and both are held back (a right side
 * of 30 or more is past REPS_MAX, so 3 to 9 stand). Two digits ("9.11",
 * "12.12") are as typed. Either side 0 or above REPS_MAX is not a count a
 * person would write.
 */
function readSides(value: number): SetReading {
  const left = Math.floor(value);
  const hundredths = Math.round((value - left) * 100);
  if (Math.abs(value - (left + hundredths / 100)) > 1e-6) return { kind: "unclear", why: `"${value}" isn't a left.right count` };
  const oneDigit = hundredths % 10 === 0;
  const right = oneDigit ? hundredths / 10 : hundredths;
  if (oneDigit && right * 10 <= REPS_MAX) return { kind: "unclear", why: `"${value}" may be ${left} and ${right}, or ${left} and ${right * 10}` };
  if (left < 1 || right < 1 || left > REPS_MAX || right > REPS_MAX) {
    return { kind: "unclear", why: `"${value}" isn't a left.right count (each side 1 to ${REPS_MAX})` };
  }
  return { kind: "sides", left, right };
}

/**
 * What one entry says. `perSide` is whether the Journey machine is done one
 * side at a time; `holdsAllowed` whether a timed hold is a real reading on it
 * (`holdsAllowedOn`; true when the machine isn't known yet).
 */
export function readSet(
  line: { weight: number | null; reps: number | null; nextWeight?: number | null },
  perSide: boolean,
  holdsAllowed = true,
): SetReading {
  const { weight, reps } = line;
  if (reps === 0) return { kind: "not-performed" };
  if (reps === null) {
    if (line.nextWeight === 0 || weight === 0) return { kind: "not-performed" };
    if (weight === null) return { kind: "empty" };
    return { kind: "not-recorded" };
  }
  // A minus before the count was Willoughby's try at marking rep quality (AJ, Oct 12 2026: "we dont have to mind that").
  if (reps < 0) return readSet({ ...line, reps: -reps }, perSide, holdsAllowed);
  // A count beside a weight of 0 is not a set at that weight (Elovia Peddle's Hoist, 0 × 8 on alternate
  // visits: a second unit under one name, or the bare sled); held back and listed.
  if (weight === 0) return { kind: "unclear", why: `a count (${reps}) beside a weight of 0` };
  if (!Number.isInteger(reps)) {
    if (!perSide) return { kind: "unclear", why: `a decimal count (${reps}) on a machine done both sides at once` };
    return readSides(reps);
  }
  if (reps <= REPS_MAX) return { kind: "reps", reps };
  if (reps >= SECONDS_FROM) {
    if (!holdsAllowed) return { kind: "unclear", why: `a count of ${reps} on a machine lifted for reps, never held (a weight typed in the reps column?)` };
    if (reps > HOLD_MAX_SECONDS) return { kind: "unclear", why: `${reps} is too long for a timed hold (the longest timed is ${HOLD_MAX_SECONDS} seconds)` };
    return { kind: "seconds", seconds: reps };
  }
  return { kind: "unclear", why: `${reps} is too many reps and too short for a timed hold` };
}

/**
 * The entries whose weight nobody lifts (by the sheet's row): over WEIGHT_MAX,
 * or WEIGHT_RATIO times the client's usual on that FileMaker name (the median
 * of the other weighted entries on it, from WEIGHT_RATIO_MIN_ENTRIES of them).
 * A typing slip can run for months (Nancy's 2000 on 12 visits, Tom Reddy's
 * 13137 on 11), so the median is of the OTHER entries, and a run of the same
 * slip is held whole. Said in the dry run so the copy of the export is
 * corrected first: an imported visit is never rewritten.
 */
export function implausibleWeights(visits: readonly Visit[], keyOf?: (line: WorkoutLine, day: string) => string | null): Set<number> {
  // "The client's usual on the machine" is the MACHINE's usual, not the FileMaker name's: a client whose
  // chart was rebuilt has one name holding an overhead press at 20 for a year and a lumbar at 88 after
  // (Beverly Snyder, wave 2b, Oct 22 2026), so the plan keys by the machine the line resolves to on its day.
  const byMachine = new Map<string, WorkoutLine[]>();
  for (const visit of visits) {
    for (const line of visit.lines) {
      if (line.weight === null || line.weight <= 0) continue;
      const key = keyOf?.(line, visit.day) ?? line.machine.toLowerCase();
      (byMachine.get(key) ?? byMachine.set(key, []).get(key)!).push(line);
    }
  }
  const held = new Set<number>();
  for (const lines of byMachine.values()) {
    for (const line of lines) {
      const w = line.weight!;
      if (w > WEIGHT_MAX) {
        held.add(line.row);
        continue;
      }
      const others = lines.filter((l) => l !== line && l.weight !== w).map((l) => l.weight!).sort((a, b) => a - b);
      if (others.length < WEIGHT_RATIO_MIN_ENTRIES) continue;
      const median = others[Math.floor(others.length / 2)];
      if (median > 0 && w >= WEIGHT_RATIO * median) held.add(line.row);
    }
  }
  return held;
}

export const IMPLAUSIBLE_WEIGHT_WHY = `a weight nobody lifts (over ${WEIGHT_MAX}, or ${WEIGHT_RATIO} times the client's usual on the machine): a typing slip to correct in the copy of the export first`;

/* ------------------------------------------------------------------ *
 * Visits
 * ------------------------------------------------------------------ */

export interface Visit {
  day: string;
  /** In the order done: WorkoutOrder, then the sheet's row. */
  lines: WorkoutLine[];
  /** The same machine a second time that day: kept out. */
  repeats: WorkoutLine[];
}

/**
 * An entry that says nothing about what was done: no weight and no count
 * (readSet's "empty"; a next time's weight alone says nothing about today),
 * and no cell that failed to read.
 */
function isBlank(line: WorkoutLine): boolean {
  return line.problems.length === 0 && readSet(line, false).kind === "empty";
}

/**
 * One client's entries as visits, oldest first. Entries with no day are
 * returned apart. The same machine twice on a day keeps the first entry with
 * something on it; a second entry with something on it too is a repeat, held
 * back, and a blank one is dropped (it says nothing either way).
 */
export function groupVisits(lines: readonly WorkoutLine[]): { visits: Visit[]; undated: WorkoutLine[] } {
  const byDay = new Map<string, WorkoutLine[]>();
  const undated: WorkoutLine[] = [];
  for (const line of lines) {
    if (!line.day) {
      undated.push(line);
      continue;
    }
    (byDay.get(line.day) ?? byDay.set(line.day, []).get(line.day)!).push(line);
  }
  const visits: Visit[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const sorted = [...byDay.get(day)!].sort(
      (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.row - b.row,
    );
    // A machine with an entry that says something is that entry, in its own place in the order
    // (the biggest sample's Cx, Apr 3 2026: blank first, then with its weight).
    const said = new Set(sorted.filter((l) => !isBlank(l)).map((l) => l.machine.toLowerCase()));
    const seen = new Set<string>();
    const kept: WorkoutLine[] = [];
    const repeats: WorkoutLine[] = [];
    for (const line of sorted) {
      const key = line.machine.toLowerCase();
      if (key && isBlank(line) && said.has(key)) continue;
      if (key && seen.has(key)) {
        // Two entries that both say something: the first stands, the second is held back. A second blank says nothing.
        if (!isBlank(line)) repeats.push(line);
        continue;
      }
      if (key) seen.add(key);
      kept.push(line);
    }
    visits.push({ day, lines: kept, repeats });
  }
  return { visits, undated };
}

/* ------------------------------------------------------------------ *
 * What a person should know about the data
 * ------------------------------------------------------------------ */

/**
 * How serious a finding is:
 *   handled  the import deals with it by a rule above; said once, counted;
 *   look     it imports, but a person may want to check it against the chart;
 *   held     that entry or visit does NOT import until someone fixes it.
 */
export type Level = "handled" | "look" | "held";

export interface Finding {
  level: Level;
  /** A short sentence, the same for every finding of its kind. */
  what: string;
  /** Where: the day and machine, or the row. */
  where: string;
}

const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);


/**
 * Whether the reps and next-time columns look the other way round from the
 * samples (the swap in records.ts). In every sample the reps column is filled
 * on most entries and next time's weight on few (31 of 378, 9 of 714, 3 of
 * 1,515), because a count is written at every machine and a new weight only
 * now and then. Swapped, it is the opposite: small counts fill the next-time
 * column and the reps column is mostly blank. Timed holds (30 seconds and
 * more) don't matter to this, so a client who does mostly holds still passes.
 * A file that reads the other way stops the import.
 */
export function columnsLookSwapped(lines: readonly WorkoutLine[]): boolean {
  const entries = lines.filter((l) => l.weight !== null && l.weight > 0);
  if (entries.length < 20) return false;
  const smallIn = (pick: (l: WorkoutLine) => number | null) =>
    entries.filter((l) => {
      const v = pick(l);
      return v !== null && v >= 1 && v <= REPS_MAX;
    }).length / entries.length;
  const next = smallIn((l) => l.nextWeight);
  const reps = smallIn((l) => l.reps);
  // Mostly counts in the next-time column, or (a client whose counts are often blank) far more there than in reps.
  return (next > 0.5 && reps < 0.25) || (next > 0.25 && next > 3 * reps);
}

/**
 * The findings for one client's visits. `perSide(machine, day)` and
 * `holdsOn(machine, day)` answer for the Journey machine an entry maps to that
 * day (whether it is done one side at a time; whether a timed hold is real on it).
 */
export function findingsOf(
  visits: readonly Visit[],
  undated: readonly WorkoutLine[],
  perSide: (machine: string, day: string) => boolean,
  holdsOn: (machine: string, day: string) => boolean = () => true,
): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, what: string, where: string) => out.push({ level, what, where });

  for (const line of undated) {
    add("held", "An entry with no date", `row ${line.row}${line.machine ? `, ${line.machine}` : ""}${line.problems.length ? ` (${line.problems.join("; ")})` : ""}`);
  }

  const implausible = implausibleWeights(visits);
  for (const visit of visits) {
    const where = (l: WorkoutLine) => `${visit.day} ${l.machine || `row ${l.row}`}`;
    for (const line of visit.repeats) add("held", "The same machine twice on one day (the second is kept out)", where(line));
    for (const line of visit.lines) {
      for (const p of line.problems) add("held", "A cell that can't be read", `${where(line)}: ${p}`);
      if (!line.machine) add("held", "An entry with no machine", `${visit.day} row ${line.row}`);
      if (implausible.has(line.row)) add("held", "A weight nobody lifts (a typing slip: correct the copy of the export first)", `${where(line)}: ${line.weight}`);
      const reading = readSet(line, perSide(line.machine, visit.day), holdsOn(line.machine, visit.day));
      if (reading.kind === "unclear") add("held", "A count that can't be read safely", `${where(line)}: ${reading.why}`);
      if (line.reps !== null && line.reps < 0 && reading.kind !== "unclear") {
        add("handled", "A minus before the count (a mark for rep quality: the count imports, the minus doesn't)", `${where(line)}: ${line.reps}`);
      }
      // Nothing to fix and nothing to import: the visit imports without it (the biggest sample has 81).
      if (reading.kind === "empty") add("handled", "A machine with nothing written (left out; the visit imports)", where(line));
      if (reading.kind !== "not-performed" && reading.kind !== "empty" && reading.kind !== "unclear" && !line.weight) {
        add("look", "Done with no weight written", where(line));
      }
      if (line.weight !== null && line.weight > 0 && line.weight % 1 !== 0) add("look", "A weight with a decimal", `${where(line)}: ${line.weight}`);
      if (line.nextWeight === 0 && line.reps !== null && line.reps !== 0) {
        add("handled", "A 0 for next time beside a count (the count wins: it was done)", where(line));
      }
    }

    const orders = visit.lines.map((l) => l.order).filter((o): o is number => o !== null);
    const twice = [...new Set(orders.filter((o, i) => orders.indexOf(o) !== i))];
    if (twice.length) add("handled", "Two machines with the same order number (sheet order breaks the tie)", `${visit.day}: ${twice.join(", ")}`);
    if (visit.lines.some((l) => l.order === null)) add("handled", "A machine with no order number (placed by sheet order)", visit.day);
    const sorted = [...new Set(orders)].sort((a, b) => a - b);
    if (!twice.length && sorted.length && sorted.some((o, i) => o !== i + 1)) {
      add("handled", "Order numbers that skip (a machine taken out of the routine)", `${visit.day}: ${sorted.join(", ")}`);
    }
    if (visit.lines.length <= 2) add("look", "A visit with only one or two machines (a consult, or partly entered?)", `${visit.day}: ${visit.lines.map((l) => l.machine).join(", ")}`);
  }

  // Over time, machine by machine.
  const byMachine = new Map<string, { day: string; line: WorkoutLine }[]>();
  for (const visit of visits) {
    for (const line of visit.lines) {
      const key = line.machine.toLowerCase();
      (byMachine.get(key) ?? byMachine.set(key, []).get(key)!).push({ day: visit.day, line });
    }
  }
  for (const history of byMachine.values()) {
    for (let i = 1; i < history.length; i += 1) {
      const before = history[i - 1].line;
      const now = history[i].line;
      if (!before.weight || !now.weight) continue;
      const planned = before.nextWeight !== null && before.nextWeight === now.weight;
      const ratio = now.weight / before.weight;
      if (!planned && Math.abs(now.weight - before.weight) >= 8 && (ratio >= 1.3 || ratio <= 0.75)) {
        add("look", "A big change in weight from the visit before (a typo, a step back, or a different machine?)",
          `${history[i].day} ${now.machine}: ${before.weight} on ${history[i - 1].day}, then ${now.weight}`);
      }
    }
  }

  return out;
}

/** The numbers that describe one client's history, for the report. */
export function shapeOf(visits: readonly Visit[]) {
  const lines = visits.flatMap((v) => v.lines);
  const days = visits.map((v) => v.day);
  const gaps = days.slice(1).map((d, i) => (Date.parse(d) - Date.parse(days[i])) / 86_400_000);
  return {
    visits: visits.length,
    entries: lines.length,
    first: days[0] ?? null,
    last: days[days.length - 1] ?? null,
    machines: new Set(lines.map((l) => l.machine.toLowerCase())).size,
    repsBlankPercent: pct(lines.filter((l) => l.reps === null && l.weight !== null && l.weight > 0).length, lines.length),
    longestBreakDays: gaps.length ? Math.max(...gaps) : null,
  };
}
