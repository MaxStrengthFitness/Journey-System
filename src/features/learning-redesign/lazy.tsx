import { lazy, Suspense } from "react";
import { LoadingArea } from "../../components/LoadingMark";
import { LoadBoundary } from "../new-version/LoadBoundary";
import { WikiShell } from "../wiki";
import type { LearningDesign } from "../learning-vault/types";
import type { DesignProps } from "./design-props";
import { SECTION_LABEL } from "./design";

/**
 * THE THREE PROTOTYPE DESIGNS, FETCHED ON FIRST USE (the Learning vault
 * redesign, Oct 19 2026).
 *
 * Each design (the Tactical Codex, the Living Vault, the Interactive Course)
 * is a chunk of its own, fetched the first time it is picked on the
 * prototype bar, so nobody who never taps the bar pays for any of them. A
 * design replaces the whole Learning screen under the masthead, so its
 * boundary is a screen's: a deploy that removed a design's file says so in
 * that screen, and picking another design (resetKey) clears it.
 *
 * This is the one file in the redesign that makes a lazy screen
 * (new-version/lazy-screens.test.ts lists it).
 */
const CodexLearning = lazy(() => import("./codex/CodexLearning"));
const VaultLearning = lazy(() => import("./vault/VaultLearning"));
const CourseLearning = lazy(() => import("./course/CourseLearning"));

const SCREENS = {
  codex: CodexLearning,
  vault: VaultLearning,
  course: CourseLearning,
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
