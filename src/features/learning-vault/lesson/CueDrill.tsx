import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dumbbell, MessageCircle, Shuffle } from "lucide-react";
import type { AppliedMarkup } from "../markup";
import { HiddenLines, MarkedLine } from "./MarkedLine";
import { examplesLine, type CueDrill as CueDrillShape, type OrderDrill } from "./drills";
import "../../wiki/wiki.css";
import "./drills.css";

/**
 * A DRILL CARD — the moment first, the Academy's lines behind a tap. Lifted
 * from the Interactive Course into the shared parts (the Learning vault
 * redesign, Oct 19 2026: AJ picked the mix, the Codex as the base with the
 * Course's cue drills). Draws with drills.css (vtd__); its lines with
 * MarkedLine (lesson.css).
 *
 * "What would you cue?": the moment in the set is the prompt (and the
 * machines the phrasebook names for it), the trainer says what they would
 * say, then reveals the Academy's lines. The lines arrive one after another
 * (drills.css; not with reduced motion). A studio's crossed-out cue shows
 * crossed out with what it says instead, as on the phrasebook page. Nothing
 * is scored, timed or kept.
 *
 * Where the drill is a drill (the phrasebook, a drill of the day) every card
 * arrives closed, "Another moment" included: saying it first is the point.
 * On a machine's page the lines are a reference a trainer reads at the
 * machine, so that page passes `startOpen` (the floor judge, Oct 19 2026).
 *
 * Revealing takes the reveal button away, so the focus goes to the lines it
 * revealed (never left on the page's top for a keyboard or VoiceOver
 * reader); `focusReveal` hands the focus to a card that arrives in place of
 * the one the reader was on ("Another moment"), on its reveal button. Only
 * when the focus has nowhere else to be: a reader elsewhere keeps it.
 */

/** How many lines show before "All n lines" (the rest are on the phrasebook page). */
const SHOWN = 6;

export interface CueDrillCardProps {
  drill: CueDrillShape;
  /** The page's sections with this studio's marks (useAppliedMarkup over the phrasebook or the machine page). */
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  /** Opens the moment in full (a peek of the phrasebook). */
  onAll?: () => void;
  /** "Another moment" (a drill of the day). */
  another?: () => void;
  startOpen?: boolean;
  /** "large" asks "What would you cue?" in words, once (a card on its own); "regular" sits under a heading that asks it. */
  size?: "regular" | "large";
  /** How many lines show before "All n lines"; the phrasebook page shows them all. */
  cap?: number;
  /** Arrived in place of the card the reader was on: the reveal button takes the focus the old card lost. */
  focusReveal?: boolean;
}

