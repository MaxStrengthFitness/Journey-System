/**
 * THE PRIVACY AUDIT, the pure half (Round 0 of the privacy lock, "strangers
 * out", Oct 14 2026; docs/rounds/2026-10-14-strangers-out.md).
 *
 * Round 0 makes the signed-in person's trainer record, at
 * `trainers/{their sign-in uid}`, the key to every read about a client and a
 * studio's own work. AJ, Oct 14 2026: "Let's make sure that everything's
 * strict and safe right now. I'm concerned about maybe something breaking."
 * So before the rules go live, `scripts/privacy-audit.ts` reads production
 * (read only, with the service account) and this file decides what it found:
 *
 *   Item 0. Everyone who has been let in can be found at trainers/{uid}. A
 *           person who signs in and lands on a record kept under another id
 *           (CLAUDE.md: "the two differ on older accounts") is refused every
 *           write today, and would be refused every client read after Round
 *           0. Expected: 0.
 *   Item 12. Nothing ties a real client to Demo Mode, where every trainer has
 *           the run of everything: a session hosted at `demo-studio` naming a
 *           real client, a session naming a Demo client hosted at a real
 *           studio, and a real client approved to cross-train at
 *           `demo-studio`. Each makes a real client's record readable by
 *           every trainer in the company. Expected: 0.
 *
 * Pure: no Firebase here, so it is tested alone (audit.test.ts). Nothing is
 * written anywhere, and a report names records by id and email only (no
 * names, no notes).
 */

export const DEMO_STUDIO = "demo-studio";

/** A trainer document as the audit reads it (a field mask: no names). */
export interface TrainerRow {
  id: string;
  data: {
    email?: unknown;
    isActive?: unknown;
    supersededByUid?: unknown;
    pendingClaim?: unknown;
    authUid?: unknown;
    isDemo?: unknown;
  };
}

/** What Firebase Auth said, looked up by the script. */
export interface AuthFacts {
  /** Every sign-in uid that exists, of those asked about (the record ids and `authUid` fields). */
  uids: ReadonlySet<string>;
  /** The sign-in uid of each email that has an account, keyed lower-case. */
  uidByEmail: ReadonlyMap<string, string>;
}

export type IdentityVerdict =
  /** The record is at trainers/{its sign-in uid}. */
  | "at-uid"
  /** The person also has trainers/{uid}; sign-in uses that one, so the rules find them. */
  | "duplicate"
  /** OFFENDER. The person has signed in, and there is no record at trainers/{uid}. */
  | "stranded"
  /** A placeholder nobody has signed in to yet: its owner claims it at first sign-in. */
  | "placeholder"
  /** Not a placeholder, and nobody with its email has ever signed in: a first sign-in would land on it. */
  | "never-signed-in"
  /** No email and not a sign-in uid: nobody can sign in to it. */
  | "unreachable"
  /** Left out: switched off, superseded by a claim, or one of Demo Mode's own. */
  | "switched-off"
  | "superseded"
  | "demo";

