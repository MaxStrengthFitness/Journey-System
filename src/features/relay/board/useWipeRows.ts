import { useMemo } from "react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useStudioTasks } from "../../studio-tasks/useStudioTasks";
import { useStudioTaskCategories } from "../../studio-tasks/useStudioTaskCategories";
import type { TaskRow, TaskShift } from "../../studio-tasks/types";
import { shiftNowOf, wipeRowsOf } from "./cleaning";
import { phaseAt, shiftHoursOf, studioMinutesNow } from "./now-context";
import { useRelayMaybe } from "./RelayContext";

const NONE: readonly TaskRow[] = [];

/**
 * TODAY'S WIPE-CHORE ROWS, READ BY A DOOR THAT HAS NONE (phase 4 review
 * fixes, Oct 12 2026). The wipe chore is a per-machine chore in the
 * built-in cleaning category OR in a category the studio made with the
 * cleaning upkeep role, so the rows are filtered with the studio's own
 * categories, as the Board and useTaskActions filter them. Without them a
 * wipe from the map, the tiles or the card completed no row of an authored
 * cleaning chore, and Team read it as not done.
 *
 * Off (null) opens nothing. On, it is today's task reads plus the studio's
 * categories. A host that already holds the rows filters them itself
 * (`wipeRowsOf(rows, categories)`) and hands them down instead.
 */
export function useWipeRows(studioId: string | null): readonly TaskRow[] {
  const { rows } = useStudioTasks(studioId);
  const { categories } = useStudioTaskCategories(studioId);
  return useMemo(() => (studioId ? wipeRowsOf(rows, categories) : NONE), [studioId, rows, categories]);
}

/**
 * The chore shift a wipe tapped now belongs to (`rowsForWipe` completes that
 * shift's row): Relay's own clock inside the shell, else the studio's shift
 * hours (Standards) at the studio's time now.
 */
export function useShiftNow(studioId: string | null): TaskShift {
  const relay = useRelayMaybe();
  const { activeStudio, studios } = useActiveStudio();
  if (relay && relay.studioId === studioId && relay.now) return shiftNowOf(relay.now.phase);
  const studio = activeStudio?.id === studioId ? activeStudio : (studios ?? []).find((s) => s.id === studioId) ?? null;
  return shiftNowOf(phaseAt(studioMinutesNow(new Date()), shiftHoursOf(studio?.shiftHours ?? null)));
}
