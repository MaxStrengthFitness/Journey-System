/**
 * WHICH LEARNING, AND AS WHOM — the prototype bar's two choices (the
 * Learning vault redesign, Oct 19 2026).
 *
 * AJ asked for three playable prototypes of Learning for a morning decision.
 * The bar above Learning's masthead picks one of them, or today's Learning
 * ("Current", the default, so nothing changes for anyone who never taps it),
 * and, while a prototype is on, who to read it as: a trainer, a leader or
 * head office. "View as" changes only what the viewer may do (cross out,
 * note, see head office's queue); the uid and the name stay the real ones.
 *
 * The pick is remembered on this iPad (localStorage, wrapped: a private
 * window or blocked storage just starts on Current). Sign-out clears every
 * localStorage key but the device's own (features/sign-out/sign-out.ts), so
 * nothing else needs registering.
 *
 * PURE MODULE: no React.
 */

import type { LearningViewId } from "../learning/LearningView";
import type { LearningDesign, VaultViewer } from "../learning-vault/types";

export interface DesignOption {
  id: LearningDesign;
  /** A number on the bar, if it ever has two prototypes again; the Mix has none. */
  number: 1 | 2 | 3 | null;
  /** The bar's word for it. */
  label: string;
  /** Its full name, for its own page. */
  name: string;
}

/**
 * In the bar's order: the Mix, then today's. AJ picked the mix (Oct 19 2026):
 * the Codex as the base, with the Course's lesson cards, scrubber, cue drills
 * and glossary vault and the Vault's map as a lens. The id stays "codex" (the
 * folder, the remembered pick), so an iPad that remembered "vault" or
 * "course" just opens on Current.
 */
export const DESIGNS: readonly DesignOption[] = [
  { id: "codex", number: null, label: "Mix", name: "The Mix" },
  { id: "current", number: null, label: "Current", name: "Today's Learning" },
];

export function designById(id: LearningDesign): DesignOption {
  return DESIGNS.find((d) => d.id === id) ?? DESIGNS[DESIGNS.length - 1];
}

/** A design id read from somewhere untyped (storage, an address), or null. */
export function parseDesign(raw: unknown): LearningDesign | null {
  return typeof raw === "string" && DESIGNS.some((d) => d.id === raw) ? (raw as LearningDesign) : null;
}

export const DESIGN_KEY = "journey.learning.design.v1";

/**
 * Who sees the prototype bar (review fix, Oct 19 2026): an administrator or
 * the founder (the Admins dashboard's own gate, useActiveStudio().isAdmin),
 * or anyone on a development build (the PC build AJ walks; EnvironmentMark's
 * import.meta.env.DEV). Never every signed-in trainer: work goes to master,
 * master is what every iPad gets at the next deploy, and a Life Transformer
 * must not find a "Prototype" strip, or "View as: Head office", on the floor.
 * Everyone else is on today's Learning, whatever this iPad last picked.
 */
export function mayPickPrototypes(who: { isAdmin?: boolean | null; dev?: boolean }): boolean {
  return Boolean(who.isAdmin) || Boolean(who.dev);
}

/**
 * The Learning a viewer sees: today's for anyone who may not pick a
 * prototype, whatever this iPad last picked; the picked one otherwise. Read
 * at every render, so an administrator whose role arrives a moment after the
 * screen still gets their pick, and a trainer never does.
 */
export function shownDesign(mayPick: boolean, picked: LearningDesign): LearningDesign {
  return mayPick ? picked : "current";
}

/** The design last picked on this iPad, or null (never picked, or storage unreadable). */
export function rememberedDesign(): LearningDesign | null {
  try {
    return parseDesign(localStorage.getItem(DESIGN_KEY));
  } catch {
    return null;
  }
}

export function rememberDesign(design: LearningDesign): void {
  try {
    localStorage.setItem(DESIGN_KEY, design);
  } catch {
    /* a private window or blocked storage: the pick lasts this visit only */
  }
}

/* ------------------------------------------------------------------ *
 * View as
 * ------------------------------------------------------------------ */

export type ViewAs = "trainer" | "leader" | "head-office";

export const VIEW_AS: readonly { id: ViewAs; label: string }[] = [
  { id: "trainer", label: "Trainer" },
  { id: "leader", label: "Leader" },
  { id: "head-office", label: "Head office" },
];

export function parseViewAs(raw: unknown): ViewAs | null {
  return typeof raw === "string" && VIEW_AS.some((v) => v.id === raw) ? (raw as ViewAs) : null;
}

/**
 * Who the real viewer reads as, for the bar's picked segment when nobody has
 * picked: head office (an administrator), else a leader (crosses lines out),
 * else a trainer.
 */
export function naturalViewAs(real: Pick<VaultViewer, "canStrike" | "isHeadOffice">): ViewAs {
  if (real.isHeadOffice) return "head-office";
  if (real.canStrike) return "leader";
  return "trainer";
}

/**
 * The viewer a prototype reads as. Null keeps the real one. Otherwise only
 * what they may do changes, mirroring the rules for that role at this
 * studio: a trainer notes (writesForStudio) but does not cross out; a leader
 * does both (canWriteStudioPages); head office is a super admin, who passes
 * both rules and also sees the queue.
 */
export function viewerFor(real: VaultViewer, viewAs: ViewAs | null): VaultViewer {
  if (viewAs === "trainer") return { ...real, canStrike: false, canNote: true, isHeadOffice: false };
  if (viewAs === "leader") return { ...real, canStrike: true, canNote: true, isHeadOffice: false };
  if (viewAs === "head-office") return { ...real, canStrike: true, canNote: true, isHeadOffice: true };
  return real;
}

/* ------------------------------------------------------------------ *
 * The masthead's sections, by name
 * ------------------------------------------------------------------ */

/** The masthead's words for each section (LearningView's switch). */
export const SECTION_LABEL: Record<LearningViewId, string> = {
  learning: "Overview",
  "machine-anatomy": "Catalog",
  academy: "Academy",
};
