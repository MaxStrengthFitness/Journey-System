/**
 * LINKED TEXT — one passage, with every named thing in it a word you can tap.
 *
 * Round: the Learning vault redesign, Oct 19 2026. The vault's answer to
 * wiki/glossary-links: the same four rules (whole words, four letters or more,
 * longest first, first appearance and six a passage), over every kind of
 * thing the vault knows, not the glossary alone (entities.ts).
 *
 * Inside a ConceptLayer with an index, a linked word opens its card beside
 * it. Without one (the index still loading, a harness, a design that does
 * not link), the passage is plain words: the same text, nothing missing,
 * nothing waiting.
 *
 * A WORD, NOT A BOX (review fix, Oct 19 2026)
 * -------------------------------------------
 * A linked word is a span with the button role (TermButton), never a
 * <button>: a button is laid out as one unbreakable box even when told to be
 * inline, so a line could break between "(Valsalva" and its ")", stranding
 * the bracket at the start of the next line, and a long term could not wrap
 * inside itself. A span wraps exactly like the words around it. It is still
 * a real control: focusable, Enter and Space press it, and it says it opens
 * a card.
 *
 * A tap on a linked word is the word's, not the line's: ArticleBlocks selects
 * a line on a click, so the word stops its click there (and carries
 * data-vault-term, which ArticleBlocks also reads as "not a tap on the line").
 */

import { Fragment, useMemo } from "react";
import { linkText } from "../entities";
import { useConcepts } from "./ConceptLayer";
import { TermButton } from "./TermButton";
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
          <TermButton key={`${id}-${i}`} popup onPress={(el) => concepts.open(id, el)}>
            {s.text}
          </TermButton>
        );
      })}
    </>
  );
}
