// @vitest-environment jsdom
/**
 * THE CATALOG'S MAP, MOUNTED (the studio map, phase 3, Oct 2026).
 *
 * The room and its places, the AED above everything and never dimmed, every
 * machine of the floor on the map at its size (a round marker with none),
 * out of service said in words; a tap opens the machine's Catalog page; the
 * map waits while a size is still being read; and a room too small to tap
 * at this width is the floor as a list, said in one line, before the
 * drawing's chunk is ever fetched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FloorPlanDoc } from "../studio-map/layout";
import type { CatalogMachine } from "./types";
import type { ModelsRead } from "./models";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
// The machine's card (phase 4) reads the studio's roster for its header.
const rosterAsked = vi.hoisted(() => [] as (string | null)[]);
vi.mock("../../hooks/useStudioMachines", () => ({
  useStudioMachines: (studioId: string | null) => {
    rosterAsked.push(studioId);
    const ids = ["m-leg-press", "m-neck", "m-lumbar", "m-ext"];
    return {
      machines: [],
      rosterEntries: ids.map((id) => ({ machineId: id, studioId: "solon", source: "catalog", basedOn: id, status: id === "m-lumbar" ? "maintenance" : "active" })),
      byId: Object.fromEntries(ids.map((id) => [id, { machineId: id, name: id === "m-leg-press" ? "LEG PRESS" : id, comparisonKey: id, primaryMuscles: [] }])),
      catalog: [],
      loading: false,
      failed: false,
      source: "roster",
    };
  },
}));

const { FloorRoomView } = await import("./FloorRoomView");

const ft = (n: number) => Math.round(n * 304.8);
const plan = (widthFt: number): FloorPlanDoc => ({
  v: 1,
  name: "The layout",
  room: {
    areaSqFt: 1800,
    boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(widthFt), h: ft(30) }],
    places: [
      { id: "pc-1", kind: "aed", x: 0, y: ft(10), w: 305, h: 305 },
      { id: "pc-2", kind: "desk", x: ft(2), y: ft(25), w: ft(7), h: ft(2) },
    ],
  },
  placements: [
    { machineId: "m-leg-press", x: ft(10), y: ft(10), rotationDeg: 0 },
    { machineId: "m-neck", x: ft(20), y: ft(10), rotationDeg: 90 },
    { machineId: "m-lumbar", x: ft(30), y: ft(10), rotationDeg: 0 },
  ],
  rev: 1,
  updatedAt: null,
  updatedBy: "u",
});
const unit = (lengthMm: number) => ({ lengthMm, widthMm: 1270, by: "u", at: null });
const M = (id: string, name: string, over: Partial<CatalogMachine> = {}) => ({ id, name, rosterStatus: "active", ...over }) as unknown as CatalogMachine;
const FLOOR = [
  M("m-leg-press", "LEG PRESS", { unitSize: unit(2108) }),
  M("m-neck", "CX (4 WAY NECK)"),
  M("m-lumbar", "LUMBAR", { unitSize: unit(1755), rosterStatus: "maintenance" }),
  M("m-ext", "LEG EXTENSION"),
];
const READY: ModelsRead = { state: "ready", models: [], byId: {} };

let host: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(p: { plan?: FloorPlanDoc; machines?: CatalogMachine[]; models?: ModelsRead; dimIds?: Set<string> } = {}) {
  const opened = vi.fn();
  const toList = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <FloorRoomView
        studioId="solon"
        studioName="Solon"
        care={{ byMachineId: {}, loading: false, error: null }}
        authTrainer={null}
        plan={p.plan ?? plan(40)}
        machines={p.machines ?? FLOOR}
        models={p.models ?? READY}
        dimIds={p.dimIds}
        onOpenMachine={opened}
        onList={toList}
        list={<ol data-testid="the-list" />}
      />,
    ),
  );
  return { opened, toList };
}

const drawn = async () => {
  for (let i = 0; i < 50 && !host.querySelector("svg.smap-svg"); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  return host.querySelector("svg.smap-svg");
};

describe("the Catalog's map", () => {
  it("draws the room, its places and the floor's placed machines; a tap opens the machine's card at Learn, whose door is the page", async () => {
    const { opened } = mount();
    expect(await drawn()).not.toBeNull();
    expect(host.querySelector(".smap-svg")!.getAttribute("aria-label")).toBe("Solon's map");
    expect([...host.querySelectorAll(".smap-m")].map((g) => g.getAttribute("data-id"))).toEqual(["m-leg-press", "m-neck", "m-lumbar"]);
    // No size on file: a round marker, never a guessed rectangle.
    expect(host.querySelector('[data-id="m-neck"]')!.getAttribute("class")).toContain("smap-m--marker");
    expect(host.querySelector('[data-id="m-neck"]')!.getAttribute("aria-label")).toContain("size not known");
    // Out of service, in words as well as on the drawing.
    expect(host.querySelector('[data-id="m-lumbar"]')!.getAttribute("class")).toContain("smap-m--out");
    expect(host.querySelector('[data-id="m-lumbar"]')!.getAttribute("aria-label")).toContain("out of service");
    expect(host.querySelector(".smap-safety__name")?.textContent).toBe("AED");
    // No colour is ever written on the drawing: the stylesheet sets it.
    const painted = [...host.querySelectorAll(".smap-floor, .smap-wall, .smap-place, .smap-m__body, .smap-safety__box")];
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.filter((e) => e.hasAttribute("fill") || e.hasAttribute("stroke"))).toEqual([]);
    await act(async () => {
      host.querySelector('[data-id="m-leg-press"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    // Phase 4: the one card, Learn open; Open its Catalog page closes it and opens the page.
    expect(opened).not.toHaveBeenCalled();
    expect(host.querySelector(".cp__title")?.textContent).toContain("LEG PRESS");
    expect(host.querySelector('.mdc-part[data-part="learn"] .mdc-part__head')?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Open its Catalog page")!.click();
    });
    expect(opened).toHaveBeenCalledWith("m-leg-press");
    expect(host.querySelector(".cp")).toBeNull();
  });

  it("never dims the AED, whatever Find narrowed", async () => {
    mount({ dimIds: new Set(["m-leg-press", "m-neck", "m-lumbar", "m-ext"]) });
    await drawn();
    expect(host.querySelectorAll(".smap-m--dim")).toHaveLength(3);
    expect(host.querySelector(".smap-safety")!.getAttribute("class")).toBe("smap-safety");
  });

  it("waits while a placed machine's size is still being read", () => {
    const machines = FLOOR.map((m) => (m.id === "m-neck" ? { ...m, modelId: "mm-x" } : m));
    mount({ machines, models: { state: "loading" } });
    expect(host.textContent).toBe("Loading the map…");
    expect(host.querySelector("svg.smap-svg")).toBeNull();
  });

  it("is the list, said in one line, when the room is too big to tap at this width", async () => {
    mount({ plan: plan(200) });
    expect(host.textContent).toContain("The map is too small to tap at this width, so here is the floor as a list.");
    expect(host.querySelector("[data-testid=the-list]")).not.toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(host.querySelector("svg.smap-svg")).toBeNull();
  });
});
