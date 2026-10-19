/**
 * What the one routine builder writes (the routine builder round, Oct 19
 * 2026). The pure half works out each save as a description (`RoutineSave`,
 * `PhaseSave`), tested without a database; `commitRoutineSave` and
 * `commitPhaseSave` send it as ONE batch, issued and never awaited by the
 * tap, the commit handed back for a toast on refusal.
 *
 * - Routine A keeps its plan: a save on a Routine A with a plan writes the
 *   plan's matching changes beside it (`planChangeFromEdit`, the Edit
 *   routine drawer's rule), and a Routine B with a plan of swaps from before
 *   this round still follows it (`bFollowOf`), until someone saves that B
 *   here.
 * - Routine B is built whole: Save writes its machines and a plan with no
 *   swaps (`planFromRoutine`), so B is its own list from then on and nothing
 *   moves it but a person. A B saved with machines while B is off is turned
 *   on; a B saved empty while B is on is turned off (an empty B alternated
 *   into is a session of nothing, the critic's #22). The client's
 *   `isRoutineBActive` is its OWN write once the batch has landed, never in
 *   the batch (routine-plan/store.ts: the client's document is never in
 *   someone else's batch).
 * - Phasing in lives on Routine B's plan as `plan.phase`; Routine B's
 *   machines are what the client does now (`runningB`).
 *
 * Every save writes the `routineAdjustments` record the Changes list reads,
 * the reason only when one was given.
 */
import {
  collection,
  deleteField,
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Routine } from "../../types";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import { bFollowOf, plannedBFollowOf, type BFollow } from "../routine-plan/b-routine";
import { planChangeFromEdit } from "../routine-plan/drawer-sync";
import { planFromRoutine, signedChange, type Who } from "../routine-plan/lineup";
import { PLAN_CHANGES, setRoutineBActive, withBFollowing } from "../routine-plan/store";
import { PLAN_CHANGE_MACHINES_MAX, type PlanChange, type RoutinePlan } from "../routine-plan/types";
import { sameList } from "./builder";
import { runningB, type PhasePlan } from "./phase";

export type Slot = "Routine A" | "Routine B";

export interface RoutineSaveInput {
  slot: Slot;
  /** The routine as saved, or null when the client has none of that name yet. */
  routine: Routine | null;
  /** Every routine the client has (B following A is worked out from them). */
  routines: readonly Routine[];
  clientId: string;
  /** The client's home studio, as every routine carries it. */
  studioId: string;
  /** The trainer's record id, as every adjustment names it. */
  trainerId: string;
  who: Who;
  todayYmd: string;
  machineIds: readonly string[];
  /** What it's for, the trainer's words. */
  purpose: string;
  /** Why, when the trainer said. */
  why?: string;
  isBActive: boolean;
}

export interface RoutineSave {
  /** The routine to update, or null to make it. */
  routineId: string | null;
  /** The fields written on the routine (`createdAt` or `updatedAt` is added when sent). */
  fields: Record<string, unknown>;
  adjustment: Record<string, unknown>;
  changes: PlanChange[];
  follow: BFollow | null;
  /** B switched on or off once the batch lands, or null to leave it. */
  turnB: boolean | null;
}

