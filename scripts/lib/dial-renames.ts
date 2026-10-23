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
 * The renames, AJ's answers of Oct 23 2026 (§7 of the round document): "2. seat
 * angles are P1 P2 P3 P4 and is the back pad to leg press"; "3. Shin Pad"; "Pull
 * over has elbow pads and a back pad". Hip Adduction, Hip Abduction, Leg Curl and
 * Leg Extension keep Back Pad ("1. back pad").
 */
export const DIAL_RENAMES: readonly DialRename[] = [
  { machineId: "m-leg-press", from: "Seat Angle", to: "Back Pad" },
  { machineId: "m-leg-curl", from: "Ankle Pad", to: "Shin Pad" },
  { machineId: "m-pullover", from: "Handles", to: "Elbow Pads" },
];

export interface DialAddition {
  machineId: string;
  /** A dial the machine has that the catalog never listed; appended, nothing to migrate. */
  dial: string;
}

/** AJ, Oct 23 2026: "lumbar has a seat height a gap and a foot plate. FT is Foot Plate"; the Pullover's back pad "can be up or down". */
export const DIAL_ADDITIONS: readonly DialAddition[] = [
  { machineId: "m-lumbar", dial: "Foot Plate" },
  { machineId: "m-pullover", dial: "Back Pad" },
];

export interface DialValueReword {
  machineId: string;
  /** The dial, by its name AFTER the renames above. */
  dial: string;
  /** Spelling as saved (compared without case or spaces) → the one word. */
  words: Readonly<Record<string, string>>;
}

/**
 * AJ, Oct 23 2026. The Seated Dip's handles are In or Wide ("4. Neutral is in"):
 * N / Neutral / Inside are In, W / Out are Wide. The Pullover's elbow pads
 * "can [be] out/wide, neutral/middle or in/narrow": N is Middle THERE (not In as
 * on the dip). The Leg Press's back pad is P1–P4, so a bare number becomes its P.
 */
export const DIAL_VALUE_REWORDS: readonly DialValueReword[] = [
  {
    machineId: "m-dip",
    dial: "Handles",
    words: { N: "In", NEUTRAL: "In", INSIDE: "In", IN: "In", NARROW: "In", W: "Wide", WIDE: "Wide", OUT: "Wide", OUTSIDE: "Wide" },
  },
  {
    machineId: "m-pullover",
    dial: "Elbow Pads",
    words: {
      W: "Wide", WIDE: "Wide", OUT: "Wide", OUTSIDE: "Wide",
      M: "Middle", MID: "Middle", MIDDLE: "Middle", N: "Middle", NEUTRAL: "Middle",
      IN: "In", NARROW: "In", INSIDE: "In",
    },
  },
  {
    machineId: "m-leg-press",
    dial: "Back Pad",
    words: { "1": "P1", "2": "P2", "3": "P3", "4": "P4", P1: "P1", P2: "P2", P3: "P3", P4: "P4" },
  },
];

/** The renames of one machine, old name → new. */
export function renamesFor(machineId: string, renames: readonly DialRename[] = DIAL_RENAMES): Map<string, string> {
  return new Map(renames.filter((r) => r.machineId === machineId).map((r) => [r.from, r.to]));
}

/** The value rewords of one machine, dial (new name) → words. */
export function rewordsFor(machineId: string, rewords: readonly DialValueReword[] = DIAL_VALUE_REWORDS): Map<string, Readonly<Record<string, string>>> {
  return new Map(rewords.filter((w) => w.machineId === machineId).map((w) => [w.dial, w.words]));
}

/** The dials added to one machine. */
export function additionsFor(machineId: string, additions: readonly DialAddition[] = DIAL_ADDITIONS): string[] {
  return additions.filter((a) => a.machineId === machineId).map((a) => a.dial);
}

