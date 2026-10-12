/**
 * ONE CLIENT'S FILEMAKER HISTORY AS JOURNEY DOCUMENTS.
 *
 * Pure: given what was read (the visits, the machine table, what Journey
 * already holds), it says exactly which documents to write. The script
 * (scripts/import-filemaker.ts) only reads and writes.
 *
 * WHAT A VISIT BECOMES (the shape a finished session already has, so every
 * screen reads it with no second code path):
 *
 *   sessions/{fm_<client>_<day>}     one per visit: Completed, the client's
 *       home studio as the host (AJ, Oct 12 2026: the studio a visit was at
 *       isn't needed), the machines in the order done, `legacy_filemaker_id`
 *       (the History says "Imported" instead of a time, and the pre-launch
 *       reset keeps it), `rollupCounted` so the trainer-rollup trigger does
 *       nothing per document (Admins → Machinery → System tools rebuilds the
 *       trainers' counts once, afterwards), and `createdAt` and `endTime` at
 *       noon of the visit's own day in the studio's zone. Never the time of
 *       the import: the Hub, Insights, Hours, the month tally and the machine
 *       trends all read `createdAt`, and years of history stamped "today"
 *       would flood every one of them; the briefing's "Last session" reads
 *       `endTime`.
 *
 *   exerciseLogs/{<session>_<machine>[_Left|_Right]}   one per machine (two
 *       for a machine done one side at a time), the id Journey derives for a
 *       set (lib/exercise-log-id.ts), weight and reps as text the way the
 *       floor writes them, `machineSettings: {}` ("not recorded": FileMaker
 *       keeps today's dials, not that day's).
 *
 * The ids are DERIVED, never random: running the import twice finds its own
 * documents and writes nothing new. That makes "run it again" the way to
 * recover from a stop, not a way to double a history.
 *
 * WHAT IS NOT IMPORTED, AND SAID
 *   - a visit after the last day to import (`through`, the day before the
 *     studio's switch-over): FileMaker is still in use, and a day Journey owns
 *     must not come in twice;
 *   - a visit on a day Journey already has a session for the client;
 *   - a visit where nothing was done (every machine 0, blank or unreadable):
 *     a session with no set done would count as a visit that wasn't one;
 *   - ANY of the client's visits while one of them has a machine nobody has
 *     matched to a Journey machine: the client waits whole. A visit can't land
 *     with a machine missing (a session's machines are written once), and
 *     importing around it would leave a gap in the numbers that Start, which
 *     numbers the next session from the count, would later fill twice;
 *   - an entry the reading in visits.ts calls unclear, empty or a repeat:
 *     the visit imports without it.
 */

import { logDocId } from "../../lib/exercise-log-id";
import { priorUncounted, recordImportedSessions, type PriorHistory } from "../../lib/prior-history";
import { importedSessionsRollup, type FieldOps } from "../../lib/client-rollups";
import { splitMachineTotalsUpdates } from "../machine-totals/totals";
import { wallClockToInstant } from "../../lib/studio-time";
import { readSet, type SetReading, type Visit } from "./visits";
import type { WorkoutLine } from "./records";

/** The machine table's word for "never import this FileMaker name" (machine-map.ts). */
export const SKIP = "skip";

export interface ClientTarget {
  /** The Journey client document (`clients/{id}`). */
  docId: string;
  mindbodyClientId: string;
  name: string;
  homeStudioId: string;
  /** FileMaker's own id for the client, kept on each session so an import can always be traced. */
  fmClientId: string | null;
}

export interface PlanInput {
  client: ClientTarget;
  visits: readonly Visit[];
  /** The last day to import, inclusive. Null imports nothing. */
  through: string | null;
  timeZone: string;
  /** The Journey machine for a FileMaker name on a day: an id, "skip", or null when not matched yet. */
  machineFor: (fmName: string, day: string) => string | null;
  /** Whether a Journey machine is done one side at a time (lib/floor-machines.ts isPerSideMachine). */
  perSide: (machineId: string) => boolean;
  /** Days Journey already has one of the client's own sessions on (not imported ones). */
  journeyDays: ReadonlySet<string>;
  /** Imported sessions already in Journey, by id, with the number each was stored under. */
  existing: ReadonlyMap<string, number | null>;
  /** Sessions before the first FileMaker visit, when a person stated a total (numberOffsetFor), else 0. */
  numberOffset: number;
}

