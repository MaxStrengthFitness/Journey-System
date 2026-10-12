/**
 * The finish marker's pure half (the sessions round, Oct 12 2026): the ids,
 * the payloads, the reads that say what they know, the verdicts and the words.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  getDocFromServer: vi.fn(),
}));

import {
  FINISH_ID_LENGTH,
  FinishedElsewhereError,
  SessionGoneError,
  countedPatch,
  finishOncePayload,
  finishOnceRef,
  finishRefusedAgainWords,
  finishRefusedWords,
  finishedElsewhereWords,
  isFinishedElsewhere,
  isSessionGone,
  isTakenOver,
  heldElsewhere,
  TakenOverError,
  takenOverWords,
  correctedAsItWasWords,
  judgeFinishRefusal,
  judgeTotalsRefusal,
  newFinishId,
  readFromServer,
  sessionGoneWords,
  staleFinishedElsewhereWords,
  wrapUpRefusedLine,
  type ServerRead,
} from "./finish-once";

const failed = { kind: "failed" } as const;
const denied = { kind: "denied" } as const;
const missing = { kind: "missing" } as const;
const found = <T,>(data: T): ServerRead<T> => ({ kind: "found", data });

const snap = (data: Record<string, unknown> | null) => ({ exists: () => data !== null, data: () => data });

describe("the marker's ids and payloads", () => {
  it("lives at sessions/{id}/finish/once", () => {
    expect((finishOnceRef({} as never, "s1") as unknown as { path: string }).path).toBe("sessions/s1/finish/once");
  });

  it("makes a 20-character id, never empty, and different each time", () => {
    const a = newFinishId();
    const b = newFinishId();
    expect(a).toHaveLength(FINISH_ID_LENGTH);
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(a).not.toBe(b);
    // Even a random source at its edges stays in the alphabet.
    expect(newFinishId(() => 0)).toMatch(/^A{20}$/);
    expect(newFinishId(() => 0.9999999)).toMatch(/^9{20}$/);
  });

  it("carries no undefined", () => {
    const p = finishOncePayload("f1", "uid-1", "c1", "STAMP");
    expect(p).toEqual({ finishId: "f1", by: "uid-1", at: "STAMP", clientId: "c1" });
    expect(Object.values(p).some((v) => v === undefined)).toBe(false);
    expect(countedPatch("f1", "STAMP")).toEqual({ countedAt: "STAMP", countedBy: "f1" });
  });

  /* The review and attack, Oct 12 2026: the device the finish came from, and
     whether it was "Finish it as it was", go on the marker; a device id the
     rules wouldn't take (over 64 characters, odd characters) is left off
     rather than refusing a first finish. */
  it("carries the device and as-it-was when given, and never a device id the rules refuse", () => {
    expect(finishOncePayload("f1", "u", "c1", "S", { deviceId: "d-abc", asItWas: true })).toEqual({
      finishId: "f1", by: "u", at: "S", clientId: "c1", deviceId: "d-abc", asItWas: true,
    });
    expect(finishOncePayload("f1", "u", "c1", "S", { deviceId: null, asItWas: false })).toEqual({ finishId: "f1", by: "u", at: "S", clientId: "c1" });
    expect(finishOncePayload("f1", "u", "c1", "S", { deviceId: "x".repeat(65) })).not.toHaveProperty("deviceId");
    expect(finishOncePayload("f1", "u", "c1", "S", { deviceId: "a b" })).not.toHaveProperty("deviceId");
  });
});

describe("readFromServer says what it knows", () => {
  const ref = { path: "sessions/s1/finish/once" } as never;

  it("found and missing are answers", async () => {
    expect(await readFromServer(ref, 50, async () => snap({ finishId: "f1" }) as never)).toEqual(found({ finishId: "f1" }));
    expect(await readFromServer(ref, 50, async () => snap(null) as never)).toEqual(missing);
  });

  it("a refusal by the rules is denied; any other error, a throw or a timeout is failed, never missing", async () => {
    const refuse = Object.assign(new Error("no"), { code: "permission-denied" });
    expect(await readFromServer(ref, 50, async () => Promise.reject(refuse))).toEqual(denied);
    const offline = Object.assign(new Error("offline"), { code: "unavailable" });
    expect(await readFromServer(ref, 50, async () => Promise.reject(offline))).toEqual(failed);
    expect(
      await readFromServer(ref, 50, () => {
        throw new Error("sync throw");
      }),
    ).toEqual(failed);
    expect(await readFromServer(ref, 20, () => new Promise(() => {}))).toEqual(failed);
  });
});

