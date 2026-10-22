/**
 * THE FILEMAKER IMPORT — a client's FileMaker history into Journey.
 *
 * The FileMaker import round (Oct 12 2026, docs/rounds/2026-10-12-filemaker-
 * import.md). AJ: "build a migration tool that works with our current files".
 * The pure half is src/features/filemaker-import/ (read its README first);
 * this file only reads files, reads and writes Firestore, and prints.
 *
 * WHAT IT READS: FileMaker's exports, Excel or CSV, any mix of
 *   - client profiles (one row per client: FileMaker's id, and the Mindbody
 *     id and site Journey finds the client by), and
 *   - workout lines (one row per machine per visit).
 * Today's files carry one client each and no client id on the workout lines,
 * so a workouts file is paired with the ONE profile in the run that has the
 * same FileMaker name (FileMaker's own two halves of one export, never a
 * lookup in Journey: Journey finds the client by Mindbody id and site only,
 * and the report prints Journey's name beside FileMaker's to check). The full
 * export adds __ID_Client to the lines and the pairing uses that.
 *
 * SAFETY MODEL (the house pattern: scripts/onboard-studio.ts, reset-test-data.ts)
 *   - DRY RUN BY DEFAULT. It reads the files and Journey, prints what it
 *     would write and everything it found wrong with the data, and writes
 *     two files to backups/filemaker/: the report (JSON, names in it, which
 *     is why backups/ is gitignored) and the MACHINE TABLE, a CSV to open in
 *     Excel and finish (which Journey machine each FileMaker name is).
 *   - --commit WRITES, and only with --expect N, N being the dry run's count
 *     of sessions to write; anything else stops before a write.
 *   - PRODUCTION WRITES ARE SWITCHED OFF in this round (PRODUCTION_IMPORT_
 *     READY below; the round document's §6 says what must come first). Until
 *     then --commit writes to the Firestore EMULATOR (--emulator), or a
 *     TRIAL of at most five clients to the real database (--trial; lock.ts).
 *   - EVERY ID IS DERIVED (plan.ts): a second run writes nothing it already
 *     wrote. Sessions are written in batches of whole visits, each batch in
 *     ONE TRANSACTION with the client's counts, machine totals and settings,
 *     read in the same transaction: a stop leaves either all of a batch or
 *     none of it, never sessions without their counts.
 *   - A CLIENT IS LEFT OUT, and said, when Journey already holds sessions of
 *     its own for the client (the numbers would clash: import before the
 *     first Journey session, after the pre-launch reset), when sessions it
 *     imported before are no longer in the export, or when the numbering has
 *     moved since an earlier run.
 *   - THE MACHINE TABLE IS CHECKED before anything is planned: every Journey
 *     machine in it must be on that studio's floor (for the studios in this
 *     run), and no two rows may claim one FileMaker name on the same day. A
 *     machine nobody has matched makes its client wait whole (--allow-waiting
 *     writes the other clients now).
 *
 * USAGE (PowerShell, from the project folder; it needs service-account.json
 * like the other data scripts, except against the emulator)
 *   npx tsx scripts/import-filemaker.ts "C:\Users\austi\Downloads\ClientProfile.xlsx" "C:\Users\austi\Downloads\ClientWorkouts.xlsx"
 *   npx tsx scripts/import-filemaker.ts <files or a folder> --map backups\filemaker\machine-table.csv --through 2026-10-11
 *
 *   The rehearsal, on a Firestore emulator of its own (nothing real is touched):
 *   npx firebase emulators:exec --only firestore --project demo-fm-import "npx tsx scripts/import-filemaker.ts <files> --emulator --seed-emulator --map <table> --through 2026-10-11 --commit --expect N"
 *   On Windows the emulator's Java process can outlive emulators:exec and hold port 8080: stop it before the next run.
 *
 * RELABEL (--relabel; Oct 14 2026, after Allan Boike's trial import put his
 * weights on the wrong machines because FileMaker's export named them wrongly
 * from Aug 24 2024): give the machine table the client's own rows (a
 * "Client" column, machine-map.ts) and run the same files with --relabel. It
 * plans the visits twice, with the studio's rows (what the import wrote) and
 * with the client's rows too (what it should have written), and moves each
 * imported set to its right machine. It never creates or deletes a visit,
 * never changes a set's numbers, leaves alone any visit someone edited or
 * whose sets are not exactly what the import wrote, and keeps every weight
 * a person or Journey's own sessions set (relabel.ts). Then it works out the
 * client's machine totals again from every session. A client with Journey
 * sessions of its own is fine here (they come after the imported days). It
 * saves what it will change to backups/filemaker/ first. Dry run by default;
 * --commit --expect N (N the visits to change), --trial on the real database.
 * A client imported with an older table (Lynne Koszkalda, Oct 12, before the
 * Hoist leg press had a machine): --relabel-from <that table>, so the plan of
 * what was written is the one that was written.
 *   npx tsx scripts/import-filemaker.ts <profile> <workouts> --map <table with the client's rows> --through 2026-10-11 --relabel
 *
 * Flags: --map <csv>, --through YYYY-MM-DD (the last day to import; default
 * the day before the client's home studio's switch-over day, and a dry run
 * with neither uses yesterday), --commit, --expect N, --allow-waiting,
 * --verify (reads back what is in Journey), --emulator, --seed-emulator,
 * --trial (at most five clients on the real database while the full import
 * is switched off), --relabel (above), --key / --project / --database (as
 * the other scripts).
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { register } from "node:module";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { argv, connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { readTable } from "../src/features/filemaker-import/files.ts";
import { fileKindOf, parseDay, readProfiles, readWorkoutLines, type ProfileRecord, type WorkoutLine } from "../src/features/filemaker-import/records.ts";
import { columnsLookSwapped, findingsOf, groupVisits, holdsAllowedOn } from "../src/features/filemaker-import/visits.ts";
import type { FloorUnit, MapRow } from "../src/features/filemaker-import/machine-map.ts";
import { clientWriteFor, numberOffsetFor, planClient, visitInstant, type ClientNow, type ClientPlan, type PlannedLog, type PlannedSession } from "../src/features/filemaker-import/plan.ts";
import { clientLines, summaryLines, type ClientReport } from "../src/features/filemaker-import/report.ts";
import { TRIAL_MAX_CLIENTS, writeRefusal } from "../src/features/filemaker-import/lock.ts";
import { chooseClientDoc } from "../src/lib/mindbody-site.ts";
import { mindbodyIdConflict, mindbodyIdOf } from "../src/lib/mindbody-id.ts";
import { isPerSideMachine } from "../src/lib/floor-machines.ts";
import { mergeMachineTotals, machineTotalsPath, mergeWriteOf } from "../src/features/machine-totals/totals.ts";
import { DEFAULT_TIME_ZONE, studioDayKeyOf, studioTodayKey } from "../src/lib/studio-time.ts";
import { priorHistoryOf } from "../src/lib/prior-history.ts";
import { plainFieldOps, rollupFromHistory } from "../src/lib/client-rollups.ts";
import { isPerformedLog } from "../src/lib/set-outcome.ts";
import { involvedMachines, logsAfter, sessionOutcome, totalsPlan, type Move, type StoredLog, type StoredSession, type TotalsPlan } from "../src/features/filemaker-import/relabel.ts";

/**
 * The app is ready since the history-ready round (Oct 12 2026: the session
 * screen reads a window of a client's sessions; every reader of reps asks
 * set-outcome.ts). Switched on only once the pre-launch reset has run, the
 * full export with the trainer per visit is here, and AJ says go. (The round
 * document's §6.)
 */