export interface PlannedLog {
  id: string;
  machineId: string;
  data: Record<string, unknown>;
}

export interface PlannedSession {
  id: string;
  day: string;
  number: number;
  /** Already in Journey from an earlier run: nothing is written for it. */
  exists: boolean;
  data: Record<string, unknown>;
  logs: PlannedLog[];
  /** FileMaker's next-time weight per Journey machine on this visit, when one was set. */
  nextWeights: Record<string, number>;
}

export interface ClientPlan {
  sessions: PlannedSession[];
  /** Whole visits not imported, and why. */
  skipped: { day: string; why: string }[];
  /** Entries not imported (the visit still is), and why. */
  held: { day: string; machine: string; why: string }[];
  /** FileMaker names nobody has matched yet: while there are any, the client waits whole and `sessions` is empty. */
  unmatched: string[];
  /** Each Journey machine's first FileMaker day with a weight done: only that day's weight is a starting weight. */
  firstDays: Record<string, string>;
  /** Imported sessions whose stored number differs from today's plan (the export or --through changed): the client stops. */
  numberDrift: { id: string; stored: number | null; planned: number }[];
}

/**
 * The sessions the client had before the first FileMaker visit, for numbering:
 * known only when a person stated a total before Journey (`priorHistory`).
 * That total counts the FileMaker visits too, so they come off it, and the
 * ones an earlier run already imported are already in `importedCount`. With
 * no stated total it is 0: Journey numbers from what it holds, as it does for
 * every session (Start numbers the next one `sessionCount + 1`).
 */
export function numberOffsetFor(prior: PriorHistory | null, fmVisits: number, fmAlreadyImported: number): number {
  if (!prior || !Number.isFinite(prior.sessions)) return 0;
  const otherImports = Math.max(0, Math.trunc(prior.importedCount ?? 0) - fmAlreadyImported);
  return Math.max(0, Math.trunc(prior.sessions) - otherImports - fmVisits);
}

/** The session document id for one of the client's FileMaker visits. */
export function sessionIdFor(clientDocId: string, day: string): string {
  return `fm_${clientDocId}_${day}`;
}

/** Noon of a studio day, the instant a visit is filed under (and `seconds` past it, to keep a visit's sets in order). */
export function visitInstant(day: string, timeZone: string, seconds = 0): Date {
  const noon = wallClockToInstant(`${day}T12:00:00`, timeZone);
  if (!noon) throw new Error(`Not a day: ${day}`);
  return new Date(noon.getTime() + seconds * 1000);
}

const DONE: ReadonlySet<SetReading["kind"]> = new Set(["reps", "seconds", "sides", "not-recorded"]);

/** Was something done on this entry? A decimal counts when it reads as left.right. */
function wasDone(line: WorkoutLine, perSide: boolean | null): boolean {
  const reading = readSet(line, perSide ?? !Number.isInteger(line.reps ?? 0));
  return DONE.has(reading.kind);
}

const weightText = (w: number | null): string => (w === null ? "" : String(w));

/** The log documents for one entry on a Journey machine. */
function logsFor(line: WorkoutLine, machineId: string, perSide: boolean): Record<string, unknown>[] {
  const reading = readSet(line, perSide);
  const weight = weightText(line.weight);
  const both = (fields: Record<string, unknown>) =>
    perSide ? [{ ...fields, side: "Left" }, { ...fields, side: "Right" }] : [fields];
  switch (reading.kind) {
    case "reps":
      return both({ weight, reps: String(reading.reps), outcome: "performed" });
    case "seconds":
      return both({ weight, seconds: String(reading.seconds), isTSC: true, isStaticHold: true, outcome: "performed" });
    case "sides":
      return [
        { weight, reps: String(reading.left), outcome: "performed", side: "Left" },
        { weight, reps: String(reading.right), outcome: "performed", side: "Right" },
      ];
    case "not-recorded":
      // Done at this weight, the count not written down (AJ, Oct 12 2026).
      return both({ weight, outcome: "performed", repsNotRecorded: true });
    case "not-performed":
      return both({ weight, outcome: "skipped", skipReason: "unknown" });
    default:
      return [];
  }
}

