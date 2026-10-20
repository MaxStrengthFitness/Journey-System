/**
 * READ-ONLY. Finds clients on a shared Mindbody site whose bookings are at one
 * studio while their home studio (`homeStudioId`) is another's.
 *
 * Why: westlake, Strongsville and Willoughby share site 29068, and a client
 * event names no location there, so a client's first home studio comes from
 * Mindbody's "Home location" field and is never moved afterwards (the webhook
 * on a shared site leaves an established client's homeStudioId alone). A wrong
 * Home location in Mindbody therefore leaves a client filed at the wrong
 * studio, and absent from the studio they actually train at (Meg Pauly,
 * Oct 20 2026).
 *
 *   npx tsx scripts/find-wrong-home-studio.ts                 # last 60 days
 *   npx tsx scripts/find-wrong-home-studio.ts --days 120
 *
 * Writes nothing to Firestore. The report (client names) goes to backups/,
 * which git ignores. One read per booking in the window plus one per client.
 */
import { Timestamp } from "firebase-admin/firestore";
import { connectFirestore, writeReport } from "./lib/admin.ts";

const argv = process.argv.slice(2);
const dIdx = argv.indexOf("--days");
const days = dIdx >= 0 ? Number(argv[dIdx + 1]) || 60 : 60;

const db = connectFirestore();
const studioSnap = await db.collection("studios").get();
const studios = studioSnap.docs.map((s) => ({ id: s.id, name: String(s.data().name ?? s.id), site: String(s.data().mindbodySiteId ?? "") }));
const nameOf = (id: unknown) => studios.find((s) => s.id === id)?.name ?? String(id ?? "(none)");

// Only sites with more than one studio can have this problem.
const siteCounts = new Map<string, number>();
for (const s of studios) if (s.site) siteCounts.set(s.site, (siteCounts.get(s.site) ?? 0) + 1);
const shared = studios.filter((s) => s.site && (siteCounts.get(s.site) ?? 0) > 1);
console.log("Shared-site studios:", shared.map((s) => s.name).join(", "));

const since = Timestamp.fromMillis(Date.now() - days * 86400000);
// clientId -> studioId -> count of bookings that were not cancelled
const seen = new Map<string, Map<string, number>>();
for (const s of shared) {
  const snap = await db.collection("schedules").where("studioId", "==", s.id).where("startTime", ">=", since).get();
  let n = 0;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.status === "Cancelled" || !x.clientId) continue;
    n++;
    const per = seen.get(String(x.clientId)) ?? new Map<string, number>();
    per.set(s.id, (per.get(s.id) ?? 0) + 1);
    seen.set(String(x.clientId), per);
  }
  console.log(`${s.name}: ${snap.size} bookings read, ${n} live with a client`);
}

const ids = [...seen.keys()];
const rows: Record<string, unknown>[] = [];
let missing = 0;
for (let i = 0; i < ids.length; i += 300) {
  const refs = ids.slice(i, i + 300).map((id) => db.collection("clients").doc(id));
  const docs = await db.getAll(...refs);
  for (const d of docs) {
    if (!d.exists) { missing++; continue; }
    const c = d.data()!;
    const per = seen.get(d.id)!;
    const home = c.homeStudioId as string | undefined;
    const total = [...per.values()].reduce((a, b) => a + b, 0);
    const atHome = home ? per.get(home) ?? 0 : 0;
    if (atHome > 0) continue; // trains at their home studio at least sometimes: nothing to say
    const [topId, topN] = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
    rows.push({
      id: d.id,
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      home: nameOf(home),
      homeStudioId: home ?? null,
      bookedAt: [...per.entries()].map(([id, n]) => `${nameOf(id)} x${n}`).join(", "),
      suggestedStudioId: topId,
      suggested: nameOf(topId),
      bookings: total,
      topShare: Math.round((topN / total) * 100),
    });
  }
}
rows.sort((a, b) => String(a.suggested).localeCompare(String(b.suggested)) || String(a.name).localeCompare(String(b.name)));
console.log(`\n${ids.length} clients booked on the shared site in the last ${days} days; ${missing} booking client ids have no record.`);
console.log(`${rows.length} have bookings ONLY at a studio other than their home studio:\n`);
for (const r of rows) console.log(`  ${r.name} (${r.id}): home ${r.home}; booked ${r.bookedAt}`);
console.log("\nReport:", writeReport("wrong-home-studio", rows));
