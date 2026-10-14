/**
 * Builds westlake's and Willoughby's floors (studios/{s}/roster) from
 * FileMaker's machines, in FileMaker's order (Oct 12 2026; AJ: "using these
 * we can build the floors for westlake and willoughby"). Read
 * src/features/filemaker-floors/README.md first: what each unit becomes and
 * why lives there and in plan.ts; this file only reads, prints and writes.
 *
 * DRY RUN BY DEFAULT. It reads the catalog, the machine models, each
 * studio's name and its floor, and prints every unit it would write with
 * BOTH sets of dials (FileMaker's letters and the MSF standard's). Nothing
 * is written without --commit.
 *
 * THREE THINGS IT DOES
 *
 *   build (the default)   Writes a studio's floor. REFUSED for a studio that
 *                         already has any machine on its floor: a floor a
 *                         person has started is theirs. --commit needs
 *                         --dials standard or --dials filemaker (AJ: "we
 *                         will have to decide on this later, build both").
 *                         One batch of creates per studio; a refusal of
 *                         either studio stops the whole run, so a run writes
 *                         every floor it was asked for or none.
 *
 *   --switch-dials X      On a floor this script built, gives every unit
 *                         the other set of dials. Only the dials move, and
 *                         a unit a person has saved since (its updatedBy is
 *                         no longer the script's) is named and left alone.
 *
 *   --remove              The way back, for before trainers use the floor:
 *                         deletes only the units that are EXACTLY as the
 *                         script wrote them (some app writes, a unit's size
 *                         or model, leave updatedBy alone, so the signature
 *                         alone is not proof nobody touched one). Once a unit has sessions on it, take
 *                         it off the floor in the app instead (My Studio →
 *                         Machines), which keeps its history.
 *
 * Every write signs updatedBy "floors-from-filemaker" and the server's time.
 * No app code, rule, index, Function or Mindbody call is involved.
 *
 * USAGE (PowerShell, from the project folder)
 *
 *   Against production (needs service-account.json, scripts/lib/admin.ts),
 *   refused unless you type the project id again:
 *     npx tsx scripts/build-floors-from-filemaker.ts --confirm-project gen-lang-client-0731527386
 *       dry run, both studios
 *     npx tsx scripts/build-floors-from-filemaker.ts --confirm-project gen-lang-client-0731527386 --dials filemaker --commit
 *       writes both floors with FileMaker's dials
 *     npx tsx scripts/build-floors-from-filemaker.ts --confirm-project gen-lang-client-0731527386 --switch-dials standard
 *       dry run of switching to the standard's dials (add --commit to do it)
 *   Add --studio westlake or --studio willoughby for one studio.
 *
 *   Against an emulator (nothing leaves this computer):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/build-floors-from-filemaker.ts --project demo-perf-lab --dials filemaker --commit
 *
 * It imports only pure modules from src (no React, no browser Firebase).
 */

import fs from "fs";
import path from "path";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { FILEMAKER_FLOORS, type FilemakerFloor } from "../src/features/filemaker-floors/floors.ts";
import {
  FLOORS_SCRIPT_SIGNATURE,
  planDialSwitch,
  planFloor,
  planRemove,
  unitsNotInTable,
  type CatalogDoc,
  type DialSet,
  type FloorPlan,
} from "../src/features/filemaker-floors/plan.ts";

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const asDials = (v: string | undefined, name: string): DialSet | undefined => {
  if (v === undefined) return undefined;
  if (v === "standard" || v === "filemaker") return v;
  throw new Error(`--${name} takes "standard" or "filemaker", not "${v}".`);
};

async function connect(): Promise<Firestore> {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    // The emulator: no credential, and only on this computer.
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) {
      throw new Error(`Refusing: FIRESTORE_EMULATOR_HOST is ${emulator}, not this computer.`);
    }
    const projectId = flag("project") || process.env.GCLOUD_PROJECT;
    if (!projectId) throw new Error("Pass --project (the emulator's project, e.g. demo-perf-lab).");
    const databaseId = flag("database") || "(default)";
    console.log(`Firestore EMULATOR at ${emulator}: project ${projectId}, database ${databaseId}`);
    const app = initializeApp({ projectId });
    return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
  }

  // A real project: refused unless its id is typed a second time.
  const admin = await import("./lib/admin.ts");
  const { projectId, databaseId } = admin.resolveTarget();
  const confirmed = flag("confirm-project");
  if (!projectId || confirmed !== projectId) {
    throw new Error(
      `Refusing: this would read and write ${projectId ?? "an unknown project"} (database ${databaseId}). ` +
        `Type the project id again with --confirm-project ${projectId ?? "<id>"} to go on.`,
    );
  }
  return admin.connectFirestore();
}

