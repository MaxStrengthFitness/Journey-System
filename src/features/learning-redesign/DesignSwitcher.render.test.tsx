// @vitest-environment jsdom
/**
 * THE PROTOTYPE BAR (the Learning vault redesign, Oct 19 2026): the Mix and
 * Current in one switch, "View as" only while a prototype is on, and a tap on what
 * is already picked does nothing. LearningView asks the gate; this only
 * reports the pick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The wiki barrel (imported for its tokens) reaches the app's firebase module.
vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { DesignSwitcher } from "./DesignSwitcher";
import type { LearningDesign } from "../learning-vault/types";
import type { ViewAs } from "./design";

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

async function mount(design: LearningDesign, viewAs: ViewAs = "trainer") {
  const onDesign = vi.fn();
  const onViewAs = vi.fn();
  await act(async () => {
    root.render(<DesignSwitcher design={design} onDesign={onDesign} viewAs={viewAs} onViewAs={onViewAs} />);
  });
  return { onDesign, onViewAs };
}

const groups = () => [...host.querySelectorAll('[role="group"]')];
const options = (group: Element) => [...group.querySelectorAll("button")];
const named = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent === name) ?? null;
const click = (el: Element | null) =>
  act(async () => {
    if (!el) throw new Error("button not found");
    (el as HTMLElement).click();
  });

describe("the prototype bar", () => {
  it("says it is a prototype and offers the Mix and Current, Current picked", async () => {
    await mount("current");
    expect(host.querySelector(".ld__tag")?.textContent).toBe("Prototype");
    const [designs] = groups();
    expect(designs.getAttribute("aria-label")).toBe("Design");
    expect(options(designs).map((b) => b.getAttribute("aria-label"))).toEqual(["Mix", "Current"]);
    expect(options(designs).map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("shows no View as while today's Learning is on", async () => {
    await mount("current");
    expect(groups()).toHaveLength(1);
    expect(host.textContent).not.toContain("View as");
  });

  it("shows View as while a prototype is on, with the role it reads as picked", async () => {
    await mount("codex", "leader");
    expect(groups()).toHaveLength(2);
    const viewAs = groups()[1];
    expect(viewAs.getAttribute("aria-labelledby")).toBe("ld-view-as");
    expect(host.querySelector("#ld-view-as")?.textContent).toBe("View as");
    expect(options(viewAs).map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Trainer", "false"],
      ["Leader", "true"],
      ["Head office", "false"],
    ]);
    expect(named("Mix")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports a pick, and nothing for a tap on what is already picked", async () => {
    const { onDesign, onViewAs } = await mount("codex", "trainer");
    await click(named("Current"));
    expect(onDesign).toHaveBeenCalledWith("current");
    await click(named("Mix"));
    expect(onDesign).toHaveBeenCalledTimes(1);
    await click(named("Head office"));
    expect(onViewAs).toHaveBeenCalledWith("head-office");
    await click(named("Trainer"));
    expect(onViewAs).toHaveBeenCalledTimes(1);
  });

  it("every option is a real button with its words whole", async () => {
    await mount("codex", "head-office");
    for (const b of host.querySelectorAll("button")) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.className).toBe("ld__opt");
      expect((b.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});
