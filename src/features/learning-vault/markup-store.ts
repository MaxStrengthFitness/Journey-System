/**
 * THE SANDBOX STORE — where the prototypes keep markup and submissions.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes for
 * AJ's morning decision). Decision 1 of the round: "Prototypes only, on the
 * sandbox store. Nothing new reads or writes Firestore." The local `.env`
 * points at PRODUCTION, so a prototype that wrote a strike to Firestore would
 * change a real studio's record. Everything a reader does in the three
 * designs (cross out, put back, note, tell head office, decide) lands here,
 * in memory, and is gone when the page reloads.
 *
 * The shape is the one a real store would have, so wiring Firestore later is
 * a second implementation of `MarkupStore`, not a rewrite of the screens.
 *
 * HOW IT RE-RENDERS
 * -----------------
 * Every change replaces what changed with a NEW object (and a new array
 * around it) and leaves everything else the same object; `version()` goes up
 * by one and every listener is told. React reads it through
 * useSyncExternalStore (ui/VaultProvider.tsx), which compares snapshots by
 * identity: an unchanged page's markup is the same object, so it does not
 * re-render; a changed one is new, so it does. A call that changes nothing
 * (putting back a line that was never crossed out) tells nobody.
 *
 * One markup document per studio and page, as `StudioMarkup` says. A
 * document left with no strikes and no notes is dropped, so `markupFor`
 * answers null for it and head office's count never sees an empty one.
 */

import { hasMarks, withNote, withoutNote, withoutStrike, withStrike, type MarkupBase } from "./markup";
import type { LearningSubmission, StudioBlockNote, StudioMarkup, StudioStrike } from "./types";

export interface MarkupStore {
  markupFor(studioId: string, targetKey: string): StudioMarkup | null;
  allMarkup(): StudioMarkup[];
  submissions(): LearningSubmission[];
  strike(base: { studioId: string; studioName: string; targetKey: string; title: string }, strike: StudioStrike): void;
  unstrike(studioId: string, targetKey: string, blockKey: string): void;
  addNote(base: { studioId: string; studioName: string; targetKey: string; title: string }, note: StudioBlockNote): void;
  removeNote(studioId: string, targetKey: string, noteId: string): void;
  submit(s: LearningSubmission): void;
  decide(id: string, status: "taken" | "declined", decision: { note?: string; byName: string; at: string }): void;
  subscribe(listener: () => void): () => void;
  version(): number;
}

const docKey = (studioId: string, targetKey: string): string => `${studioId}\u0000${targetKey}`;

/**
 * A store in memory, optionally seeded (sample.ts's sampleSeed, or a test's
 * fixtures). Two documents in the seed for the same studio and page are
 * folded into one, the later strike or note winning on the same line or id.
 */
export function createSandboxStore(seed?: { markup?: StudioMarkup[]; submissions?: LearningSubmission[] }): MarkupStore {
  // ---- state: replaced, never mutated ----
  let markup: StudioMarkup[] = [];
  let byDoc = new Map<string, StudioMarkup>();
  let subs: LearningSubmission[] = [];
  let version = 0;
  const listeners = new Set<() => void>();

  const reindex = () => {
    byDoc = new Map(markup.map((m) => [docKey(m.studioId, m.targetKey), m]));
  };

  /** Put one document in place of its old self (or drop it when it holds nothing). */
  const put = (next: StudioMarkup) => {
    const key = docKey(next.studioId, next.targetKey);
    const had = byDoc.has(key);
    if (!hasMarks(next)) {
      markup = markup.filter((m) => docKey(m.studioId, m.targetKey) !== key);
    } else if (had) {
      markup = markup.map((m) => (docKey(m.studioId, m.targetKey) === key ? next : m));
    } else {
      markup = [...markup, next];
    }
    reindex();
  };

  const emit = () => {
    version += 1;
    // A copy: a listener that unsubscribes while being told must not skip the next one.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (err) {
        console.warn("[learning-vault] a markup listener threw; the others were still told", err);
      }
    }
  };

  // ---- the seed, folded through the same rules as a live change ----
  for (const m of seed?.markup ?? []) {
    if (!m || !m.studioId || !m.targetKey) continue;
    const base: MarkupBase = { studioId: m.studioId, studioName: m.studioName, targetKey: m.targetKey, title: m.title };
    let doc = byDoc.get(docKey(m.studioId, m.targetKey)) ?? null;
    for (const s of m.strikes ?? []) doc = withStrike(doc, base, s);
    for (const n of m.notes ?? []) doc = withNote(doc, base, n);
    if (doc) put(doc);
  }
  for (const s of seed?.submissions ?? []) {
    if (!s || !s.id) continue;
    subs = subs.some((x) => x.id === s.id) ? subs.map((x) => (x.id === s.id ? s : x)) : [...subs, s];
  }

  return {
    markupFor: (studioId, targetKey) => byDoc.get(docKey(studioId, targetKey)) ?? null,
    allMarkup: () => markup,
    submissions: () => subs,

    strike: (base, strike) => {
      put(withStrike(byDoc.get(docKey(base.studioId, base.targetKey)) ?? null, base, strike));
      emit();
    },
    unstrike: (studioId, targetKey, blockKey) => {
      const cur = byDoc.get(docKey(studioId, targetKey));
      if (!cur) return;
      const next = withoutStrike(cur, blockKey);
      if (next === cur) return;
      put(next);
      emit();
    },
    addNote: (base, note) => {
      put(withNote(byDoc.get(docKey(base.studioId, base.targetKey)) ?? null, base, note));
      emit();
    },
    removeNote: (studioId, targetKey, noteId) => {
      const cur = byDoc.get(docKey(studioId, targetKey));
      if (!cur) return;
      const next = withoutNote(cur, noteId);
      if (next === cur) return;
      put(next);
      emit();
    },

    submit: (s) => {
      subs = subs.some((x) => x.id === s.id) ? subs.map((x) => (x.id === s.id ? s : x)) : [...subs, s];
      emit();
    },
    decide: (id, status, decision) => {
      const cur = subs.find((s) => s.id === id);
      if (!cur) return;
      const d: NonNullable<LearningSubmission["decision"]> = { byName: decision.byName, at: decision.at };
      const note = (decision.note ?? "").trim();
      if (note) d.note = note;
      const next: LearningSubmission = { ...cur, status, decision: d };
      subs = subs.map((s) => (s.id === id ? next : s));
      emit();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}
