// @vitest-environment jsdom
/**
 * THE BRIEFING'S PLANNED FOR THE ROUTINE, MOUNTED (the routine library round,
 * Oct 23 2026; docs/rounds/2026-10-20-routine-library.md §10.2). AJ: "this one
 * is planned for the routine", with a quick toggle to add it on, and "Adds it
 * on for good". What matters, silent when wrong:
 *   - each planned machine not on today's list offers Add;
 *   - Add puts it on today's list AND marks it to join the routine at Start;
 *   - Today only takes the mark off, and the list keeps the machine;
 *   - nothing here writes (Start does: session-scope.test.ts).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Machine } from "../../types";
import { TodayList } from "./TodayList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const FLOOR = [
  { id: "m-leg-press", name: "Leg Press" },
  { id: "m-row", name: "Compound Row" },
  { id: "m-dip", name: "Seated Dip" },
  { id: "m-lumbar", name: "Lumbar" },
] as Machine[];
const nameOf = (id: string) => FLOOR.find((m) => m.id === id)?.name ?? id;

let root: Root | null = null;
let el: HTMLElement | null = null;
let seen: { ids: string[]; forGood: string[] } = { ids: [], forGood: [] };

function Harness() {
  const [ids, setIds] = useState<string[]>(["m-leg-press", "m-row"]);
  const [forGood, setForGood] = useState<string[]>([]);
  seen = { ids, forGood };
  return (
    <TodayList
      ids={ids}
      onChange={setIds}
      floor={FLOOR}
      nameOf={nameOf}
      history={{}}
      emptyWords="Nothing yet."
      onRebuild={() => {}}
      planned={["m-dip", "m-lumbar"]}
      forGood={forGood}
      onForGood={(id, on) => setForGood((now) => (on ? [...now, id] : now.filter((x) => x !== id)))}
      routineName="Strength"
    />
  );
}

async function mount() {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(<Harness />));
}
const button = (label: string) => {
  const b = Array.from(document.body.querySelectorAll("button")).find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim() === label);
  if (!b) throw new Error(`no button ${label}`);
  return b as HTMLButtonElement;
};

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe("the briefing's Planned for the routine", () => {
  it("offers each planned machine; Add puts it on today and marks it to join the routine at Start", async () => {
    await mount();
    const section = document.body.querySelector('[data-testid="briefing-planned"]')!;
    expect(section.textContent).toContain("Planned for the routine");
    expect(section.textContent).toContain("Seated Dip");
    await act(async () => button("Add Seated Dip to today and to Strength").click());
    expect(seen.ids).toEqual(["m-leg-press", "m-row", "m-dip"]);
    expect(seen.forGood).toEqual(["m-dip"]);
    expect(section.textContent).toContain("joins Strength at Start");
  });

  it("Today only takes the mark off and keeps it on today's list", async () => {
    await mount();
    await act(async () => button("Add Lumbar to today and to Strength").click());
    await act(async () => button("Keep Lumbar for today only").click());
    expect(seen.forGood).toEqual([]);
    expect(seen.ids).toContain("m-lumbar");
  });
});