const PRODUCTION_IMPORT_READY = false;

/*
 * The machine table's suggestions read Journey's names for the movements
 * (features/catalog/names.ts), which reach the machines' photos: those load
 * as nothing here (lib/stub-assets.mjs), so the two modules are imported
 * dynamically, after the hook is in place.
 */
register("./lib/stub-assets.mjs", import.meta.url);
const { draftMap, machineResolver, mapFromCsv, mapToCsv, tableProblems } = await import("../src/features/filemaker-import/machine-map.ts");
const { MOVEMENTS } = await import("../src/features/catalog/names.ts");

const VALUE_FLAGS = new Set(["map", "through", "expect", "key", "project", "database", "relabel-from"]);
const BOOLEAN_FLAGS = new Set(["commit", "emulator", "seed-emulator", "verify", "allow-waiting", "trial", "relabel"]);
const OUT_DIR = path.resolve(process.cwd(), "backups", "filemaker");
/** Writes in one transaction: a batch of whole visits, the client, the totals and the settings. */
const WRITES_PER_TRANSACTION = 400;

function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}\nNothing was written.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const inputs: string[] = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) stop(`--${name} needs a value.`);
      i += 1;
    } else if (!BOOLEAN_FLAGS.has(name)) stop(`unknown flag --${name}.`);
  } else inputs.push(a);
}

const commit = hasFlag("commit");
const emulator = hasFlag("emulator");
const throughFlag = flag("through");
if (throughFlag !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(throughFlag) || parseDay(throughFlag).value !== throughFlag)) {
  stop(`--through needs a real day like 2026-10-11 (it says "${throughFlag}").`);
}
const expectRaw = flag("expect");
if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) stop(`--expect needs a whole number (it says "${expectRaw}").`);
const expected = expectRaw === undefined ? null : Number(expectRaw);
if (hasFlag("seed-emulator") && !emulator) stop("--seed-emulator only works with --emulator.");
if (commit && expected === null) stop("--commit needs --expect N, N being the dry run's count of sessions to write.");
if (!inputs.length) stop("give the FileMaker files (or a folder of them) to read.");
const trial = hasFlag("trial");
if (trial && emulator) stop("--trial is for the real database; the emulator takes any number of clients.");
const relabel = hasFlag("relabel");
if (relabel && !flag("map")) stop("--relabel needs --map: the machine table with the client's own rows.");
const relabelFrom = flag("relabel-from");
if (relabelFrom && !relabel) stop("--relabel-from only works with --relabel.");
if (relabelFrom && !fs.existsSync(relabelFrom)) stop(`no machine table at ${relabelFrom}.`);
// Refused before anything is read when it can be told now; a trial's size is checked once the clients are known.
if (commit && !trial) {
  const refusal = writeRefusal({ ready: PRODUCTION_IMPORT_READY, emulator, trial, clientsToWrite: 0 });
  if (refusal) stop(refusal);
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

const EXPORT_FILE = /\.(xlsx|csv|mer|tab|txt)$/i;
const files = inputs.flatMap((p) => {
  if (!fs.existsSync(p)) stop(`no such file or folder: ${p}`);
  if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).filter((f) => EXPORT_FILE.test(f)).map((f) => path.join(p, f));
  return [p];
});

const inflate = (b: Uint8Array) => new Uint8Array(zlib.inflateRawSync(b));
const profiles: ProfileRecord[] = [];
const workoutFiles: { file: string; lines: WorkoutLine[] }[] = [];
console.log(`\nReading ${files.length} file${files.length === 1 ? "" : "s"}:`);
for (const file of files) {
  const table = readTable(new Uint8Array(fs.readFileSync(file)), inflate);
  const kind = fileKindOf(table[0] ?? []);
  const label = path.basename(file);
  if (kind === "profile") {
    const read = readProfiles(table, label);
    if (read.missing.length) stop(`${label} is a client profile without ${read.missing.join(", ")}.`);
    profiles.push(...read.records);
    console.log(`  ${label}: client profile, ${read.records.length} client${read.records.length === 1 ? "" : "s"}`);
  } else if (kind === "workouts") {
    const read = readWorkoutLines(table, label);
    if (read.missing.length) stop(`${label} is a workouts file without the columns ${read.missing.join(", ")}.`);
    if (columnsLookSwapped(read.records)) {
      stop(`${label}: the reps and next-time weight columns read the other way round from the samples (NextSet should be the reps, Reps the next weight). Check with the developer before importing.`);
    }
    workoutFiles.push({ file: label, lines: read.records });
    console.log(`  ${label}: workout lines, ${read.records.length} entries${read.unused.length ? `; not used: ${read.unused.join(", ")}` : ""}`);
  } else {
    stop(`${label} has no column names on its first row (FileMaker's plain CSV leaves them out). Ask for Excel, or FileMaker's "Merge" format.`);
  }
}

/* One profile per FileMaker client. */
const profileById = new Map<string, ProfileRecord>();
for (const p of profiles) {
  if (!p.fmClientId) continue;
  if (profileById.has(p.fmClientId)) stop(`two profiles carry FileMaker client ${p.fmClientId} (${p.file} row ${p.row} and ${profileById.get(p.fmClientId)!.file} row ${profileById.get(p.fmClientId)!.row}).`);
  profileById.set(p.fmClientId, p);
}

