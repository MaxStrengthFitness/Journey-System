import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import type { HistorySession } from "./model";
import { trainerLookup } from "./trainers";

const trainers = [
  { id: "doc-sam", authUid: "uid-sam", fullName: "Sam Reed", initials: "SR" },
  { id: "doc-sara", fullName: "Sara Ross", initials: "SR" },
  { id: "doc-mia", fullName: "Mia Park", initials: "MP" },
] as Trainer[];

const session = (over: Partial<HistorySession>): HistorySession => ({ id: "s", ...over }) as HistorySession;

describe("trainerLookup (the trainer lock)", () => {
  const lookup = trainerLookup(trainers);

  it("finds the coach by document id, and by an older account's sign-in uid", () => {
    expect(lookup(session({ trainerId: "doc-mia", trainerInitials: "MP" }))?.id).toBe("doc-mia");
    expect(lookup(session({ trainerId: "uid-sam", trainerInitials: "SR" }))?.id).toBe("doc-sam");
  });

  it("never guesses by initials when the session carries an id the list doesn't hold", () => {
    // Someone from another studio, initials MP: not Mia Park.
    expect(lookup(session({ trainerId: "doc-elsewhere", trainerInitials: "MP" }))).toBeNull();
  });

  it("matches an import with no id by initials only when they belong to one person", () => {
    expect(lookup(session({ trainerInitials: "MP" }))?.id).toBe("doc-mia");
    expect(lookup(session({ trainerInitials: "mp" }))?.id).toBe("doc-mia");
    // Two SRs on the list: never merged into one.
    expect(lookup(session({ trainerInitials: "SR" }))).toBeNull();
    expect(lookup(session({}))).toBeNull();
  });
});
