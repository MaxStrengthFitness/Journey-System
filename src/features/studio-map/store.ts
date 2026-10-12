/**
 * THE STUDIO MAP'S WRITES (the studio map, Oct 2026) — the only writer.
 *
 * The unit's half: its tape-measured size and which model it is, one
 * machine at a time (the door's Its size) or a floor at once (the Sizes
 * sheet's Mark {n} as Imagine Strength, and its Undo). And the layout's:
 * `current` and the five draft slots, every write a whole set at the
 * document's rev + 1 (the rules refuse anything else), nothing ever
 * deleted.
 *
 * A REFUSED LAYOUT SAVE IS TOLD APART. The rules answer a stale save and a
 * forbidden one alike (PERMISSION_DENIED), so the store reads the document
 * it wrote, once, from the server: a newer rev there means someone else
 * saved in between ("changed"), otherwise it was refused. A refusal is
 * never retried: the server has answered and the write is off the queue.
 * If that follow-up read can't reach the server, the save is "unchecked":
 * not saved, and the reason not known. A write still waiting for the server
 * never comes back here at all (its promise simply hasn't settled).
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

import { deleteField, doc, getDocFromServer, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import type { KnownSize } from "../../types/machines";
import {
  CURRENT_ID,
  DRAFT_SLOTS,
  draftNames,
  placementId,
  planDocument,
  planProblems,
  restoreOps,
  retireOps,
  undoUseLayoutOps,
  useLayoutOps,
  type DraftSlot,
  type LoadedPlan,
  type Op,
  type PlanRoom,
  type Placement,
  type UndoRecord,
  type UnitPlacement,
} from "./layout";
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

/* ------------------------------------------------------------------ *
 * The layout
 * ------------------------------------------------------------------ */

export type SaveOutcome =
  | { ok: true; rev: number }
  /** Someone saved this document since the copy was opened; `by` is their uid when the server says. */
  | { ok: false; why: "changed"; by: string | null }
  /** Not saved: refused, refused and the reason couldn't be checked, or (a draft) every slot in use. */
  | { ok: false; why: "refused" | "unchecked" | "full" }
  /** The editor made something the store won't send (a bug, never a person): the first sentence. */
  | { ok: false; why: "invalid"; problem: string };

/** What a layout write carries from the editor: the room, the placements on screen, and the ones whose machine left the floor. */
export interface WorkingCopy {
  room: PlanRoom;
  placements: Placement[];
  gone: UnitPlacement[];
}

const planRef = (studioId: string, planId: string) => doc(db, "studios", studioId, "floorPlans", planId);

const denied = (e: unknown) => (e as { code?: unknown } | null)?.code === "permission-denied";

/** After a refusal: a newer rev on the server is "changed", anything else "refused"; no answer to the check, "unchecked" (still not saved). */
async function explain(studioId: string, planId: string, baseRev: number | null): Promise<SaveOutcome> {
  try {
    const snap = await getDocFromServer(planRef(studioId, planId));
    if (snap.exists()) {
      const data = snap.data() as { rev?: unknown; updatedBy?: unknown };
      const rev = typeof data.rev === "number" ? data.rev : 0;
      if (baseRev === null || rev > baseRev) return { ok: false, why: "changed", by: typeof data.updatedBy === "string" ? data.updatedBy : null };
    }
    return { ok: false, why: "refused" };
  } catch {
    return { ok: false, why: "unchecked" };
  }
}

function everyPlacement(w: WorkingCopy): Placement[] {
  const on = new Set(w.placements.map(placementId));
  return [...w.placements, ...w.gone.filter((g) => !on.has(g.machineId))];
}

/** Every document a batch would write, through planProblems with its own id: the first sentence, or null. */
function opsProblem(ops: readonly Op[]): string | null {
  for (const op of ops) {
    const problem = planProblems({ name: op.data.name, room: op.data.room, placements: op.data.placements }, { planId: op.id })[0];
    if (problem) return problem;
  }
  return null;
}

/**
 * Save the working copy to one layout document at `baseRev + 1` (1 when the
 * copy was never saved). Never awaited by a tap: the listener's snapshot
 * already shows the write, and the outcome comes back to a notice.
 */
