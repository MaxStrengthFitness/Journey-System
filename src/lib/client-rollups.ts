/**
 * CLIENT ROLLUPS — the numbers the profile header and Equipment tab read
 * without loading history.
 *
 * Two rollups live on the client document:
 *
 *   trainerTally   { [trainerKey]: completedSessions }   → Top Trainer
 *   machineStats   { [machineId]: ClientMachineStat }    → first / times / progression
 *
 * Both are maintained at the moment a completed session is written — finishing
 * a live session (lib/sync-utils.ts) and the legacy CSV import
 * (features/admin/import/LegacyChartImporter.tsx) — and unwound when a session is deleted
 * from the History tab. Everything in this file is PURE: it takes plain data
 * and returns the Firestore update object. The callers add `increment()` /
 * `serverTimestamp()` through the small `FieldOps` seam so the maths here can
 * be unit-tested without Firestore.
 *
 * Why a tally and not a stored winner only: with two trainers at 22 and 23
 * sessions, the winner flips on a single session. Storing the counts and
 * deriving the winner means the header is right the moment the write lands,
 * and a deleted session takes its vote back with it.
 */

import type { Client, ClientMachineStat, Trainer } from "../types";
import { ANOTHER_STUDIOS_TRAINER, findTrainerRecord } from "../features/trainer-scope/names";
import { isPerformedLog, type OutcomeLog } from "./set-outcome";

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

/**
 * Sessions carry a trainerId most of the time. Imported and very old
 * sessions sometimes only carry initials (or the placeholder
 * "legacy-trainer"). Those still count — they are coached sessions — but
 * they are tallied under an `initials:` key so a later resolve can map them
 * to a trainer document by initials.
 */
export function trainerKeyFor(session: {
  trainerId?: string | null;
  trainerInitials?: string | null;
  trainerName?: string | null;
}): string | null {
  const id = (session.trainerId || "").trim();
  if (id && id !== "legacy-trainer" && id !== "unknown") return id;
  const initials = (session.trainerInitials || "").trim().toUpperCase();
  if (initials && initials !== "LEGACY" && initials !== "CHART" && initials !== "--" && initials !== "—") {
    return `initials:${initials}`;
  }
  return null;
}

/** Firestore field paths cannot contain "." — trainer ids are opaque, so sanitise. */
export function tallyFieldKey(trainerKey: string): string {
  return trainerKey.replace(/[.~*/[\]]/g, "_");
}

/**
 * How many of a client's sessions a trainer has coached, by the tally: the
 * ones under the trainer's id, plus the ones that carry only their initials
 * (imported history, tallied under `initials:` above). The Hub's "First with"
 * asked by id alone and called every imported client's first booking a first
 * time with every trainer (AJ, Oct 22 2026: Fran Gesten, nine sessions with
 * him under `initials:AJ`). Initials unknown: the id's count alone.
 */
