/**
 * Fold a trainer's old records into the one they sign in to. DRY RUN BY DEFAULT.
 *
 * Why (the sign-in email round, Oct 20 2026): a trainer on Mindbody's staff
 * list has an August record that every Mindbody booking points at. Their
 * first Microsoft sign-in, approved the old way, made a second record at
 * their uid with no Mindbody link, so the Hub's cards and the trainer were
 * on different records (Kyle McManus, Kayla Sharratt). Mike Palko had it
 * worse: an Admin record he signed in to with gmail and a Strongsville
 * record, both carrying Mindbody staff 100000062, so the sync matched
 * neither and every booking from Oct 19 on landed in Unassigned; and his
 * Microsoft sign-in had no record at all, so the rules gave him no studio
 * and his schedule sync was refused. The pure half, and the list of fields
 * that hold a trainer's id, is src/features/sign-in-email/merge.ts.
 *
 * WHAT IT WRITES (merge):
 *   - the kept record (--into, the person's sign-in uid): the Mindbody staff
 *     id and anything else it lacks from the old ones. With --seed <id> and
 *     no record at --into yet, it is MADE from that profile (movedRecord:
 *     role, studios, Mindbody link; --email, --name);
 *   - every document whose trainer field holds an old id: bookings
 *     (schedules.trainerId, past and future), sessions, routines, reports,
 *     clients' primary/top trainer, a studio's head trainer;
 *   - bookings with the kept record's Mindbody staff id and NO trainer at a
 *     studio it works at (what two records sharing a staff id leave behind);
 *   - each old record (--from, repeatable): a tombstone, supersededByUid →
 *     the kept one, its staff id cleared (kept as mergedMindbodyStaffId),
 *     never deleted. One someone signs in to (a uid) is also switched off,
 *     so that sign-in is refused with a sentence (AJ: "Switch it off").
 * --bookings-only (AJ's own case): only bookings and sessions move; neither
 * record changes but claimedFromId on the kept one.
 *
 * SAFE TO RUN TWICE: a second run finds nothing pointing at an old id and a
 * tombstone already in place, and writes nothing. It REFUSES, writing
 * nothing, when the kept record isn't at a sign-in uid, when two records
 * carry different Mindbody staff ids, or when a record changes between the
 * read and the write.
 *
 * UNDO: with --commit, every document's id and old value goes to
 * backups/merge-trainer-records-*.json first.
 *
 * USAGE (PowerShell, from the project folder, where .env and
 * service-account.json are):
 *   npx tsx scripts/merge-trainer-records.ts --from <old id> --into <uid>
 *   npx tsx scripts/merge-trainer-records.ts --from <a> --from <b> --into <uid> --seed <a> --email x@y --name "First Last"
 *   ... then the same with --commit --expect N
 *   add --bookings-only to move only bookings and sessions
 * --expect is the number of writes the dry run says it will make.
 */

import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";
import {
  checkMerge,
  chunks,
  isSignedInRecord,
  keptPatch,
  movedRecord,
  referencesFor,
  tombstonePatch,
  type Mode,
} from "../src/features/sign-in-email/merge.ts";
import { generateSearchTokens } from "../src/lib/utils.ts";

/** Who the switch-off is signed by: the administrator who runs this. */
const BY = { uid: "2GIpJh7FZkaFNu5z4diiKO1MsM02", name: "Austin Jurgens" };

function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

