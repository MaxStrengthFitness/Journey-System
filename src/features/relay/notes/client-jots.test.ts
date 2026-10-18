import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ saved: [] as unknown[], appended: [] as unknown[], read: [] as unknown[] as Record<string, unknown>[], readFails: false }));

vi.mock("../../../firebase", () => ({ db: { __fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    query: (ref: unknown) => ref,
    where: () => ({}),
    limit: () => ({}),
    getDocs: async () => {
      if (calls.readFails) throw new Error("offline");
      return { docs: calls.read.map((d) => ({ id: String(d.id), data: () => d })) };
    },
  };
});
vi.mock("./mutations", () => ({
  notesRef: (uid: string) => ({ __path: `trainers/${uid}/notes` }),
  newNoteId: () => "new-note",
  saveNote: async (args: unknown) => void calls.saved.push(args),
  appendNoteLog: async (uid: string, noteId: string, entry: unknown) => void calls.appended.push({ uid, noteId, entry }),
}));

import { jotAbout, jotHome, recentJots } from "./client-jots";
import type { TrainerNote } from "./types";

const note = (over: Partial<TrainerNote>): TrainerNote =>
  ({
    id: "n1",
    title: "Dana — working notes",
    body: "",
    kind: "note",
    folderId: null,
    clientIds: ["c1"],
    clientNames: { c1: "Dana Sample" },
    pinned: false,
    sharedWith: null,
    links: [],
    log: [],
    teamShare: null,
    updatedAt: new Date("2026-10-10T12:00:00Z"),
    ...over,
  }) as TrainerNote;

beforeEach(() => {
  calls.saved.length = 0;
  calls.appended.length = 0;
  calls.read = [];
  calls.readFails = false;
});

describe("your own notes about a client (the briefing round, phase 4)", () => {
  it("a jot lands on the newest note about them that isn't on the record", () => {
    const older = note({ id: "old", updatedAt: new Date("2026-10-01T12:00:00Z") });
    const shared = note({ id: "shared", sharedWith: "c1", updatedAt: new Date("2026-10-12T12:00:00Z") });
    expect(jotHome([older, shared, note({})])?.id).toBe("n1");
    expect(jotHome([])).toBeNull();
  });

  it("lists the newest jots about this client first", () => {
    const n = note({
      log: [
        { id: "a", at: 1, text: "Guardians bet: ask how it went", clientId: "c1" },
        { id: "b", at: 3, text: "Prefers the early slot", clientId: null },
        { id: "c", at: 2, text: "About someone else", clientId: "c2" },
      ],
    });
    expect(recentJots([n], "c1", 3).map((j) => j.entry.id)).toEqual(["b", "a"]);
  });

  it("adds to their working note when there is one", async () => {
    await jotAbout({ uid: "u1", clientId: "c1", name: "Dana Sample", text: "Ask about the Guardians bet", notes: [note({})] });
    expect(calls.saved).toEqual([]);
    expect(calls.appended).toEqual([expect.objectContaining({ uid: "u1", noteId: "n1" })]);
  });

  it("starts a working note when there is none, read once when it wasn't handed one", async () => {
    await jotAbout({ uid: "u1", clientId: "c1", name: "Dana Sample", text: "Ask about the Guardians bet" });
    expect(calls.saved).toHaveLength(1);
    expect(calls.appended).toEqual([expect.objectContaining({ noteId: "new-note" })]);
  });

  it("never loses the words: a read that fails starts a note rather than drop them", async () => {
    calls.readFails = true;
    await jotAbout({ uid: "u1", clientId: "c1", name: "Dana Sample", text: "Ask about the Guardians bet" });
    expect(calls.appended).toHaveLength(1);
  });

  it("writes nothing for an empty note", async () => {
    await jotAbout({ uid: "u1", clientId: "c1", name: "Dana Sample", text: "   ", notes: [note({})] });
    expect(calls.appended).toEqual([]);
  });
});
