import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AppliedMarkup } from "../markup";
import type { VaultSection } from "../types";
import { HiddenLines, MarkedLine } from "./MarkedLine";
import { runLabels } from "./lines";
import type { StepCard } from "./steps";
import "../../wiki/wiki.css";
import "./lesson.css";

/**
 * THE STEP DECK — one card at a time, Back and Next. Lifted from the
 * Interactive Course into the shared parts (the Learning vault redesign, Oct
 * 19 2026: AJ picked the mix, the Codex as the base with the Course's lesson
 * cards). Draws with lesson.css (vtl__).
 *
 * A lesson is a stack of cards (steps.ts cuts them, never rewording a line).
 * One card shows on a large panel; Back and Next are 52px, and so is the
 * swipe: a sideways flick on the card turns it, a vertical one scrolls the
 * page as always (touch-action: pan-y). The arrow keys turn it when the deck
 * has the focus. The new card slides in from the side it came from, once,
 * and only when the reader has not asked for less motion (lesson.css).
 *
 * Studio marks show on the cards exactly as on the page (a crossed-out line
 * crossed out, with why; a note under its line). Hidden crossed-out lines
 * fold into one quiet line. Acting on a line is the whole page's job
 * (ArticleBlocks, "Read it all"), where the line actions live.
 *
 * `end` is one more card after the last (Check yourself, the next lesson);
 * `at` and `onAt` let the page drive it (a dial's tile turns to the card
 * that sets that dial). `flush` drops the deck's own top margin where the
 * page already spaces it (a set-up under its switch).
 *
 * NEXT NEVER MOVES (review fix, Oct 19 2026)
 * ------------------------------------------
 * Every content card is drawn, stacked in one grid cell, and only the one on
 * turn is visible (the others hidden and inert: no tap, no focus, nothing for
 * a screen reader). The stage is therefore as tall as the deck's tallest card,
 * so Back, the dots and Next sit in the same place on every card of a lesson
 * and the thumb finds Next where it left it. The end card (Check yourself, up
 * to three questions) is left out of the stack and drawn alone in its turn:
 * stacked, it would push Next down on every card.
 *
 * A turn that takes the focused control away (Next on the card before the
 * end, Back on the first card) hands the focus to the deck itself, which the
 * arrow keys turn, rather than dropping it on the page.
 *
 * The deck's bar (Back, where you are, Next) sticks to the foot of Learning's
 * one scroller (.wk__scroll) while the deck is in view, taking back the
 * scroller's bottom padding (1.5rem, 2rem from 1024px), so it is drawn for
 * WikiShell's page.
 */

/** Past this many cards the dots become a bar: forty dots say nothing. */
const MAX_DOTS = 14;
/** A flick this far sideways turns a card. */
const SWIPE_PX = 56;

export interface StepDeckProps {
  /** The sections the cards index into (the deck's own slice of the page). */
  sections: VaultSection[];
  /** The same sections with this studio's marks, from useAppliedMarkup over the whole page. */
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  cards: StepCard[];
  at: number;
  onAt: (i: number) => void;
  /** One more card after the last. */
  end?: ReactNode;
  /** What Next says on the last card before `end` ("Check yourself"). */
  endLabel?: string;
  /** What the deck is, for a screen reader ("Gradual Load-up"). */
  label: string;
  /** Drawn on the last card when there is no `end` (Start again, Read it all). */
  last?: ReactNode;
  /** With no `end`: what the last card's Next does instead (the next lesson). */
  onFinish?: () => void;
  finishLabel?: string;
  /** No top margin of its own (the page spaces it). */
  flush?: boolean;
}

