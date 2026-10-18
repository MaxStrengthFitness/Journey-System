import { describe, expect, it } from "vitest";
import { academyFiles } from "./academy-files";
import { academyPages, pageById } from "./pages";
import { TRIAL_QUESTIONS } from "./trial-questions";

const pages = academyPages(academyFiles());

describe("the trial's questions", () => {
  it("have unique ids", () => {
    const ids = TRIAL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("name only pages that exist", () => {
    for (const q of TRIAL_QUESTIONS) {
      for (const id of [...(Array.isArray(q.expect) ? q.expect : []), ...(q.avoid ?? [])]) expect(pageById(pages, id), `${q.id}: ${id}`).not.toBeNull();
    }
  });

  it("are twenty of Claude's, one of them the control", () => {
    const claude = TRIAL_QUESTIONS.filter((q) => q.from === "claude");
    expect(claude).toHaveLength(20);
    expect(claude.filter((q) => q.expect === "not_covered")).toHaveLength(1);
  });

  it("cover all ten of AJ's reasons", () => {
    const reasons = new Set(TRIAL_QUESTIONS.filter((q) => q.from === "aj").map((q) => q.reason));
    expect([...reasons].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
