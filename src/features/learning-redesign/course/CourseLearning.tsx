import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LearningRef } from "../../learning/ref";
import { usePhone } from "../../phone/device";
import type { WikiCrumb } from "../../wiki";
import { titleOf as vaultTitleOf } from "../../learning-vault/pages";
import { routeForRef, routeKey, sameRoute } from "../../learning-vault/routes";
import { useVaultData, type VaultData } from "../../learning-vault/useVaultData";
import { useVaultNav } from "../../learning-vault/useVaultNav";
import { ConceptLayer } from "../../learning-vault/ui/ConceptLayer";
import { usePeekStack } from "../../learning-vault/ui/PeekSheet";
import type { VaultRoute } from "../../learning-vault/types";
import type { LearningViewId } from "../../learning/LearningView";
import type { DesignProps } from "../design-props";
import { SECTION_LABEL } from "../design";
import { CueingPage, GlossaryPage } from "./DrillPages";
import { HomePage } from "./HomePage";
import { AcademyPage, CatalogPage, CoursePage } from "./IndexPages";
import { LessonPage } from "./LessonPage";
import { MachinePage } from "./MachinePage";
import { ConnectionsPage, PeekBody, QueuePage, QuizPage, ReferencePage } from "./OtherPages";
import { CourseProvider, GonePage, type CourseValue, type LessonMode } from "./shell";
import "./course.css";

/**
 * DESIGN 3 — THE INTERACTIVE COURSE & FIELD MANUAL (the Learning vault
 * redesign, Oct 19 2026). README.md beside this file has the idea and the
 * screens.
 *
 * This root holds what outlives a page: the vault's data (read once), the
 * trail of pages (useVaultNav: every move asks the unsaved-changes gate
 * first), the peek, the one concept layer, and whether lessons open as cards
 * or whole. Nothing is stored: all of it goes when Learning closes.
 *
 * THE MASTHEAD AND OUTSIDE LINKS
 * ------------------------------
 * The masthead's three sections are this design's three roots: Overview is
 * the course's front page, Catalog the floor as a field manual (the floor
 * first, in walking order), Academy the method as courses and drills. A
 * section change, a page opened from outside (search, the bell, a link:
 * `jump`), or the Learning title on the Overview and the section already on
 * (`resetSignal`) starts a fresh trail on that root or page. The app asked
 * about any typing before any of them reached here (AppContent's guarded
 * screen, LearningView's doors), so the trail is replaced with useVaultNav's
 * `set`, which does not ask twice, and the peek lets go.
 */
export default function CourseLearning({
  section,
  onSection,
  machines,
  studioId,
  studioName,
  jump,
  onJumpHandled,
  resetSignal = 0,
}: DesignProps) {
  const data = useVaultData({ studioId, machines });
  // Cards or whole: the reader's choice for every lesson, kept above the trail.
  const [lessonMode, setLessonMode] = useState<LessonMode>("cards");

  return (
    <CourseTrail
      section={section}
      onSection={onSection}
      jump={jump}
      onJumpHandled={onJumpHandled}
      resetSignal={resetSignal}
      data={data}
      studioName={studioName}
      lessonMode={lessonMode}
      setLessonMode={setLessonMode}
    />
  );
}

/** Each masthead section's root. */
export function rootFor(section: LearningViewId): VaultRoute {
  if (section === "machine-anatomy") return { kind: "catalog" };
  if (section === "academy") return { kind: "academy" };
  return { kind: "home" };
}

