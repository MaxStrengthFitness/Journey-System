// @vitest-environment jsdom
/**
 * THE ANATOMY FIGURE'S ROOT, MOUNTED (the Learning vault redesign, Oct 19
 * 2026).
 *
 * A host may size the figure by a class on its root (the redesign's Codex
 * bento) instead of reaching into the wiki's own classes. Given one, the
 * root is also `wk__figure-sized` (wiki.css: a column the host gives a
 * height, the body taking what the controls leave). Without one, as the
 * Catalog and the machine database draw it, the root is exactly as it was:
 * no class at all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MachineFigure } from "./MachineFigure";
import { resolveMachineAnatomy } from "./anatomy";

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

async function draw(className?: string) {
  await act(async () => {
    root.render(
      <MachineFigure
        anatomy={resolveMachineAnatomy("m-leg-press")}
        view="front"
        gender="male"
        onViewChange={() => {}}
        onGenderChange={() => {}}
        className={className}
      />,
    );
  });
  return host.firstElementChild as HTMLElement;
}

describe("MachineFigure's root", () => {
  it("is unchanged where no host sizes it (the Catalog)", async () => {
    const el = await draw();
    expect(el.getAttribute("class")).toBeNull();
    expect(el.querySelector(":scope > .wk__figure")).not.toBeNull();
    expect(el.querySelector(":scope > .wk__figure-controls")).not.toBeNull();
  });

  it("carries a host's class, and the sized column the body fills", async () => {
    const el = await draw("cdx__figure-in");
    expect(el.className).toBe("wk__figure-sized cdx__figure-in");
    // The body and its controls are still the root's own children, in order.
    expect([...el.children].map((c) => c.className)).toEqual(["wk__figure", "wk__figure-controls"]);
  });
});
