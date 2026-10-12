// @vitest-environment jsdom
/**
 * ARRANGE THE FLOOR, MOUNTED (the studio map, phase 2, Oct 2026).
 *
 * The empty state is the square footage and Draw the room and nothing else;
 * the room tool's palette in AJ's order; the Sizes line opening the sheet
 * pre-ticked with nothing written until Mark; an overlap a person can see
 * (the plum edge and the machine's own line) and one they can't (nothing);
 * Save issued and never awaited; a non-leader's one line; touch-action set
 * up front by the tool; Escape ending a drag without reaching an outer
 * panel; and during a drag the room's shape and the overlaps worked out no
 * times at all, the overlaps once after it settles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  collection: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => "__now__",
  deleteField: () => "__delete__",
  updateDoc: () => Promise.resolve(),
  setDoc: () => Promise.resolve(),
  writeBatch: () => ({ update: () => {}, set: () => {}, commit: () => Promise.resolve() }),
  getDocFromServer: () => Promise.reject(new Error("offline")),
}));

const fx = vi.hoisted(() => ({
  machines: [] as unknown[],
  roster: [] as unknown[],
  plans: { state: "empty", current: null, drafts: [], slots: [] } as Record<string, unknown>,
  models: { state: "loading" } as Record<string, unknown>,
  saves: [] as unknown[][],
  tries: [] as unknown[][],
  links: [] as unknown[][],
  toasts: [] as string[],
  /** What the next saveLayout and keepAsDraft answer; unset, they never answer. */
  saveAnswer: null as unknown,
  keepAnswer: null as unknown,
}));

vi.mock("../../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({ machines: fx.machines, rosterEntries: fx.roster, loading: false, failed: false, byId: {}, catalog: [], source: "roster" }),
}));
vi.mock("../hooks", () => ({ useFloorPlans: () => fx.plans, useFloorPlan: () => ({ state: "off" }) }));
vi.mock("../../catalog/useMachineModels", () => ({ useMachineModels: () => fx.models }));
vi.mock("../store", () => ({
  saveLayout: (...args: unknown[]) => {
    fx.saves.push(args);
    return fx.saveAnswer ? Promise.resolve(fx.saveAnswer) : new Promise(() => {});
  },
  keepAsDraft: () => (fx.keepAnswer ? Promise.resolve(fx.keepAnswer) : new Promise(() => {})),
  tryAChange: (...args: unknown[]) => {
    fx.tries.push(args);
    return new Promise(() => {});
  },
  planUseThisLayout: () => ({ ops: [], record: { before: { current: null } }, free: null }),
  useThisLayout: () => new Promise(() => {}),
  undoUseThisLayout: () => null,
  renameDraft: () => new Promise(() => {}),
  retireDraft: () => new Promise(() => {}),
  restoreDraft: () => new Promise(() => {}),
  linkModels: (...args: unknown[]) => {
    fx.links.push(args);
    return { written: (args[1] as { machineId: string }[]).map((l) => l.machineId), dropped: [], done: Promise.resolve() };
  },
  unlinkModels: () => Promise.resolve(),
  setUnitSize: () => Promise.resolve(),
  setUnitModel: () => Promise.resolve(),
  AnotherMachinesModel: class extends Error {},
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    toast: (m: string) => fx.toasts.push(m),
    success: (m: string) => fx.toasts.push(m),
    error: (m: string) => fx.toasts.push(m),
    info: (m: string) => fx.toasts.push(m),
    warning: (m: string) => fx.toasts.push(m),
  }),
}));
vi.mock("../room", async (importOriginal) => {
  const real = await importOriginal<typeof import("../room")>();
  return { ...real, roomShape: vi.fn(real.roomShape) };
});
vi.mock("../checks", async (importOriginal) => {
  const real = await importOriginal<typeof import("../checks")>();
  return { ...real, overlapChecks: vi.fn(real.overlapChecks) };
});

const room = await import("../room");
const checks = await import("../checks");
const { modelsReadOf } = await import("../../catalog/models");
const { IMAGINE_STRENGTH_MODELS, seedModelDocument } = await import("../imagine-strength");
const { default: LayoutView } = await import("./LayoutView");
const { UnsavedChangesProvider } = await import("../../unsaved-changes");

