/**
 * THE SEAT BELT — one setting every machine carries (Oct 19 2026).
 *
 * AJ, on a Pulldown whose FileMaker chart had a box reading "Belt": "allow
 * machines to have a seatbelt toggle to them", and then: "every machine
 * could/should have a seatbelt now if the client chooses to use it or if the
 * machine has it installed is another question that the studio needs to
 * answer. SOme clients weight is so low the seatbelt is not required or their
 * form has progressed to a point they dont need the seatbelt. On/off/Not
 * needed" (his "Aa Ba"), and then, the same day: "rather than having 3 options
 * lets switch it to on or off. Then allow studios to toggle if they have a
 * seatbelt on the machine in the studio editor".
 * `docs/rounds/2026-10-19-seat-belt.md` is the round.
 *
 * So:
 *   - THE CLIENT'S CHOICE is On or Off, tapped on the card. Off covers every
 *     reason not to wear it (the client's choice, a load so light it isn't
 *     needed, form that no longer needs it). It is saved
 *     like every dial, in `clientMachineSettings.settings`, under SEAT_BELT_KEY,
 *     with the same Save, history row and Undo. Nothing saved means NOT
 *     RECORDED, which is every client before this round: it is never "Off"
 *     (a confident wrong answer is worse than a missing one), and never one
 *     of the Now Bar's "not set" dials, or every Pulldown in every session
 *     would say "· 1 not set".
 *   - THE UNIT'S ANSWER is `hasSeatBelt` on the machine's definition, a
 *     studio field (lib/machine-template.ts: the hardware is the studio's).
 *     `false` takes the belt off that unit; anything else, unanswered
 *     included, shows it (AJ's "Ba": shown on every machine until the studio
 *     says the unit has none). A value already saved for a client stays on
 *     their record when a studio later says the unit has none.
 *   - It is a dial in every other way: the card's tile, the history, the
 *     snapshot on each set, the open session's held set-up. It never reaches
 *     machine fit (machine-fit/fit-index.ts `toFitRow` leaves it out): a belt
 *     is not a position that follows a body, and "nobody else here goes
 *     without the belt" would read as coaching.
 *
 * PURE — no React, no Firestore. Only a type import, so the floor can ask it
 * without loading anything heavy.
 */
import { foldBeltWord, isSeatBelt } from "./seat-belt-key.ts";
import type { SettingFieldSpec } from "./types";

/**
 * The storage key AND the label. The key every client's value is saved
 * under, so it never changes. Spelled as its label because stored keys are
 * shown as they are in a few places (a set's settings snapshot, the grid's
 * spoken summary), and other dials on the floor are saved under their labels
 * too ("Back Pad").
 */
export const SEAT_BELT_KEY = "Seat belt";
export const SEAT_BELT_LABEL = "Seat belt";

export const SEAT_BELT_ON = "On";
export const SEAT_BELT_OFF = "Off";

/** The two choices, in the order the tile draws them (AJ: "on or off"). */
export const SEAT_BELT_CHOICES = [SEAT_BELT_ON, SEAT_BELT_OFF] as const;
export type SeatBeltChoice = (typeof SEAT_BELT_CHOICES)[number];

/** The name test lives in ./seat-belt-key.ts, so the first screen can ask it alone. */
export { isSeatBelt };
const fold = foldBeltWord;

/**
 * This dial is the seat belt, by its key or its label: the one test every
 * dial list asks (the card, the empty dials, Setup, machine fit, the paste
 * box), so a dial named "Belt" under some other key is the belt everywhere.
 */
export function isSeatBeltField(field: { key: string; label?: string | null }): boolean {
  return isSeatBelt(field.key) || isSeatBelt(field.label);
}

/** The unit has a seat belt, as far as the floor is concerned: only a studio's "No" takes it off. */
export function unitHasSeatBelt(machine: { hasSeatBelt?: boolean | null } | null | undefined): boolean {
  return machine?.hasSeatBelt !== false;
}

/** The belt as the card, the Now Bar and Setup hold a dial. No studio standard: nobody sets one. */
export function seatBeltField(): SettingFieldSpec {
  return {
    key: SEAT_BELT_KEY,
    label: SEAT_BELT_LABEL,
    type: "enum",
    options: [...SEAT_BELT_CHOICES],
    ghost: null,
    absolute: false,
  };
}

/**
 * A machine's dials with the belt last, unless the unit has none or a dial of
 * the machine's own already is the belt. The one place the belt joins a
 * machine's dials (equipment/adapters.ts `buildFields`).
 */
export function withSeatBelt(
  fields: readonly SettingFieldSpec[],
  machine: { hasSeatBelt?: boolean | null } | null | undefined,
): SettingFieldSpec[] {
  if (!unitHasSeatBelt(machine)) return [...fields];
  if (fields.some(isSeatBeltField)) return [...fields];
  return [...fields, seatBeltField()];
}

const ON_WORDS: ReadonlySet<string> = new Set(["on", "yes", "y", "belt", "seatbelt", "belted", "true", "x"]);
/** Off, and every reason not to wear it: "not needed" is Off since AJ's "on or off". */
const OFF_WORDS: ReadonlySet<string> = new Set([
  "off",
  "no",
  "n",
  "nobelt",
  "noseatbelt",
  "false",
  "notneeded",
  "notneed",
  "unneeded",
  "notrequired",
  "nn",
  "na",
]);

/**
 * A written or typed belt value as On or Off, or null when it is neither
 * ("3", "PILLOW"): "On", "yes", "Y", "Belt", "✓" are On; "off", "no", "No
 * belt", "not needed", "N/A" are Off.
 */
export function beltChoiceOf(raw: string | null | undefined): SeatBeltChoice | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/^[✓✔]$/.test(text)) return SEAT_BELT_ON;
  const word = fold(text);
  if (ON_WORDS.has(word)) return SEAT_BELT_ON;
  if (OFF_WORDS.has(word)) return SEAT_BELT_OFF;
  return null;
}

/**
 * The belt as the Now Bar and the phone card say it: "Belt on", "Belt off"
 * (AJ's "Aa": "Gap 3 · Back pad 4 · Seat 4 · Belt on"). A value that is
 * neither is said as written, never dropped.
 */
export function beltWords(value: string): string {
  const choice = beltChoiceOf(value);
  if (choice === SEAT_BELT_ON) return "Belt on";
  if (choice === SEAT_BELT_OFF) return "Belt off";
  return `${SEAT_BELT_LABEL} ${String(value).trim()}`;
}
