import { WikiArticle, WikiShell } from "../../wiki";
import type { DesignProps } from "../design-props";
import { SECTION_LABEL, designById } from "../design";

/**
 * PLACEHOLDER for the course design (the Learning vault redesign, Oct 19 2026).
 * The design's own agent replaces this whole file; until then a pick on the
 * prototype bar lands here, under the same masthead, and says so calmly.
 */
export default function CourseLearning({ section }: DesignProps) {
  const design = designById("course");
  return (
    <WikiShell crumbs={[{ label: SECTION_LABEL[section] }]}>
      <WikiArticle eyebrow={`Prototype ${design.number}`} title={design.name}>
        <p className="wk__placeholder">This design is being built.</p>
      </WikiArticle>
    </WikiShell>
  );
}
