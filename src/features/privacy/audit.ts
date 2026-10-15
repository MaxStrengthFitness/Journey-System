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
 *           0. Expected: 0. Every Firebase sign-in account is followed
 *           the way useAuthInitialization signs a person in (its own record,
 *           else the email lookup, a claim, the door), so a Microsoft account
 *           with its email only on the provider, a second account for one
 *           email and a refused claim are all seen.
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
    isDemo?: unknown;
  };
}

/** One Firebase Auth account, as the script lists them (read only). */
export interface AuthAccount {
  uid: string;
  /** The account's own email, as stored: what the ID token's `email` claim carries. */
  email?: string | null;
  /** The emails its sign-in providers carry (a Microsoft sign-in can leave the account's own empty). */
  providerEmails?: readonly string[];
}

/** Where one account's sign-in lands, step by step as useAuthInitialization does it. */
export type SignInOutcome =
  /** trainers/{uid} exists: the rules find the person. */
  | { kind: "own"; recordId: string }
  /** No email to look up, or no record with it: the access request (or the owner's own bootstrap). */
  | { kind: "request" }
  /** A placeholder whose claim the rules accept: the next sign-in makes trainers/{uid}. */
  | { kind: "claims"; recordId: string }
  /** A switched-off record: signed straight out at the door. */
  | { kind: "refused"; recordId: string }
  /** OFFENDER. The app opens on a record that is not at trainers/{uid}. */
  | { kind: "stranded"; recordId: string };

export type IdentityVerdict =
  /** The record is at trainers/{its sign-in uid}. */
  | "at-uid"
  /** The record of someone whose sign-in uses another record at their own uid. */
  | "duplicate"
  /** OFFENDER. A sign-in lands on it, and it is not at that sign-in's uid. */
  | "stranded"
  /** A placeholder: its owner claims it at their next (or first) sign-in. */
  | "placeholder"
  /** Not a placeholder, and no sign-in lands on it yet: a first sign-in with its email would. */
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
  /** The sign-in uid that lands on it, when one does. */
  uid: string | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A record Demo Mode's seeder made (trainers/demo-trainer-*, never a person). */
export function isDemoTrainer(row: TrainerRow): boolean {
  return row.id.startsWith("demo-trainer-") || row.data.isDemo === true;
}

/** The email the app looks a person up by: the account's own, else the first a provider carries. */
export function resolvedEmailOf(account: AuthAccount): string | null {
  const own = text(account.email);
  if (own) return own;
  for (const e of account.providerEmails ?? []) if (text(e)) return text(e);
  return null;
}

/**
 * Where one account's sign-in lands (hooks/useAuthInitialization.ts, the
 * resolve step): with no email, nothing is looked up (the access request);
 * trainers/{uid} first; then the records whose stored email EQUALS the
 * email in lower case (a Firestore equality, so a stored "Sam@X.com" is never
 * found), superseded ones dropped, the first by id. A placeholder is claimed
 * when the rules accept it (selfCreateIsAClaim: the token's own email, in
 * lower case, is the placeholder's); a refused claim falls back to the
 * placeholder itself. A switched-off record is refused at the door.
 */
export function signInLandsOn(account: AuthAccount, rows: readonly TrainerRow[]): SignInOutcome {
  const resolved = resolvedEmailOf(account);
  if (!resolved) return { kind: "request" };
  if (rows.some((r) => r.id === account.uid)) return { kind: "own", recordId: account.uid };
  const q = resolved.toLowerCase();
  const live = rows
    .filter((r) => r.data.email === q && !text(r.data.supersededByUid))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const first = live[0];
  if (!first) return { kind: "request" };
  if (first.data.pendingClaim === true) {
    const tokenEmail = text(account.email).toLowerCase();
    if (tokenEmail && tokenEmail === text(first.data.email).toLowerCase()) return { kind: "claims", recordId: first.id };
  }
  if (first.data.isActive === false) return { kind: "refused", recordId: first.id };
  return { kind: "stranded", recordId: first.id };
}

/** Every account's landing, the stranded ones first. */
export function landings(accounts: readonly AuthAccount[], rows: readonly TrainerRow[]): Array<{ uid: string; outcome: SignInOutcome }> {
  return accounts
    .map((a) => ({ uid: a.uid, outcome: signInLandsOn(a, rows) }))
    .sort((a, b) => (a.outcome.kind === "stranded" ? 0 : 1) - (b.outcome.kind === "stranded" ? 0 : 1) || a.uid.localeCompare(b.uid));
}