export function saveLayout(
  studioId: string,
  planId: string,
  working: WorkingCopy,
  name: string,
  baseRev: number | null,
  uid: string,
): Promise<SaveOutcome> {
  const problem = planProblems({ name, room: working.room, placements: everyPlacement(working) }, { planId })[0];
  if (problem) return Promise.resolve({ ok: false, why: "invalid", problem });
  const rev = baseRev === null ? 1 : baseRev + 1;
  const data = planDocument(working, name, rev, uid, serverTimestamp());
  return setDoc(planRef(studioId, planId), data).then(
    (): SaveOutcome => ({ ok: true, rev }),
    (e: unknown): Promise<SaveOutcome> | SaveOutcome => (denied(e) ? explain(studioId, planId, baseRev) : { ok: false, why: "refused" }),
  );
}

/** The free slots in order, with the rev each holds now (null: not written yet). */
function freeSlots(slots: readonly LoadedPlan[]): { id: DraftSlot; baseRev: number | null }[] {
  const out: { id: DraftSlot; baseRev: number | null }[] = [];
  for (const id of DRAFT_SLOTS) {
    const s = slots.find((d) => d.id === id);
    if (!s) out.push({ id, baseRev: null });
    else if (s.retired) out.push({ id, baseRev: s.rev });
  }
  return out;
}

/** Write the copy into the first free slot, trying the next when another leader took one at the same moment. */
async function intoFreeSlot(
  studioId: string,
  working: WorkingCopy,
  nameOf: (slot: DraftSlot) => string,
  slots: readonly LoadedPlan[],
  uid: string,
): Promise<SaveOutcome & { id?: DraftSlot }> {
  const free = freeSlots(slots);
  if (free.length === 0) return { ok: false, why: "full" };
  for (const slot of free) {
    const out = await saveLayout(studioId, slot.id, working, nameOf(slot.id), slot.baseRev, uid);
    if (!("why" in out)) return { ...out, id: slot.id };
    if (out.why !== "changed") return out;
  }
  return { ok: false, why: "full" };
}

/** Try a change (on screen: Plan a remodel): what is on screen, into the first free slot as "Remodel {n}". */
export function tryAChange(
  studioId: string,
  working: WorkingCopy,
  slots: readonly LoadedPlan[],
  uid: string,
): Promise<SaveOutcome & { id?: DraftSlot }> {
  return intoFreeSlot(studioId, working, draftNames.draft, slots, uid);
}

/**
 * The conflict's escape: a save refused because someone changed the layout
 * keeps the copy in the first free slot under the writer's name ("AJ's,
 * Oct 12 3:40 PM"). `full` when all five slots hold a live draft: nothing
 * is written, and the copy stays on screen.
 */
export async function keepAsDraft(
  studioId: string,
  working: WorkingCopy,
  name: string,
  slots: readonly LoadedPlan[],
  uid: string,
): Promise<{ id: DraftSlot } | { full: true } | { refused: true }> {
  const out = await intoFreeSlot(studioId, working, () => name, slots, uid);
  if (!("why" in out) && out.id) return { id: out.id };
  if ("why" in out && out.why === "full") return { full: true };
  return { refused: true };
}

/** Each op as a whole set, stamped, in one batch: all or nothing. */
function commitOps(studioId: string, ops: readonly Op[], uid: string): Promise<void> {
  const batch = writeBatch(db);
  const stamp = serverTimestamp();
  for (const op of ops) {
    const { name, room, placements, rev, retired } = op.data;
    batch.set(planRef(studioId, op.id), planDocument({ room, placements }, name, rev, uid, stamp, { retired: retired === true }));
  }
  return batch.commit();
}

export type UseOutcome =
  | { ok: true; record: UndoRecord }
  | { ok: false; why: "changed" | "refused" | "unchecked" }
  | { ok: false; why: "invalid"; problem: string };

/** Read the documents a refused batch wrote: did any move on since? */
async function explainPair(studioId: string, checks: { id: string; baseRev: number | null }[]): Promise<"changed" | "refused" | "unchecked"> {
  try {
    for (const c of checks) {
      const snap = await getDocFromServer(planRef(studioId, c.id));
      const rev = snap.exists() ? Number((snap.data() as { rev?: unknown }).rev) || 0 : null;
      if (rev !== null && (c.baseRev === null || rev > c.baseRev)) return "changed";
    }
    return "refused";
  } catch {
    return "unchecked";
  }
}

