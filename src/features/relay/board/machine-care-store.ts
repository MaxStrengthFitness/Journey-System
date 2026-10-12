import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { notify } from "../../notifications";
import { instanceDocRef, statusPayloadFor, type TaskAuthor } from "../../studio-tasks/mutations";
import { taskLocationOf, type TaskRow } from "../../studio-tasks/types";
import { undoValuesOf } from "./cleaning";
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
 * and the floor never disagree. Nothing here is awaited by a tap: the
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
 * Machines per batch. B7 (tests/firestore.rules.test.ts) measures the
 * largest batch at this size inside the rules' budget: 120 care merges and
 * their 120 chore rows, 240 writes, under the 500 a batch allows.
 */
export const MARK_CHUNK = 120;

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
  /** Today's wipe-chore rows the caller has ([] when it has none). Only open machine rows of these machines are completed. */
  rows: readonly TaskRow[];
}

/**
 * Mark machines wiped today: per machine a merge of the wipe fields (the
 * shape the care sheet always wrote), and per open chore row of that
 * machine its instance done with the payload setManyTaskStatuses writes.
 * One batch per MARK_CHUNK machines, issued and not awaited. The upkeep log
 * gets an entry only for a machine with no row to complete (a completed
 * cleaning row is already a clean event in the upkeep history), in its own
 * batch, caught. `undo` puts each machine's wipe and its rows back as they
 * were, and is null when `before` is null: Journey never restores values it
 * didn't read.
 */
export function markWiped(p: MarkWiped): { written: string[]; undo: (() => Promise<void>) | null; done: Promise<void> } {
  const ids: string[] = [];
  let dropped = 0;
  for (const id of p.machineIds) {
    if (!id || id.startsWith("pm-") || !p.floorIds.has(id) || ids.includes(id)) {
      dropped += 1;
      continue;
    }
    ids.push(id);
  }
  if (dropped > 0) console.warn(`[relay] markWiped dropped ${dropped} id(s) not on this floor`);
  if (ids.length === 0) return { written: [], undo: null, done: Promise.resolve() };

  const at = Date.now();
  const author = careActor(p.author.id, p.author.name);
  const taskAuthor: TaskAuthor = p.taskAuthor ?? { id: author.id, name: author.name };
  const wanted = new Set(ids);
  const rowsOf = new Map<string, TaskRow[]>();
  for (const r of p.rows) {
    if (r.kind !== "machine" || r.status !== "open" || !r.machineId || !wanted.has(r.machineId)) continue;
    const list = rowsOf.get(r.machineId) ?? [];
    list.push(r);
    rowsOf.set(r.machineId, list);
  }
  const careRef = machineCareRef(p.studioId);

  const commits: Promise<void>[] = [];
  for (let i = 0; i < ids.length; i += MARK_CHUNK) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + MARK_CHUNK)) {
      batch.set(doc(careRef, id), { machineId: id, lastWipedAt: at, lastWipedBy: author, updatedAt: serverTimestamp() }, { merge: true });
      for (const r of rowsOf.get(id) ?? []) {
        const loc = taskLocationOf(r.template ?? {}, p.studioId);
        batch.set(instanceDocRef(loc, r.id), statusPayloadFor(r, loc, "done", taskAuthor), { merge: true });
      }
    }
    commits.push(batch.commit());
  }

  // The upkeep log, for a machine whose wipe no chore row records. Never blocking.
  const unlogged = ids.filter((id) => !rowsOf.has(id));
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
  const undo = before
    ? () => {
        const back = undoValuesOf(before, ids);
        const restores: Promise<void>[] = [];
        for (let i = 0; i < back.length; i += MARK_CHUNK) {
          const batch = writeBatch(db);
          for (const u of back.slice(i, i + MARK_CHUNK)) {
            batch.set(doc(careRef, u.machineId), { machineId: u.machineId, lastWipedAt: u.lastWipedAt, lastWipedBy: u.lastWipedBy, updatedAt: serverTimestamp() }, { merge: true });
            for (const r of rowsOf.get(u.machineId) ?? []) {
              const loc = taskLocationOf(r.template ?? {}, p.studioId);
              batch.set(instanceDocRef(loc, r.id), statusPayloadFor(r, loc, "open", taskAuthor), { merge: true });
            }
          }
          restores.push(batch.commit());
        }
        return Promise.all(restores).then(() => undefined);
      }
    : null;
  return { written: ids, undo, done };
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
