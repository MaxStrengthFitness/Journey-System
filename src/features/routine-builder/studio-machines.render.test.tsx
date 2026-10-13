// @vitest-environment jsdom
/**
 * A STUDIO-BUILT MACHINE IN A ROUTINE, MOUNTED (the studio machines round,
 * Oct 13 2026). AJ: "we cant add it to a routine within the routine builder"
 * (Strongsville's Hoist leg press, a machine the studio built itself).
 *
 * The profile handed the Edit routine drawer, and Programming's Routine A / B
 * rows, the app-wide machine list: the catalog and its defaults, which hold
 * no studio-built machine. So the drawer never offered the Hoist, and a
 * routine that already held it said "Unknown machine" and its row couldn't be
 * opened. What matters is silent when wrong:
 *   - the drawer offers this floor's own machines and saves one;
 *   - a routine machine the floor no longer has keeps its full name beside
 *     "Not at this studio" (it used to be named off the app-wide list);
 *   - the rows name a studio-built machine and open its card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* A Firestore that records every write with its data. */
type Write = { op: string; path: string; data: Record<string, unknown> };
const fake = vi.hoisted(() => ({ writes: [] as Write[], autoId: 0 }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (path: string) => ({ path, id: path.split("/").pop()! });
  return {
    ...actual,
    collection: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      return { path: [head, ...segments].filter(Boolean).join("/") };
    },
    doc: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      if (segments.length === 0) return ref(`${head}/auto-${++fake.autoId}`);
      return ref([head, ...segments].filter(Boolean).join("/"));
    },
    query: (base: unknown) => base,
    where: () => ({}),
    serverTimestamp: () => "SERVER_TIME",
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [] }),
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ op: "add", path: r.path, data });
      return { id: `auto-${++fake.autoId}` };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ op: "update", path: r.path, data });
    },
    writeBatch: () => {
      const ops: Write[] = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: "update", path: r.path, data }),
        commit: () => {
          fake.writes.push(...ops);
          return Promise.resolve();
        },
      };
    },
  };
});
vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

/* base-ui reads PointerEvent (jsdom has none); the sheets want ResizeObserver. */
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Client, Machine, Routine } from "../../types";
import { EditRoutineDrawer } from "../../components/EditRoutineDrawer";
import { floorWithHistoryMachines } from "../../lib/floor-machines";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { RoutinesTab } from "../routines/RoutinesTab";

const HOIST = "sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press";
/** The app-wide list: the catalog. No studio-built machine is ever in it. */
const APP_WIDE: Machine[] = [
  { id: "m-leg-press", name: "LEG PRESS", fullName: "Leg Press", order: 1 },
  { id: "m-chest-press", name: "CHEST PRESS", fullName: "Chest Press", order: 2 },
  { id: "m-pulldown", name: "PULLDOWN", fullName: "Pulldown", order: 3 },
] as Machine[];
/** Strongsville's floor: the Imagine Strength leg press, the chest press, and the Hoist (no pulldown here). */
const FLOOR: Machine[] = [
  { id: "m-leg-press", name: "Leg Press Imagine Strength", order: 1 },
  { id: "m-chest-press", name: "Chest Press", order: 2 },
  { id: HOIST, name: "Hoist leg press", order: 3, comparisonKey: "m-leg-press" },
] as Machine[];
const CLIENT = { id: "c1", firstName: "Tom", homeStudioId: "strongsville", isRoutineBActive: false } as Client;

let root: Root | null = null;
let el: HTMLElement | null = null;
async function mount(node: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<UnsavedChangesProvider>{node}</UnsavedChangesProvider>);
  });
  await act(async () => {});
}
const page = () => document.body;
const buttons = () => Array.from(page().querySelectorAll("button"));
function button(label: string | RegExp): HTMLButtonElement {
  const found = buttons().find((b) => {
    const words = (b.getAttribute("aria-label") || b.textContent || "").trim();
    return typeof label === "string" ? words === label : label.test(words);
  });
  if (!found) throw new Error(`no button ${String(label)} among: ${buttons().map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).join(" | ")}`);
  return found as HTMLButtonElement;
}
async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await act(async () => {});
}
const pickerNames = () => Array.from(page().querySelectorAll(".rb-pick__item .rb-pick__name")).map((n) => n.textContent);

