/**
 * FROM ROWS TO RECORDS: which column is which, and what each cell says.
 *
 * Two kinds of file come out of FileMaker:
 *
 *   - the CLIENT PROFILE, one row per client (228 columns in the Oct 12 2026
 *     samples). Journey reads a handful: FileMaker's own client id, the
 *     Mindbody client id and site (how Journey finds her), FileMaker's studio
 *     id, her name (to show a person, never to match), the standing note,
 *     FileMaker's workout count and her first appointment. The `JSON` column
 *     is Mindbody's whole record, card details included: it is never read.
 *
 *   - the WORKOUT LINES, one row per machine per visit: the day, the machine
 *     as FileMaker names it, the order it was done in, and three numbers.
 *
 * THE TWO SWAPPED NAMES (checked on a sample client's chart, Oct 12 2026:
 * Hip ADD on 9/2 reads "56" over "9  60"). FileMaker's `NextSet` field holds the REPS
 * done and its `Reps` field holds the weight set for NEXT time. The export
 * is right; only the names mislead. This file is the one place that knows.
 *
 * A column is found by its name with the table prefix dropped
 * ("workoutlines|Workouts::DateofWorkout" is DateofWorkout), ignoring case,
 * spaces and underscores, so the full export may spell a header a little
 * differently and still be read. A file without the column names on its
 * first row is refused (files.ts).
 */

export type FileKind = "profile" | "workouts";

/** "workoutlines|Workouts::DateofWorkout" → "dateofworkout". */
export function columnKey(header: string | null | undefined): string {
  const tail = String(header ?? "").split("::").pop() ?? "";
  return tail.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PROFILE_COLUMNS = {
  fmClientId: ["idclient"],
  mindbodyClientId: ["mindbodyid", "mindbodyclientid"],
  siteId: ["siteid", "mindbodysiteid"],
  fmStudioId: ["idfranchise"],
  name: ["namefull"],
  firstName: ["namefirst"],
  lastName: ["namelast"],
  workoutNotes: ["workoutnotes"],
  workoutCount: ["workoutcount"],
  firstAppointment: ["firstappt"],
  homeLocation: ["mbhomelocation"],
} as const;

const WORKOUT_COLUMNS = {
  day: ["dateofworkout", "workoutdate"],
  fmClientId: ["idclient"],
  name: ["namefull"],
  machine: ["machinename"],
  order: ["workoutorder"],
  // The swap: FileMaker's NextSet is the reps, its Reps is next time's weight.
  reps: ["nextset"],
  nextWeight: ["reps"],
  weight: ["weight"],
  trainer: ["trainer", "trainerinitials", "initials"],
  note: ["note", "notes", "linenote", "workoutlinenote", "workoutnote"],
} as const;

const NEVER_READ = new Set(["json"]);

function locate<T extends Record<string, readonly string[]>>(headers: readonly string[], spec: T) {
  const found: Partial<Record<keyof T, number>> = {};
  for (const [role, names] of Object.entries(spec) as [keyof T, readonly string[]][]) {
    const i = headers.findIndex((h) => names.includes(h));
    if (i >= 0) found[role] = i;
  }
  return found;
}

/** Which kind of file a header row belongs to, or null when it is neither. */
export function fileKindOf(header: readonly (string | null)[]): FileKind | null {
  const keys = header.map(columnKey);
  if (keys.includes("dateofworkout") || keys.includes("machinename")) return "workouts";
  if (keys.includes("namefull") && (keys.includes("idclient") || keys.includes("mindbodyid"))) return "profile";
  return null;
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

export type Parsed<T> = { value: T | null; problem?: string };

/**
 * A calendar day as "YYYY-MM-DD". Accepts the workbook reader's day, a
 * FileMaker CSV date ("10/9/2026", month first as the studios write it), an
 * ISO date-time (its day as written, no zone applied) and a bare Excel serial.
 * A two-digit year is refused: it loses the century.
 */
export function parseDay(raw: string | null | undefined): Parsed<string> {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null };
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000;
    return { value: new Date(ms).toISOString().slice(0, 10) };
  } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) return { value: null, problem: `a two-digit year ("${s}")` };
  else return { value: null, problem: `not a date ("${s}")` };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { value: null, problem: `not a real day ("${s}")` };
  }
  return { value: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/**
 * A number as FileMaker wrote it. A comma is read only as a thousands mark
 * ("1,220" is 1220): "7,6" may be a European 7.6 or two counts, so it is a
 * problem, never 76. Blank is null; anything else that isn't a plain decimal
 * number (hex, percent, a unit) is a problem too.
 */
export function parseNumber(raw: string | null | undefined): Parsed<number> {
  const typed = String(raw ?? "").trim();
  if (!typed) return { value: null };
  const s = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(typed) ? typed.replace(/,/g, "") : typed;
  const n = /^-?(\d+(\.\d*)?|\.\d+)(e-?\d+)?$/i.test(s) ? Number(s) : NaN;
  if (!Number.isFinite(n)) return { value: null, problem: `not a number ("${typed}")` };
  // Excel's binary floats ("7.6000000000000005") back to what was typed.
  return { value: Math.round(n * 1e6) / 1e6 };
}

/** A machine's name with any stray space, tab or typed return made one space ("Leg Press Hoist\n"). */
export function tidyName(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/[\s\u00a0]+/g, " ").trim();
}

