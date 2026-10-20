/**
 * THE DOOR TO TODAY'S LEARNING — the Mix for everyone (Oct 20 2026).
 *
 * AJ, Oct 20 2026: "Switch everyone to the Mix now, with a door on each page
 * to today's Learning for the studio tools, and move them in later." The Mix
 * is every trainer's Learning; the studio's own tools still live only on
 * today's pages, so a Mix page that has a counterpart there carries one door
 * to it, named for what is behind it:
 *
 *   a machine           today's machine page: the floor's notes, "How it's
 *                       used", the studio's set-up and its change log, the
 *                       model, comments
 *   the Catalog         today's Catalog: the floor drawn to size (and "Draw
 *                       the floor"), the body view
 *   the Academy         today's Academy: the studio's own pages, New page
 *   a topic, a quick    the same page on today's Academy, where its comments
 *   card, a script, a   are
 *   deep dive
 *
 * Each tool that moves into the Mix later takes its words off its door; a
 * door with nothing left behind it goes.
 *
 * PURE MODULE: no React.
 */

import type { LearningRef } from "../learning/ref";
import { refForRoute } from "../learning-vault/routes";
import type { VaultRoute } from "../learning-vault/types";

/** Where a door opens on today's Learning: one page, or a section's front. */
export type TodayDoor = LearningRef | { kind: "catalog" } | { kind: "academy" };

/**
 * A Mix page's door, or null for a page with nothing behind one (the
 * Overview, a path, the quiz, the map, the glossary, the phrasebook, a
 * module, a playbook).
 */
export function todayDoorFor(route: VaultRoute): TodayDoor | null {
  if (route.kind === "catalog") return { kind: "catalog" };
  if (route.kind === "academy") return { kind: "academy" };
  const ref = refForRoute(route);
  if (!ref || ref.kind === "playbook") return null;
  return todayDoorLabel(ref) ? ref : null;
}

/** The door's words, or null where today's page holds nothing the Mix lacks. */
export function todayDoorLabel(door: TodayDoor): string | null {
  switch (door.kind) {
    case "machine":
      return "Floor notes, set-up and history";
    case "catalog":
      return "Floor plan and body view";
    case "academy":
      return "Studio pages";
    case "academy-topic":
    case "academy-card":
    case "academy-script":
    case "academy-overview":
      return "Comments";
    case "academy-module":
    case "academy-cueing":
    case "academy-glossary":
    case "studio-page":
      return null;
  }
}

/**
 * A page today's Learning holds and the Mix does not draw at all: a studio's
 * own page. A link to one (search, the bell) opens today's Learning
 * straight away rather than a Mix page that would say it has moved.
 */
export function onlyOnToday(ref: LearningRef): boolean {
  return ref.kind === "studio-page";
}
