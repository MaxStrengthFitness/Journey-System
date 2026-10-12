/**
 * READING A FILEMAKER EXPORT: an Excel workbook or a CSV file, as rows of text.
 *
 * The FileMaker import round (Oct 12 2026). The developer sends one client at
 * a time today as Excel, and the full export may come as Excel, CSV or
 * FileMaker's "Merge" format (CSV with the field names on the first row).
 * Everything after this file works on the same thing: a table of strings,
 * the first row the column names.
 *
 * No library: the project has no Excel reader, and an .xlsx file is a ZIP of
 * a few XML files written by a program, regular enough to read directly. The
 * caller hands in the one thing a pure module cannot do itself, inflating a
 * compressed ZIP entry (Node's `zlib.inflateRawSync`).
 *
 * WHAT A CELL BECOMES
 *   - text stays text (shared strings, inline strings, formula results);
 *   - a number in a DATE-formatted cell becomes its day, "YYYY-MM-DD", read
 *     from Excel's serial number with no time zone involved (a serial is a
 *     calendar day, not an instant);
 *   - any other number stays as Excel wrote it ("70", "7.6");
 *   - an empty cell is null.
 *
 * CSV, the three FileMaker habits (docs/rounds/2026-10-12-filemaker-import.md):
 *   - a return typed inside a field comes out as a vertical tab (\x0B), and
 *     is turned back into a line break;
 *   - plain "Comma-Separated Text" has NO column names; such a file is
 *     refused with what to ask for, never read by position;
 *   - the encoding may be UTF-8 or Windows' own; UTF-8 is tried first.
 */

import Papa from "papaparse";

export type InflateRaw = (data: Uint8Array) => Uint8Array;
export type Table = (string | null)[][];

/* ------------------------------------------------------------------ *
 * ZIP
 * ------------------------------------------------------------------ */

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Every file in a ZIP archive, by name. Stored and deflated entries only (all an .xlsx uses). */
export function unzip(bytes: Uint8Array, inflateRaw: InflateRaw): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record: 22 bytes plus a comment of up to 65,535.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file is not a readable ZIP archive (no directory at the end).");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (at === 0xffffffff) throw new Error("This workbook is too large for this reader (ZIP64). Ask for CSV instead.");

  const out = new Map<string, Uint8Array>();
  const utf8 = new TextDecoder("utf-8");
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("This ZIP archive's directory is damaged.");
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`This ZIP archive's entry "${name}" is damaged.`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, inflateRaw(data));
    else throw new Error(`This ZIP archive uses a compression this reader doesn't know (method ${method}).`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * XML, only as much as a workbook needs
 * ------------------------------------------------------------------ */

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    // Excel's own escape for a control character inside a string: _x000D_.
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

/** The text of every <t> in a string item, phonetic runs (<rPh>) left out. */
function textOf(item: string): string {
  const visible = item.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of visible.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decodeXml(m[1] ?? "");
  return out;
}

/* ------------------------------------------------------------------ *
 * Workbook
 * ------------------------------------------------------------------ */

/** The built-in number formats that are dates (ECMA-376, 18.8.30). */
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** A custom format is a date when it has day, month or year letters outside quotes and brackets. */
export function isDateFormat(code: string): boolean {
  const bare = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "")
    .toLowerCase();
  if (/[dy]/.test(bare)) return true;
  // A month on its own ("mmm") is a date; minutes ("hh:mm", "mm:ss") are not.
  return /m/.test(bare.replace(/h+:?m+|m+:?s+/g, ""));
}

/** Excel's serial day number as "YYYY-MM-DD" (the 1900 system; serial 1 is 1900-01-01, with Excel's 1900 leap-day quirk). */
export function serialToDay(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const whole = Math.floor(serial);
  // Day 0 of the arithmetic is 1899-12-30, which absorbs the fictitious 1900-02-29 for every serial after it.
  const ms = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetPathOf(files: Map<string, Uint8Array>, read: (name: string) => string | null): string {
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const first = /<sheet\b[^>]*>/.exec(workbook)?.[0];
    const rid = first ? attr(first, "r:id") : null;
    if (rid) {
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        if (attr(m[0], "Id") !== rid) continue;
        const target = attr(m[0], "Target") ?? "";
        const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
        if (files.has(path)) return path;
      }
    }
  }
  const sheets = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  if (!sheets.length) throw new Error("This workbook has no sheet in it.");
  return sheets[0];
}

/** The first sheet of an .xlsx workbook, as rows of text. */
export function readWorkbook(bytes: Uint8Array, inflateRaw: InflateRaw): Table {
  const files = unzip(bytes, inflateRaw);
  const utf8 = new TextDecoder("utf-8");
  const read = (name: string): string | null => {
    const f = files.get(name);
    return f ? utf8.decode(f) : null;
  };

  // Shared strings, in order; a self-closing <si/> is an empty string and still takes its place.
  const shared: string[] = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(textOf(m[1] ?? ""));

  const dateStyles = new Set<number>();
  const styles = read("xl/styles.xml");
  if (styles) {
    const custom = new Map<number, string>();
    for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) {
      const id = Number(attr(m[0], "numFmtId"));
      const code = attr(m[0], "formatCode") ?? "";
      if (Number.isFinite(id)) custom.set(id, code);
    }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
    let i = 0;
    for (const m of xfs.matchAll(/<xf\b[^>]*>/g)) {
      const id = Number(attr(m[0], "numFmtId") ?? "0");
      if (BUILT_IN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) dateStyles.add(i);
      i += 1;
    }
  }

  const sheet = read(sheetPathOf(files, read));
  if (!sheet) throw new Error("This workbook's sheet could not be read.");
  const table: Table = [];
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(row[1], "r"));
    const cells: (string | null)[] = [];
    let next = 0;
    for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const type = attr(c[1], "t");
      const style = Number(attr(c[1], "s") ?? "0");
      const body = c[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: string | null = null;
      if (type === "s") value = v === undefined ? null : shared[Number(v)] ?? null;
      else if (type === "inlineStr") value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "b") value = v === undefined ? null : v === "1" ? "TRUE" : "FALSE";
      else if (type === "e") value = null;
      else if (v !== undefined) {
        const raw = decodeXml(v);
        value = type !== "str" && dateStyles.has(style) && raw.trim() !== "" && Number.isFinite(Number(raw))
          ? serialToDay(Number(raw)) ?? raw
          : raw;
      }
      while (cells.length < index) cells.push(null);
      cells[index] = value === "" ? null : value;
    }
    // Rows Excel skipped (no cells at all) keep their place, so a row number in a report is the sheet's.
    if (Number.isFinite(rowNumber) && rowNumber > 0) while (table.length < rowNumber - 1) table.push([]);
    table.push(cells);
  }
  return table;
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** Text from a CSV file's bytes: UTF-8 when it is valid UTF-8, else Windows' own encoding. */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^\uFEFF/, "");
}

/** A CSV (or tab, or FileMaker Merge) file's text as rows. FileMaker's in-field returns come back as line breaks. */
export function readDelimited(text: string): Table {
  const parsed = Papa.parse<string[]>(text, { delimiter: "", skipEmptyLines: "greedy" });
  return parsed.data.map((row) =>
    row.map((cell) => {
      const v = String(cell ?? "").replace(/\u000b/g, "\n");
      return v.trim() === "" ? null : v;
    }),
  );
}

/** Any export, by what its bytes are rather than what its name says. */
export function readTable(bytes: Uint8Array, inflateRaw: InflateRaw): Table {
  if (isZip(bytes)) return readWorkbook(bytes, inflateRaw);
  return readDelimited(decodeText(bytes));
}
