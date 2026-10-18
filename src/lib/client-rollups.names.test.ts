import { describe, expect, it } from "vitest";
import type { Trainer } from "../types";
import { completedSessionRollup, plainFieldOps, resolveTopTrainer, storedNamesFromSessions, tallyRows } from "./client-rollups";

/**
 * The trainer lock (Oct 18 2026): the list an iPad holds is the signed-in
 * person's studios, so a client's top trainer can be someone the list doesn't
 * hold. The rollups name them by what Start stamped on the sessions, and
 * never write "A trainer from another studio" to the client.
 */
const TRAINERS = [
  { id: "t-here", authUid: "uid-here", fullName: "Here Now", initials: "HN" },
  { id: "t-mp", fullName: "Mia Park", initials: "MP" },
] as Trainer[];

describe("storedNamesFromSessions", () => {
  it("keys the names the sessions carry the way the tally keys them, the latest winning", () => {
    const names = storedNamesFromSessions([
      { trainerId: "t-away", trainerInitials: "SR", trainerName: "Sam Reed" },
      { trainerId: "t-away", trainerInitials: "SR", trainerName: "Samuel Reed" },
      { trainerInitials: "MP", trainerName: "Mia Park" },
      { trainerId: "t-blank", trainerName: "  " },
    ]);
    expect(names.get("t-away")).toBe("Samuel Reed");
    expect(names.get("initials:MP")).toBe("Mia Park");
    expect(names.has("t-blank")).toBe(false);
  });
});

describe("resolveTopTrainer, for a coach the list doesn't hold", () => {
  it("names them as the sessions do, and says so when the sessions carry no name", () => {
    const named = resolveTopTrainer({ "t-away": 12, "t-here": 3 }, TRAINERS, null, new Map([["t-away", "Sam Reed"]]));
    expect(named).toMatchObject({ key: "t-away", trainer: null, name: "Sam Reed", named: true });
    const unnamed = resolveTopTrainer({ "t-away": 12, "t-here": 3 }, TRAINERS);
    expect(unnamed).toMatchObject({ key: "t-away", trainer: null, name: "A trainer from another studio", named: false });
  });

  it("finds a record by an older account's sign-in uid, and never by initials when the key is an id", () => {
    expect(resolveTopTrainer({ "uid-here": 5 }, TRAINERS)).toMatchObject({ name: "Here Now", named: true });
    // "t-mp-elsewhere" is not Mia Park, whatever the initials.
    expect(resolveTopTrainer({ "t-mp-elsewhere": 5 }, TRAINERS)?.trainer).toBeNull();
    expect(resolveTopTrainer({ "initials:MP": 5 }, TRAINERS)).toMatchObject({ name: "Mia Park", named: true });
    expect(resolveTopTrainer({ "initials:ZZ": 5 }, TRAINERS)).toMatchObject({ name: "ZZ", named: true });
  });

  it("the tally rows say the same (most sessions first, then by name)", () => {
    const rows = tallyRows({ "t-away": 2, "t-here": 1, "t-gone": 1 }, TRAINERS, new Map([["t-away", "Sam Reed"]]));
    expect(rows.map((r) => r.name)).toEqual(["Sam Reed", "A trainer from another studio", "Here Now"]);
  });
});

describe("completedSessionRollup never writes the placeholder as a name", () => {
  it("writes the key and the count, and leaves the name alone when it would only say from another studio", () => {
    const updates = completedSessionRollup({ trainerTally: {} }, { date: "2026-10-18", trainerId: "t-away", trainerInitials: "SR" }, [], TRAINERS, plainFieldOps);
    expect(updates.topTrainerId).toBe("t-away");
    expect(updates.topTrainerSessions).toBe(1);
    expect("topTrainerName" in updates).toBe(false);
  });

  it("writes the name when the list holds the record", () => {
    const updates = completedSessionRollup({ trainerTally: {} }, { date: "2026-10-18", trainerId: "t-here", trainerInitials: "HN" }, [], TRAINERS, plainFieldOps);
    expect(updates.topTrainerName).toBe("Here Now");
  });
});
