import { createContext, createElement, useContext, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, RotateCcw } from "lucide-react";
import { LoadingArea } from "../../../components/LoadingMark";
import { WikiShell, type WikiCrumb } from "../../wiki";
import { noteLine, whyLine } from "../../learning-vault/markup";
import { labelRuns } from "../../learning-vault/ui/line-actions";
import { PeekFrame, PeekSheet, type PeekStack } from "../../learning-vault/ui/PeekSheet";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { VersionToggle } from "../../learning-vault/ui/VersionToggle";
import type { VaultNav } from "../../learning-vault/useVaultNav";
import type { VaultData } from "../../learning-vault/useVaultData";
import type { MarkedBlock, VaultPage, VaultRoute } from "../../learning-vault/types";
import type { LearningViewId } from "../../learning/LearningView";
import "./course.css";

/**
 * THE COURSE'S FRAME — what every screen of the Interactive Course shares
 * (the Learning vault redesign, Oct 19 2026): the trail, the peek, the data,
 * and the few pieces every page draws the same way (a page's head, a line
 * with its studio marks read-only, "Read next", the loading and moved
 * states). CourseLearning.tsx provides it; each page draws inside
 * CourseShell, so Learning's masthead, its one scroller and the peek sheet
 * are the same on every page.
 */

export type LessonMode = "cards" | "all";

export interface CourseValue {
  data: VaultData;
  nav: VaultNav;
  peek: PeekStack;
  crumbs: WikiCrumb[];
  scrollKey: string;
  studioName: string;
  phone: boolean;
  /** Cards or the whole page, for every lesson until the reader changes it. */
  lessonMode: LessonMode;
  setLessonMode: (m: LessonMode) => void;
  /** The masthead's section (a door to a section's root moves the masthead). */
  section: LearningViewId;
  onSection: (id: LearningViewId) => void;
  /** Open a page in the trail. */
  open: (r: VaultRoute) => void;
  /** Open a page in the peek, keeping this one. */
  peekAt: (r: VaultRoute) => void;
  /** A course's lesson: the course under it in the trail, so Next lesson knows where it is. */
  openLesson: (course: VaultRoute, lesson: VaultRoute) => void;
  /** The page as the peek draws it (CourseLearning supplies it, so pages never import each other). */
  renderPeek: (r: VaultRoute) => ReactNode;
  titleOf: (r: VaultRoute) => string;
}

const CourseContext = createContext<CourseValue | null>(null);

export const CourseProvider = CourseContext.Provider;

export function useCourse(): CourseValue {
  const v = useContext(CourseContext);
  if (!v) throw new Error("useCourse needs the course's provider (CourseLearning).");
  return v;
}

/* ------------------------------------------------------------------ *
 * The shell
 * ------------------------------------------------------------------ */

/**
 * Learning's WikiShell (masthead, trail, one scroller), with the peek sheet
 * beside or under the page. `actions` is the sticky second row: the version
 * switch on an article. On a phone the switch goes in the page instead
 * (`toggleInPage`), where it has the room to wrap. `accent` is the page's
 * colour (a machine's category), which its spoken lines and cue bubbles take.
 */
export function CourseShell({ actions, accent, children }: { actions?: ReactNode; accent?: CSSProperties; children: ReactNode }) {
  const { crumbs, scrollKey, peek, titleOf, renderPeek, open } = useCourse();
  return (
    <WikiShell crumbs={crumbs} scrollKey={scrollKey} actions={actions} className="crs">
      <PeekFrame
        open={peek.stack.length > 0}
        peek={
          <PeekSheet
            stack={peek.stack}
            titleOf={titleOf}
            render={renderPeek}
            onBack={peek.back}
            onCrumb={peek.crumb}
            onClose={peek.close}
            onOpenFull={(r) => {
              peek.close();
              open(r);
            }}
            scope={peek.scope}
          />
        }
      >
        <div className="crs__page" style={accent}>
          {children}
        </div>
      </PeekFrame>
    </WikiShell>
  );
}

/** The version switch where it fits: the sticky row on an iPad, the page on a phone. */
export function useVersionPlacement(struck: number): { actions: ReactNode; inPage: ReactNode } {
  const { phone } = useCourse();
  const toggle = <VersionToggle struck={struck} />;
  return phone ? { actions: undefined, inPage: <div className="crs__version">{toggle}</div> } : { actions: toggle, inPage: null };
}

/* ------------------------------------------------------------------ *
 * A page's head
 * ------------------------------------------------------------------ */

