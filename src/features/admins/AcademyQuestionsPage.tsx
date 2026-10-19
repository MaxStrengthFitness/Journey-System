/**
 * STANDARD → ACADEMY QUESTIONS — what Ask the Academy couldn't answer, and the
 * answers trainers flagged wrong (phase 3, Oct 19 2026).
 *
 * AJ's 3a (Oct 16): questions the Academy can't answer "are kept for
 * administrators on Admins → Standard": the question, the studio and the day,
 * never who asked. His 3a on the phase 3 plan: each row is marked Needs an
 * Academy page, Studio's call, or Done. The same question asked again is one
 * row, with how often and where; a flagged answer stands alone, with exactly
 * what the trainer saw and their reason.
 *
 * Two reads, both on the (mark, at) index: the unmarked entries and the ones
 * marked Needs an Academy page (the Academy's to-write list). Studio's call
 * and Done leave the page. A failed read says so, never "nothing here".
 */
import { useCallback, useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { Studio } from "../../types";
import { AdminHeader, AdminScreen } from "../admin/primitives";
import {
  groupQuestions,
  markEntries,
  MARK_LABEL,
  readEntries,
  type HeadOfficeMark,
  type QuestionGroup,
} from "../ask-academy/head-office";
import "./admins.css";

type Read = { state: "loading" } | { state: "failed" } | { state: "ok"; open: QuestionGroup[]; page: QuestionGroup[] };

const REASON: Record<QuestionGroup["reason"], string> = {
  not_covered: "Not in the Academy",
  conflicting: "The pages disagree",
  flagged: "Answer flagged wrong",
};

function asked(n: number): string {
  return n === 1 ? "Asked once" : n === 2 ? "Asked twice" : `Asked ${n} times`;
}

export function AcademyQuestionsPage({
  studios,
  onChanged,
}: {
  studios: Pick<Studio, "id" | "name">[];
  /** A row was marked: the sidebar's count and Home read again. */
  onChanged?: () => void;
}) {
  const [read, setRead] = useState<Read>({ state: "loading" });
  const [seq, setSeq] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRead({ state: "loading" });
    Promise.all([readEntries("open"), readEntries("page")]).then(
      ([open, page]) => live && setRead({ state: "ok", open: groupQuestions(open), page: groupQuestions(page) }),
      () => live && setRead({ state: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [seq]);

  const studioName = useCallback((id: string) => studios.find((s) => s.id === id)?.name ?? "a studio", [studios]);

  const mark = async (g: QuestionGroup, to: Exclude<HeadOfficeMark, "open">) => {
    setBusy(g.key);
    setError("");
    try {
      await markEntries(g.ids, to);
      setSeq((n) => n + 1);
      onChanged?.();
    } catch {
      setError("That mark didn't save. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const row = (g: QuestionGroup, marks: Exclude<HeadOfficeMark, "open">[]) => (
    <li key={g.key} className="hq-aq__row">
      <span className={g.reason === "flagged" ? "hq-aq__reason hq-aq__reason--flag" : "hq-aq__reason"}>{REASON[g.reason]}</span>
      <p className="hq-aq__q">{g.question}</p>
      {g.why ? <p className="hq-aq__why">“{g.why}”</p> : null}
      {g.answer ? (
        <details className="hq-aq__answer">
          <summary>The answer the trainer saw</summary>
          <p>{g.answer}</p>
        </details>
      ) : null}
      <p className="hq-aq__meta">
        {g.reason === "flagged" ? "" : `${asked(g.ids.length)} · `}
        {g.studioIds.map(studioName).join(", ")} · last {g.lastDay}
      </p>
      <div className="hq-aq__marks">
        {marks.map((m) => (
          <button key={m} type="button" className="hq-chip" disabled={busy === g.key} onClick={() => void mark(g, m)}>
            {MARK_LABEL[m]}
          </button>
        ))}
      </div>
    </li>
  );

  return (
    <AdminScreen>
      <AdminHeader
        icon={<MessageCircleQuestion className="w-5 h-5" />}
        title="Academy questions"
        subtitle="What Ask the Academy couldn't answer, and answers trainers flagged wrong. Never who asked."
      />
      {error ? (
        <p className="hq-aq__error" role="alert">
          {error}
        </p>
      ) : null}
      {read.state === "loading" && <p className="hq-aq__quiet">Reading the list…</p>}
      {read.state === "failed" && (
        <p className="hq-aq__error" role="alert">
          The list couldn't be read, so it isn't known what's waiting.{" "}
          <button type="button" className="hq-chip" onClick={() => setSeq((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {read.state === "ok" && (
        <>
          <section className="hq-aq__section">
            <h2 className="hq-aq__head">Waiting for a mark · {read.open.length}</h2>
            {read.open.length === 0 ? (
              <p className="hq-aq__quiet">All clear.</p>
            ) : (
              <ul className="hq-aq__list">{read.open.map((g) => row(g, ["page", "studio", "done"]))}</ul>
            )}
          </section>
          {read.page.length > 0 && (
            <section className="hq-aq__section">
              <h2 className="hq-aq__head">Needs an Academy page · {read.page.length}</h2>
              <ul className="hq-aq__list">{read.page.map((g) => row(g, ["done"]))}</ul>
            </section>
          )}
        </>
      )}
    </AdminScreen>
  );
}
