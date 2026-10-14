/**
 * WHICH JOURNEY MACHINE IS FILEMAKER'S "Comp. Row" AT THIS STUDIO?
 *
 * Each studio named its own machines in FileMaker (Oct 12 2026 samples):
 * Solon writes "Chest Fly" and "Leg Press", Strongsville "Chest fly",
 * "Leg Press Imag." and "Leg Press Hoist" (two different leg presses). So the
 * answer is a table per studio, and a PERSON settles it, once: the import
 * suggests what it can and never guesses between two of a studio's units.
 *
 * The table is a CSV a person can open in Excel (the import writes a draft):
 *
 *   Studio, Studio name, Client, Client name, FileMaker machine,
 *   Journey machine, From, Until, Uses, First used, Last used, Suggested, Note
 *
 *   - "Studio" is the Journey studio's id (the client's home studio); "Studio
 *     name" is only there for the person reading it.
 *   - "Client" (usually blank) is a Journey client's id when a row is for
 *     that one client: FileMaker names one client's machines differently
 *     from the rest of the studio, or names them wrongly for a stretch of
 *     days. Allan Boike's export (Oct 13 2026) put "Abs" on his Chest Fly and
 *     six other names on the wrong machines from Aug 24 2024 on; the chart
 *     was right. A client's row wins over the studio's on the days it
 *     claims; on any other day the studio's row answers. "Client name" is
 *     only for the person reading it.
 *
 *   - "Journey machine" is the machine's id on that studio's floor (the
 *     roster's id, which is the catalog id for a standard unit). Blank means
 *     not settled yet: those entries are held back. "skip" means never
 *     import that FileMaker name.
 *   - "From" / "Until" (optional, YYYY-MM-DD) split one FileMaker name into
 *     two Journey machines when the studio replaced it. One Strongsville
 *     client's Pullover went
 *     72 → 24, her Abs 62 → 22 and her Overhead 28 → 50 on one day in
 *     October 2024 and stayed there: one name, two machines, and the old
 *     history must not read as a collapse on the new one.
 *
 * Suggestions come from Journey's own names for the twenty movements
 * (catalog/names.ts, which already knows FileMaker's spellings). A name that
 * is a movement's name plus more ("Leg Press Imag.") is suggested only when
 * the studio has ONE unit of that movement, and says so in the note.
 */

import Papa from "papaparse";
import { MOVEMENTS, normaliseName } from "../catalog/names";
import { SKIP } from "./plan";
import { parseDay } from "./records";

/** A machine on a studio's floor, as the import sees it. */
export interface FloorUnit {
  id: string;
  name: string;
  /** The catalog movement it is or is based on ("m-leg-press"), when known. */
  movement: string | null;
}

export interface MapRow {
  studio: string;
  /**
   * A Journey client's id (`clients/{id}`) when the row is that one client's:
   * it wins over the studio's row for the same name on the days it claims.
   * Absent or null, the row is for everyone at the studio.
   */
  client?: string | null;
  fmName: string;
  machineId: string | null;
  from: string | null;
  until: string | null;
  uses: number;
  firstUsed: string | null;
  lastUsed: string | null;
  suggested: string | null;
  note: string | null;
}

const HEADERS = [
  "Studio",
  "Studio name",
  "Client",
  "Client name",
  "FileMaker machine",
  "Journey machine",
  "From",
  "Until",
  "Uses",
  "First used",
  "Last used",
  "Suggested",
  "Note",
] as const;

/** The catalog movement a FileMaker name is, and whether the name says more than the movement. */
export function movementOfName(fmName: string): { movement: string; exact: boolean } | null {
  const key = normaliseName(fmName);
  if (!key) return null;
  for (const m of Object.values(MOVEMENTS)) if (m.exact.includes(key)) return { movement: m.id, exact: true };
  // The longest movement name the FileMaker name starts with, whole words: "leg press imag" → leg press,
  // "overhead sss" → overhead.
  let best: { movement: string; length: number } | null = null;
  for (const m of Object.values(MOVEMENTS)) {
    for (const name of m.exact) {
      if (key.startsWith(`${name} `) && (!best || name.length > best.length)) {
        best = { movement: m.id, length: name.length };
      }
    }
  }
  return best ? { movement: best.movement, exact: false } : null;
}

/**
 * The suggestion for one FileMaker name on one studio's floor, with why.
 * `sure` is true only for a name that IS the unit (the same name on the
 * floor, or the movement's own name with one unit of it): the draft fills
 * those in, and leaves every other suggestion for a person to copy across.
 */
