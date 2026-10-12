import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { notify } from "../../notifications";
import { instanceDocRef, statusPayloadFor, type TaskAuthor } from "../../studio-tasks/mutations";
import { taskLocationOf, type TaskRow, type TaskShift } from "../../studio-tasks/types";
import { rowsForWipe, undoTargetsOf, undoValuesOf } from "./cleaning";
import { FLAG_NOTE_MAX, type CareActor, type MachineCare } from "./machine-care";

/**
 * MACHINE CARE — Firestore. See machine-care.ts for what the documents mean.
 *
 *   studios/{s}/machineCare/{machineId}   one per machine, merged field by field
 *   studios/{s}/upkeepLog/{auto}          a wipe or deep clean is ALSO appended
 *                                         here (kind "clean" / "deep-clean"),
 *                                         the log Operations → Equipment reads
 *
 * Both go in one batch. The rules: anyone at the studio (writesForStudio)
 * may write care; the log's create rule already allows the same people.
 *
 * A WIPE IS ONE RULE (the studio map, phase 4, Oct 2026): every wipe, one
 * machine or Mark all, goes through `markWiped`, which marks the machine and
 * completes today's wipe-chore row for it in the same batch, so the chore
 * and the floor never disagree (one row a machine: the shift it is now, else
 * the earliest still open). Nothing here is awaited by a tap: the
 * caller issues the write and moves on, and a refusal comes back through
 * `done` to its toast. `recordCare` is the deep clean alone now.
 */
export function machineCareRef(studioId: string) {
  return collection(db, "studios", studioId, "machineCare");
}

function careFromDoc(id: string, d: Record<string, unknown>): MachineCare {
  const actor = (v: unknown): CareActor | null =>
    v && typeof v === "object" && typeof (v as CareActor).id === "string" ? { id: (v as CareActor).id, name: String((v as CareActor).name ?? "") } : null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const flagRaw = d.flag as Record<string, unknown> | null | undefined;
  const flagBy = flagRaw ? actor(flagRaw.by) : null;
  return {
    machineId: typeof d.machineId === "string" ? d.machineId : id,
    lastWipedAt: num(d.lastWipedAt),
    lastWipedBy: actor(d.lastWipedBy),
    lastDeepCleanAt: num(d.lastDeepCleanAt),
    lastDeepCleanBy: actor(d.lastDeepCleanBy),
    flag:
      flagRaw && typeof flagRaw.note === "string" && flagBy
        ? { note: flagRaw.note, by: flagBy, at: num(flagRaw.at) ?? 0 }
        : null,
    updatedAt: d.updatedAt,
  };
}

export interface MachineCareState {
  byMachineId: Record<string, MachineCare>;
  loading: boolean;
  error: string | null;
}

export function useMachineCare(studioId: string | null): MachineCareState {
  const [state, setState] = useState<MachineCareState>({ byMachineId: {}, loading: Boolean(studioId), error: null });
  useEffect(() => {
    if (!studioId) {
      setState({ byMachineId: {}, loading: false, error: null });
      return;
    }
    setState({ byMachineId: {}, loading: true, error: null });
    const unsub = onSnapshot(
      machineCareRef(studioId),
      (snap) => {
        const byMachineId: Record<string, MachineCare> = {};
        snap.forEach((d) => {
          byMachineId[d.id] = careFromDoc(d.id, d.data() as Record<string, unknown>);
        });
        setState({ byMachineId, loading: false, error: null });
      },
      (err) => {
        console.warn("[relay] machineCare read failed:", err);
        // A failed read is "unknown", never "clean": keep what we had.
        setState((s) => ({ ...s, loading: false, error: "Couldn't load the floor's care record." }));
      },
    );
    return unsub;
  }, [studioId]);
  return state;
}

export type CareKind = "wipe" | "deep-clean";

/** A care record's actor, its name kept to what the rules take (80). */
export function careActor(id: string, name: string | null | undefined): CareActor {
  return { id, name: (name ?? "").trim().slice(0, 80) || "A trainer" };
}

/**
 * Writes per batch. B7 (tests/firestore.rules.test.ts) measures the largest
 * batch at this size inside the rules' budget: 120 care merges and their 120
 * chore rows, 240 writes, under the 500 a batch allows. A wipe completes at
 * most one row a machine (`rowsForWipe`), and a machine's care merge and its
 * row always share a batch.
 */
