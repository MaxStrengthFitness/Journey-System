/**
 * Moves ONE client's home studio. Dry run by default; --commit writes.
 *
 *   npx tsx scripts/set-home-studio.ts --client 100005050 --to BVDDRe5AqQZFihRLW0vK
 *   npx tsx scripts/set-home-studio.ts --client 100005050 --to BVDDRe5AqQZFihRLW0vK --commit
 *
 * Writes only `homeStudioId` (the old value is printed so it can be undone). Refuses a client who is not on the
 * shared Mindbody site of the destination studio. This does not touch Mindbody:
 * the client's Home location there is changed at the front desk.
 */
import { connectFirestore } from "./lib/admin.ts";

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const clientId = arg("--client");
const to = arg("--to");
const commit = argv.includes("--commit");
if (!clientId || !to) { console.error("Need --client <doc id> and --to <studio doc id>"); process.exit(1); }

const db = connectFirestore();
const [cSnap, sSnap] = await Promise.all([db.collection("clients").doc(clientId).get(), db.collection("studios").doc(to).get()]);
if (!cSnap.exists) { console.error("No such client."); process.exit(1); }
if (!sSnap.exists) { console.error("No such studio."); process.exit(1); }
const c = cSnap.data()!;
const s = sSnap.data()!;
if (String(c.mindbodySiteId ?? "") !== String(s.mindbodySiteId ?? "")) {
  console.error(`Refusing: client is on Mindbody site ${c.mindbodySiteId}, ${s.name} is on ${s.mindbodySiteId}.`);
  process.exit(1);
}
console.log(`${c.firstName} ${c.lastName}: homeStudioId ${c.homeStudioId} -> ${to} (${s.name})`);
if (c.homeStudioId === to) { console.log("Already there. Nothing to do."); process.exit(0); }
if (!commit) { console.log("Dry run. Add --commit to write."); process.exit(0); }
await cSnap.ref.update({ homeStudioId: to });
console.log(`Written. To undo: --client ${clientId} --to ${c.homeStudioId} --commit`);
