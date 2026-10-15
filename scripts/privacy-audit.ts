/**
 * THE PRIVACY AUDIT: READ ONLY. This script never writes anything.
 *
 * Round 0 of the privacy lock, "strangers out" (Oct 14 2026;
 * docs/rounds/2026-10-14-strangers-out.md). Its rules make a person's trainer
 * record at trainers/{their sign-in uid} the key to every read about a client
 * and a studio's own work, and refuse a real client's record any tie to Demo
 * Mode. Before they go live, this reads production and counts the two things
 * that would make them wrong (what each item means is in
 * src/features/privacy/audit.ts, the tested half):
 *
 *   Item 0   trainer records a sign-in would not find at trainers/{uid}
 *   Item 12  real clients tied to Demo Mode (sessions and approvals)
 *
 * It prints counts, and ids and emails only for what needs a person. No
 * names, no notes, nothing about a client but her document id. The last line
 * is `GATE item0=N item12=N PASS|STOP`, and the exit code says the same:
 *
 *   0  both items are 0: the rules may go live
 *   3  an item is not 0: stop, and ask Claude with the output
 *   1  the audit could not run (no key, no network, a read refused)
 *
 * WHAT IT READS (the Admin SDK, field masks; one pass, a few hundred
 * documents): every trainer document (email, isActive, supersededByUid,
 * pendingClaim, isDemo); every Firebase Auth account (listUsers, 1,000 a page:
 * its uid, its own email and its providers' emails); the sessions hosted at
 * demo-studio; the
 * clients homed at demo-studio and the sessions naming them; the clients whose
 * cross-train approvals name demo-studio; and the client documents those name.
 *
 * AUTH: the service-account key the data scripts use (scripts/lib/admin.ts):
 * --key <path>, else GOOGLE_APPLICATION_CREDENTIALS, else
 * ./service-account.json. In a worktree the key is in the project folder:
 * --key ..\..\..\service-account.json.
 *
 * USAGE (PowerShell, from the project folder or the branch's folder)
 *   npx tsx scripts/privacy-audit.ts --key <path to service-account.json>
 *   npx tsx scripts/privacy-audit.ts --key <path> --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 */

import dns from "dns";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { connectFirestore } from "./lib/admin.ts";
import {
  DEMO_STUDIO,
  auditReport,
  demoFindings,
  gateOf,
  reportLines,
  type AuthAccount,
  type ClientRow,
  type SessionRow,
  type TrainerRow,
} from "../src/features/privacy/audit.ts";

dns.setDefaultResultOrder("ipv4first");

const chunks = <T,>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Every Firebase Auth account: its uid, its own email and the emails its sign-in providers carry. */
async function listAccounts(): Promise<AuthAccount[]> {
  const auth = getAuth();
  const out: AuthAccount[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      out.push({
        uid: u.uid,
        email: u.email ?? null,
        providerEmails: u.providerData.map((p) => p.email ?? "").filter(Boolean),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/** Client documents by id, read 100 at a time (a missing one is left out). */
async function readClients(db: Firestore, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const part of chunks([...new Set(ids)].filter(Boolean), 100)) {
    const snaps = await db.getAll(...part.map((id) => db.collection("clients").doc(id)), {
      fieldMask: ["homeStudioId", "studioId"],
    });
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() ?? {});
  }
  return out;
}

async function main() {
  console.log("\nThe privacy audit (Round 0, strangers out). READ ONLY: this script writes nothing.\n");
  const db = connectFirestore();

  // Item 0: every trainer document, and every sign-in account.
  const trainerSnap = await db
    .collection("trainers")
    .select("email", "isActive", "supersededByUid", "pendingClaim", "isDemo")
    .get();
  const trainers: TrainerRow[] = trainerSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const accounts = await listAccounts();

  // Item 12: sessions hosted at Demo Mode, Demo clients' sessions, and approvals naming it.
  const demoHostedSnap = await db
    .collection("sessions")
    .where("hostedAtStudioId", "==", DEMO_STUDIO)
    .select("hostedAtStudioId", "clientId")
    .get();
  const demoHosted: SessionRow[] = demoHostedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const demoClientSnap = await db.collection("clients").where("homeStudioId", "==", DEMO_STUDIO).select("homeStudioId").get();
  const demoClientIds = demoClientSnap.docs.map((d) => d.id);
  const demoClientSessions: SessionRow[] = [];
  for (const part of chunks(demoClientIds, 30)) {
    const snap = await db
      .collection("sessions")
      .where("clientId", "in", part)
      .select("hostedAtStudioId", "clientId")
      .get();
    for (const d of snap.docs) demoClientSessions.push({ id: d.id, ...d.data() });
  }

  const approvedSnap = await db
    .collection("clients")
    .where("approvedCrossTrainStudioIds", "array-contains", DEMO_STUDIO)
    .select("homeStudioId", "studioId", "approvedCrossTrainStudioIds")
    .get();
  const approvedAtDemo: ClientRow[] = approvedSnap.docs.map((d) => ({ id: d.id, data: d.data() }));

  const named = [...demoHosted, ...demoClientSessions].map((s) => text(s.clientId));
  const clients = await readClients(db, named);
  for (const c of demoClientSnap.docs) if (!clients.has(c.id)) clients.set(c.id, c.data());

  const report = auditReport({ trainers, accounts, demo: demoFindings({ demoHosted, demoClientSessions, clients, approvedAtDemo }) });
  console.log(
    `Read: ${trainers.length} trainer records, ${accounts.length} sign-in accounts, ` +
      `${demoHosted.length} Demo Mode sessions, ${demoClientIds.length} Demo clients and their ` +
      `${demoClientSessions.length} sessions, ${approvedAtDemo.length} clients approved at demo-studio.\n`,
  );
  for (const line of reportLines(report)) console.log(line);

  const gate = gateOf(report);
  console.log(
    gate.pass
      ? "\nBoth items are 0: Round 0's rules may go live."
      : "\nAn item is not 0: Round 0's rules must wait. Nothing was changed. Ask Claude with this output.",
  );
  return gate.pass ? 0 : 3;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("\nThe audit could not run:", err?.message ?? err);
    console.error("GATE item0=? item12=? UNKNOWN");
    process.exit(1);
  },
);