/* Each profile's workout lines: by FileMaker's client id when the lines carry it, else one client per file, by FileMaker's name. */
const linesOf = new Map<ProfileRecord, WorkoutLine[]>();
for (const p of profiles) linesOf.set(p, []);
for (const { file, lines } of workoutFiles) {
  if (lines.every((l) => l.fmClientId)) {
    const orphans = new Map<string, number>();
    for (const l of lines) {
      const owner = profileById.get(l.fmClientId!);
      if (owner) linesOf.get(owner)!.push(l);
      else orphans.set(l.fmClientId!, (orphans.get(l.fmClientId!) ?? 0) + 1);
    }
    for (const [id, n] of orphans) console.log(`  ${file}: ${n} lines for FileMaker client ${id}, who has no profile in these files; left out.`);
    continue;
  }
  const names = [...new Set(lines.map((l) => l.name ?? ""))];
  if (names.length !== 1 || !names[0]) stop(`${file} holds ${names.length} clients and no client id column: ask for __ID_Client on the workout lines.`);
  const owners = profiles.filter((p) => p.name === names[0]);
  if (owners.length !== 1) stop(`${file} belongs to "${names[0]}", and ${owners.length} profiles in these files have that name. Give exactly one.`);
  linesOf.get(owners[0])!.push(...lines);
}

/* ------------------------------------------------------------------ *
 * Firestore
 * ------------------------------------------------------------------ */

function connect(): Firestore {
  if (!emulator) return connectFirestore();
  if (!process.env.FIRESTORE_EMULATOR_HOST) stop("--emulator needs a running emulator (run it through `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST).");
  const projectId = flag("project") ?? "demo-fm-import";
  if (!projectId.startsWith("demo-")) stop(`--emulator only runs against a demo- project (got ${projectId}).`);
  console.log(`Firestore: EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST}, project ${projectId}`);
  return getFirestore(initializeApp({ projectId }));
}

/** The four studios as they are in production (studio-ids memory, Sep 27 2026), for the emulator's rehearsal only. */
const REHEARSAL_STUDIOS = [
  { id: "BVDDRe5AqQZFihRLW0vK", name: "Strongsville Ohio", mindbodySiteId: "29068", mindbodyLocationId: 5, words: ["strongsville"] },
  { id: "A4uvDltWoJuCas0hqEkG", name: "westlake", mindbodySiteId: "29068", mindbodyLocationId: 3, words: ["westlake"] },
  { id: "1WV88AvJKRpgypnmmO1N", name: "Willoughby Ohio", mindbodySiteId: "29068", mindbodyLocationId: 4, words: ["willoughby"] },
  { id: "NdqNIuZlpHig31Xj4UHR", name: "Solon", mindbodySiteId: "5746957", mindbodyLocationId: 1, words: ["solon"] },
];

async function seedEmulator(db: Firestore) {
  const writes: [string, Record<string, unknown>][] = REHEARSAL_STUDIOS.map((s) => [
    `studios/${s.id}`,
    { name: s.name, mindbodySiteId: s.mindbodySiteId, mindbodyLocationId: s.mindbodyLocationId, timezone: DEFAULT_TIME_ZONE },
  ]);
  for (const p of profiles) {
    if (!p.mindbodyClientId || !p.siteId) continue;
    const where = (p.homeLocation ?? "").toLowerCase();
    const home =
      REHEARSAL_STUDIOS.find((s) => s.mindbodySiteId === p.siteId && s.words.some((w) => where.includes(w))) ??
      REHEARSAL_STUDIOS.find((s) => s.mindbodySiteId === p.siteId);
    writes.push([
      `clients/${p.mindbodyClientId}`,
      {
        firstName: p.firstName ?? p.name?.split(" ")[0] ?? "",
        lastName: p.lastName ?? p.name?.split(" ").slice(1).join(" ") ?? "",
        mindbodyClientId: p.mindbodyClientId,
        mindbodySiteId: p.siteId,
        homeStudioId: home?.id ?? null,
        isActive: true,
        remainingSessions: 0,
        firstAppointmentDate: p.firstAppointment,
      },
    ]);
  }
  for (let i = 0; i < writes.length; i += WRITES_PER_TRANSACTION) {
    const batch = db.batch();
    for (const [docPath, data] of writes.slice(i, i + WRITES_PER_TRANSACTION)) batch.set(db.doc(docPath), data, { merge: true });
    await batch.commit();
  }
  console.log(`Seeded the emulator: ${REHEARSAL_STUDIOS.length} studios, ${profiles.length} clients.`);
}

/** A stored date (a day, an instant, a Timestamp) as the studio's day, or null. */
const dayOf = (v: unknown, tz: string): string | null => (v ? studioDayKeyOf(v as never, tz) : null);

const dayBefore = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

const isImported = (id: string, s: DocumentData) => id.startsWith("fm_") || !!s.legacy_filemaker_id;

interface ClientRun {
  docId: string;
  profile: ProfileRecord;
  plan: ClientPlan;
  /** Why this client is left out, when it is. */
  stopped: string | null;
  /** Journey's Completed sessions for the client when it was read, imported ones included. */
  completed: number;
  wholeStory: boolean;
  tz: string;
  /** --relabel: the plan with the studio's rows only, what the import wrote. */
  oldPlan: ClientPlan | null;
  /** --relabel: every session Journey holds for the client, imported and its own. */
  sessions: { id: string; data: DocumentData }[];
}

