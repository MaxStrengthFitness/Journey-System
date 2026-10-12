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
  judgeFinishRefusal,
  judgeTotalsRefusal,
  newFinishId,
  readFromServer,
  sessionGoneWords,
  staleFinishedElsewhereWords,
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
  });
});

describe("the words", () => {
  it("name the client by first name when there is one", () => {
    expect(finishedElsewhereWords("Judy Daus")).toBe("Judy's session was already finished on another iPad. It counts once.");
    expect(sessionGoneWords("Judy Daus")).toBe("Judy's session was discarded on another iPad, so it couldn't be saved here.");
    expect(finishRefusedWords("Judy Daus")).toBe(
      "Judy's session didn't save. The sets are kept on this iPad. Open Judy's profile, tap Resume or finish, then Finish again.",
    );
    expect(finishRefusedAgainWords("Judy")).toMatch(/Finish again\. If it still won't save, tell your studio leader\.$/);
    expect(staleFinishedElsewhereWords("Judy")).toBe("Judy's unfinished session was already finished on another iPad. Nothing more to do.");
  });

  it("say it without a name, and never guess a pronoun", () => {
    for (const w of [finishedElsewhereWords(), sessionGoneWords(null), finishRefusedWords(""), staleFinishedElsewhereWords("  ")]) {
      expect(w).not.toMatch(/\b(her|his|she|he)\b/i);
      expect(w.length).toBeGreaterThan(10);
    }
    expect(finishedElsewhereWords()).toBe("This session was already finished on another iPad. It counts once.");
  });
});
