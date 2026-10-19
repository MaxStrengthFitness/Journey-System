/**
 * HEAD OFFICE'S LIST — the questions the Academy can't answer, and answers a
 * trainer says are wrong (Ask the Academy, phase 3, Oct 19 2026).
 *
 * AJ's picks on the plan page: 1a, a question the Academy can't answer goes
 * to the list on its own ("Sent to head office's list."); 2a, "This answer is
 * wrong" asks why in a box that may stay empty; 3a, an administrator marks an
 * entry Needs an Academy page, Studio's call, or Done. And from the first
 * plan (3a, Oct 16): the question, the studio and the day, never who asked.
 *
 * One document per ask in `academy_questions` (AJ's 3a was the OK for this
 * new collection). The rules let anyone who works at the studio add one in
 * exactly this shape, and only administrators read, mark or delete
 * (firestore.rules; tests/firestore.rules.test.ts). Head office's page groups
 * the same question asked again into one row (`groupQuestions`), so nothing
 * needs a counter or a read before a write.
 *
 * The writes never block: the trainer's screen says it's sent and moves on,
 * and a refusal changes the line, as every floor write does.
 */
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where, writeBatch, doc, getCountFromServer } from "firebase/firestore";
import { db } from "../../firebase";
import { studioTodayKey } from "../../lib/studio-time";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";
import type { AskResult } from "./ask";
import { wordsOf } from "./find-quote";

export const HEAD_OFFICE_COLLECTION = "academy_questions";

export type HeadOfficeReason = "not_covered" | "conflicting" | "flagged";
/** "open" until an administrator marks it (AJ's 3a). */
export type HeadOfficeMark = "open" | "page" | "studio" | "done";

export const MARK_LABEL: Record<Exclude<HeadOfficeMark, "open">, string> = {
  page: "Needs an Academy page",
  studio: "Studio's call",
  done: "Done",
};

/** The limits the rules hold, in characters. */
export const LIMITS = { question: 300, why: 500, answer: 8000 } as const;

export interface HeadOfficeEntry {
  question: string;
  reason: HeadOfficeReason;
  studioId: string;
  /** The studio's day, YYYY-MM-DD. */
  day: string;
  mark: HeadOfficeMark;
  /** Flagged only: the trainer's reason, when they gave one. */
  why?: string;
  /** Flagged only: the answer exactly as the trainer saw it, as text. */
  answer?: string;
}

/** An answer as the trainer saw it, as plain text for head office to judge. */
export function answerAsText(result: AskResult): string {
  if (result.kind !== "answered") return "";
  return result.points
    .map((p) => [p.says, ...p.quotes.map((q) => `“${q.text}” (${q.page})`)].join("\n"))
    .join("\n\n")
    .slice(0, LIMITS.answer);
}

/** The document a trainer's ask adds: exactly the rules' shape, no undefined, never who. */
export function entryFor(
  question: string,
  reason: HeadOfficeReason,
  studioId: string,
  flagged?: { result: AskResult; why: string },
  now: Date = new Date(),
): HeadOfficeEntry {
  const entry: HeadOfficeEntry = {
    question: question.replace(/\s+/g, " ").trim().slice(0, LIMITS.question),
    reason,
    studioId,
    day: studioTodayKey(now),
    mark: "open",
  };
  if (reason === "flagged" && flagged) {
    const why = flagged.why.trim().slice(0, LIMITS.why);
    if (why) entry.why = why;
    const answer = answerAsText(flagged.result);
    if (answer) entry.answer = answer;
  }
  return entry;
}

/** Demo Mode is practice: its questions never reach head office. */
export function reachesHeadOffice(studioId: string | null | undefined): studioId is string {
  return Boolean(studioId) && studioId !== DEMO_STUDIO_ID;
}

/** Adds one entry. Resolves false when it was refused; never throws. Don't await it on a tap. */
export async function sendToHeadOffice(entry: HeadOfficeEntry): Promise<boolean> {
  try {
    await addDoc(collection(db, HEAD_OFFICE_COLLECTION), { ...entry, at: serverTimestamp() });
    return true;
  } catch {
    return false;
  }
}

/* ── head office's side ─────────────────────────────────────────── */

export interface StoredEntry extends HeadOfficeEntry {
  id: string;
  /** Milliseconds; 0 when the server time hasn't landed. */
  at: number;
}

/** One row on head office's page: the same question asked again is one row; a flagged answer stands alone. */
export interface QuestionGroup {
  key: string;
  question: string;
  reason: HeadOfficeReason;
  ids: string[];
  studioIds: string[];
  lastDay: string;
  /** Flagged only. */
  why?: string;
  answer?: string;
}

export function groupQuestions(entries: readonly StoredEntry[]): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>();
  for (const e of [...entries].sort((a, b) => b.at - a.at)) {
    const key = e.reason === "flagged" ? `flagged:${e.id}` : `q:${wordsOf(e.question)}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(e.id);
      if (!g.studioIds.includes(e.studioId)) g.studioIds.push(e.studioId);
      if (e.reason === "conflicting") g.reason = "conflicting";
      continue;
    }
    groups.set(key, {
      key,
      question: e.question,
      reason: e.reason,
      ids: [e.id],
      studioIds: [e.studioId],
      lastDay: e.day,
      ...(e.why ? { why: e.why } : {}),
      ...(e.answer ? { answer: e.answer } : {}),
    });
  }
  return [...groups.values()];
}

/** How many of each mark head office reads at once: the newest. */
export const READ_LIMIT = 300;

function stored(id: string, data: Record<string, unknown>): StoredEntry {
  const at = data.at as { toMillis?: () => number } | null;
  return {
    id,
    question: String(data.question ?? ""),
    reason: (data.reason as HeadOfficeReason) ?? "not_covered",
    studioId: String(data.studioId ?? ""),
    day: String(data.day ?? ""),
    mark: (data.mark as HeadOfficeMark) ?? "open",
    ...(typeof data.why === "string" ? { why: data.why } : {}),
    ...(typeof data.answer === "string" ? { answer: data.answer } : {}),
    at: typeof at?.toMillis === "function" ? at.toMillis() : 0,
  };
}

/** The entries with one mark, newest first (the (mark, at) index). Throws when the read fails: unknown, never empty. */
export async function readEntries(mark: HeadOfficeMark): Promise<StoredEntry[]> {
  const snap = await getDocs(
    query(collection(db, HEAD_OFFICE_COLLECTION), where("mark", "==", mark), orderBy("at", "desc"), limit(READ_LIMIT)),
  );
  return snap.docs.map((d) => stored(d.id, d.data()));
}

/** How many wait unmarked, for the sidebar and Home. Throws when the read fails. */
export async function countOpen(): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, HEAD_OFFICE_COLLECTION), where("mark", "==", "open"), orderBy("at", "desc")),
  );
  return snap.data().count;
}

/** Marks every entry in a row at once. */
export async function markEntries(ids: readonly string[], mark: Exclude<HeadOfficeMark, "open">): Promise<void> {
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(db, HEAD_OFFICE_COLLECTION, id), { mark });
  await batch.commit();
}
