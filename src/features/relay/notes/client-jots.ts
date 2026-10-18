/**
 * YOUR OWN NOTES ABOUT ONE CLIENT — read, and a jot added, from wherever the
 * client is on screen: the record's working-notes strip (ClientJotStrip, Sep
 * 2026), and the briefing's "Just for me" (the briefing round, Oct 17 2026,
 * phase 4; AJ's handoff: "Personal notes show only to the trainer who wrote
 * them, in the briefing and everywhere else. They carry a privacy toggle:
 * 'this is just for me.'").
 *
 * Private by PATH: trainers/{uid}/notes, the trainer's own Relay notebook,
 * which the rules open to that Auth uid and nobody else, a studio owner and
 * an administrator included. So "just for me" needed no new place in the
 * database, no rules change and no index: a jot lands on the trainer's own
 * note about the client and shows in their Relay Journal too. One query,
 * filtered to the client (clientIds array-contains), no order clause, so no
 * index; sorted here.
 *
 * A FAILED READ IS NOT "NO NOTES" (client codex, phase 14): the strip adds
 * nothing on a read that hasn't answered, because a jot then would start a
 * second working-notes note beside one it could not see. `jotAbout` is the
 * one exception, on purpose: it runs at the briefing's Start, which never
 * waits and never refuses (CLAUDE.md, "Never block a save"), so it reads
 * once itself and, when it can't, starts a note rather than lose the words.
 */
import { useEffect, useState } from "react";
import { getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { appendNoteLog, newNoteId, notesRef, saveNote } from "./mutations";
import { blankDraft, logEntry, noteFromDoc } from "./notes";
import type { NoteLogEntry, TrainerNote } from "./types";

/** How many of a trainer's notes about one client are read: their working notes, and a few more. */
export const JOT_NOTES_LIMIT = 20;

export type JotRead = { notes: TrainerNote[]; state: "loading" | "ready" | "failed" };

const ms = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | Date | undefined;
  if (t instanceof Date) return t.getTime();
  return typeof (t as { toMillis?: () => number })?.toMillis === "function" ? (t as { toMillis: () => number }).toMillis() : 0;
};

/** The signed-in trainer's own notes about this client, live. */
export function useMyNotesAbout(uid: string | null, clientId: string | null): JotRead {
  // Keyed by who and which client, so the last client's answer never stands
  // for this one while its read is on the way.
  const key = uid && clientId ? `${uid}|${clientId}` : null;
  const [read, setRead] = useState<JotRead & { key: string | null }>({ key: null, notes: [], state: "loading" });
  useEffect(() => {
    if (!uid || !clientId) return;
    const k = `${uid}|${clientId}`;
    const unsub = onSnapshot(
      query(notesRef(uid), where("clientIds", "array-contains", clientId), limit(JOT_NOTES_LIMIT)),
      (snap) => {
        setRead({ key: k, notes: snap.docs.map((d) => noteFromDoc(d.id, d.data() as Record<string, unknown>)), state: "ready" });
      },
      (err) => {
        console.warn("[notes] own notes about a client could not be read:", err);
        setRead({ key: k, notes: [], state: "failed" });
      },
    );
    return unsub;
  }, [uid, clientId]);
  if (!key) return { notes: [], state: "ready" };
  return read.key === key ? { notes: read.notes, state: read.state } : { notes: [], state: "loading" };
}

/** Where a jot lands: the newest note about them that is not on the record. */
export function jotHome(notes: readonly TrainerNote[]): TrainerNote | null {
  const sorted = [...notes].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  return sorted.find((n) => !n.sharedWith) ?? sorted[0] ?? null;
}

/** The newest jots about this client across those notes. */
export function recentJots(
  notes: readonly TrainerNote[],
  clientId: string | null,
  n: number,
): { entry: NoteLogEntry; note: TrainerNote }[] {
  const all: { entry: NoteLogEntry; note: TrainerNote }[] = [];
  for (const note of notes) for (const entry of note.log) if (!entry.clientId || entry.clientId === clientId) all.push({ entry, note });
  return all.sort((a, b) => b.entry.at - a.entry.at).slice(0, n);
}

/**
 * Add a jot about a client to the trainer's own notes: on their working note
 * about them, else a new one, "{name} — working notes". With `notes` from a
 * read that answered, that read decides; without, it reads once.
 */
export async function jotAbout(input: {
  uid: string;
  clientId: string;
  /** The client's name as the note's title and link say it. */
  name: string;
  text: string;
  notes?: readonly TrainerNote[];
}): Promise<void> {
  const entry = logEntry(input.text, input.clientId);
  if (!entry) return;
  let notes = input.notes;
  if (!notes) {
    try {
      const snap = await getDocs(query(notesRef(input.uid), where("clientIds", "array-contains", input.clientId), limit(JOT_NOTES_LIMIT)));
      notes = snap.docs.map((d) => noteFromDoc(d.id, d.data() as Record<string, unknown>));
    } catch {
      // Couldn't tell: a new note rather than lose the words.
      notes = [];
    }
  }
  let noteId = jotHome(notes)?.id ?? null;
  if (!noteId) {
    noteId = newNoteId(input.uid);
    const draft = { ...blankDraft({ id: input.clientId, name: input.name }), title: `${input.name} — working notes` };
    await saveNote({ uid: input.uid, noteId, draft, before: null, author: { id: input.uid, name: "" } });
  }
  await appendNoteLog(input.uid, noteId, entry);
}
