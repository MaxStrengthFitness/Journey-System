import { LoadingMark } from "../../../components/LoadingMark";
import { floorUnreadableFor, pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { ArticleBlocks, pageAccent, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { FloorStatus } from "../../learning-vault/ui/FloorStatus";
import { categoryNodeStyle, LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import { QuizMode } from "../../learning-vault/ui/QuizMode";
import { SubmissionQueue } from "../../learning-vault/ui/SubmissionQueue";
import { nodeById, termNodeId } from "../../learning-vault/graph";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import { CourseBar, failedRetry } from "./LessonPage";
import { courseContextOf } from "./drills";
import { CourseShell, FailedPage, GonePage, LoadingPage, PageHead, PeekFailed, ReadNext, sourceLine, useCourse, useVersionPlacement } from "./shell";
import "./course.css";

/**
 * THE REST OF THE COURSE'S PAGES (the Learning vault redesign, Oct 19 2026):
 * the quiz, head office's queue, a quick reference card (read whole: it is
 * already short), a clinical flag's connections, and every page as the peek
 * sheet draws it.
 */

/* ------------------------------------------------------------------ *
 * Play
 * ------------------------------------------------------------------ */

export function QuizPage({ route }: { route: Extract<VaultRoute, { kind: "quiz" }> }) {
  const { data, nav, peekAt } = useCourse();
  const course = courseContextOf(nav.stack, data);
  // The bank waits on the Academy's references; one that failed never comes.
  if (!data.quizBank && data.referenceFailed) return <FailedPage onRetry={data.retryReference} />;
  return (
    <CourseShell>
      {course && <CourseBar course={course} />}
      <div className="crs__quiz">
        <QuizMode bank={data.quizBank} initialDeck={route.deck} onOpenSource={peekAt} onExit={nav.canBack ? nav.back : undefined} />
      </div>
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * Head office
 * ------------------------------------------------------------------ */

export function QueuePage() {
  const { open } = useCourse();
  return (
    <CourseShell>
      <PageHead eyebrow="Head office" title="Waiting for review" />
      <div className="crs__queue-page">
        <SubmissionQueue onOpen={open} />
      </div>
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * A quick reference card: short already, so it reads whole
 * ------------------------------------------------------------------ */

export function ReferencePage({ route }: { route: VaultRoute }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") {
    const failed = failedRetry(route, data);
    return failed ? <FailedPage onRetry={failed.retry} /> : <LoadingPage />;
  }
  if (state === "gone") return <GonePage />;
  return <ReferenceBody key={state.target.key} page={state} />;
}

function ReferenceBody({ page }: { page: VaultPage }) {
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  return (
    <CourseShell actions={actions} accent={pageAccent(page)}>
      <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
        {page.draft && <p className="crs__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      </PageHead>
      {inPage}
      <div className="crs__whole">
        <ArticleBlocks
          target={page.target}
          sections={page.sections}
          annotate="inline"
          renderText={(t) => <LinkedText text={t} />}
          accent={pageAccent(page)}
        />
        {sourceLine(page) && <p className="crs__source">{sourceLine(page)}</p>}
      </div>
      <ReadNext related={page.related} />
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * A thing with no page of its own (a clinical flag): what it connects to
 * ------------------------------------------------------------------ */

export function ConnectionsPage({ route }: { route: Extract<VaultRoute, { kind: "map" }> }) {
  const { data, open } = useCourse();
  if (!data.graph) {
    if (data.referenceFailed) return <FailedPage onRetry={data.retryReference} />;
    return <LoadingPage label="Gathering what it connects to…" />;
  }
  const node = route.focus ? nodeById(data.graph, route.focus) : null;
  if (!node) return <GonePage />;
  return (
    <CourseShell>
      <PageHead eyebrow="What it connects to" title={node.label} />
      {/* Machines in their category's colours, as everywhere else in the Course. */}
      <LocalConstellation graph={data.graph} nodeId={node.id} onOpen={open} variant="pills" max={12} nodeStyle={categoryNodeStyle} />
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * A page in the peek
 * ------------------------------------------------------------------ */

/**
 * Any page, compact, for the peek sheet: its lede, then its lines (which
 * still take actions). A clinical flag has no page of its own: it peeks as
 * what it connects to, as its full page does. A wait that will not end (a
 * topic whose module failed, an Academy chunk that did not load, a studio's
 * own machine on a floor that cannot be read) says so, with Try again where
 * trying again can help, never a spinner forever.
 */
export function PeekBody({ route }: { route: VaultRoute }) {
  const { data, peekAt, studioName } = useCourse();
  if (route.kind === "map") {
    if (!data.graph) {
      if (data.referenceFailed) return <PeekFailed onRetry={data.retryReference} />;
      return (
        <div className="crs__peek-wait">
          <LoadingMark size="sm" label="Gathering what it connects to…" />
        </div>
      );
    }
    const node = route.focus ? nodeById(data.graph, route.focus) : null;
    if (!node) return <p className="crs__empty">This page has moved.</p>;
    return (
      <div className="crs__peek">
        <LocalConstellation graph={data.graph} nodeId={node.id} onOpen={peekAt} variant="pills" max={12} nodeStyle={categoryNodeStyle} />
      </div>
    );
  }
  const state = pageFor(route, data);
  if (state === "loading") {
    if (floorUnreadableFor(route, data)) return <PeekFailed words={`Can't read ${studioName}'s floor right now.`} />;
    const failed = failedRetry(route, data);
    if (failed) return <PeekFailed onRetry={failed.retry} />;
    return (
      <div className="crs__peek-wait">
        <LoadingMark size="sm" label="Opening…" />
      </div>
    );
  }
  if (state === "gone") return <p className="crs__empty">This page has moved.</p>;
  return (
    <PeekPage
      key={state.target.key}
      page={state}
      focus={route.kind === "cueing" ? (route.moment ?? null) : null}
      term={route.kind === "glossary" ? (route.term ?? null) : null}
    />
  );
}

/**
 * The peek of a page. One word of the glossary, or one moment of the
 * phrasebook, peeks as that word or that moment alone: the sheet is for the
 * thing the reader asked about, and "Open full page" is the door to the rest.
 * Drawn alone, a part has no "lines that changed" of its own to list (a mark
 * on another word is not a line that left the page), so those stay off.
 * The sheet's own header already names the word or the moment, so the part
 * draws neither its section title nor the word's label again (say it once;
 * judges' recheck, Oct 19 2026).
 *
 * A machine peeked (a substitute, a related machine) says the floor's status
 * first, as its page does: a stand-in that is out of service is no stand-in.
 */
function PeekPage({ page, focus, term }: { page: VaultPage; focus: number | null; term: string | null }) {
  const { data } = useCourse();
  const at = focus !== null ? page.sections.findIndex((s) => s.id === `moment-${focus}`) : -1;
  const word = term ? page.sections.flatMap((s) => s.blocks).find((b) => b.label === term) : undefined;
  const sections = word ? [{ id: "peek-word", title: "", blocks: [{ ...word, label: undefined }] }] : at >= 0 ? [page.sections[at]] : page.sections;
  const part = Boolean(word) || at >= 0;
  const glossary = page.route.kind === "glossary";
  const wordSkip = word && term ? termNodeId(term) : undefined;
  return (
    <div className="crs__peek">
      {page.route.kind === "machine" && <FloorStatus status={data.care?.[page.route.id]} variant="banner" />}
      {page.lede && !part && <p className="crs__peek-lede">{page.lede}</p>}
      {page.draft && <p className="crs__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      <ArticleBlocks
        target={page.target}
        sections={sections}
        annotate="inline"
        compact
        headingLevel={3}
        accent={pageAccent(page)}
        showOrphans={!part}
        hideSectionTitles={part}
        renderText={(t, b) => <LinkedText text={t} skip={wordSkip ?? (glossary && b.label ? termNodeId(b.label) : undefined)} />}
      />
    </div>
  );
}
