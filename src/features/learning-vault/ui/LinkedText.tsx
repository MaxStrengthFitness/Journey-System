/**
 * LINKED TEXT — one passage, with every named thing in it a word you can tap.
 *
 * Round: the Learning vault redesign, Oct 19 2026. The vault's answer to
 * wiki/glossary-links: the same four rules (whole words, four letters or more,
 * longest first, first appearance and six a passage), over every kind of
 * thing the vault knows, not the glossary alone (entities.ts).
 *
 * Inside a ConceptLayer with an index, a linked word is a button that opens
 * its card beside it. Without one (the index still loading, a harness, a
 * design that does not link), the passage is plain words: the same text,
 * nothing missing, nothing waiting.
 *
 * A tap on a linked word is the word's, not the line's: ArticleBlocks selects
 * a line on a click, so the word stops its click there (and carries
 * data-vault-term, which ArticleBlocks also reads as "not a tap on the line").
 */

import { Fragment, useMemo } from "react";
import { linkText } from "../entities";
import { useConcepts } from "./ConceptLayer";
import "../../wiki/wiki.css";
import "./concept.css";

export function LinkedText(props: { text: string; skip?: string; maxLinks?: number }) {
  const { text, skip, maxLinks } = props;
  const concepts = useConcepts();
  const index = concepts?.index ?? null;
  // Linked once per passage and index, never per render (a 250-word
  // alternation run on every render of a long topic is jank on an iPad).
  const segments = useMemo(
    () => (index ? linkText(text ?? "", index, { skip, maxLinks }) : null),
    [text, index, skip, maxLinks],
  );

  if (!concepts || !segments) return <>{text}</>;

  return (
    <>
      {segments.map((s, i) => {
        const id = s.entityId;
        if (!id) return <Fragment key={`t-${i}`}>{s.text}</Fragment>;
        return (
          <button
            key={`${id}-${i}`}
            type="button"
            className="vtc__term"
            data-vault-term=""
            aria-haspopup="dialog"
            onClick={(e) => {
              e.stopPropagation();
              concepts.open(id, e.currentTarget);
            }}
            onKeyDown={(e) => {
              // Enter and Space are the word's own press, not the line's.
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
          >
            {s.text}
          </button>
        );
      })}
    </>
  );
}
