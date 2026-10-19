import { useState } from "react";
import { Check } from "lucide-react";
import { checkAnswer } from "../../learning-vault/quiz/round";
import type { QuizQuestion } from "../../learning-vault/types";
import "./course.css";

/**
 * CHECK YOURSELF — up to three questions at the end of a lesson (the
 * Interactive Course, the Learning vault redesign, Oct 19 2026).
 *
 * The quiz's questions whose source is this page (drills.ts checkQuestions),
 * answered in place. The quiz's rules hold here too (decision 6 of the
 * round): nothing kept, nothing counted, no timer. The right answer turns
 * green; a wrong pick gets a quiet mark and "Your answer", never crimson;
 * the why comes straight after, in the source's words.
 */
export function CheckYourself({ questions }: { questions: QuizQuestion[] }) {
  return (
    <div className="crs__check">
      <h3 className="crs__check-title">Check yourself</h3>
      <ol className="crs__check-list">
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
    <div className="crs__q" data-answered={answered ? "" : undefined}>
      <p className="crs__q-prompt">
        <span className="crs__q-n" aria-hidden>
          {n}
        </span>
        <span>{q.prompt}</span>
      </p>
      <div className="crs__q-options" role="group" aria-label={`Question ${n}`}>
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          const state = !answered ? undefined : isAnswer ? "right" : isPicked ? "picked" : "rest";
          return (
            <button
              key={`${i}-${opt}`}
              type="button"
              className="crs__q-opt"
              data-state={state}
              aria-pressed={isPicked}
              disabled={answered}
              onClick={() => setPicked(i)}
            >
              <span className="crs__q-opt-words">{opt}</span>
              {state === "right" && <Check size={18} aria-hidden className="crs__q-tick" />}
              {state === "picked" && <span className="crs__q-yours">Your answer</span>}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="crs__q-why" role="status">
          <p className="crs__q-verdict" data-right={right ? "" : undefined}>
            {right ? "Right." : `Not quite. It’s “${q.options[q.answer] ?? ""}”.`}
          </p>
          <p className="crs__q-explain">{q.explain}</p>
          <p className="crs__q-source">{q.source.label}</p>
        </div>
      )}
    </div>
  );
}