export function planClient(input: PlanInput): ClientPlan {
  const { client, timeZone } = input;
  const plan: ClientPlan = { sessions: [], skipped: [], held: [], unmatched: [], firstDays: {}, numberDrift: [] };
  const unmatched = new Set<string>();
  const machineOf = (line: WorkoutLine, day: string) => (line.machine ? input.machineFor(line.machine, day) : null);
  let position = 0;

  // First, whether anything waits for the machine table: then the client waits whole.
  const waitingDays = new Map<string, string[]>();
  for (const visit of input.visits) {
    if (!input.through || visit.day > input.through || input.journeyDays.has(visit.day)) continue;
    const names = [...new Set(visit.lines.filter((l) => l.machine && machineOf(l, visit.day) === null).map((l) => l.machine))];
    if (names.length) waitingDays.set(visit.day, names);
  }
  for (const names of waitingDays.values()) for (const n of names) unmatched.add(n);

  for (const visit of input.visits) {
    if (!input.through || visit.day > input.through) {
      plan.skipped.push({ day: visit.day, why: input.through ? `after ${input.through}, the last day to import` : "no last day to import was given" });
      continue;
    }
    if (input.journeyDays.has(visit.day)) {
      plan.skipped.push({ day: visit.day, why: "Journey already has a session for the client that day" });
      continue;
    }
    const doneSomewhere = visit.lines.some((l) => {
      const id = machineOf(l, visit.day);
      return wasDone(l, id && id !== SKIP ? input.perSide(id) : null);
    });
    if (!doneSomewhere) {
      plan.skipped.push({ day: visit.day, why: "nothing was done that day (every machine 0, blank or unreadable)" });
      continue;
    }

    if (unmatched.size) {
      const names = waitingDays.get(visit.day);
      plan.skipped.push({
        day: visit.day,
        why: names ? `waiting for the machine table: ${names.join(", ")}` : "waits with the client: other visits wait for the machine table",
      });
      continue;
    }

    // Each machine's first day with a weight done: a starting weight is that day's only.
    for (const line of visit.lines) {
      const id = machineOf(line, visit.day);
      if (!id || id === SKIP || plan.firstDays[id]) continue;
      if (line.weight !== null && line.weight > 0 && wasDone(line, input.perSide(id))) plan.firstDays[id] = visit.day;
    }

    const id = sessionIdFor(client.docId, visit.day);
    const machines: string[] = [];
    const logs: PlannedLog[] = [];
    const nextWeights: Record<string, number> = {};
    for (const line of visit.repeats) plan.held.push({ day: visit.day, machine: line.machine, why: "the same machine twice that day" });
    for (const line of visit.lines) {
      const machineId = machineOf(line, visit.day);
      if (!machineId || machineId === SKIP) {
        plan.held.push({ day: visit.day, machine: line.machine || `row ${line.row}`, why: machineId === SKIP ? "the machine table says skip" : "no machine" });
        continue;
      }
      if (machines.includes(machineId)) {
        plan.held.push({ day: visit.day, machine: line.machine, why: "two FileMaker names for one Journey machine that day" });
        continue;
      }
      const perSide = input.perSide(machineId);
      const reading = readSet(line, perSide);
      if (reading.kind === "unclear" || reading.kind === "empty") {
        plan.held.push({ day: visit.day, machine: line.machine, why: reading.kind === "unclear" ? reading.why : "nothing written" });
        continue;
      }
      machines.push(machineId);
      if (line.nextWeight !== null && line.nextWeight > 0) nextWeights[machineId] = line.nextWeight;
      for (const fields of logsFor(line, machineId, perSide)) {
        const side = fields.side as "Left" | "Right" | undefined;
        const at = visitInstant(visit.day, timeZone, machines.length);
        logs.push({
          id: logDocId(id, machineId, side),
          machineId,
          data: {
            sessionId: id,
            clientId: client.docId,
            machineId,
            studioId: client.homeStudioId,
            homeStudioId: client.homeStudioId,
            clientHomeStudioId: client.homeStudioId,
            ...fields,
            suggestedOrder: machines.length,
            machineSettings: {},
            createdAt: at,
            updatedAt: at,
          },
        });
      }
    }
    if (!logs.some((l) => l.data.outcome === "performed")) {
      // Everything done that day was on a machine the table skips, or held back: not a visit to count.
      plan.skipped.push({ day: visit.day, why: "nothing importable was done that day (skipped or held entries only)" });
      continue;
    }

    // Numbered only once it imports, so the numbers have no gap for Start to fill twice.
    position += 1;
    const number = input.numberOffset + position;
    const initials = [...new Set(visit.lines.map((l) => (l.trainer ?? "").trim().toUpperCase()).filter(Boolean))];
    const noon = visitInstant(visit.day, timeZone);
    const data: Record<string, unknown> = {
      clientId: client.docId,
      mindbodyClientId: client.mindbodyClientId,
      clientName: client.name,
      homeStudioId: client.homeStudioId,
      clientHomeStudioId: client.homeStudioId,
      hostedAtStudioId: client.homeStudioId,
      isCrossTrain: false,
      sessionType: "Standard",
      sessionNumber: number,
      date: visit.day,
      status: "Completed",
      // A string always (the rules ask for one); blank until the export carries the trainer.
      trainerInitials: initials.length === 1 ? initials[0] : "",
      sessionMachineIds: machines,
      legacy_filemaker_id: `fm:${client.fmClientId ?? client.mindbodyClientId}:${visit.day}`,
      countsTowardTotals: true,
      rollupCounted: true,
      createdAt: noon,
      endTime: noon,
    };
    const exists = input.existing.has(id);
    if (exists && input.existing.get(id) !== number) plan.numberDrift.push({ id, stored: input.existing.get(id) ?? null, planned: number });
    plan.sessions.push({ id, day: visit.day, number, exists, data, logs, nextWeights });
  }
  plan.unmatched = [...unmatched].sort();
  return plan;
}