export function CueDrillCard({
  drill,
  marked,
  studioLens,
  onAll,
  another,
  startOpen = false,
  size = "regular",
  cap = SHOWN,
  focusReveal = false,
}: CueDrillCardProps) {
  const [open, setOpen] = useState(startOpen);
  const linesRef = useRef<HTMLUListElement>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  // Set by the reader's own reveal: the next draw with lines hands them the
  // focus the vanished button had.
  const wantFocus = useRef(false);
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
  // A card that arrives in place of another ("Another moment"): the button
  // that was pressed went with the old card, so its reveal takes the focus.
  // Once, on arrival, and only when the focus has nowhere else to be.
  useEffect(() => {
    if (!focusReveal) return;
    try {
      const now = document.activeElement;
      if (!now || now === document.body) revealRef.current?.focus({ preventScroll: true });
    } catch {
      /* nothing to hand the focus to */
    }
    // Arrival only: the card is keyed by its moment, so each moment mounts anew.
  }, [focusReveal]);
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
    <article className="vtd__drill" data-size={size} data-open={open ? "" : undefined}>
      {lead && (
        <p className="vtd__kicker">
          <MessageCircle size={16} aria-hidden />
          What would you cue?
        </p>
      )}
      <h3 className="vtd__title">{drill.title}</h3>
      {examples && (
        <p className="vtd__eg">
          <Dumbbell size={14} aria-hidden />
          <span>{examples}</span>
        </p>
      )}
      {!open ? (
        lead ? (
          <div className="vtd__ask">
            <span className="vtd__bubble" aria-hidden>
              <MessageCircle size={30} />
            </span>
            <p className="vtd__prompt">Say it out loud first.</p>
            <button ref={revealRef} type="button" className="vtd__btn vtd__btn--primary vtd__btn--big" onClick={reveal}>
              Show the Academy's lines
            </button>
          </div>
        ) : (
          <div className="vtd__foot">
            <button ref={revealRef} type="button" className="vtd__btn" onClick={reveal}>
              <MessageCircle size={16} aria-hidden />
              Show the lines
            </button>
          </div>
        )
      ) : (
        <>
          <ul className="vtd__lines" ref={linesRef} tabIndex={-1} aria-label={`What the Academy says: ${drill.title}`}>
            {shown.slice(0, cap).map((b, i) => (
              <li key={`${b.key}-${i}`} style={{ animationDelay: `${i * 70}ms` }}>
                <MarkedLine block={b} studioLens={studioLens} />
              </li>
            ))}
          </ul>
          <HiddenLines count={hidden} />
          {(onAll || another) && (
            <div className="vtd__foot">
              {onAll && (
                <button type="button" className="vtd__btn vtd__btn--quiet" onClick={onAll}>
                  {shown.length > cap ? `All ${shown.length} lines` : "The whole moment"}
                </button>
              )}
              {another && (
                <button type="button" className="vtd__btn" onClick={another}>
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

export interface OrderDrillCardProps {
  drill: OrderDrill;
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  /** The kicker over it ("Talking about packages", "Practice it"). */
  title: string;
  /** Said once under it, when the page around it does not already say it (a playbook's draft line). */
  draftLine?: string;
  /** More in the foot, beside Show the next (a door to the whole playbook). */
  foot?: ReactNode;
}

/**
 * An order drill (the "Talking about packages" playbook's "When money is the
 * problem"): the lead-in line, then the steps in their order, one tap each.
 * Says it is a draft once: here, when the page around it does not already
 * (an index of pages); a playbook's own lesson says it in its lesson bar, so
 * it passes no draftLine.
 */
export function OrderDrillCard({ drill, marked, studioLens, title, draftLine, foot }: OrderDrillCardProps) {
  const [shownCount, setShownCount] = useState(0);
  const section = marked[drill.section];
  if (!section) return null;
  const lead = drill.lead !== null ? section.blocks[drill.lead] : null;
  const steps = drill.steps.map((i) => section.blocks[i]).filter(Boolean);
  const done = shownCount >= steps.length;
  return (
    <article className="vtd__drill vtd__drill--order">
      <p className="vtd__kicker">
        <MessageCircle size={16} aria-hidden />
        {title}
      </p>
      {lead && <h3 className="vtd__title">{lead.text}</h3>}
      <ol className="vtd__order">
        {steps.map((b, i) => (
          <li key={`${b.key}-${i}`} className="vtd__order-step" data-shown={i < shownCount ? "" : undefined}>
            <span className="vtd__order-n" aria-hidden>
              {i + 1}
            </span>
            {i < shownCount ? (
              <MarkedLine block={b} studioLens={studioLens} noBullet className="vtd__order-line" />
            ) : (
              <span className="vtd__order-hole">{i === shownCount ? "What comes next?" : ""}</span>
            )}
          </li>
        ))}
      </ol>
      <div className="vtd__foot">
        {!done ? (
          <button type="button" className="vtd__btn vtd__btn--primary" onClick={() => setShownCount((n) => n + 1)}>
            {shownCount === 0 ? "Show the first" : "Show the next"}
          </button>
        ) : (
          <button type="button" className="vtd__btn" onClick={() => setShownCount(0)}>
            Start again
          </button>
        )}
        {foot}
      </div>
      {draftLine && <p className="vtd__draft">{draftLine}</p>}
    </article>
  );
}
