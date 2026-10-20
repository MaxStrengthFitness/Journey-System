// @vitest-environment jsdom
/**
 * "Solon's version | MSF original", mounted: two 44px segments, the studio's
 * first; "Hide crossed-out lines" only on the studio's version of a page
 * that has one; and the moves that can take away a line's half-written form
 * (to the original, hiding lines) wait for the page's answer.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WikiPageGuardContext } from "../../wiki/page-guard";
import { createSandboxStore } from "../markup-store";
import type { VaultViewer } from "../types";
import { VaultProvider, useVault } from "./VaultProvider";
import { VersionToggle } from "./VersionToggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWER: VaultViewer = { uid: "uid-jordan", name: "Jordan Park", canStrike: false, canNote: true, isHeadOffice: false };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function State() {
  const v = useVault();
  return <p data-t="state">{`${v.lens} ${v.showCrossed}`}</p>;
}

/** A page guard that holds every move until the test answers it. */
const held: { proceed: (() => void) | null; asked: number } = { proceed: null, asked: 0 };
const holdingGuard = (proceed: () => void) => {
  held.asked += 1;
  held.proceed = proceed;
};

async function mount(opts: { studioId?: string | null; studioName?: string; struck?: number; guarded?: boolean } = {}) {
  const studio = { id: opts.studioId === undefined ? "solon" : opts.studioId, name: opts.studioName ?? "Solon" };
  const store = createSandboxStore();
  function Harness() {
    const [struck] = useState(opts.struck ?? 0);
    const body = (
      <VaultProvider markup store={store} studio={studio} viewer={VIEWER}>
        <VersionToggle struck={struck} />
        <State />
      </VaultProvider>
    );
    return opts.guarded ? <WikiPageGuardContext.Provider value={holdingGuard}>{body}</WikiPageGuardContext.Provider> : body;
  }
  await act(async () => root.render(<Harness />));
}

const seg = (lens: "studio" | "original") => host.querySelector<HTMLButtonElement>(`.vtv__opt[data-lens="${lens}"]`);
const hideBtn = () => host.querySelector<HTMLButtonElement>('.vtv__toggle[data-action="crossed"]');
const state = () => host.querySelector('[data-t="state"]')?.textContent;
const click = (el: HTMLElement | null) =>
  act(async () => {
    if (!el) throw new Error("button not found");
    el.click();
  });

describe("VersionToggle", () => {
  beforeEach(() => {
    held.proceed = null;
    held.asked = 0;
  });

  it("offers the studio's version first, picked, and the MSF original beside it", async () => {
    await mount();
    const group = host.querySelector('.vtv__seg[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("Which version to read");
    expect([...host.querySelectorAll(".vtv__opt")].map((b) => b.textContent)).toEqual(["Solon's version", "MSF original"]);
    expect(seg("studio")?.getAttribute("aria-pressed")).toBe("true");
    expect(seg("original")?.getAttribute("aria-pressed")).toBe("false");
    expect(seg("studio")?.type).toBe("button");
  });

  it("switches to the MSF original and back", async () => {
    await mount({ struck: 2 });
    await click(seg("original"));
    expect(state()).toBe("original true");
    expect(seg("original")?.getAttribute("aria-pressed")).toBe("true");
    // Nothing to hide in the original: the second button goes.
    expect(hideBtn()).toBeNull();
    await click(seg("studio"));
    expect(state()).toBe("studio true");
  });

  it("offers to hide crossed-out lines only when the page has one", async () => {
    await mount({ struck: 0 });
    expect(hideBtn()).toBeNull();
  });

  it("hides and shows crossed-out lines, saying what the next tap does", async () => {
    await mount({ struck: 1 });
    expect(hideBtn()?.textContent).toBe("Hide crossed-out lines");
    await click(hideBtn());
    expect(state()).toBe("studio false");
    expect(hideBtn()?.textContent).toBe("Show crossed-out lines");
    await click(hideBtn());
    expect(state()).toBe("studio true");
  });

  it("draws nothing with no studio open", async () => {
    await mount({ studioId: null, struck: 3 });
    expect(host.querySelector(".vtv")).toBeNull();
    expect(state()).toBe("original true");
  });

  it("names a studio whose name ends in s with the apostrophe alone, and wraps it", async () => {
    await mount({ studioName: "Practice Studio Wes" });
    expect(seg("studio")?.textContent).toBe("Practice Studio Wes' version");
  });

  it("asks the page before going to the original or hiding lines, and moves only inside the answer", async () => {
    await mount({ struck: 1, guarded: true });
    await click(seg("original"));
    expect(held.asked).toBe(1);
    expect(state()).toBe("studio true");
    await act(async () => held.proceed?.());
    expect(state()).toBe("original true");

    // Back to the studio's version takes nothing away: no question.
    await click(seg("studio"));
    expect(held.asked).toBe(1);
    expect(state()).toBe("studio true");

    await click(hideBtn());
    expect(held.asked).toBe(2);
    expect(state()).toBe("studio true");
    await act(async () => held.proceed?.());
    expect(state()).toBe("studio false");

    // Showing them again takes nothing away either.
    await click(hideBtn());
    expect(held.asked).toBe(2);
    expect(state()).toBe("studio true");
  });

  it("tapping the version already showing does nothing and asks nothing", async () => {
    await mount({ guarded: true });
    await click(seg("studio"));
    expect(held.asked).toBe(0);
    expect(state()).toBe("studio true");
  });
});
