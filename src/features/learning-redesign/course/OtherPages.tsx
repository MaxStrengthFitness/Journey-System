import { LoadingMark } from "../../../components/LoadingMark";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { ArticleBlocks, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import { QuizMode } from "../../learning-vault/ui/QuizMode";
import { SubmissionQueue } from "../../learning-vault/ui/SubmissionQueue";
import { nodeById } from "../../learning-vault/graph";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import { CourseBar } from "./LessonPage";
import { courseContextOf } from "./drills";
import { CourseShell, GonePage, LoadingPage, PageHead, ReadNext, useCourse, useVersionPlacement } from "./shell";
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
  if (state === "loading") return <LoadingPage />;
  if (state === "gone") return <GonePage />;
  return <ReferenceBody key={state.target.key} page={state} />;
}

function ReferenceBody({ page }: { page: VaultPage }) {
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  return (
    <CourseShell actions={actions}>
      <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
        {page.draft && <p className="crs__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      </PageHead>
      {inPage}
      <div className="crs__whole">
        <ArticleBlocks target={page.target} sections={page.sections} annotate="inline" renderText={(t) => <LinkedText text={t} />} />
        {page.source && <p className="crs__source">{page.source}</p>}
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
  if (!data.graph) return <LoadingPage label="Gathering what it connects to…" />;
  const node = route.focus ? nodeById(data.graph, route.focus) : null;
  if (!node) return <GonePage />;
  return (
    <CourseShell>
      <PageHead eyebrow="What it connects to" title={node.label} />
      <LocalConstellation graph={data.graph} nodeId={node.id} onOpen={open} variant="pills" max={12} />
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * A page in the peek
 * ------------------------------------------------------------------ */

/** Any page, compact, for the peek sheet: its lede, then its lines (which still take actions). */
export function PeekBody({ route }: { route: VaultRoute }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") {
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

function PeekPage({ page, focus, term }: { page: VaultPage; focus: number | null; term: string | null }) {
  // A cue moment peeks with that moment first: the rest of the phrasebook
  // follows (the page whole, so the studio's marks on its other moments are
  // never mistaken for lines that left the page).
  const at = focus !== null ? page.sections.findIndex((s) => s.id === `moment-${focus}`) : -1;
  let sections = at > 0 ? [page.sections[at], ...page.sections.filter((_, i) => i !== at)] : page.sections;
  // A glossary word peeks with its own line first, the rest of the glossary after it.
  const word = term ? page.sections.flatMap((s) => s.blocks).find((b) => b.label === term) : undefined;
  if (word) {
    sections = [
      { id: "peek-word", title: "", blocks: [word] },
      ...page.sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b !== word) })).filter((s) => s.blocks.length > 0),
    ];
  }
  return (
    <div className="crs__peek">
      {page.lede && at < 0 && !word && <p className="crs__peek-lede">{page.lede}</p>}
      {page.draft && <p className="crs__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      <ArticleBlocks
        target={page.target}
        sections={sections}
        annotate="inline"
        compact
        headingLevel={3}
        renderText={(t) => <LinkedText text={t} />}
      />
    </div>
  );
}