async function main() {
  const db = connect();
  if (hasFlag("seed-emulator")) await seedEmulator(db);

  const studioSnap = await db.collection("studios").get();
  const studios = studioSnap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) })) as (DocumentData & { id: string })[];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const studioName = (id: string) => String(studioById.get(id)?.name ?? id);

  /* Find each client in Journey: Mindbody id and site, the two-site rule (lib/mindbody-site.ts). */
  type Found = { profile: ProfileRecord; docId: string; data: DocumentData } | { profile: ProfileRecord; problem: string };
  const found: Found[] = [];
  for (const profile of profiles) {
    if (!profile.mindbodyClientId || !profile.siteId) {
      found.push({ profile, problem: "the profile has no Mindbody id or site" });
      continue;
    }
    const [plainSnap, qualifiedSnap] = await db.getAll(
      db.doc(`clients/${profile.mindbodyClientId}`),
      db.doc(`clients/${profile.siteId}-${profile.mindbodyClientId}`),
    );
    const plain = plainSnap.exists ? (plainSnap.data() as DocumentData) : null;
    const choice = chooseClientDoc({ mindbodyClientId: profile.mindbodyClientId, site: profile.siteId, qualifiedExists: qualifiedSnap.exists, plain, studios });
    if (choice.create) {
      found.push({ profile, problem: "not in Journey yet (sync the client from Mindbody first; this import never makes a client)" });
      continue;
    }
    const data = (choice.docId === plainSnap.id ? plain : qualifiedSnap.data()) as DocumentData;
    if (!mindbodyIdOf({ id: choice.docId, ...data })) found.push({ profile, problem: "the Journey record is a temporary or merged-away one" });
    else if (mindbodyIdConflict({ id: choice.docId, ...data })) found.push({ profile, problem: "the Journey record carries two different Mindbody ids; fix that first" });
    else if (!data.homeStudioId || !studioById.has(data.homeStudioId)) found.push({ profile, problem: "the Journey record has no home studio" });
    else found.push({ profile, docId: choice.docId, data });
  }
  const byDoc = new Map<string, ProfileRecord>();
  for (const f of found) {
    if (!("docId" in f)) continue;
    const other = byDoc.get(f.docId);
    if (other) stop(`two FileMaker profiles (${other.file} row ${other.row} and ${f.profile.file} row ${f.profile.row}) are the same Journey client, clients/${f.docId}. Merge them in the export first.`);
    byDoc.set(f.docId, f.profile);
  }

  /* Each home studio's floor: its roster, or the catalog when the roster is empty (as the app does). */
  const catalogSnap = await db.collection("machines").get();
  const catalogName = new Map(catalogSnap.docs.map((d) => [d.id, String((d.data() as DocumentData).name ?? d.id)]));
  const floors = new Map<string, FloorUnit[]>();
  for (const homeId of new Set(found.flatMap((f) => ("docId" in f ? [String(f.data.homeStudioId)] : [])))) {
    const roster = await db.collection(`studios/${homeId}/roster`).get();
    const units: FloorUnit[] = roster.docs.map((d) => {
      const r = d.data() as DocumentData;
      const id = String(r.machineId ?? d.id);
      const movement = r.basedOn ? String(r.basedOn) : r.source === "catalog" ? id : null;
      const name = String(r.overrides?.name ?? r.definition?.name ?? catalogName.get(id) ?? (movement ? catalogName.get(movement) : null) ?? id);
      return { id, name: r.status === "inactive" ? `${name} (retired)` : name, movement };
    });
    if (units.length) floors.set(homeId, units);
    else if (catalogSnap.size) floors.set(homeId, catalogSnap.docs.map((d) => ({ id: d.id, name: catalogName.get(d.id)!, movement: d.id.startsWith("m-") ? d.id : null })));
    // An empty emulator: the twenty movements by their own ids, so a rehearsal has a floor.
    else floors.set(homeId, Object.values(MOVEMENTS).map((m) => ({ id: m.id, name: m.name, movement: m.id })));
  }
  const unitOf = (studio: string, id: string) => floors.get(studio)?.find((u) => u.id === id);
  const perSide = (studio: string) => (id: string) => isPerSideMachine({ id, name: unitOf(studio, id)?.name ?? catalogName.get(id) ?? id, comparisonKey: unitOf(studio, id)?.movement ?? undefined });
  /** Whether a timed hold is a real reading on the unit (visits.ts): never on a machine lifted for reps. */
  const holdsOn = (studio: string) => (id: string) => holdsAllowedOn(id, unitOf(studio, id)?.movement ?? null);

  /* The machine table: a person's, checked, or the draft. */
  let table: MapRow[] = [];
  const mapPath = flag("map");
  if (mapPath) {
    if (!fs.existsSync(mapPath)) stop(`no machine table at ${mapPath}.`);
    const read = mapFromCsv(fs.readFileSync(mapPath, "utf-8"));
    // Only the studios this run reads a floor for can be checked; a shared table's other rows are left alone.
    const here = read.rows.filter((r) => floors.has(r.studio));
    const problems = [...read.problems, ...tableProblems(here, (studio, id) => !!unitOf(studio, id))];
    if (problems.length) stop(`the machine table has mistakes:\n  ${problems.join("\n  ")}`);
    if (here.length < read.rows.length) console.log(`  Machine table: ${read.rows.length - here.length} rows for studios with no client in this run, not checked.`);
    table = read.rows;
  }
  const seen = found.flatMap((f) =>
    "docId" in f
      ? linesOf.get(f.profile)!.filter((l) => l.day && l.machine).map((l) => ({ studio: String(f.data.homeStudioId), fmName: l.machine, day: l.day!, client: f.docId }))
      : [],
  );
  const draft = draftMap(seen, floors, table);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const draftPath = path.join(OUT_DIR, mapPath ? `machine-table-refreshed-${stamp}.csv` : fs.existsSync(path.join(OUT_DIR, "machine-table.csv")) ? `machine-table-draft-${stamp}.csv` : "machine-table.csv");
  const clientNames = new Map(found.flatMap((f) => ("docId" in f ? [[f.docId, [f.data.firstName, f.data.lastName].filter(Boolean).join(" ") || (f.profile.name ?? "")] as [string, string]] : [])));
  fs.writeFileSync(draftPath, mapToCsv(draft, new Map(studios.map((s) => [s.id, String(s.name ?? s.id)])), clientNames));
  // A dry run with no table plans from the draft, so its counts show what the sure matches alone would do.
  const resolve = machineResolver(mapPath ? table : draft);
  // --relabel: what the import wrote. The table it used when one is named (--relabel-from: a client imported
  // before the studio's table changed), else today's table without the client's own rows.
  const usedTable = relabelFrom ? mapFromCsv(fs.readFileSync(relabelFrom, "utf-8")) : null;
  if (usedTable?.problems.length) stop(`the table named by --relabel-from has mistakes:\n  ${usedTable.problems.join("\n  ")}`);
  const resolveOld = (client: string) => machineResolver(usedTable ? usedTable.rows : table.filter((r) => r.client !== client));

  /* Each client: visits, findings, what Journey has, the plan. */
  const reports: ClientReport[] = [];
  const runs: ClientRun[] = [];
  for (const f of found) {
    const lines = linesOf.get(f.profile) ?? [];
    const { visits, undated } = groupVisits(lines);
    const base = {
      name: f.profile.name ?? "(no name)",
      mindbodyClientId: f.profile.mindbodyClientId,
      siteId: f.profile.siteId,
      visits,
      fmWorkoutCount: f.profile.workoutCount,
      firstAppointment: f.profile.firstAppointment,
      hasWorkoutNotes: !!f.profile.workoutNotes,
    };
    if (!("docId" in f)) {
      reports.push({ ...base, journey: { problem: f.problem }, stopped: null, findings: findingsOf(visits, undated, () => false), plan: null, mindbodyVisits: null, hasPriorHistory: false });
      continue;
    }
    const home = String(f.data.homeStudioId);
    const studio = studioById.get(home)!;
    const tz = String(studio.timezone || DEFAULT_TIME_ZONE);
    const cutover = typeof studio.journeyCutoverDate === "string" && studio.journeyCutoverDate ? studio.journeyCutoverDate : null;
    if (throughFlag && cutover && throughFlag >= cutover) stop(`--through ${throughFlag} is on or after ${studioName(home)}'s switch-over day (${cutover}): those days are Journey's.`);
    const through = throughFlag ?? (cutover ? dayBefore(cutover) : commit ? null : dayBefore(studioTodayKey(new Date(), tz)));
    if (commit && !through) stop(`${base.name}'s studio (${studioName(home)}) has no switch-over day: give --through.`);

    const sessionsSnap = await db.collection("sessions").where("clientId", "==", f.docId).orderBy("date", "desc").get();
    const existing = new Map<string, number | null>();
    const journeyDays = new Set<string>();
    let completed = 0;
    for (const d of sessionsSnap.docs) {
      const s = d.data() as DocumentData;
      if (s.status === "Completed") completed += 1;
      if (isImported(d.id, s)) existing.set(d.id, typeof s.sessionNumber === "number" ? s.sessionNumber : null);
      else {
        const day = dayOf(s.date, tz) ?? dayOf(s.createdAt, tz);
        if (day) journeyDays.add(day);
      }
    }

    // Read the way the app reads it (lib/prior-history.ts), so a malformed record counts as none here too.
    const prior = priorHistoryOf(f.data);
    const input = {
      client: { docId: f.docId, mindbodyClientId: f.profile.mindbodyClientId!, name: base.name, homeStudioId: home, fmClientId: f.profile.fmClientId },
      visits,
      through,
      timeZone: tz,
      machineFor: (fmName: string, day: string) => resolve(home, fmName, day, f.docId),
      perSide: perSide(home),
      holdsOn: holdsOn(home),
      journeyDays,
      existing,
    };
    // Numbered from the stated total, when there is one: the count of numbered visits comes from a first pass.
    const offset = numberOffsetFor(prior, planClient({ ...input, numberOffset: 0 }).sessions.length, existing.size);
    const plan = planClient({ ...input, numberOffset: offset });
    let oldPlan: ClientPlan | null = null;
    if (relabel) {
      const old = resolveOld(f.docId);
      oldPlan = planClient({ ...input, numberOffset: offset, machineFor: (fmName: string, day: string) => old(home, fmName, day, f.docId) });
    }

    let stopped: string | null = null;
    const ownSessions = sessionsSnap.size - existing.size;
    const plannedIds = new Set(plan.sessions.map((s) => s.id));
    const gone = [...existing.keys()].filter((id) => !plannedIds.has(id));
    const oldIds = oldPlan ? oldPlan.sessions.map((s) => s.id).join() : "";
    if (relabel && oldPlan && oldIds !== plan.sessions.map((s) => s.id).join()) stopped = "the client's own rows change which visits import, not only their machines: a relabel can't do that.";
    else if (relabel && !existing.size) stopped = "nothing of this client's was imported yet: import first.";
    else if (ownSessions > 0 && !relabel) stopped =`Journey already holds ${ownSessions} session${ownSessions === 1 ? "" : "s"} of its own for the client; imported numbers would clash. Import before the first Journey session (after the pre-launch reset).`;
    else if (gone.length) stopped = `${gone.length} session${gone.length === 1 ? "" : "s"} imported before ${gone.length === 1 ? "is" : "are"} no longer in this export or after --through (${gone.slice(0, 5).map((id) => id.slice(-10)).join(", ")}${gone.length > 5 ? ", ..." : ""}). A person decides what happened first.`;
    else if (plan.numberDrift.length) stopped = `the numbering has moved since an earlier run (${plan.numberDrift.length} sessions, e.g. ${plan.numberDrift[0].id.slice(-10)} was #${plan.numberDrift[0].stored}, now #${plan.numberDrift[0].planned}): the export or --through changed.`;

    const firstAppt = dayOf(f.profile.firstAppointment ?? f.data.firstAppointmentDate, tz);
    const wholeStory = !!(firstAppt && visits[0] && Date.parse(visits[0].day) - Date.parse(firstAppt) <= 21 * 86_400_000);
    runs.push({ docId: f.docId, profile: f.profile, plan, stopped, completed, wholeStory, tz, oldPlan, sessions: sessionsSnap.docs.map((d) => ({ id: d.id, data: d.data() as DocumentData })) });
    reports.push({
      ...base,
      journey: { docId: f.docId, homeStudio: studioName(home), journeyName: [f.data.firstName, f.data.lastName].filter(Boolean).join(" ") || null },
      stopped,
      findings: findingsOf(
        visits,
        undated,
        (fm, day) => {
          const id = resolve(home, fm, day, f.docId);
          return !!id && perSide(home)(id);
        },
        (fm, day) => {
          const id = resolve(home, fm, day, f.docId);
          return !id || id === "skip" || holdsOn(home)(id);
        },
      ),
      plan,
      mindbodyVisits: typeof f.data.clientsNumberOfVisitsAtSite === "number" ? f.data.clientsNumberOfVisitsAtSite : null,
      hasPriorHistory: !!prior,
    });
  }

  /* The report. */
  const writable = runs.filter((r) => !r.stopped && !r.plan.unmatched.length);
  const toWrite = writable.reduce((n, r) => n + r.plan.sessions.filter((s) => !s.exists).length, 0);
  const waiting = new Set(runs.filter((r) => !r.stopped).flatMap((r) => r.plan.unmatched));
  console.log("");
  for (const r of reports) {
    for (const l of clientLines(r)) console.log(l);
    console.log("");
  }
  for (const l of summaryLines(reports, false)) console.log(l);
  console.log(`\nMachine table: ${draftPath}`);
  if (!mapPath) console.log("  Open it in Excel, fill in every blank \"Journey machine\" (an id from the Suggested or Note column, or skip), save it as CSV, and run again with --map <that file>.");
  const reportPath = path.join(OUT_DIR, `report-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      reports.map((r) => ({ ...r, visits: r.visits.length, plan: r.plan && { sessions: r.plan.sessions.map((s) => ({ id: s.id, day: s.day, number: s.number, exists: s.exists, sets: s.logs.length })), skipped: r.plan.skipped, held: r.plan.held, unmatched: r.plan.unmatched } })),
      null,
      2,
    ),
  );
  console.log(`Report: ${reportPath}`);

  if (relabel) {
    await relabelRuns(db, runs, stamp, (studio, id) => unitOf(studio, id)?.name ?? catalogName.get(id) ?? id);
    return;
  }

  if (hasFlag("verify")) await verify(db, runs);
  const clientsToWrite = writable.filter((r) => r.plan.sessions.some((s) => !s.exists)).length;
  const refusal = writeRefusal({ ready: PRODUCTION_IMPORT_READY, emulator, trial, clientsToWrite });
  if (!commit) {
    const lockWords = emulator || PRODUCTION_IMPORT_READY
      ? ""
      : trial
        ? refusal
          ? ` (refused as it stands: ${refusal})`
          : ` --trial (a trial of ${clientsToWrite} client${clientsToWrite === 1 ? "" : "s"} on the real database)`
        : ` (the real database takes only a --trial of at most ${TRIAL_MAX_CLIENTS} clients until the full import is switched on)`;
    console.log(`\nDRY RUN: nothing was written. To write: --commit --expect ${toWrite}${lockWords}`);
    return;
  }

  /* Writing. */
  if (refusal) stop(refusal);
  if (expected !== toWrite) stop(`--expect ${expected}, but this run would write ${toWrite} sessions. Run the dry run again and use its number.`);
  if (waiting.size && !hasFlag("allow-waiting")) stop(`${waiting.size} FileMaker machine names are not matched yet (${[...waiting].join(", ")}). Finish the machine table, or add --allow-waiting to write the clients that don't wait.`);

  let written = 0;
  for (const run of writable) {
    const toCreate = run.plan.sessions.filter((s) => !s.exists).sort((a, b) => a.day.localeCompare(b.day));
    if (!toCreate.length) continue;
    // Journey's Completed sessions before each batch: every batch before it is in Journey now, written by this run or found there.
    let inJourney = run.completed;
    let created = 0;
    let sets = 0;
    for (const chunk of chunksOf(toCreate)) {
      const made = await writeChunk(db, run, chunk, inJourney);
      inJourney += chunk.length;
      created += made.sessions;
      sets += made.sets;
    }
    written += created;
    console.log(`  ${run.profile.name}: wrote ${created} sessions and ${sets} sets, with the client's counts.`);
  }
  console.log(`\nDone: ${written} sessions. Then, once: Admins → Machinery → System tools → Rebuild trainer rollups; npx tsx scripts/run-machine-trends.ts --commit; npx tsx scripts/run-renewals.ts --commit --max-pulls 0 --first-sync-max 0.`);
}

