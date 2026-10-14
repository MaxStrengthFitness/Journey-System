/**
 * A made-up long-standing client, shaped like the FileMaker import (Oct 13
 * 2026): two and a half years of visits written the way the import writes
 * them, then three months recorded in Journey.
 *
 *   Before Journey (the import)  weight and reps only; a fair share of reps
 *                                never written down (`repsNotRecorded`, as at
 *                                Strongsville); no rep quality, no time under
 *                                tension, no check-in, no start time, usually
 *                                no trainer. Filed at noon.
 *   In Journey                   a start time, the trainer's initials, the
 *                                check-in on the Dial, rep quality, measured
 *                                time under tension, and the Wrap-up's effort.
 *
 * Deterministic (one seeded generator), so every screenshot is the same.
 * Nothing here is a real client.
 */
import type { ExerciseLog, Machine, WorkoutSession } from "../../src/types";

let seed = 20261013;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

export const MACHINES: Machine[] = [
  ["leg-press", "Leg Press", 120],
  ["pulldown", "Pulldown", 70],
  ["chest-press", "Chest Press", 50],
  ["compound-row", "Compound Row", 60],
  ["leg-curl", "Leg Curl", 40],
  ["overhead-press", "Overhead Press", 30],
  ["lumbar", "Lumbar", 90],
  ["abdominal", "Abdominal", 50],
].map(([id, name]) => ({ id, name }) as unknown as Machine);
const START: Record<string, number> = { "leg-press": 120, pulldown: 70, "chest-press": 50, "compound-row": 60, "leg-curl": 40, "overhead-press": 30, lumbar: 90, abdominal: 50 };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface Sample {
  sessions: WorkoutSession[];
  logs: ExerciseLog[];
  /** The last day of the sample: the report's "today". */
  today: string;
  /** The first day recorded in Journey (the cutover). */
  cutover: string;
}

export function sample(opts: { journeyOnly?: boolean } = {}): Sample {
  seed = 20261013;
  const sessions: WorkoutSession[] = [];
  const logs: ExerciseLog[] = [];
  const weight: Record<string, number> = { ...START };
  const stuck: Record<string, number> = {};
  const first = new Date(2024, 3, 15);
  const cutover = new Date(2026, 6, 16);
  const last = new Date(2026, 9, 10);
  let n = 0;
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    // Tuesdays and Fridays, a missed visit now and then, two summer breaks.
    if (dow !== 2 && dow !== 5) continue;
    if (rand() < 0.1) continue;
    const m = d.getMonth();
    if ((d.getFullYear() === 2024 && m === 7 && d.getDate() < 20) || (d.getFullYear() === 2025 && m === 6 && d.getDate() > 10 && d.getDate() < 28)) continue;
    const inJourney = d >= cutover;
    if (opts.journeyOnly && !inJourney) continue;
    n += 1;
    const id = `s${n}`;
    const day = iso(d);
    const off = inJourney && rand() < 0.22;
    const hour = inJourney ? (dow === 2 ? 9 : 17) : 12;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0);
    const end = new Date(start.getTime() + 21 * 60_000);
    const session = {
      id,
      clientId: "sample",
      status: "Completed",
      date: day,
      sessionNumber: n,
      trainerInitials: inJourney ? (dow === 2 ? "AR" : "JM") : "",
      countsTowardTotals: true,
      ...(inJourney
        ? {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            preSessionCheckIn: { readiness: { sleep: off ? -2 : pick([0, 1, 1]), energy: off ? -1 : pick([0, 1]), recovery: pick([0, 0, 1]), stress: off ? -1 : 0 } },
            effort: off ? -1 : pick([0, 1, 1]),
          }
        : { legacy_filemaker_id: `fm:sample:${day}`, createdAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString() }),
    } as unknown as WorkoutSession;
    sessions.push(session);
    // Five to seven machines a visit, Leg Press always.
    const today = ["leg-press", ...MACHINES.map((x) => x.id as string).filter((x) => x !== "leg-press").filter(() => rand() < 0.75)].slice(0, 7);
    for (const mid of today) {
      // A step of 2 to 5 lb every few visits; the Pulldown stalls for the last two months.
      const pulldownStall = mid === "pulldown" && d >= new Date(2026, 7, 10);
      if (!pulldownStall && (stuck[mid] ?? 0) <= 0 && rand() < 0.16) weight[mid] += pick([2, 2, 4, 5]);
      if (!pulldownStall && rand() < 0.03) stuck[mid] = 8;
      stuck[mid] = (stuck[mid] ?? 0) - 1;
      const reps = Math.max(4, Math.round(8 + (rand() - 0.5) * 4 - (off ? 1.5 : 0)));
      const written = inJourney || rand() > 0.4;
      logs.push({
        id: `${id}-${mid}`,
        sessionId: id,
        clientId: "sample",
        machineId: mid,
        weight: String(weight[mid]),
        outcome: "performed",
        ...(written ? { reps: String(reps) } : { repsNotRecorded: true }),
        ...(inJourney
          ? { repQuality: off && rand() < 0.5 ? 1 : pick([2, 2, 3]), totalTimeUnderLoad: Math.round(70 + rand() * 40) }
          : {}),
      } as unknown as ExerciseLog);
    }
  }
  return { sessions, logs, today: iso(last), cutover: iso(cutover) };
}
