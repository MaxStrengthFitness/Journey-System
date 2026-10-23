/**
 * ONE WORD PER DIAL — the rename table and the pure half of scripts/rename-dials.ts
 * (the dial-names round, Oct 23 2026, `docs/rounds/2026-10-23-dial-names.md`).
 *
 * A dial's name on a catalog machine is its STORAGE KEY in every client's set-up
 * (`clientMachineSettings/{client}_{machine}.settings[label]`; equipment/adapters.ts
 * buildFields, step 1), so renaming a dial means moving every saved value to the new
 * key, in the same breath as the catalog. This table is the one list of what moves;
 * `src/data/dial-names.test.ts` holds it against the seed (every `to` is a dial of
 * that machine in `src/data/default-machines.ts`, no `from` is).
 *
 * Pure: no Firestore. The script reads the documents and applies these.
 */

export interface DialRename {
  machineId: string;
  /** The dial's name today (the storage key every saved value sits under). */
  from: string;
  /** The one word for it from now on. */
  to: string;
}

/**
 * The renames (AJ's answers to the round's questions, §4 of the round document;
 * the recommendations until he answers).
 */
export const DIAL_RENAMES: readonly DialRename[] = [
  // Q1: S on the chart is the seat, and these four have no other seat.
  { machineId: "m-hip-add", from: "Back Pad", to: "Seat" },
  { machineId: "m-hip-abd", from: "Back Pad", to: "Seat" },
  { machineId: "m-ext", from: "Back Pad", to: "Seat" },
  { machineId: "m-leg-curl", from: "Back Pad", to: "Seat" },
  // Q2: the Leg Press's "Seat Angle" is its back pad (P1–P4, stored as the number); its seat is the seat.
  { machineId: "m-leg-press", from: "Seat Angle", to: "Back Pad" },
  { machineId: "m-leg-press", from: "Seat Distance", to: "Seat" },
  // Q7: the Simple Row's seat is the seat.
  { machineId: "m-simple-row", from: "Seat Pad", to: "Seat" },
  // Q6: the Pullover's E- is the elbow pads (AJ, Oct 19 2026), not handles.
  { machineId: "m-pullover", from: "Handles", to: "Elbow Pads" },
];

export interface DialValueReword {
  machineId: string;
  /** The dial, by its name AFTER the renames above. */
  dial: string;
  /** Spelling as saved (compared without case or spaces) → the one word. */
  words: Readonly<Record<string, string>>;
}

/** Q4: the Seated Dip's handles are In or Wide (AJ, Oct 23 2026): N / Neutral / Inside are In, W / Out are Wide. */
export const DIAL_VALUE_REWORDS: readonly DialValueReword[] = [
  {
    machineId: "m-dip",
    dial: "Handles",
    words: { N: "In", NEUTRAL: "In", INSIDE: "In", IN: "In", NARROW: "In", W: "Wide", WIDE: "Wide", OUT: "Wide", OUTSIDE: "Wide" },
  },
];

/** The renames of one machine, old name → new. */
export function renamesFor(machineId: string, renames: readonly DialRename[] = DIAL_RENAMES): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of renames) if (r.machineId === machineId) out.set(r.from, r.to);
  return out;
}

/** Every machine the table touches, in table order, once each. */
export function renamedMachineIds(renames: readonly DialRename[] = DIAL_RENAMES): string[] {
  return [...new Set(renames.map((r) => r.machineId))];
}

export interface KeyMove {
  /** The map with its keys moved; `null` when nothing in it was under an old name. */
  next: Record<string, unknown> | null;
  /** Old names that moved. */
  moved: string[];
  /** Old names dropped because the new name already held a value (the new name's value kept, said in the dry run). */
  kept: string[];
}

/**
 * A map keyed by dial name (`settings`, `sources`, a snapshot's settings), with
 * each old key moved to its new one. Order is kept where it can be: the new key
 * takes the old key's place. A map that already holds the new key keeps that
 * value and drops the old one, and says so (`kept`): a value under the new
 * name was saved by the app after the catalog changed, so it is the newer.
 */