/** Whole visits, oldest first, in batches that fit one transaction with the client's own writes. */
function chunksOf(sessions: PlannedSession[]): PlannedSession[][] {
  const out: PlannedSession[][] = [];
  let current: PlannedSession[] = [];
  let writes = 0;
  const machinesIn = (list: PlannedSession[]) => new Set(list.flatMap((s) => s.logs.map((l) => l.machineId))).size;
  for (const s of sessions) {
    const cost = s.logs.length + 1;
    if (current.length && writes + cost + 2 + machinesIn([...current, s]) > WRITES_PER_TRANSACTION) {
      out.push(current);
      current = [];
      writes = 0;
    }
    current.push(s);
    writes += cost;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * One batch of visits and the client's own documents, in one transaction: the
 * sessions are re-checked inside it (one an earlier run wrote is left alone
 * and not counted again), and every count is worked out from what it read.
 */
async function writeChunk(db: Firestore, run: ClientRun, chunk: PlannedSession[], completedBefore: number): Promise<{ sessions: number; sets: number }> {
  const clientRef = db.doc(`clients/${run.docId}`);
  const totalsRef = db.doc(machineTotalsPath(run.docId).join("/"));
  const sessionRefs = chunk.map((s) => db.doc(`sessions/${s.id}`));
  const machineIds = [...new Set(chunk.flatMap((s) => s.logs.map((l) => l.machineId)))];
  const settingRefs = machineIds.map((m) => db.doc(`clientMachineSettings/${run.docId}_${m}`));
  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(clientRef, totalsRef, ...sessionRefs, ...settingRefs);
    const [clientSnap, totalsSnap] = snaps;
    const already = new Set(snaps.slice(2, 2 + sessionRefs.length).filter((s) => s.exists).map((s) => s.id));
    const settingSnaps = new Map(snaps.slice(2 + sessionRefs.length).map((s, i) => [machineIds[i], s]));
    const create = chunk.filter((s) => !already.has(s.id));
    if (!create.length) return { sessions: 0, sets: 0 };

    const client = (clientSnap.data() ?? {}) as DocumentData;
    const totals = mergeMachineTotals(client, totalsSnap.data() ?? null);
    const write = clientWriteFor(
      create,
      run.plan.firstDays,
      {
        priorHistory: priorHistoryOf(client),
        lastSessionDate: typeof client.lastSessionDate === "string" ? client.lastSessionDate : null,
        legacyFilemakerId: client.legacy_filemaker_id ?? null,
        completedSessions: completedBefore + (chunk.length - create.length),
        trainerTally: (client.trainerTally ?? null) as Record<string, number> | null,
        topTrainerId: typeof client.topTrainerId === "string" ? client.topTrainerId : null,
        machineStats: (totals.machineStats ?? null) as never,
        lastMetricDay: (m) => dayOf(totals.currentMachineMetrics?.[m]?.lastPerformedDate, run.tz),
      },
      { increment: (n) => FieldValue.increment(n), serverTimestamp: () => FieldValue.serverTimestamp() },
      { fmClientId: run.profile.fmClientId, wholeStory: run.wholeStory },
    );

    let sets = 0;
    for (const s of create) {
      for (const l of s.logs) tx.set(db.doc(`exerciseLogs/${l.id}`), l.data);
      tx.create(db.doc(`sessions/${s.id}`), s.data);
      sets += s.logs.length;
    }
    tx.update(clientRef, write.client);
    if (Object.keys(write.totals).length) {
      const { data, mergeFields } = mergeWriteOf({ ...write.totals, updatedAt: FieldValue.serverTimestamp() });
      tx.set(totalsRef, data, { mergeFields });
    }
    const home = String(create[0].data.homeStudioId);
    for (const s of write.settings) {
      const snap = settingSnaps.get(s.machineId);
      const onFile = snap?.exists ? (snap.data() as DocumentData) : null;
      const onFileDay = dayOf(onFile?.updatedAt, run.tz);
      const fields: Record<string, unknown> = {};
      if (!onFileDay || onFileDay < s.day) {
        Object.assign(fields, { clientId: run.docId, machineId: s.machineId, homeStudioId: home, clientHomeStudioId: home, currentWeight: s.currentWeight, updatedBy: "filemaker-import", updatedAt: visitInstant(s.day, run.tz) });
      }
      if (s.startingWeight !== null && !onFile?.startingWeight) {
        Object.assign(fields, { startingWeight: s.startingWeight, startingWeightDate: `${s.startingDay}T12:00:00.000Z` });
      }
      if (Object.keys(fields).length) tx.set(db.doc(`clientMachineSettings/${run.docId}_${s.machineId}`), fields, { merge: true });
    }
    return { sessions: create.length, sets };
  });
}

