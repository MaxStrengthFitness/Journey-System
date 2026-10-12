/**
 * THE CLEANING CHECKLIST — the floor's wipes as the team's light checklist
 * (the studio map, phase 4, Oct 2026).
 *
 * AJ, Oct 11 2026: "It just needs to be like an easy way a very modular way
 * to like have the team just check off what they did just like a a
 * checklist just to say, hey, yep, we did it ... It doesn't really need to
 * say like, oh, this person cleaned the machine on this day at this time.
 * It, it doesn't need to be that military." And Q1: "mark done claim for
 * later optional for planning", so there are no claims here.
 *
 * Two looks on the checklist: a tick ("Wiped today") or an empty box, with
 * a quiet plum dot on a machine a session used since its wipe (information,
 * never a verdict). A deep clean that is due is said on the card's Clean
 * part only, never on the daily checklist. Nothing here names a person or
 * says a time of day, and nothing counts anyone's cleaning.
 *
 * ONE RULE FOR THE MAP AND THE BOARD. The map's head line (`checklistLine`)
 * and Relay's "Wipe down every machine" card (`choreParts`) count the same
 * thing: a machine wiped on the studio's today, read from `machineCare`
 * (which the rules check by studio), out-of-service machines left out of
 * both sides. A chore row's own status is never counted on its own: the
 * taskInstances rule checks no studio (docs/KNOWN-TRAPS.md, "taskInstances
 * checks no studio"), so an instance is not evidence of a wipe. A LATER
 * shift of a chore that runs in two or three (Close after Opening) needs its
 * own row done as well as the wipe, never instead (`laterWipeShifts`), so the
 * morning's wipe never makes Close's card read done.
 *
 * PURE MODULE — no React, no Firestore.
 */
import { formatStudioDate, studioDateKey } from "../../../lib/studio-time";
import { upkeepRoleOf, type StudioTaskCategory, type TaskShift, type TaskTemplate } from "../../studio-tasks/types";
import type { CareActor, MachineCare, MachineWear } from "./machine-care";
import type { ShiftPhase } from "./now-context";

export type CleanState = "wiped" | "used" | "open" | "out" | "unknown";

/** A wipe time more than this far ahead of now is unknown (the rule accepts any number). */
export const FUTURE_SLOP_MS = 10 * 60_000;

export const CLEAN_WORDS: Record<CleanState, string> = {
  wiped: "Wiped today",
  used: "Used since its wipe",
  open: "",
  out: "Out of service",
  unknown: "",
};

/** Whether the last wipe fell on the studio's today; null when it can't be told (a time in the future). */
export function wipedToday(care: MachineCare | undefined, todayKey: string, nowMs: number): boolean | null {
  const at = care?.lastWipedAt ?? null;
  if (at === null) return false;
  if (at > nowMs + FUTURE_SLOP_MS) return null;
  return studioDateKey(new Date(at)) === todayKey;
}

export function cleanStateOf(i: {
  careRead: "ready" | "loading" | "failed";
  care: MachineCare | undefined;
  wear: MachineWear | null;
  todayKey: string;
  nowMs: number;
  outOfService: boolean;
}): CleanState {
  if (i.outOfService) return "out";
  if (i.careRead !== "ready") return "unknown";
  const today = wipedToday(i.care, i.todayKey, i.nowMs);
  if (today === null) return "unknown";
  if (today) return "wiped";
  // No sessions to count (Operations, the Catalog, Admins): never "used".
  if (i.wear && i.wear.touches > 0) return "used";
  return "open";
}

/**
 * "12 of 20 wiped today" · "All 20 wiped today" · "None wiped yet today";
 * null when a counted machine is unknown. A later shift of the wipe chore
 * says "this shift" in place of "today" (`choreStates`).
 */
export function checklistLine(states: readonly CleanState[], when: "today" | "this shift" = "today"): string | null {
  const counted = states.filter((s) => s !== "out");
  if (counted.length === 0) return null;
  if (counted.some((s) => s === "unknown")) return null;
  const done = counted.filter((s) => s === "wiped").length;
  if (done === 0) return `None wiped yet ${when}`;
  if (done === counted.length) return `All ${counted.length} wiped ${when}`;
  return `${done} of ${counted.length} wiped ${when}`;
}

/** Every counted machine not wiped today, in the order given (the walking order); never one out of service. */
export function markAllTargets(rows: readonly { machineId: string; state: CleanState }[]): string[] {
  return rows.filter((r) => r.state !== "out" && r.state !== "wiped").map((r) => r.machineId);
}

/** Whole days between two studio date keys ("2026-10-12"), b after a. */
function daysBetween(a: string, b: string): number | null {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return null;
  return Math.round((pb - pa) / 86_400_000);
}

