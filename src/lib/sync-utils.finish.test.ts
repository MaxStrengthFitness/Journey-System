/**
 * Finish never loses a session over the client's totals (Sep 24 2026), and
 * counts it once (the sessions round, Oct 12 2026).
 *
 * A cross-train visitor's Finish used to be refused in full: the client's
 * totals were inside the same all-or-nothing batch as the session and its
 * sets, and the rules refused the totals. Now the session batch holds the
 * session, the sets, the settings and the finish marker's create, and the
 * totals are their own batch, queued straight after it (before either is
 * awaited, so an offline reload replays both), carrying the marker's counted
 * mark. These check the shape of what completeWorkoutSession writes, against
 * a fake Firestore that records every call and keeps a small server: a
 * session batch that lands creates the marker there, and a totals batch whose
 * marker isn't there is refused, as the real one is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { op: string; path: string; data: Record<string, unknown>; options?: unknown };
type Doc = Record<string, unknown> | { __fail: true } | { __deny: true } | { __hang: true };

const MARKER = "sessions/sess1/finish/once";

const calls = vi.hoisted(() => ({
  /** Every session batch's writes, flattened (the session's batch: no clients/ path). */
  batchWrites: [] as Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }>,
  /** Each session batch, as committed. */
  sessionBatches: [] as Array<Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }>>,
  commits: 0,
  /**
   * The totals: every later batch, as committed (the client's counters and,
   * since the iPad round, the machine totals document beside the client).
   */
  updateDocs: [] as Array<{ path: string; data: Record<string, unknown>; writes: Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }> }>,
  refuseTotals: false,
  /** Refuse only a batch that writes the machine totals document (its rules not deployed yet). */
  refuseMachineTotals: false,
  /** Refuse any totals batch that marks the marker counted (a rule bug in countedOnceOk). */
  refuseCounted: false,
  /** Refuse every session batch. */
  refuseBatch: false,
  /** Refuse only the Nth session batch (1-based); 0 for none. */
  refuseSessionAt: 0,
  /** Refuse a session batch that creates the marker (the marker's rules not deployed). */
  refuseMarkerCreate: false,
  /** The session batch lands, then its answer is a refusal (a resend after a lost answer). */
  sessionLandsThenRefused: false,
  /** The totals land, then their answer is a refusal. */
  totalsLandThenRefused: false,
  // While set, the batch's commit waits on it, as an offline commit waits
  // for the server.
  commitGate: null as Promise<void> | null,
  /** The server's documents, by path, for getDocFromServer. */
  server: {} as Record<string, Record<string, unknown>>,
  serverReads: [] as string[],
  /** The last session batch, settled: a totals batch is taken after it, as the server takes writes in order. */
  lastSession: Promise.resolve() as Promise<void>,
}));

const refusal = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