export function moveKeys(map: Record<string, unknown> | null | undefined, renames: ReadonlyMap<string, string>): KeyMove {
  if (!map || typeof map !== "object") return { next: null, moved: [], kept: [] };
  const moved: string[] = [];
  const kept: string[] = [];
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(map)) {
    const to = renames.get(key);
    if (to === undefined) {
      if (!(key in next)) next[key] = value;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(map, to)) {
      kept.push(key);
      continue;
    }
    next[to] = value;
    moved.push(key);
  }
  if (moved.length === 0 && kept.length === 0) return { next: null, moved, kept };
  return { next, moved, kept };
}

/** The same "Back Pad" → "back-pad" folding as machine-trends' normalizeSettingKey, which keys `fitAcks` and the fit index. */
export function normalizedKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `fitAcks` is keyed by the NORMALISED name, and a combination by "a+b" (both
 * sorted). The renames as that map, with every combination that names an old
 * key rewritten and re-sorted.
 */
export function moveAckKeys(acks: Record<string, unknown> | null | undefined, renames: ReadonlyMap<string, string>): KeyMove {
  if (!acks || typeof acks !== "object") return { next: null, moved: [], kept: [] };
  const norm = new Map<string, string>();
  for (const [from, to] of renames) norm.set(normalizedKey(from), normalizedKey(to));
  const combos = new Map<string, string>();
  for (const key of Object.keys(acks)) {
    const parts = key.split("+");
    if (!parts.some((p) => norm.has(p))) continue;
    combos.set(key, parts.map((p) => norm.get(p) ?? p).sort().join("+"));
  }
  return moveKeys(acks, combos);
}

/** A settings list's label as the history rows write it: at the start, or after ", ". */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Gap: —, Back Pad: 6" → "Gap: —, Seat: 6". A `settingHistory` row's words, with
 * the renamed dial's label replaced where it stands as a label (never inside a
 * value). The machine card draws a dial's history by matching the row's label
 * to the dial's (machine-menu/dial-control.ts), so a row left in the old word
 * falls off the dial it belongs to. Unchanged text comes back as is.
 */
export function rewordHistoryText(text: string | null | undefined, renames: ReadonlyMap<string, string>): string | null {
  if (typeof text !== "string" || !text) return null;
  let out = text;
  for (const [from, to] of renames) {
    out = out.replace(new RegExp(`(^|, )${escapeRe(from)}: `, "g"), `$1${to}: `);
  }
  return out === text ? null : out;
}

/** A saved spelling as the one word, or null when it is already that word or is not one of the spellings. */
export function rewordValue(value: unknown, words: Readonly<Record<string, string>>): string | null {
  if (typeof value !== "string") return null;
  const word = words[value.trim().toUpperCase().replace(/\s+/g, "")];
  if (word === undefined || word === value) return null;
  return word;
}

/**
 * A catalog machine's `settingOptions` after the renames: the seed's list when
 * the renamed list has exactly the seed's dials (so the seed's order is taken
 * too), else the catalog's own order with each old name replaced in place.
 */
export function renamedOptions(
  options: readonly string[],
  renames: ReadonlyMap<string, string>,
  seedOptions: readonly string[] | null | undefined,
): { next: string[]; changed: boolean; conflict: string | null } {
  for (const [from, to] of renames) {
    if (options.includes(from) && options.includes(to)) {
      return { next: [...options], changed: false, conflict: `has both "${from}" and "${to}"` };
    }
  }
  const inPlace = options.map((o) => renames.get(o) ?? o);
  const changed = inPlace.some((o, i) => o !== options[i]);
  if (seedOptions && seedOptions.length === inPlace.length && seedOptions.every((o) => inPlace.includes(o))) {
    const next = [...seedOptions];
    return { next, changed: changed || next.some((o, i) => o !== options[i]), conflict: null };
  }
  return { next: inPlace, changed, conflict: null };
}
