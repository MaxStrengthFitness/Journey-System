import { describe, expect, it } from "vitest";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { decodeText, isDateFormat, readDelimited, readTable, readWorkbook, serialToDay, unzip } from "./files";

const inflate = (b: Uint8Array) => new Uint8Array(inflateRawSync(b));
const enc = new TextEncoder();

/** A ZIP archive built by hand: each entry stored, or deflated when asked. CRCs are not checked by the reader. */
function zip(entries: Record<string, string>, deflate = false): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A workbook shaped like FileMaker's: shared strings, a date style (164, mm/dd/yyyy), and a text style. */
function workbook(sheet: string, deflate = false): Uint8Array {
  return zip(
    {
      "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>DateofWorkout</t></si><si><t>MachineName</t></si><si><t>Comp. Row</t></si><si/><si><r><t>Chest </t></r><r><t>fly</t></r><rPh><t>x</t></rPh></si><si><t xml:space="preserve">A &amp; B_x000D_</t></si></sst>`,
      "xl/styles.xml": `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="49"/></cellXfs></styleSheet>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
    },
    deflate,
  );
}

describe("reading a FileMaker workbook", () => {
  const sheet =
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
    `<row r="2"><c r="A2" s="1"><v>46073</v></c><c r="B2" s="2" t="s"><v>2</v></c><c r="D2" s="0"><v>70</v></c><c r="E2" s="0"/></row>` +
    `<row r="4"><c r="A4" s="1"><v>46077.5</v></c><c r="B4" t="s"><v>4</v></c><c r="C4" t="inlineStr"><is><t>inline</t></is></c><c r="D4"><v>7.6</v></c></row>` +
    `<row r="5"><c r="B5" t="s"><v>5</v></c><c r="C5" t="s"><v>3</v></c></row>`;

  it("reads text, numbers, dates in a date style, and empty cells", () => {
    const rows = readWorkbook(workbook(sheet), inflate);
    expect(rows[0]).toEqual(["DateofWorkout", "MachineName"]);
    // A date-styled number is its calendar day; a plain number stays as written; an empty cell is null.
    expect(rows[1]).toEqual(["2026-02-20", "Comp. Row", null, "70", null]);
  });

  it("keeps a skipped row's place, so a report's row number is the sheet's", () => {
    const rows = readWorkbook(workbook(sheet), inflate);
    expect(rows[2]).toEqual([]);
    expect(rows[3]).toEqual(["2026-02-24", "Chest fly", "inline", "7.6"]);
  });

  it("joins rich text runs, leaves phonetic runs out, decodes entities and Excel's _x000D_", () => {
    const rows = readWorkbook(workbook(sheet), inflate);
    expect(rows[3][1]).toBe("Chest fly");
    expect(rows[4][0]).toBe(null);
    expect(rows[4][1]).toBe("A & B\r");
    // An empty shared string still takes its place in the list.
    expect(rows[4][2]).toBe(null);
  });

  it("reads deflated entries the same as stored ones", () => {
    expect(readWorkbook(workbook(sheet, true), inflate)).toEqual(readWorkbook(workbook(sheet), inflate));
  });

  it("tells a workbook from a CSV by its bytes, not its name", () => {
    expect(readTable(workbook(sheet), inflate)[1][0]).toBe("2026-02-20");
    expect(readTable(enc.encode("a,b\n1,2\n"), inflate)).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("refuses a file that is not a ZIP archive, in words", () => {
    expect(() => unzip(enc.encode("PK\u0003\u0004 not really"), inflate)).toThrow(/not a readable ZIP/);
  });
});

describe("dates", () => {
  it("turns Excel's serial day into the calendar day", () => {
    expect(serialToDay(46073)).toBe("2026-02-20");
    expect(serialToDay(18353)).toBe("1950-03-31");
    expect(serialToDay(46080.99)).toBe("2026-02-27");
    expect(serialToDay(0)).toBe(null);
  });

  it("knows a date format from a number format", () => {
    for (const f of ["mm/dd/yyyy", "mm/dd/yyyy\\ hh:mm:ss", "d-mmm-yy", "[$-409]mmmm d, yyyy", "mmm"]) expect(isDateFormat(f)).toBe(true);
    for (const f of ["General", "0.00", "#,##0", "hh:mm", "mm:ss", '"day"0', "@"]) expect(isDateFormat(f)).toBe(false);
  });
});

describe("reading a CSV export", () => {
  it("turns FileMaker's in-field return (a vertical tab) back into a line break", () => {
    const rows = readDelimited('NameFull,WorkoutNotes\n"Test Client","Left shoulder\u000bbe wary, chest fly"\n');
    expect(rows[1]).toEqual(["Test Client", "Left shoulder\nbe wary, chest fly"]);
  });

  it("reads tab-separated exports too, and drops blank lines", () => {
    expect(readDelimited("a\tb\n\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("reads UTF-8, and Windows' own encoding when the bytes are not UTF-8", () => {
    expect(decodeText(enc.encode("\uFEFFCafé"))).toBe("Café");
    expect(decodeText(new Uint8Array([0x54, 0x65, 0x73, 0x74, 0x92, 0x73]))).toBe("Test’s");
  });
});
