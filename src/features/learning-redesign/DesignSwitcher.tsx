import type { LearningDesign } from "../learning-vault/types";
import { DESIGNS, VIEW_AS, type ViewAs } from "./design";
import "../wiki"; // the --wk-* tokens (wiki.css brings wiki.tokens.css)
import "./redesign.css";

/**
 * THE PROTOTYPE BAR — above Learning's masthead, on the redesign branch only
 * (the Learning vault redesign, Oct 19 2026).
 *
 * A temporary control, and it should read as one: a quiet strip on the tray
 * (below the page, not part of the product), a "Prototype" tag, the two
 * choices as one segmented switch ([Mix | Current]) and, while a prototype is on, "View as" [Trainer | Leader | Head
 * office]. Every option is a 44px target; the words wrap and are never cut;
 * at 820 wide it is one row, on a phone two.
 *
 * It only reports a pick. LearningView asks the unsaved-changes gate before
 * it changes anything, and changes it inside the answer.
 */
export interface DesignSwitcherProps {
  design: LearningDesign;
  onDesign: (design: LearningDesign) => void;
  /** The role the prototype reads as (the real viewer's own until someone picks). */
  viewAs: ViewAs;
  onViewAs: (viewAs: ViewAs) => void;
}

export function DesignSwitcher({ design, onDesign, viewAs, onViewAs }: DesignSwitcherProps) {
  return (
    <div className="ld" role="region" aria-label="Prototype designs">
      <span className="ld__tag">Prototype</span>
      <div className="ld__seg ld__seg--designs" role="group" aria-label="Design">
        {DESIGNS.map((d) => {
          const picked = d.id === design;
          return (
            <button
              key={d.id}
              type="button"
              className="ld__opt"
              aria-pressed={picked}
              aria-label={d.number === null ? d.label : `${d.number} ${d.label}`}
              onClick={() => {
                if (!picked) onDesign(d.id);
              }}
            >
              {d.number !== null && (
                <span className="ld__num" aria-hidden>
                  {d.number}
                </span>
              )}
              <span className="ld__word">{d.label}</span>
            </button>
          );
        })}
      </div>
      {design !== "current" && (
        <div className="ld__as">
          <span className="ld__as-label" id="ld-view-as">
            View as
          </span>
          <div className="ld__seg" role="group" aria-labelledby="ld-view-as">
            {VIEW_AS.map((v) => {
              const picked = v.id === viewAs;
              return (
                <button
                  key={v.id}
                  type="button"
                  className="ld__opt"
                  aria-pressed={picked}
                  onClick={() => {
                    if (!picked) onViewAs(v.id);
                  }}
                >
                  <span className="ld__word">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