const ft = room.ftMm;
const IS = modelsReadOf(IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })));
const modelOf = (movement: string) => IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === movement)!.id;

const FLOOR = [
  ["m-leg-press", "Leg Press"],
  ["m-ext", "Seated Leg Extension"],
  ["m-neck", "Neck"],
] as const;

function floor(withModels: boolean) {
  fx.machines = FLOOR.map(([id, name], i) => ({ machineId: id, id, name, comparisonKey: id, rosterStatus: "active", order: i + 1, source: "catalog" }));
  fx.roster = FLOOR.map(([id], i) => ({ machineId: id, studioId: "solon", source: "catalog", basedOn: id, status: "active", order: i + 1, ...(withModels ? { modelId: modelOf(id) } : {}) }));
}

/** The layout: one 60 × 30 ft box, the Leg Press and the Leg Extension side by side, `overlapIn` inches into each other. */
function layout(overlapIn: number) {
  const lp = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-leg-press")!;
  const ex = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-ext")!;
  const lpX = 4000;
  const exX = Math.round(lpX + lp.widthMm / 2 + ex.widthMm / 2 - overlapIn * 25.4);
  fx.plans = {
    state: "ready",
    current: {
      id: "current",
      name: "The layout",
      rev: 3,
      retired: false,
      room: { areaSqFt: 1800, boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(60), h: ft(30) }], places: [] },
      placements: [
        { machineId: "m-leg-press", x: lpX, y: 4000, rotationDeg: 0 },
        { machineId: "m-ext", x: exX, y: 4000, rotationDeg: 0 },
      ],
      updatedAtMs: 0,
      updatedBy: "uid-marina",
    },
    drafts: [],
    slots: [],
  };
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  fx.saves = [];
  fx.tries = [];
  fx.links = [];
  fx.toasts = [];
  fx.saveAnswer = null;
  fx.keepAnswer = null;
  fx.models = IS;
  fx.plans = { state: "empty", current: null, drafts: [], slots: [] };
  floor(false);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  vi.useRealTimers();
});

let view: (() => ReactElement) | null = null;
function mount(props: { canLead?: boolean; onDone?: () => void } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  view = () => (
    <UnsavedChangesProvider>
      <LayoutView studioId="solon" studioName="Solon" canLead={props.canLead ?? true} authUid="uid-aj" authorName="AJ Jurgens" isDemo={false} onDone={props.onDone ?? (() => {})} />
    </UnsavedChangesProvider>
  );
  act(() => root!.render(view!()));
  return host;
}
/** The listener brings another snapshot of `current`. */
function snapshot(current: Record<string, unknown>) {
  fx.plans = { ...fx.plans, current };
  act(() => root!.render(view!()));
}
const turnOf = (id: string) => /rotate\((\d+)\)/.exec(host!.querySelector(`[data-id="${id}"]`)!.getAttribute("transform") ?? "")![1];

const button = (name: string | RegExp) =>
  [...host!.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? "")));
