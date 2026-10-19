import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dumbbell, EyeOff, MessageCircle, Shuffle } from "lucide-react";
import type { AppliedMarkup } from "../../learning-vault/markup";
import { MarkedLine, hiddenWords } from "./shell";
import { examplesLine, type CueDrill as CueDrillShape, type OrderDrill } from "./drills";
import "./course.css";

/**
 * A DRILL CARD — the moment first, the Academy's lines behind a tap (the
 * Interactive Course, the Learning vault redesign, Oct 19 2026).
 *
 * "What would you cue?": the moment in the set is the prompt (and the
 * machines the phrasebook names for it), the trainer says what they would
 * say, then reveals the Academy's lines. The lines arrive one after another
 * (course.css; not with reduced motion). A studio's crossed-out cue shows
 * crossed out with what it says instead, as on the phrasebook page. Nothing
 * is scored, timed or kept.
 *
 * Revealing takes the reveal button away, so the focus goes to the lines it
 * revealed (never left on the page's top for a keyboard or VoiceOver
 * reader); `focusLines` does the same for a card that arrives already open
 * in place of the one the reader was on (the Overview's "Another moment").
 * Only when the focus has nowhere else to be: a reader elsewhere keeps it.
 */

/** How many lines show before "All n lines" (the rest are on the phrasebook page). */
const SHOWN = 6;

export function CueDrillCard({
  drill,
  marked,
  studioLens,
  onAll,
  another,
  startOpen = false,
  size = "regular",
  cap = SHOWN,
  focusLines = false,
}: {
  drill: CueDrillShape;
  /** The page's sections with this studio's marks (useAppliedMarkup). */
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  /** Opens the moment in full (a peek of the phrasebook). */
  onAll?: () => void;
  /** "Another moment" (the Overview's drill of the day). */
  another?: () => void;
  startOpen?: boolean;
  size?: "regular" | "large";
  /** How many lines show before "All n lines"; the phrasebook page shows them all. */
  cap?: number;
  /** Open on arrival in place of the card the reader was on: the lines take the focus the old card lost. */
  focusLines?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const linesRef = useRef<HTMLUListElement>(null);
  // Set by the reader's own reveal (or an arrival in place of a card): the
  // next draw with lines hands them the focus the vanished button had.
  const wantFocus = useRef(focusLines && startOpen);
  useEffect(() => {
    if (!open || !wantFocus.current) return;
    wantFocus.current = false;
    try {
      const now = document.activeElement;
      if (!now || now === document.body) linesRef.current?.focus({ preventScroll: true });
    } catch {
      /* nothing to hand the focus to */
    }
  }, [open]);
  const reveal = () => {
    wantFocus.current = true;
    setOpen(true);
  };
  const section = marked[drill.section];
  const lines = section ? drill.cues.map((i) => section.blocks[i]).filter(Boolean) : [];
  const shown = lines.filter((b) => !b.hidden);
  const hidden = lines.length - shown.length;
  const examples = examplesLine(drill.examples);
  // The large card asks the question in words, once; a card among many (the
  // phrasebook, a machine's moments) sits under a heading that already asks it.
  const lead = size === "large";
  return (
    <article className="crs__drill" data-size={size} data-open={open ? "" : undefined}>
      {lead && (
        <p className="crs__drill-kicker">
          <MessageCircle size={16} aria-hidden />
          What would you cue?
        </p>
      )}
      <h3 className="crs__drill-title">{drill.title}</h3>
      {examples && (
        <p className="crs__drill-eg">
          <Dumbbell size={14} aria-hidden />
          <span>{examples}</span>
        </p>
      )}
      {!open ? (
        lead ? (
          <div className="crs__drill-ask">
            <span className="crs__drill-bubble" aria-hidden>
              <MessageCircle size={30} />
            </span>
            <p className="crs__drill-prompt">Say it out loud first.</p>
            <button type="button" className="crs__btn crs__btn--primary crs__btn--big" onClick={reveal}>
              Show the Academy's lines
            </button>
          </div>
        ) : (
          <div className="crs__drill-foot">
            <button type="button" className="crs__btn" onClick={reveal}>
              <MessageCircle size={16} aria-hidden />
              Show the lines
            </button>
          </div>
        )
      ) : (
        <>
          <ul className="crs__drill-lines" ref={linesRef} tabIndex={-1} aria-label={`What the Academy says: ${drill.title}`}>
            {shown.slice(0, cap).map((b, i) => (
              <li key={`${b.key}-${i}`} style={{ animationDelay: `${i * 70}ms` }}>
                <MarkedLine block={b} studioLens={studioLens} />
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="crs__hidden">
              <EyeOff size={14} aria-hidden />
              {hiddenWords(hidden)}
            </p>
          )}
          {(onAll || another) && (
          <div className="crs__drill-foot">
            {onAll && (
              <button type="button" className="crs__btn crs__btn--quiet" onClick={onAll}>
                {shown.length > cap ? `All ${shown.length} lines` : "The whole moment"}
              </button>
            )}
            {another && (
              <button type="button" className="crs__btn" onClick={another}>
                <Shuffle size={16} aria-hidden />
                Another moment
              </button>
            )}
          </div>
          )}
        </>
      )}
    </article>
  );
}

/**
 * The packages conversation as a drill (the "Talking about packages"
 * playbook's "When money is the problem"): the lead-in line, then the steps
 * in their order, one tap each. Says it is a draft once: here, when the page
 * around it does not already (the Academy index); the playbook's own lesson
 * says it in its lesson bar, so it passes no draftLine.
 */
export function OrderDrillCard({
  drill,
  marked,
  studioLens,
  title,
  draftLine,
  foot,
}: {
  drill: OrderDrill;
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  title: string;
  draftLine?: string;
  foot?: ReactNode;
}) {
  const [shownCount, setShownCount] = useState(0);
  const section = marked[drill.section];
  if (!section) return null;
  const lead = drill.lead !== null ? section.blocks[drill.lead] : null;
  const steps = drill.steps.map((i) => section.blocks[i]).filter(Boolean);
  const done = shownCount >= steps.length;
  return (
    <article className="crs__drill crs__drill--order">
      <p className="crs__drill-kicker">
        <MessageCircle size={16} aria-hidden />
        {title}
      </p>
      {lead && <h3 className="crs__drill-title">{lead.text}</h3>}
      <ol className="crs__order">
        {steps.map((b, i) => (
          <li key={`${b.key}-${i}`} className="crs__order-step" data-shown={i < shownCount ? "" : undefined}>
            <span className="crs__order-n" aria-hidden>
              {i + 1}
            </span>
            {i < shownCount ? (
              <MarkedLine block={b} studioLens={studioLens} />
            ) : (
              <span className="crs__order-hole">{i === shownCount ? "What comes next?" : ""}</span>
            )}
          </li>
        ))}
      </ol>
      <div className="crs__drill-foot">
        {!done ? (
          <button type="button" className="crs__btn crs__btn--primary" onClick={() => setShownCount((n) => n + 1)}>
            {shownCount === 0 ? "Show the first" : "Show the next"}
          </button>
        ) : (
          <button type="button" className="crs__btn" onClick={() => setShownCount(0)}>
            Start again
          </button>
        )}
        {foot}
      </div>
      {draftLine && <p className="crs__draft">{draftLine}</p>}
    </article>
  );
}
