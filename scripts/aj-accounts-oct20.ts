/**
 * AJ's four trainer records, sorted out. DRY RUN BY DEFAULT.
 *
 * Why (the sign-in email round, Oct 20 2026): AJ's first Microsoft sign-in
 * that morning made a new record (ajurgens@maxstrengthfitness.com, no
 * Mindbody id) beside three older ones. AJ: "i need to turn my
 * jurgensaj@gmail.com into a stricly admin account so i dont confuse it with
 * my trainer account", and "2a" to switching off the two leftovers at Solon.
 *
 * WHAT IT WRITES, four documents, each only the fields named:
 *   trainers/2GIp…  jurgensaj@gmail.com, Admin: the administrator only. Its
 *                   Mindbody staff id comes off (100000012 → ""), so
 *                   Strongsville's bookings stop pointing at it. Its role,
 *                   studios and the 9 sessions under it stay.
 *   trainers/3mAR…  ajurgens@maxstrengthfitness.com, Life Transformer at
 *                   Strongsville: the trainer account. It takes the
 *                   Mindbody staff id 100000012.
 *   trainers/QYRg…  "Austin Jurgens" at Solon, made Aug 7, never signed in:
 *                   switched off (Solon is another Mindbody site, so its
 *                   100000012 is probably not AJ there).
 *   trainers/bOmo…  "Austin J", ajjurgens1997@gmail.com at Solon, a test
 *                   account: switched off.
 * Switched off is the app's own write (features/sign-out/account-off.ts):
 * kept, signed and dated, refused at sign-in, back on from Change role.
 * Nothing is deleted, and nothing asks Mindbody anything.
 *
 * SAFE TO RUN TWICE: a field already at its new value is skipped. It REFUSES,
 * writing nothing, when a record no longer says what it said on Oct 20 2026
 * (its email, name or role), and each write is conditioned on the document's
 * last update time, so an edit between the read and the write fails it.
 *
 * UNDO: with --commit, the fields as they were go to
 * backups/aj-accounts-oct20-*.json first. Each can be put back by hand on
 * Operations → Staff (the Mindbody Staff ID box) or Change role (switch on).
 *
 * USAGE (PowerShell, from the project folder, where .env and
 * service-account.json are):
 *   npx tsx scripts/aj-accounts-oct20.ts                       what it would change
 *   npx tsx scripts/aj-accounts-oct20.ts --commit --expect 4   write it
 * --expect is the number of documents the dry run says it will write.
 */

import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";
import { switchOffPatch } from "../src/features/sign-out/account-off.ts";

const ADMIN_UID = "2GIpJh7FZkaFNu5z4diiKO1MsM02";
const BY = { uid: ADMIN_UID, name: "Austin Jurgens" };

interface Step {
  id: string;
  what: string;
  /** What the record must still say, or the run stops. */
  expect: Record<string, unknown>;
  /** The fields to write. */
  set: Record<string, unknown>;
}

function steps(nowIso: string): Step[] {
  return [
    {
      id: ADMIN_UID,
      what: "jurgensaj@gmail.com: administrator only",
      expect: { email: "jurgensaj@gmail.com", role: "Admin" },
      set: { mindbodyStaffId: "", mindbodyLinked: false },
    },
    {
      id: "3mARuqFyLxeOHZkSiW6dhbD1XdQ2",
      what: "ajurgens@maxstrengthfitness.com: the trainer account",
      expect: { email: "ajurgens@maxstrengthfitness.com", fullName: "Austin Jurgens" },
      set: { mindbodyStaffId: "100000012", mindbodyLinked: true },
    },
    {
      id: "QYRgMgvMHBGhUktmetpn",
      what: "Austin Jurgens at Solon (Aug 7, never signed in): switched off",
      expect: { fullName: "Austin Jurgens", primaryHomeStudioId: "NdqNIuZlpHig31Xj4UHR" },
      set: switchOffPatch(BY, nowIso),
    },
    {
      id: "bOmoeB3ZTEQOhRk88fdujTNJ1To2",
      what: "Austin J (ajjurgens1997@gmail.com, a test account): switched off",
      expect: { email: "ajjurgens1997@gmail.com" },
      set: switchOffPatch(BY, nowIso),
    },
  ];
}

function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function main() {
  const commit = hasFlag("commit");
  const expectRaw = flag("expect");
  if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) stop(`--expect needs a whole number (it says "${expectRaw}").`);
  if (commit && expectRaw === undefined) stop("--commit needs --expect N, N being the documents the dry run says it will write.");
  console.log(commit ? "COMMIT: AJ's records will be written." : "DRY RUN: nothing will be written.");

  const db = connectFirestore();
  const nowIso = new Date().toISOString();
  const planned: Array<{ step: Step; snap: FirebaseFirestore.DocumentSnapshot; changes: Record<string, unknown>; before: Record<string, unknown> }> = [];

  for (const step of steps(nowIso)) {
    const snap = await db.doc(`trainers/${step.id}`).get();
    if (!snap.exists) stop(`trainers/${step.id} is gone.`);
    const data = snap.data() as Record<string, unknown>;
    for (const [k, v] of Object.entries(step.expect)) {
      if (!same(data[k], v)) stop(`trainers/${step.id} ${k} is ${JSON.stringify(data[k] ?? null)}, not ${JSON.stringify(v)}: someone changed it. Nothing was written.`);
    }
    const changes: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    // Already switched off: the whole switch-off is skipped, never re-signed.
    const alreadyOff = "isActive" in step.set && data.isActive === false;
    for (const [k, v] of Object.entries(step.set)) {
      if (alreadyOff || same(data[k], v)) continue;
      changes[k] = v;
      before[k] = data[k] ?? null;
    }
    console.log(`\ntrainers/${step.id}  ${step.what}`);
    if (Object.keys(changes).length === 0) console.log("  nothing to change");
    for (const k of Object.keys(changes)) console.log(`  ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(changes[k])}`);
    if (Object.keys(changes).length > 0) planned.push({ step, snap, changes, before });
  }

  console.log(`\nDocuments to write: ${planned.length}`);
  if (!commit) {
    if (planned.length > 0) console.log(`Nothing was written. To write it: npx tsx scripts/aj-accounts-oct20.ts --commit --expect ${planned.length}`);
    return;
  }
  if (Number(expectRaw) !== planned.length) stop(`--expect ${expectRaw}, but this run would write ${planned.length}. Run the dry run again and look at what changed.`);
  if (planned.length === 0) return;

  const backup = writeReport(
    "aj-accounts-oct20",
    planned.map((p) => ({ path: `trainers/${p.step.id}`, before: p.before, after: p.changes, updateTime: p.snap.updateTime?.toDate().toISOString() ?? null })),
  );
  console.log(`\nBefore, saved to ${backup}`);

  const batch = db.batch();
  for (const p of planned) batch.update(p.snap.ref, p.changes, { lastUpdateTime: p.snap.updateTime! });
  await batch.commit();
  console.log(`Written: ${planned.length} records. Sign in with Microsoft as ajurgens@ for the trainer account, with Google as jurgensaj@ for Admins.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