function once(ids: readonly string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

/** A routine's save, worked out. */
export function routineSaveOf(input: RoutineSaveInput): RoutineSave {
  const machineIds = once(input.machineIds);
  const purpose = input.purpose.trim().slice(0, 300);
  const why = input.why?.trim() || "";
  const saved = input.routine && input.routine.id && !input.routine.id.startsWith("temp-") ? input.routine : null;
  const before = saved?.machineIds ?? [];
  const adjustment = withoutUndefined({
    clientId: input.clientId,
    previousMachineIds: [...before],
    newMachineIds: machineIds,
    trainerId: input.trainerId,
    ...(why ? { notes: why } : null),
    studioId: input.studioId,
    changeType: saved ? "machines" : "created",
  });

  if (input.slot === "Routine B") {
    const plan = planFromRoutine(machineIds, input.who, input.todayYmd, purpose);
    const fields = withoutUndefined({
      ...(saved ? null : { clientId: input.clientId, name: "Routine B", studioId: input.studioId }),
      machineIds,
      plan,
    });
    const turnB = machineIds.length > 0 && !input.isBActive ? true : machineIds.length === 0 && input.isBActive ? false : null;
    return { routineId: saved?.id ?? null, fields, adjustment, changes: [], follow: null, turnB };
  }

  // Routine A.
  if (!saved) {
    const plan = planFromRoutine(machineIds, input.who, input.todayYmd, purpose);
    return {
      routineId: null,
      fields: { clientId: input.clientId, name: "Routine A", studioId: input.studioId, machineIds, plan },
      adjustment,
      changes: [signedChange({ kind: "start", machineIds }, input.who, why)],
      follow: null,
      turnB: null,
    };
  }
  const changes: PlanChange[] = [];
  let plan: RoutinePlan | undefined;
  if (saved.plan) {
    const kept = planChangeFromEdit({ before, after: machineIds, plan: saved.plan });
    plan = kept ? kept.plan : saved.plan;
    for (const c of kept?.changes ?? []) changes.push(signedChange(c, input.who, why));
    if ((saved.plan.purpose ?? "") !== purpose) {
      plan = { ...plan, purpose };
      changes.push(signedChange({ kind: "purpose", machineIds: [], value: purpose }, input.who, why));
    }
  } else if (purpose) {
    // A plan-less Routine A given what it's for: the plan Add a plan makes.
    plan = planFromRoutine(machineIds, input.who, input.todayYmd, purpose);
    changes.push(signedChange({ kind: "start", machineIds }, input.who, why));
  }
  const follow =
    bFollowOf(input.routines, saved.id, machineIds) ?? (plan ? plannedBFollowOf(input.routines, saved.id, plan) : null);
  return {
    routineId: saved.id ?? null,
    fields: withoutUndefined({ machineIds, ...(plan ? { plan } : null) }),
    adjustment,
    changes,
    follow,
    turnB: null,
  };
}

/** Whether a routine's save changes anything: its machines, or what it's for. */
export function saveChanges(routine: Routine | null, machineIds: readonly string[], purpose: string): boolean {
  return !sameList(routine?.machineIds ?? [], machineIds) || (routine?.plan?.purpose ?? "").trim() !== purpose.trim();
}

function changeDoc(change: PlanChange): Record<string, unknown> {
  return withoutUndefined({ ...change, machineIds: change.machineIds.slice(0, PLAN_CHANGE_MACHINES_MAX), at: serverTimestamp() });
}

/** A routine's save, sent as ONE batch; B switched on or off as its own write once it lands. */
export function commitRoutineSave(db: Firestore, save: RoutineSave): { routineId: string; commit: Promise<void> } {
  const batch = writeBatch(db);
  const ref = save.routineId ? doc(db, "routines", save.routineId) : doc(collection(db, "routines"));
  if (save.routineId) batch.update(ref, { ...save.fields, updatedAt: serverTimestamp() });
  else batch.set(ref, { ...save.fields, createdAt: serverTimestamp() });
  batch.set(doc(collection(db, "routineAdjustments")), { ...save.adjustment, routineId: ref.id, createdAt: serverTimestamp() });
  for (const c of save.changes) batch.set(doc(collection(db, "routines", ref.id, PLAN_CHANGES)), changeDoc(c));
  withBFollowing(batch, db, save.follow);
  if (save.turnB !== null) {
    batch.set(doc(collection(db, "routineAdjustments")), {
      clientId: save.adjustment.clientId,
      routineId: ref.id,
      previousMachineIds: save.adjustment.newMachineIds,
      newMachineIds: save.adjustment.newMachineIds,
      trainerId: save.adjustment.trainerId,
      studioId: save.adjustment.studioId,
      changeType: save.turnB ? "enabled" : "disabled",
      createdAt: serverTimestamp(),
    });
  }
  const commit = batch.commit();
  const turnB = save.turnB;
  const clientId = String(save.adjustment.clientId ?? "");
  if (turnB !== null && clientId) {
    commit.then(() => setRoutineBActive(db, clientId, turnB)).catch(() => {});
  }
  return { routineId: ref.id, commit };
}

/* ── Phasing in ───────────────────────────────────────────────────────── */

export interface PhaseSaveInput {
  /** Routine B as saved, or null when the client has none yet (made from the plan's base). */
  routine: Routine | null;
  clientId: string;
  studioId: string;
  trainerId: string;
  who: Who;
  todayYmd: string;
  /** The plan as it now stands, or null to stop phasing (B left as it stands). */
  phase: PhasePlan | null;
  /** What B is for, when the plan is first made. */
  purpose?: string;
  /** The adjustment's words: "Phasing in: Leg Curl for Leg Press". */
  note: string;
  isBActive: boolean;
}

export interface PhaseSave {
  routineId: string | null;
  fields: Record<string, unknown>;
  /** Null when B's machines didn't move (a week or an owner changed). */
  adjustment: Record<string, unknown> | null;
  turnB: boolean | null;
}

/**
 * A phase plan made, changed, ticked or stopped. Making it on a Routine B
 * of swaps, or none, gives B a plan of its own (no swaps) with the phase on
 * it; after that only `plan.phase` and B's machines are written, by their
 * field paths, so nothing else on the plan is touched.
 */
export function phaseSaveOf(input: PhaseSaveInput): PhaseSave {
  const saved = input.routine && input.routine.id && !input.routine.id.startsWith("temp-") ? input.routine : null;
  const before = saved?.machineIds ?? [];
  const now = input.phase ? runningB(input.phase) : [...before];
  const moved = !saved || !sameList(before, now);
  const adjustment = moved
    ? withoutUndefined({
        clientId: input.clientId,
        previousMachineIds: [...before],
        newMachineIds: now,
        trainerId: input.trainerId,
        notes: input.note.slice(0, 500),
        studioId: input.studioId,
        changeType: saved ? "machines" : "created",
      })
    : null;
  const ownPlan = !!saved?.plan && !Array.isArray(saved.plan.swaps);
  let fields: Record<string, unknown>;
  if (!input.phase) {
    fields = ownPlan ? { "plan.phase": deleteField() } : {};
  } else if (ownPlan) {
    fields = { machineIds: now, "plan.phase": input.phase };
  } else {
    const plan = { ...planFromRoutine(now, input.who, input.todayYmd, input.purpose ?? saved?.plan?.purpose ?? ""), phase: input.phase };
    fields = withoutUndefined({
      ...(saved ? null : { clientId: input.clientId, name: "Routine B", studioId: input.studioId }),
      machineIds: now,
      plan,
    });
  }
  const turnB = now.length > 0 && !input.isBActive && !!input.phase ? true : null;
  return { routineId: saved?.id ?? null, fields, adjustment, turnB };
}

export function commitPhaseSave(db: Firestore, save: PhaseSave, clientId: string): { routineId: string; commit: Promise<void> } {
  const batch = writeBatch(db);
  const ref = save.routineId ? doc(db, "routines", save.routineId) : doc(collection(db, "routines"));
  if (save.routineId) {
    if (Object.keys(save.fields).length > 0) batch.update(ref, { ...save.fields, updatedAt: serverTimestamp() });
  } else batch.set(ref, { ...save.fields, createdAt: serverTimestamp() });
  if (save.adjustment) batch.set(doc(collection(db, "routineAdjustments")), { ...save.adjustment, routineId: ref.id, createdAt: serverTimestamp() });
  const commit = batch.commit();
  if (save.turnB !== null && clientId) {
    const on = save.turnB;
    commit.then(() => setRoutineBActive(db, clientId, on)).catch(() => {});
  }
  return { routineId: ref.id, commit };
}