function apply(writes: Write[]) {
  for (const w of writes) {
    if (w.op === "set") calls.server[w.path] = { ...(w.options ? calls.server[w.path] ?? {} : {}), ...w.data };
    else if (w.op === "update") calls.server[w.path] = { ...(calls.server[w.path] ?? {}), ...w.data };
  }
}

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  serverTimestamp: () => ({ __server: true }),
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __delete: true }),
  getDocFromServer: (ref: { path: string }) => {
    calls.serverReads.push(ref.path);
    const d = calls.server[ref.path] as Doc | undefined;
    if (d && "__hang" in d) return new Promise(() => {});
    if (d && "__fail" in d) return Promise.reject(Object.assign(new Error("offline"), { code: "unavailable" }));
    if (d && "__deny" in d) return Promise.reject(Object.assign(new Error("no"), { code: "permission-denied" }));
    return Promise.resolve({ exists: () => !!d, data: () => d });
  },
  writeBatch: () => {
    const writes: Write[] = [];
    return {
      update: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "update", path: ref.path, data }),
      set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => writes.push({ op: "set", path: ref.path, data, options }),
      commit: async () => {
        // The totals' batch touches clients/; the session's never does.
        if (writes.some((w) => w.path.startsWith("clients/"))) {
          const client = writes.find((w) => w.op === "update" && w.path.startsWith("clients/"));
          calls.updateDocs.push({ path: client?.path ?? "", data: client?.data ?? {}, writes });
          // The server takes writes in order: the session batch ahead of it first.
          await calls.lastSession;
          const counted = writes.find((w) => w.path.endsWith("/finish/once"));
          const marker = counted ? (calls.server[counted.path] as Doc | undefined) : undefined;
          if (counted && (!marker || "__deny" in marker || "__fail" in marker)) throw refusal();
          // countedOnceOk: not counted yet, and counted by the finish that made it.
          const m = marker as Record<string, unknown> | undefined;
          if (counted && m && (m.countedAt != null || counted.data.countedBy !== m.finishId)) throw refusal();
          if (counted && calls.refuseCounted) throw refusal();
          if (calls.refuseTotals || (calls.refuseMachineTotals && writes.some((w) => w.path.endsWith("/machineTotals/current")))) {
            throw refusal();
          }
          apply(writes.filter((w) => w.path.endsWith("/finish/once")));
          if (calls.totalsLandThenRefused) throw refusal();
          return;
        }
        calls.batchWrites.push(...writes);
        calls.sessionBatches.push(writes);
        calls.commits += 1;
        let settled!: () => void;
        calls.lastSession = new Promise<void>((r) => (settled = r));
        try {
          await sessionCommit(writes);
        } finally {
          settled();
        }
      },
    };
  },
}));

/** The session batch, as the server takes it (after an offline wait, when one is set). */
async function sessionCommit(writes: Write[]): Promise<void> {
  if (calls.commitGate) await calls.commitGate;
  if (calls.refuseBatch || calls.refuseSessionAt === calls.commits) throw refusal();
  if (calls.refuseMarkerCreate && writes.some((w) => w.path.endsWith("/finish/once"))) throw refusal();
  apply(writes.filter((w) => w.path.startsWith("sessions/")));
  if (calls.sessionLandsThenRefused) throw refusal();
}

/** The machine totals write that rode with the client's counters (features/machine-totals). */
const machineTotalsWrite = (i = 0) => calls.updateDocs[i].writes.find((w) => w.path === "clients/c1/machineTotals/current");
/** The counted mark in a totals batch. */
const countedWrite = (i = 0) => calls.updateDocs[i].writes.find((w) => w.path === MARKER);
// Finish writes no journal note (the tracker files the Note for the next
// trainer's journal copy itself). If it ever did again, this would say so.
const journal = vi.hoisted(() => ({ created: 0 }));
vi.mock("../hooks/useClientJournal", () => ({
  createJournalEntry: async () => {
    journal.created += 1;
    return "note-1";
  },
}));
vi.mock("./session-count-cache", () => ({ invalidateSessionCount: () => {} }));

import { completeWorkoutSession } from "./sync-utils";
import { withMachineTotals } from "../features/machine-totals/totals";
import { isFinishedElsewhere, isSessionGone, isTakenOver } from "../features/session-record/finish-once";

const session = { id: "sess1", sessionNumber: 41, hostedAtStudioId: "studioA", date: "2026-09-24" };
const client = { id: "c1", homeStudioId: "studioB", firstName: "Casey", completedSessions: 40 };
const logs = [
  { id: "sess1_m1", sessionId: "sess1", machineId: "m1", weight: "180", reps: "9" },
  { id: "sess1_m2", sessionId: "sess1", machineId: "m2", weight: "120", reps: "10" },
];
const trainer = { id: "t1", fullName: "Trainer A", initials: "TA" };

function finish(nextTrainerNote = "", s: Record<string, unknown> = session) {
  return completeWorkoutSession(
    {} as never,
    s,
    client,
    logs,
    nextTrainerNote,
    trainer,
    {},
    "uid-t1",
  );
}

/** The marker this finish created (its finishId is random). */
const markerCreate = (batch = 0) => calls.sessionBatches[batch]?.find((w) => w.path === MARKER);

