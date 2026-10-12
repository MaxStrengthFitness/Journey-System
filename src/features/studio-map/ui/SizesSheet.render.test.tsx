// @vitest-environment jsdom
/**
 * SIZES, MOUNTED (the studio map, Oct 2026): AJ's "Yes, nearly all". Solon's
 * twenty open ticked once the models answer, a studio's own machine opens
 * unticked, nothing is written until Mark 20, and Mark's toast carries Undo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
const fx = vi.hoisted(() => ({ links: [] as unknown[][], undone: [] as unknown[][], toasts: [] as { m: string; action?: { label: string; run: () => void } }[] }));
vi.mock("../store", () => ({
  linkModels: (...args: unknown[]) => {
    fx.links.push(args);
    return { written: (args[1] as { machineId: string }[]).map((l) => l.machineId), dropped: [], done: Promise.resolve() };
  },
  unlinkModels: (...args: unknown[]) => {
    fx.undone.push(args);
    return Promise.resolve();
  },
  setUnitSize: () => Promise.resolve(),
  setUnitModel: () => Promise.resolve(),
  AnotherMachinesModel: class extends Error {},
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    toast: (m: string, _t?: string, _d?: number, action?: { label: string; run: () => void }) => fx.toasts.push({ m, action }),
    success: (m: string) => fx.toasts.push({ m }),
    error: (m: string) => fx.toasts.push({ m }),
  }),
}));

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
const { modelsReadOf } = await import("../../catalog/models");
const { IMAGINE_STRENGTH_MODELS, seedModelDocument } = await import("../imagine-strength");
const { SizesSheet } = await import("./SizesSheet");
import type { ModelsRead } from "../../catalog/models";
import type { UnitFacts } from "../sizes";

const TWENTY = Object.keys(MACHINE_DEFINITIONS);
const IS = modelsReadOf(IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })));
const floor = [
  ...TWENTY.map((id) => ({ machineId: id, name: MACHINE_DEFINITIONS[id].name, source: "catalog" })),
  { machineId: "sm-solon-sled", name: "Solon Sled", source: "custom" },
];
const units: Record<string, UnitFacts> = Object.fromEntries([
  ...TWENTY.map((id) => [id, { unitSize: null, modelId: null, movementId: id }]),
  ["sm-solon-sled", { unitSize: null, modelId: null, movementId: "m-leg-press" }],
]);

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  fx.links = [];
  fx.undone = [];
  fx.toasts = [];
});

function render(models: ModelsRead) {
  act(() => root!.render(<SizesSheet studioId="solon" floor={floor} units={units} models={models} authUid="uid-aj" />));
}

describe("the Sizes sheet", () => {
  it("opens with the twenty catalog copies ticked once the models answer, the studio's own unticked, writing nothing", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    render({ state: "loading" });
    expect(host.querySelectorAll(".smap-sizes__tick")).toHaveLength(0);
    render(IS);
    const ticks = [...host.querySelectorAll<HTMLButtonElement>(".smap-sizes__tick")];
    expect(ticks).toHaveLength(21);
    const on = ticks.filter((t) => t.getAttribute("aria-pressed") === "true");
    expect(on).toHaveLength(20);
    expect(ticks.find((t) => t.getAttribute("aria-label")?.startsWith("Solon Sled"))!.getAttribute("aria-pressed")).toBe("false");
    expect(fx.links).toEqual([]);
    const mark = [...host.querySelectorAll("button")].find((b) => b.textContent === "Mark 20 as Imagine Strength")!;
    act(() => mark.click());
    expect(fx.links).toHaveLength(1);
    expect((fx.links[0][1] as unknown[]).length).toBe(20);
    const done = fx.toasts.find((t) => t.m === "20 machines marked as Imagine Strength.")!;
    expect(done.action?.label).toBe("Undo");
    done.action!.run();
    expect((fx.undone[0][1] as string[]).length).toBe(20);
  });

  it("puts what needs a size first, so the ticked rows sit beside the buttons, and the sized ones after", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const [a, b] = TWENTY;
    const sized = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === a)!;
    const three = [
      { machineId: a, name: "First on the walk", source: "catalog" },
      { machineId: b, name: "Second on the walk", source: "catalog" },
      { machineId: "sm-solon-sled", name: "Solon Sled", source: "custom" },
    ];
    const facts: Record<string, UnitFacts> = {
      [a]: { unitSize: null, modelId: sized.id, movementId: a },
      [b]: { unitSize: null, modelId: null, movementId: b },
      "sm-solon-sled": { unitSize: null, modelId: null, movementId: "m-sled-none" },
    };
    act(() => root!.render(<SizesSheet studioId="solon" floor={three} units={facts} models={IS} authUid="uid-aj" />));
    const order = [...host.querySelectorAll(".smap-sizes__name, .smap-sizes__rows > .smap-quiet")].map((n) => n.textContent);
    expect(order).toEqual(["Second on the walk", "Solon Sled", "Already sized", "First on the walk"]);
  });

  it("says so when head office hasn't recorded the Imagine Strength sizes", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    render(modelsReadOf([]));
    expect(host.textContent).toContain("Head office hasn't recorded the Imagine Strength sizes yet.");
    expect(host.querySelectorAll(".smap-sizes__tick")).toHaveLength(0);
  });
});
