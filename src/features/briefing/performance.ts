/**
 * HOW HAVE THEY BEEN DOING? — the briefing's question 3 (the briefing round,
 * Oct 17 2026; AJ's handoff): "the last five to ten sessions on today's
 * machines only. The most important data is the most recent session ... Keep
 * the density low." A quiet "view all machines" for the rest.
 *
 * FileMaker's grid of numbers, as the placeholder the handoff asks for: one
 * column per session, newest first (the most recent is what matters most),
 * one row per machine, each cell that session's weight and reps. The handoff:
 * "Do not finalise this visualization in the same change that builds the rest
 * of the briefing. Build the data and placeholder, then design the
 * visualization in its own round." So this is the data, drawn plainly.
 *
 * Only a PERFORMED set is shown (lib/set-outcome.ts): a practice set or a
 * skip is not what the client lifted. One set per machine per session, the
 * newest. A session is a column only when one of the shown machines was done
 * in it. Nothing here suggests a weight; an empty Journey history is "nothing
 * recorded in Journey", never "never done" (docs/business/migration-and-prior-history.md).
 */
import type { ExerciseLog, Machine, WorkoutSession } from "../../types";
import { isPerformedLog } from "../../lib/set-outcome";
import { sessionStartMs } from "../client-notes/heads-up";
import { studioTodayKey } from "../../lib/studio-time";

/** How many sessions the grid shows: the handoff's "five to ten". */
export const PERFORMANCE_SESSIONS = 8;

export interface PerfColumn {
  sessionId: string;
  /** The studio day, "2026-10-15", when it could be read. */
  day: string | null;
  ms: number;
}

export interface PerfCell {
  weight: string | number | null;
  reps: string | number | null;
  unit: "reps" | "sec";
}

export interface PerfRow {
  machineId: string;
  /** One per column, in the columns' order; null where the machine wasn't done that session. */
  cells: (PerfCell | null)[];
}

export interface PerfGrid {
  columns: PerfColumn[];
  rows: PerfRow[];
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== "";
const first = (...vals: unknown[]) => (vals.find(filled) ?? null) as string | number | null;

function millis(ts: unknown): number {
  if (!ts) return 0;
  const t = ts as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const d = new Date(ts as string);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function isTimed(log: ExerciseLog, machine?: Pick<Machine, "targetRepRange">): boolean {
  const range = machine?.targetRepRange?.toLowerCase() ?? "";
  return Boolean(log.isTSC) || range.includes("tsc") || range.includes("static") || range.includes("time");
}

/** What a set says: its weight, and its reps or its seconds (the same reading as the list's last time). */
export function cellOf(log: ExerciseLog, machine?: Pick<Machine, "targetRepRange">): PerfCell {
  const timed = isTimed(log, machine);
  return {
    weight: first(log.weight, log.loadLb),
    reps: timed ? first(log.seconds, log.outcomeTut, log.timeSpent, log.reps) : first(log.reps, log.outcomeReps),
    unit: timed ? "sec" : "reps",
  };
}

/**
 * The grid for these machines: the newest `limit` sessions in which one of
 * them was done, newest first, and each machine's set in each.
 */
export function performanceGrid(input: {
  machineIds: readonly string[];
  logs: readonly ExerciseLog[];
  sessions?: readonly WorkoutSession[];
  machines?: readonly Pick<Machine, "id" | "targetRepRange">[];
  limit?: number;
}): PerfGrid {
  const limit = input.limit ?? PERFORMANCE_SESSIONS;
  const shown = new Set(input.machineIds);
  const sessionById = new Map((input.sessions ?? []).filter((s) => s.id).map((s) => [s.id as string, s]));
  const machineById = new Map((input.machines ?? []).map((m) => [m.id, m]));

  /* The newest performed set per machine per session. */
  const bySession = new Map<string, Map<string, ExerciseLog>>();
  const lastMs = new Map<string, number>();
  for (const log of input.logs) {
    if (!log?.sessionId || !shown.has(log.machineId) || !isPerformedLog(log)) continue;
    const at = millis(log.createdAt);
    const per = bySession.get(log.sessionId) ?? new Map<string, ExerciseLog>();
    const had = per.get(log.machineId);
    if (!had || millis(had.createdAt) <= at) per.set(log.machineId, log);
    bySession.set(log.sessionId, per);
    lastMs.set(log.sessionId, Math.max(lastMs.get(log.sessionId) ?? 0, at));
  }

  const columns: PerfColumn[] = [...bySession.keys()]
    .map((sessionId) => {
      const session = sessionById.get(sessionId);
      const start = session ? sessionStartMs(session) : null;
      const ms = start ?? lastMs.get(sessionId) ?? 0;
      const date = typeof session?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(session.date) ? session.date : null;
      return { sessionId, day: date ?? (ms ? studioTodayKey(new Date(ms)) : null), ms };
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);

  const rows: PerfRow[] = input.machineIds.map((machineId) => ({
    machineId,
    cells: columns.map((c) => {
      const log = bySession.get(c.sessionId)?.get(machineId);
      return log ? cellOf(log, machineById.get(machineId)) : null;
    }),
  }));
  return { columns, rows };
}

/** Machines done in these logs that aren't on today's list, the most recently done first: "View all machines". */
export function otherMachinesDone(logs: readonly ExerciseLog[], today: readonly string[]): string[] {
  const on = new Set(today);
  const newest = new Map<string, number>();
  for (const log of logs) {
    if (!log?.machineId || on.has(log.machineId) || !isPerformedLog(log)) continue;
    newest.set(log.machineId, Math.max(newest.get(log.machineId) ?? 0, millis(log.createdAt)));
  }
  return [...newest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
