/**
 * THE RESET'S EMULATOR PROOF, one studio at a time (Oct 22 2026, Stage 2 of the
 * Strongsville import). Nothing real is touched: it runs inside
 * `firebase emulators:exec` on a throwaway project.
 *
 *   npx firebase emulators:exec --only firestore --project demo-reset-proof "node scripts/proof/reset-one-studio.mjs"
 *
 * It seeds two studios, S and W, with every case the --studio scope decides
 * (a client filed at each, sessions hosted at each, a W client hosted at S, an
 * S client hosted at W, an imported client with a prior record and the
 * FileMaker id, each studio's job documents, trainers who coached at one or
 * both, W past its cutover), takes a fingerprint of the whole database, then
 * runs scripts/reset-test-data.ts exactly as AJ will:
 *
 *   1. the dry run for S              → PLANNED N, nothing written (fingerprint unchanged)
 *   2. --commit --expect N for S       → writes, with a backup
 *   3. the dry run for S again         → PLANNED 0
 *   4. every one of W's documents is byte-for-byte what it was
 *   5. the whole-database dry run      → W's sessions are still there to take
 *   6. --restore <backup> --commit     → the fingerprint equals the one before step 2
 *
 * On Windows the emulator's Java process can outlive emulators:exec and hold
 * the port: stop it before the next run (Get-Process java | Stop-Process).
 */
import { spawnSync } from "node:child_process";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) {
  console.error("Run this inside `firebase emulators:exec` (FIRESTORE_EMULATOR_HOST is not set). Nothing done.");
  process.exit(1);
}
const projectId = process.env.GCLOUD_PROJECT || "demo-reset-proof";
if (!projectId.startsWith("demo-")) {
  console.error(`The project must be a demo- one (got ${projectId}). Nothing done.`);
  process.exit(1);
}
const db = getFirestore(initializeApp({ projectId }));

const NOW = Date.now();
const DAY = 86_400_000;
const ts = (ms) => Timestamp.fromMillis(ms);