export const MARK_WRITES = 240;

export interface MarkWiped {
  studioId: string;
  machineIds: readonly string[];
  /**
   * The ids of the studio's own floor, from the read the caller already
   * holds (the roster, or the bridge's catalog stand-in Relay draws). Any
   * other id, and any `pm-` id (a machine still to buy), is dropped.
   */
  floorIds: ReadonlySet<string>;
  /** Signed with the Auth uid, as the care sheet always signed it. */
  author: CareActor;
  /** Who completes the chore rows (the trainer, as useTaskActions writes it); the author when absent. */
  taskAuthor?: TaskAuthor | null;
  /** The live care read at the tap; null while it hasn't answered or failed, and then there is no Undo. */
  before: Record<string, MachineCare | undefined> | null;
  /**
   * The live care read when Undo is tapped (the host's `useLiveCare`); null
   * while it is unknown. Without it there is no Undo.
   */
  live?: () => Record<string, MachineCare | undefined> | null;
  /** Today's wipe-chore rows the caller has ([] when it has none). One open row a machine is completed (`rowsForWipe`). */
  rows: readonly TaskRow[];
  /** The shift it is now (`shiftNowOf`): its row is the one a wipe completes. Null: the earliest still open. */
  shiftNow?: TaskShift | null;
}

/** Split machines into batches of at most MARK_WRITES writes, each machine with its row. */
function batchesOf(ids: readonly string[], rowOf: ReadonlyMap<string, TaskRow>): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let writes = 0;
  for (const id of ids) {
    const n = 1 + (rowOf.has(id) ? 1 : 0);
    if (cur.length > 0 && writes + n > MARK_WRITES) {
      out.push(cur);
      cur = [];
      writes = 0;
    }
    cur.push(id);
    writes += n;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/**
 * Mark machines wiped today: per machine a merge of the wipe fields (the
 * shape the care sheet always wrote), and per machine at most one open
 * chore row (`rowsForWipe`) done with the payload setManyTaskStatuses
 * writes. Batches of at most MARK_WRITES writes, issued and not awaited.
 * The upkeep log gets an entry only for a machine with no row to complete
 * (a completed cleaning row is already a clean event in the upkeep
 * history), in its own batch, caught.
 *
 * `undo` (null without `before` and `live`: Journey never restores values it
 * didn't read) reads the live care read WHEN IT IS TAPPED and puts back only
 * the machines whose wipe is still this one (`at` and the author): a later
 * wipe from another iPad survives, and only the restored machines' rows go
 * back to open. With the live read unknown it refuses rather than guess.
 */
export function markWiped(p: MarkWiped): {
  written: string[];
  at: number;
  author: CareActor;
  undo: (() => Promise<void>) | null;
  done: Promise<void>;
} {
  const ids: string[] = [];
  let dropped = 0;
  for (const id of p.machineIds) {
    if (!id || id.startsWith("pm-") || !p.floorIds.has(id) || ids.includes(id)) {
      dropped += 1;
      continue;
    }
    ids.push(id);
  }
  const at = Date.now();
  const author = careActor(p.author.id, p.author.name);
  if (dropped > 0) console.warn(`[relay] markWiped dropped ${dropped} id(s) not on this floor`);
  if (ids.length === 0) return { written: [], at, author, undo: null, done: Promise.resolve() };

  const taskAuthor: TaskAuthor = p.taskAuthor ?? { id: author.id, name: author.name };
  const rowOf = rowsForWipe(p.rows, ids, p.shiftNow ?? null);
  const careRef = machineCareRef(p.studioId);

  const commits: Promise<void>[] = [];
  for (const chunk of batchesOf(ids, rowOf)) {
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.set(doc(careRef, id), { machineId: id, lastWipedAt: at, lastWipedBy: author, updatedAt: serverTimestamp() }, { merge: true });
      const r = rowOf.get(id);
      if (r) {
        const loc = taskLocationOf(r.template ?? {}, p.studioId);
        batch.set(instanceDocRef(loc, r.id), statusPayloadFor(r, loc, "done", taskAuthor), { merge: true });
      }
    }
    commits.push(batch.commit());
  }

  // The upkeep log, for a machine whose wipe no chore row records. Never blocking.
  const unlogged = ids.filter((id) => !rowOf.has(id));
  if (unlogged.length > 0) {
    const log = writeBatch(db);
    const logRef = collection(db, "studios", p.studioId, "upkeepLog");
    for (const id of unlogged) {
      log.set(doc(logRef), { machineId: id, kind: "clean", at: new Date(at).toISOString(), byId: author.id, byName: author.name, createdAt: serverTimestamp() });
    }
    log.commit().catch((err: unknown) => console.warn("[relay] upkeepLog append failed:", err));
  }

  const done = Promise.all(commits).then(() => undefined);
  const before = p.before;
  const liveOf = p.live;
  const undo =
    before && liveOf
      ? () => {
          const now = liveOf();
          if (!now) return Promise.reject(new Error("The care read is unknown, so Undo can't tell what is still this wipe."));
          const mine = undoTargetsOf(now, ids, at, author.id);
          const back = undoValuesOf(before, mine);
          const restores: Promise<void>[] = [];
          for (const chunk of batchesOf(mine, rowOf)) {
            const batch = writeBatch(db);
            for (const u of back.filter((b) => chunk.includes(b.machineId))) {
              batch.set(doc(careRef, u.machineId), { machineId: u.machineId, lastWipedAt: u.lastWipedAt, lastWipedBy: u.lastWipedBy, updatedAt: serverTimestamp() }, { merge: true });
              const r = rowOf.get(u.machineId);
              if (r) {
                const loc = taskLocationOf(r.template ?? {}, p.studioId);
                batch.set(instanceDocRef(loc, r.id), statusPayloadFor(r, loc, "open", taskAuthor), { merge: true });
              }
            }
            restores.push(batch.commit());
          }
          return Promise.all(restores).then(() => undefined);
        }
      : null;
  return { written: ids, at, author, undo, done };
}

