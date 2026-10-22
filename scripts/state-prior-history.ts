/**
 * SESSIONS BEFORE JOURNEY, STATED FROM A SHEET (Oct 22 2026, Stage 3 of the
 * Strongsville import, rule R13). The one way a person's answer on the
 * numbering sheet becomes a client's prior record, written exactly as
 * Account's "Sessions before Journey" writes it (`statePriorHistory`: the
 * stated total, through the last FileMaker day, source filemaker, the
 * person's name; `importedCount` and `from` carried over). Never without a
 * name: a prior record is always someone's statement
 * (docs/business/migration-and-prior-history.md).
 *
 * The sheet: backups/filemaker/tools/build-numbering-sheet.mts makes it; the
 * leaders fill `answer` (confirm, or a number), `by` and `note`; this reads
 * it. The pure half (what each row means) is
 * src/features/filemaker-import/prior-sheet.ts, with its tests.
 *
 * DRY RUN BY DEFAULT. --commit writes, and only with --expect N, N being the
 * dry run's count of records to write. Writes `priorHistory` and nothing
 * else on each client (`changedPatch`'s spirit: one field, never a whole
 * client read back). Run it BEFORE those clients' import: the importer
 * numbers from the stated total (`numberOffsetFor`).
 *
 *   npx tsx scripts/state-prior-history.ts backups\filemaker\numbering-sheet-strongsville.csv
 *   npx tsx scripts/state-prior-history.ts backups\filemaker\numbering-sheet-strongsville.csv --commit --expect 21
 */

import fs from "fs";
import Papa from "papaparse";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { argv, connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { planSheet, SHEET_COLUMNS, type SheetRow } from "../src/features/filemaker-import/prior-sheet.ts";
import { priorHistoryOf } from "../src/lib/prior-history.ts";

const sheetPath = argv.find((a) => !a.startsWith("--"));
const commit = hasFlag("commit");
const expectRaw = flag("expect");
if (!sheetPath || !fs.existsSync(sheetPath)) {
  console.error("Give the sheet (a CSV from build-numbering-sheet.mts, answered).");
  process.exit(1);
}
if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) {
  console.error(`--expect needs a whole number (it says "${expectRaw}").`);
  process.exit(1);
}
if (commit && expectRaw === undefined) {
  console.error("--commit needs --expect N, N being the dry run's count of records to write.");
  process.exit(1);
}

const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(sheetPath, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
const missing = SHEET_COLUMNS.filter((c) => !parsed.meta.fields?.includes(c));
if (missing.length) {
  console.error(`The sheet lacks the columns ${missing.join(", ")}.`);
  process.exit(1);
}
const num = (v: string | undefined): number | null => (v !== undefined && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const rows: SheetRow[] = parsed.data.map((r) => ({
  clientId: (r.clientId ?? "").trim(),
  name: (r.name ?? "").trim(),
  mindbodyVisits: num(r.mindbodyVisits),
  mindbodyAsOf: (r.mindbodyAsOf ?? "").trim() || null,
  fmVisits: num(r.fmVisits) ?? 0,
  fmVisitsAfter: num(r.fmVisitsAfter) ?? 0,
  through: (r.through ?? "").trim(),
  suggested: num(r.suggested),
  answer: r.answer ?? "",
  by: r.by ?? "",
  note: r.note ?? "",
}));

async function main() {
  const db = connectFirestore();
  console.log(commit ? "COMMIT: the records below will be written." : "DRY RUN: nothing will be written.");
  console.log(`${rows.length} rows on the sheet.`);
  const existing = new Map<string, ReturnType<typeof priorHistoryOf>>();
  const snaps = await db.getAll(...rows.filter((r) => r.clientId).map((r) => db.doc(`clients/${r.clientId}`)));
  const present = new Set<string>();
  for (const s of snaps) {
    if (!s.exists) continue;
    present.add(s.id);
    existing.set(s.id, priorHistoryOf(s.data() as DocumentData));
  }
  const plan = planSheet(rows.filter((r) => r.clientId && present.has(r.clientId)), existing);
  for (const r of rows) if (r.clientId && !present.has(r.clientId)) plan.skipped.push({ clientId: r.clientId, name: r.name, why: "no such client in Journey" });

  for (const w of plan.writes) console.log(`  WRITE clients/${w.clientId} (${w.name}): ${w.sessions} sessions through ${w.record.through}, by ${w.record.recordedByName}${w.record.importedCount ? `; importedCount ${w.record.importedCount} kept` : ""}`);
  for (const s of plan.skipped) console.log(`  skip  clients/${s.clientId} (${s.name}): ${s.why}`);
  console.log(`\n${plan.writes.length} record(s) to write, ${plan.skipped.length} row(s) skipped.`);

  if (!commit) {
    if (plan.writes.length) console.log(`Nothing was written. To commit exactly this, add: --commit --expect ${plan.writes.length}`);
    return;
  }
  if (Number(expectRaw) !== plan.writes.length) {
    console.error(`Refusing: --expect ${expectRaw}, but this run would write ${plan.writes.length}. Nothing was written.`);
    process.exit(1);
  }
  let written = 0;
  for (const w of plan.writes) {
    await db.doc(`clients/${w.clientId}`).update({ priorHistory: { ...w.record, recordedAt: FieldValue.serverTimestamp() } });
    written += 1;
  }
  console.log(`DONE: ${written} record(s) written. The importer will number those clients from their stated totals.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err?.message || err);
    process.exit(1);
  });
