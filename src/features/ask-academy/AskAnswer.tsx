import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, GraduationCap } from "lucide-react";
import type { LearningRef } from "../learning/ref";
import type { AskResult, ShownQuote } from "./ask";
import { askTheAcademy } from "./client";
import { repeatsQuote } from "./repeats-quote";
import { refForAcademyPage } from "./learning-ref";
import "./ask.css";

/**
 * ASK THE ACADEMY — the Ask row in Learning's search, and the answer page.
 *
 * Round: Ask the Academy, phase 2 (Oct 18 2026; AJ "1a 2a 3a" on the plan
 * page). The row shows once two or more words are typed (1a) and asks
 * nothing until it is tapped: a question costs about 5 cents. The answer is
 * Claude's short line over the Academy's own words, each quote naming its
 * page; a tap opens that page scrolled to the quote, highlighted (2a, done by
 * LearningView). A health answer's clearance line comes first, in the plum
 * Learning uses for a clinical caution. "This answer is wrong" (3a) arrives
 * with head office's list in phase 3, since it has nowhere to go before then.
 *
 * Replaces the search results while it is open, as search replaces the page
 * (WikiSearch says why: no overlay). Back returns to the search with the
 * question still typed. Nothing is typed here, so nothing registers with the
 * unsaved-changes gate.
 */

/** Two or more words: when the Ask row shows (AJ's 1a). */
export { repeatsQuote };

export function asksWorthOffering(query: string): boolean {
  return query.trim().split(/\s+/).filter(Boolean).length >= 2;
}

export function AskRow({ query, onAsk }: { query: string; onAsk: () => void }) {
  if (!asksWorthOffering(query)) return null;
  return (
    <button type="button" className="aa__row" onClick={onAsk}>
      <GraduationCap size={18} className="aa__row-icon" aria-hidden />
      <span className="aa__row-main">
        <span className="aa__row-title">
          Ask the Academy <span className="aa__row-q">“{query.trim()}”</span>
        </span>
        <span className="aa__row-meta">Answered in the Academy's own words · takes a few seconds</span>
      </span>
      <ChevronRight size={18} className="aa__row-go" aria-hidden />
    </button>
  );
}

const CLEARANCE = /medical(ly)? clear|clearance|physician|doctor|physical therap|contraindicat/i;

export interface AskAnswerProps {
  question: string;
  onBack: () => void;
  /** Open a quote's page; LearningView scrolls to the quote and highlights it. */
  onOpenQuote: (ref: LearningRef, quote: string) => void;
}

type State = { phase: "asking" } | { phase: "done"; result: AskResult } | { phase: "failed"; error: string };

export function AskAnswer({ question, onBack, onOpenQuote }: AskAnswerProps) {
  const [state, setState] = useState<State>({ phase: "asking" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ phase: "asking" });
    askTheAcademy(question, ctrl.signal)
      .then((reply) => {
        if (ctrl.signal.aborted) return;
        setState(reply.result ? { phase: "done", result: reply.result } : { phase: "failed", error: reply.error });
      })
      .catch(() => {
        /* Aborted: the trainer went back. */
      });
    return () => ctrl.abort();
  }, [question, attempt]);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const open = useCallback(
    (q: ShownQuote) => {
      const ref = refForAcademyPage(q.pageId, q.title);
      if (ref) onOpenQuote(ref, q.text);
    },
    [onOpenQuote],
  );

  return (
    <div className="wk__search aa">
      <div className="wk__search-bar">
        <button type="button" className="wk__up" onClick={onBack} aria-label="Back to search">
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="aa__bar-label">Ask the Academy</span>
      </div>
      <div className="wk__search-results aa__body">
        <h2 className="aa__question" tabIndex={-1} ref={heading}>
          {question}
        </h2>

        {state.phase === "asking" && (
          <p className="aa__status" role="status">
            Reading the Academy…
          </p>
        )}

        {state.phase === "failed" && (
          <div className="aa__note" role="alert">
            <p>{state.error}</p>
            <button type="button" className="aa__retry" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {state.phase === "done" && state.result.kind === "not_covered" && (
          <p className="aa__note">The Academy doesn't cover this yet.</p>
        )}

        {state.phase === "done" && state.result.kind === "conflicting" && (
          <p className="aa__note">The Academy's pages disagree on this. Head office decides.</p>
        )}

        {state.phase === "done" && state.result.kind === "no_answer" && (
          <p className="aa__note">The Academy couldn't give an answer it can stand behind. Try asking it another way.</p>
        )}

        {state.phase === "done" && state.result.kind === "answered" && (
          <>
            <ol className="aa__points">
              {state.result.points.map((p, i) => {
                const caution = state.result.kind === "answered" && state.result.health && i === 0 && p.quotes.some((q) => CLEARANCE.test(q.text));
                return (
                  <li key={i} className={caution ? "aa__point aa__point--caution" : "aa__point"}>
                    {caution && <span className="aa__caution-tag">Clearance first</span>}
                    {!repeatsQuote(p.says, p.quotes) && <p className="aa__says">{p.says}</p>}
                    {p.quotes.map((q, j) => (
                      <blockquote key={j} className="aa__quote">
                        <p className="aa__words">{q.text}</p>
                        <button type="button" className="aa__page" onClick={() => open(q)}>
                          {q.page}
                          <ChevronRight size={14} aria-hidden />
                        </button>
                      </blockquote>
                    ))}
                  </li>
                );
              })}
            </ol>
            <p className="aa__foot">Every quote is the Academy's own words. Tap a page to read it in full.</p>
          </>
        )}
      </div>
    </div>
  );
}