/** Where each live trainer record stands, from the same landings. */
export function classifyTrainers(rows: readonly TrainerRow[], accounts: readonly AuthAccount[]): IdentityRow[] {
  const uids = new Set(accounts.map((a) => a.uid));
  const landed = landings(accounts, rows);
  const strandedOn = new Map<string, string>();
  const claimedOn = new Map<string, string>();
  for (const l of landed) {
    if (l.outcome.kind === "stranded" && !strandedOn.has(l.outcome.recordId)) strandedOn.set(l.outcome.recordId, l.uid);
    if (l.outcome.kind === "claims") claimedOn.set(l.outcome.recordId, l.uid);
  }
  const emailsWithOwnRecord = new Set(
    accounts
      .filter((a) => rows.some((r) => r.id === a.uid))
      .flatMap((a) => [text(a.email), ...(a.providerEmails ?? []).map(text)])
      .filter(Boolean)
      .map((e) => e.toLowerCase()),
  );
  return rows.map((row) => {
    const email = text(row.data.email);
    const base = { id: row.id, email };
    if (text(row.data.supersededByUid)) return { ...base, verdict: "superseded", uid: null };
    if (row.data.isActive === false) return { ...base, verdict: "switched-off", uid: null };
    if (isDemoTrainer(row)) return { ...base, verdict: "demo", uid: null };
    if (uids.has(row.id)) return { ...base, verdict: "at-uid", uid: row.id };
    const stranded = strandedOn.get(row.id);
    if (stranded) return { ...base, verdict: "stranded", uid: stranded };
    if (row.data.pendingClaim === true) return { ...base, verdict: "placeholder", uid: claimedOn.get(row.id) ?? null };
    if (!email) return { ...base, verdict: "unreachable", uid: null };
    if (emailsWithOwnRecord.has(email.toLowerCase())) return { ...base, verdict: "duplicate", uid: null };
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
  /** Every sign-in account's landing (landings()). */
  accounts: Array<{ uid: string; outcome: SignInOutcome }>;
  demo: DemoFindings;
}

/** The audit's whole answer from what the script read. */
export function auditReport(input: {
  trainers: readonly TrainerRow[];
  accounts: readonly AuthAccount[];
  demo: DemoFindings;
}): AuditReport {
  return {
    identity: classifyTrainers(input.trainers, input.accounts),
    accounts: landings(input.accounts, input.trainers),
    demo: input.demo,
  };
}

export interface AuditGate {
  item0: number;
  item12: number;
  /** True when both are 0: the rules may go live. */
  pass: boolean;
}

/** The two numbers the ship script stops on. Item 0 counts sign-in ACCOUNTS that land stranded. */
export function gateOf(report: AuditReport): AuditGate {
  const item0 = report.accounts.filter((a) => a.outcome.kind === "stranded").length;
  const d = report.demo;
  const item12 = d.demoHostedRealClient.length + d.realHostedDemoClient.length + d.realClientApprovedAtDemo.length;
  return { item0, item12, pass: item0 === 0 && item12 === 0 };
}

const count = (rows: readonly IdentityRow[], v: IdentityVerdict) => rows.filter((r) => r.verdict === v).length;
const landed = (report: AuditReport, kind: SignInOutcome["kind"]) => report.accounts.filter((a) => a.outcome.kind === kind).length;

/** The report, in plain words: counts, and ids and emails only for what needs a person. */
export function reportLines(report: AuditReport): string[] {
  const rows = report.identity;
  const gate = gateOf(report);
  const lines: string[] = [];
  const emailOf = (id: string) => rows.find((r) => r.id === id)?.email || "(no email)";
  const listed = (verdict: IdentityVerdict) =>
    rows
      .filter((r) => r.verdict === verdict)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => `      ${r.id}  ${r.email || "(no email)"}`);

  lines.push(`Item 0. Every sign-in account, followed the way the app signs a person in (${report.accounts.length} accounts)`);
  lines.push(`  their own record at trainers/{uid}       ${landed(report, "own")}`);
  lines.push(`  the access request (no record by email)  ${landed(report, "request")}`);
  lines.push(`  claim a placeholder at the next sign-in  ${landed(report, "claims")}`);
  lines.push(`  a switched-off record (refused)          ${landed(report, "refused")}`);
  lines.push(`  STRANDED                                 ${gate.item0}   (the app opens on a record not at trainers/{uid}: must be 0)`);
  for (const a of report.accounts) {
    if (a.outcome.kind === "stranded") lines.push(`      account ${a.uid} opens on trainers/${a.outcome.recordId}  ${emailOf(a.outcome.recordId)}`);
  }
  lines.push(`  The trainer records (${rows.length} read): ${count(rows, "at-uid")} at their sign-in uid, ${count(rows, "placeholder")} placeholders,`);
  lines.push(`    ${count(rows, "duplicate")} duplicates (the person signs in to another record at their uid), ${count(rows, "unreachable")} with no email,`);
  lines.push(`    ${count(rows, "switched-off")} switched off, ${count(rows, "superseded")} superseded, ${count(rows, "demo")} Demo Mode.`);
  const never = count(rows, "never-signed-in");
  lines.push(`  never signed in                          ${never}   (not a placeholder, and no sign-in lands on it yet)`);
  if (never > 0) {
    lines.push("      Not a stop: nobody uses these today. A first sign-in with one of these emails would open on a record");
    lines.push("      the rules can't find: refused every write today, and every client read after Round 0.");
    lines.push("      Switch off anyone who has left; ask Claude about the rest before they sign in.");
    lines.push(...listed("never-signed-in"));
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
