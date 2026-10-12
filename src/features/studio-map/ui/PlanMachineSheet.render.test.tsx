// @vitest-environment jsdom
/**
 * ADD A MACHINE TO BUY, MOUNTED (the studio map, phase 3, Oct 2026).
 *
 * The twenty movements by the Academy's five families, or Something else;
 * a recorded model (its size looked up live, never copied), a typed size,
 * or Size not known yet; Add it hands back exactly that, and what is chosen
 * is unsaved work until then.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { PlanMachineSheet } = await import("./PlanMachineSheet");
const { UnsavedChangesProvider, useUnsavedStatus } = await import("../../unsaved-changes");
const { modelsReadOf } = await import("../../catalog/models");
const { IMAGINE_STRENGTH_MODELS, seedModelDocument } = await import("../imagine-strength");

const IS = modelsReadOf(IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })));
const ABD = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-hip-abd")!;

let host: HTMLDivElement;
let root: Root;
let status: { anyDirty: () => boolean } = { anyDirty: () => false };

function Status() {
  status = useUnsavedStatus();
  return null;
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(models = IS) {
  const added = vi.fn();
  const cancel = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <UnsavedChangesProvider>
        <Status />
        <PlanMachineSheet models={models} onAdd={added} onCancel={cancel} />
      </UnsavedChangesProvider>,
    ),
  );
  return { added, cancel };
}

const button = (text: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? "")));
const click = (el: Element | undefined) => {
  expect(el, "the button is there").toBeTruthy();
  act(() => (el as HTMLElement).click());
};
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("Add a machine to buy", () => {
  it("lists the twenty by the Academy's five families, then Something else", () => {
    mount();
    const families = [...host.querySelectorAll(".smap-plan__family")].map((p) => p.textContent);
    expect(families).toEqual(["Upper Body — Pull", "Upper Body — Push", "Lower Body", "Trunk / Spine / Core", "Hips"]);
    expect(host.querySelectorAll(".smap-plan__group .smap-chip")).toHaveLength(20);
    expect(button("Something else")).toBeTruthy();
  });

  it("names a recorded model, so its size is looked up live, and the name is the model's own", () => {
    const { added } = mount();
    click(button("Abduction"));
    expect(button("Abduction")!.getAttribute("aria-pressed")).toBe("true");
    click(button(/^IS2027W Hip Abductor · /));
    click(button("Add it"));
    expect(added).toHaveBeenCalledWith({ movementId: "m-hip-abd", modelId: ABD.id, label: "IS2027W Hip Abductor", typed: null });
  });

  it("stores a typed size, and Size not known yet adds a marker with none", () => {
    const { added } = mount();
    click(button("Leg Press"));
    click(button("Type its size"));
    type(host.querySelector<HTMLInputElement>("#smap-plan-size-length-ft")!, "6");
    type(host.querySelector<HTMLInputElement>("#smap-plan-size-width-ft")!, "4");
    click(button("Save"));
    expect(host.textContent).toContain("6 ft long × 4 ft wide");
    click(button("Add it"));
    expect(added).toHaveBeenLastCalledWith({ movementId: "m-leg-press", modelId: null, label: "Leg Press", typed: { lengthMm: 1829, widthMm: 1219, heightMm: null } });

    click(button("Something else"));
    type(host.querySelector<HTMLInputElement>("#smap-buy-name")!, "Hip sled");
    click(button("Size not known yet"));
    click(button("Add it"));
    expect(added).toHaveBeenLastCalledWith({ movementId: null, modelId: null, label: "Hip sled", typed: null });
  });

  it("says when head office hasn't recorded a size, and asks for a machine before Add it", () => {
    const { added } = mount({ state: "ready", models: [], byId: {} });
    click(button("Add it"));
    expect(host.textContent).toContain("Pick the machine first.");
    click(button("Neck") ?? button("Cervical Extension"));
    expect(host.textContent).toContain("Head office hasn't recorded a size for this machine yet.");
    expect(added).not.toHaveBeenCalled();
  });

  it("holds what is chosen as unsaved work until Add it", () => {
    mount();
    expect(status.anyDirty()).toBe(false);
    click(button("Abduction"));
    expect(status.anyDirty()).toBe(true);
  });
});
