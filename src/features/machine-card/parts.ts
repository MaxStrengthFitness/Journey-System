/**
 * THE CARD'S PARTS — Learn · Clean · Maintain · Set up, in that order from
 * every door (the studio map, phase 4, Oct 2026).
 *
 * AJ, Oct 11 2026: "this map allows people to interact and click on a
 * machine to learn,clean,maintaince the machines among other posssible
 * things", and after a picture of the same Leg Press card from three doors,
 * "1a": one card, the first part matching the door. Relay cleans, the
 * Catalog teaches, My Studio (and Operations and Admins, which mount the
 * same floor) sets up. Any door in Cleaning opens on Clean.
 *
 * All four parts show for everyone who can open the card; what changes with
 * the person is inside a part (a trainer's Set up is read only, Out of
 * service is a leader's button), never which parts exist.
 *
 * "My Studio: Set up, or the leader's choice" in the hand-off is read as Set
 * up for everyone: a choice would be a setting with no reader beyond the
 * card, and the leader's and the trainer's first part agree.
 *
 * PURE MODULE — no React, no Firestore. parts.test.ts pins the table.
 */

export const CARD_PARTS = ["learn", "clean", "maintain", "setup"] as const;
export type CardPart = (typeof CARD_PARTS)[number];
export type CardDoor = "my-studio" | "operations" | "admins" | "relay" | "catalog";
export const CARD_DOORS: readonly CardDoor[] = ["my-studio", "operations", "admins", "relay", "catalog"];
export type MapMode = "machines" | "cleaning";

export const PART_TITLE: Record<CardPart, string> = { learn: "Learn", clean: "Clean", maintain: "Maintain", setup: "Set up" };

const DOOR_FIRST: Record<CardDoor, CardPart> = {
  relay: "clean",
  catalog: "learn",
  "my-studio": "setup",
  operations: "setup",
  admins: "setup",
};

/** The part open when the card arrives: Clean from any door in Cleaning, else the door's own. */
export function firstPartFor(door: CardDoor, mode: MapMode): CardPart {
  if (mode === "cleaning") return "clean";
  return DOOR_FIRST[door];
}
