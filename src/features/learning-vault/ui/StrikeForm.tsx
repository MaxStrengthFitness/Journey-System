import { useEffect, useId, useRef, useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { MAX_REMOVAL_REASON, reasonIsEnough } from "../../../lib/machine-template";
import { makeStrike, REPLACEMENT_MAX } from "../markup";
import type { VaultBlock, VaultTarget } from "../types";
import { useVault } from "./VaultProvider";
import { personOf, possessive, studioInSentence } from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * CROSS OUT FOR {STUDIO}… — the question a leader answers before a line
 * comes off the studio's version (the Learning vault redesign, Oct 19 2026).
 *
 * The same manner as taking a safety line off a unit
 * (admin/machines/editor/safety-removal.tsx, InheritedSafety): it asks WHY
 * first, in place under the line, and "Cross it out" stays disabled until
 * the reason is enough (reasonIsEnough: 3 to 300 characters, the rule the
 * write gate holds for a safety line). What the studio does instead is
 * optional. "Keep it" closes the question and leaves the line as it was.
 *
 * Only the studio's version changes: the line stays on the page, struck, with
 * the reason, who and when ("the baseline is always still there"), and the
 * MSF original is one tap away. Head office reads the reason when it sees
 * how many studios crossed out the same line.
 */
export function StrikeForm({
  target,
  block,
  onDone,
  onCancel,
}: {
  target: VaultTarget;
  block: VaultBlock;
  /** The line is crossed out. */
  onDone: () => void;
  /** "Keep it", or a Leave that threw the reason away. Defaults to onDone. */
  onCancel?: () => void;
}) {
  const vault = useVault();
  const studio = studioInSentence(vault.studio.name);
  const [reason, setReason] = useState("");
  const [instead, setInstead] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const close = onCancel ?? onDone;

  const dirty = reason.trim() !== "" || instead.trim() !== "";
  const unsaved = useUnsavedChanges(dirty, "the line you are crossing out", {
    onDiscard: () => {
      setReason("");
      setInstead("");
      close();
    },
  });

  // The question is the next thing to answer, so the reason box takes the
  // focus as it opens (the keyboard comes up on an iPad).
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  const ready = vault.studio.id !== null && reasonIsEnough(reason) && instead.trim().length <= REPLACEMENT_MAX;

  const crossOut = () => {
    const studioId = vault.studio.id;
    if (!ready || studioId === null) return;
    const replacement = instead.trim();
    const strike = makeStrike(
      block,
      replacement ? { reason: reason.trim(), replacement } : { reason: reason.trim() },
      personOf(vault.viewer),
      vault.now().toISOString(),
    );
    vault.store.strike({ studioId, studioName: vault.studio.name, targetKey: target.key, title: target.title }, strike);
    unsaved.release();
    onDone();
  };

  return (
    <form
      className="vta__form"
      aria-label={`Cross this line out for ${studio}`}
      onSubmit={(e) => {
        e.preventDefault();
        crossOut();
      }}
    >
      <div className="vta__field">
        <label className="vta__field-label" htmlFor={`${id}-why`}>
          Why does {studio} cross this out?
        </label>
        <textarea
          id={`${id}-why`}
          ref={reasonRef}
          className="vta__input vta__input--area"
          rows={2}
          maxLength={MAX_REMOVAL_REASON}
          value={reason}
          placeholder="What is different here, in a sentence."
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="vta__field">
        <label className="vta__field-label" htmlFor={`${id}-instead`}>
          What {studio} does instead <span className="vta__optional">optional</span>
        </label>
        <textarea
          id={`${id}-instead`}
          className="vta__input vta__input--area"
          rows={2}
          maxLength={REPLACEMENT_MAX}
          value={instead}
          onChange={(e) => setInstead(e.target.value)}
        />
      </div>
      <p className="vta__hint">
        Only {possessive(studio)} version changes. The MSF original stays one tap away, and head office sees the
        reason, your name and the date.
      </p>
      <div className="vta__form-actions">
        <button type="submit" className="vta__btn vta__btn--danger" disabled={!ready}>
          Cross it out
        </button>
        <button
          type="button"
          className="vta__btn vta__btn--quiet"
          onClick={() => {
            unsaved.release();
            close();
          }}
        >
          Keep it
        </button>
      </div>
    </form>
  );
}
