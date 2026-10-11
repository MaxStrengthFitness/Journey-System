/**
 * LENGTHS AS A PERSON SAYS THEM (the studio map, Oct 2026).
 *
 * Every size and every gap is stored in whole millimetres; this is the one
 * module that speaks feet and inches. A tape reads in feet, inches and
 * fractions, so the reader takes "83", "83.5" and "83 1/2"; every sentence
 * a screen shows is feet and inches, and no function here ever returns
 * millimetres or centimetres (a test holds it).
 *
 * PURE MODULE — no React, no Firestore.
 */

export const MM_PER_IN = 25.4;
export const MM_PER_FT = 304.8;
/** A move's step: 6 in. */
export const SNAP_MM = 152.4;

/** Feet and inches as whole millimetres. */
export function mmFromFtIn(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * MM_PER_IN);
}

const PROBLEM_FORMAT = "Feet are whole numbers; inches can be 83, 83.5 or 83 1/2.";

/** Inches as typed: a whole number, one decimal, or a fraction with or without a whole part. */
function inchesOf(text: string): number | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (t === "") return 0;
  const plain = /^(\d{1,4})(?:\.(\d))?$/.exec(t);
  if (plain) return Number(plain[1]) + (plain[2] ? Number(plain[2]) / 10 : 0);
  const fraction = /^(?:(\d{1,4}) )?(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (fraction) {
    const num = Number(fraction[2]);
    const den = Number(fraction[3]);
    if (![2, 4, 8, 16].includes(den) || num < 1 || num >= den) return null;
    return (fraction[1] ? Number(fraction[1]) : 0) + num / den;
  }
  return null;
}

/**
 * A length typed as feet and inches, or the sentence that says what's
 * wrong. Feet may be left empty (a tape is often read in inches alone);
 * inches of 12 or more roll over into feet.
 */
export function parseFtIn(ftText: string, inText: string): { mm: number } | { problem: string } {
  const ftT = ftText.trim();
  const inT = inText.trim();
  if (ftT === "" && inT === "") return { problem: "Type a length." };
  if (ftT !== "" && !/^\d{1,3}$/.test(ftT)) return { problem: PROBLEM_FORMAT };
  const inches = inchesOf(inT);
  if (inches === null) return { problem: PROBLEM_FORMAT };
  return { mm: mmFromFtIn(ftT === "" ? 0 : Number(ftT), inches) };
}

/** Whole millimetres as feet and inches, to the nearest inch. */
export function ftIn(mm: number): { ft: number; in: number } {
  const total = Math.max(0, Math.round(mm / MM_PER_IN));
  return { ft: Math.floor(total / 12), in: total % 12 };
}

function words(totalInches: number): string {
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  if (ft === 0) return `${inch} in`;
  if (inch === 0) return `${ft} ft`;
  return `${ft} ft ${inch} in`;
}

/** A length in words, to the nearest inch and never under 1 in: "5 in", "2 ft", "1 ft 4 in". */
export function lengthWords(mm: number): string {
  return words(Math.max(1, Math.round(mm / MM_PER_IN)));
}

/**
 * A gap in words, rounded DOWN to whole inches, so a gap that fails the
 * spacing never prints the spacing itself (609 mm is "1 ft 11 in", never
 * "2 ft"). Under 5 mm it is null (the caller says "touch"); under an inch,
 * "less than an inch".
 */
export function gapWords(mm: number): string | null {
  if (mm < 5) return null;
  if (mm < MM_PER_IN) return "less than an inch";
  return words(Math.floor(mm / MM_PER_IN + 1e-9));
}

/** "5 ft 3 in long × 4 ft wide × 6 ft 1 in tall"; "tall" only when there is a height. */
export function sizeLine(size: { lengthMm: number; widthMm: number; heightMm?: number | null }): string {
  const parts = [`${lengthWords(size.lengthMm)} long`, `${lengthWords(size.widthMm)} wide`];
  if (typeof size.heightMm === "number" && size.heightMm > 0) parts.push(`${lengthWords(size.heightMm)} tall`);
  return parts.join(" × ");
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "no", "one" … "nine", then numerals. */
export function countWords(n: number): string {
  return n >= 0 && n < COUNT_WORDS.length && Number.isInteger(n) ? COUNT_WORDS[n] : String(n);
}

/** Two counts in one sentence, both in words or both in numerals. */
export function countPair(k: number, n: number): [string, string] {
  const small = (x: number) => Number.isInteger(x) && x >= 0 && x < COUNT_WORDS.length;
  return small(k) && small(n) ? [countWords(k), countWords(n)] : [String(k), String(n)];
}

/** "A", "A and B", "A, B and C". */
export function listWords(xs: readonly string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
