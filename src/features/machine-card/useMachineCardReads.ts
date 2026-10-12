/**
 * THE CARD'S READS (the studio map, phase 4, Oct 2026) — React hooks, no JSX.
 *
 * The card reads only what its host doesn't already hold, and a part's
 * reads mount only while that part is unfolded (folding it closes them).
 * Each hook here is called with the studio's id when the host didn't supply
 * that read and with null when it did; every hook underneath treats null as
 * off, so a host that reads everything already (My Studio → Machines, the
 * Catalog) opens no new listener for the card.
 *
 *   useCardFloor      the header and every part: the roster entry and the
 *                     catalog entry (the roster's listener; the catalog's
 *                     is the app's one shared read)
 *   useCardCleaning   Clean: the studio's deepCleanDays, wipeAfterSessions
 *                     and weekly maintenance day (the studio's own settings)
 *   useCardMaintain   Maintain: the floor's notes, the earlier notes, upkeep
 *   useCardSetup      Set up: this studio's settings for its machines
 *
 * The care record is never read here: it is the screen's one live read
 * (relay/board/machine-care-context.tsx, `useCareRead`).
 */
import { useStudioMachines, type UseStudioMachinesResult } from "../../hooks/useStudioMachines";
import { useStudioMachineSettings } from "../../hooks/useStudioMachineSettings";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import type { StudioMachineSetting } from "../../types";
import type { StudioMachineNote } from "../catalog/mutations";
import { useStudioMachineNotes } from "../catalog/useStudioMachineNotes";
import { useFloorNotes, type FloorNotesRead } from "../floor-notes/useFloorNotes";
import { useStudioWiki, type UseStudioWikiResult } from "../wiki/useStudioWiki";
import { useStudioUpkeep, type UpkeepReadState } from "../admin/upkeep/useStudioUpkeep";
import type { UpkeepEvent } from "../admin/upkeep/upkeepLog";
import { useStudioSettings } from "../studio-settings";
import { DEFAULT_DEEP_CLEAN_DAYS, DEFAULT_WIPE_AFTER_SESSIONS } from "../relay/board/machine-care";

export type CardFloor = Pick<UseStudioMachinesResult, "rosterEntries" | "byId" | "catalog" | "loading">;

export interface CardCleaning {
  deepDays: number;
  wipeAfter: number;
  weeklyDay: number | null;
}

export interface CardUpkeep {
  events: UpkeepEvent[];
  state: UpkeepReadState;
}

/** What a host may already hold and hand the card. */
export interface CardReads {
  floor: CardFloor;
  cleaning: CardCleaning;
  settingsByMachineId: Record<string, StudioMachineSetting>;
  floorNotes: FloorNotesRead;
  oldNotes: Record<string, StudioMachineNote>;
  overlayFor: UseStudioWikiResult["overlayFor"];
  upkeep: CardUpkeep;
}

export function useCardFloor(studioId: string, have: CardFloor | undefined): CardFloor {
  // Bridged like Relay's floor, so a catalog stand-in (a studio with no roster yet) still has its card.
  const own = useStudioMachines(have ? null : studioId, { includeInactive: true, bridgeWhenRosterEmpty: true });
  return have ?? own;
}

export function useCardCleaning(studioId: string, have: CardCleaning | undefined): CardCleaning {
  const { studios, activeStudio } = useActiveStudio();
  const studioDoc = activeStudio?.id === studioId ? activeStudio : (studios ?? []).find((s) => s.id === studioId) ?? null;
  const settings = useStudioSettings(have ? null : studioId, have ? null : studioDoc);
  if (have) return have;
  const weekly = settings.value("weeklyMaintenanceDay");
  return {
    deepDays: (settings.value("deepCleanDays") as number | null) ?? DEFAULT_DEEP_CLEAN_DAYS,
    wipeAfter: (settings.value("wipeAfterSessions") as number | null) ?? DEFAULT_WIPE_AFTER_SESSIONS,
    weeklyDay: typeof weekly === "number" ? weekly : null,
  };
}

export function useCardMaintain(
  studioId: string,
  have: Partial<Pick<CardReads, "floorNotes" | "oldNotes" | "overlayFor" | "upkeep">>,
): Pick<CardReads, "floorNotes" | "oldNotes" | "overlayFor" | "upkeep"> {
  const floorNotes = useFloorNotes(have.floorNotes ? null : studioId);
  const { notesByMachineId } = useStudioMachineNotes(have.oldNotes ? null : studioId);
  const { overlayFor } = useStudioWiki(have.overlayFor ? null : studioId);
  const upkeep = useStudioUpkeep(have.upkeep ? null : studioId);
  return {
    floorNotes: have.floorNotes ?? floorNotes,
    oldNotes: have.oldNotes ?? notesByMachineId,
    overlayFor: have.overlayFor ?? overlayFor,
    upkeep: have.upkeep ?? { events: upkeep.events, state: upkeep.state },
  };
}

export function useCardSetup(studioId: string, have: Record<string, StudioMachineSetting> | undefined): Record<string, StudioMachineSetting> {
  const { settingsByMachineId } = useStudioMachineSettings(have ? null : studioId);
  return have ?? settingsByMachineId;
}
