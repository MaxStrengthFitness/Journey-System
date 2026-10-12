// @vitest-environment jsdom
/**
 * THE MAP AND ITS REMODEL PLANS, MOUNTED (the studio map, phase 3, Oct 2026).
 *
 * The tabs in AJ's words; Make this the map asks first, and with machines
 * still to buy on the plan sends three writes in one batch (the map with the
 * floor's machines only, the plan unchanged, the old map kept in a free
 * slot), its Undo ready the moment it is tapped; with none, two; Delete
 * draft retires the slot and its Undo brings it back; Rename writes the name
 * at the next rev. Nothing here is awaited: the store is the real one over a
 * Firestore that never answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  batches: [] as { path: string; data: Record<string, unknown> }[][],
  sets: [] as { path: string; data: Record<string, unknown> }[],
  toasts: [] as { message: string; action?: { label: string; run: () => void } }[],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => "__now__",
  deleteField: () => "__delete__",
  updateDoc: () => new Promise(() => {}),
  setDoc: (ref: { path: string }, data: Record<string, unknown>) => {
    fx.sets.push({ path: ref.path, data });
    return new Promise(() => {});
  },
  writeBatch: () => {
    const writes: { path: string; data: Record<string, unknown> }[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
      update: () => {},
      commit: () => {
        fx.batches.push(writes);
        return new Promise(() => {});
      },
    };
  },
  getDocFromServer: () => Promise.reject(new Error("offline")),
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    toast: (message: string, _t?: string, _d?: number, action?: { label: string; run: () => void }) => fx.toasts.push({ message, action }),
    success: (message: string) => fx.toasts.push({ message }),
    error: (message: string) => fx.toasts.push({ message }),
    info: (message: string) => fx.toasts.push({ message }),
    warning: (message: string) => fx.toasts.push({ message }),
  }),
}));

const { DraftTabs } = await import("./DraftTabs");
const { UnsavedChangesProvider } = await import("../../unsaved-changes");
import type { LoadedPlan } from "../layout";

const ROOM = { areaSqFt: 1800, boxes: [{ id: "bx-1", x: 0, y: 0, w: 18288, h: 9144 }], places: [] };
const plan = (id: string, name: string, rev: number, placements: LoadedPlan["placements"], over: Partial<LoadedPlan> = {}): LoadedPlan => ({
  id,
  name,
  rev,
  retired: false,
  room: ROOM,
  placements,
  updatedAtMs: 1,
  updatedBy: "uid-aj",
  ...over,
});
const unit = (machineId: string, x: number) => ({ machineId, x, y: 3000, rotationDeg: 0 });
const toBuy = (id: string, label: string) => ({ kind: "planned" as const, id, label, movementId: "m-hip-abd", modelId: null, x: 6000, y: 6000, rotationDeg: 0 });

let host: HTMLDivElement;
let root: Root;
const calls = { show: [] as unknown[][], open: [] as string[], plan: 0, renamed: [] as unknown[][] };

beforeEach(() => {
  fx.batches = [];
  fx.sets = [];
  fx.toasts = [];
  calls.show = [];
  calls.open = [];
  calls.plan = 0;
  calls.renamed = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(p: { current: LoadedPlan | null; slots: LoadedPlan[]; open: string; dirty?: boolean }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <UnsavedChangesProvider>
        <DraftTabs
          studioId="solon"
          current={p.current}
          drafts={p.slots.filter((s) => !s.retired)}
          slots={p.slots}
          open={p.open}
          dirty={p.dirty ?? false}
          authUid="uid-aj"
          onOpen={(id) => calls.open.push(id)}
          onPlan={() => calls.plan++}
          onShow={(...a) => calls.show.push(a)}
          onRenamed={(...a) => calls.renamed.push(a)}
          guard={(go) => go()}
        />
      </UnsavedChangesProvider>,
    ),
  );
}

const buttons = (text: string) => [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === text);
const click = (el: Element | undefined) => {
  expect(el, "the button is there").toBeTruthy();
  act(() => (el as HTMLElement).click());
};
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("the tabs", () => {
  it("read The map, each plan by name in slot order with what it still has to buy, and Plan a remodel", () => {
    const current = plan("current", "The layout", 3, [unit("m-leg-press", 2000)]);
    mount({ current, slots: [plan("d-2", "Remodel 2", 1, []), plan("d-1", "Remodel 1", 4, [toBuy("pm-a", "Hip Abductor")]), plan("d-3", "Old", 2, [], { retired: true })], open: "current" });
    const tabs = [...host.querySelectorAll("[role=tab]")].map((t) => t.textContent);
    expect(tabs).toEqual(["The map", "Remodel 11 to buy", "Remodel 2"]);
    expect(host.querySelector("[role=tab][aria-selected=true]")!.textContent).toBe("The map");
    // On the map there is nothing to make the map, and no More.
    expect(buttons("Make this the map")).toHaveLength(0);
    click(buttons("Remodel 2")[0]);
    expect(calls.open).toEqual(["d-2"]);
    click(buttons("Plan a remodel")[0]);
    expect(calls.plan).toBe(1);
  });
});

describe("Make this the map", () => {
  it("with machines still to buy asks first, then sends three writes in one batch and has its Undo ready", () => {
    const current = plan("current", "The layout", 3, [unit("m-leg-press", 2000)]);
    const d1 = plan("d-1", "Remodel 1", 4, [unit("m-leg-press", 3000), unit("m-ext", 5000), toBuy("pm-a", "Hip Abductor"), toBuy("pm-b", "Seated Dip")]);
    mount({ current, slots: [d1], open: "d-1" });
    click(buttons("Make this the map")[0]);
    const dialog = document.querySelector(".adm-dialog")!;
    expect(dialog.textContent).toContain("2 machines still to buy stay on this plan. Everything else becomes the map.");
    expect(dialog.textContent).toContain("The map you have now is kept as a plan, “Before");
    expect(fx.batches).toHaveLength(0);
    click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Make this the map"));

    expect(fx.batches).toHaveLength(1);
    const [cur, draft, before] = fx.batches[0];
    expect(fx.batches[0].map((w) => w.path)).toEqual(["studios/solon/floorPlans/current", "studios/solon/floorPlans/d-1", "studios/solon/floorPlans/d-2"]);
    expect(cur.data.rev).toBe(4);
    expect((cur.data.placements as { kind?: string }[]).some((p) => p.kind === "planned")).toBe(false);
    expect((cur.data.placements as { machineId: string }[]).map((p) => p.machineId)).toEqual(["m-leg-press", "m-ext"]);
    expect(draft.data.rev).toBe(5);
    expect((draft.data.placements as { kind?: string }[]).filter((p) => p.kind === "planned")).toHaveLength(2);
    expect(before.data).toMatchObject({ rev: 1 });
    expect(String(before.data.name)).toMatch(/^Before /);

    // The map is shown at once, with the floor's machines only; Undo is on the toast before the server answers.
    expect(calls.show[0][0]).toBe("current");
    expect((calls.show[0][1] as { rev: number; placements: unknown[] }).rev).toBe(4);
    expect((calls.show[0][1] as { placements: unknown[] }).placements).toHaveLength(2);
    const made = fx.toasts.find((t) => t.message === "Remodel 1 is the map.")!;
    expect(made.action?.label).toBe("Undo");
  });

  it("with nothing to buy sends two writes, the plan's slot taking the old map", () => {
    const current = plan("current", "The layout", 3, [unit("m-leg-press", 2000)]);
    const d1 = plan("d-1", "Remodel 1", 2, [unit("m-leg-press", 3000)]);
    mount({ current, slots: [d1], open: "d-1" });
    click(buttons("Make this the map")[0]);
    expect(document.querySelector(".adm-dialog")!.textContent).toContain("The map you have now is kept as a plan");
    click([...document.querySelectorAll(".adm-dialog button")].find((b) => b.textContent?.trim() === "Make this the map"));
    expect(fx.batches[0].map((w) => w.path)).toEqual(["studios/solon/floorPlans/current", "studios/solon/floorPlans/d-1"]);
    expect(String(fx.batches[0][1].data.name)).toMatch(/^Before /);
    expect(fx.batches[0][1].data.placements).toEqual([unit("m-leg-press", 2000)]);
  });

  it("says when no slot is free to keep the old map, and Not yet sends nothing", () => {
    const current = plan("current", "The layout", 3, []);
    const slots = ["d-1", "d-2", "d-3", "d-4", "d-5"].map((id, i) => plan(id, `Remodel ${i + 1}`, 1, id === "d-1" ? [toBuy("pm-a", "Hip Abductor")] : []));
    mount({ current, slots, open: "d-1" });
    click(buttons("Make this the map")[0]);
    expect(document.querySelector(".adm-dialog")!.textContent).toContain("1 machine still to buy stays on this plan. Everything else becomes the map. The old map won't be kept as a plan. Undo on the next message brings it back.");
    click(buttons("Not yet")[0]);
    expect(fx.batches).toHaveLength(0);
    expect(document.querySelector(".adm-dialog")).toBeNull();
  });

  it("asks to save the plan first when it holds unsaved changes", () => {
    mount({ current: null, slots: [plan("d-1", "Remodel 1", 2, [])], open: "d-1", dirty: true });
    click(buttons("Make this the map")[0]);
    expect(document.querySelector(".adm-dialog")).toBeNull();
    expect(fx.toasts.map((t) => t.message)).toContain("Save this plan first, then make it the map.");
  });
});

describe("More", () => {
  it("Delete plan retires the slot with its content kept, and Undo brings it back at the next rev", () => {
    const d1 = plan("d-1", "Remodel 1", 4, [toBuy("pm-a", "Hip Abductor")]);
    mount({ current: plan("current", "The layout", 3, []), slots: [d1], open: "d-1" });
    click(buttons("More")[0]);
    click(buttons("Delete plan")[0]);
    expect(fx.batches[0]).toHaveLength(1);
    expect(fx.batches[0][0]).toMatchObject({ path: "studios/solon/floorPlans/d-1", data: { rev: 5, retired: true, name: "Remodel 1" } });
    expect(calls.show[0]).toEqual(["current", null]);
    const t = fx.toasts.find((x) => x.message === "Remodel 1 deleted.")!;
    act(() => t.action!.run());
    expect(fx.batches[1][0].data.rev).toBe(6);
    expect("retired" in fx.batches[1][0].data).toBe(false);
    expect((fx.batches[1][0].data.placements as unknown[]).length).toBe(1);
  });

  it("Rename writes the plan at the next rev under its new name", () => {
    const d1 = plan("d-1", "Remodel 1", 4, []);
    mount({ current: null, slots: [d1], open: "d-1" });
    click(buttons("More")[0]);
    click(buttons("Rename")[0]);
    const input = host.querySelector<HTMLInputElement>("#smap-plan-name")!;
    type(input, "Back wall move");
    click(buttons("Save")[0]);
    expect(fx.sets).toHaveLength(1);
    expect(fx.sets[0]).toMatchObject({ path: "studios/solon/floorPlans/d-1", data: { name: "Back wall move", rev: 5 } });
    expect(calls.renamed).toEqual([["d-1", 4, 5]]);
  });
});
