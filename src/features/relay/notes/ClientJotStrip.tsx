import { useMemo, useState } from "react";
import { NotebookPen, Send } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client } from "../../../types";
import { clientFirstName } from "../../../lib/client-name";
import type { Pronouns } from "../../client-codex/kit/pronouns";
import { requestPlanner } from "../intent";
import { jotAbout, jotHome, recentJots, useMyNotesAbout } from "./client-jots";
import { logEntry, whenLabel } from "./notes";
import "./notes.css";

/**
 * YOUR WORKING NOTES, ON THE CLIENT'S RECORD — jot from where it occurred.
 *
 * Round: Relay, Sep 2026. The one addition outside Relay. A trainer reading
 * a client's record sees a private strip — the last few working-note jots
 * they wrote about this client, and a box to add one — without opening the
 * Planner. The jot lands on the newest of their own notes about this client
 * (one not on the record, preferring the working-notes one), or starts one.
 *
 * Private by path: trainers/{uid}/notes, read with one query filtered to
 * this client (clientIds array-contains), no order clause, so it needs no
 * index; sorted here. Only ever the signed-in trainer's own notes. The read,
 * the home note and the jot itself are client-jots.ts, which the briefing's
 * "Just for me" shares (the briefing round, Oct 17 2026).
 *
 * A FAILED READ IS NOT "NO NOTES" (client codex, Sep 2026, phase 14). The
 * read used to settle as `ready` with an empty list when it failed, and a jot
 * then STARTED a brand-new "working notes" note — a duplicate of the one the
 * trainer already had, which the read simply could not see. Now a failed
 * read says so, and the box and Add stay off, so nothing can be written on a
 * guess. A listener that failed does not come back while the profile stays
 * open, so the words send the trainer to reopen it rather than promise the
 * notes will load. On Goals & Focus the strip sits inside the Plans from the team
 * panel, on the codex's scale; `pronouns` word it the way the page does.
 */
const SHOWN = 3;

export function ClientJotStrip({
  client,
  onOpenPlanner,
  pronouns,
}: {
  client: Client;
  onOpenPlanner?: () => void;
  /** How the strip refers to the client (the codex's pronouns). Left out: the first name. */
  pronouns?: Pick<Pronouns, "object">;
}) {
  const uid = auth.currentUser?.uid ?? null;
  const clientId = client.id ?? null;
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "this client";
  const first = clientFirstName(client) || name;
  const them = pronouns?.object ?? first;
  const { notes, state } = useMyNotesAbout(uid, clientId);
  const ready = state === "ready";
  const failed = state === "failed";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where a jot lands: the newest note about them that is not on the record.
  const home = useMemo(() => jotHome(notes), [notes]);
  const recent = useMemo(() => recentJots(notes, clientId, SHOWN), [notes, clientId]);

  const add = async () => {
    // Only on a read that answered: a failed or pending read cannot tell
    // "no note yet" from "a note it could not see".
    if (!uid || !clientId || !ready) return;
    if (!logEntry(text, clientId)) return;
    setBusy(true);
    setError(null);
    try {
      await jotAbout({ uid, clientId, name, text, notes });
      setText("");
    } catch (err) {
      console.warn("[notes] jot from the record failed:", err);
      setError("Couldn't save that jot. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (!uid || !clientId) return null;

  return (
    <div className="jot" data-testid="jot-strip" data-state={state}>
      <div className="jot__head">
        <span className="jot__title">
          <NotebookPen size={14} aria-hidden="true" /> Your working notes · only you
        </span>
        {failed ? (
          <span className="jot__error" role="status">
            Couldn't load your working notes, so a jot can't be added here now. Reopen the profile to try again.
          </span>
        ) : ready ? (
          <span className="jot__sub">{home ? `Filed on “${home.title}”.` : `A note about ${them} starts when you jot.`}</span>
        ) : null}
      </div>
      {recent.length > 0 && (
        <ul className="jot__list">
          {recent.map(({ entry, note }) => (
            <li key={entry.id} className="jot__item">
              <span className="jot__when">{whenLabel(new Date(entry.at))}</span>
              <span className="jot__text">{entry.text}</span>
              {onOpenPlanner && (
                <button
                  type="button"
                  className="jot__open"
                  onClick={() => {
                    requestPlanner({ kind: "open-note", noteId: note.id });
                    onOpenPlanner();
                  }}
                >
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="jot__box">
        <textarea
          className="jot__input"
          rows={2}
          value={text}
          aria-label="A working note, only for you"
          placeholder={
            failed ? "Your working notes couldn't be loaded." : ready ? `What did you notice about ${them} today?` : "Loading your notes…"
          }
          disabled={!ready || busy}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void add();
          }}
        />
        <button type="button" className="jot__add" disabled={!ready || busy || !text.trim()} onClick={() => void add()} aria-label="Add the jot">
          <Send size={14} aria-hidden="true" /> Add
        </button>
      </div>
      {error && <p className="jot__error">{error}</p>}
    </div>
  );
}
