/**
 * TELLING HEAD OFFICE — disputes, additions, and the crossed-out-line count.
 *
 * Round: the Learning vault redesign, Oct 19 2026. Two ways a page's words
 * travel up to head office, both pulled by head office, never pushed at
 * anyone ("Nothing pings anyone"; "In-app only, for now"):
 *
 *   1. A trainer says a line is wrong, or something is missing (a
 *      LearningSubmission: "dispute" or "addition"). Anyone may (AJ, Oct 16
 *      2026, the Kaizen paragraph of DECISIONS "Sharing between studios":
 *      "Questioning authority isnt bad ... Knowledge is power, allow us to
 *      build it"). Head office reads them grouped by page and says Taken or
 *      Not taken, with an optional note back.
 *   2. Studios cross out the same line on their own versions. Head office
 *      sees HOW MANY studios did, as a count with its proof one tap away
 *      (each studio's reason): a count is not a score ("Sentences, not
 *      scores"). Studios are listed by name, never ranked. Demo Mode is a
 *      practice studio and never reaches head office (the realm rule,
 *      machine-db's refuseDemoOffer / offerFrom).
 *
 * "Corporate owns the method, so corporate reads it before adopting it":
 * nothing here changes Max Strength's words. It only puts the question in
 * front of the people who can.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { clipText } from "../../lib/clip-text";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { QUOTE_MAX } from "./markup";
import type {
  LearningSubmission,
  StrikeSignal,
  StudioMarkup,
  SubmissionIntent,
  VaultBlock,
  VaultPerson,
  VaultTarget,
  VaultTargetRef,
} from "./types";

/** The fewest characters that say anything ("Typo"). */
export const BODY_MIN = 3;
export const BODY_MAX = 1000;
/** The longest proposed wording. */
export const PROPOSED_MAX = 600;

export interface SubmissionDraft {
  intent: SubmissionIntent;
  body: string;
  proposed?: string;
}

/** What stops a submission being sent, in words a trainer can act on. Empty when it can go. */
export function submissionProblems(d: SubmissionDraft): string[] {
  const out: string[] = [];
  const body = (d.body ?? "").trim();
  if (body.length < BODY_MIN) {
    out.push(d.intent === "dispute" ? "Say what is wrong with it, in a few words." : "Say what to add, in a few words.");
  } else if (body.length > BODY_MAX) {
    out.push(`Keep it to ${BODY_MAX.toLocaleString("en-US")} characters.`);
  }
  if ((d.proposed ?? "").trim().length > PROPOSED_MAX) {
    out.push(`Keep the wording to ${PROPOSED_MAX} characters.`);
  }
  return out;
}

/**
 * A submission as head office will read it: the page, the line (when it is
 * about one) quoted as it reads now, the words, the proposed wording, the
 * studio and the person. Always "pending" when made. No undefined fields.
 */
export function makeSubmission(
  d: SubmissionDraft,
  ctx: { target: VaultTarget; block?: VaultBlock; studioId: string; studioName: string; by: VaultPerson },
  id: string,
  nowIso: string,
): LearningSubmission {
  const out: LearningSubmission = {
    id,
    intent: d.intent,
    ref: ctx.target.ref,
    targetKey: ctx.target.key,
    targetTitle: ctx.target.title,
    body: clipText((d.body ?? "").trim(), BODY_MAX),
    studioId: ctx.studioId,
    studioName: ctx.studioName,
    by: { uid: ctx.by.uid, name: (ctx.by.name ?? "").trim() },
    at: nowIso,
    status: "pending",
  };
  if (ctx.block) {
    out.blockKey = ctx.block.key;
    out.quote = clipText(ctx.block.text, QUOTE_MAX);
  }
  const proposed = clipText((d.proposed ?? "").trim(), PROPOSED_MAX);
  if (proposed) out.proposed = proposed;
  return out;
}

export interface QueueGroup {
  targetKey: string;
  targetTitle: string;
  ref: VaultTargetRef;
  items: LearningSubmission[];
}

const newestFirst = (a: { at: string }, b: { at: string }): number => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/**
 * Head office's queue, one group per page. A page with something still
 * waiting comes before a page whose submissions are all decided; then the
 * page with the newest submission first. Inside a group, newest first. The
 * group's title and ref are its newest submission's (a page can be renamed).
 */
