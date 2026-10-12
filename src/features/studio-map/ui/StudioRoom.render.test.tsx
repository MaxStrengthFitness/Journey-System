// @vitest-environment jsdom
/**
 * THE DRAWING, MOUNTED (the studio map, Oct 2026): the floor's boxes with
 * no edge and one wall path, a door's gap and its swing, an area with its
 * name (dropped whole when it doesn't fit), the safety layer above a
 * machine standing over it with its words always drawn and never dimmed,
 * every machine's aria-label, a machine still to buy, a marker for one with
 * no size, Enter and a tap, and no colour written in an attribute.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlanRoom } from "../layout";
import { ftMm } from "../room";
import { StudioRoom, type MapMachine } from "./StudioRoom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom may have no PointerEvent: a MouseEvent of the same type reaches React's handlers just the same. */
const pointer = (type: string, init: { clientX: number; clientY: number }) =>
  new (globalThis.PointerEvent ?? MouseEvent)(type, { ...init, bubbles: true, cancelable: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

const room: PlanRoom = {
  areaSqFt: 1800,
  boxes: [{ id: "bx-1", x: 0, y: 0, w: ftMm(60), h: ftMm(30) }],
  places: [
    { id: "pc-1", kind: "door", x: -76, y: ftMm(22), w: 152, h: ftMm(3) },
    { id: "pc-2", kind: "aed", x: 3000, y: 3000, w: 305, h: 305 },
    { id: "pc-3", kind: "changing", x: ftMm(40), y: ftMm(2), w: ftMm(10), h: ftMm(8) },
    { id: "pc-4", kind: "desk", x: ftMm(20), y: ftMm(20), w: ftMm(2), h: 400, label: "The front desk by the window" },
    { id: "pc-5", kind: "pillar", x: ftMm(30), y: ftMm(15), w: 406, h: 406 },
  ],
};
const machines: MapMachine[] = [
  // Standing over the AED.
  { id: "m-leg-press", name: "Leg Press", code: "LP", placement: { machineId: "m-leg-press", x: 3150, y: 3150, rotationDeg: 0 }, size: { lengthMm: 2120, widthMm: 1260, heightMm: null } },
  { id: "m-neck", name: "Neck", code: "NK", placement: { machineId: "m-neck", x: 9000, y: 3000, rotationDeg: 90 }, size: null },
  {
    id: "pm-1",
    name: "Hip Abductor",
    code: "",
    planned: true,
    placement: { kind: "planned", id: "pm-1", label: "Hip Abductor", movementId: "m-hip-abd", modelId: null, x: 12000, y: 6000, rotationDeg: 0 },
    size: { lengthMm: 1880, widthMm: 1300, heightMm: null },
  },
];

function mount(props: Partial<Parameters<typeof StudioRoom>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const picks: string[] = [];
  act(() =>
    root!.render(
      <StudioRoom ariaLabel="Solon's map" room={room} machines={machines} widthPx={800} onPick={(id) => picks.push(id)} {...props} />,
    ),
  );
  return { svg: host.querySelector("svg")!, picks };
}

describe("the drawing", () => {
  it("draws the floor's boxes with no edge, one wall path, and a door's gap and swing", () => {
    const { svg } = mount();
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toBe("Solon's map");
    expect(svg.querySelectorAll(".smap-floor")).toHaveLength(1);
    expect(svg.querySelectorAll(".smap-wall")).toHaveLength(1);
    // The left wall is cut where the door is: two pieces on it, so five M commands in all.
    expect((svg.querySelector(".smap-wall")!.getAttribute("d")!.match(/M/g) ?? []).length).toBe(5);
    expect(svg.querySelectorAll(".smap-door")).toHaveLength(1);
  });

  it("names an area that fits, drops a name that doesn't, and never words a pillar", () => {
    const { svg } = mount();
    const names = [...svg.querySelectorAll(".smap-place__name")].map((t) => t.textContent);
    expect(names).toEqual(["Changing room"]);
    expect(svg.querySelectorAll(".smap-place--pillar")).toHaveLength(1);
  });

  it("draws the AED above the machine standing over it, its words always, never dimmed", () => {
    const { svg } = mount({ dimIds: new Set(["m-leg-press", "m-neck", "pm-1"]), zoom: 1 });
    const layers = [...svg.children].map((c) => c.getAttribute("class") ?? "");
    expect(layers.indexOf("smap-safety-layer")).toBeGreaterThan(layers.indexOf("smap-labels"));
    const aed = svg.querySelector(".smap-safety")!;
    expect(aed.getAttribute("role")).toBe("img");
    expect(aed.getAttribute("aria-label")).toBe("AED");
    expect(aed.querySelector(".smap-safety__name")!.textContent).toBe("AED");
    expect(aed.closest(".smap-m--dim")).toBeNull();
    // At least 28 px, whatever the zoom.
    expect(Number(aed.querySelector(".smap-safety__box")!.getAttribute("width"))).toBeGreaterThanOrEqual(28);
  });

  it("gives two safety markers a foot apart two sets of words that don't run together", () => {
    const close: PlanRoom = {
      ...room,
      places: [
        { id: "pc-a", kind: "extinguisher", x: ftMm(10), y: ftMm(10), w: 305, h: 305 },
        { id: "pc-b", kind: "aed", x: ftMm(11), y: ftMm(10), w: 305, h: 305 },
      ],
    };
    const { svg } = mount({ room: close, machines: [] });
    const words = [...svg.querySelectorAll(".smap-safety__name")].map((t) => {
      const x = Number(t.getAttribute("x"));
      const y = Number(t.getAttribute("y"));
      // The drawing's own estimate in a test: 0.62 of 12 px a character.
      const half = (0.62 * 12 * (t.textContent ?? "").length) / 2;
      return { x0: x - half, x1: x + half, y0: y - 12, y1: y + 3, text: t.textContent };
    });
    expect(words.map((w) => w.text)).toEqual(["Fire extinguisher", "AED"]);
    const [a, b] = words;
    const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    expect(overlap).toBe(false);
  });

  it("clips the editor's grid to the floor, so a notch outside the room stays plain", () => {
    const L: PlanRoom = { areaSqFt: 900, boxes: [{ id: "bx-1", x: 0, y: 0, w: ftMm(30), h: ftMm(20) }, { id: "bx-2", x: 0, y: ftMm(20), w: ftMm(10), h: ftMm(10) }], places: [] };
    const interaction = { tool: "machines" as const, selected: null, onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {}, onPointerCancel: () => {} };
    const { svg } = mount({ room: L, machines: [], interaction });
    const grid = svg.querySelector(".smap-grid")!;
    const ref = /url\(#([^)]+)\)/.exec(grid.getAttribute("clip-path") ?? "")![1];
    expect(svg.querySelectorAll(`clipPath[id="${ref}"] rect`)).toHaveLength(2);
  });

  it("fits a wide room to the frame's height as well when it knows it, and to the width alone when it doesn't", () => {
    const { svg } = mount({ machines: [], heightPx: 300 });
    expect(Number(svg.getAttribute("height"))).toBeLessThanOrEqual(300);
    act(() => root!.unmount());
    host!.remove();
    const wide = mount({ machines: [] });
    expect(Number(wide.svg.getAttribute("width"))).toBe(800);
  });

  it("labels every machine, marks one still to buy and one with no size", () => {
    const { svg } = mount();
    const labels = [...svg.querySelectorAll(".smap-m")].map((g) => g.getAttribute("aria-label"));
    expect(labels).toEqual(["Leg Press, 6 ft 11 in long × 4 ft 2 in wide", "Neck, size not known", "Hip Abductor, 6 ft 2 in long × 4 ft 3 in wide, to buy"]);
    expect(svg.querySelectorAll(".smap-m--marker")).toHaveLength(1);
    expect(svg.querySelectorAll(".smap-m--planned")).toHaveLength(1);
    expect(svg.textContent).toContain("To buy");
  });

  it("writes no colour into an attribute", () => {
    const { svg } = mount();
    for (const el of svg.querySelectorAll("*")) {
      for (const attr of ["fill", "stroke"]) {
        const v = el.getAttribute(attr);
        if (v !== null) expect(["none", "transparent", "currentColor"], `${el.tagName} ${attr}=${v}`).toContain(v);
      }
    }
  });

  it("opens a machine on Enter, and on a tap", () => {
    const { svg, picks } = mount();
    const g = svg.querySelector('[data-id="m-neck"]')!;
    act(() => g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(picks).toEqual(["m-neck"]);
    // A tap on the Leg Press's centre: 28 px of pad, then 3150 mm at the drawing's scale.
    // The door straddles the left wall, so the drawing starts 76 mm left of it.
    const s = (800 - 56) / (ftMm(60) + 76);
    const at = { clientX: 28 + (3150 + 76) * s, clientY: 28 + 3150 * s };
    act(() => {
      svg.dispatchEvent(pointer("pointerdown", at));
      svg.dispatchEvent(pointer("pointerup", at));
    });
    expect(picks).toEqual(["m-neck", "m-leg-press"]);
  });
});
