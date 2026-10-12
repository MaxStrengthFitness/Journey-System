/**
 * WHAT THE BACKGROUND PULL FINDS THAT THE WEBHOOK HAD NOT
 * (the Mindbody savings round, Oct 12 2026).
 *
 * Every thirty minutes one iPad at each studio asks Mindbody for today and
 * tomorrow (features/admin/useAutoSync.ts). It is the guarantee under the
 * webhook, which brings most changes in seconds: AJ's freshness for today is
 * "within about 30 minutes" (the cost plan, Sep 26 2026). Each of those pulls
 * is a Mindbody call, and the 30-minute pull is now about half of every
 * studio's calls. Whether it can ever be slowed depends on one fact nobody
 * had: how often does it find something the webhook had not already
 * delivered?
 *
 * So each background pull of today and tomorrow that Mindbody answered in full
 * adds to one small document for the studio's day,
 * `studios/{s}/sync/near-YYYY-MM-DD`: `checks` (+1), `finds` (+1 when it
 * changed anything) and `rows` (how many bookings it changed). Operations ->
 * Mindbody reads the last fourteen days and says it in one sentence. Nothing
 * here changes how often anything is pulled; that stays AJ's call
 * (CLAUDE.md, "How fresh each Mindbody fact must be").
 *
 * A find is not always the webhook's fault: a booking whose client name the
 * pull spelled differently counts too. The sentence says "changed", not
 * "missed", for that reason, and the rows count is there to read with it.
 *
 * Pure: no Firestore.
 */

/** The days Operations -> Mindbody looks back over. */
export const NEAR_CHECK_DAYS = 14;

/** Below this many checks the sentence says there isn't enough yet. */
export const NEAR_CHECK_MIN = 20;

export interface NearCheckDay {
  checks?: number;
  finds?: number;
  rows?: number;
}

/** The document id for a studio day ("YYYY-MM-DD"), or null for a bad day. */
export function nearCheckDocId(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `near-${day}` : null;
}

/**
 * What one background pull adds, or null when it should add nothing: a month
 * pull, or an answer that wasn't whole (it checked nothing reliably).
 */
export function nearCheckAdds(
  pull: { deep: boolean; windowComplete?: boolean; windowChanges?: number },
): { checks: 1; finds: 0 | 1; rows: number } | null {
  if (pull.deep || pull.windowComplete !== true) return null;
  const rows = Math.max(0, Math.floor(Number(pull.windowChanges) || 0));
  return { checks: 1, finds: rows > 0 ? 1 : 0, rows };
}

/** The `n` studio days ending today, newest first ("YYYY-MM-DD"). */
export function lastStudioDays(today: string, n: number = NEAR_CHECK_DAYS): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const [y, m, d] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(y, m - 1, d - i));
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export interface NearCheckSummary {
  checks: number;
  finds: number;
  rows: number;
}

export function summariseNearChecks(days: ReadonlyArray<NearCheckDay | null | undefined>): NearCheckSummary {
  let checks = 0;
  let finds = 0;
  let rows = 0;
  for (const d of days) {
    if (!d) continue;
    checks += num(d.checks);
    finds += num(d.finds);
    rows += num(d.rows);
  }
  return { checks, finds: Math.min(finds, checks), rows };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** One sentence for Operations -> Mindbody, and how loudly to say it. */
export function nearChecksLine(
  s: NearCheckSummary | null,
): { tone: "ok" | "info"; text: string } {
  if (!s) return { tone: "info", text: "Couldn't read what the background checks found." };
  if (s.checks < NEAR_CHECK_MIN) {
    return {
      tone: "info",
      text: `Background checks of today and tomorrow, last ${NEAR_CHECK_DAYS} days: not enough yet to say how often they find something the webhook hadn't (${plural(s.checks, "check", "checks")} so far).`,
    };
  }
  if (s.finds === 0) {
    return {
      tone: "ok",
      text: `Last ${NEAR_CHECK_DAYS} days: ${plural(s.checks, "background check", "background checks")} of today and tomorrow, and none changed anything. The webhook had already brought every change.`,
    };
  }
  return {
    tone: "info",
    text: `Last ${NEAR_CHECK_DAYS} days: ${plural(s.checks, "background check", "background checks")} of today and tomorrow; ${s.finds.toLocaleString("en-US")} changed something the webhook hadn't brought (${plural(s.rows, "booking", "bookings")}).`,
  };
}
