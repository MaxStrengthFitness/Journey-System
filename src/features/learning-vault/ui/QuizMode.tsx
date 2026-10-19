/**
 * THE QUIZ — Learning's game mode (Learning vault redesign, Oct 19 2026).
 *
 * AJ's own late ask: "a little game mode in learning where its a quiz mode
 * that just gives information from the academy and even the renaissance of
 * exercise". So it plays like a game: pick a deck, ten cards dealt one at a
 * time, each answered with a tap, the card turning to say why and where to
 * read it, and a round that ends.
 *
 * WHAT IT NEVER DOES (CLAUDE.md, "Recognition, never ranking")
 * ------------------------------------------------------------
 * - Keep anything. No points, no streaks, no badges, no history, no
 *   leaderboard, nothing in storage. "7 of 10 this round" is said once on the
 *   end card and is gone when the round closes; the pips along the top mark
 *   where you are, never how you did.
 * - Colour a miss crimson. Crimson is critical and rep quality only. The
 *   right answer turns green (--wk-ok, "done / right"); the one you picked,
 *   if it wasn't, gets a quiet grey mark and a "Your answer" tag.
 * - Rush anyone. No timer, no countdown; the next card comes when you ask.
 *
 * HOW IT FEELS
 * ------------
 * Cards are dealt with a small slide and tilt, the answer card rises, the
 * right option settles with a small pop, and the end card gathers the
 * round's pips in. All of it moves transform and opacity only, once, and
 * none of it runs with reduced motion (quiz.css). An order question is
 * tap-to-place, never a drag: tap the items in order, tap a placed one to
 * send it back.
 *
 * The questions, the deal and the checking are pure (../quiz/*.ts). The
 * screen passes Date.now() as the seed unless it is given one.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Dumbbell,
  HeartHandshake,
  Lightbulb,
  MessageCircle,
  Repeat,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { accentStyle } from "../../wiki/categories";
import type { QuizAnswer, QuizDeckId, QuizQuestion, VaultRoute } from "../types";
import { DECK_ACCENT, deckById, isDeckId, playableDecks } from "../quiz/decks";
import {
  buildRound,
  checkAnswer,
  nextSeed,
  roundLine,
  roundSummary,
  type DealtQuestion,
  type DealtRound,
} from "../quiz/round";
import "../../wiki/wiki.css";
import "./quiz.css";

export interface QuizModeProps {
  bank: QuizQuestion[] | null;
  initialDeck?: QuizDeckId;
  seed?: number;
  onOpenSource: (route: VaultRoute) => void;
  onExit?: () => void;
}

const DECK_ICON: Record<QuizDeckId, typeof Shuffle> = {
  mixed: Shuffle,
  cues: MessageCircle,
  rep: Repeat,
  machines: Dumbbell,
  glossary: BookOpen,
  method: Lightbulb,
  hutchins: Compass,
  playbooks: HeartHandshake,
};

/** A prompt this long reads better a size down (the type scale's 17). */
const LONG_PROMPT = 120;

/**
 * Bring a new card (or the end) back into view when the reader had scrolled
 * down to the last card's Next. Only when its top is out of sight above the
 * scroller, so nothing jumps while it is already visible. A scroll never
 * takes the card down: this cannot throw.
 */
function bringIntoView(el: HTMLElement | null) {
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
}

function deckStyle(id: QuizDeckId): CSSProperties | undefined {
  const accent = DECK_ACCENT[id];
  return accent ? accentStyle(accent) : undefined;
}

