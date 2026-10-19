/**
 * The briefing's one line while a step of Routine B's phase-in plan is due
 * (the routine builder round, Oct 19 2026; AJ: "so i can make sure the plan
 * is followed"). It says the step, its owner and "behind" once its week has
 * passed; the step is ticked on Programming → Routines. Nothing here writes,
 * and nothing pings anyone.
 */
import { CalendarClock } from "lucide-react";
import type { Routine } from "../../../types";
import { phaseDueWords, phaseOf } from "../phase";
import "../../routine-plan/ui/routine-plan.css";

export function PhaseDueLine({
  routineB,
  todayYmd,
  nameOf,
}: {
  routineB: Pick<Routine, "plan"> | null | undefined;
  todayYmd: string;
  nameOf: (id: string) => string;
}) {
  const phase = phaseOf(routineB?.plan?.phase);
  const words = phase ? phaseDueWords(phase, todayYmd, nameOf) : null;
  if (!words) return null;
  return (
    <p className="rpl-line rpl-line--icon" data-testid="phase-due">
      <CalendarClock size={16} aria-hidden="true" />
      {words}
    </p>
  );
}