/* ------------------------------------------------------------------ the fixture */
const SEED = {
  "studios/S": { name: "Studio S", timezone: "America/New_York" },
  "studios/W": { name: "Studio W", timezone: "America/New_York", journeyCutoverDate: "2026-10-01" },

  "clients/sc": { homeStudioId: "S", firstName: "S", lastName: "One", completedSessions: 4, sessionCount: 102, lifetimeReps: 40, lifetimeWeight: 4000, trainerTally: { ts: 2, tboth: 1 }, topTrainerId: "ts", renewal: { lastVisitDate: "2026-10-01", primaryTrainerId: "ts", packageName: "12" }, isRoutineBActive: true, subjectiveSnapshot: { energy: 3 }, lastSessionDate: "2026-10-01", firstSessionDate: ts(NOW - 5 * DAY), legacy_filemaker_id: "FM-SC", priorHistory: { sessions: 100, importedCount: 2, source: "filemaker", through: "2024-01-31", recordedAt: ts(NOW - 10 * DAY) } },
  "clients/sc2": { homeStudioId: "S", firstName: "S", lastName: "Two", completedSessions: 1, sessionCount: 1, lifetimeReps: 8 },
  "clients/wc": { homeStudioId: "W", firstName: "W", lastName: "One", completedSessions: 3, sessionCount: 3, lifetimeReps: 30, isRoutineBActive: true, subjectiveSnapshot: { energy: 2 }, lastSessionDate: "2026-10-02", firstSessionDate: ts(NOW - 6 * DAY) },
  "clients/wc2": { homeStudioId: "W", firstName: "W", lastName: "Two", completedSessions: 1, sessionCount: 1, lifetimeReps: 9 },

  "sessions/s1": { clientId: "sc", studioId: "S", clientHomeStudioId: "S", trainerId: "ts", trainerInitials: "TS", status: "Completed", date: "2026-10-16", createdAt: ts(NOW - 5 * DAY), endTime: ts(NOW - 5 * DAY + 3_600_000), rollupCounted: true, sessionNumber: 101 },
  "sessions/s2": { clientId: "sc", studioId: "S", clientHomeStudioId: "S", trainerId: "tboth", trainerInitials: "TB", status: "Completed", date: "2026-10-17", createdAt: ts(NOW - 4 * DAY), rollupCounted: true, sessionNumber: 102 },
  "sessions/fm_sc_2024-01-10": { clientId: "sc", studioId: "S", clientHomeStudioId: "S", trainerInitials: "", status: "Completed", date: "2024-01-10", createdAt: ts(Date.parse("2024-01-10T16:00:00Z")), legacy_filemaker_id: "FM-SC", rollupCounted: true, sessionNumber: 99 },
  "sessions/fm_sc_2024-01-17": { clientId: "sc", studioId: "S", clientHomeStudioId: "S", trainerInitials: "", status: "Completed", date: "2024-01-17", createdAt: ts(Date.parse("2024-01-17T16:00:00Z")), legacy_filemaker_id: "FM-SC", rollupCounted: true, sessionNumber: 100 },
  "sessions/x1": { clientId: "wc2", studioId: "S", clientHomeStudioId: "W", isCrossTrain: true, trainerId: "ts", trainerInitials: "TS", status: "Completed", date: "2026-10-18", createdAt: ts(NOW - 3 * DAY), rollupCounted: true, sessionNumber: 1 },
  "sessions/x2": { clientId: "sc2", studioId: "W", clientHomeStudioId: "S", isCrossTrain: true, trainerId: "tw", trainerInitials: "TW", status: "Completed", date: "2026-10-19", createdAt: ts(NOW - 2 * DAY), rollupCounted: true, sessionNumber: 1 },
  "sessions/w1": { clientId: "wc", studioId: "W", clientHomeStudioId: "W", trainerId: "tboth", trainerInitials: "TB", status: "Running", date: "2026-10-15", createdAt: ts(NOW - 6 * DAY), lastHeartbeatAt: ts(NOW - 6 * DAY), rollupCounted: false, sessionNumber: 3 },

  "exerciseLogs/l1": { sessionId: "s1", clientId: "sc", machineId: "m-abs", weight: 50, reps: 10, status: "performed" },
  "exerciseLogs/l2": { sessionId: "s2", clientId: "sc", machineId: "m-abs", weight: 52, reps: 10, status: "performed" },
  "exerciseLogs/lfm1": { sessionId: "fm_sc_2024-01-10", clientId: "sc", machineId: "m-abs", weight: 40, reps: 10, status: "performed" },
  "exerciseLogs/lfm2": { sessionId: "fm_sc_2024-01-17", clientId: "sc", machineId: "m-abs", weight: 42, reps: 10, status: "performed" },
  "exerciseLogs/lx1": { sessionId: "x1", clientId: "wc2", machineId: "m-abs", weight: 30, reps: 8, status: "performed" },
  "exerciseLogs/lx2": { sessionId: "x2", clientId: "sc2", machineId: "m-abs", weight: 32, reps: 8, status: "performed" },
  "exerciseLogs/lw": { sessionId: "w1", clientId: "wc", machineId: "m-abs", weight: 60, reps: 9, status: "performed" },

  "journalEntries/js": { clientId: "sc", sessionId: "s1", origin: "in_session", body: "s note", studioId: "S", createdAt: ts(NOW - 5 * DAY) },
  "journalEntries/js-u": { clientId: "sc", threadId: "js", body: "update", studioId: "S", createdAt: ts(NOW - 4 * DAY) },
  "journalEntries/jw": { clientId: "wc", sessionId: "w1", origin: "in_session", body: "w note", studioId: "W", createdAt: ts(NOW - 6 * DAY) },
  "journalEntries/jprofile-s": { clientId: "sc", origin: "manual", body: "profile note", studioId: "S", createdAt: ts(NOW - 20 * DAY) },

  "clients/sc/ford/a": { origin: "in_session", sessionId: "s1", studioId: "S", category: "family", body: "x", isArchived: false },
  "clients/wc/ford/b": { origin: "in_session", sessionId: "w1", studioId: "W", category: "family", body: "y", isArchived: false },
  "clients/sc/machineTotals/current": { machineStats: { "m-abs": { count: 4 } }, currentMachineMetrics: { "m-abs": { weight: 52 } } },
  "clients/wc/machineTotals/current": { machineStats: { "m-abs": { count: 3 } } },

  "trainers/ts": { fullName: "Trainer S", initials: "TS", primaryHomeStudioId: "S", rollups: { sessionsCoached: 2 } },
  "trainers/tboth": { fullName: "Trainer Both", initials: "TB", primaryHomeStudioId: "W", rollups: { sessionsCoached: 2 } },
  "trainers/tw": { fullName: "Trainer W", initials: "TW", primaryHomeStudioId: "W", rollups: { sessionsCoached: 1 } },
  "trainers/ts/stats/rollups": { sessionsCoached: 2, sessionsCoached30d: 2 },
  "trainers/tboth/stats/rollups": { sessionsCoached: 2, sessionsCoached30d: 2 },
  "leaderboards/old": { rows: [1] },

  "studios/S/clientStates/sc": { state: "steady" },
  "studios/W/clientStates/wc": { state: "steady" },
  "studios/S/watch/journey": { clients: 2 },
  "studios/W/watch/journey": { clients: 2 },
  "studios/W/watch/sessions-2026-10": { count: 3 },
  "studios/S/acknowledgements/note:js": { by: "u" },
  "studios/W/acknowledgements/note:jw": { by: "u" },
  "noteDismissals/u": { threads: { js: 1, jw: 1 } },

  "clientMachineSettings/sc_m-abs": { clientId: "sc", machineId: "m-abs", currentWeight: 52, startingWeight: 40, nextWeight: 54, settings: { seat: "3" } },
  "clientMachineSettings/wc_m-abs": { clientId: "wc", machineId: "m-abs", currentWeight: 60, settings: { seat: "4" } },
  "clientMachineSettings/_ghostS": { studioId: "S", machineId: "m-abs", currentWeight: 20 },
  "clientMachineSettings/_ghostW": { studioId: "W", machineId: "m-abs", currentWeight: 21 },
  "machines/m-abs/settingHistory/hs": { clientId: "sc", timestamp: ts(NOW - DAY), field: "seat" },
  "machines/m-abs/settingHistory/hw": { studioId: "W", timestamp: ts(NOW - DAY), field: "seat" },

  "routines/rs": { clientId: "sc", name: "A" },
  "routines/rs/planChanges/p": { at: ts(NOW - DAY) },
  "routines/rw": { clientId: "wc", name: "A" },
  "routineAdjustments/as": { clientId: "sc" },
  "progressReports/ps": { clientId: "sc" },
  "progressReports/pw": { clientId: "wc" },
  "studios/S/floorNotes/n": { createdAt: ts(NOW - DAY), body: "s" },
  "studios/W/floorNotes/n": { createdAt: ts(NOW - DAY), body: "w" },
  "studios/S/watchlist/sc": { decision: "watch" },
  "studios/W/watchlist/wc": { decision: "watch" },
  "studios/S/cases/a": { clientId: "sc" },
  "studios/W/cases/b": { clientId: "wc" },
  "studios/S/dayLogs/d": { day: "2026-10-20" },
  "studios/W/dayLogs/d": { day: "2026-10-20" },
  "studios/S/renewals/c/touches/t": { clientId: "sc" },
  "studios/W/renewals/c/touches/t": { clientId: "wc" },
  "studios/W/renewals/c": { outcome: "renewed", studioId: "W" },
};

