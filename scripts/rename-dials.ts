/**
 * ONE WORD PER DIAL — rename a catalog machine's dials everywhere a dial's name is stored.
 *
 * The dial-names round, Oct 23 2026 (`docs/rounds/2026-10-23-dial-names.md`): AJ wants one
 * vocabulary per machine, so the catalog's dial names change (`scripts/lib/dial-renames.ts`
 * is the table). A dial's name on a catalog machine is its STORAGE KEY in every client's
 * set-up (equipment/adapters.ts buildFields, step 1), so the catalog and every saved value
 * move together, in this order:
 *
 *   1. machines/{id}.settingOptions (and any standardSettings / defaultSettings key)
 *   2. studios/{s}/roster/{id} overrides.settingOptions / overrides.standardSettings, and
 *      studioMachineSettings/{s}_{id} (none carry these names today; checked again here).
 *      A roster copy's own settingFields are the studio's words and are never touched.
 *   3. clientMachineSettings/*: settings, sources and fitAcks keys; the Dip's handle spellings
 *   4. clients/{c}/machineTotals/current.currentMachineMetrics[id].settings (the session snapshot)
 *   5. machines/{id}/settingHistory rows: "Back Pad: 3" → "Seat: 3" in oldValue / newValue
 *      (the machine card finds a dial's history by its label, machine-menu/dial-control.ts)
 *
 * Then, by hand: `npx tsx scripts/rebuild-machine-fit.ts --commit` (the fit index keys by the
 * normalised label). On --commit the repo's letters table
 * (src/features/filemaker-import/letters-strongsville.csv) is also copied over the working
 * copy the import tools read (backups/filemaker/letters-strongsville.csv), the old one kept.
 *
 * SAFETY
 *   - DRY RUN by default: reads everything, prints the plan, writes nothing.
 *   - --commit needs --expect N, N the number of documents the dry run said it would write.
 *   - A backup of every document it will touch (the fields before) is written FIRST to
 *     backups/dial-rename-backup-<stamp>.json, and the run stops if that fails.
 *   - A document already carrying the new names is skipped, so an interrupted run is run again.
 *   - A trainer's value is never changed, except the Dip's handle spellings, each one listed.
 *   - A set-up that has a value under both the old and the new name keeps the new name's
 *     (saved by the app after the catalog changed, so the newer), and says so.
 *
 * USAGE (PowerShell, from the project folder; needs service-account.json)
 *   npx tsx scripts/rename-dials.ts                        # dry run
 *   npx tsx scripts/rename-dials.ts --commit --expect N    # write, then rebuild-machine-fit
 */
