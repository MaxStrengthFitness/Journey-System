/**
 * A trainer's own routines (the routine library round, Oct 23 2026). AJ, on
 * whether they are shared with the studio: "No just allow trainers to make
 * their own routines and save them on their profile so they can load it into
 * a client if they need".
 *
 * Kept as trainer-tier routine presets carrying the trainer's Auth uid
 * (`ownerUid`), read with one query on (tier, ownerUid), so they follow the
 * trainer to every studio they work at. Only they see them; the rules let
 * only them, or an administrator, change one. Pure: no Firestore.
 */
import type { Routine, RoutinePreset } from "../../types";
import { normalizeRoutinePreset } from "../../lib/routine-templates";

/** The presets that are this trainer's own, by name. */
export function ownRoutinesOf(presets: readonly RoutinePreset[], uid: string | null | undefined): RoutinePreset[] {
  if (!uid) return [];
  return presets
    .filter((p) => p.tier === "trainer" && p.ownerUid === uid)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/** Stored presets read back safely, each through the one normaliser. */
export function myRoutinesFromDocs(docs: readonly { id: string; data: Record<string, unknown> }[], uid: string): RoutinePreset[] {
  return ownRoutinesOf(
    docs.map((d) => normalizeRoutinePreset({ ...(d.data as Partial<RoutinePreset>), id: d.id })),
    uid,
  );
}

export interface MyRoutineWrite {
  name: string;
  machineIds: string[];
  description?: string;
  machineNotes?: Record<string, string>;
}

/** A name checked among the trainer's own: trimmed, 1 to 60 characters, unique. */
export function myRoutineNameProblem(name: string, mine: readonly Pick<RoutinePreset, "id" | "name">[], selfId?: string | null): string | null {
  const n = name.trim();
  if (!n) return "Give it a name.";
  if (n.length > 60) return "Keep the name to 60 characters.";
  if (mine.some((p) => p.id !== selfId && (p.name || "").trim().toLowerCase() === n.toLowerCase())) return `"${n}" is already one of your routines.`;
  return null;
}

/**
 * What a new one of the trainer's own writes: a trainer-tier preset with
 * their uid, scoped to the studio they made it at (as every trainer preset
 * is), never `undefined`.
 */
export function myRoutineDoc(
  input: MyRoutineWrite,
  who: { uid: string; name?: string | null },
  studioId: string,
): Record<string, unknown> {
  const machineIds = input.machineIds.filter((id, i) => !!id && input.machineIds.indexOf(id) === i);
  return {
    name: input.name.trim().slice(0, 60),
    description: (input.description ?? "").trim().slice(0, 300),
    machineIds,
    machineNotes: input.machineNotes ?? {},
    scope: studioId,
    tier: "trainer",
    studioId,
    ownerUid: who.uid,
    createdBy: who.uid,
    ...(who.name ? { createdByName: who.name } : null),
  };
}

/** One of a client's routines saved as the trainer's own: its machines and notes, under its name. */
export function myRoutineFromClientRoutine(r: Pick<Routine, "name" | "machineIds" | "machineNotes" | "plan">): MyRoutineWrite {
  return {
    name: r.name,
    machineIds: [...r.machineIds],
    description: r.plan?.purpose ?? "",
    machineNotes: r.machineNotes,
  };
}