export function queueGroups(subs: LearningSubmission[]): QueueGroup[] {
  const byPage = new Map<string, LearningSubmission[]>();
  for (const s of subs ?? []) {
    if (!s || !s.targetKey) continue;
    byPage.set(s.targetKey, [...(byPage.get(s.targetKey) ?? []), s]);
  }
  const groups: QueueGroup[] = [...byPage.entries()].map(([targetKey, items]) => {
    const sorted = [...items].sort(newestFirst);
    return { targetKey, targetTitle: sorted[0].targetTitle, ref: sorted[0].ref, items: sorted };
  });
  const waiting = (g: QueueGroup) => g.items.some((s) => s.status === "pending");
  return groups.sort((a, b) => {
    const w = Number(waiting(b)) - Number(waiting(a));
    if (w !== 0) return w;
    const t = newestFirst(a.items[0], b.items[0]);
    if (t !== 0) return t;
    return a.targetTitle.localeCompare(b.targetTitle);
  });
}

const byName = (a: { studioName: string }, b: { studioName: string }): number =>
  a.studioName.localeCompare(b.studioName, "en", { sensitivity: "base" });

/**
 * Every crossed-out line across every studio's markup, a line crossed out at
 * one studio included ("Crossed out at 1 studio"): one signal per page and
 * line, the studios listed by name, each with its own reason, so the same
 * line crossed out at several studios is one signal with a count. The line
 * with the most studios first; then the most
 * recently crossed out; then by page and words (so the order never jumps).
 * A studio counts once per line. Demo Mode is left out.
 */
export function strikeSignals(all: StudioMarkup[]): StrikeSignal[] {
  const found = new Map<string, { signal: StrikeSignal; latest: string }>();
  for (const m of all ?? []) {
    if (!m || isDemoStudioId(m.studioId)) continue;
    for (const s of m.strikes ?? []) {
      if (!s || !s.blockKey) continue;
      const key = `${m.targetKey}\u0000${s.blockKey}`;
      let entry = found.get(key);
      if (!entry) {
        entry = {
          signal: { targetKey: m.targetKey, targetTitle: m.title, blockKey: s.blockKey, quote: s.originalText, studios: [] },
          latest: "",
        };
        found.set(key, entry);
      }
      if (entry.signal.studios.some((x) => x.studioId === m.studioId)) continue;
      const studio: StrikeSignal["studios"][number] = {
        studioId: m.studioId,
        studioName: m.studioName,
        reason: s.reason,
        at: s.at,
      };
      if (s.replacement) studio.replacement = s.replacement;
      entry.signal.studios.push(studio);
      if (s.at >= entry.latest) {
        // The newest strike's words and title stand for the line.
        entry.latest = s.at;
        entry.signal.quote = s.originalText;
        entry.signal.targetTitle = m.title || entry.signal.targetTitle;
      }
    }
  }
  return [...found.values()]
    .map(({ signal, latest }) => ({ signal: { ...signal, studios: [...signal.studios].sort(byName) }, latest }))
    .sort((a, b) => {
      const n = b.signal.studios.length - a.signal.studios.length;
      if (n !== 0) return n;
      if (a.latest !== b.latest) return a.latest < b.latest ? 1 : -1;
      return (
        a.signal.targetTitle.localeCompare(b.signal.targetTitle) || a.signal.quote.localeCompare(b.signal.quote)
      );
    })
    .map((x) => x.signal);
}

/**
 * "Crossed out at 3 studios", or with the number of studios there are,
 * "Crossed out at 3 of 70 studios". One studio is "1 studio".
 */
export function signalSentence(s: StrikeSignal, totalStudios?: number): string {
  const n = s.studios.length;
  if (typeof totalStudios === "number" && Number.isFinite(totalStudios) && totalStudios >= n && totalStudios > 0) {
    return `Crossed out at ${n} of ${totalStudios} ${totalStudios === 1 ? "studio" : "studios"}`;
  }
  return `Crossed out at ${n} ${n === 1 ? "studio" : "studios"}`;
}
