import { useEffect, useId, useRef, useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { makeNote, NOTE_MAX, noteProblems } from "../markup";
import type { VaultBlock, VaultTarget } from "../types";
import { useVault } from "./VaultProvider";
import { personOf, studioInSentence } from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * NOTE FOR {STUDIO} — a note on one line of the studio's version (the
 * Learning vault redesign, Oct 19 2026).
 *
 * Anyone who works at the studio writes one (writesForStudioPerRules, the
 * same people who comment on a page). It sits under the line it is about,
 * with the author and the date, and only the studio's version shows it:
 * the MSF original carries no markup. It opens in place under the line,
 * never as a dialog, and registers what is typed, so a door that would take
 * the page away asks first.
 */
export function NoteForm({
  target,
  block,
  onDone,
  onCancel,
}: {
  target: VaultTarget;
  block: VaultBlock;
  /** The note is on the line. */
  onDone: () => void;
  /** "Cancel", or a Leave that threw the note away. Defaults to onDone. */
  onCancel?: () => void;
}) {
  const vault = useVault();
  const studio = studioInSentence(vault.studio.name);
  const [body, setBody] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const close = onCancel ?? onDone;

  const unsaved = useUnsavedChanges(body.trim() !== "", "the note you are writing", {
    onDiscard: () => {
      setBody("");
      close();
    },
  });

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  // Only on the studio's own version, by someone who works there (see StrikeForm).
  const ready = vault.lens === "studio" && vault.viewer.canNote && vault.studio.id !== null && noteProblems(body).length === 0;

  const add = () => {
    const studioId = vault.studio.id;
    if (!ready || studioId === null) return;
    const note = makeNote(block, body, personOf(vault.viewer), vault.now().toISOString(), vault.newId("note"));
    vault.store.addNote({ studioId, studioName: vault.studio.name, targetKey: target.key, title: target.title }, note);
    unsaved.release();
    onDone();
  };

  return (
    <form
      className="vta__form"
      aria-label={`Note for ${studio}`}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="vta__field">
        <label className="vta__field-label" htmlFor={`${id}-note`}>
          What should {studio} know about this line?
        </label>
        <textarea
          id={`${id}-note`}
          ref={fieldRef}
          className="vta__input vta__input--area"
          rows={3}
          maxLength={NOTE_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <p className="vta__hint">Everyone at {studio} sees it under this line, with your name. Keep client names out.</p>
      <div className="vta__form-actions">
        <button type="submit" className="vta__btn vta__btn--primary" disabled={!ready}>
          Add note
        </button>
        <button
          type="button"
          className="vta__btn vta__btn--quiet"
          onClick={() => {
            unsaved.release();
            close();
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
