import { useMemo, useState } from "react";
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, Layers, RotateCcw } from "lucide-react";
import { ArticleBlocks, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { pageFor } from "../../learning-vault/pages";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import { CheckYourself } from "./CheckYourself";
import { OrderDrillCard } from "./CueDrill";
import { StepDeck } from "./StepDeck";
import { checkQuestions, lessonContextOf, orderDrillOf, sameLesson, type CourseContext } from "./drills";
import { CourseShell, FailedPage, GonePage, LoadingPage, PageHead, ReadNext, useCourse, useVersionPlacement, type LessonMode } from "./shell";
import { chunkSteps } from "./steps";
import "./course.css";

/**
 * A LESSON — an Academy topic, a playbook, a deep dive or a spoken script,
 * as step cards (the Interactive Course, the Learning vault redesign, Oct 19
 * 2026).
 *
 * Cards first: the page cut into short cards (steps.ts), one at a time, the
 * last offering Check yourself (up to three of the quiz's questions whose
 * source is this page) and the next lesson when the reader came in through a
 * course. "Read it all" is the same page whole, through ArticleBlocks, where
 * a line is tapped to cross it out for the studio, note it, tell head office
 * or ask in Teams. The reader's choice holds for every lesson until they
 * change it (CourseLearning keeps it; nothing is stored).
 */
export function LessonPage({ route }: { route: VaultRoute }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") {
    const moduleId = route.kind === "topic" ? route.moduleId : null;
    if (moduleId && data.moduleFailed(moduleId)) {
      return <FailedPage onRetry={data.retryModule ? () => data.retryModule?.(moduleId) : undefined} />;
    }
    return <LoadingPage label="Opening the lesson…" />;
  }
  if (state === "gone") return <GonePage />;
  return <LessonBody key={state.target.key} page={state} />;
}