const W_PATHS = Object.keys(SEED).filter((p) =>
  /^(sessions\/w1|exerciseLogs\/lw|journalEntries\/jw|clients\/wc(\/|$)|clients\/wc2|studios\/W\/|clientMachineSettings\/wc_|clientMachineSettings\/_ghostW|machines\/m-abs\/settingHistory\/hw|routines\/rw|progressReports\/pw|trainers\/.*\/stats|leaderboards\/)/.test(p),
);

async function seed() {
  const batch = db.batch();
  for (const [path, data] of Object.entries(SEED)) batch.set(db.doc(path), data);
  await batch.commit();
}

/* ------------------------------------------------------------------ the fingerprint */
function stable(value) {
  if (value instanceof Timestamp) return { __ts: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

async function fingerprint() {
  const out = new Map();
  const walk = async (collections) => {
    for (const col of collections) {
      const snap = await col.get();
      for (const d of snap.docs) {
        out.set(d.ref.path, JSON.stringify(stable(d.data())));
        await walk(await d.ref.listCollections());
      }
    }
  };
  await walk(await db.listCollections());
  return out;
}

function diff(a, b) {
  const lines = [];
  for (const [p, v] of a) if (!b.has(p)) lines.push(`gone: ${p}`); else if (b.get(p) !== v) lines.push(`changed: ${p}`);
  for (const p of b.keys()) if (!a.has(p)) lines.push(`new: ${p}`);
  return lines;
}

/* ------------------------------------------------------------------ running the script */
function run(args) {
  const r = spawnSync("npx", ["tsx", "scripts/reset-test-data.ts", "--project", projectId, ...args], {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: host },
  });
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) {
    const tail = text.split("\n").filter((l) => l.trim() && !/npm notice|DeprecationWarning|trace-deprecation/.test(l)).slice(-6).join("\n    ");
    console.log(`  (the script exited ${r.status} for: ${args.join(" ")})\n    ${tail}`);
  }
  return { ok: r.status === 0, text };
}
const planned = (text) => Number((text.match(/PLANNED: ([\d,]+) document/) ?? [])[1]?.replace(/,/g, "") ?? NaN);
const check = (cond, what) => {
  console.log(`${cond ? "  ok " : "  FAIL"} ${what}`);
  if (!cond) failures.push(what);
};
const failures = [];