export function StepDeck({ sections, marked, studioLens, cards, at, onAt, end, endLabel, label, last, onFinish, finishLabel, flush = false }: StepDeckProps) {
  const total = cards.length + (end ? 1 : 0);
  const i = Math.min(Math.max(0, at), Math.max(0, total - 1));
  const [dir, setDir] = useState<"next" | "back" | null>(null);
  const deckId = useId();
  const deckRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  // Whether the focus was in the deck when the reader turned it (see below).
  const focusWasIn = useRef(false);

  const go = (n: number) => {
    if (n < 0 || n >= total || n === i) return;
    try {
      focusWasIn.current = Boolean(deckRef.current && deckRef.current.contains(document.activeElement));
    } catch {
      focusWasIn.current = false;
    }
    setDir(n > i ? "next" : "back");
    onAt(n);
  };

  // A turned card whose top went above the screen comes back into view.
  const firstTurn = useRef(true);
  useEffect(() => {
    if (firstTurn.current) {
      firstTurn.current = false;
      return;
    }
    const el = stageRef.current;
    if (!el) return;
    try {
      const scroller = el.closest(".wk__scroll");
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      if (el.getBoundingClientRect().top < top && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "start" });
      }
    } catch {
      /* a layout that can't be measured stays where it is */
    }
  }, [i]);

  // The control the reader pressed may be gone after the turn (Next becomes
  // the end card's spacer; Back is disabled on the first card). Only then,
  // and only when the focus was in the deck, the deck takes it: never pulled
  // off a Next that is still there.
  useEffect(() => {
    if (!focusWasIn.current) return;
    focusWasIn.current = false;
    const deck = deckRef.current;
    if (!deck) return;
    try {
      const now = document.activeElement as HTMLElement | null;
      const lost = !now || now === document.body || !deck.contains(now) || (now as HTMLButtonElement).disabled === true;
      if (lost) deck.focus({ preventScroll: true });
    } catch {
      /* nothing to hand the focus to */
    }
  }, [i]);

  if (total === 0) {
    return <p className="vtl__empty">Nothing written here yet.</p>;
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(i - 1);
    }
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? i + 1 : i - 1);
  };

  const isEnd = Boolean(end) && i === cards.length;
  const nextLabel = i === cards.length - 1 && end ? (endLabel ?? "Next") : "Next";

  return (
    <section
      ref={deckRef}
      className="vtl__deck"
      data-flush={flush ? "" : undefined}
      aria-roledescription="lesson cards"
      aria-label={label}
      id={deckId}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="vtl__deck-stage" ref={stageRef} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)}>
        {isEnd ? (
          <article key="end" className="vtl__card" data-current="" data-dir={dir ?? undefined} data-end="" aria-label={`Card ${i + 1} of ${total}`}>
            {end}
          </article>
        ) : (
          cards.map((card, n) => {
            const on = n === i;
            return (
              <article
                key={n}
                className="vtl__card"
                data-current={on ? "" : undefined}
                data-dir={on ? (dir ?? undefined) : undefined}
                aria-hidden={on ? undefined : true}
                inert={on ? undefined : true}
                aria-label={`Card ${n + 1} of ${total}`}
              >
                <CardBody card={card} sections={sections} marked={marked} studioLens={studioLens} />
                {n === cards.length - 1 && !end && last && <div className="vtl__card-last">{last}</div>}
              </article>
            );
          })
        )}
      </div>

      <div className="vtl__deck-nav">
        <button type="button" className="vtl__btn vtl__deck-back" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back a card">
          <ChevronLeft size={20} aria-hidden />
          <span className="vtl__deck-btn-words">Back</span>
        </button>
        <Progress at={i} total={total} />
        {i < total - 1 ? (
          <button type="button" className="vtl__btn vtl__btn--primary vtl__deck-next" onClick={() => go(i + 1)}>
            <span>{nextLabel}</span>
            <ChevronRight size={20} aria-hidden />
          </button>
        ) : onFinish && !end ? (
          <button type="button" className="vtl__btn vtl__btn--primary vtl__deck-next" onClick={onFinish}>
            <span>{finishLabel ?? "Next"}</span>
            <ChevronRight size={20} aria-hidden />
          </button>
        ) : (
          <span className="vtl__deck-spacer" aria-hidden />
        )}
      </div>
    </section>
  );
}

function Progress({ at, total }: { at: number; total: number }) {
  const words = `${at + 1} of ${total}`;
  if (total > MAX_DOTS) {
    return (
      <div className="vtl__progress" role="img" aria-label={words}>
        <span className="vtl__progress-bar" aria-hidden>
          <span className="vtl__progress-fill" style={{ width: `${((at + 1) / total) * 100}%` }} />
        </span>
        <span className="vtl__progress-words" aria-hidden>
          {words}
        </span>
      </div>
    );
  }
  return (
    <div className="vtl__dots" role="img" aria-label={words}>
      {Array.from({ length: total }, (_, n) => (
        <span key={n} className="vtl__dot" data-on={n === at ? "" : undefined} data-done={n < at ? "" : undefined} aria-hidden />
      ))}
    </div>
  );
}

/** One card's lines, with each section's title over its run, and a label said once over the lines that share it. */
function CardBody({
  card,
  sections,
  marked,
  studioLens,
}: {
  card: StepCard;
  sections: VaultSection[];
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
}) {
  return (
    <div className="vtl__card-body">
      {card.parts.map((p, pi) => {
        const ms = marked[p.section];
        const s = sections[p.section];
        if (!ms || !s) return null;
        const blocks = p.blocks.map((bi) => ms.blocks[bi]).filter(Boolean);
        const title = (s.title ?? "").trim();
        const labels = runLabels(blocks, title);
        const hidden = blocks.filter((b) => b.hidden).length;
        return (
          <div key={`${p.section}-${pi}`} className="vtl__part">
            {title && (
              <h3 className="vtl__part-title" data-continued={p.continued ? "" : undefined}>
                {title}
              </h3>
            )}
            {s.note && !p.continued && <p className="vtl__part-note">{s.note}</p>}
            <div className="vtl__part-lines">
              {blocks.map((b, bi) =>
                b.hidden ? null : <MarkedLine key={`${b.key}-${bi}`} block={b} studioLens={studioLens} showLabel={labels[bi]} />,
              )}
            </div>
            <HiddenLines count={hidden} />
          </div>
        );
      })}
    </div>
  );
}
