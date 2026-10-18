import { describe, expect, it } from "vitest";
import {
  ANOTHER_STUDIOS_TRAINER,
  ANOTHER_STUDIOS_TRAINER_MID,
  findTrainerRecord,
  trainerInitialsFor,
  trainerNameFor,
  trainerShortNameFor,
} from "./names";

describe("trainerNameFor", () => {
  it("says the record's name when the list holds it", () => {
    expect(trainerNameFor({ fullName: "Sam Reed" }, "Old Name")).toBe("Sam Reed");
  });

  it("falls back to the name the document carries, then to a trainer from another studio", () => {
    expect(trainerNameFor(undefined, "Sam Reed")).toBe("Sam Reed");
    expect(trainerNameFor(null, "  ")).toBe(ANOTHER_STUDIOS_TRAINER);
    expect(trainerNameFor(undefined)).toBe(ANOTHER_STUDIOS_TRAINER);
    expect(trainerNameFor({ fullName: "" }, null)).toBe(ANOTHER_STUDIOS_TRAINER);
  });

  it("never says nothing, and the two spellings agree", () => {
    expect(trainerNameFor({ fullName: "   " })).not.toBe("");
    expect(ANOTHER_STUDIOS_TRAINER).toBe("A trainer from another studio");
    expect(ANOTHER_STUDIOS_TRAINER_MID).toBe(ANOTHER_STUDIOS_TRAINER.charAt(0).toLowerCase() + ANOTHER_STUDIOS_TRAINER.slice(1));
  });
});

describe("trainerShortNameFor", () => {
  it("prefers the nickname, then the first name, then the stored name's first word", () => {
    expect(trainerShortNameFor({ fullName: "Samuel Reed", nickname: "Sam" })).toBe("Sam");
    expect(trainerShortNameFor({ fullName: "Samuel Reed" })).toBe("Samuel");
    expect(trainerShortNameFor(undefined, "Samuel Reed")).toBe("Samuel");
    expect(trainerShortNameFor(undefined)).toBe(ANOTHER_STUDIOS_TRAINER);
  });
});

describe("trainerInitialsFor", () => {
  it("uses the record's initials, else makes them from a name, else a question mark", () => {
    expect(trainerInitialsFor({ initials: "SR", fullName: "Samuel Reed" })).toBe("SR");
    expect(trainerInitialsFor({ fullName: "Samuel Reed" })).toBe("SR");
    expect(trainerInitialsFor(undefined, "samuel reed jones")).toBe("SR");
    expect(trainerInitialsFor(undefined, "Cher")).toBe("C");
    expect(trainerInitialsFor(undefined)).toBe("?");
  });
});

describe("findTrainerRecord", () => {
  const list = [
    { id: "doc-1", authUid: "uid-1", initials: "SR" },
    { id: "uid-2", initials: "SR" },
  ];

  it("finds by document id, then by an older account's sign-in uid", () => {
    expect(findTrainerRecord(list, "doc-1")?.id).toBe("doc-1");
    expect(findTrainerRecord(list, "uid-1")?.id).toBe("doc-1");
    expect(findTrainerRecord(list, "uid-2")?.id).toBe("uid-2");
  });

  it("never matches by initials, and finds nothing for no id or an id outside the list", () => {
    expect(findTrainerRecord(list, "SR")).toBeUndefined();
    expect(findTrainerRecord(list, "someone-elsewhere")).toBeUndefined();
    expect(findTrainerRecord(list, "")).toBeUndefined();
    expect(findTrainerRecord(list, null)).toBeUndefined();
  });
});
