import { describe, expect, it } from "vitest";
import { COPIED_LINE, COPY_FAILED_LINE } from "./share";
import { copyPlainLink, linkWords, type CopyLinkIo } from "./copy-link";

function io(copyOk = true): CopyLinkIo & { copied: string[]; said: string[] } {
  const copied: string[] = [];
  const said: string[] = [];
  return {
    copy: (w) => {
      copied.push(w);
      return copyOk ? Promise.resolve() : Promise.reject(new Error("no"));
    },
    origin: "https://journey.test",
    say: { success: (l) => said.push(l), error: (l) => said.push(l) },
    copied,
    said,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("copyPlainLink", () => {
  it("copies an ask's link with its kind, never its title", async () => {
    const x = io();
    const url = copyPlainLink({ kind: "ask", askId: "req1", studioId: "solon" }, x);
    expect(url).toBe("https://journey.test/a/req1?studio=solon");
    expect(x.copied).toEqual(["An ask · Open in Journey https://journey.test/a/req1?studio=solon"]);
    await flush();
    expect(x.said).toEqual([COPIED_LINE]);
  });

  it("copies a Learning page's link", () => {
    const x = io();
    copyPlainLink({ kind: "learning", ref: { kind: "academy-topic", id: "hydration" } }, x);
    expect(x.copied).toEqual(["A Learning page · Open in Journey https://journey.test/l/academy-topic~hydration"]);
    expect(linkWords("learning", "u")).toBe("A Learning page · Open in Journey u");
  });

  it("copies nothing for a page it cannot carry", () => {
    const x = io();
    expect(copyPlainLink({ kind: "learning", ref: { kind: "machine", id: "a.b" } }, x)).toBeNull();
    expect(x.copied).toEqual([]);
  });

  it("says when the clipboard refused", async () => {
    const x = io(false);
    copyPlainLink({ kind: "ask", askId: "req1", studioId: "solon" }, x);
    await flush();
    expect(x.said).toEqual([COPY_FAILED_LINE]);
  });
});