/* ------------------------------------------------------------------ the proof */
console.log(`Emulator ${host}, project ${projectId}.`);
await seed();
const fp0 = await fingerprint();
console.log(`Seeded ${fp0.size} documents.`);

console.log("\n1. The dry run for S");
const dry = run(["--studio", "S", "--also", "imported-history,settings"]);
check(dry.ok, "exits 0");
check(/STUDIO: Studio S \(S\)/.test(dry.text), "says STUDIO: Studio S");
check(/Hosted here, filed at another studio[^\n]*: 1\n\s+clients\/wc2  filed at Studio W  1 session/.test(dry.text), "lists wc2 as hosted here, filed at W");
check(/Filed here, hosted at another studio[^\n]*: 1\n\s+clients\/sc2  hosted at Studio W  1 session/.test(dry.text), "lists sc2 as filed here, hosted at W");
check(/Scope: 2 clients filed at this studio/.test(dry.text), "2 clients filed at S");
const n = planned(dry.text);
check(Number.isFinite(n) && n > 0, `PLANNED ${n}`);
check(!/STUDIOS WITH A JOURNEY CUTOVER DATE/.test(dry.text), "W's cutover date does not block S");
check(/Open sessions: none/.test(dry.text), "W's running session is not S's open session");
const fpDry = await fingerprint();
check(diff(fp0, fpDry).length === 0, "the dry run wrote nothing");