function chosenFloors(): FilemakerFloor[] {
  const only = flag("studio");
  if (!only) return [...FILEMAKER_FLOORS];
  const floor = FILEMAKER_FLOORS.find((f) => f.key === only.toLowerCase());
  if (!floor) throw new Error(`--studio takes ${FILEMAKER_FLOORS.map((f) => f.key).join(" or ")}, not "${only}".`);
  return [floor];
}

async function readCatalog(db: Firestore): Promise<Record<string, CatalogDoc>> {
  const snap = await db.collection("machines").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
}

/** The studio is the one the table says, by its name: an id typed wrong never gets a floor. */
async function checkStudio(db: Firestore, floor: FilemakerFloor): Promise<void> {
  const snap = await db.collection("studios").doc(floor.studioId).get();
  if (!snap.exists) throw new Error(`No studio ${floor.studioId} (${floor.key}).`);
  const name = String(snap.get("name") ?? "").trim();
  if (name.toLowerCase() !== floor.studioName.toLowerCase()) {
    throw new Error(`Studio ${floor.studioId} is called "${name}", not "${floor.studioName}". Nothing written.`);
  }
}

async function readRoster(db: Firestore, studioId: string): Promise<Record<string, Record<string, unknown>>> {
  const snap = await db.collection("studios").doc(studioId).collection("roster").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}

async function checkModels(db: Firestore, plan: FloorPlan): Promise<string[]> {
  const ids = [...new Set(plan.units.map((u) => u.modelId).filter((m): m is string => !!m))];
  if (!ids.length) return [];
  const snaps = await db.getAll(...ids.map((id) => db.collection("machineModels").doc(id)));
  return snaps.filter((s) => !s.exists).map((s) => `the model ${s.id} is not in machineModels (run scripts/seed-imagine-strength-models.ts first)`);
}

const KIND_WORDS = { standard: "follows the standard", second: "another unit of", own: "the studio's own machine" } as const;

function printPlan(floor: FilemakerFloor, plan: FloorPlan, catalog: Record<string, CatalogDoc>) {
  for (const u of plan.units) {
    const movementName = u.movement ? String(catalog[u.movement]?.name ?? u.movement) : "";
    const kind =
      u.kind === "standard" ? `${KIND_WORDS.standard} (${movementName})` : u.kind === "second" ? `${KIND_WORDS.second} ${movementName}` : KIND_WORDS.own;
    console.log(`  ${String(u.order).padStart(2)}  ${u.fm.padEnd(22)} ${kind}`);
    console.log(`      id ${u.id}${u.modelId ? `  ·  model ${u.modelId}` : ""}`);
    const fm = u.filemakerDials.join(", ") || "none";
    const std = u.standardDials.join(", ") || "none";
    console.log(fm === std ? `      dials: ${fm}` : `      dials: FileMaker ${fm}  ·  standard ${std}`);
  }
  const kinds = plan.units.map((u) => u.kind);
  console.log(
    `  ${floor.key}: ${plan.units.length} units — ${kinds.filter((k) => k === "standard").length} follow the standard, ` +
      `${kinds.filter((k) => k === "second").length} more units of a movement, ${kinds.filter((k) => k === "own").length} the studio's own.`,
  );
}

