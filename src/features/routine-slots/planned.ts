/**
 * Planned, not active (the routine library round, Oct 23 2026; §10.2).
 *
 * AJ: at the consult the client does leg press and compound row, and the
 * head trainer who ran it decides "this is what I want their full routine to
 * be"; whoever takes the second session, maybe a different trainer, sees
 * where it is going without it being activated. In a session or the
 * briefing it shows "this one is planned for the routine", with a quick
 * toggle to add it on, and the toggle "Adds it on for good".
 *
 * A routine's planned machines are its plan's road past what it runs now
 * (`lineupGroups`' deck: never one the client can't do while the mark
 * holds). Adding one for good is the plan's own "add now" (`addedNow`, On
 * deck's Add to A now): the machine joins the routine in the plan's order,
 * one change each, signed. Pure.
 */
import type { Routine } from "../../types";
import { addedNow, lineupGroups, signedChange, type PlanWrite, type Who } from "../routine-plan/lineup";
import type { RoutinePlan } from "../routine-plan/types";

/** The machines planned for a routine and not in it yet, in the road's order. */
export function plannedOf(routine: Pick<Routine, "machineIds" | "plan"> | null | undefined, todayYmd: string): string[] {
  const plan = routine?.plan;
  if (!plan || !Array.isArray(plan.intended)) return [];
  return lineupGroups(plan, routine!.machineIds ?? [], todayYmd).deck;
}

/**
 * Planned machines added to the routine for good: one write, the plan and
 * the routine's machines with a signed "add" for each. Null when none of them
 * is planned, or while the routine is empty and its day one runs (the
 * consult is not Routine A: the Wrap-up's ticks start it).
 */
export function addedForGood(
  routine: Pick<Routine, "machineIds" | "plan"> | null | undefined,
  machineIds: readonly string[],
  who: Who,
  todayYmd: string,
): PlanWrite | null {
  const plan = routine?.plan as RoutinePlan | undefined;
  if (!plan || (routine!.machineIds ?? []).length === 0) return null;
  const planned = plannedOf(routine, todayYmd);
  const ids = machineIds.filter((id, i) => planned.includes(id) && machineIds.indexOf(id) === i);
  if (ids.length === 0) return null;
  let now = [...routine!.machineIds];
  let p = plan;
  const changes = [];
  for (const id of ids) {
    const edit = addedNow(p, now, id);
    p = edit.plan;
    now = edit.routine;
    changes.push(signedChange(edit.change, who));
  }
  const [change, ...also] = changes;
  return { plan: p, change, machineIds: now, ...(also.length > 0 ? { also } : null) } as PlanWrite;
}
