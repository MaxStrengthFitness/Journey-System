/**
 * A LINKED WORD — a span with the button role, drawn as words (review fix,
 * Oct 19 2026; LinkedText's header says why it is not a <button>).
 *
 * Shared by LinkedText (a word in a passage) and the concept card (a word
 * in a card's summary), so both wrap like prose and both are real controls.
 */

import type { KeyboardEvent, ReactNode } from "react";
import "../../wiki/wiki.css";
import "./concept.css";

/**
 * A word that opens something, drawn as words: a span with the button role,
 * focusable, pressed by a tap, Enter or Space. Its press never reaches the
 * line around it.
 */
export function TermButton({
  onPress,
  children,
  popup = false,
}: {
  onPress: (el: HTMLElement) => void;
  children: ReactNode;
  /** It opens a card (a dialog). */
  popup?: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    // Enter and Space are the word's own press, not the line's (and Space
    // never scrolls the page under it).
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) onPress(e.currentTarget);
    }
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className="vtc__term"
      data-vault-term=""
      aria-haspopup={popup ? "dialog" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onPress(e.currentTarget);
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </span>
  );
}
