/**
 * What the stash and the slots write (the routine library round, Oct 23
 * 2026). Every write is issued and never awaited by the tap; the promise is
 * handed back for a toast on refusal.
 *
 * - The client's document is never in someone else's batch: the slots are
 *   their OWN write, issued after the routines' batch (routine-plan/store.ts's
 *   rule, Oct 9 2026). Firestore applies both on this iPad at once.
 * - A routine is never deleted: Retire sets `archived`.
 * - Only the fields that change are written.
 */
import { collection, doc, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import type { Routine } from "../../types";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import type { SlotMove } from "./slots";

function settled(...ps: Promise<void>[]): Promise<void> {
  return Promise.all(ps).then(() => undefined);
}

/** A slot move: the renames as one batch, then the client's slots as their own write. */
export function commitSlotMove(db: Firestore, clientId: string, move: SlotMove): Promise<void> {
  const out: Promise<void>[] = [];
  if (move.renames.length > 0) {
    const batch = writeBatch(db);
    for (const r of move.renames) batch.update(doc(db, "routines", r.id), { name: r.name, updatedAt: serverTimestamp() });
    out.push(batch.commit());
  }
  if (Object.keys(move.patch).length > 0) out.push(updateDoc(doc(db, "clients", clientId), move.patch));
  return settled(...out);
}

/** A routine renamed; the slots pinned first when they aren't written yet, so a renamed "Routine A" stays A. */
export function commitRename(
  db: Firestore,
  clientId: string,
  routineId: string,
  name: string,
  pin: Record<string, string | null>,
): Promise<void> {
  const out: Promise<void>[] = [];
  if (Object.keys(pin).length > 0) out.push(updateDoc(doc(db, "clients", clientId), pin));
  out.push(updateDoc(doc(db, "routines", routineId), { name: name.trim(), updatedAt: serverTimestamp() }));
  return settled(...out);
}

/** Retire a stashed routine, or bring one back. Never a delete. */
export function commitRetire(db: Firestore, routineId: string, archived: boolean): Promise<void> {
  return updateDoc(doc(db, "routines", routineId), {
    archived,
    archivedAt: archived ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export interface NewRoutine {
  clientId: string;
  studioId: string;
  name: string;
  machineIds: readonly string[];
  trainerId: string;
  /** Where it was copied from: a template (studio, Max Strength's, a trainer's own) or another routine. */
  template?: { id: string; name: string; machineIds: readonly string[] } | null;
  machineNotes?: Record<string, string>;
}

/**
 * A new routine in the client's stash (made on the iPad, its id known at
 * once), with the "created" record the Changes list reads; then, when it is
 * equipped, the client's slots as their own write.
 */
export function commitNewRoutine(
  db: Firestore,
  input: NewRoutine,
  equip: ((routineId: string) => SlotMove) | null,
): { routineId: string; commit: Promise<void> } {
  const batch = writeBatch(db);
  const ref = doc(collection(db, "routines"));
  const machineIds = input.machineIds.filter((id, i) => input.machineIds.indexOf(id) === i);
  const routine: Record<string, unknown> = withoutUndefined({
    clientId: input.clientId,
    name: input.name.trim(),
    machineIds,
    studioId: input.studioId,
    ...(input.template
      ? {
          templateId: input.template.id,
          templateName: input.template.name,
          templateMachineIds: [...input.template.machineIds],
          templateAppliedAt: serverTimestamp(),
        }
      : null),
    ...(input.machineNotes && Object.keys(input.machineNotes).length > 0 ? { machineNotes: input.machineNotes } : null),
    createdAt: serverTimestamp(),
  });
  batch.set(ref, routine);
  batch.set(doc(collection(db, "routineAdjustments")), {
    clientId: input.clientId,
    routineId: ref.id,
    previousMachineIds: [],
    newMachineIds: machineIds,
    trainerId: input.trainerId,
    studioId: input.studioId,
    changeType: "created",
    ...(input.template ? { notes: `From ${input.template.name}`.slice(0, 500) } : null),
    createdAt: serverTimestamp(),
  });
  const made = batch.commit();
  const out: Promise<void>[] = [made];
  if (equip) out.push(commitSlotMove(db, input.clientId, equip(ref.id)));
  return { routineId: ref.id, commit: settled(...out) };
}

/** The routine a new one copies: its machines and its notes (its plan and its changes stay with it). */
export function copyOf(r: Routine): Pick<NewRoutine, "machineIds" | "machineNotes"> {
  return { machineIds: [...r.machineIds], machineNotes: r.machineNotes };
}
