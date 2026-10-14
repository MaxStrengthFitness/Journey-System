/**
 * PUTTING IMPORTED SETS BACK ON THE RIGHT MACHINES.
 *
 * Allan Boike's trial import (Oct 13 2026): FileMaker's export named his
 * machines wrongly from Aug 24 2024 on ("Abs" was his Chest Fly, "Chest fly"
 * his Pulldown, Seated Dip and Comp. Row swapped, ...), while the chart a
 * trainer reads was right. The weights and the order were right; only the
 * names were not. The importer wrote what the file said.
 *
 * The cure is the machine table's client rows (machine-map.ts): the client's
 * own names, from a day. This file compares two plans of the same visits,
 * the OLD one (the table the import used: the studio's rows) and the NEW one
 * (with the client's rows), against what Journey holds, and says what to
 * change. Pure; scripts/import-filemaker.ts --relabel reads and writes.
 *
 * WHAT IT NEVER DOES
 *   - Touch a session someone edited in Journey (the History pop-up's stamp),
 *     or one whose sets in Journey are not exactly what the import wrote
 *     under the old names: then nobody can say what the old names were.
 *   - Change a set's numbers. A relabel moves a set to another machine; if
 *     the new plan would add or drop a set that day, the visit is left alone
 *     and said.
 *   - Write over a weight a person set after the import, or anything
 *     Journey's own sessions wrote ("last time" and next time's weight on a
 *     machine the client has done in Journey since).
 */

import type { ClientWrite, PlannedLog, PlannedSession } from "./plan";

export interface StoredLog {
  id: string;
  data: Record<string, unknown>;
}

/** An imported session as Journey holds it now, with its sets. */
export interface StoredSession {
  id: string;
  data: Record<string, unknown>;
  logs: StoredLog[];
}

/** A set moving from one machine to another, for the person reading the dry run. */
export interface Move {
  day: string;
  from: string;
  to: string;
  weight: string;
}

export type SessionOutcome =
  | { kind: "same" }
  | { kind: "change"; sessionMachineIds: string[] | null; set: PlannedLog[]; remove: string[]; moves: Move[] }
  | { kind: "left"; why: string };

/** The fields that say what was done in a set: a relabel never changes one. */
const SET_FIELDS = ["weight", "reps", "seconds", "outcome", "repsNotRecorded", "isTSC", "isStaticHold", "side", "skipReason"] as const;

const valueOf = (v: unknown) => (v === undefined || v === null || v === false ? "" : String(v));

/** A set's numbers as one string, its machine left out. */
function setKey(data: Record<string, unknown>): string {
  return SET_FIELDS.map((f) => valueOf(data[f])).join("|");
}

/** A set's place in the visit and its numbers: what a document holds besides its machine. */
const docKey = (data: Record<string, unknown>) => `${valueOf(data.suggestedOrder)}:${setKey(data)}`;

