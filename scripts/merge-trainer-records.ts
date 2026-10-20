/**
 * Fold a trainer's old record into the one they sign in to. DRY RUN BY DEFAULT.
 *
 * Why (the sign-in email round, Oct 20 2026): a trainer on Mindbody's staff
 * list has an August record that every Mindbody booking points at. Their
 * first Microsoft sign-in, approved the old way, made a second record at
 * their uid with no Mindbody link, so the Hub's cards and the trainer were
 * on different records. The pure half, and the list of fields that hold a
 * trainer's id, is scripts/lib/merge-trainer-core.ts.
 *
 * WHAT IT WRITES (merge):
 *   - the kept record (--into, the person's uid): the Mindbody staff id and
 *     anything else it lacks from the old one, and claimedFromId;
 *   - every document whose trainer field holds the old id: bookings
 *     (schedules.trainerId, past and future), sessions, routines, reports,
 *     clients' primary/top trainer, a studio's head trainer;
 *   - the old record (--from): a tombstone, supersededByUid → the kept one,
 *     its staff id cleared (kept as mergedMindbodyStaffId). Never deleted.
 * --bookings-only (AJ's own case): only bookings and sessions move; neither
 * record changes but claimedFromId on the kept one.
 *
 * SAFE TO RUN TWICE: a second run finds nothing pointing at the old id and a
 * tombstone already in place, and writes nothing. It REFUSES, writing
 * nothing, when the kept record isn't a signed-in account, when the two
 * carry different Mindbody staff ids, or when either record changes between
 * the read and the write.
 *
 * UNDO: with --commit, every document's id and old value goes to
 * backups/merge-trainer-records-*.json first.
 *
 * USAGE (PowerShell, from the project folder, where .env and
 * service-account.json are):
 *   npx tsx scripts/merge-trainer-records.ts --from <old id> --into <uid>
 *   npx tsx scripts/merge-trainer-records.ts --from <old id> --into <uid> --commit --expect N
 *   add --bookings-only to move only bookings and sessions
 * --expect is the number of writes the dry run says it will make.
 */

import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";
import { checkMerge, chunks, keptPatch, referencesFor, tombstonePatch, type Mode } from "./lib/merge-trainer-core.ts";

function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

async function main() {
  const fromId = flag("from") ?? "";
  const intoId = flag("into") ?? "";
  const mode: Mode = hasFlag("bookings-only") ? "bookings-only" : "merge";
  const commit = hasFlag("commit");
  const expectRaw = flag("expect");
  if (!fromId || !intoId) stop("Pass --from <old record id> --into <the uid record they sign in to>.");
  if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) stop(`--expect needs a whole number (it says "${expectRaw}").`);
  if (commit && expectRaw === undefined) stop("--commit needs --expect N, N being the writes the dry run says it will make.");
  console.log(`${commit ? "COMMIT" : "DRY RUN"} (${mode}): trainers/${fromId} → trainers/${intoId}${commit ? "" : ". Nothing will be written."}`);

  const db = connectFirestore();
  const fromRef = db.doc(`trainers/${fromId}`);
  const intoRef = db.doc(`trainers/${intoId}`);
  const [fromSnap, intoSnap] = await Promise.all([fromRef.get(), intoRef.get()]);
  const from = fromSnap.exists ? (fromSnap.data() as Record<string, unknown>) : null;
  const into = intoSnap.exists ? (intoSnap.data() as Record<string, unknown>) : null;
  const check = checkMerge(fromId, from, intoId, into, mode);
  if (!check.ok) stop(check.reason!);
  console.log(`\n  old:  ${from!.fullName} · ${from!.email || "no email"} · Mindbody ${from!.mindbodyStaffId || "none"} · ${from!.role || "no role"}`);
  console.log(`  kept: ${into!.fullName} · ${into!.email || "no email"} · Mindbody ${into!.mindbodyStaffId || "none"} · ${into!.role || "no role"}`);

  // Every document pointing at the old id.
  const moves: Array<{ path: string; field: string }> = [];
  console.log("\nPointing at the old record:");
  for (const ref of referencesFor(mode)) {
    const snap = await db.collection(ref.collection).where(ref.field, "==", fromId).get();
    console.log(`  ${ref.collection}.${ref.field}: ${snap.size}`);
    for (const d of snap.docs) moves.push({ path: d.ref.path, field: ref.field });
  }

  const nowIso = new Date().toISOString();
  const kept = keptPatch(from!, into!, fromId, mode);
  const tomb = mode === "merge" && !from!.supersededByUid ? tombstonePatch(from!, intoId, nowIso) : null;
  console.log("\nThe kept record takes:", Object.keys(kept).length ? JSON.stringify(kept) : "nothing");
  if (tomb) console.log("The old record becomes:", JSON.stringify(tomb));

  const writes = moves.length + (Object.keys(kept).length ? 1 : 0) + (tomb ? 1 : 0);
  console.log(`\nWrites: ${writes} (a session with two trainer fields counts twice)`);
  if (!commit) {
    if (writes > 0) {
      console.log(
        `Nothing was written. To write it: npx tsx scripts/merge-trainer-records.ts --from ${fromId} --into ${intoId}${mode === "bookings-only" ? " --bookings-only" : ""} --commit --expect ${writes}`,
      );
    }
    return;
  }
  if (Number(expectRaw) !== writes) stop(`--expect ${expectRaw}, but this run would write ${writes}. Run the dry run again and look at what changed.`);
  if (writes === 0) return;

  const backup = writeReport("merge-trainer-records", {
    mode,
    fromId,
    intoId,
    readAt: nowIso,
    from,
    into,
    moved: moves.map((m) => ({ ...m, was: fromId })),
    kept,
    tomb,
  });
  console.log(`\nBefore, saved to ${backup}`);

  // The kept record first: if anything stops after it, the person already has
  // the Mindbody link, and a re-run finishes the rest.
  if (Object.keys(kept).length) await intoRef.update(kept, { lastUpdateTime: intoSnap.updateTime! });
  let done = 0;
  for (const group of chunks(moves)) {
    const batch = db.batch();
    for (const m of group) batch.update(db.doc(m.path), { [m.field]: intoId });
    await batch.commit();
    done += group.length;
    console.log(`  moved ${done} of ${moves.length}`);
  }
  // The tombstone last, conditioned on the old record not having changed.
  if (tomb) await fromRef.update(tomb, { lastUpdateTime: fromSnap.updateTime! });
  console.log(`Written: ${writes} writes. ${into!.fullName}'s bookings now point at trainers/${intoId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