beforeEach(() => {
  journal.created = 0;
  calls.batchWrites = [];
  calls.sessionBatches = [];
  calls.commits = 0;
  calls.updateDocs = [];
  calls.refuseTotals = false;
  calls.refuseMachineTotals = false;
  calls.refuseCounted = false;
  calls.refuseBatch = false;
  calls.refuseSessionAt = 0;
  calls.refuseMarkerCreate = false;
  calls.sessionLandsThenRefused = false;
  calls.totalsLandThenRefused = false;
  calls.commitGate = null;
  calls.server = { "sessions/sess1": { status: "In-Progress" } };
  calls.serverReads = [];
  calls.lastSession = Promise.resolve();
  vi.restoreAllMocks();
});

describe("completeWorkoutSession", () => {
  it("commits the session, the sets and the settings in one batch, without the client", async () => {
    await finish();
    expect(calls.commits).toBe(1);
    const paths = calls.batchWrites.map((w) => w.path);
    expect(paths).toContain("sessions/sess1");
    expect(paths).toContain("exerciseLogs/sess1_m1");
    expect(paths).toContain("clientMachineSettings/c1_m1");
    // A weight set for this session at the last Wrap-up is used up once the
    // machine is logged (features/next-weight, Oct 2 2026).
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.nextWeight).toEqual({ __delete: true });
    expect(paths.some((p) => p.startsWith("clients/"))).toBe(false);
  });

  it("then writes the client's totals on their own, and says they landed", async () => {
    const r = await finish();
    expect(calls.updateDocs).toHaveLength(1);
    expect(calls.updateDocs[0].path).toBe("clients/c1");
    expect(calls.updateDocs[0].data).toMatchObject({
      completedSessions: { __increment: 1 },
      // Added at Finish, never set to the number shown at Start (#8).
      sessionCount: { __increment: 1 },
      lastSessionDate: expect.any(String),
    });
    // The machine maps are no longer on the client: they go to the totals
    // document, in the same batch, as a set that touches only these paths.
    expect(Object.keys(calls.updateDocs[0].data).some((k) => k.startsWith("currentMachineMetrics") || k.startsWith("machineStats"))).toBe(false);
    const machines = machineTotalsWrite()!;
    expect(machines.op).toBe("set");
    expect((machines.data.currentMachineMetrics as any).m1.weight).toBe("180");
    // The session's own number stays the "last time" stamp.
    expect((machines.data.currentMachineMetrics as any).m1.lastPerformedSessionNumber).toBe(41);
    expect((machines.data.machineStats as any).m1.timesPerformed).toEqual({ __increment: 1 });
    expect((machines.options as any).mergeFields).toEqual(
      expect.arrayContaining(["currentMachineMetrics.m1", "machineStats.m1.timesPerformed", "updatedAt"]),
    );
    expect(r.totalsSaved).toBe(true);
  });

  it("finishes an unfinished session under its own day, never over what she did since (Oct 2 2026)", async () => {
    const later = {
      ...client,
      lastSessionDate: "2026-09-28",
      currentMachineMetrics: { m1: { weight: "190", lastPerformedDate: new Date("2026-09-28T15:00:00Z") } },
    };
    await completeWorkoutSession({} as never, session, later, logs, "", trainer, {}, "uid-t1", undefined, { asOfDay: "2026-09-24" });
    const totals = calls.updateDocs[0].data;
    // One more session, never renumbering her count back to 41.
    expect(totals.sessionCount).toEqual({ __increment: 1 });
    // Her last-session day only moves forward.
    expect(totals).not.toHaveProperty("lastSessionDate");
    // m1 was done since: left alone. m2 was not: written, on the session's own day.
    const metrics = machineTotalsWrite()!.data.currentMachineMetrics as any;
    expect(metrics).not.toHaveProperty("m1");
    expect(metrics.m2.lastPerformedDate).toBeInstanceOf(Date);
    const paths = calls.batchWrites.map((w) => w.path);
    expect(paths).not.toContain("clientMachineSettings/c1_m1");
    expect(paths).toContain("clientMachineSettings/c1_m2");
  });

  it("never writes a first weight off totals that haven't answered: a migrated client keeps the real one (the review, Oct 6 2026)", async () => {
    // After the migration the roster's client carries no machine maps; the
    // totals document is still loading (offline, or the first second).
    const loading = withMachineTotals({ ...client }, { state: "loading", data: null });
    await completeWorkoutSession({} as never, session, loading, logs, "", trainer, {}, "uid-t1");
    const stats = machineTotalsWrite()!.data.machineStats as any;
    const fields = (machineTotalsWrite()!.options as any).mergeFields as string[];
    expect(stats.m1.timesPerformed).toEqual({ __increment: 1 });
    expect(fields.some((f) => /firstPerformedDate|firstWeight/.test(f))).toBe(false);
    // Today's session is the newest by definition: last time and the prefill still move.
    expect(stats.m1.lastWeight).toBe(180);
    expect(stats.m1.lastPerformedDate).toBe("2026-09-24");
    expect((machineTotalsWrite()!.data.currentMachineMetrics as any).m1.weight).toBe("180");
  });

  it("finishing an old session with totals unknown leaves every last time and next weight alone", async () => {
    const loading = withMachineTotals({ ...client, lastSessionDate: "2026-09-20" }, { state: "loading", data: null });
    await completeWorkoutSession({} as never, session, loading, logs, "", trainer, {}, "uid-t1", undefined, { asOfDay: "2026-09-24" });
    const w = machineTotalsWrite()!;
    const fields = (w.options as any).mergeFields as string[];
    expect(w.data).not.toHaveProperty("currentMachineMetrics");
    expect(fields.filter((f) => f.startsWith("machineStats")).sort()).toEqual(["machineStats.m1.timesPerformed", "machineStats.m2.timesPerformed"]);
    const paths = calls.batchWrites.map((x) => x.path);
    expect(paths).not.toContain("clientMachineSettings/c1_m1");
    expect(paths).not.toContain("clientMachineSettings/c1_m2");
    // The counters still count it.
    expect(calls.updateDocs[0].data.completedSessions).toEqual({ __increment: 1 });
  });

  it("moves her last-session day to the old session's day when nothing came after", async () => {
    await completeWorkoutSession({} as never, session, { ...client, lastSessionDate: "2026-09-20" }, logs, "", trainer, {}, "uid-t1", undefined, {
      asOfDay: "2026-09-24",
    });
    expect(calls.updateDocs[0].data.lastSessionDate).toBe("2026-09-24");
  });

  it("keeps the session when the totals are refused, and says so instead of throwing", async () => {
    calls.refuseTotals = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await finish();
    expect(calls.commits).toBe(1);
    expect(r.totalsSaved).toBe(false);
  });

  it("saves the counters on their own, still marked counted, when only the machine totals document is refused (its rules not live yet)", async () => {
    calls.refuseMachineTotals = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await finish();
    expect(calls.updateDocs).toHaveLength(2);
    // The second ask is the client's counters alone, with the counted mark.
    expect(calls.updateDocs[1].writes.map((w) => w.path)).toEqual(["clients/c1", MARKER]);
    expect(calls.updateDocs[1].data.completedSessions).toEqual({ __increment: 1 });
    expect(r.totalsSaved).toBe(true);
  });

  it("queues the totals before the session's commit is acknowledged, so an offline reload replays both", async () => {
    let release!: () => void;
    calls.commitGate = new Promise<void>((r) => (release = r));
    const pending = finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.commits).toBe(1);
    expect(calls.updateDocs.map((u) => u.path)).toEqual(["clients/c1"]);
    release();
    const r = await pending;
    expect(r.totalsSaved).toBe(true);
  });

  it("has no totals to write without a client, and no marker", async () => {
    const r = await completeWorkoutSession({} as never, session, null, logs, "", trainer, {}, "uid-t1");
    expect(calls.updateDocs).toHaveLength(0);
    expect(markerCreate()).toBeUndefined();
    expect(r.totalsSaved).toBeNull();
  });

  it("puts the Note for the next trainer on the session, whole, and writes no journal note itself", async () => {
    const r = await finish("  Knee sore after the move.  ");
    const sessionWrite = calls.batchWrites.find((w) => w.path === "sessions/sess1")!;
    expect(sessionWrite.data.notes).toBe("Knee sore after the move.");
    // The Wrap-up writes the dose itself, the moment it is tapped.
    expect(sessionWrite.data).not.toHaveProperty("dose");
    expect(journal.created).toBe(0);
    expect(r).toEqual({ totalsSaved: true, counted: "here" });
  });

  it("leaves the session's note alone when the End Session box was empty", async () => {
    await finish("   ");
    const sessionWrite = calls.batchWrites.find((w) => w.path === "sessions/sess1")!;
    expect(sessionWrite.data).not.toHaveProperty("notes");
  });

  /* The open session round's review (Oct 9 2026): Who's this? at Finish
     opens the client's settings a moment before Finish runs. A machine
     missing from settings nobody has read from the server is not "nothing on
     file": a merged `settings: {}` would still replace the saved seat and
     positions, and a starting weight would be written over the real one. */
  it("with the client's settings not known yet, writes today's weight and leaves the saved settings and starting weight alone", async () => {
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, {}, "uid-t1", undefined, { settingsOnFileKnown: false });
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.currentWeight).toBe(180);
    expect(setting.options).toEqual({ merge: true });
    for (const kept of ["settings", "startingWeight", "startingWeightDate"]) {
      expect(setting.data, kept).not.toHaveProperty(kept);
    }
  });

  it("not known yet, a machine whose settings ARE on screen writes them back as before", async () => {
    const onScreen = { m1: { machineId: "m1", settings: { seat: "4" }, startingWeight: 150 } };
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, onScreen, "uid-t1", undefined, { settingsOnFileKnown: false });
    const m1 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(m1.data.settings).toEqual({ seat: "4" });
    expect(m1.data).not.toHaveProperty("startingWeight");
    // m2 has no entry: left alone.
    const m2 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m2")!;
    expect(m2.data).not.toHaveProperty("settings");
    expect(m2.data).not.toHaveProperty("startingWeight");
  });

  it("known (the default): a first time on a machine records its starting weight, as before", async () => {
    await finish();
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.settings).toEqual({});
    expect(setting.data.startingWeight).toBe(180);
  });

  /* The whole-branch review (Oct 9 2026). */
  it("not known yet, a partial entry on this iPad (an assign's held set-up) is never taken for the whole: no starting weight over the server's", async () => {
    // The assign's merge left only the held dials on this iPad's copy: no startingWeight in it.
    const partial = { m1: { machineId: "m1", settings: { seat: "4" } } };
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, partial, "uid-t1", undefined, { settingsOnFileKnown: false });
    const m1 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(m1.data.settings).toEqual({ seat: "4" });
    expect(m1.data).not.toHaveProperty("startingWeight");
    expect(m1.data).not.toHaveProperty("startingWeightDate");
  });

  it("known, the starting weight is today's only on the client's first performed set on the machine: an earlier one in Journey writes none", async () => {
    // A Finish whose settings weren't known wrote no starting weight; the client's totals hold that session's set.
    const done = { ...client, currentMachineMetrics: { m1: { weight: "150", lastSessionId: "sess0" } } };
    await completeWorkoutSession({} as never, session, done, logs, "", trainer, { m1: { machineId: "m1", settings: {}, currentWeight: 150 } }, "uid-t1");
    const m1 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(m1.data).not.toHaveProperty("startingWeight");
    // m2 was never performed before: a first time, recorded.
    const m2 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m2")!;
    expect(m2.data.startingWeight).toBe(120);
  });

  it("a client added on this iPad for the session: every machine is a first time, whatever has answered", async () => {
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, {}, "uid-t1", undefined, { settingsOnFileKnown: false, newClient: true });
    const m1 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(m1.data.settings).toEqual({});
    expect(m1.data.startingWeight).toBe(180);
  });

  it("closes a session that was open (isUnassigned false), and leaves a client session's fields as they were", async () => {
    await completeWorkoutSession({} as never, { ...session, isUnassigned: false }, client, logs, "", trainer, {}, "uid-t1");
    expect(calls.batchWrites.find((w) => w.path === "sessions/sess1")!.data.isUnassigned).toBe(false);
    calls.batchWrites = [];
    await finish();
    expect(calls.batchWrites.find((w) => w.path === "sessions/sess1")!.data).not.toHaveProperty("isUnassigned");
  });
});

