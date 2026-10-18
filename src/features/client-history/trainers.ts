import type { Trainer } from "../../types";
import { toTrainerRef } from "../calendar/selectors";
import type { TrainerRef } from "../calendar/types";
import type { HistorySession } from "./model";

/**
 * Who coached a session, as the Calendar tab would draw them (same initials,
 * same hashed colour).
 *
 * By trainer id first (the document id, or an older account's sign-in uid).
 * A session that carries an id the list doesn't hold is a trainer from
 * another studio (the trainer lock, Oct 18 2026: the list is the signed-in
 * person's studios, not the company), so it gets null and the stored name or
 * initials, never a guess by initials: the one "SR" on this list is not the
 * one who coached. By initials only for a session with no id at all (an
 * import), and only when those initials belong to exactly ONE trainer on the
 * list — two "AR"s are never merged into one person.
 */
export function trainerLookup(trainers: Trainer[]): (s: HistorySession) => TrainerRef | null {
  const byId = new Map<string, TrainerRef>();
  const byUid = new Map<string, TrainerRef>();
  const byInitials = new Map<string, TrainerRef | null>();
  for (const t of trainers) {
    if (!t.id) continue;
    const ref = toTrainerRef(t);
    byId.set(t.id, ref);
    if (t.authUid) byUid.set(t.authUid, ref);
    const key = (t.initials || ref.initials).toUpperCase();
    byInitials.set(key, byInitials.has(key) ? null : ref);
  }
  return (s) => {
    const id = (s.trainerId || "").trim();
    if (id) return byId.get(id) ?? byUid.get(id) ?? null;
    return s.trainerInitials ? (byInitials.get(s.trainerInitials.toUpperCase()) ?? null) : null;
  };
}
