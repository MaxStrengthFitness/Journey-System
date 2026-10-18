// @vitest-environment jsdom
/**
 * Mounts the Wrap-up's next-session weight (the Atlas answers, Oct 2 2026; on
 * each of today's rows since the Wrap-up round, Oct 18 2026). It starts at
 * today's weight, with − / + in two pounds and the number to type into; each
 * change is handed to the host the moment it is made. Nothing suggests a
 * weight.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextWeightStepper, takesNextWeight } from "./NextWeightCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<StrictMode>{ui}</StrictMode>));
  mounted.push({ root, host });
  return host;
}
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: Element | null) => {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
  await settle();
};

const lines = [
  { machineId: "m1", name: "Leg Press", outcome: "performed", weight: 100, count: 9 },
  { machineId: "m2", name: "Chest Press", outcome: "skipped", weight: 60, count: null },
  { machineId: "m3", name: "Torso Rotation", outcome: "not_reached", weight: null, count: null },
] as any[];

describe("the next session's weight on a row", () => {
  it("starts from today's weight, in two-pound steps both ways, and says it saved", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightStepper line={lines[0]} onSave={onSave} />);
    const row = host.querySelector('[data-testid="next-weight-row"]')!;
    const input = row.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("100");
    expect(row.querySelector("label")!.hasAttribute("data-changed")).toBe(false);
    await click(row.querySelector('button[aria-label^="Raise"]'));
    await click(row.querySelector('button[aria-label^="Raise"]'));
    expect(onSave).toHaveBeenLastCalledWith("m1", 104, 100);
    expect(input.value).toBe("104");
    // Changed from today: the number's edge says so; the words are for a screen reader.
    expect(row.querySelector("label")!.hasAttribute("data-changed")).toBe(true);
    const status = row.querySelector('[data-testid="next-weight-state"]')!;
    expect(status.className).toContain("sr-only");
    expect(status.textContent).toBe("Up 4 lb from today. Saved for next time");
    await click(row.querySelector('button[aria-label^="Lower"]'));
    expect(onSave).toHaveBeenLastCalledWith("m1", 102, 100);
    // Every button is at least 44px.
    for (const b of Array.from(row.querySelectorAll("button"))) {
      expect(b.className).toContain("min-h-11");
      expect(b.className).toContain("min-w-11");
    }
    // It never proposes a weight or a direction.
    expect(host.textContent).not.toMatch(/suggest|try|should|recommend/i);
  });

  it("takes a typed weight when the field is left", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightStepper line={lines[0]} onSave={onSave} />);
    const input = host.querySelector('[data-testid="next-weight-row"] input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "96");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await settle();
    expect(onSave).toHaveBeenCalledWith("m1", 96, 100);
    expect(host.textContent).toContain("Down 4 lb from today");
  });

  it("puts back a typed entry that isn't a weight, and saves nothing", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightStepper line={lines[0]} onSave={onSave} />);
    const input = host.querySelector('[data-testid="next-weight-row"] input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "abc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(input.value).toBe("100");
  });

  it("says it wasn't saved when the write failed, in words on the screen", async () => {
    const host = await mount(<NextWeightStepper line={lines[0]} onSave={vi.fn(async () => false)} />);
    await click(host.querySelector('[data-testid="next-weight-row"] button[aria-label^="Raise"]'));
    expect(host.textContent).toContain("Not saved. Set it again.");
  });

  it("is offered only for a machine performed with a weight", () => {
    expect(lines.map(takesNextWeight)).toEqual([true, false, false]);
  });
});
