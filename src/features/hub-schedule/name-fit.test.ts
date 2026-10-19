/**
 * DOES HER NAME FIT A NARROW CARD? (the narrow cards round, Oct 18 2026.)
 *
 * The width table is the vendored font's own (read from the woff2 files
 * here, so a new font can't drift from it unseen), its sums are what Chrome
 * drew, and the verdict is "too long" exactly where two lines can't hold the
 * name without breaking a word: the very long names AJ said take initials on
 * a narrow card (Oct 18 2026), and none of the 2,500 realistic names at the
 * commonest narrow line.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import {
  FIT_SLACK_PX,
  NARROW_LINES,
  NARROW_NAME_FACE,
  SAIRA_700_UNITS,
  SAIRA_UNITS_PER_EM,
  nameNeed,
  nameOverAttr,
  nameOverLines,
  narrowWidth,
} from "./name-fit";

/* ------------------------------------------------------------------ */
/* The font files' own advance widths (WOFF2: head, hhea, hmtx, cmap)  */
/* ------------------------------------------------------------------ */

const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB"];

function fontAdvances(file: string): { unitsPerEm: number; advanceOf: (codePoint: number) => number | undefined } {
  const b = readFileSync(file);
  expect(b.toString("latin1", 0, 4)).toBe("wOF2");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const numTables = view.getUint16(12);
  const compressed = view.getUint32(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i += 1) {
      const c = b[p++];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
    throw new Error("bad UIntBase128");
  };
  const dir: { tag: string; transformed: boolean; length: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = b[p++];
    let tag = KNOWN_TAGS[flags & 0x3f] ?? "?";
    if ((flags & 0x3f) === 63) {
      tag = b.toString("latin1", p, p + 4);
      p += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    dir.push({ tag, transformed, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(b.subarray(p, p + compressed));
  const tables: Record<string, { view: DataView; transformed: boolean }> = {};
  let off = 0;
  for (const t of dir) {
    tables[t.tag] = { view: new DataView(data.buffer, data.byteOffset + off, t.length), transformed: t.transformed };
    off += t.length;
  }
  const unitsPerEm = tables.head.view.getUint16(18);
  const metrics = tables.hhea.view.getUint16(34);
  const hmtx = tables.hmtx;
  const advance = (glyph: number) => {
    const g = Math.min(glyph, metrics - 1);
    // A transformed hmtx starts with a flags byte, then the advance widths alone.
    return hmtx.transformed ? hmtx.view.getUint16(1 + 2 * g) : hmtx.view.getUint16(4 * g);
  };
  const cmap = tables.cmap.view;
  let sub = -1;
  for (let i = 0; i < cmap.getUint16(2); i += 1) {
    const platform = cmap.getUint16(4 + 8 * i);
    const encoding = cmap.getUint16(6 + 8 * i);
    const at = cmap.getUint32(8 + 8 * i);
    if (platform === 3 && encoding === 1 && cmap.getUint16(at) === 4) sub = at;
  }
  expect(sub, "a Windows Unicode (3, 1) format 4 cmap").toBeGreaterThanOrEqual(0);
  const segX2 = cmap.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  const glyphOf = (c: number) => {
    for (let s = 0; s < segX2 / 2; s += 1) {
      if (c > cmap.getUint16(ends + 2 * s)) continue;
      const start = cmap.getUint16(starts + 2 * s);
      if (c < start) return 0;
      const delta = cmap.getInt16(deltas + 2 * s);
      const ro = cmap.getUint16(ranges + 2 * s);
      if (ro === 0) return (c + delta) & 0xffff;
      const gi = cmap.getUint16(ranges + 2 * s + ro + 2 * (c - start));
      return gi === 0 ? 0 : (gi + delta) & 0xffff;
    }
    return 0;
  };
  return { unitsPerEm, advanceOf: (c) => (glyphOf(c) ? advance(glyphOf(c)) : undefined) };
}

const FONTS = resolve(__dirname, "../../assets/fonts/saira-condensed");
/** Which file the browser asks for a character in (index.css's unicode-range for Saira 700). */
const latinRange = (c: number) => c <= 0xff || c === 0x131 || c === 0x152 || c === 0x153 || (c >= 0x2000 && c <= 0x206f);

describe("the width table is the font's own", () => {
  it("holds Saira Condensed 700's advance widths exactly, from the files index.css serves", () => {
    const latin = fontAdvances(resolve(FONTS, "saira-condensed-latin-700-normal.woff2"));
    const ext = fontAdvances(resolve(FONTS, "saira-condensed-latin-ext-700-normal.woff2"));
    expect(latin.unitsPerEm).toBe(SAIRA_UNITS_PER_EM);
    expect(ext.unitsPerEm).toBe(SAIRA_UNITS_PER_EM);
    // index.css still sends Saira 700 to those two files, with those ranges.
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/font-weight: 700;\n\s*src: url\("\.\/assets\/fonts\/saira-condensed\/saira-condensed-latin-ext-700-normal\.woff2"\) format\("woff2"\);\n\s*unicode-range: U\+0100-02BA,/);
    expect(css).toMatch(/font-weight: 700;\n\s*src: url\("\.\/assets\/fonts\/saira-condensed\/saira-condensed-latin-700-normal\.woff2"\) format\("woff2"\);\n\s*unicode-range: U\+0000-00FF, U\+0131, U\+0152-0153,/);
    const wrong: string[] = [];
    for (const [ch, units] of Object.entries(SAIRA_700_UNITS)) {
      const c = ch.codePointAt(0)!;
      const font = (latinRange(c) ? latin : ext).advanceOf(c);
      if (font !== units) wrong.push(`U+${c.toString(16)} ${ch}: table ${units}, font ${font}`);
    }
    expect(wrong).toEqual([]);
  });

  it("covers every letter a name is likely to hold", () => {
    const want = " -'’.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÉÍÑÓÖÜßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿĄĆĘŁŃŚŹŻąćęłńśźżŠšŽž";
    expect([...want].filter((ch) => SAIRA_700_UNITS[ch] === undefined)).toEqual([]);
  });

  it("adds up to what Chrome drew (headless Chrome, the vendored fonts, Oct 18 2026), within the slack", () => {
    const chrome: [string, number][] = [
      ["Zimmerman", 60.5625],
      ["Christopher", 58.328125],
      ["Underwood", 57.90625],
      ["Kaczmarek", 55.28125],
      ["Margaret", 47.28125],
      ["Hollingsworth", 71.40625],
      ["Szymanski-Abernathy", 112.046875],
      ["O'Shaughnessy", 77.28125],
      ["Łukasz", 34.734375],
      ["Wałęsa", 37.015625],
      ["Núñez", 31.75],
      // The two names the face kerns most, either way.
      ["Robert Martin", 71.484375],
      ["Steven Young", 67.96875],
    ];
    for (const [text, drawn] of chrome) {
      const table = narrowWidth(text);
      expect(table, text).toBeGreaterThan(drawn - FIT_SLACK_PX);
      expect(table, text).toBeLessThan(drawn + 1.5);
    }
  });

  it("counts the face's letter-spacing on every character, and a character it lacks as a whole em", () => {
    const f = NARROW_NAME_FACE;
    expect(narrowWidth("I")).toBeCloseTo((243 / 1000) * f.sizePx + f.letterSpacingEm * f.sizePx, 6);
    expect(narrowWidth("李")).toBeCloseTo(f.sizePx + f.letterSpacingEm * f.sizePx, 6);
    expect(narrowWidth("")).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Two lines, broken only where the browser breaks                     */
/* ------------------------------------------------------------------ */

describe("the least line that holds her name on two lines", () => {
  it("is the whole name when it fits one line, else the better of its two-line breaks", () => {
    expect(nameNeed("Ann Lee")).toBeCloseTo(narrowWidth("Ann"), 6);
    expect(nameNeed("Margaret Kaczmarek")).toBeCloseTo(narrowWidth("Kaczmarek"), 6);
    // "Mary / Ellen Noss" is narrower than "Mary Ellen / Noss": the better break wins.
    expect(nameNeed("Mary Ellen Noss")).toBeCloseTo(narrowWidth("Ellen Noss"), 6);
    expect(narrowWidth("Ellen Noss")).toBeLessThan(narrowWidth("Mary Ellen"));
    expect(nameNeed("Margaret")).toBeCloseTo(narrowWidth("Margaret"), 6);
    expect(nameNeed("")).toBe(0);
  });

  it("may break after a hyphen, as the browser does, keeping the hyphen on the first line", () => {
    expect(nameNeed("Szymanski-Abernathy")).toBeCloseTo(Math.max(narrowWidth("Szymanski-"), narrowWidth("Abernathy")), 6);
    expect(nameNeed("Mary Ellen Szymanski-Abernathy")).toBeCloseTo(narrowWidth("Szymanski-Abernathy"), 6);
    // Never inside a word, and never at an apostrophe.
    expect(nameNeed("O'Shaughnessy")).toBeCloseTo(narrowWidth("O'Shaughnessy"), 6);
    // A hyphen at an edge is no break.
    expect(nameNeed("-Ann")).toBeCloseTo(narrowWidth("-Ann"), 6);
  });

  it("counts a run of spaces once, as the browser draws it", () => {
    expect(nameNeed("  Ann   Lee ")).toBeCloseTo(nameNeed("Ann Lee"), 6);
  });
});

describe("the narrow lines her name is too long for (data-name-over)", () => {
  it("are every 2px from 60 to 138, the lines a narrow card can be given", () => {
    expect(NARROW_LINES[0]).toBe(60);
    expect(NARROW_LINES[NARROW_LINES.length - 1]).toBe(138);
    expect(NARROW_LINES.every((v, i) => i === 0 || v - NARROW_LINES[i - 1] === 2)).toBe(true);
    // The commonest: two to a slot in an upright 156px column (155 inside, 77.5 a lane, less 15.5).
    expect(NARROW_LINES).toContain(62);
  });

  it("says nothing for a name every narrow line holds", () => {
    for (const n of ["Ann Lee", "Margaret Kaczmarek", "Mary Ellen Noss", "Christopher Underwood", "José Núñez", "Łukasz Wałęsa"]) {
      expect(nameOverAttr(n), n).toBeUndefined();
    }
  });

  it("is over a line only with a pixel to spare", () => {
    // Zimmerman is 60.6px: it fits the commonest line, 62, and not the narrowest, 60.
    expect(nameOverLines("Christopher Zimmerman")).toEqual([60]);
    expect(nameOverAttr("Christopher Zimmerman")).toBe("60");
  });

  it("takes initials for the very long names (AJ, Oct 18 2026), only where the line is too short", () => {
    // One word wider than the line: it would break inside itself ("Hollings / worth").
    expect(nameOverAttr("Bartholomew Hollingsworth")).toBe("60 62 64 66 68 70 72");
    // Two lines can't hold it below 113px: a third line would push the time off a half-hour card.
    const long = nameOverLines("Mary Ellen Szymanski-Abernathy");
    expect(long[0]).toBe(60);
    expect(long[long.length - 1]).toBe(112);
    expect(long).toContain(96); // your column, upright with four trainers, two to a slot
    expect(long).not.toContain(122); // a 276px column sideways, two to a slot, holds it
    expect(nameOverAttr("Anne-Marie O'Shaughnessy")).toBe("60 62 64 66 68 70 72 74 76 78");
  });
});

/* ------------------------------------------------------------------ */
/* The 2,500 realistic names (the lanes round's study)                 */
/* ------------------------------------------------------------------ */

// The perf lab's seed (harness/perf-lab/seed.ts), 50 first names x 40 last names, and 10 x 50 common US names.
const FIRST = ["Margaret", "Linda", "Barbara", "Susan", "Karen", "Nancy", "Donna", "Carol", "Sandra", "Sharon", "Patricia", "Deborah", "Janet", "Diane", "Joyce", "Kathleen", "Cheryl", "Teresa", "Judith", "Christine", "Robert", "James", "John", "Michael", "William", "David", "Richard", "Thomas", "Charles", "Gary", "Larry", "Dennis", "Steven", "Kenneth", "Mark", "Paul", "Donald", "Jerry", "Ronald", "Frank", "Elena", "Priya", "Aisha", "Mei", "Sofia", "Hiroshi", "Mateo", "Omar", "Anika", "Tomasz"];
const LAST = ["Anderson", "Baker", "Carter", "Dawson", "Evans", "Fischer", "Garcia", "Hughes", "Iverson", "Jenkins", "Kowalski", "Lambert", "Morrison", "Novak", "O'Brien", "Patel", "Quinn", "Romano", "Sullivan", "Thompson", "Underwood", "Vasquez", "Whitfield", "Young", "Zimmerman", "Brennan", "Castellano", "Delaney", "Ellison", "Fitzgerald", "Gallagher", "Hollister", "Kaczmarek", "Lindqvist", "McAllister", "Nakamura", "Ostrowski", "Petrakis", "Reinholt", "Szymanski"];
const COMMON = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"];
const COMMON_FIRST = ["Mary", "Linda", "Susan", "Elizabeth", "Jennifer", "James", "John", "Robert", "Michael", "Christopher"];
const REALISTIC = [...FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)), ...COMMON_FIRST.flatMap((f) => COMMON.map((l) => `${f} ${l}`))];

describe("on the 2,500 realistic names", () => {
  it("none is too long for the commonest narrow line: every name stays whole two to a slot upright", () => {
    expect(REALISTIC).toHaveLength(2500);
    expect(REALISTIC.filter((n) => nameOverLines(n).includes(62))).toEqual([]);
  });

  it("only the fifty Zimmermans are too long for the narrowest, 60px", () => {
    const over = REALISTIC.filter((n) => nameOverAttr(n) !== undefined);
    expect(over).toHaveLength(50);
    expect(over.every((n) => n.endsWith(" Zimmerman") && nameOverAttr(n) === "60")).toBe(true);
  });

  it("no word of any is wider than the commonest line, so a card with no profile keeps its name whole there", () => {
    const words = [...new Set(REALISTIC.flatMap((n) => n.split(" ")))];
    expect(words.filter((w) => narrowWidth(w) + FIT_SLACK_PX > 62)).toEqual([]);
  });
});
