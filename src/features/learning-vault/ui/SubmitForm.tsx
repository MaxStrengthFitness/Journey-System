import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { BODY_MAX, makeSubmission, PROPOSED_MAX, submissionProblems, type SubmissionDraft } from "../submissions";
import type { SubmissionIntent, VaultBlock, VaultTarget } from "../types";
import { useVault } from "./VaultProvider";
import { personOf, possessive, studioInSentence } from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * TELL HEAD OFFICE — a trainer disputes a line, or says what it is missing
 * (the Learning vault redesign, Oct 19 2026).
 *
 * Anyone may (AJ, Oct 16 2026, the Kaizen paragraph of DECISIONS "Sharing
 * between studios": "Questioning authority isnt bad ... Knowledge is power,
 * allow us to build it"). Nothing here changes Max Strength's words
 * ("Corporate owns the method, so corporate reads it before adopting it"):
 * it puts the question in front of the people who can, in head office's
 * Waiting for review, where they say Taken or Not taken. It pings nobody
 * ("Nothing pings anyone"): head office pulls it.
 *
 * It opens in place under the line (or under a page title, with no line),
 * registers what is typed, and once sent says so in place, so the trainer
 * sees it went before the form folds away.
 */
export function SubmitForm({
  target,
  block,
  onDone,
  onCancel,
}: {
  target: VaultTarget;
  /** The line it is about; absent for the page as a whole. */
  block?: VaultBlock;
  /** Sent, and the trainer tapped Done. */
  onDone: () => void;
  /** "Cancel", or a Leave that threw the words away. Defaults to onDone. */
  onCancel?: () => void;
}) {
  const vault = useVault();
  const hasStudio = vault.studio.id !== null;
  const studio = studioInSentence(vault.studio.name);
  const [intent, setIntent] = useState<SubmissionIntent>("dispute");
  const [body, setBody] = useState("");
  const [proposed, setProposed] = useState("");
  const [sent, setSent] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = onCancel ?? onDone;

  const dirty = !sent && (body.trim() !== "" || proposed.trim() !== "");
  const unsaved = useUnsavedChanges(dirty, "what you are sending to head office", {
    onDiscard: () => {
      setBody("");
      setProposed("");
      close();
    },
  });

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const draft: SubmissionDraft = proposed.trim() ? { intent, body, proposed } : { intent, body };
  const ready = submissionProblems(draft).length === 0;

  const send = () => {
    if (!ready || sent) return;
    const submission = makeSubmission(
      draft,
      {
        target,
        ...(block ? { block } : {}),
        studioId: vault.studio.id ?? "",
        studioName: hasStudio ? vault.studio.name : "",
        by: personOf(vault.viewer),
      },
      vault.newId("sub"),
      vault.now().toISOString(),
    );
    vault.store.submit(submission);
    unsaved.release();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="vta__form vta__sent" role="status">
        <p className="vta__sent-line">
          <Check size={16} aria-hidden />
          Sent to head office.
        </p>
        <p className="vta__hint">
          They read it beside {block ? "this line" : "this page"} and say whether the MSF original changes.
        </p>
        <div className="vta__form-actions">
          <button type="button" ref={doneRef} className="vta__btn" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="vta__form"
      aria-label="Tell head office"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="vta__choices" role="group" aria-label="What you are telling head office">
        {(
          [
            ["dispute", "Dispute this"],
            ["addition", "Add to it"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="vta__choice"
            aria-pressed={intent === value}
            onClick={() => setIntent(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="vta__field">
        <label className="vta__field-label" htmlFor={`${id}-body`}>
          {intent === "dispute" ? "What is wrong with it?" : "What should it add?"}
        </label>
        <textarea
          id={`${id}-body`}
          ref={bodyRef}
          className="vta__input vta__input--area"
          rows={3}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="vta__field">
        <label className="vta__field-label" htmlFor={`${id}-proposed`}>
          How would you word it? <span className="vta__optional">optional</span>
        </label>
        <textarea
          id={`${id}-proposed`}
          className="vta__input vta__input--area"
          rows={2}
          maxLength={PROPOSED_MAX}
          value={proposed}
          onChange={(e) => setProposed(e.target.value)}
        />
      </div>
      <p className="vta__hint">
        Head office reads it beside {block ? "this line" : "this page"}, with your name
        {hasStudio ? ` and ${possessive(studio)}` : ""}. Keep client names out.
      </p>
      <div className="vta__form-actions">
        <button type="submit" className="vta__btn vta__btn--primary" disabled={!ready}>
          Send to head office
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
