import { describe, expect, it } from "vitest";
import ACADEMY_INDEX from "../academy/content/index.json";
import { academyFiles } from "./academy-files";
import { refForAcademyPage } from "./learning-ref";
import { academyPages } from "./pages";

const pages = academyPages(academyFiles());

describe("refForAcademyPage", () => {
  it("opens every page Ask the Academy can quote", () => {
    for (const p of pages) expect(refForAcademyPage(p.id, p.title), p.id).not.toBeNull();
  });

  it("opens a topic Learning can place in its module", () => {
    const topics = new Set((ACADEMY_INDEX as { modules: { topics: { id: string }[] }[] }).modules.flatMap((m) => m.topics.map((t) => t.id)));
    for (const p of pages.filter((x) => x.kind === "topic")) {
      const ref = refForAcademyPage(p.id, p.title);
      expect(ref?.kind === "academy-topic" && topics.has(ref.id), p.id).toBe(true);
    }
  });

  it("takes the kind off the id, and opens a term by the term", () => {
    expect(refForAcademyPage("overview:leg-press", "Leg Press")).toEqual({ kind: "academy-overview", id: "leg-press" });
    expect(refForAcademyPage("script:upper-body-cr", "Compound Row script")).toEqual({ kind: "academy-script", id: "upper-body-cr" });
    expect(refForAcademyPage("card:lp", "Leg Press quick reference")).toEqual({ kind: "academy-card", id: "lp" });
    expect(refForAcademyPage("term:valsalva", "Valsalva")).toEqual({ kind: "academy-glossary", id: "Valsalva" });
    expect(refForAcademyPage("cues", "What to say")).toEqual({ kind: "academy-cueing" });
    expect(refForAcademyPage("nonsense", "x")).toBeNull();
    expect(refForAcademyPage("topic:", "x")).toBeNull();
  });
});