export interface IdentityRow {
  id: string;
  email: string;
  verdict: IdentityVerdict;
  /** The sign-in uid, when one is known. */
  uid: string | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A record Demo Mode's seeder made (trainers/demo-trainer-*, never a person). */
export function isDemoTrainer(row: TrainerRow): boolean {
  return row.id.startsWith("demo-trainer-") || row.data.isDemo === true;
}

/**
 * Where each live trainer record stands against the rule "your record is at
 * trainers/{your sign-in uid}". The order of the questions is the app's own
 * sign-in (useAuthInitialization): trainers/{uid} first, then the email.
 */
export function classifyTrainers(rows: readonly TrainerRow[], auth: AuthFacts): IdentityRow[] {
  const ids = new Set(rows.map((r) => r.id));
  return rows.map((row) => {
    const email = text(row.data.email).toLowerCase();
    const base = { id: row.id, email };
    if (text(row.data.supersededByUid)) return { ...base, verdict: "superseded", uid: null };
    if (row.data.isActive === false) return { ...base, verdict: "switched-off", uid: null };
    if (isDemoTrainer(row)) return { ...base, verdict: "demo", uid: null };
    if (auth.uids.has(row.id)) return { ...base, verdict: "at-uid", uid: row.id };

    const named = text(row.data.authUid);
    const uid = (named && auth.uids.has(named) ? named : null) ?? (email ? auth.uidByEmail.get(email) ?? null : null);
    if (uid) {
      if (uid === row.id) return { ...base, verdict: "at-uid", uid };
      return { ...base, verdict: ids.has(uid) ? "duplicate" : "stranded", uid };
    }
    if (row.data.pendingClaim === true) return { ...base, verdict: "placeholder", uid: null };
    if (!email) return { ...base, verdict: "unreachable", uid: null };
    return { ...base, verdict: "never-signed-in", uid: null };
  });
}

/** The home studio the rules read for a client: homeStudioId, else studioId (firestore.rules studioIdOf). */
export function clientHomeOf(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  const home = "homeStudioId" in data ? data.homeStudioId : "studioId" in data ? data.studioId : "";
  return typeof home === "string" ? home : "";
}

export interface SessionRow {
  id: string;
  hostedAtStudioId?: unknown;
  clientId?: unknown;
}

export interface ClientRow {
  id: string;
  data: Record<string, unknown>;
}

export interface DemoFindings {
  /** 12a: hosted at demo-studio, naming a client on record outside Demo Mode. */
  demoHostedRealClient: string[];
  /** 12a, for the record: hosted at demo-studio, naming a client that is not on record. */
  demoHostedMissingClient: string[];
  /** 12c: naming a Demo client, hosted at a real studio (or nowhere). */
  realHostedDemoClient: string[];
  /** 12b: a real client whose cross-train approvals name demo-studio. */
  realClientApprovedAtDemo: string[];
}

/**
 * Item 12. `demoHosted` are the sessions hosted at demo-studio; `demoClientSessions`
 * every session naming a Demo client; `clients` every client either list names,
 * plus the clients whose approvals hold demo-studio.
 */
export function demoFindings(input: {
  demoHosted: readonly SessionRow[];
  demoClientSessions: readonly SessionRow[];
  clients: ReadonlyMap<string, Record<string, unknown>>;
  approvedAtDemo: readonly ClientRow[];
}): DemoFindings {
  const out: DemoFindings = {
    demoHostedRealClient: [],
    demoHostedMissingClient: [],
    realHostedDemoClient: [],
    realClientApprovedAtDemo: [],
  };
  for (const s of input.demoHosted) {
    if (text(s.hostedAtStudioId) !== DEMO_STUDIO) continue;
    const cid = text(s.clientId);
    if (!cid) continue;
    const client = input.clients.get(cid);
    if (!client) out.demoHostedMissingClient.push(s.id);
    else if (clientHomeOf(client) !== DEMO_STUDIO) out.demoHostedRealClient.push(s.id);
  }
  for (const s of input.demoClientSessions) {
    const cid = text(s.clientId);
    const client = cid ? input.clients.get(cid) : undefined;
    if (!client || clientHomeOf(client) !== DEMO_STUDIO) continue;
    if (text(s.hostedAtStudioId) !== DEMO_STUDIO) out.realHostedDemoClient.push(s.id);
  }
  for (const c of input.approvedAtDemo) {
    const approved = Array.isArray(c.data.approvedCrossTrainStudioIds) ? c.data.approvedCrossTrainStudioIds : [];
    if (!approved.includes(DEMO_STUDIO)) continue;
    if (clientHomeOf(c.data) !== DEMO_STUDIO) out.realClientApprovedAtDemo.push(c.id);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}

export interface AuditReport {
  identity: IdentityRow[];
  demo: DemoFindings;
}

export interface AuditGate {
  item0: number;
  item12: number;
  /** True when both are 0: the rules may go live. */
  pass: boolean;
}

/** The two numbers the ship script stops on. */
export function gateOf(report: AuditReport): AuditGate {
  const item0 = report.identity.filter((r) => r.verdict === "stranded").length;
  const d = report.demo;
  const item12 = d.demoHostedRealClient.length + d.realHostedDemoClient.length + d.realClientApprovedAtDemo.length;
  return { item0, item12, pass: item0 === 0 && item12 === 0 };
}

const count = (rows: readonly IdentityRow[], v: IdentityVerdict) => rows.filter((r) => r.verdict === v).length;

/** The report, in plain words: counts, and ids and emails only for what needs a person. */
export function reportLines(report: AuditReport): string[] {
  const rows = report.identity;
  const gate = gateOf(report);
  const lines: string[] = [];
  const offenders = (verdict: IdentityVerdict) =>
    rows
      .filter((r) => r.verdict === verdict)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => `      ${r.id}  ${r.email || "(no email)"}${r.uid ? `  signs in as ${r.uid}` : ""}`);

  lines.push(`Item 0. Trainer records against trainers/{sign-in uid} (${rows.length} records read)`);
  lines.push(`  at their sign-in uid     ${count(rows, "at-uid")}`);
  lines.push(`  placeholders (unclaimed) ${count(rows, "placeholder")}`);
  lines.push(`  duplicates               ${count(rows, "duplicate")}   (the person also has trainers/{uid}; sign-in uses that one)`);
  lines.push(`  unreachable              ${count(rows, "unreachable")}   (no email, not a sign-in uid: nobody can sign in to it)`);
  lines.push(`  left out                 ${count(rows, "switched-off")} switched off, ${count(rows, "superseded")} superseded, ${count(rows, "demo")} Demo Mode`);
  lines.push(`  STRANDED                 ${gate.item0}   (signed in, no record at trainers/{uid}: must be 0)`);
  lines.push(...offenders("stranded"));
  const never = count(rows, "never-signed-in");
  lines.push(`  never signed in          ${never}   (not a placeholder: a first sign-in lands on a record the rules can't find)`);
  if (never > 0) {
    lines.push("      Not a stop: such a person is refused every write today, and Round 0 changes nothing for them.");
    lines.push("      Switch off anyone who has left; ask Claude about the rest.");
    lines.push(...offenders("never-signed-in"));
  }

  const d = report.demo;
  lines.push("");
  lines.push("Item 12. Real clients tied to Demo Mode (every trainer has the run of Demo Mode)");
  lines.push(`  sessions hosted at demo-studio naming a real client   ${d.demoHostedRealClient.length}`);
  for (const id of d.demoHostedRealClient) lines.push(`      session ${id}`);
  lines.push(`  sessions naming a Demo client hosted elsewhere      ${d.realHostedDemoClient.length}`);
  for (const id of d.realHostedDemoClient) lines.push(`      session ${id}`);
  lines.push(`  real clients approved to cross-train at demo-studio  ${d.realClientApprovedAtDemo.length}`);
  for (const id of d.realClientApprovedAtDemo) lines.push(`      client ${id}`);
  lines.push(`  (for the record, not a stop) Demo sessions naming a client not on record  ${d.demoHostedMissingClient.length}`);

  lines.push("");
  lines.push(`GATE item0=${gate.item0} item12=${gate.item12} ${gate.pass ? "PASS" : "STOP"}`);
  return lines;
}