/** Every machine the tables touch, in table order, once each. */
export function touchedMachineIds(
  renames: readonly DialRename[] = DIAL_RENAMES,
  additions: readonly DialAddition[] = DIAL_ADDITIONS,
  rewords: readonly DialValueReword[] = DIAL_VALUE_REWORDS,
): string[] {
  return [...new Set([...renames.map((r) => r.machineId), ...additions.map((a) => a.machineId), ...rewords.map((w) => w.machineId)])];
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

/** A saved spelling as the one word, or null when it is already that word or is not one of the spellings. */
export function rewordValue(value: unknown, words: Readonly<Record<string, string>>): string | null {
  if (typeof value !== "string") return null;
  const word = words[value.trim().toUpperCase().replace(/\s+/g, "")];
  if (word === undefined || word === value) return null;
  return word;
}

/**
 * A settings map with each listed dial's spelling made the one word. `null` when
 * nothing changed; `changed` says which ("Handles: Neutral → In").
 */
export function rewordValues(
  map: Record<string, unknown> | null | undefined,
  rewords: ReadonlyMap<string, Readonly<Record<string, string>>>,
): { next: Record<string, unknown> | null; changed: string[] } {
  if (!map || typeof map !== "object" || rewords.size === 0) return { next: null, changed: [] };
  const changed: string[] = [];
  const next = { ...map };
  for (const [dial, words] of rewords) {
    const word = rewordValue(next[dial], words);
    if (word === null) continue;
    changed.push(`${dial}: "${String(next[dial])}" → ${word}`);
    next[dial] = word;
  }
  return changed.length ? { next, changed } : { next: null, changed };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Gap: —, Seat Angle: 2" → "Gap: —, Back Pad: P2". A `settingHistory` row's
 * words, with a renamed dial's label replaced where it stands as a label (never
 * inside a value), and a reworded dial's value made the one word. The machine
 * card draws a dial's history by matching the row's label to the dial's
 * (machine-menu/dial-control.ts) and its lane by the values, so a row left in
 * the old words falls off the dial it belongs to. Unchanged text comes back null.
 */
export function rewordHistoryText(
  text: string | null | undefined,
  renames: ReadonlyMap<string, string>,
  rewords: ReadonlyMap<string, Readonly<Record<string, string>>> = new Map(),
): string | null {
  if (typeof text !== "string" || !text) return null;
  let out = text;
  for (const [from, to] of renames) {
    out = out.replace(new RegExp(`(^|, )${escapeRe(from)}: `, "g"), `$1${to}: `);
  }
  if (rewords.size) {
    // The app's own split (setting-history.ts parseList): at ", " only where another "Label: " follows.
    out = out
      .split(/, (?=[^,:]+: )/)
      .map((part) => {
        const i = part.indexOf(": ");
        if (i <= 0) return part;
        const label = part.slice(0, i);
        const words = rewords.get(label);
        const word = words ? rewordValue(part.slice(i + 2), words) : null;
        return word === null ? part : `${label}: ${word}`;
      })
      .join(", ");
  }
  return out === text ? null : out;
}

/**
 * A catalog machine's `settingOptions` after the renames and the additions: the
 * seed's list when the result has exactly the seed's dials (so the seed's order
 * is taken too), else the catalog's own order with each old name replaced in
 * place and each new dial appended.
 */
export function renamedOptions(
  options: readonly string[],
  renames: ReadonlyMap<string, string>,
  seedOptions: readonly string[] | null | undefined,
  additions: readonly string[] = [],
): { next: string[]; changed: boolean; conflict: string | null } {
  for (const [from, to] of renames) {
    if (options.includes(from) && options.includes(to)) {
      return { next: [...options], changed: false, conflict: `has both "${from}" and "${to}"` };
    }
  }
  const inPlace = options.map((o) => renames.get(o) ?? o);
  for (const dial of additions) if (!inPlace.includes(dial)) inPlace.push(dial);
  const changed = inPlace.length !== options.length || inPlace.some((o, i) => o !== options[i]);
  if (seedOptions && seedOptions.length === inPlace.length && seedOptions.every((o) => inPlace.includes(o))) {
    const next = [...seedOptions];
    return { next, changed: changed || next.some((o, i) => o !== options[i]), conflict: null };
  }
  return { next: inPlace, changed, conflict: null };
}
