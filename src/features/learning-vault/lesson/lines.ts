/**
 * A RUN OF LINES, READ-ONLY — the two small rules every card, drill and
 * list of marked lines keeps (lifted from the Interactive Course, the
 * Learning vault redesign, Oct 19 2026). MarkedLine.tsx draws a line.
 *
 * PURE MODULE: no React.
 */

import { labelRuns } from "../ui/line-actions";
import type { MarkedBlock } from "../types";

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

/** "1 crossed-out line hidden" (crossed out, and the reader chose to hide those). */
export function hiddenWords(n: number): string {
  return n === 1 ? "1 crossed-out line hidden" : `${n} crossed-out lines hidden`;
}