/* ── A finish is counted once (the sessions round, Oct 12 2026) ────────── */
describe("completeWorkoutSession: the finish marker", () => {
  /* Each test that reaches the "unmarked" net or the rule-bug net uses its
     own session id: the module remembers sessions totalled without the mark
     (totalledSessionIds), for the life of the page, on purpose. */
  const markerOf = (id: string) => `sessions/${id}/finish/once`;
  const finishAs = (id: string) => {
    calls.server[`sessions/${id}`] ??= { status: "In-Progress" };
    return finish("", { ...session, id });
  };
  const markerCreateOf = (id: string, batch = 0) => calls.sessionBatches[batch]?.find((w) => w.path === markerOf(id));

  it("creates the marker in the session batch, with the sign-in uid, the client and the server's time", async () => {
    await finish();
    const m = markerCreate()!;
    expect(m.op).toBe("set");
    expect(m.data).toEqual({ finishId: expect.stringMatching(/^[A-Za-z0-9]{20}$/), by: "uid-t1", at: { __server: true }, clientId: "c1" });
  });

  it("marks it counted in the totals batch, with this finish's id", async () => {
    await finish();
    const finishId = markerCreate()!.data.finishId;
    expect(countedWrite()).toEqual({ op: "update", path: MARKER, data: { countedAt: { __server: true }, countedBy: finishId } });
  });

  it("a refusal judged \"mine\" (the batch landed, its answer lost) is saved, and the totals carry on", async () => {
    calls.sessionLandsThenRefused = true;
    const r = await finish();
    expect(calls.commits).toBe(1);
    expect(r).toEqual({ totalsSaved: true, counted: "here" });
    expect(calls.server[MARKER]).toMatchObject({ countedBy: markerCreate()!.data.finishId });
  });

  it("\"elsewhere\": another finish's marker throws FinishedElsewhereError and writes nothing more", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { status: "Completed" };
    calls.server[MARKER] = { finishId: "someone-else", by: "uid-t2", clientId: "c1" };
    const err = await finish().catch((e) => e);
    expect(isFinishedElsewhere(err)).toBe(true);
    expect(calls.commits).toBe(1);
    // The one totals batch queued with it, refused; nothing after.
    expect(calls.updateDocs).toHaveLength(1);
    expect(calls.server[MARKER]).not.toHaveProperty("countedAt");
  });

  it("\"elsewhere\": a session already Completed (an old-version finish, no marker) throws it too", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { status: "Completed" };
    const err = await finish().catch((e) => e);
    expect(isFinishedElsewhere(err)).toBe(true);
    expect(calls.commits).toBe(1);
  });

  it("\"gone\": a session that doesn't exist throws SessionGoneError and writes nothing more", async () => {
    calls.refuseBatch = true;
    delete calls.server["sessions/sess1"];
    const err = await finish().catch((e) => e);
    expect(isSessionGone(err)).toBe(true);
    expect(calls.commits).toBe(1);
    expect(calls.updateDocs).toHaveLength(1);
  });

  it("\"unmarked\": the marker refused, the session there and open, so it is finished again WITHOUT the marker, and only then the totals, without the mark", async () => {
    calls.refuseMarkerCreate = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await finishAs("sess-unmarked");
    expect(calls.commits).toBe(2);
    expect(markerCreateOf("sess-unmarked", 0)).toBeDefined();
    expect(markerCreateOf("sess-unmarked", 1)).toBeUndefined();
    expect(calls.server["sessions/sess-unmarked"]).toMatchObject({ status: "Completed" });
    // The queued totals (tied to the marker) were refused; then the totals without the mark, once.
    expect(calls.updateDocs).toHaveLength(2);
    expect(calls.updateDocs[0].writes.some((w) => w.path === markerOf("sess-unmarked"))).toBe(true);
    expect(calls.updateDocs[1].writes.some((w) => w.path.endsWith("/finish/once"))).toBe(false);
    expect(calls.updateDocs[1].data.completedSessions).toEqual({ __increment: 1 });
    expect(r.totalsSaved).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/finishing without it/), expect.anything());
    // Finish again on this iPad (the trainer tries once more): never a second count.
    calls.updateDocs = [];
    calls.server["sessions/sess-unmarked"] = { status: "In-Progress" };
    await finishAs("sess-unmarked");
    expect(calls.updateDocs).toHaveLength(0);
  });

  it("\"unmarked\" when the rules refuse even the marker's read (its rules not deployed) and the session answered open", async () => {
    calls.refuseMarkerCreate = true;
    calls.server[markerOf("sess-norules")] = { __deny: true };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await finishAs("sess-norules");
    expect(calls.commits).toBe(2);
    expect(markerCreateOf("sess-norules", 1)).toBeUndefined();
    expect(r.totalsSaved).toBe(true);
  });

  it("an unmarked re-commit that is refused issues no totals write, and throws", async () => {
    calls.refuseMarkerCreate = true;
    calls.refuseSessionAt = 2;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(finishAs("sess-recommit-refused")).rejects.toThrow(/permissions/);
    expect(calls.commits).toBe(2);
    // Only the one queued with the first batch (tied to its marker, refused): no totals after.
    expect(calls.updateDocs).toHaveLength(1);
    expect(calls.updateDocs[0].writes.some((w) => w.path.endsWith("/finish/once"))).toBe(true);
  });

  it("a marker read that fails, with the session open, is \"refused\": no second commit", async () => {
    calls.refuseBatch = true;
    calls.server[MARKER] = { __fail: true };
    await expect(finish()).rejects.toThrow(/permissions/);
    expect(calls.commits).toBe(1);
  });

  it("a session read that fails is \"refused\": no second commit", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { __fail: true };
    await expect(finish()).rejects.toThrow(/permissions/);
    expect(calls.commits).toBe(1);
  });

  it("a read that never answers is \"refused\" once its time is up: no second commit", async () => {
    calls.refuseBatch = true;
    calls.server[MARKER] = { __hang: true };
    await expect(finish()).rejects.toThrow(/permissions/);
    expect(calls.commits).toBe(1);
  }, 10_000);

  it("\"refused\" rethrows the refusal itself", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { __deny: true };
    const err = await finish().catch((e) => e);
    expect(err.code).toBe("permission-denied");
    expect(isFinishedElsewhere(err) || isSessionGone(err)).toBe(false);
  });

  it("a totals refusal whose marker this finish already counted is saved (a lost answer)", async () => {
    calls.totalsLandThenRefused = true;
    const r = await finish();
    expect(calls.updateDocs).toHaveLength(1);
    expect(r.totalsSaved).toBe(true);
  });

  it("the counted mark refused twice on our own marker (a rule bug): the counters land once WITHOUT the mark, loudly", async () => {
    calls.refuseCounted = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = "sess-rulebug";
    const r = await finishAs(id);
    expect(r.totalsSaved).toBe(true);
    // All of it with the mark; the counters with the mark; the counters without it.
    expect(calls.updateDocs.map((u) => u.writes.map((w) => w.path))).toEqual([
      ["clients/c1", "clients/c1/machineTotals/current", markerOf(id)],
      ["clients/c1", markerOf(id)],
      ["clients/c1"],
    ]);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[finish\] counted-refused/), expect.anything());
    // Another Finish of the same session on this iPad never counts it again.
    calls.updateDocs = [];
    calls.server[`sessions/${id}`] = { status: "In-Progress" };
    delete calls.server[markerOf(id)];
    await finishAs(id);
    expect(calls.updateDocs).toHaveLength(0);
  });
});

