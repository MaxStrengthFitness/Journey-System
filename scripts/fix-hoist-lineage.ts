/**
 * Strongsville's Hoist leg press: give it the Leg Press's lineage, so the
 * floor shows it the leg press's clinical watch-outs. DRY RUN BY DEFAULT.
 *
 * Why (Oct 15 2026): a studio-built machine is matched to Max Strength's
 * clinical watch-outs through its lineage, `basedOn` (the editor's "Most
 * like"; `comparisonKey` is `basedOn ?? machineId`, lib/clinical-watchouts.ts).
 * The Hoist (`studios/BVDDRe5AqQZFihRLW0vK/roster/sm-BVDDRe5AqQZFihRLW0vK-
 * hoist-leg-press`) was made on Sep 9 2026 with none, so it is matched by its
 * name alone, which names no machine the clinical matrix knows: with every
 * flag on it shows 0 leg-press watch-outs, where the standard Leg Press shows
 * 8 (a knee replacement, osteoporosis, a hernia...). Its movement pattern is
 * "Upper Body: Horizontal Push", the blank form's default that day, not a
 * person's choice (docs/KNOWN-TRAPS.md, "emptyMachineDefinition() must not
 * guess the taxonomy").
 *
 * WHAT IT WRITES: that ONE document, by dotted path, nothing else in it moving:
 *   basedOn                     (none) → "m-leg-press"
 *   definition.movementPattern  "Upper Body: Horizontal Push" → "Lower Body: Quad Dominant"
 *   updatedAt, updatedBy        the server's time, "fix-hoist-lineage"
 * The region stays "Hamstring / Glute": a person chose it (AJ, Oct 15 2026:
 * "keep the region Hamstring / Glute"). No client, session, routine, setting
 * or other machine is touched, and nothing asks Mindbody anything.
 *
 * SAFE TO RUN TWICE: a field already at its new value is skipped. It REFUSES,
 * writing nothing, when a field holds anything other than what was read on
 * Oct 15 2026 (a person's newer edit), when the machine isn't a studio-built
 * leg press, or when its definition names a lineage of its own. The write is
 * conditioned on the document's last update time, so an edit between the
 * read and the write fails it rather than being overwritten.
 *
 * UNDO: with --commit, the fields as they were (and the previous updatedAt /
 * updatedBy, which the write replaces) go to backups/fix-hoist-lineage-*.json
 * before anything is written. `--revert` puts the two fields back the same
 * way (dry run first, then `--revert --commit --expect 1`).
 *
 * USAGE (PowerShell, from the project folder, where .env and
 * service-account.json are):
 *   npx tsx scripts/fix-hoist-lineage.ts                        what it would change
 *   npx tsx scripts/fix-hoist-lineage.ts --commit --expect 1    write it
 *   npx tsx scripts/fix-hoist-lineage.ts --revert               what the undo would change
 * --expect is the number of documents the dry run says it will write (1, or
 * 0 when there is nothing to do); a different number stops the run.
 *
 * docs/rounds/2026-10-15-hoist-lineage.md is the round.
 */

import { FieldValue } from "firebase-admin/firestore";
import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";
import {
  HOIST_PATH,
  applyChanges,
  planHoistLineage,
  updateOf,
  watchOutCount,
  type Direction,
} from "./lib/fix-hoist-lineage-core.ts";
import { withoutUndefined } from "../src/features/studio-tasks/task-wizard.ts";

function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

const asIso = (v: unknown): string | null =>
  v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate: () => Date }).toDate().toISOString() : null;

async function main() {
  const commit = hasFlag("commit");
  const direction: Direction = hasFlag("revert") ? "revert" : "fix";
  const expectRaw = flag("expect");
  if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) stop(`--expect needs a whole number (it says "${expectRaw}").`);
  if (commit && expectRaw === undefined) stop("--commit needs --expect N, N being the documents the dry run says it will write.");

  console.log(commit ? `COMMIT (${direction}): the Hoist's document will be written.` : `DRY RUN (${direction}): nothing will be written.`);
  const db = connectFirestore();
  const ref = db.doc(HOIST_PATH);
  const snap = await ref.get();
  const doc = snap.exists ? (snap.data() as Record<string, unknown>) : null;

  console.log(`\n${HOIST_PATH}`);
  const plan = planHoistLineage(doc, direction);
  if (!plan.ok) stop(plan.reason ?? "refused");
  const def = (doc!.definition ?? {}) as Record<string, unknown>;
  console.log(`  name: ${JSON.stringify(def.name ?? null)} · region: ${JSON.stringify(def.anatomicalRegion ?? null)} (left alone)`);
  console.log(`  last written: ${asIso(doc!.updatedAt) ?? "unknown"} by ${String(doc!.updatedBy ?? "unknown")}`);

  const writes = plan.changes.length > 0 ? 1 : 0;
  if (writes === 0) {
    console.log(`\nNothing to change: the ${direction === "fix" ? "fix is already in" : "fix is already undone"}.`);
  } else {
    console.log("\nChanges:");
    for (const c of plan.changes) console.log(`  ${c.field}: ${JSON.stringify(c.from)} → ${c.to === null ? "(removed)" : JSON.stringify(c.to)}`);
    console.log(`  updatedAt: server time · updatedBy: "fix-hoist-lineage"`);
  }
  console.log(
    `\nLeg-press watch-outs on the floor, every clinical flag on: ${watchOutCount(doc!)} now → ${watchOutCount(applyChanges(doc!, plan.changes))} after.`,
  );
  console.log(`\nDocuments to write: ${writes}`);

  if (!commit) {
    if (writes > 0) console.log(`Nothing was written. To write it: npx tsx scripts/fix-hoist-lineage.ts${direction === "revert" ? " --revert" : ""} --commit --expect ${writes}`);
    return;
  }
  if (Number(expectRaw) !== writes) stop(`--expect ${expectRaw}, but this run would write ${writes}. Run the dry run again and look at what changed.`);
  if (writes === 0) return;

  const backup = writeReport("fix-hoist-lineage", {
    path: HOIST_PATH,
    direction,
    readAt: new Date().toISOString(),
    documentUpdateTime: snap.updateTime?.toDate().toISOString() ?? null,
    before: {
      basedOn: doc!.basedOn ?? null,
      "definition.movementPattern": def.movementPattern ?? null,
      "definition.anatomicalRegion": def.anatomicalRegion ?? null,
      updatedAt: asIso(doc!.updatedAt),
      updatedBy: doc!.updatedBy ?? null,
    },
    changes: plan.changes,
  });
  console.log(`\nBefore, saved to ${backup}`);

  const update = withoutUndefined(updateOf(plan.changes, { now: FieldValue.serverTimestamp(), remove: FieldValue.delete() }));
  await ref.update(update, { lastUpdateTime: snap.updateTime! });

  const after = await ref.get();
  const a = after.data() as Record<string, unknown>;
  const ad = (a.definition ?? {}) as Record<string, unknown>;
  console.log(`Written. Now: basedOn ${JSON.stringify(a.basedOn ?? null)} · definition.movementPattern ${JSON.stringify(ad.movementPattern ?? null)} · region ${JSON.stringify(ad.anatomicalRegion ?? null)}`);
  console.log(`Leg-press watch-outs on the floor now: ${watchOutCount(a)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