/**
 * Use this layout: one batch, every write rev-checked (layout.ts
 * useLayoutOps). A draft holding machines still to buy keeps them, and the
 * old layout goes to the first free slot, found here. Every document in the
 * batch is run through planProblems with its own id first, so a `current`
 * composed from a draft can never carry a machine still to buy, even by a
 * bug. The outcome carries what its Undo needs.
 */
export function useThisLayout(
  studioId: string,
  current: LoadedPlan | null,
  draft: LoadedPlan,
  slots: readonly LoadedPlan[],
  uid: string,
  nowMs: number,
): Promise<UseOutcome> {
  const freeId = freeSlotOther(slots, draft.id);
  const free = freeId ? { id: freeId, rev: slots.find((d) => d.id === freeId)?.rev ?? null } : null;
  const { ops, record } = useLayoutOps(current, draft, free, nowMs);
  const problem = opsProblem(ops);
  if (problem) return Promise.resolve({ ok: false, why: "invalid", problem });
  return commitOps(studioId, ops, uid).then(
    (): UseOutcome => ({ ok: true, record }),
    async (e: unknown): Promise<UseOutcome> =>
      denied(e)
        ? {
            ok: false,
            why: await explainPair(studioId, [
              { id: CURRENT_ID, baseRev: current?.rev ?? null },
              { id: draft.id, baseRev: draft.rev },
              ...(record.beforeSlot ? [{ id: record.beforeSlot.id, baseRev: free?.rev ?? null }] : []),
            ]),
          }
        : { ok: false, why: "refused" },
  );
}

/** The first free slot that isn't the draft's own. */
function freeSlotOther(slots: readonly LoadedPlan[], draftId: string): DraftSlot | null {
  for (const id of DRAFT_SLOTS) {
    if (id === draftId) continue;
    const s = slots.find((d) => d.id === id);
    if (!s || s.retired) return id;
  }
  return null;
}

/**
 * Use this layout's Undo, or null when any document has moved on since (the
 * "Before" draft remains). Checked through planProblems like the batch.
 */
export function undoUseThisLayout(
  studioId: string,
  record: UndoRecord,
  revsNow: { current: number; slot: number; before: number | null },
  uid: string,
): Promise<void> | null {
  const ops = undoUseLayoutOps(record, revsNow);
  if (!ops) return null;
  const problem = opsProblem(ops);
  if (problem) return Promise.reject(new Error(problem));
  return commitOps(studioId, ops, uid);
}

/** A draft renamed: a whole set at rev + 1. */
export function renameDraft(studioId: string, draft: LoadedPlan, name: string, uid: string): Promise<SaveOutcome> {
  return saveLayout(studioId, draft.id, { room: draft.room, placements: draft.placements, gone: [] }, name, draft.rev, uid);
}

function opOutcome(studioId: string, ops: Op[], uid: string, baseRev: number): Promise<SaveOutcome> {
  const problem = opsProblem(ops);
  if (problem) return Promise.resolve({ ok: false, why: "invalid", problem });
  return commitOps(studioId, ops, uid).then(
    (): SaveOutcome => ({ ok: true, rev: ops[0].data.rev }),
    (e: unknown): Promise<SaveOutcome> | SaveOutcome => (denied(e) ? explain(studioId, ops[0].id, baseRev) : { ok: false, why: "refused" }),
  );
}

/** Delete draft: its slot retired at rev + 1, its content kept for the Undo. */
export function retireDraft(studioId: string, draft: LoadedPlan, uid: string): Promise<SaveOutcome> {
  return opOutcome(studioId, retireOps(draft), uid, draft.rev);
}

/** Delete draft's Undo: `retired` is the slot as the retire wrote it (rev + 1); it comes back at rev + 2. */
export function restoreDraft(studioId: string, retired: LoadedPlan, uid: string): Promise<SaveOutcome> {
  return opOutcome(studioId, restoreOps(retired), uid, retired.rev);
}
