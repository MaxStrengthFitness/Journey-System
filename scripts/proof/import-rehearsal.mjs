/**
 * THE IMPORT'S EMULATOR REHEARSAL (Oct 22 2026, Stage 3 of the Strongsville
 * import). Nothing real is touched: it runs inside `firebase emulators:exec`
 * on a throwaway project, seeds the emulator from the export's own profiles,
 * and runs scripts/import-filemaker.ts three times the way the real run goes:
 *
 *   1. the dry run                    → N sessions to write, the held entries by kind
 *   2. --commit --expect N            → written, in batches of whole visits
 *   3. the dry run again              → 0 to write (every id is derived)
 *
 *   npx firebase emulators:exec --only firestore --project demo-fm-import "node scripts/proof/import-rehearsal.mjs <files or folder> --map <table.csv> --through YYYY-MM-DD"
 *
 * The first run seeds the emulator (--seed-emulator: the four studios and a
 * client per profile with a Mindbody id). On Windows the emulator's Java can
 * outlive emulators:exec and hold the port: stop it before the next run.
 */
import { spawnSync } from "node:child_process";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) {
  console.error("Run this inside `firebase emulators:exec` (FIRESTORE_EMULATOR_HOST is not set). Nothing done.");
  process.exit(1);
}
const projectId = process.env.GCLOUD_PROJECT || "demo-fm-import";
if (!projectId.startsWith("demo-")) {
  console.error(`The project must be a demo- one (got ${projectId}). Nothing done.`);
  process.exit(1);
}
let args = process.argv.slice(2);
if (!args.length) {
  console.error("Give the export files (or their folder), --map <table.csv>, --through YYYY-MM-DD, and --floor <journey-snapshot.json> for the studio's own units.");
  process.exit(1);
}

/*
 * --floor <journey-snapshot.json>: the studio's floor as backups/filemaker/
 * tools/audit-snapshot.mts read it from production (`floor`: id, name, status,
 * basedOn), written to studios/{id}/roster so a studio's own unit (the Hoist)
 * exists on the emulator; the seed alone makes studios and clients, and with
 * no roster the import falls back to the twenty movements.
 */
const floorAt = args.indexOf("--floor");
let floor = null;
if (floorAt >= 0) {
  const { readFileSync } = await import("node:fs");
  const snapshot = JSON.parse(readFileSync(args[floorAt + 1], "utf8"));
  const studioId = snapshot.floor?.[0] && snapshot.studios?.find((s) => s.name?.startsWith("Strongsville"))?.id;
  floor = { studioId: studioId ?? "BVDDRe5AqQZFihRLW0vK", units: snapshot.floor ?? [] };
  args = [...args.slice(0, floorAt), ...args.slice(floorAt + 2)];
}
async function seedFloor() {
  if (!floor) return;
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ projectId }));
  const batch = db.batch();
  for (const u of floor.units) {
    batch.set(db.doc(`studios/${floor.studioId}/roster/${u.id}`), {
      studioId: floor.studioId,
      machineId: u.id,
      status: u.status ?? "active",
      source: u.id.startsWith("sm-") ? "custom" : "catalog",
      ...(u.basedOn ? { basedOn: u.basedOn } : {}),
      definition: { name: u.name },
    });
  }
  await batch.commit();
  console.log(`Seeded the floor: ${floor.units.length} units on studios/${floor.studioId}/roster.`);
}

function run(extra) {
  const r = spawnSync("npx", ["tsx", "scripts/import-filemaker.ts", ...args, "--emulator", "--project", projectId, ...extra], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: host },
  });
  return { ok: r.status === 0, text: `${r.stdout}\n${r.stderr}` };
}
const lines = (text, re) => text.split("\n").filter((l) => re.test(l));
/** The run's closing lines: from the "N clients in the files" summary on (each client has its own "Would write" above it). */
const closing = (text) => {
  const all = text.split("\n");
  const at = all.map((l, i) => (/clients in the files/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  return at === undefined ? all.slice(-20) : all.slice(at);
};
const summary = (text) => closing(text).filter((l) => /clients in the files|Would write|still to match|DRY RUN|WROTE|Wrote|Written|Verif|STOPPED|Failed:/i.test(l)).map((l) => `    ${l.trim()}`).join("\n");
const count = (text, re) => lines(text, re).length;
const toWrite = (text) => {
  const m = closing(text).join("\n").match(/Would write ([\d,]+) sessions/);
  return Number(m ? m[1].replace(/,/g, "") : NaN);
};

console.log(`Emulator ${host}, project ${projectId}.`);
await seedFloor();

console.log("\n1. The dry run (seeds the emulator first)");
const dry = run(["--seed-emulator"]);
console.log(summary(dry.text));
const n = toWrite(dry.text);
console.log(`  held entries listed: ${count(dry.text, /^\s+\d{4}-\d{2}-\d{2} .*: (a weight nobody lifts|a count of \d+ on a machine lifted|.*too long for a timed hold|a count \(\d+\) beside a weight of 0)/)} of the audit's kinds; "no date": ${count(dry.text, /An entry with no date/)}`);
console.log(`  kinds, each counted once per client in the report: ${["A weight nobody lifts", "lifted for reps", "too long for a timed hold", "beside a weight of 0", "An entry with no date"].map((k) => `${k} ×${count(dry.text, new RegExp(k))}`).join("; ")}`);
if (!dry.ok || !Number.isFinite(n)) {
  console.log(dry.text.split("\n").slice(-25).join("\n"));
  console.log("REHEARSAL FAILED at the dry run.");
  process.exit(1);
}

console.log(`\n2. The commit, --expect ${n}`);
const commit = run(["--commit", "--expect", String(n), "--verify"]);
console.log(summary(commit.text));
if (!commit.ok) {
  console.log(commit.text.split("\n").slice(-25).join("\n"));
  console.log("REHEARSAL FAILED at the commit.");
  process.exit(1);
}

console.log("\n3. The dry run again");
const again = run([]);
console.log(summary(again.text));
const left = toWrite(again.text);
if (!again.ok || left !== 0) {
  console.log(again.text.split("\n").slice(-25).join("\n"));
  console.log(`REHEARSAL FAILED: the second dry run would still write ${left}.`);
  process.exit(1);
}
console.log(`\nREHEARSAL PASSED: ${n} sessions written once, 0 the second time.`);
process.exit(0);
