/**
 * What the client can't do, and their weak area, kept on the CLIENT (the
 * routine library round, Oct 23 2026; §10.4). AJ, "1 yes", after the example
 * that settled it: Mary's knee surgery is marked Can't do: Leg Press until
 * March 1, then "Post-surgery" goes into slot A and "Strength" to the stash.
 * Kept on the routine, the mark would leave with "Strength"; kept on Mary, it
 * follows her whatever is equipped.
 *
 * Stored at `clients/{id}/programming/current` (`cantDo`, `focus`, signed).
 * Every reader still reads Routine A's plan (`plan.cantDo`, `plan.focus`,
 * "read by A and B"): the client's marks are laid onto whichever routine is
 * in slot A as it is read (`withProgramming`), so nothing downstream changes
 * and a mark is never lost with a routine. The writers that change them (a
 * can't-do, a reopen, a re-plan, a focus) write the client's document in the
 * same batch as the plan (`programmingWrite`); a slot change that moves slot
 * A writes it too, so the marks Routine A held are on the client before
 * another routine takes its place.
 *
 * - No document yet: Routine A's plan's own marks, as before.
 * - A document: it is the answer. A routine's own entry for the same machine
 *   keeps its place on that routine's road (where its stand-in stands); the
 *   reason, the until and who are the client's.
 * - Still reading: Routine A's own marks, never "none".
 *
 * Pure: no Firestore.
 */
import type { Routine } from "../../types";
import type { CantDo, PlanChange, RoutinePlan } from "../routine-plan/types";
import { studioDayKeyOf } from "../../lib/studio-time";

export interface Programming {
  cantDo: CantDo[];
  focus: string[];
  /** The studio day the document was last written, when known: a routine's own newer marks are kept beside it. */
  day?: string | null;
}

/** The maker of a plan laid onto a plan-less routine as it is read: not stored, so a writer writes a whole plan, never a field of one. */
export const LAID_ON = "client-record";

/** The plan was laid on as the routine was read (the routine has none of its own). */
export function laidOnPlan(plan: Pick<RoutinePlan, "madeByUid"> | null | undefined): boolean {
  return !!plan && plan.madeByUid === LAID_ON;
}

/** The change kinds that move what the client can't do or their focus. */
export const PROGRAMMING_KINDS: readonly PlanChange["kind"][] = ["cantdo", "cando", "replan", "focus"];

function cleanCantDo(raw: unknown): CantDo[] {
  if (!Array.isArray(raw)) return [];
  const out: CantDo[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const c = e as Partial<CantDo>;
    if (typeof c.machineId !== "string" || !c.machineId || typeof c.until !== "string" || !c.until) continue;
    if (out.some((x) => x.machineId === c.machineId)) continue;
    out.push(c as CantDo);
  }
  return out.slice(0, 60);
}

function cleanFocus(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f, i): f is string => typeof f === "string" && !!f && raw.indexOf(f) === i).slice(0, 10);
}

/** The stored document read back safely; null when there is none. */
export function programmingOf(raw: unknown): Programming | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const at = o.updatedAt as { toDate?: () => Date } | null | undefined;
  const when = at && typeof at.toDate === "function" ? at.toDate() : null;
  const day = when && !Number.isNaN(when.getTime()) ? studioDayKeyOf(when) : null;
  return { cantDo: cleanCantDo(o.cantDo), focus: cleanFocus(o.focus), day };
}

/**
 * The client's marks laid onto a routine's plan (the one in slot A): the
 * client's list is the answer; a routine's own entry for the same machine
 * keeps its road fields. A routine with no plan is given the plan Add a plan
 * makes, so the marks have somewhere to be read from. Unchanged (the same
 * object) when nothing differs.
 */
export function withProgramming<T extends Routine>(routine: T, prog: Programming): T {
  const plan = routine.plan as RoutinePlan | undefined;
  if (!plan && prog.cantDo.length === 0 && prog.focus.length === 0) return routine;
  const own = plan?.cantDo ?? [];
  // A mark the routine holds that the document doesn't, made on or after the document's last day (written while the document was unread, or by Start a plan): kept, never hidden.
  const newer = prog.day ? own.filter((o) => !prog.cantDo.some((c) => c.machineId === o.machineId) && typeof o.day === "string" && o.day >= prog.day!) : [];
  const cantDo = [...prog.cantDo.map((c) => {
    const mine = own.find((o) => o.machineId === c.machineId);
    if (!mine) {
      const { replacedBy: _r, onRoad: _o, dayOneAt: _d, ...rest } = c;
      return rest as CantDo;
    }
    return { ...mine, until: c.until, day: c.day, byUid: c.byUid, ...(c.reason ? { reason: c.reason } : null), ...(c.byName ? { byName: c.byName } : null) } as CantDo;
  }), ...newer];
  const base: RoutinePlan = plan ?? { purpose: "", intended: [...routine.machineIds], building: false, madeByUid: LAID_ON };
  const sameCantDo = JSON.stringify(base.cantDo ?? []) === JSON.stringify(cantDo);
  const sameFocus = JSON.stringify(base.focus ?? []) === JSON.stringify(prog.focus);
  if (plan && sameCantDo && sameFocus) return routine;
  const next: RoutinePlan = { ...base, cantDo };
  if (prog.focus.length > 0) next.focus = [...prog.focus];
  else delete next.focus;
  return { ...routine, plan: next };
}

/** Whether a plan write moves the client's marks or focus. */
export function movesProgramming(change: Pick<PlanChange, "kind">, also: readonly Pick<PlanChange, "kind">[] = []): boolean {
  return [change, ...also].some((c) => PROGRAMMING_KINDS.includes(c.kind));
}

/** What the client's document holds after a plan write on slot A (the fields alone; the store signs and times it). */
export function programmingFromPlan(plan: Pick<RoutinePlan, "cantDo" | "focus"> | null | undefined): Programming {
  return { cantDo: cleanCantDo(plan?.cantDo ?? []), focus: cleanFocus(plan?.focus ?? []) };
}