function LessonBody({ page }: { page: VaultPage }) {
  const { data, nav, lessonMode, setLessonMode } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  const cards = useMemo(() => chunkSteps(page.sections), [page.sections]);
  const questions = useMemo(() => checkQuestions(data.quizBank, page.route), [data.quizBank, page.route]);
  const course = lessonContextOf(nav.stack, data);
  const [at, setAt] = useState(0);

  const packages = page.route.kind === "playbook" && page.route.id === "packages" ? orderDrillOf(page, "money") : null;
  const minutes = page.facts.find((f) => f.label === "Read")?.value;

  const next = course && course.at < course.lessons.length - 1 ? course.lessons[course.at + 1] : null;
  // Questions get a card of their own; without them, the last card's Next
  // goes straight on to the next lesson.
  const end = questions.length > 0 ? <LessonEnd questions={questions} course={course} onAgain={() => setAt(0)} /> : undefined;

  return (
    <CourseShell actions={actions}>
      <div className="crs__lesson-layout">
        <div className="crs__lesson-main">
          {course && <CourseBar course={course} />}
          <PageHead eyebrow={course && course.title === page.eyebrow ? undefined : page.eyebrow} title={page.title} lede={page.lede} />
          {inPage}

          {packages && (
            <OrderDrillCard
              drill={packages}
              marked={applied.sections}
              studioLens={applied.studioLens}
              title="Practice it"
              draftLine={PLAYBOOK_DRAFT_LINE}
            />
          )}

          <div className="crs__lesson-bar">
            <ModeSwitch mode={lessonMode} onMode={setLessonMode} />
            {(minutes || page.draft) && (
              <p className="crs__lesson-note">
                {[minutes, page.draft ? PLAYBOOK_DRAFT_LINE : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {lessonMode === "cards" ? (
            <StepDeck
              sections={page.sections}
              marked={applied.sections}
              studioLens={applied.studioLens}
              cards={cards}
              at={at}
              onAt={setAt}
              end={end}
              endLabel="Check yourself"
              onFinish={next ? () => nav.replace(next.route) : undefined}
              finishLabel="Next lesson"
              label={page.title}
              last={
                <div className="crs__again">
                  {next && <p className="crs__again-next">Next: {next.title}</p>}
                  <button type="button" className="crs__btn" onClick={() => setAt(0)}>
                    <RotateCcw size={16} aria-hidden />
                    From the start
                  </button>
                  <button type="button" className="crs__btn" onClick={() => setLessonMode("all")}>
                    <BookOpenText size={16} aria-hidden />
                    Read it all
                  </button>
                </div>
              }
            />
          ) : (
            <div className="crs__whole">
              <ArticleBlocks
                target={page.target}
                sections={page.sections}
                annotate="inline"
                renderText={(t) => <LinkedText text={t} />}
              />
              {page.source && <p className="crs__source">{page.source}</p>}
            </div>
          )}

          <ReadNext related={course ? page.related.filter((r) => !course.lessons.some((l) => sameLesson(l.route, r.route))) : page.related} />
        </div>
        {course && <CourseRail course={course} />}
      </div>
    </CourseShell>
  );
}

/** Cards, or the whole page: one switch, 44px, the same for every lesson. */
export function ModeSwitch({
  mode,
  onMode,
  cardsLabel = "Cards",
}: {
  mode: LessonMode;
  onMode: (m: LessonMode) => void;
  cardsLabel?: string;
}) {
  return (
    <div className="crs__mode" role="group" aria-label="How to read it">
      <button type="button" className="crs__mode-btn" aria-pressed={mode === "cards"} onClick={() => onMode("cards")}>
        <Layers size={16} aria-hidden />
        {cardsLabel}
      </button>
      <button type="button" className="crs__mode-btn" aria-pressed={mode === "all"} onClick={() => onMode("all")}>
        <BookOpenText size={16} aria-hidden />
        Read it all
      </button>
    </div>
  );
}

/**
 * Where this lesson sits in its course: the course's name (back to it), and
 * the lessons either side. A position, never progress: nothing is kept.
 */
export function CourseBar({ course }: { course: CourseContext }) {
  const { nav } = useCourse();
  const prev = course.at > 0 ? course.lessons[course.at - 1] : null;
  const next = course.at < course.lessons.length - 1 ? course.lessons[course.at + 1] : null;
  return (
    <nav className="crs__coursebar" aria-label="In this course">
      <button type="button" className="crs__coursebar-name" onClick={() => nav.push(course.course)}>
        <span className="crs__coursebar-title">{course.title}</span>
        <span className="crs__coursebar-at">
          Lesson {course.at + 1} of {course.lessons.length}
        </span>
      </button>
      <div className="crs__coursebar-steps">
        <button
          type="button"
          className="crs__btn crs__btn--icon"
          disabled={!prev}
          aria-label={prev ? `Lesson before: ${prev.title}` : "No lesson before this one"}
          onClick={() => prev && nav.replace(prev.route)}
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button
          type="button"
          className="crs__btn crs__btn--icon"
          disabled={!next}
          aria-label={next ? `Next lesson: ${next.title}` : "This is the last lesson"}
          onClick={() => next && nav.replace(next.route)}
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    </nav>
  );
}

/**
 * The course beside the lesson, on a wide screen: every lesson, this one
 * marked. Where you are, never how far you got (nothing is kept).
 */
function CourseRail({ course }: { course: CourseContext }) {
  const { nav } = useCourse();
  return (
    <nav className="crs__rail" aria-label={`${course.title}: its lessons`}>
      <button type="button" className="crs__rail-title" onClick={() => nav.push(course.course)}>
        {course.title}
      </button>
      <ol className="crs__rail-list">
        {course.lessons.map((l, i) => (
          <li key={`${i}-${l.title}`}>
            <button
              type="button"
              className="crs__rail-row"
              aria-current={i === course.at ? "page" : undefined}
              onClick={() => i !== course.at && nav.replace(l.route)}
            >
              <span className="crs__rail-n" aria-hidden>
                {i + 1}
              </span>
              <span className="crs__rail-words">{l.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The last card: Check yourself, then the next lesson (or back to the course). */
function LessonEnd({
  questions,
  course,
  onAgain,
}: {
  questions: ReturnType<typeof checkQuestions>;
  course: CourseContext | null;
  onAgain: () => void;
}) {
  const { nav } = useCourse();
  const next = course && course.at < course.lessons.length - 1 ? course.lessons[course.at + 1] : null;
  return (
    <div className="crs__end">
      {questions.length > 0 && <CheckYourself questions={questions} />}
      <div className="crs__end-doors">
        {next ? (
          <button type="button" className="crs__btn crs__btn--primary crs__end-next" onClick={() => nav.replace(next.route)}>
            <span className="crs__end-next-words">
              <span className="crs__end-next-kicker">Next lesson</span>
              <span className="crs__end-next-title">{next.title}</span>
            </span>
            <ArrowRight size={20} aria-hidden />
          </button>
        ) : course ? (
          <button type="button" className="crs__btn crs__btn--primary" onClick={() => nav.push(course.course)}>
            Back to {course.title}
          </button>
        ) : null}
        <button type="button" className="crs__btn" onClick={onAgain}>
          <RotateCcw size={16} aria-hidden />
          From the start
        </button>
      </div>
    </div>
  );
}