export function QuizMode({ bank, initialDeck, seed, onOpenSource, onExit }: QuizModeProps) {
  // The next round's seed. Date.now() is the screen's to pass; the deal is pure.
  const [seedNow, setSeedNow] = useState<number>(() => (typeof seed === "number" ? seed : Date.now()) >>> 0);
  const [round, setRound] = useState<DealtRound | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [ended, setEnded] = useState(false);
  const [waitingFor, setWaitingFor] = useState<QuizDeckId | null>(() =>
    initialDeck && isDeckId(initialDeck) ? initialDeck : null,
  );

  const decks = useMemo(() => (bank ? playableDecks(bank) : []), [bank]);

  const start = useCallback(
    (deck: QuizDeckId) => {
      if (!bank) return;
      const dealt = buildRound(bank, deck, seedNow);
      if (dealt.questions.length === 0) return;
      setSeedNow((s) => nextSeed(s));
      setRound(dealt);
      setAt(0);
      setAnswers([]);
      setEnded(false);
    },
    [bank, seedNow],
  );

  // A deck named from outside (a track's step, a link) starts the moment the
  // bank is here; a deck the bank can't deal from leaves the picker showing.
  useEffect(() => {
    if (!waitingFor || !bank) return;
    setWaitingFor(null);
    if (playableDecks(bank).some((d) => d.id === waitingFor)) start(waitingFor);
  }, [waitingFor, bank, start]);

  const backToDecks = useCallback(() => {
    setRound(null);
    setAnswers([]);
    setEnded(false);
    setAt(0);
  }, []);

  const answer = useCallback(
    (q: DealtQuestion, picked: number | number[]) => {
      setAnswers((prev) =>
        prev.some((a) => a.questionId === q.id) ? prev : [...prev, { questionId: q.id, right: checkAnswer(q, picked), picked }],
      );
    },
    [],
  );

  const next = useCallback(() => {
    if (!round) return;
    if (at + 1 >= round.questions.length) setEnded(true);
    else setAt(at + 1);
  }, [round, at]);

  if (bank === null) {
    return (
      <section className="qz" aria-label="Quiz">
        <div className="qz__loading">
          <LoadingMark label="Shuffling the decks…" />
        </div>
      </section>
    );
  }

  if (round && ended) {
    return (
      <section className="qz" aria-label="Quiz">
        <QuizEnd
          round={round}
          answers={answers}
          onAgain={() => start(round.deck)}
          onDecks={backToDecks}
          onExit={onExit}
          onOpenSource={onOpenSource}
        />
      </section>
    );
  }

  if (round) {
    const q = round.questions[at];
    const given = answers.find((a) => a.questionId === q.id);
    return (
      <section className="qz" aria-label="Quiz">
        <RoundBar round={round} at={at} answered={answers.length} onDecks={backToDecks} />
        <QuestionCard
          key={q.id}
          q={q}
          last={at + 1 >= round.questions.length}
          given={given}
          onAnswer={(picked) => answer(q, picked)}
          onNext={next}
          onOpenSource={onOpenSource}
        />
      </section>
    );
  }

  return (
    <section className="qz" aria-label="Quiz">
      <DeckPicker decks={decks.map((d) => d.id)} onPick={start} onExit={onExit} />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The deck picker
 * ------------------------------------------------------------------ */

function DeckPicker({ decks, onPick, onExit }: { decks: QuizDeckId[]; onPick: (d: QuizDeckId) => void; onExit?: () => void }) {
  return (
    <div className="qz__picker">
      <header className="qz__head">
        <h2 className="qz__title">Quiz</h2>
        <p className="qz__lede">Pick a deck. Ten cards, one at a time, each with where to read more. Nothing is kept.</p>
      </header>
      {decks.length === 0 ? (
        <p className="wk__empty">Nothing to play yet.</p>
      ) : (
        <ul className="qz__decks" data-qz-decks="">
          {decks.map((id) => {
            const deck = deckById(id);
            const Icon = DECK_ICON[id];
            return (
              <li key={id} className="qz__deck-slot">
                <button
                  type="button"
                  className="qz__deck"
                  style={deckStyle(id)}
                  onClick={() => onPick(id)}
                  data-qz-deck={id}
                >
                  <span className="qz__deck-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2.25} />
                  </span>
                  <span className="qz__deck-words">
                    <span className="qz__deck-title">{deck.title}</span>
                    <span className="qz__deck-blurb">{deck.blurb}</span>
                  </span>
                  <ArrowRight className="qz__deck-go" size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onExit && (
        <div className="qz__actions">
          <button type="button" className="wk__btn wk__btn--quiet" onClick={onExit}>
            Back to Learning
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The round's bar: the deck, where you are, and the way out
 * ------------------------------------------------------------------ */

function RoundBar({
  round,
  at,
  answered,
  onDecks,
}: {
  round: DealtRound;
  at: number;
  answered: number;
  onDecks: () => void;
}) {
  const deck = deckById(round.deck);
  const total = round.questions.length;
  return (
    <div className="qz__bar" style={deckStyle(round.deck)}>
      <div className="qz__bar-words">
        <span className="qz__bar-deck">{deck.title}</span>
        <span className="qz__bar-count">
          Question {at + 1} of {total}
        </span>
      </div>
      <ol className="qz__pips" aria-hidden="true">
        {round.questions.map((q, i) => (
          <li
            key={q.id}
            className={`qz__pip${i < answered ? " qz__pip--done" : ""}${i === at ? " qz__pip--here" : ""}`}
          />
        ))}
      </ol>
      <button type="button" className="wk__btn wk__btn--quiet qz__bar-out" onClick={onDecks}>
        Other decks
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One card
 * ------------------------------------------------------------------ */

function QuestionCard({
  q,
  last,
  given,
  onAnswer,
  onNext,
  onOpenSource,
}: {
  q: DealtQuestion;
  last: boolean;
  given: QuizAnswer | undefined;
  onAnswer: (picked: number | number[]) => void;
  onNext: () => void;
  onOpenSource: (route: VaultRoute) => void;
}) {
  const promptRef = useRef<HTMLHeadingElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const done = given !== undefined;
  const right = done && checkAnswer(q, given.picked);

  // A new card takes the focus, so a keyboard or a screen reader starts on
  // the question; an answered one hands it to Next.
  useEffect(() => {
    bringIntoView(cardRef.current?.parentElement ?? null);
    promptRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (done) nextRef.current?.focus({ preventScroll: true });
  }, [done]);

  const long = q.prompt.length > LONG_PROMPT;
  return (
    <article
      ref={cardRef}
      className={`qz__card${done ? " qz__card--done" : ""}`}
      aria-labelledby={`qz-q-${q.id}`}
    >
      <h3
        id={`qz-q-${q.id}`}
        ref={promptRef}
        tabIndex={-1}
        className={`qz__prompt${long ? " qz__prompt--long" : ""}`}
      >
        {q.prompt}
      </h3>

      {q.kind === "order" ? (
        <OrderPlay q={q} given={given} onCheck={(order) => onAnswer(order)} />
      ) : (
        <ul className={`qz__options${q.kind === "truefalse" ? " qz__options--two" : ""}`}>
          {q.options.map((option, i) => {
            const isAnswer = i === q.answer;
            const picked = done && given?.picked === i;
            const state = !done ? "" : isAnswer ? " qz__option--right" : picked ? " qz__option--missed" : " qz__option--rest";
            return (
              <li key={`${i}-${option}`} className="qz__option-slot">
                <button
                  type="button"
                  className={`qz__option${state}`}
                  disabled={done}
                  onClick={() => onAnswer(i)}
                  data-qz-option={i}
                >
                  <span className="qz__option-text">{option}</span>
                  {done && isAnswer && (
                    <>
                      <Check className="qz__option-mark" size={20} strokeWidth={2.75} aria-hidden="true" />
                      <span className="qz__sr">, the right answer</span>
                    </>
                  )}
                  {done && picked && !isAnswer && <span className="qz__option-tag">Your answer</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done && (
        <div className="qz__reveal" role="status">
          <p className={`qz__verdict${right ? " qz__verdict--right" : ""}`}>
            {right ? (
              <>
                <Check size={18} strokeWidth={2.75} aria-hidden="true" /> That's it.
              </>
            ) : q.kind === "order" ? (
              "Not quite. Here is the order."
            ) : (
              <>Not quite. It's “{q.options[q.answer]}”.</>
            )}
          </p>
          {!right && q.kind === "order" && (
            <ol className="qz__order-right">
              {q.options.map((o, i) => (
                <li key={`${i}-${o}`}>{o}</li>
              ))}
            </ol>
          )}
          <p className="qz__explain">{q.explain}</p>
          <SourceLine q={q} onOpenSource={onOpenSource} />
          <div className="qz__actions">
            <button ref={nextRef} type="button" className="wk__btn wk__btn--primary qz__next" onClick={onNext} data-qz-next="">
              {last ? "See the round" : "Next question"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function SourceLine({ q, onOpenSource }: { q: QuizQuestion; onOpenSource: (route: VaultRoute) => void }) {
  const route = q.source.route;
  return (
    <div className="qz__source">
      <span className="qz__source-label">{q.source.label}</span>
      {route && (
        <button type="button" className="wk__btn qz__read" onClick={() => onOpenSource(route)} data-qz-read="">
          <BookOpen size={16} aria-hidden="true" />
          Read it
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * An order question: tap the items in order
 * ------------------------------------------------------------------ */

function OrderPlay({
  q,
  given,
  onCheck,
}: {
  q: DealtQuestion;
  given: QuizAnswer | undefined;
  onCheck: (order: number[]) => void;
}) {
  const [placed, setPlaced] = useState<number[]>([]);
  const done = given !== undefined;
  const shown = done && Array.isArray(given.picked) ? given.picked : placed;
  const deal = q.deal ?? q.options.map((_, i) => i);
  const pool = deal.filter((i) => !shown.includes(i));
  const full = shown.length === q.options.length;

  return (
    <div className="qz__order">
      {!done && <p className="qz__hint">Tap them in order. Tap a placed one to send it back.</p>}
      <ol className="qz__placed" aria-label="Your order">
        {shown.length === 0 && <li className="qz__placed-empty">Your order goes here.</li>}
        {shown.map((item, k) => {
          const mark = done ? (item === k ? " qz__placed-row--right" : " qz__placed-row--missed") : "";
          return (
            <li key={item} className="qz__placed-slot">
              <button
                type="button"
                className={`qz__placed-row${mark}`}
                disabled={done}
                onClick={() => setPlaced((p) => p.filter((x) => x !== item))}
                data-qz-placed={item}
              >
                <span className="qz__placed-n" aria-hidden="true">
                  {k + 1}
                </span>
                <span className="qz__option-text">{q.options[item]}</span>
                {done && item === k && (
                  <>
                    <Check className="qz__option-mark" size={18} strokeWidth={2.75} aria-hidden="true" />
                    <span className="qz__sr">, in its place</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {!done && pool.length > 0 && (
        <ul className="qz__pool" aria-label="Still to place">
          {pool.map((item) => (
            <li key={item} className="qz__option-slot">
              <button
                type="button"
                className="qz__option qz__option--pool"
                onClick={() => setPlaced((p) => (p.includes(item) ? p : [...p, item]))}
                data-qz-pool={item}
              >
                <span className="qz__option-text">{q.options[item]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!done && (
        <div className="qz__actions">
          <button
            type="button"
            className="wk__btn wk__btn--primary"
            disabled={!full}
            onClick={() => onCheck(placed)}
            data-qz-check=""
          >
            Check the order
          </button>
          {placed.length > 0 && (
            <button type="button" className="wk__btn wk__btn--quiet" onClick={() => setPlaced([])}>
              <RotateCcw size={16} aria-hidden="true" /> Start over
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The end of a round
 * ------------------------------------------------------------------ */

function QuizEnd({
  round,
  answers,
  onAgain,
  onDecks,
  onExit,
  onOpenSource,
}: {
  round: DealtRound;
  answers: QuizAnswer[];
  onAgain: () => void;
  onDecks: () => void;
  onExit?: () => void;
  onOpenSource: (route: VaultRoute) => void;
}) {
  const summary = useMemo(() => roundSummary(round, answers), [round, answers]);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bringIntoView(endRef.current);
    headRef.current?.focus({ preventScroll: true });
  }, []);
  const deck = deckById(round.deck);

  return (
    <div ref={endRef} className="qz__end" style={deckStyle(round.deck)} data-qz-end="">
      <div className="qz__end-card">
        <p className="qz__end-deck">{deck.title}</p>
        <h2 ref={headRef} tabIndex={-1} className="qz__end-line">
          {roundLine(summary.right, summary.total)}
        </h2>
        <ol className="qz__end-pips" aria-hidden="true">
          {round.questions.map((q, i) => (
            <li key={q.id} className="qz__end-pip" style={{ "--qz-i": i } as CSSProperties} />
          ))}
        </ol>
        <div className="qz__actions qz__actions--end">
          <button type="button" className="wk__btn wk__btn--primary" onClick={onAgain} data-qz-again="">
            <RotateCcw size={16} aria-hidden="true" /> Play again
          </button>
          <button type="button" className="wk__btn" onClick={onDecks} data-qz-decks-again="">
            Another deck
          </button>
          {onExit && (
            <button type="button" className="wk__btn wk__btn--quiet" onClick={onExit}>
              Done
            </button>
          )}
        </div>
      </div>

      {summary.missed.length === 0 ? (
        <p className="wk__empty qz__end-clear">Nothing to read again this round.</p>
      ) : (
        <section className="qz__missed" aria-labelledby="qz-missed-title">
          <h3 id="qz-missed-title" className="qz__missed-title">
            Worth another look
          </h3>
          <ul className="qz__missed-list">
            {summary.missed.map((q) => (
              <li key={q.id} className="qz__missed-row">
                <p className="qz__missed-prompt">{q.prompt}</p>
                <p className="qz__missed-answer">
                  {q.kind === "order" ? q.options.join(" · ") : q.options[q.answer]}
                </p>
                <SourceLine q={q} onOpenSource={onOpenSource} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