/** The sets' numbers, in order, without their machines: a relabel keeps this the same. */
function numbersOf(logs: readonly { data: Record<string, unknown> }[]): string {
  return logs
    .map((l) => docKey(l.data))
    .sort()
    .join(";");
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether someone changed the session in Journey after the import (client-history/session-edits.ts's stamp). */
export function wasEdited(session: Record<string, unknown>): boolean {
  return !!session.editedAt || (typeof session.editCount === "number" && session.editCount > 0);
}

/**
 * One imported visit: what Journey holds, what the import wrote (the old
 * plan) and what it should have written (the new plan).
 */
export function sessionOutcome(oldPlan: PlannedSession, newPlan: PlannedSession, stored: StoredSession): SessionOutcome {
  if (wasEdited(stored.data)) return { kind: "left", why: "someone edited this session in Journey" };

  const storedById = new Map(stored.logs.map((l) => [l.id, l.data]));
  const storedMachines = Array.isArray(stored.data.sessionMachineIds) ? (stored.data.sessionMachineIds as unknown[]) : [];
  const newMachines = (newPlan.data.sessionMachineIds as string[]) ?? [];
  const holds = (plan: PlannedSession) =>
    stored.logs.length === plan.logs.length && plan.logs.every((l) => storedById.has(l.id) && docKey(storedById.get(l.id)!) === docKey(l.data));
  // Already corrected (a second run): nothing to do.
  if (holds(newPlan) && sameList(storedMachines, newMachines)) return { kind: "same" };

  // Journey holds exactly what the import wrote under the old names, or nobody can say what they were.
  const oldIds = oldPlan.logs.map((l) => l.id);
  if (stored.logs.length !== oldIds.length || oldIds.some((id) => !storedById.has(id))) {
    return { kind: "left", why: "its sets in Journey are not the ones the import wrote (changed since, or imported with another table)" };
  }
  if (oldPlan.logs.some((l) => docKey(l.data) !== docKey(storedById.get(l.id)!))) {
    return { kind: "left", why: "a set's numbers in Journey differ from the import's (changed since)" };
  }
  // A set is rewritten whole: anything Journey added to it since the import would be lost, so a person looks first.
  const added = oldPlan.logs.flatMap((l) => Object.keys(storedById.get(l.id)!).filter((k) => !(k in l.data)));
  if (added.length) return { kind: "left", why: `a set carries what Journey added since the import (${[...new Set(added)].join(", ")})` };
  if (numbersOf(oldPlan.logs) !== numbersOf(newPlan.logs)) {
    return { kind: "left", why: "the corrected table would add or drop a set that day, not only move one" };
  }

  const newIds = new Set(newPlan.logs.map((l) => l.id));
  // A swap of two sets with the same numbers still moves their places in the order.
  const set = newPlan.logs.filter((l) => !storedById.has(l.id) || docKey(storedById.get(l.id)!) !== docKey(l.data));
  const remove = stored.logs.map((l) => l.id).filter((id) => !newIds.has(id));
  const machinesChange = !sameList(storedMachines, newMachines);
  if (!set.length && !remove.length && !machinesChange) return { kind: "same" };

  // For the reader: each set in the order done, the old machine beside the new.
  const at = (l: PlannedLog) => `${valueOf(l.data.suggestedOrder)}:${valueOf(l.data.side)}`;
  const before = new Map(oldPlan.logs.map((l) => [at(l), l]));
  const moves: Move[] = [];
  for (const l of newPlan.logs) {
    const was = before.get(at(l));
    if (was && was.machineId !== l.machineId && !l.data.side) moves.push({ day: newPlan.day, from: was.machineId, to: l.machineId, weight: valueOf(l.data.weight) });
  }
  return { kind: "change", sessionMachineIds: machinesChange ? newMachines : null, set, remove, moves };
}

/**
 * Every machine a set moves off or onto between the two plans. From the plans,
 * not from what Journey holds, so a run stopped halfway and run again still
 * works out the same machines' totals.
 */
export function involvedMachines(pairs: readonly { old: PlannedSession; neu: PlannedSession }[]): string[] {
  const out = new Set<string>();
  for (const { old, neu } of pairs) {
    // A machine is involved when its set in the visit is not the same set in both plans: gone, new, or
    // the same id holding another machine's numbers (a swap reuses both ids).
    const oldById = new Map(old.logs.map((l) => [l.id, docKey(l.data)]));
    const newById = new Map(neu.logs.map((l) => [l.id, docKey(l.data)]));
    for (const l of old.logs) if (newById.get(l.id) !== docKey(l.data)) out.add(l.machineId);
    for (const l of neu.logs) if (oldById.get(l.id) !== docKey(l.data)) out.add(l.machineId);
  }
  return [...out].sort();
}

/** The client's sets once the changes are made: the list Journey will hold. */
export function logsAfter<L extends StoredLog>(
  logs: readonly L[],
  changes: readonly { set: readonly PlannedLog[]; remove: readonly string[] }[],
): StoredLog[] {
  const byId = new Map<string, StoredLog>(logs.map((l) => [l.id, l]));
  for (const c of changes) {
    for (const id of c.remove) byId.delete(id);
    for (const l of c.set) byId.set(l.id, { id: l.id, data: l.data });
  }
  return [...byId.values()];
}

/* ------------------------------------------------------------------ *
 * "Last time" and next time's weight
 * ------------------------------------------------------------------ */

const numberOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

export interface TotalsInput {
  /** Every machine a set moved off or onto. */
  involved: readonly string[];
  /** clientWriteFor over the OLD plan's imported sessions, as if from nothing (what the import set). */
  oldWrite: ClientWrite;
  /** The same over the NEW plan (what it should have set). */
  newWrite: ClientWrite;
  /** "Last time" per machine now (both sides merged, machine-totals/totals.ts). */
  metricsOnFile: Record<string, Record<string, unknown> | undefined>;
  /** clientMachineSettings now, per machine. */
  settingsOnFile: ReadonlyMap<string, Record<string, unknown>>;
  /** Machines the client has a performed set on in Journey's own sessions. */
  journeyMachines: ReadonlySet<string>;
  isImportedSession: (sessionId: string) => boolean;
}

export interface SettingsChange {
  machineId: string;
  /** The day the value is from (the importer's `updatedAt`). */
  day: string;
  /** null: take next time's weight off (no imported set is left on the machine). */
  currentWeight?: number | null;
  /** null: take the starting weight off. */
  startingWeight?: number | null;
  startingDay?: string | null;
}

export interface TotalsPlan {
  /** "Last time" to write per machine; null takes it off (no imported set is left on that machine). */
  metrics: Record<string, Record<string, unknown> | null>;
  settings: SettingsChange[];
  /** What was left as it is, and why, for the reader. */
  kept: { machineId: string; what: string }[];
}

/**
 * "Last time" and next time's weight on the machines a relabel touches. The
 * import's own rule (plan.ts clientWriteFor) works out both from the new
 * plan; what is on file is replaced only where the import put it there.
 */
export function totalsPlan(input: TotalsInput): TotalsPlan {
  const plan: TotalsPlan = { metrics: {}, settings: [], kept: [] };
  const newSettings = new Map(input.newWrite.settings.map((s) => [s.machineId, s]));
  const oldSettings = new Map(input.oldWrite.settings.map((s) => [s.machineId, s]));

  for (const m of input.involved) {
    // "Last time": Journey's own wins; an imported one is worked out again.
    const onFile = input.metricsOnFile[m];
    const fromSession = typeof onFile?.lastSessionId === "string" ? onFile.lastSessionId : null;
    if (onFile && fromSession && !input.isImportedSession(fromSession)) {
      plan.kept.push({ machineId: m, what: "last time (from a Journey session)" });
    } else {
      const next = input.newWrite.totals[`currentMachineMetrics.${m}`] as Record<string, unknown> | undefined;
      if (next) {
        if (!onFile || onFile.lastSessionId !== next.lastSessionId || valueOf(onFile.weight) !== valueOf(next.weight)) plan.metrics[m] = next;
      } else if (onFile) plan.metrics[m] = null;
    }

    // Next time's weight and the starting weight: only where the import's value still stands.
    const on = input.settingsOnFile.get(m);
    const was = oldSettings.get(m);
    const should = newSettings.get(m);
    const change: SettingsChange = { machineId: m, day: should?.day ?? was?.day ?? "" };
    const current = numberOf(on?.currentWeight);
    const currentWas = was?.currentWeight ?? null;
    const currentShould = should?.currentWeight ?? null;
    if (input.journeyMachines.has(m)) {
      // The client's sessions in Journey since have their say on next time.
      plan.kept.push({ machineId: m, what: "next time's weight (the client has done it in Journey since)" });
    } else if (current !== null && current !== currentShould && current !== currentWas) {
      plan.kept.push({ machineId: m, what: `next time's weight ${current} (set after the import)` });
    } else if (current !== currentShould) {
      // null: no imported set is left on the machine, so the import's weight comes off.
      change.currentWeight = currentShould;
    }
    // A starting weight is the first FileMaker day's, which no Journey session changes (Finish never writes over one).
    const starting = numberOf(on?.startingWeight);
    const startWas = was?.startingWeight ?? null;
    const startShould = should?.startingWeight ?? null;
    if (starting !== null && starting !== startShould && starting !== startWas) {
      plan.kept.push({ machineId: m, what: `starting weight ${starting} (set after the import)` });
    } else if (starting !== startShould) {
      change.startingWeight = startShould;
      change.startingDay = should?.startingDay ?? null;
    }
    if (change.currentWeight !== undefined || change.startingWeight !== undefined) plan.settings.push(change);
  }
  return plan;
}
