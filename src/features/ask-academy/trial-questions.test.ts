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
      if (!Array.isArray(q.expect)) continue;
      for (const id of q.expect) expect(pageById(pages, id), `${q.id}: ${id}`).not.toBeNull();
    }
  });

  it("are twenty of Claude's, one of them the control", () => {
    expect(TRIAL_QUESTIONS.filter((q) => q.from === "claude")).toHaveLength(20);
    expect(TRIAL_QUESTIONS.filter((q) => q.expect === "not_covered")).toHaveLength(1);
  });
});
