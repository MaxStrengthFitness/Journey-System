/**
 * THE NOW BAR'S NUMBER PAD — what a key does to the number being typed
 * (the Now Bar pad round, Oct 20 2026; AJ: "i hate the keyboard on devices,
 * i feel like we should just use our own keyboard so the screen stops
 * getting pushed around so much or getting covered by a giant keyboard").
 *
 * Pure: the bar keeps the text of the field in hand and asks this what a
 * key makes of it. Like a spreadsheet cell (machine-fit's QuickPad), the
 * FIRST key after arriving on a field replaces what was there, so 45 → 50
 * is "5", "0", never backspace twice first.
 */

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

export const PAD_DIGITS: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export interface PadKeyOptions {
  /** The first key since arriving on the field: it replaces the text. */
  fresh: boolean;
  /** The field takes a point (the weight); a count never does. */
  decimal: boolean;
}

/** Longest text a field takes: "999.5" for a weight, "999" for a count. */
const MAX_LEN = { decimal: 5, whole: 3 } as const;

export function padKey(text: string, key: PadKey, { fresh, decimal }: PadKeyOptions): string {
  const base = fresh ? "" : text;
  if (key === "back") return fresh ? "" : base.slice(0, -1);
  if (key === ".") {
    if (!decimal || base.includes(".")) return base;
    return base === "" ? "0." : base + ".";
  }
  const max = decimal ? MAX_LEN.decimal : MAX_LEN.whole;
  // One place after the point is all a plate stack ever needs.
  const point = base.indexOf(".");
  if (point >= 0 && base.length - point > 1) return base;
  if (base.length >= max) return base;
  // "0" then "5" is 5, never "05".
  if (base === "0") return key;
  return base + key;
}

/** The number a field's text says, or null while it says nothing yet. */
export function padValue(text: string): number | null {
  if (text === "" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** The text a stored number starts as when the field is arrived on. */
export function padText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
