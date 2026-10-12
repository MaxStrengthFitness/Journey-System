import { describe, expect, it } from "vitest";
import {
  continueHereWords,
  firstOpenMachine,
  isRecentlySaved,
  machinesDone,
  sessionMachineList,
  takeOverWords,
  watchWords,
  whoStartedIt,
} from "./watch";
import type { LiveSet } from "../journey-grid";

const set = (over: Partial<LiveSet>): LiveSet => ({
  weight: 120,
  reps: null,
  seconds: null,
  isTSC: false,
  quality: null,
  ...over,
});

describe("watchWords", () => {
  it("names who is running the session, and says nothing here changes it", () => {
    const w = watchWords({ runner: "JC", takenFromHere: false, online: true });
    expect(w.line).toBe(
      "JC is running this session on another iPad. You're watching: it updates as each set is saved, and nothing here changes it.",
    );
    expect(w.offline).toBeNull();
  });

  it("tells the iPad a session was taken from who took it", () => {
    expect(watchWords({ runner: "AJ", takenFromHere: true, online: true }).line).toBe(
      "AJ took over this session on another iPad. You're watching it now: it updates as each set is saved.",
    );
  });

  it("says what is on screen may be behind while offline", () => {
    expect(watchWords({ runner: "JC", takenFromHere: false, online: false }).offline).toBe(
      "Offline: what you see may be behind what has been saved.",
    );
  });

  it("never prints blank initials", () => {
    expect(watchWords({ runner: "  ", takenFromHere: false, online: true }).line).toMatch(/^Another trainer is running/);
  });
});

describe("takeOverWords", () => {
  it("asks plainly, with watching as the safe answer", () => {
    const w = takeOverWords({ runner: "JC", clientFirstName: "Judy" });
    expect(w.title).toBe("Take over this session?");
    expect(w.question).toBe(
      "JC is running Judy's session on another iPad. If you take it over, you record the rest and finish it, and the session is yours. JC's iPad switches to watching. The session still shows who started it.",
    );
    expect(w.leaveLabel).toBe("Take over");
    expect(w.stayLabel).toBe("Keep watching");
  });

  it("reads right with nothing to name", () => {
    const w = takeOverWords({ runner: "", clientFirstName: "" });
    expect(w.question).toBe(
      "Another trainer is running this session on another iPad. If you take it over, you record the rest and finish it, and the session is yours. Their iPad switches to watching. The session still shows who started it.",
    );
  });

  it("never uses developer words", () => {
    const all = [
      watchWords({ runner: "JC", takenFromHere: false, online: false }),
      watchWords({ runner: "JC", takenFromHere: true, online: true }),
    ]
      .map((w) => `${w.line} ${w.offline ?? ""}`)
      .concat(Object.values(takeOverWords({ runner: "JC", clientFirstName: "Judy" })))
      .join(" ");
    expect(all).not.toMatch(/firestore|firebase|null|undefined|error|document|sync/i);
  });
});

describe("sessionMachineList", () => {
  const routines = [{ id: "rA", machineIds: ["m1", "m2"] }];

  it("follows the session's own list, which the trainer's iPad rewrites on every add or move", () => {
    expect(sessionMachineList({ sessionMachineIds: ["m2", "m9"], routineId: "rA" }, routines, ["f1"])).toEqual(["m2", "m9"]);
  });

  it("falls back to the routine for an older session", () => {
    expect(sessionMachineList({ routineId: "rA" }, routines, ["f1"])).toEqual(["m1", "m2"]);
  });

  it("runs the floor for an older Free session with no list on record, and nothing for a routine not loaded yet", () => {
    expect(sessionMachineList({}, routines, ["f1", "f2"])).toEqual(["f1", "f2"]);
    expect(sessionMachineList({ routineId: "rZ" }, routines, ["f1"])).toEqual([]);
  });

  /* The first-session design round (Oct 8 2026): a session started with
     nothing chosen records an EMPTY list and no routine, and the trainer's
     iPad runs it empty. The watching iPad draws the same, never the whole
     floor as if it were today's routine. */
  it("draws an empty list on record with no routine as empty, never the floor", () => {
    expect(sessionMachineList({ sessionMachineIds: [], routineId: null }, routines, ["f1", "f2"])).toEqual([]);
    expect(sessionMachineList({ sessionMachineIds: [] }, routines, ["f1", "f2"])).toEqual([]);
  });

  it("with a routine, keeps the list on record, an empty one included", () => {
    expect(sessionMachineList({ sessionMachineIds: [], routineId: "rA" }, routines, ["f1"])).toEqual([]);
  });

  it("an older session on an empty Routine A with a plan runs the plan's day one, as the Active Session does", () => {
    const withPlan = [{ id: "rA", machineIds: [] as string[], plan: { dayOne: ["m-leg-press", "m-lumbar"] } }];
    expect(sessionMachineList({ routineId: "rA" }, withPlan, ["f1"])).toEqual(["m-leg-press", "m-lumbar"]);
  });
});

