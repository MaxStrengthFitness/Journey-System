/**
 * The Mix's doors to today's Learning (Oct 20 2026): which page has one, what
 * it is called, and where it opens.
 */
import { describe, expect, it } from "vitest";
import { onlyOnToday, todayDoorFor, todayDoorLabel } from "./today-door";

describe("todayDoorFor", () => {
  it("a machine opens today's machine page, for its floor notes, set-up and history", () => {
    const door = todayDoorFor({ kind: "machine", id: "m-leg-press" });
    expect(door).toEqual({ kind: "machine", id: "m-leg-press" });
    expect(todayDoorLabel(door!)).toBe("Floor notes, set-up and history");
  });

  it("the two indexes open today's sections: the drawn floor, the studio's own pages", () => {
    expect(todayDoorLabel(todayDoorFor({ kind: "catalog" })!)).toBe("Floor plan and body view");
    expect(todayDoorLabel(todayDoorFor({ kind: "academy" })!)).toBe("Studio pages");
  });

  it("a topic, a quick card, a script and a deep dive open the same page today, for its comments", () => {
    expect(todayDoorFor({ kind: "topic", moduleId: "performance", topicId: "performance-speed-of-movement" })).toEqual({
      kind: "academy-topic",
      id: "performance-speed-of-movement",
      moduleId: "performance",
    });
    for (const kind of ["card", "script", "overview"] as const) {
      const door = todayDoorFor({ kind, id: "m-leg-press" });
      expect(door?.kind).toBe(`academy-${kind}`);
      expect(todayDoorLabel(door!)).toBe("Comments");
    }
  });

  it("a page with nothing behind a door has none", () => {
    expect(todayDoorFor({ kind: "home" })).toBeNull();
    expect(todayDoorFor({ kind: "glossary" })).toBeNull();
    expect(todayDoorFor({ kind: "cueing" })).toBeNull();
    expect(todayDoorFor({ kind: "module", moduleId: "performance" })).toBeNull();
    expect(todayDoorFor({ kind: "playbook", id: "the-twenty-minutes" })).toBeNull();
    expect(todayDoorFor({ kind: "quiz", deck: "mixed" })).toBeNull();
    expect(todayDoorFor({ kind: "track", id: "life-transformer-101" })).toBeNull();
  });
});

describe("onlyOnToday", () => {
  it("is a studio's own page, and nothing else", () => {
    expect(onlyOnToday({ kind: "studio-page", id: "p-1", studioId: "solon" })).toBe(true);
    expect(onlyOnToday({ kind: "machine", id: "m-leg-press" })).toBe(false);
    expect(onlyOnToday({ kind: "academy-topic", id: "t" })).toBe(false);
  });
});