/** A deep clean (which is a wipe too): the care document and the studio's upkeep log. A plain wipe is `markWiped`. */
export async function recordCare(params: { studioId: string; machineId: string; kind: CareKind; author: CareActor }): Promise<void> {
  const { studioId, machineId, kind } = params;
  const author = careActor(params.author.id, params.author.name);
  const at = Date.now();
  const batch = writeBatch(db);
  batch.set(
    doc(machineCareRef(studioId), machineId),
    kind === "wipe"
      ? { machineId, lastWipedAt: at, lastWipedBy: author, updatedAt: serverTimestamp() }
      : { machineId, lastWipedAt: at, lastWipedBy: author, lastDeepCleanAt: at, lastDeepCleanBy: author, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  // The log is a bonus for the Operations screen: caught, never blocking.
  try {
    await addDoc(collection(db, "studios", studioId, "upkeepLog"), {
      machineId,
      kind: kind === "wipe" ? "clean" : "deep-clean",
      at: new Date(at).toISOString(),
      byId: author.id,
      byName: author.name,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[relay] upkeepLog append failed:", err);
  }
}

export async function flagMachine(params: {
  studioId: string;
  machineId: string;
  machineName: string;
  note: string;
  author: CareActor;
  /** Whose bell to ring: the studio's leader, when known. */
  leaderId?: string | null;
}): Promise<void> {
  const { studioId, machineId, machineName } = params;
  const author = careActor(params.author.id, params.author.name);
  const note = params.note.trim().slice(0, FLAG_NOTE_MAX);
  if (!note) throw new Error("A flag needs a note.");
  const batch = writeBatch(db);
  batch.set(
    doc(machineCareRef(studioId), machineId),
    { machineId, flag: { note, by: author, at: Date.now() }, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  await notify({
    to: params.leaderId ?? null,
    actor: author,
    kind: "machine-flagged",
    title: `${author.name.split(" ")[0]} flagged the ${machineName}`,
    body: note,
    studioId,
    link: { view: "studio-tasks" },
  });
}

export async function clearMachineFlag(params: { studioId: string; machineId: string }): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(machineCareRef(params.studioId), params.machineId), { machineId: params.machineId, flag: null, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}
