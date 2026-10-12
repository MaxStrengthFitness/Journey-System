/**
 * Which Mindbody site each trainer's staff id is on, as the staff webhook now
 * judges it. ALWAYS READ-ONLY: there is no --commit, nothing here writes
 * anything, and nothing asks Mindbody anything.
 *
 * Round: the staff webhook (Oct 12 2026; docs/rounds/2026-10-12-staff-webhook.md).
 * Each Mindbody site numbers its own staff, so since this round a staff
 * update is matched only to a trainer whose staff id is on the update's site
 * (functions/src/mindbody/staffSite.ts, the same code this script runs). It
 * reads the studios and the trainers once and prints:
 *
 *   1. staff numbers more than one trainer holds, each holder with the site
 *      Journey works out for them: holders on DIFFERENT sites are the case
 *      the old rule mixed up; two on the same site are a real duplicate;
 *   2. trainers whose Mindbody details disagree with them: the details came
 *      from a staff update for another staff id, or from another site. Those
 *      may be another person's name, email or photo, written by the old rule.
 *      Nothing repairs them by itself: a person clears them (relinking the
 *      trainer in Edit Trainer brings fresh details with the next update);
 *   3. trainers with a staff id whose site Journey can't tell: their staff
 *      updates now wait in Limbo (Admins -> Machinery -> Limbo) instead of
 *      being written, unless the update carries the name Journey has for
 *      them. Bookings are not affected: a booking finds its trainer at its
 *      studio.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/check-staff-sites.ts
 *   npx tsx scripts/check-staff-sites.ts --key ..\service-account.json --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *
 * Needs a service-account key (scripts/lib/admin.ts says where it looks).
 */

import { createRequire } from "node:module";
import { connectFirestore } from "./lib/admin.ts";
import type { StaffCandidate, StaffSiteReading, StudioSite } from "../functions/src/mindbody/staffSite.ts";

// functions/ is a CommonJS tree (its package.json has no "type": "module"),
// so from this ESM script its named exports are invisible to Node's loader.
// require() sees the whole module object; the types come from the import above.
const require = createRequire(import.meta.url);
const { candidateOf, isMergedAway, readStaffSite } =
  require("../functions/src/mindbody/staffSite.ts") as typeof import("../functions/src/mindbody/staffSite.ts");

type Row = { t: StaffCandidate; reading: StaffSiteReading; mindbody: Record<string, unknown> };

const WHY: Record<StaffSiteReading["why"], string> = {
  linked: "linked",
  "no-site": "none of their studios is linked to a Mindbody site",
  "several-sites": "works at studios on more than one site",
  "echo-differs": "their last staff update came from another site",
};

async function main() {
  const db = connectFirestore();
  console.log("READ-ONLY: nothing is written and Mindbody is not asked anything.");

  const [studioSnap, trainerSnap] = await Promise.all([db.collection("studios").get(), db.collection("trainers").get()]);

  const studios: StudioSite[] = [];
  const studioName = new Map<string, string>();
  studioSnap.forEach((doc) => {
    const d = doc.data();
    studioName.set(doc.id, typeof d.name === "string" && d.name ? d.name : doc.id);
    if (d.mindbodySiteId !== undefined && d.mindbodySiteId !== null && String(d.mindbodySiteId).trim()) {
      studios.push({ id: doc.id, siteId: String(d.mindbodySiteId).trim() });
    }
  });

  let mergedAway = 0;
  const rows: Row[] = [];
  trainerSnap.forEach((doc) => {
    const d = doc.data() as Record<string, unknown>;
    if (isMergedAway(d)) {
      mergedAway += 1;
      return;
    }
    const t = candidateOf(doc.id, d);
    if (!t || !t.staffId) return;
    const mindbody = d.mindbody && typeof d.mindbody === "object" ? (d.mindbody as Record<string, unknown>) : {};
    rows.push({ t, reading: readStaffSite(t, studios), mindbody });
  });

  const nameOf = (t: StaffCandidate) => t.fullName || "(no name)";
  const home = (t: StaffCandidate) => (t.primaryHomeStudioId ? studioName.get(t.primaryHomeStudioId) ?? t.primaryHomeStudioId : "no home studio");
  const siteText = (r: StaffSiteReading) => (r.site ? `site ${r.site}` : `can't tell (${WHY[r.why]})`);

  console.log("");
  console.log(`Studios linked to Mindbody: ${studios.map((s) => `${studioName.get(s.id)} = site ${s.siteId}`).join(", ") || "none"}.`);
  console.log(`Trainers with a staff id: ${rows.length} (claimed placeholders and merged records left out: ${mergedAway}).`);

  // 1. Numbers more than one trainer holds.
  const byId = new Map<string, Row[]>();
  for (const r of rows) byId.set(r.t.staffId, [...(byId.get(r.t.staffId) ?? []), r]);
  const shared = [...byId.entries()].filter(([, list]) => list.length > 1);
  console.log("");
  console.log(`1. Staff numbers held by more than one trainer: ${shared.length}`);
  let crossSite = 0;
  for (const [id, list] of shared) {
    const sites = new Set(list.map((r) => r.reading.site ?? "?"));
    const across = sites.size > 1 || sites.has("?");
    if (across) crossSite += 1;
    console.log(`   ${id}${across ? "  (on different sites, or can't tell: the case the old rule mixed up)" : "  (same site: a real duplicate)"}`);
    for (const r of list) console.log(`      ${nameOf(r.t)} [${r.t.id}], ${home(r.t)}, ${siteText(r.reading)}`);
  }

  // 2. Mindbody details that disagree with the trainer.
  console.log("");
  const echoes = rows.filter((r) => {
    const echoId = r.t.echoStaffId;
    const echoSite = r.t.echoSiteId;
    if (echoId && echoId !== r.t.staffId) return true;
    return !!(echoId && echoSite && r.reading.sites.length === 1 && echoSite !== r.reading.sites[0]);
  });
  console.log(`2. Trainers whose Mindbody details came from another staff id or another site: ${echoes.length}`);
  for (const r of echoes) {
    const shown = typeof r.mindbody.displayName === "string" ? r.mindbody.displayName : "(no name)";
    const active = r.mindbody.isActive === false ? ", marked inactive in Mindbody" : "";
    console.log(
      `   ${nameOf(r.t)} [${r.t.id}], ${home(r.t)}: holds ${r.t.staffId}; the details say staff ${r.t.echoStaffId} on site ${r.t.echoSiteId ?? "?"}, name "${shown}"${active}`,
    );
  }

  // 3. A staff id whose site Journey can't tell.
  console.log("");
  const unknown = rows.filter((r) => r.reading.site === null);
  console.log(`3. Trainers whose staff id's site Journey can't tell (their staff updates wait in Limbo): ${unknown.length}`);
  for (const r of unknown) console.log(`   ${nameOf(r.t)} [${r.t.id}], ${home(r.t)}: ${WHY[r.reading.why]}`);

  console.log("");
  console.log(
    `SUMMARY: ${crossSite} staff number(s) shared across sites, ${echoes.length} trainer(s) with details from elsewhere, ${unknown.length} trainer(s) whose site can't be told.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