describe("judgeFinishRefusal", () => {
  const F = "f1";
  const reads = { failed, denied, missing } as const;
  const sessionOpen = found({ status: "In-Progress" });
  const sessionDone = found({ status: "Completed" });

  it("mine: the marker is this finish's", () => {
    expect(judgeFinishRefusal({ marker: found({ finishId: F }), session: sessionDone, finishId: F })).toBe("mine");
    expect(judgeFinishRefusal({ marker: found({ finishId: F }), session: failed, finishId: F })).toBe("mine");
  });

  it("elsewhere: another finish's marker, or the session already Completed", () => {
    expect(judgeFinishRefusal({ marker: found({ finishId: "f2" }), session: sessionDone, finishId: F })).toBe("elsewhere");
    expect(judgeFinishRefusal({ marker: found({ finishId: "f2" }), session: failed, finishId: F })).toBe("elsewhere");
    for (const marker of [missing, failed, denied]) {
      expect(judgeFinishRefusal({ marker, session: sessionDone, finishId: F })).toBe("elsewhere");
    }
  });

  it("gone: the session doesn't exist, whatever the marker says", () => {
    for (const marker of [missing, failed, denied, found({ finishId: F }), found({ finishId: "f2" })]) {
      expect(judgeFinishRefusal({ marker, session: missing, finishId: F })).toBe("gone");
    }
  });

  it("unmarked ONLY when the session answered, there and not Completed, and the marker is missing or refused by the rules", () => {
    expect(judgeFinishRefusal({ marker: missing, session: sessionOpen, finishId: F })).toBe("unmarked");
    // The marker's rules not deployed: the read itself is refused.
    expect(judgeFinishRefusal({ marker: denied, session: sessionOpen, finishId: F })).toBe("unmarked");
    // An older spelling is still not Completed.
    expect(judgeFinishRefusal({ marker: missing, session: found({ status: "In Progress" }), finishId: F })).toBe("unmarked");
  });

  /* The attack, Oct 12 2026: after a take-over, the iPad it was taken from
     finished first and the credit and the older sets went back to it. A
     session another device holds and saved in within the hour is "taken". */
  it("taken: another device holds the session and saved in it within the hour; never unmarked", () => {
    const now = Date.UTC(2026, 9, 12, 15, 0);
    const fresh = { status: "In-Progress", recordingDeviceId: "d-t2", lastHeartbeatAt: new Date(now - 5 * 60_000) };
    expect(judgeFinishRefusal({ marker: missing, session: found(fresh), finishId: F, deviceId: "d-t1", now })).toBe("taken");
    // A device that can't keep an id isn't the holder either.
    expect(judgeFinishRefusal({ marker: missing, session: found(fresh), finishId: F, deviceId: null, now })).toBe("taken");
    // The trainer's own session, on a device that can't keep an id: never locked out of its own finish.
    expect(
      judgeFinishRefusal({ marker: missing, session: found({ ...fresh, trainerId: "uid-1" }), finishId: F, deviceId: null, uid: "uid-1", now }),
    ).toBe("unmarked");
    // The holder itself: the unmarked net as before.
    expect(judgeFinishRefusal({ marker: missing, session: found(fresh), finishId: F, deviceId: "d-t2", now })).toBe("unmarked");
    // Held by another device but quiet an hour (left open): never the unmarked net, which would write past the holder.
    const quiet = { ...fresh, lastHeartbeatAt: new Date(now - 2 * 60 * 60_000) };
    expect(judgeFinishRefusal({ marker: missing, session: found(quiet), finishId: F, deviceId: "d-t1", now })).toBe("refused");
    expect(heldElsewhere(quiet, "d-t1", now)).toBe(false);
    expect(heldElsewhere(fresh, "d-t1", now)).toBe(true);
    expect(heldElsewhere({ ...fresh, recordingDeviceId: "" }, "d-t1", now)).toBe(false);
  });

  /* The attack, Oct 12 2026: a colleague's "Finish it as it was" landed
     before the real finish queued on the offline iPad that ran it. */
  it("correct: another iPad's Finish it as it was, met by a finish that isn't one", () => {
    const asItWas = found({ finishId: "f2", asItWas: true });
    expect(judgeFinishRefusal({ marker: asItWas, session: sessionDone, finishId: F })).toBe("correct");
    // A second as-it-was never corrects the first.
    expect(judgeFinishRefusal({ marker: asItWas, session: sessionDone, finishId: F, asItWas: true })).toBe("elsewhere");
    // An ordinary finish that got there first is final.
    expect(judgeFinishRefusal({ marker: found({ finishId: "f2" }), session: sessionDone, finishId: F })).toBe("elsewhere");
  });

  it("refused: a marker read that failed with the session open is never unmarked", () => {
    expect(judgeFinishRefusal({ marker: failed, session: sessionOpen, finishId: F })).toBe("refused");
  });

  it("refused: a session read that failed, timed out or was refused", () => {
    for (const session of [reads.failed, reads.denied]) {
      for (const marker of [missing, failed, denied]) {
        expect(judgeFinishRefusal({ marker, session, finishId: F })).toBe("refused");
      }
    }
  });
});

