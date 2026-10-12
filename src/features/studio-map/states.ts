/**
 * THE FOUR STATES OF A LAYOUT READ (the studio map, Oct 2026).
 *
 * A failed or unusable read is never shown as "No layout yet", and neither
 * is a missing document the iPad's cache answered for (offline, or just
 * woken): only the server's answer that there is none is "empty". A
 * document that exists in the cache counts, because a layout is not a
 * day-by-day claim.
 *
 * PURE MODULE — no React, no Firestore.
 */

export type PlanReadState = "off" | "loading" | "unreadable" | "empty" | "ready";

export function planStateOf(i: {
  enabled: boolean;
  loading: boolean;
  failed: boolean;
  exists: boolean;
  fromCache: boolean;
  usable: boolean;
}): PlanReadState {
  if (!i.enabled) return "off";
  if (i.failed) return "unreadable";
  if (i.loading) return "loading";
  if (!i.exists) return i.fromCache ? "loading" : "empty";
  if (!i.usable) return "unreadable";
  return "ready";
}

export const PLAN_WORDS = {
  loading: "Loading the layout…",
  unreadable: "Can't show the layout right now.",
  empty: "No layout yet.",
} as const;
