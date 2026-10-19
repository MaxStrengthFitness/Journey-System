import { useState } from "react";
import { Check } from "lucide-react";
import { checkAnswer } from "../quiz/round";
import type { QuizQuestion } from "../types";
import "../../wiki/wiki.css";
import "./lesson.css";

/**
 * CHECK YOURSELF — up to three questions at the end of a lesson. Lifted from
 * the Interactive Course into the shared parts (the Learning vault redesign,
 * Oct 19 2026: AJ picked the mix, the Codex as the base with the Course's
 * lesson cards). Draws with lesson.css (vtl__).
 *
 * The quiz's questions whose source is this page (lessons.ts
 * checkQuestions), answered in place. The quiz's rules hold here too
 * (decision 6 of the round): nothing kept, nothing counted, no timer. The
 * right answer turns green; a wrong pick gets a quiet mark and "Your
 * answer", never crimson; the why comes straight after, in the source's
 * words. Draws nothing with no questions.
 */
export function CheckYourself({ questions, title = "Check yourself" }: { questions: QuizQuestion[]; title?: string }) {
  if (questions.length === 0) return null;
  return (
    <div className="vtl__check">
      <h3 className="vtl__check-title">{title}</h3>
      <ol className="vtl__check-list">
        {questions.map((q, n) => (
          <li key={q.id}>
            <CheckQuestion q={q} n={n + 1} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function CheckQuestion({ q, n }: { q: QuizQuestion; n: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const right = answered && checkAnswer(q, picked);
  return (
    <div className="vtl__q" data-answered={answered ? "" : undefined}>
      <p className="vtl__q-prompt">
        <span className="vtl__q-n" aria-hidden>
          {n}
        </span>
        <span>{q.prompt}</span>
      </p>
      <div className="vtl__q-options" role="group" aria-label={`Question ${n}`}>
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          const state = !answered ? undefined : isAnswer ? "right" : isPicked ? "picked" : "rest";
          return (
            <button
              key={`${i}-${opt}`}
              type="button"
              className="vtl__q-opt"
              data-state={state}
              aria-pressed={isPicked}
              disabled={answered}
              onClick={() => setPicked(i)}
            >
              <span className="vtl__q-opt-words">{opt}</span>
              {state === "right" && <Check size={18} aria-hidden className="vtl__q-tick" />}
              {state === "picked" && <span className="vtl__q-yours">Your answer</span>}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="vtl__q-why" role="status">
          <p className="vtl__q-verdict" data-right={right ? "" : undefined}>
            {right ? "Right." : `Not quite. It’s “${q.options[q.answer] ?? ""}”.`}
          </p>
          <p className="vtl__q-explain">{q.explain}</p>
          <p className="vtl__q-source">{q.source.label}</p>
        </div>
      )}
    </div>
  );
}