/* ------------------------------------------------------------------ *
 * The client's own documents, written with each batch of sessions
 * ------------------------------------------------------------------ */

/** What the client's documents hold now, read in the same transaction as the write. */
export interface ClientNow {
  priorHistory: PriorHistory | null;
  lastSessionDate: string | null;
  legacyFilemakerId: string | null;
  /** Journey's Completed sessions for the client before this write, imported ones included. */
  completedSessions: number;
  trainerTally: Record<string, number> | null;
  topTrainerId: string | null;
  /** The machine totals, both sides merged (machine-totals/totals.ts mergeMachineTotals). */
  machineStats: Record<string, { firstPerformedDate?: string; lastPerformedDate?: string }> | null;
  /** The day each machine's "last time" is from, when the totals have one. */
  lastMetricDay: (machineId: string) => string | null;
}

export interface ClientWrite {
  /** Dot-path update for clients/{id}. */
  client: Record<string, unknown>;
  /** Dot-path update for clients/{id}/machineTotals/current (written with mergeFields). */
  totals: Record<string, unknown>;
  /** Per machine: what clientMachineSettings/{client}_{machine} should say, if it is older than `day`. */
  settings: { machineId: string; day: string; currentWeight: number; startingWeight: number | null; startingDay: string | null }[];
  /** How many sessions this write creates (the importer's contract, lib/prior-history.ts). */
  created: number;
}

const toNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

/** Reps and volume as Finish counts them (lib/sync-utils.ts): holds as seconds/30 × 2 reps and no volume; a count not written counts nothing. */
function effortOf(log: Record<string, unknown>): { reps: number; volume: number } {
  if (log.outcome !== "performed" || log.repsNotRecorded) return { reps: 0, volume: 0 };
  if (log.isTSC || log.isStaticHold) {
    const s = toNumber(log.seconds) ?? 0;
    return { reps: s > 0 ? (s / 30) * 2 : 0, volume: 0 };
  }
  const reps = toNumber(log.reps) ?? 0;
  const weight = toNumber(log.weight) ?? 0;
  return { reps, volume: reps * weight };
}

/**
 * The updates for the client's own documents that go WITH `created` (sessions
 * written in the same transaction, oldest first), from what the transaction
 * just read. Because the two commit together, a stop can never leave sessions
 * written and not counted, or counted twice.
 *
 * `sessionCount` is set the way the profile's reconciler sets it (Journey's
 * Completed sessions plus what the stated total still holds uncounted), so a
 * client with a stated total keeps the same total and Start numbers the next
 * session after it. `wholeStory` is whether FileMaker holds the client from the
 * very first visit (so a machine's first FileMaker weight is the starting weight).
 */
