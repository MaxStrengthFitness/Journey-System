import { describe, expect, it, vi } from "vitest";
import {
  COPIED_LINE,
  COPY_FAILED_LINE,
  SHARE_REFUSED_LINE,
  copyShareLink,
  newShareId,
  shareRecordOf,
  shareWords,
  type CopyShareIo,
} from "./share";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

describe("newShareId", () => {
  it("is a UUID without dashes when the iPad has one", () => {
    const id = newShareId({ randomUUID: () => "5f1f4f8c-2d8b-4c6a-9e0f-1a2b3c4d5e6f", getRandomValues: (a) => a });
    expect(id).toBe("5f1f4f8c2d8b4c6a9e0f1a2b3c4d5e6f");
    expect(id).toMatch(/^[A-Za-z0-9]{20,32}$/);
  });

  it("is 20 base-62 characters otherwise", () => {
    const id = newShareId({
      getRandomValues: ((a: Uint8Array) => {
        for (let i = 0; i < a.length; i++) a[i] = (i * 37) % 256;
        return a;
      }) as Crypto["getRandomValues"],
    });
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    // What the rules accept, and nothing a URL would encode.
    expect(id).not.toMatch(/[.\/~\s]/);
  });

  it("uses the browser's crypto by default", () => {
    expect(newShareId()).toMatch(/^[A-Za-z0-9]{20,32}$/);
  });
});

describe("the copied words", () => {
  it("say the kind and the link, never a name", () => {
    expect(shareWords("client", "https://j/t/abc")).toBe("A client · Open in Journey https://j/t/abc");
    expect(shareWords("session", "https://j/t/abc")).toBe("A session · Open in Journey https://j/t/abc");
  });
});

function io(over: Partial<CopyShareIo> = {}): CopyShareIo & { copied: string[]; written: unknown[]; said: string[] } {
  const copied: string[] = [];
  const written: unknown[] = [];
  const said: string[] = [];
  return {
    copy: (w) => {
      copied.push(w);
      return Promise.resolve();
    },
    write: (id, share) => {
      written.push({ id, ...share });
      return Promise.resolve();
    },
    origin: "https://journey.test",
    uid: "uid1",
    say: { success: (l) => said.push(l), error: (l) => said.push(l) },
    makeId: () => "abcdefghij1234567890",
    copied,
    written,
    said,
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("copyShareLink", () => {
  it("copies during the tap and writes without waiting; the link carries the share id only", async () => {
    const x = io();
    const url = copyShareLink({ kind: "client", clientId: "100000123", studioId: "solon" }, x);
    expect(url).toBe("https://journey.test/t/abcdefghij1234567890");
    expect(x.copied).toEqual(["A client · Open in Journey https://journey.test/t/abcdefghij1234567890"]);
    expect(x.written).toEqual([
      { id: "abcdefghij1234567890", kind: "client", targetId: "100000123", clientId: "100000123", studioId: "solon", createdBy: "uid1" },
    ]);
    expect(url).not.toContain("100000123");
    await flush();
    expect(x.said).toEqual([COPIED_LINE]);
  });

  it("a session share names the session as its target", () => {
    const x = io();
    copyShareLink({ kind: "session", targetId: "sess1", clientId: "100000123", studioId: "solon" }, x);
    expect(x.written[0]).toMatchObject({ kind: "session", targetId: "sess1", clientId: "100000123" });
    expect(x.copied[0]).toMatch(/^A session · Open in Journey /);
  });

  it("says when the write was refused: the copied link won't open", async () => {
    const x = io({ write: () => Promise.reject(new Error("permission-denied")) });
    expect(copyShareLink({ kind: "client", clientId: "c", studioId: "s" }, x)).not.toBeNull();
    await flush();
    expect(x.said).toContain(SHARE_REFUSED_LINE);
  });

  it("says when the clipboard refused", async () => {
    const x = io({ copy: () => Promise.reject(new Error("no")) });
    copyShareLink({ kind: "client", clientId: "c", studioId: "s" }, x);
    await flush();
    expect(x.said).toContain(COPY_FAILED_LINE);
  });

  it("makes nothing when nobody is signed in", () => {
    const x = io({ uid: null });
    expect(copyShareLink({ kind: "client", clientId: "c", studioId: "s" }, x)).toBeNull();
    expect(x.copied).toEqual([]);
    expect(x.written).toEqual([]);
  });
});

describe("shareRecordOf", () => {
  it("reads a share back and refuses anything else", () => {
    expect(shareRecordOf({ kind: "client", targetId: "c", clientId: "c", studioId: "s", createdBy: "u", createdAt: 1 })).toEqual({
      kind: "client",
      targetId: "c",
      clientId: "c",
      studioId: "s",
      createdBy: "u",
      createdAt: 1,
    });
    expect(shareRecordOf({ kind: "note", targetId: "c", clientId: "c", studioId: "s" })).toBeNull();
    expect(shareRecordOf({ kind: "client", clientId: "c", studioId: "s" })).toBeNull();
    expect(shareRecordOf(null)).toBeNull();
  });
});
