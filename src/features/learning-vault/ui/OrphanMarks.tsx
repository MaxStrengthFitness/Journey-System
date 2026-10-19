import { createElement, useId, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { noteLine, whyLine } from "../markup";
import type { OrphanMark, VaultTarget } from "../types";
import { useVault } from "./VaultProvider";
import { canRemoveNote, orphanWords, studioInSentence } from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * LINES THAT CHANGED SINCE {STUDIO} MARKED THEM — the marks with no line to
 * sit on (the Learning vault redesign, Oct 19 2026).
 *
 * A mark is keyed by the WORDS of its line (blocks.ts), never the position,
 * so when the MSF original is reworded or a line moves away, the studio's
 * strike or note does not slide onto a different sentence. It lands here,
 * at the foot of the page, with the words it was made on and the mark
 * itself, until someone at the studio deals with it: a leader puts a
 * crossed-out line back, and a note comes off by its author or a leader.
 * Nothing is dropped without a person deciding.
 *
 * Studio's version only; the MSF original carries no markup.
 */
export function OrphanMarks({
  target,
  orphans,
  headingLevel = 2,
}: {
  target: VaultTarget;
  orphans: OrphanMark[];
  /** The level of the page's section titles; this block's title sits at the same level. */
  headingLevel?: 2 | 3;
}) {
  const vault = useVault();
  const studioId = vault.studio.id;
  const studio = studioInSentence(vault.studio.name);
  const [asking, setAsking] = useState<string | null>(null);
  const headId = useId();

  if (vault.lens !== "studio" || studioId === null || orphans.length === 0) return null;

  return (
    <section className="vta__orphans" aria-labelledby={headId}>
      {createElement(
        `h${headingLevel}`,
        { id: headId, className: "vta__orphans-head" },
        `Lines that changed since ${studio} marked them`,
      )}
      <p className="vta__hint">The MSF original changed these words, so the marks wait here.</p>
      <ul className="vta__orphans-list">
        {orphans.map((o) => {
          const key = o.kind === "strike" ? `s|${o.mark.blockKey}` : `n|${o.mark.id}`;
          return (
            <li key={key} className="vta__orphan" data-testid="orphan-mark">
              {o.kind === "strike" ? (
                <s className="vta__struck vta__orphan-words">{orphanWords(o)}</s>
              ) : (
                <p className="vta__orphan-words vta__orphan-words--quote">{orphanWords(o)}</p>
              )}
              {o.kind === "strike" ? (
                <div className="vta__mark">
                  {o.mark.replacement && <p className="vta__mark-body">{o.mark.replacement}</p>}
                  <p className="vta__mark-by">{whyLine(o.mark)}</p>
                </div>
              ) : (
                <div className="vta__mark">
                  <p className="vta__mark-body">{o.mark.body}</p>
                  <p className="vta__mark-by">{noteLine(o.mark)}</p>
                </div>
              )}
              {o.kind === "strike" && vault.viewer.canStrike && (
                <div className="vta__form-actions">
                  <button
                    type="button"
                    className="vta__btn"
                    onClick={() => vault.store.unstrike(studioId, target.key, o.mark.blockKey)}
                  >
                    <RotateCcw size={16} aria-hidden />
                    Put it back
                  </button>
                </div>
              )}
              {o.kind === "note" && canRemoveNote(o.mark, vault.viewer) && (
                <div className="vta__form-actions">
                  {asking === key ? (
                    <>
                      <span className="vta__confirm" role="alert">
                        Remove this note?
                      </span>
                      <button
                        type="button"
                        className="vta__btn vta__btn--danger"
                        onClick={() => {
                          setAsking(null);
                          vault.store.removeNote(studioId, target.key, o.mark.id);
                        }}
                      >
                        Remove
                      </button>
                      <button type="button" className="vta__btn vta__btn--quiet" onClick={() => setAsking(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="vta__btn" onClick={() => setAsking(key)}>
                      <Trash2 size={16} aria-hidden />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
