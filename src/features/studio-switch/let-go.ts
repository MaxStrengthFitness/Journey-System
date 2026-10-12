/**
 * A STUDIO SWITCH LETS GO OF THE CLIENT — the pure half.
 *
 * Oct 12 2026. AJ: "switching a studio with a client pulled up keeps the
 * client loaded, switching studios should clear whoever youre holding." The
 * client on screen belongs to the studio the iPad was on; at the next studio
 * she is someone else's client, or nobody's, and her profile kept open there
 * reads as if she belonged.
 *
 * Every way of switching (the studio picker from the header's name or the
 * menu, Operations' Looking at, Admins → Home's "Go to {Studio}'s Today")
 * moves the one active studio, so the rule is about that value, not about
 * each door: a new door is covered without anyone remembering it.
 *
 * PURE — no React, no storage. `useLetGoOnStudioSwitch` is the hook.
 */
import type { View } from "../../types";

/**
 * The screens that ARE a client: with nobody held they have nothing to show,
 * so a switch from one of them goes to the Hub. Every other screen (the Hub,
 * the Directory, Operations, My Studio...) stays where it is, on the new
 * studio.
 */
export const CLIENT_SCREENS: ReadonlySet<View> = new Set<View>(["profile", "progress-report", "workouts"]);

export interface LetGo {
  /** The screen was a client's own, so it goes to the Hub; else it stays. */
  toHub: boolean;
}

/**
 * What a move of the active studio from `from` to `to` asks of the app, or
 * null when it is not a switch: the same studio, or entering a studio from
 * none (a sign-in, the picker's first pick), which holds nobody yet. Leaving
 * a studio for none (it was deleted, or the person signed out) lets go too.
 */
export function afterStudioMove(from: string | null, to: string | null, view: View): LetGo | null {
  if (from === to || !from) return null;
  return { toHub: CLIENT_SCREENS.has(view) };
}
