/**
 * How a planned routine starts at a studio (the routine library round, Oct 23
 * 2026; §10.2, the studio setting `plannedRoutineStarts`). AJ: when the
 * trainer chooses, "they go into B, turn it on and phase it in (not an
 * instant switch, though the studio may allow that)".
 *
 * True only when the studio allows switching a planned routine on whole and
 * the setting has answered; anything else (Max Strength's default, still
 * reading, not read) is phased in only, the cautious answer: a phase-in can
 * always be finished at once by a person, a switch can't be undone into steps.
 */
import { PLANNED_ROUTINE_STARTS, type StudioSettings } from "../studio-settings";
import { useStudioSettings } from "../studio-settings/useStudioSettings";

export function switchOnWholeOf(settings: Pick<StudioSettings, "value" | "source" | "loading" | "failed">): boolean {
  const answered = settings.source("plannedRoutineStarts") === "studio" || (!settings.loading && !settings.failed);
  return answered && settings.value("plannedRoutineStarts") === PLANNED_ROUTINE_STARTS.either;
}

export function useSwitchOnWhole(studioId: string | null | undefined): boolean {
  return switchOnWholeOf(useStudioSettings(studioId ?? null));
}