/* ── The review and attack (Oct 12 2026) ────────────────────────────────── */
describe("completeWorkoutSession: the device holding it, and Finish it as it was", () => {
  const fresh = () => new Date(Date.now() - 5 * 60_000);
  const withOptions = (o: Record<string, unknown>, s: Record<string, unknown> = session) =>
    completeWorkoutSession({} as never, s, client, logs, "", trainer, {}, "uid-t1", undefined, o);

  it("puts this device and as-it-was on the marker when given", async () => {
    await withOptions({ deviceId: "d-here", asItWas: true });
    expect(markerCreate()!.data).toMatchObject({ deviceId: "d-here", asItWas: true });
    calls.sessionBatches = [];
    await withOptions({ deviceId: null }, { ...session, id: "sess-nodevice" });
    expect(calls.sessionBatches[0].find((w) => w.path.endsWith("/finish/once"))!.data).not.toHaveProperty("deviceId");
  });

  /* After a take-over the session names the taker's iPad: this iPad's
     queued Finish is refused, said as taken over, and never sent again
     without its marker (which the session rules alone would have let in). */
  it("\"taken\": another device holds it and saved within the hour: TakenOverError, and nothing more is written", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { status: "In-Progress", recordingDeviceId: "d-taker", lastHeartbeatAt: fresh() };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await withOptions({ deviceId: "d-here" }).catch((e) => e);
    expect(isTakenOver(err)).toBe(true);
    expect(calls.commits).toBe(1);
  });

  it("held by another device but quiet an hour: never the unmarked net, which would write past it", async () => {
    calls.refuseMarkerCreate = true;
    calls.server["sessions/sess-held"] = { status: "In-Progress", recordingDeviceId: "d-other", lastHeartbeatAt: new Date(Date.now() - 2 * 3_600_000) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await withOptions({ deviceId: "d-here" }, { ...session, id: "sess-held" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isTakenOver(err)).toBe(false);
    expect(calls.commits).toBe(1);
  });

  /* A colleague's "Finish it as it was" got there first, from what the
     server held; this iPad ran the session. Its own finish goes in over it,
     with no marker, no credit and no totals: it counts once. */
  it("\"correct\": over another iPad's Finish it as it was, the session batch goes again with no marker, no credit and no totals", async () => {
    calls.refuseSessionAt = 1;
    calls.server["sessions/sess1"] = { status: "Completed", trainerId: "t1" };
    calls.server[MARKER] = { finishId: "as-it-was", by: "uid-t2", clientId: "c1", asItWas: true, countedAt: 1, countedBy: "as-it-was" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await withOptions({ deviceId: "d-here" });
    expect(r).toEqual({ totalsSaved: null, counted: "corrected" });
    expect(calls.commits).toBe(2);
    const again = calls.sessionBatches[1];
    expect(again.some((w) => w.path.endsWith("/finish/once"))).toBe(false);
    const sessionWrite = again.find((w) => w.path === "sessions/sess1")!;
    expect(sessionWrite.data).not.toHaveProperty("trainerId");
    expect(sessionWrite.data).not.toHaveProperty("trainerName");
    expect(sessionWrite.data.status).toBe("Completed");
    // The sets and the next weights are in it.
    expect(again.some((w) => w.path === "exerciseLogs/sess1_m1")).toBe(true);
    expect(again.some((w) => w.path === "clientMachineSettings/c1_m1")).toBe(true);
    // Only the one totals batch queued with the first try, refused; no second.
    expect(calls.updateDocs).toHaveLength(1);
    expect((calls.server[MARKER] as Record<string, unknown>).countedBy).toBe("as-it-was");
  });

  it("a second Finish it as it was never corrects the first", async () => {
    calls.refuseBatch = true;
    calls.server["sessions/sess1"] = { status: "Completed" };
    calls.server[MARKER] = { finishId: "as-it-was", by: "uid-t2", clientId: "c1", asItWas: true };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await withOptions({ deviceId: "d-here", asItWas: true }).catch((e) => e);
    expect(isFinishedElsewhere(err)).toBe(true);
    expect(calls.commits).toBe(1);
  });
});