describe("judgeTotalsRefusal", () => {
  it("mine when this finish already counted it", () => {
    expect(judgeTotalsRefusal(found({ finishId: "f1", countedBy: "f1", countedAt: 1 }), "f1")).toBe("mine");
  });

  it("uncounted when the marker is this finish's and not counted yet", () => {
    expect(judgeTotalsRefusal(found({ finishId: "f1" }), "f1")).toBe("uncounted");
  });

  it("refused for anything else, a failed, refused or missing read included", () => {
    expect(judgeTotalsRefusal(found({ finishId: "f2" }), "f1")).toBe("refused");
    expect(judgeTotalsRefusal(found({ finishId: "f2", countedBy: "f2", countedAt: 1 }), "f1")).toBe("refused");
    for (const r of [failed, denied, missing]) expect(judgeTotalsRefusal(r, "f1")).toBe("refused");
  });
});

describe("the errors", () => {
  it("are known by their kind", () => {
    const e = new FinishedElsewhereError("x");
    const g = new SessionGoneError("y");
    expect(isFinishedElsewhere(e)).toBe(true);
    expect(isSessionGone(e)).toBe(false);
    expect(isSessionGone(g)).toBe(true);
    expect(isFinishedElsewhere(g)).toBe(false);
    expect(isFinishedElsewhere(new Error("other"))).toBe(false);
    expect(isFinishedElsewhere(null)).toBe(false);
    expect(e.refusal).toBe("x");
    const t = new TakenOverError("z");
    expect(isTakenOver(t)).toBe(true);
    expect(isFinishedElsewhere(t)).toBe(false);
    expect(isTakenOver(e)).toBe(false);
  });
});

describe("the words", () => {
  it("name the client by first name when there is one", () => {
    expect(finishedElsewhereWords("Judy Daus")).toBe("Judy's session was already finished on another iPad. It counts once.");
    expect(sessionGoneWords("Judy Daus")).toBe("Judy's session was discarded on another iPad, so it couldn't be saved here.");
    // The action, never a button the profile doesn't show yet (the review, Oct 12 2026).
    expect(finishRefusedWords("Judy Daus")).toBe(
      "Judy's session didn't save. The sets are kept on this iPad. Open the session again from Judy's profile and press Finish.",
    );
    expect(finishRefusedAgainWords("Judy")).toMatch(/press Finish\. If it still won't save, tell your studio leader\.$/);
    expect(takenOverWords("Judy Daus")).toBe("Judy's session was taken over on another device, so it finishes there.");
    expect(correctedAsItWasWords("Judy")).toBe(
      "Judy's session was finished as it was on another iPad. This iPad's sets and weights are saved over it, and it counts once.",
    );
    expect(staleFinishedElsewhereWords("Judy")).toBe("Judy's unfinished session was already finished on another iPad. Nothing more to do.");
  });

  it("give the Wrap-up one line for each refusal", () => {
    expect(wrapUpRefusedLine("elsewhere", "Judy")).toBe("Already finished on another iPad · it counts once");
    expect(wrapUpRefusedLine("gone", "Judy")).toBe("Not saved · this session was discarded on another iPad.");
    expect(wrapUpRefusedLine("taken", "Judy")).toBe("Not finished here · it was taken over on another device, and finishes there.");
    expect(wrapUpRefusedLine("refused", "Judy Daus")).toBe("Not saved yet · open the session again from Judy's profile and press Finish.");
    expect(wrapUpRefusedLine("refused", null)).toBe("Not saved yet · open the session again from the client's profile and press Finish.");
  });

  it("say it without a name, and never guess a pronoun", () => {
    for (const w of [finishedElsewhereWords(), sessionGoneWords(null), finishRefusedWords(""), staleFinishedElsewhereWords("  "), takenOverWords(null), correctedAsItWasWords("")]) {
      expect(w).not.toMatch(/\b(her|his|she|he)\b/i);
      expect(w.length).toBeGreaterThan(10);
    }
    expect(finishedElsewhereWords()).toBe("This session was already finished on another iPad. It counts once.");
  });
});