const shortDate = (ms: number) => formatStudioDate(ms, { month: "short", day: "numeric" }, undefined, "");

/**
 * The card's Clean part, in lines: no names, no minutes.
 *   "Wiped today" · "Last wiped Oct 9" · "No wipe on record" ·
 *   "Can't tell when it was last wiped" (a wipe time in the future: unknown, never "none");
 *   "Deep cleaned today" · "Deep cleaned Oct 3 · due in 6 days" · "Deep clean due" · "No deep clean on record";
 *   "Wants a wipe: 5 sessions since the last one." (when the sessions say so).
 */
export function careLines(
  care: MachineCare | undefined,
  wear: MachineWear | null,
  todayKey: string,
  deepDays: number,
  nowMs: number = Date.now(),
): string[] {
  const out: string[] = [];
  const wiped = care?.lastWipedAt ?? null;
  const today = wipedToday(care, todayKey, nowMs);
  if (wiped === null) out.push("No wipe on record");
  else if (today === null) out.push("Can't tell when it was last wiped");
  else if (today) out.push("Wiped today");
  else out.push(`Last wiped ${shortDate(wiped)}`);

  const deep = care?.lastDeepCleanAt ?? null;
  const deepKey = deep !== null && deep <= nowMs + FUTURE_SLOP_MS ? studioDateKey(new Date(deep)) : null;
  const days = deepKey ? daysBetween(deepKey, todayKey) : null;
  if (deep === null || days === null) out.push("No deep clean on record");
  else if (days <= 0) out.push("Deep cleaned today");
  else if (days >= deepDays) out.push("Deep clean due");
  else {
    const left = deepDays - days;
    out.push(`Deep cleaned ${shortDate(deep)} · due in ${left} ${left === 1 ? "day" : "days"}`);
  }

  if (wear?.wantsWipe) {
    out.push(`Wants a wipe: ${wear.touches} ${wear.touches === 1 ? "session" : "sessions"} since the last one.`);
  }
  return out;
}

/** "Flagged: torn pad on the seat." — the flag's words, never who flagged it. */
export function flagLine(care: MachineCare | undefined): string | null {
  const note = care?.flag?.note?.trim();
  if (!note) return null;
  return `Flagged: ${/[.!?]$/.test(note) ? note : `${note}.`}`;
}

/** A per-machine chore in the studio's cleaning category: the wipe chore the checklist counts. */
export function isWipeChore(t: Pick<TaskTemplate, "kind" | "category"> | undefined | null, categories: readonly StudioTaskCategory[] = []): boolean {
  if (!t || t.kind !== "machine") return false;
  return t.category === "cleaning" || upkeepRoleOf(t.category, [...categories]) === "cleaning";
}

/** Today's rows that are the wipe chore's: the only rows a wipe completes. */
export function wipeRowsOf<R extends { template?: Pick<TaskTemplate, "kind" | "category"> | null }>(
  rows: readonly R[],
  categories: readonly StudioTaskCategory[] = [],
): R[] {
  return rows.filter((r) => isWipeChore(r.template, categories));
}

/** One key for a chore's shift group: its scope, its template and its shift. */
export const wipeShiftKey = (g: { scope: string; templateId: string; shift: TaskShift }): string => `${g.scope}:${g.templateId}:${g.shift}`;

/**
 * A LATER SHIFT OF THE WIPE CHORE (the studio map's final review fixes, Oct
 * 12 2026). A template may run in more than one shift (Opening and Close),
 * and each shift has its own rows. One wipe completes one row a machine
 * (`rowsForWipe`), so the morning's wipe leaves Close's rows open. The keys
 * of every group whose template also runs in an earlier shift today: those
 * cards count a machine only when it was wiped today AND its own row in that
 * shift is done (`choreStates`), so the Close card never reads done off the
 * morning's wipe and its Mark all closes its own rows.
 */
export function laterWipeShifts(groups: readonly { scope: string; templateId: string; shift: TaskShift }[]): Set<string> {
  const first = new Map<string, number>();
  for (const g of groups) {
    const k = `${g.scope}:${g.templateId}`;
    const rank = SHIFT_ORDER[g.shift] ?? 3;
    if (!first.has(k) || rank < (first.get(k) as number)) first.set(k, rank);
  }
  const out = new Set<string>();
  for (const g of groups) {
    if ((SHIFT_ORDER[g.shift] ?? 3) > (first.get(`${g.scope}:${g.templateId}`) ?? 3)) out.add(wipeShiftKey(g));
  }
  return out;
}