function text(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  return s ? s : null;
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

export interface ProfileRecord {
  file: string;
  row: number;
  fmClientId: string | null;
  mindbodyClientId: string | null;
  siteId: string | null;
  fmStudioId: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  workoutNotes: string | null;
  workoutCount: number | null;
  firstAppointment: string | null;
  homeLocation: string | null;
}

export interface WorkoutLine {
  file: string;
  /** The sheet's row number, 1 being the column names. */
  row: number;
  fmClientId: string | null;
  name: string | null;
  day: string | null;
  machine: string;
  order: number | null;
  weight: number | null;
  reps: number | null;
  nextWeight: number | null;
  trainer: string | null;
  note: string | null;
  /** Cells that could not be read, by column. */
  problems: string[];
}

export interface ReadFile<R> {
  kind: FileKind;
  records: R[];
  /** Columns the file has that this import does not use (JSON left out). */
  unused: string[];
  /** Columns it expected and did not find. */
  missing: string[];
}

function unusedColumns(header: readonly (string | null)[], used: Set<number>): string[] {
  return header
    .map((h, i) => ({ h: String(h ?? "").split("::").pop() ?? "", i }))
    .filter(({ h, i }) => h && !used.has(i) && !NEVER_READ.has(columnKey(h)))
    .map(({ h }) => h);
}

export function readProfiles(table: (string | null)[][], file: string): ReadFile<ProfileRecord> {
  const header = table[0] ?? [];
  const at = locate(header.map(columnKey), PROFILE_COLUMNS);
  const get = (row: (string | null)[], role: keyof typeof PROFILE_COLUMNS) => {
    const i = at[role];
    return i === undefined ? null : row[i] ?? null;
  };
  const records: ProfileRecord[] = [];
  table.slice(1).forEach((row, n) => {
    if (!row.some((c) => c !== null && String(c).trim() !== "")) return;
    records.push({
      file,
      row: n + 2,
      fmClientId: text(get(row, "fmClientId")),
      mindbodyClientId: text(get(row, "mindbodyClientId")),
      siteId: text(get(row, "siteId")),
      fmStudioId: text(get(row, "fmStudioId")),
      name: text(get(row, "name")),
      firstName: text(get(row, "firstName")),
      lastName: text(get(row, "lastName")),
      workoutNotes: text(get(row, "workoutNotes")),
      workoutCount: parseNumber(get(row, "workoutCount")).value,
      firstAppointment: parseDay(get(row, "firstAppointment")).value,
      homeLocation: text(get(row, "homeLocation")),
    });
  });
  const required: (keyof typeof PROFILE_COLUMNS)[] = ["fmClientId", "mindbodyClientId", "siteId", "name"];
  return {
    kind: "profile",
    records,
    unused: [],
    missing: required.filter((r) => at[r] === undefined).map(String),
  };
}

export function readWorkoutLines(table: (string | null)[][], file: string): ReadFile<WorkoutLine> {
  const header = table[0] ?? [];
  const at = locate(header.map(columnKey), WORKOUT_COLUMNS);
  const get = (row: (string | null)[], role: keyof typeof WORKOUT_COLUMNS) => {
    const i = at[role];
    return i === undefined ? null : row[i] ?? null;
  };
  const records: WorkoutLine[] = [];
  table.slice(1).forEach((row, n) => {
    if (!row.some((c) => c !== null && String(c).trim() !== "")) return;
    const problems: string[] = [];
    const num = (role: "order" | "weight" | "reps" | "nextWeight", label: string) => {
      const p = parseNumber(get(row, role));
      if (p.problem) problems.push(`${label}: ${p.problem}`);
      return p.value;
    };
    const day = parseDay(get(row, "day"));
    if (day.problem) problems.push(`date: ${day.problem}`);
    records.push({
      file,
      row: n + 2,
      fmClientId: text(get(row, "fmClientId")),
      name: text(get(row, "name")),
      day: day.value,
      machine: tidyName(get(row, "machine")),
      order: num("order", "order"),
      weight: num("weight", "weight"),
      reps: num("reps", "reps"),
      nextWeight: num("nextWeight", "next time's weight"),
      trainer: text(get(row, "trainer")),
      note: text(get(row, "note")),
      problems,
    });
  });
  const required: (keyof typeof WORKOUT_COLUMNS)[] = ["day", "machine", "order", "weight", "reps", "nextWeight"];
  return {
    kind: "workouts",
    records,
    unused: unusedColumns(header, new Set(Object.values(at) as number[])),
    missing: required.filter((r) => at[r] === undefined).map(String),
  };
}
