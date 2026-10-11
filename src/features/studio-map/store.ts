/**
 * THE STUDIO MAP'S WRITES (the studio map, Oct 2026) — the only writer.
 *
 * This phase holds the unit's half: its tape-measured size and which model
 * it is, one machine at a time (the door's Its size) or a floor at once
 * (the Sizes sheet's Mark {n} as Imagine Strength, and its Undo). The
 * layout's writes join it with the layout.
 *
 * NOTHING ON A TAP AWAITS THESE. Each write is issued and the screen moves
 * on; the roster listener's latency-compensated snapshot already shows it,
 * and a refusal comes back to the caller's toast.
 *
 * EACH ITS OWN WRITE. `unit.size`, `modelId`, Out of service and the
 * walking order are never combined in one write: the roster rule's
 * expression budget is measured on each alone (firestore.rules,
 * rosterLeaderOnce). And `unit.size` is always written by its dotted path,
 * so `unit.serialNumber`, `unit.manufacturer` and the rest never move.
 */

import { deleteField, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import type { KnownSize } from "../../types/machines";
import { linkMismatched, type ModelLink } from "./links";

/** The most entries one Mark sends: a floor's worth (the layout holds 120 machines). */
export const MAX_LINKS = 120;

const rosterRef = (studioId: string, machineId: string) => doc(db, "studios", studioId, "roster", machineId);

/**
 * A unit's tape-measured size, signed with the Auth uid and the server's
 * time (the rules pin both), or taken away with null ("Use the model's size
 * instead"). No height is left out, never written as undefined.
 */
export function setUnitSize(studioId: string, machineId: string, size: KnownSize | null, uid: string): Promise<void> {
  if (!size) return updateDoc(rosterRef(studioId, machineId), { "unit.size": deleteField() });
  const value: Record<string, unknown> = {
    lengthMm: Math.round(size.lengthMm),
    widthMm: Math.round(size.widthMm),
    by: uid,
    at: serverTimestamp(),
  };
  if (typeof size.heightMm === "number" && Number.isFinite(size.heightMm)) value.heightMm = Math.round(size.heightMm);
  return updateDoc(rosterRef(studioId, machineId), { "unit.size": value });
}

/** Thrown (as a rejection) when a model of another movement is named for a unit: nothing is written. */
export class AnotherMachinesModel extends Error {
  constructor() {
    super("That model is for another machine.");
    this.name = "AnotherMachinesModel";
  }
}

/**
 * Which model a unit is, or none. The rules take any model id (a get() on
 * the model would cost a budget this rule can't afford), so the app refuses
 * a model of another movement here, before anything is written.
 */
export function setUnitModel(
  studioId: string,
  unit: { machineId: string; movementId: string | null },
  model: { id: string; movementId: string } | null,
): Promise<void> {
  if (model && (!unit.movementId || model.movementId !== unit.movementId)) return Promise.reject(new AnotherMachinesModel());
  return updateDoc(rosterRef(studioId, unit.machineId), model ? { modelId: model.id } : { modelId: deleteField() });
}

/**
 * Mark {n} as Imagine Strength: one batch of `modelId`-only updates. A link
 * whose model is for another movement than its unit's is dropped and named
 * back to the caller, which says so in its toast. `done` is the batch's
 * commit, never awaited by the tap.
 */
export function linkModels(studioId: string, links: readonly ModelLink[]): { written: string[]; dropped: string[]; done: Promise<void> } {
  if (links.length > MAX_LINKS) {
    return { written: [], dropped: [], done: Promise.reject(new Error(`Up to ${MAX_LINKS} machines can be marked at once.`)) };
  }
  const dropped = links.filter(linkMismatched).map((l) => l.machineId);
  const keep = links.filter((l) => !linkMismatched(l));
  if (keep.length === 0) return { written: [], dropped, done: Promise.resolve() };
  const batch = writeBatch(db);
  for (const l of keep) batch.update(rosterRef(studioId, l.machineId), { modelId: l.modelId });
  return { written: keep.map((l) => l.machineId), dropped, done: batch.commit() };
}

/** Mark's Undo: the same entries' `modelId` taken away, in one batch. */
export function unlinkModels(studioId: string, machineIds: readonly string[]): Promise<void> {
  if (machineIds.length === 0) return Promise.resolve();
  if (machineIds.length > MAX_LINKS) return Promise.reject(new Error(`Up to ${MAX_LINKS} machines can be changed at once.`));
  const batch = writeBatch(db);
  for (const id of machineIds) batch.update(rosterRef(studioId, id), { modelId: deleteField() });
  return batch.commit();
}