/**
 * Each machine of a wipe chore's group, once, in the rows' order: out of
 * service, wiped or open. Counted by the machines' wipes today (machineCare,
 * which the rules check by studio). A row's status alone is never evidence
 * of a wipe (taskInstances checks no studio); in a LATER shift
 * (`laterWipeShifts`) a done row is required as well, never instead.
 */
export function choreStates(
  groupRows: readonly { machineId?: string; status?: string }[],
  wiped: ReadonlySet<string>,
  outOfService: ReadonlySet<string>,
  laterShift = false,
): { machineId: string; state: "out" | "wiped" | "open" }[] {
  const rowDone = new Set<string>();
  if (laterShift) for (const r of groupRows) if (r.machineId && r.status === "done") rowDone.add(r.machineId);
  const out: { machineId: string; state: "out" | "wiped" | "open" }[] = [];
  const seen = new Set<string>();
  for (const r of groupRows) {
    const id = r.machineId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const isWiped = wiped.has(id) && (!laterShift || rowDone.has(id));
    out.push({ machineId: id, state: outOfService.has(id) ? "out" : isWiped ? "wiped" : "open" });
  }
  return out;
}

/**
 * A wipe chore's parts, by the machines' wipes today (never by the rows'
 * status alone): out-of-service machines are left out of done AND total;
 * complete when every counted machine is wiped. A later shift needs its own
 * row done too (`choreStates`).
 */
export function choreParts(
  groupRows: readonly { machineId?: string; status?: string }[],
  wiped: ReadonlySet<string>,
  outOfService: ReadonlySet<string>,
  laterShift = false,
): { done: number; total: number; complete: boolean } {
  let done = 0;
  let total = 0;
  for (const m of choreStates(groupRows, wiped, outOfService, laterShift)) {
    if (m.state === "out") continue;
    total += 1;
    if (m.state === "wiped") done += 1;
  }
  return { done, total, complete: total > 0 && done === total };
}

export interface UndoWipe {
  machineId: string;
  lastWipedAt: number | null;
  lastWipedBy: CareActor | null;
}

/** The chore shift a wipe now belongs to: the Board's part of the day (`partNow`), Opening, Between clients or Close. */
export function shiftNowOf(phase: ShiftPhase): TaskShift {
  if (phase === "opening") return "am";
  if (phase === "mid") return "any";
  return "pm";
}

const SHIFT_ORDER: Record<TaskShift, number> = { am: 0, any: 1, pm: 2 };

/**
 * ONE ROW PER MACHINE PER WIPE (phase 4 review fixes, Oct 12 2026). A wipe
 * completes one open wipe-chore row for each machine: the row of the shift
 * it is now when there is one, else the earliest still open (Opening, then
 * Between clients, then Close). So a 7 AM wipe never closes the Close
 * shift's row too, a studio with a single wipe chore still gets its row done
 * whenever it is wiped, and a batch carries at most two writes a machine.
 * The Board's Mark all passes one shift's rows, so it picks that shift's.
 */
export function rowsForWipe<R extends { machineId?: string; status: string; kind?: string; shift: TaskShift }>(
  rows: readonly R[],
  ids: readonly string[],
  shiftNow: TaskShift | null,
): Map<string, R> {
  const wanted = new Set(ids);
  const out = new Map<string, R>();
  for (const r of rows) {
    if (r.kind !== "machine" || r.status !== "open" || !r.machineId || !wanted.has(r.machineId)) continue;
    const had = out.get(r.machineId);
    if (!had) {
      out.set(r.machineId, r);
      continue;
    }
    const rank = (x: R) => (x.shift === shiftNow ? -1 : SHIFT_ORDER[x.shift] ?? 3);
    if (rank(r) < rank(had)) out.set(r.machineId, r);
  }
  return out;
}

/**
 * Which machines an Undo may put back (phase 4 review fixes, Oct 12 2026):
 * only those whose live wipe is still the one this mark wrote (its time and
 * its author). A machine another iPad wiped since keeps that later wipe, and
 * its row stays as it is. Read from the live care read when Undo is tapped.
 */
export function undoTargetsOf(
  live: Record<string, MachineCare | undefined>,
  ids: readonly string[],
  at: number,
  authorId: string,
): string[] {
  return ids.filter((id) => live[id]?.lastWipedAt === at && live[id]?.lastWipedBy?.id === authorId);
}

/** What each machine's last wipe was before a mark, nulls kept, for its Undo. */
export function undoValuesOf(before: Record<string, MachineCare | undefined>, ids: readonly string[]): UndoWipe[] {
  return ids.map((id) => ({
    machineId: id,
    lastWipedAt: before[id]?.lastWipedAt ?? null,
    lastWipedBy: before[id]?.lastWipedBy ?? null,
  }));
}
