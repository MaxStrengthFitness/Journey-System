/**
 * WHAT THE MIX IS GIVEN — the Learning vault redesign, Oct 19 2026; every
 * trainer's Learning since Oct 20 2026.
 *
 * The Mix (the Tactical Codex with the Course's lessons and the Vault's map
 * as a lens) mounts inside the VaultProvider (studio markup, the viewer, the
 * lens) and LearningView's masthead (Overview / Catalog / Academy). It is a
 * layout of shared pages, never a second copy of their words or rules.
 *
 * PURE MODULE: types only.
 */

import type { Machine } from "../../types";
import type { LearningRef } from "../learning/ref";
import type { LearningViewId } from "../learning/LearningView";
import type { TodayDoor } from "./today-door";

export interface DesignProps {
  /** The masthead's section: Overview ("learning"), Catalog ("machine-anatomy"), Academy ("academy"). */
  section: LearningViewId;
  /** Moves the masthead (the design calls it when its own door changes section). */
  onSection: (id: LearningViewId) => void;
  /** The global machine list (catalog names) LearningView already holds. */
  machines: Machine[];
  studioId: string | null;
  /** The studio's name, for "{name}'s version". "This studio" when unknown. */
  studioName: string;
  /** A page to open from outside (search, the bell, a link). Cleared by onJumpHandled. */
  jump: LearningRef | null;
  onJumpHandled: () => void;
  /**
   * Goes up by one each time the trainer asks for the section's front page
   * while already in that section: the Learning title (the masthead's
   * onHome) on the Overview, or the section that is already on. LearningView
   * asked the leave gate before it moved, so the design goes back to the
   * section's root without asking again (useVaultNav's set). Only a CHANGE
   * means anything; the first value (absent, or 0) asks for nothing.
   */
  resetSignal?: number;
  /**
   * Opens today's Learning at a door (today-door.ts), for the studio's tools
   * the Mix does not have yet. LearningView asks the leave gate first.
   * Absent (a harness, a test): the Mix draws no doors.
   */
  onOpenToday?: (door: TodayDoor) => void;
}
