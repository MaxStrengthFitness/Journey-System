/**
 * THE NOTE BOX — where a note goes and what it is for, said before it is
 * saved (the Wrap-up round, AJ, Oct 18 2026: "we need to allow it to be
 * easily made for a note for next time or just a note to the profile and
 * where its going to be filed to"; his "n1 a n2 a n3 a").
 *
 * Three things a trainer sees as soon as the box opens, never only once
 * something is typed:
 *   - GOES TO: the one Loudness control, saying where (Profile only · Next
 *     time · Critical; N1 a), and Just for me beside it (the trainer's own
 *     notebook, the briefing round's phase 4).
 *   - WHAT IT'S FOR: the five filing categories. Picking Health, Incident or
 *     Retention moves the note to Next time, the same default every other
 *     box starts from (`DEFAULT_IMPORTANCE`), unless the trainer has already
 *     picked where it goes.
 *   - ONE LINE saying where it lands: "Robbin's profile → Notes → Health ·
 *     read out on the next 4 briefings · leaders see it on Operations →
 *     Today".
 * Nothing is required: a note with no category files unfiled and waits in To
 * file on the client's Notes.
 *
 * PURE — no React, no Firestore.
 */
import type { JournalImportance } from "../../types/journal";
import { HEADS_UP_SESSIONS } from "./heads-up";
import { DEFAULT_IMPORTANCE, isForLeaders, NOTE_CATEGORY_META, type FilingCategory } from "./note-catalog";

/** What the box holds. */
export interface NoteBoxValue {
  text: string;
  /** Where it goes: the Loudness it files at. */
  importance: JournalImportance;
  /** The trainer's own notebook instead: not filed on the client's record. */
  justForMe: boolean;
  category: FilingCategory | null;
  /** The trainer picked where it goes; a category no longer moves it. */
  picked: boolean;
}

/** An empty box going where `importance` says. */
export function emptyNoteBox(importance: JournalImportance): NoteBoxValue {
  return { text: "", importance, justForMe: false, category: null, picked: false };
}

/**
 * A category picked (or taken back): the note follows the category's default
 * loudness until the trainer has picked where it goes themselves. Taking a
 * category back leaves where it goes as it is.
 */
export function withCategory(v: NoteBoxValue, category: FilingCategory | null): NoteBoxValue {
  if (!category || v.picked) return { ...v, category };
  return { ...v, category, importance: DEFAULT_IMPORTANCE[category] };
}

/** Where it goes, picked by the trainer: kept from then on. */
export function withImportance(v: NoteBoxValue, importance: JournalImportance): NoteBoxValue {
  return { ...v, importance, picked: true };
}

/** The one line under the box: where the note will land, in plain words. */
export function whereItLands(v: Pick<NoteBoxValue, "importance" | "justForMe" | "category">, firstName: string): string {
  const name = firstName.trim();
  const who = name ? `${name}'s` : "The client's";
  if (v.justForMe) return `Your own notebook. Nobody else sees it, and it isn't filed on ${name ? `${name}'s` : "the client's"} record.`;
  const place = v.category ? `${who} profile → Notes → ${NOTE_CATEGORY_META[v.category].label}` : `${who} profile → Notes → To file`;
  const when =
    v.importance === "elevated"
      ? `read out on the next ${HEADS_UP_SESSIONS} briefings`
      : v.importance === "critical"
        ? "first on every briefing until someone closes it, and a red triangle on the Hub card"
        : "stays on the profile, not on the briefing";
  const leaders = v.category && isForLeaders(v.category) ? " · leaders see it on Operations → Today" : "";
  return `${place} · ${when}${leaders}`;
}
