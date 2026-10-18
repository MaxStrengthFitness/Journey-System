/**
 * Which Learning page a quote opens (phase 2, Oct 18 2026; AJ's 1a: "each
 * opening its page"). An Ask the Academy page id is the Academy's own id with
 * its kind in front (`pages.ts`), so this only takes the kind back off. A
 * glossary term opens by the term itself, which is the page's title.
 *
 * Pure, and it imports no Academy content: it runs in the app.
 */
import type { LearningRef } from "../learning/ref";

export function refForAcademyPage(pageId: string, title: string): LearningRef | null {
  if (pageId === "cues") return { kind: "academy-cueing" };
  const at = pageId.indexOf(":");
  if (at < 1) return null;
  const kind = pageId.slice(0, at);
  const id = pageId.slice(at + 1);
  if (!id) return null;
  switch (kind) {
    case "topic":
      return { kind: "academy-topic", id };
    case "overview":
      return { kind: "academy-overview", id };
    case "script":
      return { kind: "academy-script", id };
    case "card":
      return { kind: "academy-card", id };
    case "term":
      return { kind: "academy-glossary", id: title };
    default:
      return null;
  }
}