export function PageHead({
  eyebrow,
  title,
  lede,
  meta,
  accent,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  lede?: string;
  meta?: ReactNode;
  accent?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <header className="crs__head" style={accent}>
      {eyebrow && <p className="crs__eyebrow">{eyebrow}</p>}
      <h1 className="crs__title">{title}</h1>
      {lede && <p className="crs__lede">{lede}</p>}
      {meta && <div className="crs__meta">{meta}</div>}
      {children}
    </header>
  );
}

/** A section's own head on a page: the title, and a door at its right when there is one. */
export function SectionHead({ title, id, door }: { title: string; id?: string; door?: ReactNode }) {
  return (
    <div className="crs__sec-head">
      <h2 className="crs__h2" id={id}>
        {title}
      </h2>
      {door}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A line, read-only, with this studio's marks
 * ------------------------------------------------------------------ */

/**
 * One line as a card or a drill shows it: the words (terms tappable), and in
 * the studio's version its marks laid on exactly as ArticleBlocks lays them
 * (the words struck, what the studio does instead, why, who and when; the
 * notes under it). Acting on a line is "Read it all"'s job.
 *
 * `showLabel` false draws the line's label for a screen reader only: a run of
 * lines that share a label ("Clinical warning" over six warnings) says it
 * once, over the first (runLabels, the same rule ArticleBlocks keeps). `skip`
 * is an entity the words must not link: a glossary word inside its own
 * definition is not a door to the card you are reading.
 *
 * `id` lets a page scroll to the line, and `target` marks it as the one a
 * tap sent the reader to (a dial's pin on the field manual's set-up list).
 */
export function MarkedLine({
  block,
  studioLens,
  showLabel = true,
  skip,
  id,
  target = false,
}: {
  block: MarkedBlock;
  studioLens: boolean;
  showLabel?: boolean;
  skip?: string;
  id?: string;
  target?: boolean;
}) {
  if (block.kind === "heading" || block.kind === "subheading") {
    return createElement(
      block.kind === "heading" ? "h3" : "h4",
      { className: `crs__line-head crs__line-head--${block.kind}`, id, "data-target": target ? "" : undefined },
      block.text,
    );
  }
  const strike = studioLens ? block.strike : undefined;
  const notes = studioLens ? block.notes : [];
  return (
    <div id={id} className={`crs__line crs__line--${block.kind}`} data-struck={strike ? "" : undefined} data-target={target ? "" : undefined}>
      {block.label &&
        (showLabel ? (
          <span className="crs__line-label">{block.label}</span>
        ) : (
          <span className="crs__sr">{block.label}: </span>
        ))}
      <span className="crs__line-text">{strike ? <s className="crs__struck">{block.text}</s> : <LinkedText text={block.text} skip={skip} />}</span>
      {strike?.replacement && <span className="crs__instead">{strike.replacement}</span>}
      {strike && <span className="crs__why">{whyLine(strike)}</span>}
      {notes.map((n) => (
        <span key={n.id} className="crs__note">
          <span className="crs__note-body">{n.body}</span>
          <span className="crs__note-by">{noteLine(n)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Which of a run of lines draw their label: once at the head of a run that
 * shares it, never a label that only repeats the section's title, a hidden
 * line skipped (line-actions' labelRuns, so cards and pages agree).
 */
export function runLabels(blocks: readonly MarkedBlock[], sectionTitle?: string): boolean[] {
  return labelRuns(
    blocks.map((b) => ({ kind: b.kind, label: b.label, shown: !b.hidden })),
    sectionTitle,
  );
}

/**
 * How a scroll the page starts itself moves: smoothly, unless the reader
 * asked for less motion (then it jumps, as the house's motion rule says).
 */
export function scrollMotion(): ScrollBehavior {
  try {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    return reduce ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/** "1 line hidden" (crossed out, and the reader chose to hide those). */
export function hiddenWords(n: number): string {
  return n === 1 ? "1 crossed-out line hidden" : `${n} crossed-out lines hidden`;
}

/* ------------------------------------------------------------------ *
 * Doors at the foot of a page
 * ------------------------------------------------------------------ */

/** "Next lesson" with the lesson's name: a lesson's end card, the foot of "Read it all", and the course's other pages. */
export function NextLessonButton({ title, onGo }: { title: string; onGo: () => void }) {
  return (
    <button type="button" className="crs__btn crs__btn--primary crs__end-next" onClick={onGo}>
      <span className="crs__end-next-words">
        <span className="crs__end-next-kicker">Next lesson</span>
        <span className="crs__end-next-title">{title}</span>
      </span>
      <ArrowRight size={20} aria-hidden />
    </button>
  );
}

/**
 * The way on from a course's page that is not a reading (a machine, the
 * glossary vault, the phrasebook): the course bar over them has no arrows,
 * so the foot of the page goes on to the next lesson, replacing this one
 * under the course (judges' recheck, Oct 19 2026). Nothing on the last
 * lesson: a course's last step is its own end (the quiz, in every track).
 */
export function CourseNext({ course }: { course: { lessons: { title: string; route: VaultRoute }[]; at: number } | null }) {
  const { nav } = useCourse();
  if (!course || course.at < 0 || course.at >= course.lessons.length - 1) return null;
  const next = course.lessons[course.at + 1];
  return (
    <div className="crs__course-next">
      <NextLessonButton title={next.title} onGo={() => nav.replace(next.route)} />
    </div>
  );
}

/**
 * Where a page's words come from, the way a trainer would say it, or null.
 * A repository path ("docs/msf-academy/…txt") is never shown: a topic's
 * lines carry the calm label ("Academy 4.6 Turnaround Technique"), which the
 * foot then says; any other path says nothing (the Vault's rule).
 */
export function sourceLine(page: Pick<VaultPage, "source" | "route" | "sections">): string | null {
  const source = page.source?.trim();
  if (!source) return null;
  if (!source.startsWith("docs/")) return source;
  if (page.route.kind !== "topic") return null;
  for (const s of page.sections) {
    for (const b of s.blocks) {
      const said = b.source?.trim();
      if (said && !said.startsWith("docs/")) return said;
    }
  }
  return null;
}

/** The page's related pages, each a link card that peeks (you keep your place). */
export function ReadNext({ related, title = "Read next" }: { related: VaultPage["related"]; title?: string }) {
  const { peekAt } = useCourse();
  if (related.length === 0) return null;
  return (
    <section className="crs__sec" aria-label={title}>
      <SectionHead title={title} />
      <ul className="crs__links">
        {related.map((r, i) => (
          <li key={`${i}-${r.title}`}>
            <button type="button" className="crs__link" onClick={() => peekAt(r.route)}>
              <span className="crs__link-words">
                <span className="crs__link-title">{r.title}</span>
                <span className="crs__link-why">{r.why}</span>
              </span>
              <ArrowUpRight size={18} aria-hidden className="crs__link-go" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Waiting, failing, moved
 * ------------------------------------------------------------------ */

export function LoadingPage({ label = "Opening the page…" }: { label?: string }) {
  return (
    <CourseShell>
      <LoadingArea label={label} />
    </CourseShell>
  );
}

export function FailedPage({ onRetry }: { onRetry?: () => void }) {
  return (
    <CourseShell>
      <div className="crs__state">
        <p className="crs__state-title">This part of the Academy didn't load.</p>
        <p className="crs__state-words">The connection may have dropped. Nothing is lost.</p>
        {onRetry && (
          <button type="button" className="crs__btn crs__btn--primary" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden />
            Try again
          </button>
        )}
      </div>
    </CourseShell>
  );
}

/** The same, compact, for the peek sheet. */
export function PeekFailed({ onRetry, words = "This part of the Academy didn't load." }: { onRetry?: () => void; words?: string }) {
  return (
    <div className="crs__peek-state">
      <p className="crs__state-title">{words}</p>
      {onRetry && (
        <button type="button" className="crs__btn" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

/** A way back up the trail: the crumb above, else Back. */
function WayBack() {
  const { nav, crumbs } = useCourse();
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  if (up?.onClick) {
    return (
      <button type="button" className="crs__btn" onClick={up.onClick}>
        Back to {up.label}
        <ArrowRight size={16} aria-hidden />
      </button>
    );
  }
  return nav.canBack ? (
    <button type="button" className="crs__btn" onClick={nav.back}>
      Go back
    </button>
  ) : null;
}

/** "Gone": a calm word that the page moved, and a way back. */
export function GonePage() {
  return (
    <CourseShell>
      <div className="crs__state">
        <p className="crs__state-title">This page has moved.</p>
        <p className="crs__state-words">The Academy was rebuilt since the link was made, so the page is under another name now.</p>
        <WayBack />
      </div>
    </CourseShell>
  );
}

/**
 * A studio's own machine while its floor cannot be read: the page is the
 * floor's to give, and waiting would never end, so it says so and offers the
 * way back (pages.ts floorUnreadableFor).
 */
export function FloorUnreadablePage() {
  const { studioName } = useCourse();
  return (
    <CourseShell>
      <div className="crs__state">
        <p className="crs__state-title">Can't read {studioName}'s floor right now.</p>
        <p className="crs__state-words">This machine is {studioName}'s own, so its page comes from the floor. Nothing is lost.</p>
        <WayBack />
      </div>
    </CourseShell>
  );
}