export function suggest(fmName: string, floor: readonly FloorUnit[]): { machineId: string | null; sure: boolean; note: string } {
  const key = normaliseName(fmName);
  const byName = floor.filter((u) => normaliseName(u.name) === key);
  if (byName.length === 1) return { machineId: byName[0].id, sure: true, note: "Same name on the floor" };

  const found = movementOfName(fmName);
  if (!found) return { machineId: null, sure: false, note: "No Journey machine has this name: choose one" };
  const units = floor.filter((u) => u.movement === found.movement);
  const movementName = MOVEMENTS[found.movement]?.name ?? found.movement;
  if (units.length === 1) {
    return found.exact
      ? { machineId: units[0].id, sure: true, note: movementName }
      : { machineId: units[0].id, sure: false, note: `${movementName}: the studio's only one. If "${fmName}" is that unit, copy the suggestion across` };
  }
  if (units.length > 1) {
    return { machineId: null, sure: false, note: `${movementName}: the studio has ${units.length} (${units.map((u) => `${u.name} = ${u.id}`).join("; ")}). Choose one` };
  }
  return { machineId: null, sure: false, note: `${movementName}: not on this studio's floor. Add it to the floor, or choose another` };
}

/** The key of the rows that could claim a FileMaker name: studio, client (blank for the studio's own) and the name's normal form. */
const rowKey = (studio: string, client: string | null | undefined, fmName: string) => `${studio}\u0000${client ?? ""}\u0000${normaliseName(fmName)}`;

/** The rows that could claim a FileMaker name, by studio, client and the name's normal form. */
function indexRows(rows: readonly MapRow[]): Map<string, MapRow[]> {
  const index = new Map<string, MapRow[]>();
  for (const r of rows) {
    const key = rowKey(r.studio, r.client, r.fmName);
    (index.get(key) ?? index.set(key, []).get(key)!).push(r);
  }
  return index;
}

const claimsDay = (r: MapRow, day: string) => (!r.from || day >= r.from) && (!r.until || day <= r.until);

/** The draft table for what the files hold: one row per studio and FileMaker name, with the uses and a suggestion. */
export function draftMap(
  seen: readonly { studio: string; fmName: string; day: string; client?: string | null }[],
  floors: ReadonlyMap<string, readonly FloorUnit[]>,
  existing: readonly MapRow[] = [],
): MapRow[] {
  // What a person already wrote stays exactly as written, every row of it (two
  // rows that disagree are the person's to see, not the draft's to merge); uses refreshed.
  const rows: MapRow[] = existing.map((r) => ({ ...r, uses: 0, firstUsed: null, lastUsed: null }));
  const index = indexRows(rows);
  for (const { studio, fmName, day, client } of seen) {
    // A use counts on the client's own row when one claims the day, else on the studio's.
    const own = client ? (index.get(rowKey(studio, client, fmName)) ?? []).find((r) => claimsDay(r, day)) : undefined;
    const key = rowKey(studio, null, fmName);
    const settled = index.get(key) ?? [];
    const target = own ?? settled.find((r) => claimsDay(r, day)) ?? settled[0];
    if (target) {
      target.uses += 1;
      if (!target.firstUsed || day < target.firstUsed) target.firstUsed = day;
      if (!target.lastUsed || day > target.lastUsed) target.lastUsed = day;
      continue;
    }
    const s = suggest(fmName, floors.get(studio) ?? []);
    const row: MapRow = {
      studio,
      fmName,
      machineId: s.sure ? s.machineId : null,
      from: null,
      until: null,
      uses: 1,
      firstUsed: day,
      lastUsed: day,
      suggested: s.machineId,
      note: s.note,
    };
    rows.push(row);
    index.set(key, [row]);
  }
  // The studio's own rows first, then each client's.
  return rows.sort((a, b) => a.studio.localeCompare(b.studio) || (a.client ?? "").localeCompare(b.client ?? "") || b.uses - a.uses || a.fmName.localeCompare(b.fmName));
}

/**
 * The table as CSV. `studioNames` and `clientNames` only label the rows for a
 * person; "Studio" and "Client" (the ids) are what is read back.
 */