export function trainerTallyCount(
  tally: Readonly<Record<string, number>> | null | undefined,
  trainer: { id: string; initials?: string | null },
): number {
  if (!tally) return 0;
  const count = (key: string) => {
    const n = Number(tally[tallyFieldKey(key)] ?? tally[key] ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const initials = (trainer.initials || "").trim().toUpperCase();
  return count(trainer.id) + (initials ? count(`initials:${initials}`) : 0);
}

/* ------------------------------------------------------------------ *
 * Top trainer
 * ------------------------------------------------------------------ */

export interface TopTrainer {
  key: string;
  /** Resolved trainer document, when the key maps to one. */
  trainer: Trainer | null;
  /** Display name: the trainer's full name, the name the sessions carry, the bare initials, or "A trainer from another studio". */
  name: string;
  /** Whether `name` names the person (a record, a stored name or initials) rather than saying they are from another studio: only a named name is written to the client. */
  named: boolean;
  sessions: number;
  /** Total tallied sessions across every trainer — for "23 of 46". */
  total: number;
  /** Share of all tallied sessions, 0–1. */
  share: number;
}

/** The names the sessions themselves carry, by tally key: the one Start stamped on each (the trainer lock, Oct 18 2026). */
export type StoredTrainerNames = ReadonlyMap<string, string>;

function resolveTrainer(key: string, trainers: Trainer[]): Trainer | null {
  if (key.startsWith("initials:")) {
    const initials = key.slice("initials:".length);
    return trainers.find((t) => (t.initials || "").toUpperCase() === initials) ?? null;
  }
  // The document id, or an older account's sign-in uid. An id the list
  // doesn't hold is a trainer from another studio, never matched by initials.
  return findTrainerRecord(trainers, key) ?? null;
}

/** The name for a key the list can't resolve: the stored name, the initials, or the words. */
function unresolvedName(key: string, stored: StoredTrainerNames | undefined): { name: string; named: boolean } {
  const fromSessions = (stored?.get(key) ?? "").trim();
  if (fromSessions) return { name: fromSessions, named: true };
  if (key.startsWith("initials:")) return { name: key.slice("initials:".length), named: true };
  return { name: ANOTHER_STUDIOS_TRAINER, named: false };
}

/**
 * The names the sessions carry, by the key the tally uses for each, the
 * latest session's name winning. Hand it to `resolveTopTrainer` and
 * `tallyRows` so a coach the list doesn't hold is still named as Start named
 * them.
 */
export function storedNamesFromSessions(
  sessions: Array<{ trainerId?: string | null; trainerInitials?: string | null; trainerName?: string | null }>,
): StoredTrainerNames {
  const out = new Map<string, string>();
  for (const s of sessions) {
    const name = (s.trainerName ?? "").trim();
    if (!name) continue;
    const key = trainerKeyFor(s);
    if (key) out.set(tallyFieldKey(key), name);
  }
  return out;
}

/**
 * Derive the top trainer from a tally. Ties break toward `preferKey` (the
 * previously stored winner) so the header does not flip-flop on an even
 * split; failing that, the first key in insertion order.
 */
export function resolveTopTrainer(
  tally: Record<string, number> | undefined | null,
  trainers: Trainer[],
  preferKey?: string | null,
  storedNames?: StoredTrainerNames,
): TopTrainer | null {
  if (!tally) return null;
  let bestKey: string | null = null;
  let best = 0;
  let total = 0;
  for (const [key, raw] of Object.entries(tally)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    total += n;
    if (n > best || (n === best && key === preferKey)) {
      best = n;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  const trainer = resolveTrainer(bestKey, trainers);
  const fallback = unresolvedName(bestKey, storedNames);
  return {
    key: bestKey,
    trainer,
    name: trainer?.fullName || fallback.name,
    named: Boolean(trainer?.fullName) || fallback.named,
    sessions: best,
    total,
    share: total > 0 ? best / total : 0,
  };
}

/** Every trainer who has trained the client, most sessions first. */
export interface TallyRow {
  key: string;
  name: string;
  sessions: number;
  share: number;
}
export function tallyRows(
  tally: Record<string, number> | undefined | null,
  trainers: Trainer[],
  storedNames?: StoredTrainerNames,
): TallyRow[] {
  if (!tally) return [];
  const rows: TallyRow[] = [];
  let total = 0;
  for (const [key, raw] of Object.entries(tally)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    total += n;
    const trainer = resolveTrainer(key, trainers);
    rows.push({
      key,
      name: trainer?.fullName || unresolvedName(key, storedNames).name,
      sessions: n,
      share: 0,
    });
  }
  rows.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  return rows.map((r) => ({ ...r, share: total > 0 ? r.sessions / total : 0 }));
}

/** Build a tally from scratch — the one-time backfill and the tests use this. */
export function tallyFromSessions(
  sessions: Array<{
    status?: string;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  }>,
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const s of sessions) {
    if (s.status && s.status !== "Completed") continue;
    const key = trainerKeyFor(s);
    if (!key) continue;
    const field = tallyFieldKey(key);
    tally[field] = (tally[field] || 0) + 1;
  }
  return tally;
}

/* ------------------------------------------------------------------ *
 * Machine stats
 * ------------------------------------------------------------------ */

/**
 * The fields a rollup reads off a log. `outcome` and the hold flags come
 * along so set-outcome.ts can decide whether the set counts: only a
 * PERFORMED set votes for timesPerformed or moves first/last weight. A
 * practice set, a skipped machine and a not-reached placeholder are logs
 * too, but they never happened as sets (docs/ARCHITECTURE.md §1.6).
 */
export interface RollupLog extends OutcomeLog {
  machineId?: string | null;
  weight?: string | number | null;
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** "2026-09-02", "2026-09-02T10:00", "9/2/2026" → "2026-09-02". Date-only, timezone-proof. */
export function toIsoDay(raw: string | Date | undefined | null): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  }
  const s = String(raw).trim().replace(" ", "T").split("T")[0];
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = new Date(String(raw));
  return Number.isNaN(t.getTime()) ? "" : toIsoDay(t);
}

/**
 * The Firestore operations a caller supplies. Kept as a seam so the pure
 * functions can be tested with plain numbers (see client-rollups.test.ts).
 */
export interface FieldOps {
  increment: (n: number) => unknown;
  serverTimestamp: () => unknown;
}

/** Plain-number implementation used by tests and by the backfill preview. */
export const plainFieldOps: FieldOps = {
  increment: (n) => n,
  serverTimestamp: () => new Date().toISOString(),
};

/**
 * Update object (dot-path keys, ready for `updateDoc`/`batch.update`) that
 * records ONE completed session for the client.
 *
 *  - trainerTally.<key>       increment(1)
 *  - topTrainerId / Name / Sessions   re-derived from the tally the caller
 *    already has in memory + this session (best-effort; the header derives
 *    its own from the live tally, so a stale local copy is harmless)
 *  - machineStats.<id>.timesPerformed increment(1), first* fill blanks,
 *    last* overwrite.
 */
export function completedSessionRollup(
  client: Pick<Client, "trainerTally" | "machineStats" | "topTrainerId"> | null | undefined,
  session: {
    date?: string | Date | null;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  },
  logs: RollupLog[],
  trainers: Trainer[],
  ops: FieldOps,
  /**
   * When the client's machine totals have not answered (they live in their
   * own document since the iPad round, features/machine-totals), `client`
   * carries no machineStats, and "nothing on file" would read as "first
   * time": the first pair would be written over the real one on the totals
   * document, permanently. `existingKnown: false` writes only what needs no
   * look at what is on file: the count, and the last pair when `newest` (a
   * session finished today is the newest by definition; an old one is not).
   */
  options: { existingKnown?: boolean; newest?: boolean } = {},
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const day = toIsoDay(session.date ?? new Date());
  const existingKnown = options.existingKnown !== false;

  /* ---- trainer tally ---- */
  const key = trainerKeyFor(session);
  if (key) {
    const field = tallyFieldKey(key);
    updates[`trainerTally.${field}`] = ops.increment(1);
    const projected: Record<string, number> = { ...(client?.trainerTally || {}) };
    projected[field] = (projected[field] || 0) + 1;
    const top = resolveTopTrainer(projected, trainers, client?.topTrainerId);
    if (top) {
      updates.topTrainerId = top.key;
      // Only write a name that names the person — a caller that passed just
      // the finishing trainer must not stamp "A trainer from another studio"
      // over a name an earlier write got right. The header derives its own
      // name anyway.
      if (top.named) updates.topTrainerName = top.name;
      updates.topTrainerSessions = top.sessions;
    }
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }

  /* ---- machine stats — one vote per machine per session, performed sets only ---- */
  const seen = new Set<string>();
  for (const log of logs) {
    const machineId = (log.machineId || "").trim();
    if (!machineId || seen.has(machineId)) continue;
    if (!isPerformedLog(log)) continue;
    const weight = toNumber(log.weight);
    seen.add(machineId);
    const existing = client?.machineStats?.[machineId];
    const base = `machineStats.${machineId}`;
    updates[`${base}.timesPerformed`] = ops.increment(1);
    if (!existingKnown) {
      if (options.newest) {
        if (day) updates[`${base}.lastPerformedDate`] = day;
        if (weight !== null) updates[`${base}.lastWeight`] = weight;
      }
      continue;
    }
    if (day) {
      if (!existing?.firstPerformedDate || day < existing.firstPerformedDate) {
        updates[`${base}.firstPerformedDate`] = day;
        if (weight !== null) updates[`${base}.firstWeight`] = weight;
      }
      if (!existing?.lastPerformedDate || day >= existing.lastPerformedDate) {
        updates[`${base}.lastPerformedDate`] = day;
        if (weight !== null) updates[`${base}.lastWeight`] = weight;
      }
    } else if (weight !== null) {
      if (existing?.firstWeight === undefined) updates[`${base}.firstWeight`] = weight;
      updates[`${base}.lastWeight`] = weight;
    }
  }

  return updates;
}

/**
 * Reverse of the above for a deleted session. Only the tally and the
 * times-performed counters are unwound; first/last dates stay (recomputing
 * them needs the full history, which the delete path does not have, and a
 * date that is one session too early is a far smaller lie than a count that
 * is one too high). Only performed sets are unwound — the same sets that
 * voted on the way in, so a skipped machine never takes back a vote it
 * never cast.
 */
export function deletedSessionRollup(
  session: { trainerId?: string | null; trainerInitials?: string | null; trainerName?: string | null },
  logs: RollupLog[],
  ops: FieldOps,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const key = trainerKeyFor(session);
  if (key) {
    updates[`trainerTally.${tallyFieldKey(key)}`] = ops.increment(-1);
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }
  const seen = new Set<string>();
  for (const log of logs) {
    const machineId = (log.machineId || "").trim();
    if (!machineId || seen.has(machineId)) continue;
    if (!isPerformedLog(log)) continue;
    seen.add(machineId);
    updates[`machineStats.${machineId}.timesPerformed`] = ops.increment(-1);
  }
  return updates;
}

/**
 * Bulk form for the CSV import: N sessions in one update object. Tally
 * increments are summed per trainer; machine stats are folded in date order
 * so first/last land correctly even when the chart's columns arrive out of
 * order.
 */
export function importedSessionsRollup(
  client: Pick<Client, "trainerTally" | "machineStats" | "topTrainerId"> | null | undefined,
  sessions: Array<{
    date?: string | null;
    trainerId?: string | null;
    trainerInitials?: string | null;
    logs: RollupLog[];
  }>,
  trainers: Trainer[],
  ops: FieldOps,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const tallyAdd: Record<string, number> = {};
  for (const s of sessions) {
    const key = trainerKeyFor(s);
    if (!key) continue;
    const field = tallyFieldKey(key);
    tallyAdd[field] = (tallyAdd[field] || 0) + 1;
  }
  const projected: Record<string, number> = { ...(client?.trainerTally || {}) };
  for (const [field, n] of Object.entries(tallyAdd)) {
    updates[`trainerTally.${field}`] = ops.increment(n);
    projected[field] = (projected[field] || 0) + n;
  }
  if (Object.keys(tallyAdd).length) {
    const top = resolveTopTrainer(projected, trainers, client?.topTrainerId);
    if (top) {
      updates.topTrainerId = top.key;
      // Only write a name that names the person — a caller that passed just
      // the finishing trainer must not stamp "A trainer from another studio"
      // over a name an earlier write got right. The header derives its own
      // name anyway.
      if (top.named) updates.topTrainerName = top.name;
      updates.topTrainerSessions = top.sessions;
    }
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }

  /* machine stats: walk sessions oldest → newest, tracking first/last locally */
  const ordered = [...sessions].sort((a, b) => toIsoDay(a.date).localeCompare(toIsoDay(b.date)));
  const stat: Record<string, { first?: string; firstW?: number; last?: string; lastW?: number; times: number }> = {};
  for (const s of ordered) {
    const day = toIsoDay(s.date);
    const seen = new Set<string>();
    for (const log of s.logs) {
      const machineId = (log.machineId || "").trim();
      if (!machineId || seen.has(machineId)) continue;
      if (!isPerformedLog(log)) continue;
      const weight = toNumber(log.weight);
      seen.add(machineId);
      const cur = (stat[machineId] ||= { times: 0 });
      cur.times += 1;
      if (day) {
        if (!cur.first || day < cur.first) {
          cur.first = day;
          if (weight !== null) cur.firstW = weight;
        }
        if (!cur.last || day >= cur.last) {
          cur.last = day;
          if (weight !== null) cur.lastW = weight;
        }
      }
    }
  }
  for (const [machineId, cur] of Object.entries(stat)) {
    const existing = client?.machineStats?.[machineId];
    const base = `machineStats.${machineId}`;
    updates[`${base}.timesPerformed`] = ops.increment(cur.times);
    if (cur.first && (!existing?.firstPerformedDate || cur.first < existing.firstPerformedDate)) {
      updates[`${base}.firstPerformedDate`] = cur.first;
      if (cur.firstW !== undefined) updates[`${base}.firstWeight`] = cur.firstW;
    }
    if (cur.last && (!existing?.lastPerformedDate || cur.last >= existing.lastPerformedDate)) {
      updates[`${base}.lastPerformedDate`] = cur.last;
      if (cur.lastW !== undefined) updates[`${base}.lastWeight`] = cur.lastW;
    }
  }
  return updates;
}

/* ------------------------------------------------------------------ *
 * Backfill — for clients that predate the field
 * ------------------------------------------------------------------ */

/**
 * Compute the full rollup from a complete history. Used once per client the
 * first time the profile opens without a `trainerTally`, and by the tests.
 * Returns a plain object (no increments — this REPLACES the fields).
 */
export function rollupFromHistory(
  sessions: Array<{
    id?: string;
    status?: string;
    date?: string;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  }>,
  logs: Array<RollupLog & { sessionId?: string }>,
  trainers: Trainer[],
): {
  trainerTally: Record<string, number>;
  topTrainerId: string | null;
  topTrainerName: string | null;
  topTrainerSessions: number;
  machineStats: Record<string, ClientMachineStat>;
} {
  const completed = sessions.filter((s) => !s.status || s.status === "Completed");
  const trainerTally = tallyFromSessions(completed);
  const top = resolveTopTrainer(trainerTally, trainers);

  const bySession = new Map<string, RollupLog[]>();
  for (const l of logs) {
    if (!l.sessionId) continue;
    const list = bySession.get(l.sessionId) ?? [];
    list.push(l);
    bySession.set(l.sessionId, list);
  }
  const rolled = importedSessionsRollup(
    null,
    completed.map((s) => ({
      date: s.date,
      trainerId: s.trainerId,
      trainerInitials: s.trainerInitials,
      logs: s.id ? bySession.get(s.id) ?? [] : [],
    })),
    trainers,
    plainFieldOps,
  );
  const machineStats: Record<string, ClientMachineStat> = {};
  for (const [path, value] of Object.entries(rolled)) {
    const m = path.match(/^machineStats\.([^.]+)\.(\w+)$/);
    if (!m) continue;
    const entry = (machineStats[m[1]] ||= {});
    (entry as Record<string, unknown>)[m[2]] = value;
  }

  return {
    trainerTally,
    topTrainerId: top?.key ?? null,
    topTrainerName: top?.name ?? null,
    topTrainerSessions: top?.sessions ?? 0,
    machineStats,
  };
}