const click = (el: Element | undefined | null) => {
  expect(el, "the button is there").toBeTruthy();
  act(() => (el as HTMLElement).click());
};
const type = (input: HTMLInputElement, value: string) => {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const pointer = (type: string, at: { clientX: number; clientY: number }) =>
  new (globalThis.PointerEvent ?? MouseEvent)(type, { ...at, bubbles: true, cancelable: true });

describe("the empty state", () => {
  it("asks only how big the studio is, then draws one box of it in the room tool", () => {
    const el = mount();
    expect(el.textContent).toContain("How big is the studio?");
    expect(el.querySelector("svg.smap-svg")).toBeNull();
    expect(el.textContent).not.toMatch(/no size yet|Sizes/);
    type(el.querySelector<HTMLInputElement>("#smap-sqft")!, "150");
    click(button("Draw the room"));
    expect(el.textContent).toContain("Between 200 and 20,000 sq ft.");
    type(el.querySelector<HTMLInputElement>("#smap-sqft")!, "1800");
    click(button("Draw the room"));
    expect(el.querySelector("svg.smap-svg")).not.toBeNull();
    expect(el.querySelector(".smap-area")!.textContent).toBe("Drawn: 1,800 sq ft");
    expect(button("The room")!.getAttribute("aria-pressed")).toBe("true");
    expect(el.querySelector(".smap-frame")!.className).toContain("smap-frame--room");
    expect(el.textContent).toContain("Drag an edge where the walls narrow; Add a box where the room gets bigger.");
  });
});

describe("the room tool", () => {
  it("offers the places in AJ's order, and puts a door on a wall and an AED with its words", () => {
    const el = mount();
    type(el.querySelector<HTMLInputElement>("#smap-sqft")!, "1800");
    click(button("Draw the room"));
    const chips = [...el.querySelectorAll(".smap-palette__chip")].map((c) => c.textContent?.trim());
    expect(chips).toEqual(["Add a box", "Pillar", "Door", "Desk", "Bathroom", "Changing room", "Lockers", "Office", "Fire extinguisher", "AED"]);
    click(button("Door"));
    expect(el.querySelectorAll(".smap-door")).toHaveLength(1);
    click(button("AED"));
    expect(el.querySelector(".smap-safety__name")!.textContent).toBe("AED");
    expect(el.querySelector(".smap-item__name")!.textContent).toBe("AED");
    click(button("Add a box"));
    expect(el.textContent).toContain("Box 2 · 10 ft × 10 ft");
    expect(el.querySelector(".smap-area")!.textContent).toBe("Drawn: 1,900 sq ft · Studio: 1,800 sq ft");
  });

  it("puts each place on a spot of its own: the extinguisher and the AED never hide each other", () => {
    const el = mount();
    type(el.querySelector<HTMLInputElement>("#smap-sqft")!, "1800");
    click(button("Draw the room"));
    click(button("Fire extinguisher"));
    click(button("AED"));
    click(button("Pillar"));
    const boxes = [...el.querySelectorAll(".smap-safety__box")].map((r) => ({ x: Number(r.getAttribute("x")), y: Number(r.getAttribute("y")), w: Number(r.getAttribute("width")) }));
    expect(boxes).toHaveLength(2);
    const [a, b] = boxes;
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.w && b.y < a.y + a.w).toBe(false);
  });

  it("keeps a box's Width box in step with an edge that was dragged, and the drawing's scale where it was", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    const el = mount();
    type(el.querySelector<HTMLInputElement>("#smap-sqft")!, "1800");
    click(button("Draw the room"));
    const width = () => el.querySelector<HTMLInputElement>("#smap-box-w-bx-1")!.value;
    expect(width()).toBe("60");
    const svg = el.querySelector("svg.smap-svg")!;
    const widthBefore = svg.getAttribute("width");
    const s = (720 - 56) / ft(60);
    const at = (x: number, y: number) => ({ clientX: 28 + x * s, clientY: 28 + y * s });
    // The right edge's handle sits 8 px outside it.
    const out = 8 / s;
    act(() => svg.dispatchEvent(pointer("pointerdown", at(ft(60) + out, ft(15)))));
    act(() => {
      svg.dispatchEvent(pointer("pointermove", at(ft(47) + out, ft(15))));
      vi.advanceTimersByTime(20);
    });
    act(() => svg.dispatchEvent(pointer("pointerup", at(ft(47) + out, ft(15)))));
    expect(el.textContent).toContain("Box 1 · 47 ft × 30 ft");
    expect(width()).toBe("47");
    // The edge stays where the finger left it: the drawing hasn't rescaled to the smaller room.
    expect(el.querySelector("svg.smap-svg")!.getAttribute("width")).toBe(widthBefore);
    expect(button("Fit")!.hasAttribute("disabled")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("sizes", () => {
  it("say how many have none in one line, and the sheet opens pre-ticked, writing nothing until Mark", () => {
    layout(0);
    const el = mount();
    expect(el.textContent).toContain("3 machines have no size yet");
    click(button("Sizes"));
    const ticks = [...document.querySelectorAll<HTMLButtonElement>(".smap-sizes__tick")];
    expect(ticks).toHaveLength(3);
    expect(ticks.every((t) => t.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(fx.links).toEqual([]);
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Untick all"));
    expect(ticks.every((t) => t.getAttribute("aria-pressed") === "false")).toBe(true);
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Tick all 3"));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Mark 3 as Imagine Strength"));
    expect(fx.links).toHaveLength(1);
    expect((fx.links[0][1] as unknown[]).length).toBe(3);
  });
});

describe("overlaps, quietly", () => {
  it("mark two machines 7 in into each other with a plum edge and the selected one's line; nothing is a list", () => {
    vi.useFakeTimers();
    floor(true);
    layout(7);
    const el = mount();
    act(() => vi.advanceTimersByTime(150));
    expect(el.querySelectorAll(".smap-m--over")).toHaveLength(2);
    click([...el.querySelectorAll(".smap-list__row")][0]);
    expect([...el.querySelectorAll(".smap-item__line")].map((p) => p.textContent)).toEqual(["Overlaps the Seated Leg Extension by 7 in."]);
    // The Oct 11 decisions in words: no spacing, no path, no verdict, no metric.
    expect(el.textContent).not.toMatch(/All clear|Checks|spacing|apart|free floor|\bpath\b|\breach\b|inspection|\b(?:mm|cm|m²)\b/);
  });

  it("say nothing at 6 in", () => {
    vi.useFakeTimers();
    floor(true);
    layout(6);
    const el = mount();
    act(() => vi.advanceTimersByTime(150));
    expect(el.querySelectorAll(".smap-m--over")).toHaveLength(0);
  });
});

describe("saving", () => {
  it("issues the save at the next rev and never waits for it", () => {
    floor(true);
    layout(0);
    const el = mount();
    expect(el.querySelector(".smap-frame")!.className).toContain("smap-frame--machines");
    click([...el.querySelectorAll(".smap-list__row")][0]);
    click(button("Turn right"));
    click(button("Save"));
    expect(fx.saves).toHaveLength(1);
    const [studio, planId, working, name, baseRev, uid] = fx.saves[0] as [string, string, { placements: { rotationDeg: number }[] }, string, number, string];
    expect([studio, planId, name, baseRev, uid]).toEqual(["solon", "current", "The layout", 3, "uid-aj"]);
    expect(working.placements[0].rotationDeg).toBe(90);
    // The write never answered, and the screen has moved on.
    expect(button("Save")).toBeUndefined();
    expect(fx.toasts).toContain("Layout saved.");
  });

  it("after another leader's save beat it, keeps yours as a draft and shows theirs, so the next Save can't overwrite it", async () => {
    floor(true);
    layout(0);
    const original = fx.plans.current as Record<string, unknown>;
    fx.saveAnswer = { ok: false, why: "changed", by: "uid-marina" };
    fx.keepAnswer = { id: "d-1" };
    mount();
    click([...host!.querySelectorAll(".smap-list__row")][0]);
    click(button("Turn right"));
    click(button("Save"));
    // The listener: our own write at rev 4 first, then the SDK puts back Marina's rev 4, which beat it.
    snapshot({ ...original, rev: 4, updatedAtMs: 50, updatedBy: "uid-aj", placements: [{ machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 90 }] });
    const theirs = [
      { machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 0 },
      { machineId: "m-ext", x: 9000, y: 4000, rotationDeg: 180 },
    ];
    snapshot({ ...original, rev: 4, updatedAtMs: 99, updatedBy: "uid-marina", placements: theirs });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(turnOf("m-leg-press")).toBe("0");
    expect(turnOf("m-ext")).toBe("180");
    expect(host!.textContent).toContain("saved a newer layout, so yours was kept as a draft");
    // The next change is made on theirs, at their rev.
    click([...host!.querySelectorAll(".smap-list__row")][0]);
    click(button("Turn right"));
    fx.saveAnswer = null;
    click(button("Save"));
    const [, , working, , baseRev] = fx.saves[1] as [string, string, { placements: { machineId: string; rotationDeg: number }[] }, string, number];
    expect(baseRev).toBe(4);
    expect(working.placements.find((p) => p.machineId === "m-ext")!.rotationDeg).toBe(180);
  });

  it.each([
    ["refused", "The layout wasn't saved. Only a studio leader arranges the floor."],
    ["unchecked", "The layout wasn't saved, and Journey couldn't check why. It's still on screen: tap Save to try again."],
  ])("a save %s puts the copy back as unsaved work, whatever the listener showed in between", async (why, words) => {
    floor(true);
    layout(0);
    const original = fx.plans.current as Record<string, unknown>;
    fx.saveAnswer = { ok: false, why };
    mount();
    click([...host!.querySelectorAll(".smap-list__row")][0]);
    click(button("Turn right"));
    click(button("Save"));
    snapshot({ ...original, rev: 4, updatedAtMs: 50, updatedBy: "uid-aj", placements: [{ machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 90 }] });
    // The SDK takes the refused write back: the server's rev 3 again.
    snapshot({ ...original });
    await act(async () => {
      await Promise.resolve();
    });
    expect(turnOf("m-leg-press")).toBe("90");
    expect(button("Save")).toBeTruthy();
    expect(fx.toasts).toContain(words);
    expect(fx.toasts.join(" ")).not.toMatch(/kept on this iPad|back online/);
    fx.saveAnswer = null;
    click(button("Save"));
    expect((fx.saves[1] as unknown[])[4]).toBe(3);
  });
});

describe("who arranges", () => {
  it("is a leader; anyone else gets one line and Done", () => {
    const done = vi.fn();
    const el = mount({ canLead: false, onDone: done });
    expect(el.textContent).toContain("Only a studio leader arranges the floor.");
    click(button("Done"));
    expect(done).toHaveBeenCalled();
  });
});

describe("a drag", () => {
  const raf = () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  };

  it("works out the room's shape and the overlaps no times while it moves, and the overlaps once after it settles", () => {
    vi.useFakeTimers();
    raf();
    floor(true);
    layout(0);
    const el = mount();
    act(() => vi.advanceTimersByTime(200));
    const svg = el.querySelector("svg.smap-svg")!;
    // The fallback width 720; the room is 60 ft wide.
    const s = (720 - 56) / ft(60);
    const at = (x: number, y: number) => ({ clientX: 28 + x * s, clientY: 28 + y * s });
    vi.mocked(room.roomShape).mockClear();
    vi.mocked(checks.overlapChecks).mockClear();
    act(() => svg.dispatchEvent(pointer("pointerdown", at(4000, 4000))));
    for (let i = 1; i <= 30; i++) {
      act(() => {
        svg.dispatchEvent(pointer("pointermove", at(4000, 4000 + i * 60)));
        vi.advanceTimersByTime(16);
      });
    }
    expect(vi.mocked(room.roomShape)).toHaveBeenCalledTimes(0);
    expect(vi.mocked(checks.overlapChecks)).toHaveBeenCalledTimes(0);
    act(() => svg.dispatchEvent(pointer("pointerup", at(4000, 4000 + 30 * 60))));
    act(() => vi.advanceTimersByTime(130));
    expect(vi.mocked(checks.overlapChecks)).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("ends on Escape, and the Escape reaches no outer panel", () => {
    vi.useFakeTimers();
    raf();
    floor(true);
    layout(0);
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    const el = mount();
    const svg = el.querySelector("svg.smap-svg")!;
    const s = (720 - 56) / ft(60);
    const at = (x: number, y: number) => ({ clientX: 28 + x * s, clientY: 28 + y * s });
    act(() => svg.dispatchEvent(pointer("pointerdown", at(4000, 4000))));
    act(() => {
      svg.dispatchEvent(pointer("pointermove", at(4000, 6000)));
      vi.advanceTimersByTime(20);
    });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(outer).not.toHaveBeenCalled();
    act(() => svg.dispatchEvent(pointer("pointerup", at(4000, 6000))));
    expect(button("Save")).toBeUndefined();
    window.removeEventListener("keydown", outer);
    vi.unstubAllGlobals();
  });
});

describe("remodel plans and machines still to buy", () => {
  const ABD = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-hip-abd")!;
  function withDraft(placements: unknown[]) {
    layout(0);
    const current = fx.plans.current as Record<string, unknown>;
    const d1 = { ...current, id: "d-1", name: "Remodel 1", rev: 2, placements };
    fx.plans = { ...fx.plans, drafts: [d1], slots: [d1] };
  }
  const tab = (name: string) => [...host!.querySelectorAll("[role=tab]")].find((t) => t.textContent?.startsWith(name));

  it("offers Add a machine to buy on a plan only, never on the map", () => {
    floor(true);
    withDraft([{ machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 0 }]);
    mount();
    expect(button("Add a machine to buy")).toBeUndefined();
    click(tab("Remodel 1"));
    expect(tab("Remodel 1")!.getAttribute("aria-selected")).toBe("true");
    expect(button("Add a machine to buy")).toBeTruthy();
    expect(button("Make this the map")).toBeTruthy();
  });

  it("adds one from the sheet at its model's size, drawn dashed and named under the floor list", () => {
    floor(true);
    withDraft([{ machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 0 }]);
    mount();
    click(tab("Remodel 1"));
    click(button("Add a machine to buy"));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Abduction"));
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("IS2027W Hip Abductor")));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Add it"));
    const planned = host!.querySelectorAll(".smap-m--planned");
    expect(planned).toHaveLength(1);
    expect(planned[0].querySelector("rect.smap-m__body")).not.toBeNull();
    expect(planned[0].getAttribute("aria-label")).toContain("to buy");
    expect(host!.textContent).toContain("Still to buy: IS2027W Hip Abductor.");
    expect(host!.querySelector(".smap-item__name")!.textContent).toBe("IS2027W Hip Abductor");
    // Saved on the plan, never on the map.
    click(button("Save"));
    const [, planId, working, name] = fx.saves[0] as [string, string, { placements: { kind?: string; modelId?: string }[] }, string];
    expect([planId, name]).toEqual(["d-1", "Remodel 1"]);
    expect(working.placements.find((p) => p.kind === "planned")!.modelId).toBe(ABD.id);
  });

  it("swaps in the real one, the same movement first, keeping its spot and turn", () => {
    floor(true);
    fx.machines = [...fx.machines, { machineId: "m-hip-abd", id: "m-hip-abd", name: "Hip Abductor", comparisonKey: "m-hip-abd", rosterStatus: "active", order: 4, source: "catalog" }];
    fx.roster = [...fx.roster, { machineId: "m-hip-abd", studioId: "solon", source: "catalog", basedOn: "m-hip-abd", status: "active", order: 4 }];
    withDraft([
      { machineId: "m-leg-press", x: 4000, y: 4000, rotationDeg: 0 },
      { kind: "planned", id: "pm-abd", label: "Hip Abductor", movementId: "m-hip-abd", modelId: ABD.id, x: 9000, y: 5000, rotationDeg: 90 },
    ]);
    mount();
    click(tab("Remodel 1"));
    act(() => (host!.querySelector('[data-id="pm-abd"]') as unknown as { dispatchEvent: (e: Event) => void }).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    click(button("Bought it? Swap in the real one"));
    const chips = [...host!.querySelectorAll(".smap-item .smap-chip")].map((c) => c.textContent);
    expect(chips[0]).toBe("Hip Abductor");
    click([...host!.querySelectorAll(".smap-item .smap-chip")][0]);
    expect(host!.querySelectorAll(".smap-m--planned")).toHaveLength(0);
    click(button("Save"));
    const working = (fx.saves[0] as [string, string, { placements: { machineId?: string; x: number; y: number; rotationDeg: number }[] }])[2];
    expect(working.placements.find((p) => p.machineId === "m-hip-abd")).toEqual({ machineId: "m-hip-abd", x: 9000, y: 5000, rotationDeg: 90 });
  });

  it("Plan a remodel copies what is on screen into the first free slot and opens it", () => {
    floor(true);
    layout(0);
    mount();
    click(button("Plan a remodel"));
    expect(fx.tries).toHaveLength(1);
    expect(host!.querySelector("[role=tab][aria-selected=true]")).toBeTruthy();
    expect(button("Add a machine to buy")).toBeTruthy();
    expect(fx.toasts).toContain("Remodel 1 started from what was on screen. The map hasn't changed.");
    // Saving it now writes slot d-1, never the map.
    click([...host!.querySelectorAll(".smap-list__row")][0]);
    click(button("Turn right"));
    click(button("Save"));
    expect((fx.saves[0] as unknown[])[1]).toBe("d-1");
    expect((fx.saves[0] as unknown[])[4]).toBe(1);
  });
});
