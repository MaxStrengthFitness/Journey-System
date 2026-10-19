import { lazy, Suspense } from "react";
import { LoadingArea } from "../../components/LoadingMark";
import { LoadBoundary } from "../new-version/LoadBoundary";
import { WikiShell } from "../wiki";
import type { LearningDesign } from "../learning-vault/types";
import type { DesignProps } from "./design-props";
import { SECTION_LABEL } from "./design";

/**
 * THE MIX, FETCHED ON FIRST USE (the Learning vault redesign, Oct 19 2026).
 *
 * AJ picked the mix: the Tactical Codex as the base, with the Course's lesson
 * cards, scrubber, cue drills and glossary vault, and the Vault's map as a
 * lens. It is a chunk of its own, fetched the first time it is picked on the
 * prototype bar, so nobody who never taps the bar pays for it. It replaces
 * the whole Learning screen under the masthead, so its boundary is a
 * screen's: a deploy that removed its file says so in that screen, and
 * picking Current (resetKey) clears it.
 *
 * This is the one file in the redesign that makes a lazy screen
 * (new-version/lazy-screens.test.ts lists it).
 */
const CodexLearning = lazy(() => import("./codex/CodexLearning"));

const SCREENS = {
  codex: CodexLearning,
} as const;

export type RedesignId = Exclude<LearningDesign, "current">;

export function LazyDesign({ design, ...props }: DesignProps & { design: RedesignId }) {
  const Design = SCREENS[design];
  return (
    <LoadBoundary kind="screen" resetKey={design}>
      <Suspense fallback={<DesignLoading section={props.section} />}>
        <Design {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

/** The wait: the masthead stays put, the loading mark where the page will be. */
function DesignLoading({ section }: { section: DesignProps["section"] }) {
  return (
    <WikiShell crumbs={[{ label: SECTION_LABEL[section] }]}>
      <LoadingArea label="Opening the design…" />
    </WikiShell>
  );
}
