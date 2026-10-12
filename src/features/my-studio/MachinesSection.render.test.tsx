// @vitest-environment jsdom
/**
 * THE MACHINE'S DOOR NEVER DROPS TYPING WITHOUT ASKING (voice review
 * follow-up, final review, Sep 27 2026).
 *
 * My Studio → Machines (and Operations → Floor, the same component) opens a
 * machine's door beside the floor list: the studio's settings and the floor's
 * notes, both of which hold typing and are registered with the unsaved-changes
 * guard. The door's own ways out were plain state, so the X, Escape, or a tap
 * on another machine in the list beside it took a half-typed note away without
 * a word (a new machine re-seeded the same card; a close unmounted it). Each
 * now asks the door's leave scope first, and the door is keyed by machine.
 *
 * Mounted with the real section, the real door, the real notes list and the
 * real provider; the floor list is a stand-in that opens a machine the way
 * StudioInventoryManager's Open button does. Since the notes round (Oct 3
 * 2026) the floor's notes are one dated list per machine (floor-notes/): the
 * note box starts empty, and the old Studio notes show under it as an
 * earlier note.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sara" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: () => () => {},
    setDoc: async () => {},
    serverTimestamp: () => "now",
  };
});
const saved = vi.hoisted(() => ({ notes: vi.fn(async () => "n1") }));
vi.mock("../floor-notes/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../floor-notes/store")>()),
  addFloorNote: saved.notes,
}));
vi.mock("../floor-notes/useFloorNotes", () => ({ useFloorNotes: () => ({ state: "ready", notes: [] }) }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: { id: "solon", name: "Solon" }, activeStudioId: "solon" }),
}));
// Whether the person at the door leads Solon (a trainer, unless a test says).
const lead = vi.hoisted(() => ({ value: false }));
vi.mock("../relay/leads", () => ({ leadsHere: () => lead.value }));

const ROSTER = [
  { machineId: "m-chest-press", studioId: "solon", source: "catalog", basedOn: "m-chest-press", status: "active" },
  { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" },
  // Solon's own machine, and a copy of one Westlake shared.
  { machineId: "sm-solon-sled", studioId: "solon", source: "custom", basedOn: "m-leg-press", status: "active", definition: { name: "Solon Sled" } },
  {
    machineId: "sm-solon-hip-sled",
    studioId: "solon",
    source: "custom",
    basedOn: "m-leg-press",
    status: "active",
    definition: { name: "Hip Sled" },
    adoptedFrom: { studioId: "westlake", machineId: "sm-westlake-hip-sled", studioName: "Westlake" },
  },
];
vi.mock("../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({
    machines: [],
    rosterEntries: ROSTER,
    catalog: [],
    byId: {
      "m-chest-press": { name: "Chest Press" },
      "m-leg-press": { name: "Leg Press" },
      "sm-solon-sled": { name: "Solon Sled" },
      "sm-solon-hip-sled": { name: "Hip Sled" },
    },
    loading: false,
  }),
}));
vi.mock("../../hooks/useStudioMachineSettings", () => ({ useStudioMachineSettings: () => ({ settingsByMachineId: {} }) }));
vi.mock("../catalog/useStudioMachineNotes", () => ({
  useStudioMachineNotes: () => ({
    notesByMachineId: { "m-chest-press": { notes: "Left pad sticks." }, "m-leg-press": { notes: "Footplate to 3." } },
  }),
}));
vi.mock("../admin/upkeep/useStudioUpkeep", () => ({ useStudioUpkeep: () => ({ events: [], loading: false }) }));
// The card's Clean part reads today's rows itself on a door that passed none (phase 4).
const tasksAsked = vi.hoisted(() => [] as (string | null)[]);
vi.mock("../studio-tasks/useStudioTasks", () => ({
  useStudioTasks: (studioId: string | null) => {
    tasksAsked.push(studioId);
    return { rows: [], templates: [], dateKey: "", loading: false, error: null, counts: { total: 0, done: 0, flagged: 0 }, machineCount: 0, outOfServiceIds: new Set() };
  },
}));
vi.mock("../machine-db/hooks", () => ({ useSharedMachines: () => ({ machines: [], loading: false, error: null }) }));
// The floor list: a row's Open, as StudioInventoryManager draws it.
vi.mock("../admin/machines/StudioInventoryManager", () => ({
  StudioInventoryManager: ({ onOpenMachine }: { onOpenMachine?: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onOpenMachine?.("m-chest-press")}>
        Open Chest Press
      </button>
      <button type="button" onClick={() => onOpenMachine?.("m-leg-press")}>
        Open Leg Press
      </button>
      <button type="button" onClick={() => onOpenMachine?.("sm-solon-sled")}>
        Open Solon Sled
      </button>
      <button type="button" onClick={() => onOpenMachine?.("sm-solon-hip-sled")}>
        Open Hip Sled
      </button>
    </div>
  ),
}));

// Arrange the floor (the studio map, phase 2): the editor itself is held by
// its own render test; here, only that the section opens it in place. The
// map (phase 4) likewise: FloorMapView has its own render test; here a
// stand-in whose machine opens the card the way a tap on the map does.
vi.mock("../studio-map/lazy", () => ({
  LazyLayoutView: ({ studioName, canLead, onDone }: { studioName: string; canLead: boolean; onDone: () => void }) => (
    <div data-testid="layout-editor">
      Editing {studioName}'s floor {canLead ? "as a leader" : ""}
      <button type="button" onClick={onDone}>
        Done arranging
      </button>
    </div>
  ),
  LazyFloorMapView: ({ door, onOpenCard }: { door: string; onOpenCard: (id: string, mode: "machines" | "cleaning") => void }) => (
    <div data-testid="the-map" data-door={door}>
      <button type="button" onClick={() => onOpenCard("m-leg-press", "machines")}>
        Leg Press on the map
      </button>
      <button type="button" onClick={() => onOpenCard("m-leg-press", "cleaning")}>
        Leg Press in Cleaning
      </button>
    </div>
  ),
}));
// The studio's map (phase 4): its read, held to a fixture.
const plan = vi.hoisted(() => ({ value: { state: "empty", plan: null, fromCache: false, dropped: 0 } as unknown, asked: [] as boolean[] }));
vi.mock("../studio-map/hooks", () => ({
  useFloorPlan: (_s: string | null, opts: { enabled: boolean }) => {
    plan.asked.push(opts.enabled);
    return opts.enabled ? plan.value : { state: "off", plan: null, fromCache: false, dropped: 0 };
  },
}));
const phone = vi.hoisted(() => ({ value: false }));
vi.mock("../phone/device", () => ({ usePhone: () => phone.value }));

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider } from "../unsaved-changes";
import type { Trainer } from "../../types";
import { MachinesSection } from "./MachinesSection";
import { rememberArrange, rememberMachinesView, takeArrange } from "./machines-view-memory";
import { forgetPersonalMemory } from "../sign-out/memory";

/** A trainer at Solon: she may write the floor's notes. */
const SARA = { id: "t-sara", fullName: "Sara", role: "LifeTransformer", primaryHomeStudioId: "solon" } as unknown as Trainer;

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  saved.notes.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <ToastProvider>
          <MachinesSection authTrainer={SARA} />
        </ToastProvider>
      </UnsavedChangesProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const byText = (label: string) => {
  const b = [...document.body.querySelectorAll("button")].find((x) => x.textContent?.trim() === label || x.getAttribute("aria-label") === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b as HTMLButtonElement;
};
const click = (label: string) => act(async () => byText(label).click());
const door = () => host.querySelector("aside.cp");
/** Unfold a part of the card (the notes are under Maintain since the one card, phase 4). */
const unfold = (part: string) =>
  act(async () => (door()!.querySelector(`.mdc-part[data-part="${part}"] .mdc-part__head`) as HTMLButtonElement).click());
const partOpen = (part: string) => door()?.querySelector(`.mdc-part[data-part="${part}"] .mdc-part__head`)?.getAttribute("aria-expanded") === "true";
const doorTitle = () => door()?.querySelector(".cp__title")?.textContent ?? null;
const notes = () => door()!.querySelector('textarea[id^="fn-new-"]') as HTMLTextAreaElement;
const earlier = () => door()?.querySelector('[aria-label="Earlier notes"]')?.textContent ?? "";
const type = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(notes(), value);
    notes().dispatchEvent(new Event("input", { bubbles: true }));
  });