function CourseTrail({
  section,
  onSection,
  jump,
  onJumpHandled,
  resetSignal,
  data,
  studioName,
  lessonMode,
  setLessonMode,
}: {
  section: LearningViewId;
  onSection: (id: LearningViewId) => void;
  jump: LearningRef | null;
  onJumpHandled: () => void;
  resetSignal: number;
  data: VaultData;
  studioName: string;
  lessonMode: LessonMode;
  setLessonMode: (m: LessonMode) => void;
}) {
  // The first trail is the section's root; a jump is opened once mounted (a
  // page's first draw may ask the Academy for a module, and that answer has
  // to land on a screen that is already there).
  const nav = useVaultNav(rootFor(section));
  const peek = usePeekStack();

  // A fresh trail from outside: a jump (that page alone, under its section's
  // crumb), a new section or the reset (its root). Before paint, so a jump
  // never flashes the section's root first. Each is honoured once.
  const handledJump = useRef<LearningRef | null>(null);
  const seenSection = useRef(section);
  const seenReset = useRef(resetSignal);
  const { set } = nav;
  const { close } = peek;
  useLayoutEffect(() => {
    if (jump && handledJump.current !== jump) {
      handledJump.current = jump;
      seenSection.current = section;
      seenReset.current = resetSignal;
      set([routeForRef(jump)]);
      close();
      onJumpHandled();
      return;
    }
    if (section !== seenSection.current || resetSignal !== seenReset.current) {
      seenSection.current = section;
      seenReset.current = resetSignal;
      set([rootFor(section)]);
      close();
    }
  }, [jump, section, resetSignal, set, close, onJumpHandled]);
  const phone = usePhone();
  const sectionRoot = useMemo(() => rootFor(section), [section]);

  const titleOf = useCallback((r: VaultRoute) => vaultTitleOf(r, data), [data]);

  const crumbs = useMemo<WikiCrumb[]>(() => {
    const out: WikiCrumb[] = [];
    const stack = nav.stack;
    const rooted = sameRoute(stack[0], sectionRoot);
    if (!rooted) out.push({ label: SECTION_LABEL[section], onClick: () => nav.reset(sectionRoot) });
    stack.forEach((r, i) => {
      const last = i === stack.length - 1;
      out.push({
        label: i === 0 && rooted ? SECTION_LABEL[section] : titleOf(r),
        onClick: last ? undefined : () => nav.push(r),
      });
    });
    return out;
  }, [nav, sectionRoot, section, titleOf]);

  const openLesson = useCallback(
    (course: VaultRoute, lesson: VaultRoute) => {
      const top = nav.stack[nav.stack.length - 1];
      if (!sameRoute(top, course)) nav.push(course);
      nav.push(lesson);
    },
    [nav],
  );

  const value = useMemo<CourseValue>(
    () => ({
      data,
      nav,
      peek,
      crumbs,
      scrollKey: `${nav.stack.length}:${routeKey(nav.route)}`,
      studioName,
      phone,
      lessonMode,
      setLessonMode,
      section,
      onSection,
      open: nav.push,
      peekAt: peek.push,
      openLesson,
      renderPeek: (r: VaultRoute): ReactNode => <PeekBody route={r} />,
      titleOf,
    }),
    [data, nav, peek, crumbs, studioName, phone, lessonMode, setLessonMode, section, onSection, openLesson, titleOf],
  );

  return (
    <CourseProvider value={value}>
      <ConceptLayer index={data.entities} onOpen={nav.push} onPeek={peek.push}>
        <Page route={nav.route} />
      </ConceptLayer>
    </CourseProvider>
  );
}

/** The page a route draws. Keyed by the route, so a page's own state never leaks onto the next one. */
function Page({ route }: { route: VaultRoute }) {
  const key = routeKey(route);
  switch (route.kind) {
    case "home":
      return <HomePage key={key} />;
    case "catalog":
      return <CatalogPage key={key} />;
    case "academy":
      return <AcademyPage key={key} />;
    case "machine":
      return <MachinePage key={key} route={route} />;
    case "topic":
    case "playbook":
    case "overview":
    case "script":
      return <LessonPage key={key} route={route} />;
    case "card":
      return <ReferencePage key={key} route={route} />;
    case "module":
    case "track":
      return <CoursePage key={key} route={route} />;
    case "glossary":
      return <GlossaryPage key={key} route={route} />;
    case "cueing":
      return <CueingPage key={key} route={route} />;
    case "quiz":
      return <QuizPage key={key} route={route} />;
    case "queue":
      return <QueuePage key={key} />;
    case "map":
      return <ConnectionsPage key={key} route={route} />;
    default:
      return <GonePage />;
  }
}