beforeEach(() => {
  fake.writes.length = 0;
  fake.autoId = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

describe("the Edit routine drawer offers this floor, the studio's own machines included", () => {
  const ROUTINE_A = { id: "rA", name: "Routine A", clientId: "c1", machineIds: ["m-chest-press", "m-pulldown"], studioId: "strongsville" } as Routine;
  const drawer = (floorMachines: Machine[] | undefined) => (
    <EditRoutineDrawer
      client={CLIENT}
      clientId="c1"
      routines={[ROUTINE_A]}
      machines={APP_WIDE}
      floorMachines={floorMachines}
      activeStudioId="strongsville"
      sessions={[]}
      allLogs={[]}
      coverage="complete"
      target="Routine A"
      onClose={() => {}}
      onSaved={() => {}}
    />
  );

  it("adds the Hoist leg press from Add and saves it on Routine A", async () => {
    await mount(drawer(FLOOR));
    await click(button("Add"));
    expect(pickerNames()).toContain("Hoist leg press");
    const hoist = Array.from(page().querySelectorAll<HTMLButtonElement>(".rb-pick__item")).find((b) => b.textContent?.includes("Hoist leg press"))!;
    await click(hoist);
    await click(button("Apply Routine A"));
    const saved = fake.writes.find((w) => w.op === "update" && w.path === "routines/rA");
    expect(saved?.data.machineIds).toEqual(["m-chest-press", "m-pulldown", HOIST]);
  });

  it("names a routine machine this floor doesn't have in full, beside Not at this studio", async () => {
    await mount(drawer(FLOOR));
    const row = Array.from(page().querySelectorAll(".rb-row")).find((r) => r.textContent?.includes("Not at this studio"));
    expect(row?.textContent).toContain("Pulldown");
    // The pulldown isn't on this floor, so it isn't offered either.
    await click(button("Add"));
    expect(pickerNames()).not.toContain("Pulldown");
  });

  it("before this round (the app-wide list alone) the Hoist was never offered", async () => {
    await mount(drawer(undefined));
    await click(button("Add"));
    expect(pickerNames()).not.toContain("Hoist leg press");
  });
});

describe("Programming's Routine A rows name a studio-built machine and open its card", () => {
  const ROUTINE_A = { id: "rA", name: "Routine A", clientId: "c1", machineIds: ["m-leg-press", HOIST, "m-pulldown"], studioId: "strongsville" } as Routine;
  // ProgrammingTab's `routineMachines`: this floor first, then every machine the app knows.
  const ROUTINE_MACHINES = floorWithHistoryMachines(FLOOR, APP_WIDE, APP_WIDE.map((m) => m.id ?? ""));
  const tab = (machines: Machine[], opened: string[]) => (
    <RoutinesTab
      client={CLIENT}
      clientId="c1"
      machines={machines}
      clientSettings={{}}
      allLogs={[]}
      sessions={[]}
      adjustments={[]}
      trainers={[]}
      selectedRoutineTodayId={null}
      onEdit={() => {}}
      view="Routine A"
      routines={[ROUTINE_A]}
      isBActive={false}
      onToggleB={() => {}}
      onSelectMachine={(id) => opened.push(id)}
    />
  );

  it("says Hoist leg press, never Unknown machine, and the row opens it", async () => {
    const opened: string[] = [];
    await mount(tab(ROUTINE_MACHINES, opened));
    const text = page().textContent ?? "";
    expect(text).toContain("Hoist leg press");
    expect(text).not.toContain("Unknown machine");
    // A machine the floor doesn't have still has its name.
    expect(text).toContain("Pulldown");
    await click(button(/Hoist leg press/));
    expect(opened).toEqual([HOIST]);
  });

  it("before this round (the app-wide list) the same routine said Unknown machine", async () => {
    await mount(tab(APP_WIDE, []));
    expect(page().textContent ?? "").toContain("Unknown machine");
  });
});