/* ------------------------------------------------------------------ *
 * --relabel: imported sets back on the right machines (relabel.ts)
 * ------------------------------------------------------------------ */

/** A stored value as JSON with its keys in order, to tell whether two maps are the same. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

interface RelabelRun {
  run: ClientRun;
  home: string;
  changes: { id: string; day: string; sessionMachineIds: string[] | null; set: PlannedLog[]; remove: string[] }[];
  moves: Move[];
  /** The whole map, worked out again from every session; null when it is already right. */
  machineStats: Record<string, unknown> | null;
  totals: TotalsPlan;
  /** Old-side machine fields on the client document that come off with the replace (machine-totals/totals.ts). */
  clientDeletes: string[];
  backup: Record<string, unknown>;
}

const EMPTY_NOW: ClientNow = {
  priorHistory: null,
  lastSessionDate: null,
  legacyFilemakerId: null,
  completedSessions: 0,
  trainerTally: null,
  topTrainerId: null,
  machineStats: null,
  lastMetricDay: () => null,
};

async function relabelRuns(db: Firestore, runs: ClientRun[], stamp: string, nameOf: (studio: string, id: string) => string) {
  console.log("\nRELABEL: imported sets back on the right machines");
  const work: RelabelRun[] = [];
  for (const run of runs) {
    const label = run.profile.name ?? run.docId;
    if (run.stopped || !run.oldPlan) {
      console.log(`  ${label}: left out (${run.stopped ?? "no plan"})`);
      continue;
    }
    if (run.plan.unmatched.length || run.oldPlan.unmatched.length) {
      console.log(`  ${label}: left out (FileMaker names nobody has matched: ${[...new Set([...run.plan.unmatched, ...run.oldPlan.unmatched])].join(", ")})`);
      continue;
    }
    const home = String(run.plan.sessions[0]?.data.homeStudioId ?? "");
    const name = (id: string) => nameOf(home, id);
    const oldById = new Map(run.oldPlan.sessions.map((s) => [s.id, s]));
    const pairs = run.plan.sessions.filter((s) => s.exists && oldById.has(s.id)).map((neu) => ({ old: oldById.get(neu.id)!, neu }));

    // Every set Journey holds for the client, imported and its own.
    const logsSnap = await db.collection("exerciseLogs").where("clientId", "==", run.docId).orderBy("createdAt", "asc").get();
    const allLogs: StoredLog[] = logsSnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    const logsBySession = new Map<string, StoredLog[]>();
    for (const l of allLogs) {
      const s = String(l.data.sessionId ?? "");
      (logsBySession.get(s) ?? logsBySession.set(s, []).get(s)!).push(l);
    }
    const sessionById = new Map(run.sessions.map((s) => [s.id, s.data]));
    const isImp = (id: string) => isImported(id, sessionById.get(id) ?? {});

    const changes: RelabelRun["changes"] = [];
    const moves: Move[] = [];
    const left: { day: string; why: string }[] = [];
    for (const { old, neu } of pairs) {
      const stored: StoredSession = { id: neu.id, data: (sessionById.get(neu.id) ?? {}) as Record<string, unknown>, logs: logsBySession.get(neu.id) ?? [] };
      const out = sessionOutcome(old, neu, stored);
      if (out.kind === "left") left.push({ day: neu.day, why: out.why });
      else if (out.kind === "change") {
        changes.push({ id: neu.id, day: neu.day, sessionMachineIds: out.sessionMachineIds, set: out.set, remove: out.remove });
        moves.push(...out.moves);
      }
    }
    // A visit that can't be relabeled would leave the client's totals and sets disagreeing: the client waits whole.
    if (left.length) {
      console.log(`  ${label}: left out, ${left.length} visit${left.length === 1 ? "" : "s"} can't be relabeled safely (a person looks first):`);
      for (const l of left.slice(0, 12)) console.log(`    ${l.day}: ${l.why}`);
      continue;
    }

    // The machine totals, from every set Journey will hold.
    const after = logsAfter(allLogs, changes);
    const rolled = rollupFromHistory(
      run.sessions.map((s) => ({ id: s.id, status: s.data.status, date: s.data.date, trainerId: s.data.trainerId ?? null, trainerInitials: s.data.trainerInitials ?? null })),
      after.map((l) => ({ ...(l.data as object), sessionId: String(l.data.sessionId ?? "") })) as never,
      [],
    );
    const [clientSnap, totalsSnap] = await db.getAll(db.doc(`clients/${run.docId}`), db.doc(machineTotalsPath(run.docId).join("/")));
    const clientData = (clientSnap.data() ?? {}) as DocumentData;
    const totalsData = (totalsSnap.data() ?? {}) as DocumentData;
    const merged = mergeMachineTotals(clientData, totalsData);
    const machineStats = stable(merged.machineStats ?? {}) === stable(rolled.machineStats) ? null : (rolled.machineStats as Record<string, unknown>);

    const involved = involvedMachines(pairs);
    const settingSnaps = involved.length ? await db.getAll(...involved.map((m) => db.doc(`clientMachineSettings/${run.docId}_${m}`))) : [];
    const settingsOnFile = new Map(settingSnaps.flatMap((s, i) => (s.exists ? [[involved[i], s.data() as Record<string, unknown>] as const] : [])));
    const journeyMachines = new Set(
      allLogs.filter((l) => !isImp(String(l.data.sessionId ?? "")) && isPerformedLog(l.data as never)).map((l) => String(l.data.machineId ?? "")),
    );
    const writeOf = (sessions: PlannedSession[], firstDays: Record<string, string>) =>
      clientWriteFor(sessions, firstDays, EMPTY_NOW, plainFieldOps, { fmClientId: run.profile.fmClientId, wholeStory: run.wholeStory });
    const totals = totalsPlan({
      involved,
      oldWrite: writeOf(pairs.map((p) => p.old), run.oldPlan.firstDays),
      newWrite: writeOf(pairs.map((p) => p.neu), run.plan.firstDays),
      metricsOnFile: (merged.currentMachineMetrics ?? {}) as never,
      settingsOnFile,
      journeyMachines,
      isImportedSession: isImp,
    });
    const clientDeletes = [
      ...(machineStats && clientData.machineStats ? ["machineStats"] : []),
      ...Object.keys(totals.metrics).filter((m) => clientData.currentMachineMetrics?.[m]).map((m) => `currentMachineMetrics.${m}`),
    ];

    work.push({
      run,
      home,
      changes,
      moves,
      machineStats,
      totals,
      clientDeletes,
      backup: {
        client: run.docId,
        name: label,
        at: stamp,
        sessions: changes.map((c) => ({ id: c.id, sessionMachineIds: sessionById.get(c.id)?.sessionMachineIds ?? null })),
        logs: changes.flatMap((c) => logsBySession.get(c.id) ?? []),
        machineTotals: totalsData,
        clientMachineFields: { machineStats: clientData.machineStats ?? null, currentMachineMetrics: clientData.currentMachineMetrics ?? null },
        clientMachineSettings: Object.fromEntries(settingsOnFile),
      },
    });

    // What a person reads before saying go.
    const sets = changes.reduce((n, c) => n + c.set.length, 0);
    console.log(`\n  ${label}: ${changes.length} of ${pairs.length} imported visits change${changes.length ? ` (${changes[0].day} to ${changes[changes.length - 1].day}), ${sets} sets rewritten` : ""}`);
    const byMove = new Map<string, Move[]>();
    for (const m of moves) {
      const k = `${m.from}\u0000${m.to}`;
      (byMove.get(k) ?? byMove.set(k, []).get(k)!).push(m);
    }
    for (const list of [...byMove.values()].sort((a, b) => b.length - a.length)) {
      const days = list.map((m) => m.day).sort();
      console.log(`    ${name(list[0].from)} -> ${name(list[0].to)}: ${list.length} sets, ${days[0]} to ${days[days.length - 1]}, last at ${list[list.length - 1].weight}`);
    }
    for (const [m, v] of Object.entries(totals.metrics)) {
      const was = merged.currentMachineMetrics?.[m];
      console.log(`    Last time on ${name(m)}: ${was?.weight ?? "none"} -> ${v ? `${v.weight} (${String(v.lastSessionId).slice(-10)})` : "none"}`);
    }
    for (const s of totals.settings) {
      const was = settingsOnFile.get(s.machineId);
      if (s.currentWeight !== undefined) console.log(`    Next time's weight on ${name(s.machineId)}: ${was?.currentWeight ?? "none"} -> ${s.currentWeight ?? "none"}`);
      if (s.startingWeight !== undefined) console.log(`    Starting weight on ${name(s.machineId)}: ${was?.startingWeight ?? "none"} -> ${s.startingWeight ?? "none"}`);
    }
    for (const k of totals.kept) console.log(`    Kept: ${name(k.machineId)}, ${k.what}`);
    if (machineStats) console.log(`    Machine stats: worked out again from all ${run.sessions.length} of the client's sessions`);
  }

  const toChange = work.reduce((n, w) => n + w.changes.length, 0);
  const touched = work.filter((w) => w.changes.length || w.machineStats || Object.keys(w.totals.metrics).length || w.totals.settings.length);
  const refusal = writeRefusal({ ready: PRODUCTION_IMPORT_READY, emulator, trial, clientsToWrite: touched.length });
  if (!commit) {
    console.log(`\nDRY RUN: nothing was written. To write: --commit --expect ${toChange}${emulator || PRODUCTION_IMPORT_READY ? "" : " --trial"}`);
    return;
  }
  if (refusal) stop(refusal);
  if (expected !== toChange) stop(`--expect ${expected}, but this run would change ${toChange} visits. Run the dry run again and use its number.`);

  for (const w of touched) {
    const label = w.run.profile.name ?? w.run.docId;
    const backupPath = path.join(OUT_DIR, `relabel-backup-${w.run.docId}-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(w.backup, null, 2));
    console.log(`\n  ${label}: what it held is saved at ${backupPath}`);

    // The visits, in batches; each visit whole in one batch.
    let batch = db.batch();
    let pending = 0;
    let visits = 0;
    for (const c of w.changes) {
      const cost = 1 + c.set.length + c.remove.length;
      if (pending && pending + cost > WRITES_PER_TRANSACTION) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
      if (c.sessionMachineIds) batch.update(db.doc(`sessions/${c.id}`), { sessionMachineIds: c.sessionMachineIds });
      for (const l of c.set) batch.set(db.doc(`exerciseLogs/${l.id}`), l.data);
      for (const id of c.remove) batch.delete(db.doc(`exerciseLogs/${id}`));
      pending += cost;
      visits += 1;
    }
    if (pending) await batch.commit();

    // Then the totals and next time's weights, together.
    const final = db.batch();
    const dotted: Record<string, unknown> = {};
    if (w.machineStats) dotted.machineStats = w.machineStats;
    for (const [m, v] of Object.entries(w.totals.metrics)) dotted[`currentMachineMetrics.${m}`] = v === null ? FieldValue.delete() : v;
    if (Object.keys(dotted).length) {
      const { data, mergeFields } = mergeWriteOf({ ...dotted, updatedAt: FieldValue.serverTimestamp() });
      final.set(db.doc(machineTotalsPath(w.run.docId).join("/")), data, { mergeFields });
    }
    if (w.clientDeletes.length) final.update(db.doc(`clients/${w.run.docId}`), Object.fromEntries(w.clientDeletes.map((f) => [f, FieldValue.delete()])));
    for (const s of w.totals.settings) {
      const fields: Record<string, unknown> = { clientId: w.run.docId, machineId: s.machineId, homeStudioId: w.home, clientHomeStudioId: w.home };
      // Next time's weight carries the day it is from, as the import writes it; a starting weight alone leaves that be.
      if (typeof s.currentWeight === "number") Object.assign(fields, { currentWeight: s.currentWeight, updatedBy: "filemaker-import", updatedAt: visitInstant(s.day, w.run.tz) });
      else if (s.currentWeight === null) fields.currentWeight = FieldValue.delete();
      if (s.startingWeight !== undefined) {
        fields.startingWeight = s.startingWeight === null ? FieldValue.delete() : s.startingWeight;
        fields.startingWeightDate = s.startingWeight === null ? FieldValue.delete() : `${s.startingDay}T12:00:00.000Z`;
      }
      final.set(db.doc(`clientMachineSettings/${w.run.docId}_${s.machineId}`), fields, { merge: true });
    }
    await final.commit();
    console.log(`  ${label}: ${visits} visits relabeled; machine totals and next time's weights written.`);
  }
  // Machine fit is built from the set-ups (clientMachineSettings' dials), which a relabel never touches.
  console.log("\nDone. Nothing else to run: the Sunday machine-trends job reads the sets again by itself.");
}

/** What is in Journey now, for each client in the files. */
async function verify(db: Firestore, runs: ClientRun[]) {
  console.log("\nVerify (read back from Journey):");
  for (const r of runs) {
    const snap = await db.collection("sessions").where("clientId", "==", r.docId).orderBy("date", "desc").get();
    const imported = snap.docs.filter((d) => isImported(d.id, d.data()));
    const client = (await db.doc(`clients/${r.docId}`).get()).data() ?? {};
    console.log(
      `  ${r.profile.name}: ${imported.length} imported sessions in Journey (${r.plan.sessions.length} planned), ${snap.size - imported.length} of Journey's own;` +
        ` sessionCount ${client.sessionCount ?? "-"}, completedSessions ${client.completedSessions ?? "-"}` +
        (client.priorHistory ? `, before Journey ${client.priorHistory.sessions} (imported ${client.priorHistory.importedCount ?? 0})` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
