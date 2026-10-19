import { useMemo, useState } from "react";
import { BookOpenText, Layers, RotateCcw } from "lucide-react";
import { ArticleBlocks, pageAccent, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { pageFor } from "../../learning-vault/pages";
import { moduleOfTopic } from "../../learning-vault/routes";
import { useWikiPageGuard } from "../../wiki/page-guard";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import type { VaultData } from "../../learning-vault/useVaultData";
import { CheckYourself } from "./CheckYourself";
import { OrderDrillCard } from "./CueDrill";
import { StepDeck } from "./StepDeck";
import { checkQuestions, lessonContextOf, orderDrillOf, sameLesson, type CourseContext } from "./drills";
import {
  CourseShell,
  FailedPage,
  GonePage,
  LoadingPage,
  NextLessonButton,
  PageHead,
  ReadNext,
  sourceLine,
  useCourse,
  useVersionPlacement,
  type LessonMode,
} from "./shell";
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
 * or ask in Teams; it ends on the next lesson too. The reader's choice holds
 * for every lesson until they change it (CourseLearning keeps it; nothing is
 * stored).
 *
 * Where the lesson sits is said once, in the course bar over it ("Lesson 3 of
 * 10 · 4 min"), or the course's rail beside it on a wide screen; the bar has
 * no arrows of its own (the deck's Back and Next turn cards, the last card
 * and the foot of "Read it all" go on to the next lesson, the course's name
 * opens its list), so there is one pair of arrows on the screen and it turns
 * cards.
 */
export function LessonPage({ route }: { route: VaultRoute }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") {
    const failed = failedRetry(route, data);
    if (failed) return <FailedPage onRetry={failed.retry} />;
    return <LoadingPage label="Opening the lesson…" />;
  }
  if (state === "gone") return <GonePage />;
  return <LessonBody key={state.target.key} page={state} />;
}

/**
 * A page still "loading" whose chunk will not come: a topic whose module
 * failed (its module read from the topic itself, so a stale module id on the
 * route cannot hide the failure), or an Academy reference that failed (a
 * deep dive, a script, a quick card). Null while it is really on its way.
 */
export function failedRetry(route: VaultRoute, data: VaultData): { retry?: () => void } | null {
  if (route.kind === "topic") {
    const moduleId = moduleOfTopic(route.topicId) ?? route.moduleId ?? null;
    if (moduleId && data.moduleFailed(moduleId)) {
      return { retry: data.retryModule ? () => data.retryModule?.(moduleId) : undefined };
    }
    return null;
  }
  if (data.referenceFailed) return { retry: data.retryReference };
  return null;
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
  const source = sourceLine(page);

  const next = course && course.at < course.lessons.length - 1 ? course.lessons[course.at + 1] : null;
  // Questions get a card of their own; without them, the last card's Next
  // goes straight on to the next lesson.
  const end = questions.length > 0 ? <LessonEnd questions={questions} course={course} onAgain={() => setAt(0)} /> : undefined;
  // The read time rides the course bar when there is one; the draft line is
  // said once, here (never again on the drill above it).
  const note = [course ? null : minutes, page.draft ? PLAYBOOK_DRAFT_LINE : null].filter(Boolean).join(" · ");

  return (
    <CourseShell actions={actions} accent={pageAccent(page)}>
      <div className="crs__lesson-layout">
        <div className="crs__lesson-main">
          {course && <CourseBar course={course} minutes={minutes} />}
          <PageHead eyebrow={course && course.title === page.eyebrow ? undefined : page.eyebrow} title={page.title} lede={page.lede} />
          {inPage}

          {packages && <OrderDrillCard drill={packages} marked={applied.sections} studioLens={applied.studioLens} title="Practice it" />}

          <div className="crs__lesson-bar">
            <ModeSwitch mode={lessonMode} onMode={setLessonMode} />
            {note && <p className="crs__lesson-note">{note}</p>}
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
                accent={pageAccent(page)}
              />
              {source && <p className="crs__source">{source}</p>}
              {next && (
                <div className="crs__whole-next">
                  <NextLessonButton title={next.title} onGo={() => nav.replace(next.route)} />
                </div>
              )}
            </div>
          )}

          <ReadNext related={course ? page.related.filter((r) => !course.lessons.some((l) => sameLesson(l.route, r.route))) : page.related} />
        </div>
        {course && <CourseRail course={course} minutes={minutes} />}
      </div>
    </CourseShell>
  );
}

/**
 * Cards, or the whole page: one switch, 44px, the same for every lesson.
 *
 * "Read it all" is the only mode that draws ArticleBlocks, so it is where a
 * half-written reason, note, question or message to head office lives.
 * Switching away unmounts it, so the switch asks the page first (the same
 * guard as the manual's tier switch) and changes the mode only inside the
 * answer. With nothing typed the guard passes straight through.
 */
export function ModeSwitch({
  mode,
  onMode,
  cardsLabel = "Cards",
}: {
  mode: LessonMode;
  onMode: (m: LessonMode) => void;
  cardsLabel?: string;
}) {
  const guard = useWikiPageGuard();
  const pick = (next: LessonMode) => {
    if (next === mode) return;
    guard(() => onMode(next));
  };
  return (
    <div className="crs__mode" role="group" aria-label="How to read it">
      <button type="button" className="crs__mode-btn" aria-pressed={mode === "cards"} onClick={() => pick("cards")}>
        <Layers size={16} aria-hidden />
        {cardsLabel}
      </button>
      <button type="button" className="crs__mode-btn" aria-pressed={mode === "all"} onClick={() => pick("all")}>
        <BookOpenText size={16} aria-hidden />
        Read it all
      </button>
    </div>
  );
}

/**
 * Where this lesson sits in its course: the course's name (back to its list),
 * the lesson's place and, for a reading, its time. A position, never
 * progress: nothing is kept.
 */
export function CourseBar({ course, minutes }: { course: CourseContext; minutes?: string }) {
  const { nav } = useCourse();
  const place = [`Lesson ${course.at + 1} of ${course.lessons.length}`, minutes].filter(Boolean).join(" · ");
  return (
    <nav className="crs__coursebar" aria-label="In this course">
      <button type="button" className="crs__coursebar-name" onClick={() => nav.push(course.course)}>
        <span className="crs__coursebar-title">{course.title}</span>
        <span className="crs__coursebar-at">{place}</span>
      </button>
    </nav>
  );
}

/**
 * The course beside the lesson, on a wide screen: every lesson, this one
 * marked (with its read time, which the bar it replaces carried). Where you
 * are, never how far you got (nothing is kept).
 */
function CourseRail({ course, minutes }: { course: CourseContext; minutes?: string }) {
  const { nav } = useCourse();
  return (
    <nav className="crs__rail" aria-label={`${course.title}: its lessons`}>
      <button type="button" className="crs__rail-title" onClick={() => nav.push(course.course)}>
        {course.title}
      </button>
      <ol className="crs__rail-list">
        {course.lessons.map((l, i) => {
          const here = i === course.at;
          return (
            <li key={`${i}-${l.title}`}>
              <button
                type="button"
                className="crs__rail-row"
                aria-current={here ? "page" : undefined}
                onClick={() => !here && nav.replace(l.route)}
              >
                <span className="crs__rail-n" aria-hidden>
                  {i + 1}
                </span>
                <span className="crs__rail-words">
                  {l.title}
                  {here && minutes && <span className="crs__rail-min">{minutes}</span>}
                </span>
              </button>
            </li>
          );
        })}
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
          <NextLessonButton title={next.title} onGo={() => nav.replace(next.route)} />
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
