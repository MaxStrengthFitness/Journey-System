// @vitest-environment jsdom
/**
 * The signed-out landing for a Journey link, MOUNTED: the sentence, Sign in
 * first, and, on an iPad outside the Home Screen app, the Journey-icon line
 * with Copy link; the link itself is what gets copied.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LINK_LANDING_TITLE, LinkLanding, OPEN_IN_ICON_LINE, outsideHomeScreenOnIPad } from "./LinkLanding";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount(ui: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  return host;
}

const HREF = "https://journey.test/t/abc123";

describe("LinkLanding", () => {
  it("says it is a Journey link, with Sign in first", async () => {
    const onSignIn = vi.fn();
    const el = await mount(<LinkLanding href={HREF} offerIcon={false} onSignIn={onSignIn} />);
    expect(el.textContent).toContain(LINK_LANDING_TITLE);
    const buttons = [...el.querySelectorAll("button")];
    expect(buttons[0].textContent).toBe("Sign in");
    expect(el.textContent).not.toContain(OPEN_IN_ICON_LINE);
    // The id never appears as words on the page: the link is copied, not read out.
    expect(el.textContent).not.toContain("abc123");
    await act(async () => buttons[0].click());
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("offers the Journey icon and Copy link on an iPad outside the app, and copies the link itself", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const el = await mount(<LinkLanding href={HREF} offerIcon onSignIn={() => {}} />);
    expect(el.textContent).toContain(OPEN_IN_ICON_LINE);
    const copy = [...el.querySelectorAll("button")].find((b) => b.textContent === "Copy link")!;
    expect(copy).toBeTruthy();
    expect(copy.className).toContain("fd-btn--link");
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith(HREF);
    expect(el.textContent).toContain("Copied");
  });

  it("says when the clipboard refused", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) }, configurable: true });
    const el = await mount(<LinkLanding href={HREF} offerIcon onSignIn={() => {}} />);
    const copy = [...el.querySelectorAll("button")].find((b) => b.textContent === "Copy link")!;
    await act(async () => copy.click());
    expect(el.textContent).toContain("Couldn't copy");
  });
});

describe("outsideHomeScreenOnIPad", () => {
  const win = (nav: Partial<Navigator> & { standalone?: boolean }, standalone = false) =>
    ({
      navigator: { userAgent: "", platform: "", maxTouchPoints: 0, ...nav },
      matchMedia: () => ({ matches: standalone }),
    }) as unknown as Window;

  it("is true for Safari on an iPad, by its name or by a Mac with touch", () => {
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" }))).toBe(true);
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 5 }))).toBe(true);
  });

  it("is false in the Home Screen app, on a Mac, and on a PC", () => {
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" }, true))).toBe(false);
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", standalone: true }))).toBe(false);
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 0 }))).toBe(false);
    expect(outsideHomeScreenOnIPad(win({ userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "Win32" }))).toBe(false);
  });
});
