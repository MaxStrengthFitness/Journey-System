import { describe, expect, it } from "vitest";
import { emptyNoteBox, whereItLands, withCategory, withImportance } from "./note-box";

describe("the note box: where a note goes, said before it is saved (the Wrap-up round, Oct 18 2026)", () => {
  it("a category moves the note to its default until the trainer picks where it goes", () => {
    let v = emptyNoteBox("standard");
    v = withCategory(v, "health");
    expect(v.importance).toBe("elevated");
    v = withCategory(v, "preference");
    expect(v.importance).toBe("standard");
    v = withImportance(v, "critical");
    v = withCategory(v, "health");
    expect(v.importance).toBe("critical");
    expect(v.category).toBe("health");
  });

  it("taking the category back leaves where it goes as it is", () => {
    const v = withCategory(withCategory(emptyNoteBox("standard"), "incident"), null);
    expect(v).toMatchObject({ category: null, importance: "elevated" });
  });

  it("says the place, the reach and the leaders in one line", () => {
    expect(whereItLands({ importance: "elevated", justForMe: false, category: "health" }, "Robbin")).toBe(
      "Robbin's profile → Notes → Health · read out on the next 4 briefings · leaders see it on Operations → Today",
    );
    expect(whereItLands({ importance: "standard", justForMe: false, category: "preference" }, "Robbin")).toBe(
      "Robbin's profile → Notes → Preference · stays on the profile, not on the briefing",
    );
    expect(whereItLands({ importance: "critical", justForMe: false, category: null }, "Robbin")).toBe(
      "Robbin's profile → Notes → To file · first on every briefing until someone closes it, and a red triangle on the Hub card",
    );
  });

  it("just for me: the trainer's own notebook, never the record", () => {
    expect(whereItLands({ importance: "elevated", justForMe: true, category: "health" }, "Robbin")).toBe(
      "Your own notebook. Nobody else sees it, and it isn't filed on Robbin's record.",
    );
    expect(whereItLands({ importance: "standard", justForMe: true, category: null }, "")).toContain("the client's record");
  });
});