describe("where the trainer is, and how far along", () => {
  const ids = ["m1", "m2", "m3"];

  it("is the first machine without a count and a quality", () => {
    expect(firstOpenMachine(ids, { m1: set({ reps: 12, quality: 2 }), m2: set({ reps: 10 }) })).toBe("m2");
  });

  it("passes a practice or skipped machine, and a timed hold with its seconds", () => {
    expect(
      firstOpenMachine(ids, {
        m1: set({ outcome: "skipped" }),
        m2: set({ isTSC: true, seconds: 90, quality: 2 }),
      }),
    ).toBe("m3");
  });

  it("is the first machine once everything is done, and nothing with no machines", () => {
    const all = { m1: set({ reps: 1, quality: 2 }), m2: set({ reps: 1, quality: 2 }), m3: set({ reps: 1, quality: 2 }) };
    expect(firstOpenMachine(ids, all)).toBe("m1");
    expect(firstOpenMachine([], {})).toBeNull();
  });

  it("counts machines logged as the session bar does", () => {
    expect(
      machinesDone(ids, {
        m1: set({ reps: 12 }),
        m2: set({ outcome: "practice" }),
        m3: set({ weight: 90 }),
      }),
    ).toBe(2);
  });
});

describe("whoStartedIt", () => {
  const trainers = [
    { id: "t-jc", initials: "JC" },
    { id: "t-aj", initials: "AJ" },
  ];

  it("is one trainer until a take-over", () => {
    expect(whoStartedIt({ trainerId: "t-jc", trainerInitials: "JC", startedByTrainerId: "t-jc" }, trainers)).toEqual({
      starter: "JC",
      runner: "JC",
      changedHands: false,
    });
    // A session from before startedByTrainerId was only ever one trainer's.
    expect(whoStartedIt({ trainerId: "t-jc", trainerInitials: "JC" }, trainers).changedHands).toBe(false);
  });

  it("names the starter and the trainer who has it after a take-over", () => {
    expect(whoStartedIt({ trainerId: "t-aj", trainerInitials: "AJ", startedByTrainerId: "t-jc" }, trainers)).toEqual({
      starter: "JC",
      runner: "AJ",
      changedHands: true,
    });
  });

  it("never guesses a starter the roster cannot name", () => {
    expect(whoStartedIt({ trainerId: "t-aj", trainerInitials: "AJ", startedByTrainerId: "t-gone" }, trainers)).toEqual({
      starter: null,
      runner: "AJ",
      changedHands: true,
    });
  });
});

/* ── The same trainer on another device (the sessions round, Oct 12 2026) ── */
describe("the trainer's own session on another device", () => {
  it("never says \"your other iPad\": another device", () => {
    const recent = watchWords({ runner: "AJ", takenFromHere: false, online: true, sameTrainer: true, recentlySaved: true });
    expect(recent.line).toBe("This session is open on another device and was saved a moment ago. You're watching it here.");
    const quiet = watchWords({ runner: "AJ", takenFromHere: false, online: true, sameTrainer: true, recentlySaved: false });
    expect(quiet.line).toBe("This session is open on another device. You're watching it here.");
    const lost = watchWords({ runner: "AJ", takenFromHere: true, online: true, sameTrainer: true });
    expect(lost.line).toBe("You continued this session somewhere else. This iPad is watching it now.");
    for (const w of [recent, quiet, lost]) expect(w.line).not.toMatch(/other iPad|your iPad/i);
  });

  it("asks to continue here, Keep watching the default while it was saved a moment ago", () => {
    expect(continueHereWords({ recentlySaved: true, lastSaved: "2:14 PM" })).toEqual({
      title: "Continue this session here?",
      question: "You record the rest of it here, and the other device switches to watching.",
      continueLabel: "Continue here",
      watchLabel: "Keep watching",
    });
  });

  it("quieter than that, asks once with when it was last saved, Just watch the default", () => {
    const w = continueHereWords({ recentlySaved: false, lastSaved: "2:14 PM" });
    expect(w.question).toBe("It was last saved at 2:14 PM on another device. You record the rest of it here, and the other device switches to watching.");
    expect(w.watchLabel).toBe("Just watch");
    expect(continueHereWords({ recentlySaved: false, lastSaved: null }).question).toMatch(/^It was last saved on another device\./);
  });

  it("saved a moment ago is within three minutes; a pending stamp is now", () => {
    const now = Date.UTC(2026, 9, 12, 14, 0);
    expect(isRecentlySaved({ lastHeartbeatAt: new Date(now - 2 * 60_000) }, now)).toBe(true);
    expect(isRecentlySaved({ lastHeartbeatAt: new Date(now - 4 * 60_000) }, now)).toBe(false);
    expect(isRecentlySaved({ lastHeartbeatAt: null, createdAt: null }, now)).toBe(true);
  });
});