function writeReport(name: string, data: unknown): string {
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function build(db: Firestore, floors: FilemakerFloor[], catalog: Record<string, CatalogDoc>, commit: boolean) {
  const dials = asDials(flag("dials"), "dials");
  if (commit && !dials) {
    throw new Error('--commit needs --dials standard or --dials filemaker (the dry run shows both). Nothing written.');
  }
  const report: Record<string, unknown> = {};
  const ready: { floor: FilemakerFloor; plan: FloorPlan }[] = [];

  for (const floor of floors) {
    await checkStudio(db, floor);
    const roster = await readRoster(db, floor.studioId);
    const plan = planFloor(floor, catalog, dials ?? "standard");
    console.log("");
    console.log(`${floor.studioName} (${floor.studioId})`);
    // With no set chosen yet, both are checked: either may be the one written.
    const other = dials ? [] : planFloor(floor, catalog, "filemaker").problems;
    const problems = [...new Set([...plan.problems, ...other]), ...(await checkModels(db, plan))];
    const held = Object.keys(roster).length;
    if (held > 0) problems.push(`its floor already has ${held} machine${held === 1 ? "" : "s"}: a floor a person has started is theirs`);
    printPlan(floor, plan, catalog);
    report[floor.key] = { dials: dials ?? "not chosen", problems, units: plan.units.map(({ doc, ...u }) => ({ ...u, doc })) };
    if (problems.length) {
      for (const p of problems) console.log(`  REFUSED: ${p}`);
      continue;
    }
    ready.push({ floor, plan });
  }

  console.log("");
  console.log(`Report: ${writeReport("floors-from-filemaker", report)}`);
  // A run writes every floor it was asked for or none: a refusal stops the commit.
  if (commit && ready.length < floors.length) {
    throw new Error("A floor was refused (above), so nothing was written.");
  }
  if (!commit) {
    console.log(
      ready.length
        ? `Nothing was written. Add --dials standard or --dials filemaker, and --commit, to write ${ready.map((r) => r.floor.key).join(" and ")}.`
        : "Nothing was written, and nothing could be.",
    );
    return;
  }
  // ONE batch for every floor asked for (62 creates, under Firestore's 500): all of them or none.
  const batch = db.batch();
  for (const { floor, plan } of ready) {
    for (const u of plan.units) {
      batch.create(db.collection("studios").doc(floor.studioId).collection("roster").doc(u.id), {
        ...u.doc,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
  for (const { floor, plan } of ready) {
    console.log(`Wrote ${floor.studioName}'s floor: ${plan.units.length} machines, ${dials === "filemaker" ? "FileMaker's" : "the standard's"} dials.`);
  }
}

async function switchDials(db: Firestore, floors: FilemakerFloor[], catalog: Record<string, CatalogDoc>, dials: DialSet, commit: boolean) {
  for (const floor of floors) {
    await checkStudio(db, floor);
    const roster = await readRoster(db, floor.studioId);
    const plan = planDialSwitch(floor, catalog, roster, dials);
    console.log("");
    console.log(`${floor.studioName}: to ${dials === "filemaker" ? "FileMaker's" : "the standard's"} dials`);
    for (const u of plan.updates) console.log(`  ~ ${u.fm}  (${u.id})`);
    for (const s of plan.skipped) console.log(`  = ${s.fm}  (${s.id}): ${s.why}, left alone`);
    for (const id of unitsNotInTable(floor, catalog, roster)) console.log(`  ? ${id}: written by the script but no longer in the table, left alone`);
    console.log(`  ${plan.updates.length} to change, ${plan.unchanged.length} already right, ${plan.skipped.length} left alone.`);
    if (!commit || plan.updates.length === 0) continue;
    const batch = db.batch();
    for (const u of plan.updates) {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(u.fields)) fields[k] = v === null ? FieldValue.delete() : v;
      batch.update(db.collection("studios").doc(floor.studioId).collection("roster").doc(u.id), {
        ...fields,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: FLOORS_SCRIPT_SIGNATURE,
      });
    }
    await batch.commit();
    console.log(`  Changed ${plan.updates.length}.`);
  }
  if (!commit) console.log("\nNothing was written. Add --commit to make these changes.");
}

async function remove(db: Firestore, floors: FilemakerFloor[], catalog: Record<string, CatalogDoc>, commit: boolean) {
  for (const floor of floors) {
    await checkStudio(db, floor);
    const roster = await readRoster(db, floor.studioId);
    const plan = planRemove(floor, catalog, roster);
    console.log("");
    console.log(`${floor.studioName}: ${plan.remove.length} to delete, ${plan.kept.length} changed since the script wrote them (left alone)`);
    for (const k of plan.kept) console.log(`  = ${k.fm}  (${k.id})`);
    for (const id of plan.notInTable) console.log(`  ? ${id}: written by the script but no longer in the table, left alone`);
    if (!commit || plan.remove.length === 0) continue;
    const batch = db.batch();
    for (const { id } of plan.remove) batch.delete(db.collection("studios").doc(floor.studioId).collection("roster").doc(id));
    await batch.commit();
    console.log(`  Deleted ${plan.remove.length}.`);
  }
  if (!commit) console.log("\nNothing was deleted. Add --commit to delete them.");
}

async function main() {
  const commit = hasFlag("commit");
  const switching = asDials(flag("switch-dials"), "switch-dials");
  const removing = hasFlag("remove");
  if (switching && removing) throw new Error("--switch-dials and --remove are two different runs.");
  const db = await connect();
  console.log(commit ? "COMMIT: the changes below will be written." : "DRY RUN: nothing will be written.");
  const floors = chosenFloors();
  const catalog = await readCatalog(db);
  if (switching) await switchDials(db, floors, catalog, switching, commit);
  else if (removing) await remove(db, floors, catalog, commit);
  else await build(db, floors, catalog, commit);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
