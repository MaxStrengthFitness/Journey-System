import { lazy, Suspense } from "react";
import { LoadingArea } from "../../components/LoadingMark";
import { LoadBoundary } from "../new-version/LoadBoundary";
import { WikiShell } from "../wiki";
import type { LearningViewId } from "../learning/LearningView";
import type { DesignProps } from "./design-props";

/**
 * THE MIX, FETCHED ON FIRST USE (the Learning vault redesign, Oct 19 2026;
 * every trainer's Learning since Oct 20 2026).
 *
 * AJ picked the mix: the Tactical Codex as the base, with the Course's lesson
 * cards, scrubber, cue drills and glossary vault, and the Vault's map as a
 * lens. It is a chunk of its own, fetched the first time Learning opens, so
 * the first screen never carries it. It replaces the whole Learning screen
 * under the masthead, so its boundary is a screen's: a deploy that removed
 * its file says so in that screen.
 *
 * This is the one file in the redesign that makes a lazy screen
 * (new-version/lazy-screens.test.ts lists it).
 */
const CodexLearning = lazy(() => import("./codex/CodexLearning"));

/** The masthead's words for each section, for the crumb while the Mix is on its way. */
export const SECTION_LABEL: Record<LearningViewId, string> = {
  learning: "Overview",
  "machine-anatomy": "Catalog",
  academy: "Academy",
};

export function LazyMix(props: DesignProps) {
  return (
    <LoadBoundary kind="screen">
      <Suspense fallback={<MixLoading section={props.section} />}>
        <CodexLearning {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

/** The wait: the masthead stays put, the loading mark where the page will be. */
function MixLoading({ section }: { section: DesignProps["section"] }) {
  return (
    <WikiShell crumbs={[{ label: SECTION_LABEL[section] }]}>
      <LoadingArea label="Opening Learning…" />
    </WikiShell>
  );
}