console.log("\n2. The commit for S");
const commit = run(["--studio", "S", "--also", "imported-history,settings", "--commit", "--expect", String(n), "--settle-seconds", "0"]);
check(commit.ok, "exits 0");
const backupDir = (commit.text.match(/--restore "([^"]+)"/) ?? [])[1];
check(!!backupDir, `backup at ${backupDir}`);
check(/Rebuild trainer rollups/.test(commit.text), "NEXT says Rebuild trainer rollups");
const fp1 = await fingerprint();
const changes = diff(fp0, fp1);
check(changes.length > 0, `${changes.length} documents deleted or changed`);
check(!fp1.has("sessions/s1") && !fp1.has("sessions/x1") && !fp1.has("sessions/x2") && !fp1.has("sessions/fm_sc_2024-01-10"), "S's own, the cross-filed and the imported sessions are gone");
check(fp1.has("sessions/w1") && fp1.has("exerciseLogs/lw"), "W's session and set stay");
const sc = (await db.doc("clients/sc").get()).data();
check(sc.completedSessions === 0 && sc.sessionCount === 100, `sc counters back: completed ${sc.completedSessions}, sessionCount ${sc.sessionCount} (the prior record's 100)`);
check(sc.priorHistory?.importedCount === 0 && sc.priorHistory?.sessions === 100, `sc importedCount ${sc.priorHistory?.importedCount}, sessions ${sc.priorHistory?.sessions}`);
check(sc.legacy_filemaker_id === undefined, "sc's FileMaker id cleared");
check(sc.isRoutineBActive === true && fp1.has("routines/rs"), "routines kept (not asked for)");
const scm = (await db.doc("clientMachineSettings/sc_m-abs").get()).data();
check(scm.currentWeight === undefined && scm.startingWeight === undefined && scm.nextWeight === undefined && scm.settings?.seat === "3", "sc's weights cleared, the dial kept");
const wc2 = (await db.doc("clients/wc2").get()).data();
check(wc2.completedSessions === 1 && wc2.lifetimeReps === 9, "wc2 (filed at W, hosted at S) keeps her record");
check((await db.doc("trainers/ts/stats/rollups").get()).exists && (await db.doc("trainers/tboth/stats/rollups").get()).exists, "trainers' counts documents left");
check((await db.doc("trainers/ts").get()).data().rollups === undefined && (await db.doc("trainers/tw").get()).data().rollups === undefined, "old counts maps cleared on trainers whose sessions went");

console.log("\n3. The dry run for S again");
const again = run(["--studio", "S", "--also", "imported-history,settings"]);
check(again.ok && planned(again.text) === 0, `PLANNED ${planned(again.text)}`);

console.log("\n4. W is untouched");
const wChanged = W_PATHS.filter((p) => fp0.get(p) !== fp1.get(p));
check(wChanged.length === 0, `every one of W's ${W_PATHS.length} documents is what it was${wChanged.length ? `: ${wChanged.join(", ")}` : ""}`);

console.log("\n5. The whole-database dry run still sees W");
const whole = run([]);
check(whole.ok && /WHOLE DATABASE/.test(whole.text), "says WHOLE DATABASE");
check(/STUDIOS WITH A JOURNEY CUTOVER DATE SET: W/.test(whole.text), "W's cutover date would block a whole-database commit");
check(planned(whole.text) > 0, `PLANNED ${planned(whole.text)} (W's)`);

console.log("\n6. The restore");
const restoreDry = run(["--restore", backupDir]);
check(restoreDry.ok, "restore dry run exits 0");
const restored = run(["--restore", backupDir, "--commit"]);
check(restored.ok, "restore exits 0");
const fp2 = await fingerprint();
const back = diff(fp0, fp2);
check(back.length === 0, `the fingerprint equals the one before the reset${back.length ? `: ${back.slice(0, 8).join("; ")}` : ""}`);

console.log("");
if (failures.length) {
  console.log(`PROOF FAILED: ${failures.length} check(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`PROOF PASSED: ${fp0.size} documents seeded, ${n} planned and written for S, 0 left, W untouched, restore exact. Backup: ${backupDir}`);
process.exit(0);
