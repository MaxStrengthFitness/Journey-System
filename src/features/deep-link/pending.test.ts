import { afterEach, describe, expect, it } from "vitest";
import { forgetPersonalMemory } from "../sign-out/memory";
import {
  LINK_TAB_KEY,
  __setPendingForTests,
  captureLinkFromAddress,
  clearPendingLink,
  isLinkTab,
  peekPendingLink,
  type AddressLike,
} from "./pending";

function fakeWindow(pathname: string, search = ""): AddressLike & { replaced: string[]; store: Map<string, string> } {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  return {
    location: { pathname, search, href: `https://journey.test${pathname}${search}` },
    history: { replaceState: (_d, _u, url) => replaced.push(String(url)) },
    sessionStorage: { setItem: (k, v) => void store.set(k, v), getItem: (k) => store.get(k) ?? null },
    replaced,
    store,
  };
}

afterEach(() => __setPendingForTests(null));

describe("the link a tab opened with", () => {
  it("is remembered, flags the tab, and replaces the address with /", () => {
    const win = fakeWindow("/t/abc123");
    const got = captureLinkFromAddress(win);
    expect(got).toEqual({ target: { kind: "share", shareId: "abc123" }, href: "https://journey.test/t/abc123" });
    expect(peekPendingLink()).toBe(got);
    expect(win.replaced).toEqual(["/"]);
    expect(win.store.get(LINK_TAB_KEY)).toBe("1");
    expect(isLinkTab(win.sessionStorage)).toBe(true);
  });

  it("leaves a plain address alone", () => {
    const win = fakeWindow("/", "?view=trainer-hub");
    expect(captureLinkFromAddress(win)).toBeNull();
    expect(peekPendingLink()).toBeNull();
    expect(win.replaced).toEqual([]);
    expect(isLinkTab(win.sessionStorage)).toBe(false);
  });

  it("keeps the ask's studio from the query", () => {
    const win = fakeWindow("/a/req1", "?studio=solon");
    expect(captureLinkFromAddress(win)?.target).toEqual({ kind: "ask", askId: "req1", studioId: "solon" });
  });

  it("is forgotten at sign-out and when it is cleared", () => {
    captureLinkFromAddress(fakeWindow("/l/machine~m-leg-press"));
    expect(peekPendingLink()).not.toBeNull();
    forgetPersonalMemory();
    expect(peekPendingLink()).toBeNull();

    captureLinkFromAddress(fakeWindow("/l/machine~m-leg-press"));
    clearPendingLink();
    expect(peekPendingLink()).toBeNull();
  });

  it("survives storage and history that refuse", () => {
    const win = fakeWindow("/t/abc");
    win.sessionStorage = {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: () => {
        throw new Error("no");
      },
    };
    win.history.replaceState = () => {
      throw new Error("no");
    };
    expect(captureLinkFromAddress(win)?.target).toEqual({ kind: "share", shareId: "abc" });
    expect(isLinkTab(win.sessionStorage)).toBe(false);
  });
});
