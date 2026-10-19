/**
 * WHAT EVERY DESIGN IS GIVEN — the Learning vault redesign, Oct 19 2026.
 *
 * The three prototype designs (the Tactical Codex, the Living Vault, the
 * Interactive Course) mount in the same place with the same props, inside
 * the same VaultProvider (studio markup, the viewer, the lens) and the same
 * masthead (LearningView's Overview / Catalog / Academy switch). A design is
 * a layout of shared pages, never a second copy of their words or rules.
 *
 * PURE MODULE: types only.
 */

import type { Machine } from "../../types";
import type { LearningRef } from "../learning/ref";
import type { LearningViewId } from "../learning/LearningView";

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
}