/** Every value of a repeatable flag. */
function flags(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  argv.forEach((a, i) => {
    if (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
  });
  return out;
}

type Doc = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

async function main() {
  const fromIds = flags("from");
  const intoId = flag("into") ?? "";
  const seedId = flag("seed") ?? "";
  const email = flag("email") ?? "";
  const name = flag("name") ?? "";
  const mode: Mode = hasFlag("bookings-only") ? "bookings-only" : "merge";
  const commit = hasFlag("commit");
  const expectRaw = flag("expect");
  if (fromIds.length === 0 || !intoId) stop("Pass --from <old record id> (repeatable) --into <the uid they sign in with>.");
  if (seedId && !fromIds.includes(seedId)) stop("--seed must be one of the --from records.");
  if (expectRaw !== undefined && !/^\d+$/.test(expectRaw)) stop(`--expect needs a whole number (it says "${expectRaw}").`);
  if (commit && expectRaw === undefined) stop("--commit needs --expect N, N being the writes the dry run says it will make.");
  console.log(`${commit ? "COMMIT" : "DRY RUN"} (${mode}): ${fromIds.map((f) => `trainers/${f}`).join(" + ")} → trainers/${intoId}${commit ? "" : ". Nothing will be written."}`);

  const db = connectFirestore();
  const intoRef = db.doc(`trainers/${intoId}`);
  const intoSnap = await intoRef.get();
  const froms = await Promise.all(fromIds.map(async (id) => ({ id, ref: db.doc(`trainers/${id}`), snap: await db.doc(`trainers/${id}`).get() })));
  for (const f of froms) if (!f.snap.exists) stop(`trainers/${f.id} doesn't exist.`);
  const nowIso = new Date().toISOString();

  // The kept record: as it is, or made from the seed.
  let into: Doc | null = intoSnap.exists ? (intoSnap.data() as Doc) : null;
  let creating = false;
  if (!into) {
    if (mode !== "merge" || !seedId) stop(`trainers/${intoId} doesn't exist. Pass --seed <one of the --from ids> and --email to make it from that profile.`);
    if (intoId.length !== 28) stop(`${intoId} is not a sign-in uid (28 characters).`);
    if (!email) stop("Making the record needs --email, the address they sign in with.");
    const seed = froms.find((f) => f.id === seedId)!.snap.data() as Doc;
    into = movedRecord(seed, seedId, intoId, { email, nowIso, fullName: name || undefined });
    if (name) into.searchTokens = generateSearchTokens(into.fullName as string);
    creating = true;
  } else if (name && text(into.fullName) !== name.trim()) {
    into = { ...into, fullName: name.trim(), searchTokens: generateSearchTokens(name.trim()) };
  }

  console.log(`\n  kept: trainers/${intoId}${creating ? " (to be made)" : ""} · ${into.fullName} · ${into.email || "no email"} · ${into.role || "no role"} · Mindbody ${into.mindbodyStaffId || "none"}`);
  for (const f of froms) {
    const d = f.snap.data() as Doc;
    const check = checkMerge(f.id, d, intoId, { ...into, authUid: intoId }, mode);
    if (!check.ok) stop(check.reason!);
    console.log(`  old:  trainers/${f.id} · ${d.fullName} · ${d.email || "no email"} · ${d.role || "no role"} · Mindbody ${d.mindbodyStaffId || "none"}${isSignedInRecord(f.id, d) ? " · someone signs in as it: switched off" : ""}`);
  }

  // What the kept record takes, from each old one in turn.
  let keptChanges: Doc = {};
  for (const f of froms) {
    const patch = keptPatch(f.snap.data() as Doc, { ...into, ...keptChanges }, f.id, mode);
    keptChanges = { ...keptChanges, ...patch };
  }
  if (!creating && name && text((intoSnap.data() as Doc).fullName) !== name.trim()) {
    keptChanges.fullName = into.fullName;
    keptChanges.searchTokens = into.searchTokens;
  }
  const keptWrite: Doc | null = creating ? { ...into, ...keptChanges } : Object.keys(keptChanges).length ? keptChanges : null;
  console.log(`\nThe kept record ${creating ? "is made as" : "takes"}:`, keptWrite ? JSON.stringify({ ...keptWrite, searchTokens: undefined, kaizenRoster: undefined }) : "nothing");

  // Every document pointing at an old id.
  const moves: Array<{ path: string; field: string }> = [];
  console.log("\nPointing at the old records:");
  for (const f of froms) {
    for (const ref of referencesFor(mode)) {
      const snap = await db.collection(ref.collection).where(ref.field, "==", f.id).get();
      if (snap.size) console.log(`  ${ref.collection}.${ref.field} = ${f.id}: ${snap.size}`);
      for (const d of snap.docs) moves.push({ path: d.ref.path, field: ref.field });
    }
  }
  // Bookings left with no trainer by two records sharing one staff id.
  const staffId = text(keptWrite?.mindbodyStaffId ?? into.mindbodyStaffId);
  if (mode === "merge" && staffId) {
    const studios = new Set([text(into.primaryHomeStudioId), ...((into.accessibleStudioIds as string[]) ?? []), ...((into.activeGuestStudioIds as string[]) ?? [])].filter(Boolean));
    const snap = await db.collection("schedules").where("mindbodyStaffId", "==", staffId).where("trainerId", "==", null).get();
    const here = snap.docs.filter((d) => studios.has(text(d.get("studioId"))));
    console.log(`  schedules with Mindbody staff ${staffId} and no trainer, at their studios: ${here.length}`);
    for (const d of here) moves.push({ path: d.ref.path, field: "trainerId" });
  }

  const tombs = mode === "merge"
    ? froms.filter((f) => !(f.snap.data() as Doc).supersededByUid).map((f) => ({ f, patch: tombstonePatch(f.snap.data() as Doc, intoId, nowIso, { fromId: f.id, by: BY }) }))
    : [];
  for (const t of tombs) console.log(`The old record trainers/${t.f.id} becomes:`, JSON.stringify(t.patch));

  const writes = moves.length + (keptWrite ? 1 : 0) + tombs.length;
  console.log(`\nWrites: ${writes} (a session with two trainer fields counts twice)`);
  if (!commit) {
    if (writes > 0) {
      const args = [...fromIds.flatMap((f) => ["--from", f]), "--into", intoId, ...(seedId ? ["--seed", seedId] : []), ...(email ? ["--email", email] : []), ...(name ? ["--name", `"${name}"`] : []), ...(mode === "bookings-only" ? ["--bookings-only"] : [])];
      console.log(`Nothing was written. To write it: npx tsx scripts/merge-trainer-records.ts ${args.join(" ")} --commit --expect ${writes}`);
    }
    return;
  }
  if (Number(expectRaw) !== writes) stop(`--expect ${expectRaw}, but this run would write ${writes}. Run the dry run again and look at what changed.`);
  if (writes === 0) return;

  const backup = writeReport("merge-trainer-records", {
    mode,
    fromIds,
    intoId,
    creating,
    readAt: nowIso,
    froms: froms.map((f) => ({ id: f.id, data: f.snap.data() })),
    into: intoSnap.exists ? intoSnap.data() : null,
    moved: moves.map((m) => ({ ...m })),
    keptWrite,
    tombs: tombs.map((t) => ({ id: t.f.id, patch: t.patch })),
  });
  console.log(`\nBefore, saved to ${backup}`);

  // The kept record first: if anything stops after it, the person already
  // has a working record, and a re-run finishes the rest.
  if (keptWrite) {
    if (creating) await intoRef.create(keptWrite);
    else await intoRef.update(keptWrite, { lastUpdateTime: intoSnap.updateTime! });
  }
  let done = 0;
  for (const group of chunks(moves)) {
    const batch = db.batch();
    for (const m of group) batch.update(db.doc(m.path), { [m.field]: intoId });
    await batch.commit();
    done += group.length;
    console.log(`  moved ${done} of ${moves.length}`);
  }
  // The tombstones last, each conditioned on its record not having changed.
  for (const t of tombs) await t.f.ref.update(t.patch, { lastUpdateTime: t.f.snap.updateTime! });
  console.log(`Written: ${writes} writes. ${into.fullName}'s bookings now point at trainers/${intoId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
