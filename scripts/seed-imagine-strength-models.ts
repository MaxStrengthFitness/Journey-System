/**
 * Records the twenty Imagine Strength models, each with its frame's size,
 * as head office's model records (the studio map, Oct 2026; read
 * src/features/studio-map/imagine-strength.ts first, and the round
 * document's design §D).
 *
 * DRY RUN BY DEFAULT: it reads which of the twenty are already there, says
 * what it would write (each size in feet and inches, each note it stores,
 * and the dry-run-only facts behind them), and writes nothing without
 * --commit.
 *
 * WHAT. machineModels/{id} for each of the twenty MSF movements:
 *   { brand: "Imagine Strength", model, movementId,
 *     size: { lengthMm, widthMm, heightMm, source, note? },
 *     updatedAt: server time, updatedBy: "seed:imagine-strength-2026" }
 * No dials and no notes. The ids are modelIdFor("Imagine Strength", model).
 *
 * CREATE-ONLY. An id that is there now (an administrator may have edited it)
 * is skipped and named, and the write itself is a create, which Firestore
 * refuses for a document that exists. All twenty go in one batch, all or
 * nothing. A second run says "Nothing to write."
 *
 * IT TOUCHES NO ROSTER ENTRY. Which units are Imagine Strength is each
 * studio's leaders' to say, on My Studio → Machines → Layout → Sizes: a
 * seed can't know which floor's units are (AJ's floors are mixed).
 *
 * THE WAY BACK: --remove (dry run first, then --remove --commit) deletes
 * only the twenty still signed by the seed (no administrator has saved them
 * since), and refuses any a studio's unit still names, listing those units.
 *
 * USAGE (PowerShell, from the project folder, after the app is live)
 *
 *   Against production (needs service-account.json, scripts/lib/admin.ts),
 *   which it refuses unless you type the project id again:
 *     npx tsx scripts/seed-imagine-strength-models.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
 *       dry run: read the twenty lines
 *     npx tsx scripts/seed-imagine-strength-models.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --commit
 *       writes them
 *
 *   Against an emulator (nothing leaves this computer):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/seed-imagine-strength-models.ts --project demo-perf-lab --commit
 *
 * It imports only pure modules from src (no React, no browser Firebase).
 */

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  IMAGINE_STRENGTH_MODELS,
  IMAGINE_STRENGTH_SEED_BY,
  IMAGINE_STRENGTH_SOURCES,
  removePlan,
  seedModelDocument,
  seedPlan,
} from "../src/features/studio-map/imagine-strength.ts";
import { draftOf, modelProblems } from "../src/features/machine-codex/models.ts";
import { sizeLine } from "../src/features/studio-map/units.ts";

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const COLLECTION = "machineModels";

async function connect(): Promise<Firestore> {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    // The emulator: no credential, no .env, and only on this computer.
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
      `Refusing: this would write to ${projectId ?? "an unknown project"} (database ${databaseId}). ` +
        `Type the project id again with --confirm-project ${projectId ?? "<id>"} to go on.`,
    );
  }
  return admin.connectFirestore();
}

function footer() {
  console.log("");
  console.log(`Source: ${IMAGINE_STRENGTH_SOURCES.brochure}`);
  console.log("Cross-checked against Triumph Fitness's pages:");
  for (const url of IMAGINE_STRENGTH_SOURCES.crossChecks) console.log(`  ${url}`);
}

async function seed(db: Firestore, commit: boolean) {
  const refs = IMAGINE_STRENGTH_MODELS.map((r) => db.collection(COLLECTION).doc(r.id));
  const snaps = await db.getAll(...refs);
  const existing = new Set(snaps.filter((s) => s.exists).map((s) => s.id));
  const plan = seedPlan(existing);

  for (const id of plan.skip) console.log(`  = ${id}  already there; an administrator may have edited it, left as it is`);
  for (const row of plan.write) {
    const doc = seedModelDocument(row);
    const problems = modelProblems(draftOf(doc));
    if (problems.length > 0) throw new Error(`${row.id} is not a model the editor would save: ${problems.join(" ")}`);
    console.log(`  + ${row.id}  would write "${row.model}" for ${row.movementId}`);
    console.log(`      ${sizeLine(doc.size)}${row.flags.length ? `  [${row.flags.join(", ")}]` : ""}`);
    if (doc.size.note) console.log(`      stored note: ${doc.size.note}`);
    if (row.dryRunOnly) console.log(`      not stored: ${row.dryRunOnly}`);
  }
  footer();

  if (plan.write.length === 0) {
    console.log("Nothing to write.");
    return;
  }
  if (!commit) {
    console.log(`Nothing was written. Add --commit to write these ${plan.write.length}.`);
    return;
  }

  // One batch of creates: all of them or none, and a create never replaces a document.
  const batch = db.batch();
  for (const row of plan.write) {
    batch.create(db.collection(COLLECTION).doc(row.id), {
      ...seedModelDocument(row),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: IMAGINE_STRENGTH_SEED_BY,
    });
  }
  await batch.commit();
  console.log(`Wrote ${plan.write.length} models to ${COLLECTION}.`);
  console.log(
    "Next, in the app: at each studio whose machines are Imagine Strength, My Studio → Machines → Layout → Sizes, " +
      "tick the machines that are, then Mark them.",
  );
}

async function remove(db: Firestore, commit: boolean) {
  const refs = IMAGINE_STRENGTH_MODELS.map((r) => db.collection(COLLECTION).doc(r.id));
  const snaps = await db.getAll(...refs);
  const found: Record<string, { updatedBy: unknown } | null> = {};
  for (const s of snaps) found[s.id] = s.exists ? { updatedBy: s.get("updatedBy") } : null;

  // Which units name one of the twenty: each studio's roster, read whole.
  const ids = new Set(IMAGINE_STRENGTH_MODELS.map((r) => r.id));
  const namedBy: Record<string, string[]> = {};
  const studios = await db.collection("studios").get();
  for (const studio of studios.docs) {
    const roster = await db.collection("studios").doc(studio.id).collection("roster").get();
    for (const entry of roster.docs) {
      const modelId = entry.get("modelId");
      if (typeof modelId === "string" && ids.has(modelId)) (namedBy[modelId] ??= []).push(`${studio.id}/${entry.id}`);
    }
  }
  console.log(`Read ${studios.size} studios' rosters.`);

  const plan = removePlan(found, namedBy);
  for (const id of plan.absent) console.log(`  . ${id}  not there`);
  for (const id of plan.edited) console.log(`  = ${id}  saved by an administrator since the seed, left as it is`);
  for (const { id, units } of plan.named) console.log(`  ! ${id}  still named by ${units.join(", ")}: refused`);
  for (const id of plan.remove) console.log(`  - ${id}  would delete`);

  if (plan.remove.length === 0) {
    console.log("Nothing to remove.");
    return;
  }
  if (!commit) {
    console.log(`Nothing was removed. Add --commit to delete these ${plan.remove.length}.`);
    return;
  }
  const batch = db.batch();
  for (const id of plan.remove) batch.delete(db.collection(COLLECTION).doc(id));
  await batch.commit();
  console.log(`Deleted ${plan.remove.length} models from ${COLLECTION}.`);
}

async function main() {
  const commit = hasFlag("commit");
  const removing = hasFlag("remove");
  const db = await connect();
  console.log(
    commit
      ? removing
        ? "COMMIT: the seed's models below will be removed."
        : "COMMIT: the models below will be written."
      : "DRY RUN: nothing will be written.",
  );
  if (removing) await remove(db, commit);
  else await seed(db, commit);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