export function clientWriteFor(
  created: readonly PlannedSession[],
  firstDays: Readonly<Record<string, string>>,
  now: ClientNow,
  ops: FieldOps,
  options: { fmClientId: string | null; wholeStory: boolean },
): ClientWrite {
  const write: ClientWrite = { client: {}, totals: {}, settings: [], created: created.length };
  if (!created.length) return write;
  const ordered = [...created].sort((a, b) => a.day.localeCompare(b.day));

  write.client.completedSessions = ops.increment(created.length);
  const prior = now.priorHistory ? recordImportedSessions(now.priorHistory, created.length) : null;
  if (prior) write.client.priorHistory = prior;
  write.client.sessionCount = now.completedSessions + created.length + priorUncounted(prior);

  const newest = ordered[ordered.length - 1].day;
  const onFile = (now.lastSessionDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onFile) || newest > onFile) write.client.lastSessionDate = newest;
  if (options.fmClientId && !now.legacyFilemakerId) write.client.legacy_filemaker_id = options.fmClientId;

  let reps = 0;
  let volume = 0;
  for (const s of ordered) for (const l of s.logs) {
    const e = effortOf(l.data);
    reps += e.reps;
    volume += e.volume;
  }
  if (Math.round(reps) > 0) write.client.lifetimeReps = ops.increment(Math.round(reps));
  if (Math.round(volume) > 0) write.client.lifetimeWeight = ops.increment(Math.round(volume));

  // Machine stats and the trainer tally, the importer's rollup (lib/client-rollups.ts), over what is on file.
  const rollup = importedSessionsRollup(
    { machineStats: (now.machineStats ?? undefined) as never, trainerTally: now.trainerTally ?? undefined, topTrainerId: now.topTrainerId ?? undefined },
    ordered.map((s) => ({ date: s.day, trainerId: null, trainerInitials: String(s.data.trainerInitials ?? ""), logs: s.logs.map((l) => l.data as never) })),
    [],
    ops,
  );
  const split = splitMachineTotalsUpdates(rollup);
  Object.assign(write.client, split.client);
  Object.assign(write.totals, split.totals);
  /* The stats now count every session the client has (a client Journey
     already holds sessions for is never imported): the profile's one-time
     rebuild (equipment/useMachineStats.ts), which reads every session and set
     the client ever had, has nothing to do. Its marker says so, as the
     duplicate-merge script's does. */
  write.totals.machineStatsBackfilledAt = ops.serverTimestamp();

  // "Last time" per machine: the newest set done with a weight, never over a newer one on file.
  const lastBy = new Map<string, { session: PlannedSession; log: Record<string, unknown> }>();
  const firstBy = new Map<string, { day: string; weight: number }>();
  for (const s of ordered) {
    for (const l of s.logs) {
      const w = toNumber(l.data.weight);
      if (l.data.outcome !== "performed" || w === null || w <= 0) continue;
      lastBy.set(l.machineId, { session: s, log: l.data });
      if (!firstBy.has(l.machineId)) firstBy.set(l.machineId, { day: s.day, weight: w });
    }
  }
  for (const [machineId, { session, log }] of lastBy) {
    const onFileDay = now.lastMetricDay(machineId);
    if (!onFileDay || onFileDay < session.day) {
      const metric: Record<string, unknown> = {
        weight: String(log.weight),
        settings: {},
        lastPerformedDate: session.data.createdAt,
        lastPerformedSessionNumber: session.number,
        lastSessionId: session.id,
      };
      if (log.reps !== undefined) metric.reps = log.reps;
      if (log.seconds !== undefined) metric.seconds = log.seconds;
      if (log.isTSC) metric.isTSC = true;
      if (log.isStaticHold) metric.isStaticHold = true;
      write.totals[`currentMachineMetrics.${machineId}`] = metric;
    }

    // Next time's weight: the one FileMaker set on the last visit to the machine, else the last weight done.
    const lastVisitOnIt = [...ordered].reverse().find((s) => s.logs.some((x) => x.machineId === machineId));
    const next = lastVisitOnIt?.nextWeights[machineId];
    const done = toNumber(log.weight);
    const currentWeight = next && next > 0 ? next : done;
    // The starting weight only from the machine's first FileMaker day, and only when FileMaker holds the whole story.
    // (The settings entry goes in either way: the script writes next time's weight only over an older one.)
    const first = firstBy.get(machineId);
    const starting = options.wholeStory && first && firstDays[machineId] === first.day ? first : null;
    if (currentWeight !== null && currentWeight > 0) {
      write.settings.push({
        machineId,
        day: lastVisitOnIt?.day ?? session.day,
        currentWeight,
        startingWeight: starting?.weight ?? null,
        startingDay: starting?.day ?? null,
      });
    }
  }
  write.client.updatedAt = ops.serverTimestamp();
  return write;
}