export function mapToCsv(
  rows: readonly MapRow[],
  studioNames: ReadonlyMap<string, string> = new Map(),
  clientNames: ReadonlyMap<string, string> = new Map(),
): string {
  return Papa.unparse({
    fields: [...HEADERS],
    data: rows.map((r) => [
      r.studio,
      studioNames.get(r.studio) ?? "",
      r.client ?? "",
      r.client ? clientNames.get(r.client) ?? "" : "",
      r.fmName,
      r.machineId ?? "",
      r.from ?? "",
      r.until ?? "",
      r.uses,
      r.firstUsed ?? "",
      r.lastUsed ?? "",
      r.suggested ?? "",
      r.note ?? "",
    ]),
  });
}

/**
 * A table a person edited. Rows without a studio or a FileMaker name are
 * ignored. A date that isn't a real day is a problem, never a guess (a row
 * whose date was dropped would claim every day). "skip" in any capitals is skip.
 */
export function mapFromCsv(text: string): { rows: MapRow[]; problems: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy" });
  const problems: string[] = [];
  const rows: MapRow[] = [];
  const cell = (r: Record<string, string>, h: string) => {
    const v = String(r[h] ?? "").trim();
    return v ? v : null;
  };
  const day = (v: string | null, line: number, label: string) => {
    if (!v) return null;
    const read = parseDay(v);
    if (read.value && !/T/.test(v)) return read.value;
    problems.push(`Line ${line}: "${label}" should be a real day like 2024-10-14 (it says "${v}")`);
    return null;
  };
  parsed.data.forEach((r, i) => {
    const studio = cell(r, "Studio");
    const fmName = cell(r, "FileMaker machine");
    if (!studio || !fmName) return;
    const machine = cell(r, "Journey machine");
    const row: MapRow = {
      studio,
      client: cell(r, "Client"),
      fmName,
      machineId: machine && machine.toLowerCase() === SKIP ? SKIP : machine,
      from: day(cell(r, "From"), i + 2, "From"),
      until: day(cell(r, "Until"), i + 2, "Until"),
      uses: Number(cell(r, "Uses") ?? 0) || 0,
      firstUsed: cell(r, "First used"),
      lastUsed: cell(r, "Last used"),
      suggested: cell(r, "Suggested"),
      note: cell(r, "Note"),
    };
    if (row.from && row.until && row.from > row.until) problems.push(`Line ${i + 2}: "From" ${row.from} is after "Until" ${row.until}`);
    rows.push(row);
  });
  return { rows, problems };
}

/**
 * What is wrong with a table before anything is imported with it: a Journey
 * machine that isn't on that studio's floor (a typo would be written into
 * every set), and two rows that both claim one FileMaker name on some day.
 */
export function tableProblems(rows: readonly MapRow[], onFloor: (studio: string, machineId: string) => boolean): string[] {
  const problems: string[] = [];
  const where = (r: MapRow) => (r.client ? `${r.studio}, client ${r.client}` : r.studio);
  for (const r of rows) {
    if (r.machineId && r.machineId !== SKIP && !onFloor(r.studio, r.machineId)) {
      problems.push(`${r.fmName} (${where(r)}): "${r.machineId}" is not a machine on that studio's floor`);
    }
  }
  // A client's row may claim the studio row's days (that is what it is for); two rows of the same kind may not.
  for (const group of indexRows(rows.filter((r) => r.machineId)).values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        const overlap = (!a.until || !b.from || b.from <= a.until) && (!b.until || !a.from || a.from <= b.until);
        if (overlap) problems.push(`${a.fmName} (${where(a)}): two rows claim the same days ("${a.machineId}" and "${b.machineId}"); give them From and Until`);
      }
    }
  }
  return problems;
}

/**
 * The Journey machine for a FileMaker name at a studio on a day, for a client:
 * its id, "skip", or null when nobody has settled it (the entry is held back).
 * The client's own row answers on the days it claims; otherwise the studio's.
 * Built once over the table, then a lookup per entry.
 */
export function machineResolver(rows: readonly MapRow[]): (studio: string, fmName: string, day: string, client?: string | null) => string | null {
  const index = indexRows(rows);
  const claiming = (key: string, day: string) => (index.get(key) ?? []).filter((r) => claimsDay(r, day));
  return (studio, fmName, day, client) => {
    // Two rows that both claim the day are a mistake in the table: nobody's guess wins. A client's
    // row with no Journey machine yet holds the entry back; it never falls through to the studio's.
    const own = client ? claiming(rowKey(studio, client, fmName), day) : [];
    if (own.length) return own.length === 1 ? own[0].machineId : null;
    const settled = claiming(rowKey(studio, null, fmName), day).filter((r) => r.machineId);
    return settled.length === 1 ? settled[0].machineId : null;
  };
}