import fs from "fs";
import path from "path";
import { FieldPath, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { DEFAULT_MACHINES } from "../src/data/default-machines.ts";
import {
  DIAL_RENAMES,
  DIAL_VALUE_REWORDS,
  moveAckKeys,
  moveKeys,
  renamedMachineIds,
  renamedOptions,
  renamesFor,
  rewordHistoryText,
  rewordValue,
} from "./lib/dial-renames.ts";

const commit = hasFlag("commit");
const expect = flag("expect");
if (commit && expect === undefined) throw new Error("--commit needs --expect N (N from the dry run). Nothing written.");

type Kind = "catalog" | "roster" | "studio-standards" | "set-up" | "snapshot" | "history";
interface Change {
  kind: Kind;
  ref: DocumentReference;
  /** The fields as they are, for the backup. */
  before: Record<string, unknown>;
  /** What update() writes. */
  update: Record<string, unknown> | Array<[FieldPath, unknown]>;
  note: string;
}

const machineIds = renamedMachineIds();
const changes: Change[] = [];
const warnings: string[] = [];
const seedOptions = (id: string) => DEFAULT_MACHINES.find((m) => m.id === id)?.settingOptions ?? null;

function keyedUpdate(doc: Record<string, unknown>, field: string, renames: ReadonlyMap<string, string>, note: string[]): Record<string, unknown> | null {
  const map = doc[field];
  if (!map || typeof map !== "object") return null;
  const r = moveKeys(map as Record<string, unknown>, renames);
  if (!r.next) return null;
  if (r.moved.length) note.push(`${field}: ${r.moved.map((k) => `${k} → ${renames.get(k)}`).join(", ")}`);
  if (r.kept.length) note.push(`${field}: dropped ${r.kept.map((k) => `"${k}" (the value under "${renames.get(k)}" kept)`).join(", ")}`);
  return r.next;
}

async function plan(db: Firestore) {
  /* ---- 1. the catalog ---- */
  for (const id of machineIds) {
    const renames = renamesFor(id);
    const snap = await db.doc(`machines/${id}`).get();
    if (!snap.exists) { warnings.push(`machines/${id} does not exist`); continue; }
    const doc = snap.data() as Record<string, unknown>;
    const options = Array.isArray(doc.settingOptions) ? (doc.settingOptions as string[]) : [];
    const r = renamedOptions(options, renames, seedOptions(id));
    if (r.conflict) throw new Error(`machines/${id} ${r.conflict}: settle that by hand first. Nothing written.`);
    const update: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const note: string[] = [];
    if (r.changed) { update.settingOptions = r.next; before.settingOptions = options; note.push(`settingOptions: ${options.join(" · ")} → ${r.next.join(" · ")}`); }
    for (const field of ["standardSettings", "defaultSettings"]) {
      const next = keyedUpdate(doc, field, renames, note);
      if (next) { update[field] = next; before[field] = doc[field]; }
    }
    const missing = [...renames.keys()].filter((from) => !options.includes(from) && !options.includes(renames.get(from)!));
    if (missing.length) warnings.push(`machines/${id} has neither the old nor the new name for: ${missing.join(", ")} (its dials: ${options.join(" · ")})`);
    if (Object.keys(update).length) changes.push({ kind: "catalog", ref: snap.ref, before, update, note: note.join("; ") });
  }

  /* ---- 2. roster copies and studio standards ---- */
  const studios = await db.collection("studios").get();
  for (const s of studios.docs) {
    const roster = await db.collection(`studios/${s.id}/roster`).get();
    for (const r of roster.docs) {
      const doc = r.data() as Record<string, unknown>;
      const id = String(doc.machineId ?? r.id);
      if (!machineIds.includes(id)) continue;
      const renames = renamesFor(id);
      const overrides = (doc.overrides ?? {}) as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      const note: string[] = [];
      if (Array.isArray(overrides.settingOptions)) {
        const o = renamedOptions(overrides.settingOptions as string[], renames, null);
        if (o.conflict) throw new Error(`studios/${s.id}/roster/${r.id} overrides ${o.conflict}. Nothing written.`);
        if (o.changed) { update["overrides.settingOptions"] = o.next; before["overrides.settingOptions"] = overrides.settingOptions; note.push(`overrides.settingOptions → ${o.next.join(" · ")}`); }
      }
      const std = keyedUpdate(overrides, "standardSettings", renames, note);
      if (std) { update["overrides.standardSettings"] = std; before["overrides.standardSettings"] = overrides.standardSettings; }
      if (Array.isArray(overrides.settingFields)) {
        const hit = (overrides.settingFields as Array<{ label?: string; key?: string }>).filter((f) => renames.has(String(f.label ?? f.key)));
        if (hit.length) warnings.push(`studios/${s.id}/roster/${r.id} has its own settingFields naming ${hit.map((f) => f.label ?? f.key).join(", ")}: the studio's words, left alone`);
      }
      if (Object.keys(update).length) changes.push({ kind: "roster", ref: r.ref, before, update, note: note.join("; ") });
    }
  }
  const standards = await db.collection("studioMachineSettings").get();
  for (const d of standards.docs) {
    const doc = d.data() as Record<string, unknown>;
    const id = String(doc.machineId ?? d.id.split("_").slice(1).join("_"));
    if (!machineIds.includes(id)) continue;
    const renames = renamesFor(id);
    const update: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const note: string[] = [];
    if (Array.isArray(doc.settingOptions)) {
      const o = renamedOptions(doc.settingOptions as string[], renames, null);
      if (o.changed) { update.settingOptions = o.next; before.settingOptions = doc.settingOptions; note.push(`settingOptions → ${o.next.join(" · ")}`); }
    }
    const std = keyedUpdate(doc, "standardSettings", renames, note);
    if (std) { update.standardSettings = std; before.standardSettings = doc.standardSettings; }
    if (Object.keys(update).length) changes.push({ kind: "studio-standards", ref: d.ref, before, update, note: note.join("; ") });
  }

  /* ---- 3. every client's set-ups ---- */
  const setups = await db.collection("clientMachineSettings").get();
  for (const d of setups.docs) {
    const doc = d.data() as Record<string, unknown>;
    const id = String(doc.machineId ?? d.id.split("_").slice(1).join("_"));
    if (!machineIds.includes(id) && !DIAL_VALUE_REWORDS.some((w) => w.machineId === id)) continue;
    const renames = renamesFor(id);
    const update: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const note: string[] = [];
    let settings = (doc.settings && typeof doc.settings === "object" ? { ...(doc.settings as Record<string, unknown>) } : null);
    if (renames.size) {
      const moved = keyedUpdate(doc, "settings", renames, note);
      if (moved) { settings = moved; before.settings = doc.settings; }
      const sources = keyedUpdate(doc, "sources", renames, note);
      if (sources) { update.sources = sources; before.sources = doc.sources; }
      if (doc.fitAcks && typeof doc.fitAcks === "object") {
        const acks = moveAckKeys(doc.fitAcks as Record<string, unknown>, renames);
        if (acks.next) { update.fitAcks = acks.next; before.fitAcks = doc.fitAcks; note.push(`fitAcks: ${acks.moved.join(", ")}`); }
      }
    }
    for (const w of DIAL_VALUE_REWORDS) {
      if (w.machineId !== id || !settings) continue;
      const word = rewordValue(settings[w.dial], w.words);
      if (word === null) continue;
      note.push(`${w.dial}: "${String(settings[w.dial])}" → ${word}`);
      if (before.settings === undefined) before.settings = doc.settings;
      settings[w.dial] = word;
    }
    if (before.settings !== undefined) update.settings = settings;
    if (Object.keys(update).length) changes.push({ kind: "set-up", ref: d.ref, before, update, note: note.join("; ") });
  }

  /* ---- 4. the session snapshots on machineTotals ---- */
  const totals = await db.collectionGroup("machineTotals").get();
  for (const d of totals.docs) {
    const metrics = (d.data() as Record<string, unknown>).currentMachineMetrics;
    if (!metrics || typeof metrics !== "object") continue;
    const update: Array<[FieldPath, unknown]> = [];
    const before: Record<string, unknown> = {};
    const note: string[] = [];
    for (const id of machineIds) {
      const entry = (metrics as Record<string, { settings?: Record<string, unknown> }>)[id];
      if (!entry?.settings) continue;
      const r = moveKeys(entry.settings, renamesFor(id));
      if (!r.next) continue;
      update.push([new FieldPath("currentMachineMetrics", id, "settings"), r.next]);
      before[`currentMachineMetrics.${id}.settings`] = entry.settings;
      note.push(`${id}: ${[...r.moved, ...r.kept.map((k) => `${k} (dropped, the new name's value kept)`)].join(", ")}`);
    }
    if (update.length) changes.push({ kind: "snapshot", ref: d.ref, before, update, note: note.join("; ") });
  }

  /* ---- 5. the history rows ---- */
  for (const id of machineIds) {
    const renames = renamesFor(id);
    const rows = await db.collection(`machines/${id}/settingHistory`).get();
    for (const row of rows.docs) {
      const doc = row.data() as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      for (const field of ["oldValue", "newValue"]) {
        const next = rewordHistoryText(doc[field] as string | undefined, renames);
        if (next !== null) { update[field] = next; before[field] = doc[field]; }
      }
      if (Object.keys(update).length) changes.push({ kind: "history", ref: row.ref, before, update, note: `${id}: ${String(before.oldValue ?? before.newValue)}` });
    }
  }
}

async function main() {
  const db = connectFirestore();
  console.log(commit ? "COMMIT: the renames below will be written." : "DRY RUN: nothing will be written.");
  console.log(`Renames: ${DIAL_RENAMES.map((r) => `${r.machineId} "${r.from}" → "${r.to}"`).join("; ")}`);
  console.log(`Rewords: ${DIAL_VALUE_REWORDS.map((w) => `${w.machineId} ${w.dial}: ${[...new Set(Object.values(w.words))].join(" / ")}`).join("; ")}`);
  await plan(db);

  const kinds: Kind[] = ["catalog", "roster", "studio-standards", "set-up", "snapshot", "history"];
  console.log("");
  for (const kind of kinds) {
    const of = changes.filter((c) => c.kind === kind);
    console.log(`${kind}: ${of.length} document(s)`);
    const show = kind === "catalog" || kind === "roster" || kind === "studio-standards" ? of : of.filter((c) => /dropped|→ (In|Wide)/.test(c.note));
    for (const c of show) console.log(`   ${c.ref.path}: ${c.note}`);
    if (kind === "set-up") {
      const perMachine = new Map<string, number>();
      for (const c of of) { const id = c.ref.id.split("_").slice(1).join("_"); perMachine.set(id, (perMachine.get(id) ?? 0) + 1); }
      console.log(`   per machine: ${[...perMachine].sort().map(([id, n]) => `${id} ${n}`).join(", ")}`);
    }
  }
  for (const w of warnings) console.log(`WARNING: ${w}`);
  console.log(`\n${changes.length} documents to write in all.`);
  if (!commit) { console.log(`DRY RUN: nothing written. To write: --commit --expect ${changes.length}, then: npx tsx scripts/rebuild-machine-fit.ts --commit`); process.exit(0); }
  if (String(changes.length) !== String(expect)) throw new Error(`--expect ${expect} but ${changes.length} documents to write. Nothing written.`);

  const outDir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(outDir, `dial-rename-backup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(Object.fromEntries(changes.map((c) => [c.ref.path, c.before])), null, 2));
  if (!fs.existsSync(backupFile)) throw new Error("The backup file was not written. Nothing written.");
  console.log(`Saved what was there: ${backupFile}`);

  let batch = db.batch();
  let ops = 0;
  let written = 0;
  for (const c of changes) {
    if (Array.isArray(c.update)) {
      const [first, ...rest] = c.update;
      batch.update(c.ref, first[0], first[1], ...rest.flat());
    } else {
      batch.update(c.ref, c.update);
    }
    ops += 1;
    written += 1;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  console.log(`Wrote ${written} documents.`);

  const repoLetters = path.resolve(process.cwd(), "src/features/filemaker-import/letters-strongsville.csv");
  const workingLetters = path.resolve(process.cwd(), "backups/filemaker/letters-strongsville.csv");
  if (fs.existsSync(repoLetters) && fs.existsSync(workingLetters) && fs.readFileSync(repoLetters, "utf-8") !== fs.readFileSync(workingLetters, "utf-8")) {
    const kept = path.resolve(process.cwd(), `backups/filemaker/letters-strongsville.before-rename-${stamp}.csv`);
    fs.copyFileSync(workingLetters, kept);
    fs.copyFileSync(repoLetters, workingLetters);
    console.log(`Letters table: the import tools' copy now matches the repo's (the old one kept as ${kept}).`);
  }
  console.log("Now: npx tsx scripts/rebuild-machine-fit.ts --commit");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
