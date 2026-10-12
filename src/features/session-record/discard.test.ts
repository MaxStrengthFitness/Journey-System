/**
 * Discarding a session left open (the sessions round, Oct 12 2026): one
 * batch, issued at once, then a sweep; and the check before the final tap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  events: [] as string[],
  batches: [] as Array<{ deletes: string[] }>,
  swept: [] as string[],
  readDocs: [] as Array<{ id: string; ref: { path: string } }>,
  refuse: false,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  where: (...a: unknown[]) => ({ where: a }),
  query: (c: unknown, ...w: unknown[]) => ({ c, w }),
  getDocs: async () => {
    fs.events.push("read");
    return { docs: fs.readDocs };
  },
  getDocFromServer: vi.fn(),
  writeBatch: () => {
    const deletes: string[] = [];
    return {
      delete: (ref: { path: string }) => deletes.push(ref.path),
      commit: async () => {
        fs.events.push(`commit:${deletes.length}`);
        if (fs.batches.length > 0) fs.swept.push(...deletes);
        fs.batches.push({ deletes });
        if (fs.refuse) throw Object.assign(new Error("no"), { code: "permission-denied" });
      },
    };
  },
}));

import {
  checkStillLeftOpen,
  discardIds,
  discardStaleSession,
  judgeStillLeftOpen,
  stillLeftOpenWords,
} from "./discard";

beforeEach(() => {
  fs.events = [];
  fs.batches = [];
  fs.swept = [];
  fs.readDocs = [];
  fs.refuse = false;
});

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe("discardIds", () => {
  it("is the screen's sets, every machine's ids and what a read found, once each", () => {
    const held = {
      a: { id: "s1_m-leg-press", sessionId: "s1" },
      b: { id: "s9_m-leg-press", sessionId: "s9" },
    };
    const ids = discardIds("s1", held, ["m-leg-press", "m-torso-rotation"], ["s1_m-leg-press", "s1_extra"]);
    expect(ids.sort()).toEqual(["s1_extra", "s1_m-leg-press", "s1_m-torso-rotation_Left", "s1_m-torso-rotation_Right"].sort());
    expect(new Set(ids).size).toBe(ids.length);
    // Another session's set is never in it.
    expect(ids).not.toContain("s9_m-leg-press");
  });
});

describe("discardStaleSession", () => {
  it("issues ONE batch with every set and the session before any read, then sweeps what it didn't know", async () => {
    fs.readDocs = [
      { id: "s1_m-leg-press", ref: { path: "exerciseLogs/s1_m-leg-press" } },
      { id: "s1_other-ipad", ref: { path: "exerciseLogs/s1_other-ipad" } },
    ];
    const p = discardStaleSession({} as never, { id: "s1", sessionMachineIds: ["m-leg-press"] }, { a: { id: "s1_m-leg-press", sessionId: "s1" } });
    // Issued at once: the batch is committed before anything is read.
    expect(fs.events[0]).toBe("commit:2");
    expect(fs.batches[0].deletes).toEqual(["exerciseLogs/s1_m-leg-press", "sessions/s1"]);
    await p;
    await flush();
    expect(fs.events).toEqual(["commit:2", "read", "commit:1"]);
    expect(fs.swept).toEqual(["exerciseLogs/s1_other-ipad"]);
  });

  it("never deletes the sets in a commit of their own before the session: one batch, the session in it", async () => {
    await discardStaleSession({} as never, { id: "s1" }, {}, ["m-pulldown"]);
    expect(fs.batches[0].deletes).toContain("sessions/s1");
    expect(fs.batches[0].deletes).toContain("exerciseLogs/s1_m-pulldown");
  });

  it("a refused batch is returned for the toast, and nothing is swept", async () => {
    fs.refuse = true;
    await expect(discardStaleSession({} as never, { id: "s1" }, {}, [])).rejects.toThrow();
    await flush();
    expect(fs.events).toEqual(["commit:1"]);
  });
});

describe("checkStillLeftOpen", () => {
  const now = Date.UTC(2026, 9, 12, 15, 0);
  const shown = new Date(now - 3 * 60 * 60_000);
  const found = (data: Record<string, unknown>) => ({ kind: "found" as const, data });

  it("ok: still there, still In-Progress, still quiet, nothing newer than what was shown", () => {
    expect(judgeStillLeftOpen(found({ status: "In-Progress", lastHeartbeatAt: shown }), shown, now)).toBe("ok");
  });

  it("active: a newer heartbeat, or live again", () => {
    expect(judgeStillLeftOpen(found({ status: "In-Progress", lastHeartbeatAt: new Date(now - 2 * 60 * 60_000) }), shown, now)).toBe("active");
    expect(judgeStillLeftOpen(found({ status: "In-Progress", lastHeartbeatAt: new Date(now - 60_000) }), shown, now)).toBe("active");
    // A pending server stamp is now: live.
    expect(judgeStillLeftOpen(found({ status: "In-Progress", lastHeartbeatAt: null, createdAt: null }), shown, now)).toBe("active");
  });

  it("gone, done, and unknown for a read that failed or was refused", () => {
    expect(judgeStillLeftOpen({ kind: "missing" }, shown, now)).toBe("gone");
    expect(judgeStillLeftOpen(found({ status: "Completed" }), shown, now)).toBe("done");
    expect(judgeStillLeftOpen({ kind: "failed" }, shown, now)).toBe("unknown");
    expect(judgeStillLeftOpen({ kind: "denied" }, shown, now)).toBe("unknown");
  });

  it("reads the session once from the server; a read that throws is unknown", async () => {
    const read = vi.fn(async () => found({ status: "In-Progress", lastHeartbeatAt: shown }));
    expect(await checkStillLeftOpen({} as never, { id: "s1" }, shown, { now, read })).toBe("ok");
    expect(read).toHaveBeenCalledTimes(1);
    expect((read.mock.calls[0] as unknown[])[0]).toEqual({ path: "sessions/s1" });
    const broken = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await checkStillLeftOpen({} as never, { id: "s1" }, shown, { now, read: broken })).toBe("unknown");
  });

  it("says why the final Discard is held back", () => {
    expect(stillLeftOpenWords("ok", "Sam")).toBeNull();
    expect(stillLeftOpenWords("active", "Sam")).toBe("It's been active since you opened this. Check with Sam first.");
    expect(stillLeftOpenWords("gone")).toBe("That session was already discarded.");
    expect(stillLeftOpenWords("done")).toBe("That session was finished on another iPad.");
    expect(stillLeftOpenWords("unknown")).toBe("Couldn't check that session. Try again.");
  });
});