const question = () => document.body.querySelector("[role='alertdialog']")?.textContent ?? "";
const answer = (a: "keep-editing" | "leave") =>
  act(async () => (document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`) as HTMLButtonElement).click());

describe("the machine's door on My Studio → Machines", () => {
  it("asks before another machine takes a half-typed floor note away", async () => {
    await click("Open Chest Press");
    expect(doorTitle()).toContain("Chest Press");
    await unfold("maintain");
    await type("Left pad sticks. Use the footstool.");

    await click("Open Leg Press");
    expect(question()).toContain("You have unsaved changes to Solon’s note on Chest Press.");
    // Nothing moved while the question is up.
    expect(doorTitle()).toContain("Chest Press");

    await answer("keep-editing");
    expect(doorTitle()).toContain("Chest Press");
    expect(notes().value).toBe("Left pad sticks. Use the footstool.");

    await click("Open Leg Press");
    await answer("leave");
    expect(doorTitle()).toContain("Leg Press");
    // A fresh card on the next machine (Set up open again), a fresh box, and its old Studio notes under the list.
    expect(partOpen("maintain")).toBe(false);
    await unfold("maintain");
    expect(notes().value).toBe("");
    expect(earlier()).toContain("Footplate to 3.");
    expect(saved.notes).not.toHaveBeenCalled();
  });

  it("asks before the door's X or Escape closes it over typing", async () => {
    await click("Open Chest Press");
    await unfold("maintain");
    await type("Half a thought");

    await click("Close");
    expect(question()).toContain("Solon’s note on Chest Press");
    await answer("keep-editing");
    expect(door()).not.toBeNull();
    expect(notes().value).toBe("Half a thought");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(question()).toContain("Solon’s note on Chest Press");
    await answer("leave");
    expect(door()).toBeNull();
  });

  it("opens, switches and closes without asking while nothing is typed, and the open machine again changes nothing", async () => {
    await click("Open Chest Press");
    await click("Open Chest Press");
    expect(question()).toBe("");
    await click("Open Leg Press");
    expect(question()).toBe("");
    expect(doorTitle()).toContain("Leg Press");
    await click("Close");
    expect(question()).toBe("");
    expect(door()).toBeNull();
  });
});

/**
 * LOCAL SET-UP IS FOR A MAX STRENGTH MACHINE (Sep 28 2026). It says what this
 * studio calls a catalog machine and what its unit is; a studio's own machine,
 * or a copy of another studio's, has no catalog machine behind it, and saving
 * Local set-up on one turned it into a copy of a catalog machine that does not
 * exist, so it dropped off the floor (LocalSetupDialog.render.test.tsx). Its
 * name and set-up are changed with Edit on the floor list instead.
 */
describe("the machine's size on its card (the studio map, Oct 2026)", () => {
  it("sits after this studio's standard settings in Set up, open first from the list, and is read only for a trainer", async () => {
    await click("Open Leg Press");
    expect([...(door()?.querySelectorAll(".mdc-part") ?? [])].map((p) => p.getAttribute("data-part"))).toEqual(["learn", "clean", "maintain", "setup"]);
    expect(partOpen("setup")).toBe(true);
    expect(partOpen("maintain")).toBe(false);
    const heads = [...(door()?.querySelectorAll('.mdc-part[data-part="setup"] .mdc-h') ?? [])].map((h) => h.textContent?.trim());
    expect(heads.slice(0, 2)).toEqual(["This studio's standard settings", "Its size"]);
    // No size on file: a trainer is told so, never told to do what only a leader can, and gets no controls.
    expect(door()?.textContent).toContain("Size not known yet.");
    expect(door()?.textContent).not.toContain("Pick its model");
    const buttons = [...(door()?.querySelectorAll("button") ?? [])].map((x) => x.textContent?.trim());
    expect(buttons).not.toContain("Measure it");
  });
});

describe("the door's Local set-up, for a leader", () => {
  beforeAll(() => {
    lead.value = true;
  });
  afterAll(() => {
    lead.value = false;
  });

  const doorButtons = () => [...(door()?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim());

  it("is on a Max Strength machine's door", async () => {
    await click("Open Leg Press");
    expect(doorButtons()).toContain("Local set-up");
  });

  it("is not on the studio's own machine, or on a copy of another studio's", async () => {
    await click("Open Solon Sled");
    expect(doorTitle()).toContain("Solon Sled");
    expect(doorButtons()).not.toContain("Local set-up");
    // Offering it to the catalog is still there: this is the leader's door.
    expect(doorButtons()).toContain("Offer to the MSF catalog");

    await click("Open Hip Sled");
    expect(doorTitle()).toContain("Hip Sled");
    expect(doorButtons()).not.toContain("Local set-up");
  });
});

describe("Arrange the floor (the studio map, phase 2)", () => {
  it("is not a trainer's button", () => {
    expect([...host.querySelectorAll("button")].some((b) => /Arrange the floor|Draw the floor/.test(b.textContent ?? ""))).toBe(false);
  });

  describe("for a leader", () => {
    beforeAll(() => {
      lead.value = true;
    });
    afterAll(() => {
      lead.value = false;
    });

    it("sits in the floor panel's actions (Draw the floor while there is no map), and opens the editor in place of the list until Done", async () => {
      expect(host.querySelector('[data-testid="layout-editor"]')).toBeNull();
      expect([...host.querySelectorAll("button")].some((b) => b.textContent?.includes("Arrange the floor"))).toBe(false);
      await click("Draw the floor");
      expect(host.querySelector('[data-testid="layout-editor"]')?.textContent).toContain("Editing Solon's floor as a leader");
      expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Open Leg Press")).toBe(false);
      await click("Done arranging");
      expect(host.querySelector('[data-testid="layout-editor"]')).toBeNull();
      expect(byText("Open Leg Press")).toBeTruthy();
    });

    it("opens straight in the editor when the Catalog's Draw the floor sent the leader here, once", async () => {
      await remount(() => rememberArrange());
      expect(host.querySelector('[data-testid="layout-editor"]')?.textContent).toContain("Editing Solon's floor as a leader");
      await remount();
      expect(host.querySelector('[data-testid="layout-editor"]')).toBeNull();
    });
  });

  it("never opens the editor for a trainer, even when a door asked for it", async () => {
    await remount(() => rememberArrange());
    expect(host.querySelector('[data-testid="layout-editor"]')).toBeNull();
    expect(takeArrange()).toBe(false);
  });
});

/** Mount the section again, after `before` (a door that remembers where to land). */
async function remount(before?: () => void) {
  await act(async () => root.unmount());
  before?.();
  root = createRoot(host);
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <ToastProvider>
          <MachinesSection authTrainer={SARA} />
        </ToastProvider>
      </UnsavedChangesProvider>,
    );
  });
}

/*
 * MAP FIRST (the studio map, phase 4, Oct 2026; AJ: "the trainers know where
 * all the machines are they dont remember them alphabetically"). Machines
 * opens on the map once the studio has one with a machine of the floor on
 * it; the list is one tap away, and always on a phone. A tap on the map and a
 * row of the list open the same card, Set up first (Clean from Cleaning).
 */
describe("Map | List, map first (the studio map, phase 4)", () => {
  const ft = (n: number) => Math.round(n * 304.8);
  const READY = {
    state: "ready",
    plan: {
      v: 1,
      name: "The layout",
      room: { areaSqFt: 1800, boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(60), h: ft(30) }], places: [] },
      placements: [{ machineId: "m-leg-press", x: ft(10), y: ft(10), rotationDeg: 0 }],
      rev: 2,
      updatedAt: null,
      updatedBy: "u",
    },
    fromCache: false,
    dropped: 0,
  };
  const tab = (label: string) => [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === label) as HTMLButtonElement | undefined;
  afterEach(() => {
    plan.value = { state: "empty", plan: null, fromCache: false, dropped: 0 };
    phone.value = false;
    forgetPersonalMemory();
  });

  it("opens on the map once the layout is ready with a machine of the floor on it", async () => {
    plan.value = READY;
    await remount();
    expect(host.querySelector('[data-testid="the-map"]')?.getAttribute("data-door")).toBe("operations");
    expect(tab("Map")?.getAttribute("aria-selected")).toBe("true");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Open Leg Press")).toBe(false);
  });

  it("opens on the list with no layout, and while the layout is still being read", async () => {
    await remount();
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(byText("Open Leg Press")).toBeTruthy();
    plan.value = { state: "loading", plan: null, fromCache: false, dropped: 0 };
    await remount();
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(byText("Open Leg Press")).toBeTruthy();
  });

  it("keeps a List picked on this iPad, until sign-out", async () => {
    plan.value = READY;
    await remount(() => rememberMachinesView("list"));
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(tab("List")?.getAttribute("aria-selected")).toBe("true");
    await act(async () => tab("Map")!.click());
    expect(host.querySelector('[data-testid="the-map"]')).not.toBeNull();
  });

  it("is always the list on a phone, with no switch and no map read", async () => {
    plan.value = READY;
    phone.value = true;
    plan.asked.length = 0;
    await remount();
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(tab("Map")).toBeUndefined();
    expect(plan.asked.every((on) => on === false)).toBe(true);
  });

  it("opens the same card from a tap on the map and from a row of the list: Set up first, Clean from Cleaning", async () => {
    plan.value = READY;
    await remount();
    await click("Leg Press on the map");
    expect(doorTitle()).toContain("Leg Press");
    expect(partOpen("setup")).toBe(true);
    await click("Close");
    await click("Leg Press in Cleaning");
    expect(partOpen("clean")).toBe(true);
    expect(partOpen("setup")).toBe(false);
    await click("Close");
    await act(async () => tab("List")!.click());
    await click("Open Leg Press");
    expect(doorTitle()).toContain("Leg Press");
    expect(partOpen("setup")).toBe(true);
  });

  it("says Arrange the floor once the studio has a map, for a leader only", async () => {
    plan.value = READY;
    lead.value = true;
    try {
      await remount();
      expect(byText("Arrange the floor")).toBeTruthy();
      await click("Arrange the floor");
      expect(host.querySelector('[data-testid="layout-editor"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    } finally {
      lead.value = false;
    }
  });
});
