// @vitest-environment jsdom
/**
 * ADMINS → ALL LOCATIONS → A STUDIO → EQUIPMENT: Local setup is on a Max
 * Strength machine's row, never on the studio's own (Sep 28 2026).
 *
 * The same rule as My Studio's machine door (MachinesSection.render.test.tsx):
 * saving Local setup on a studio's own machine rewrote it as a copy of a
 * catalog machine that does not exist, and the floor dropped it
 * (LocalSetupDialog.render.test.tsx). This list draws every roster entry, so
 * it offered the button on every row, the studio's own machines and copies
 * of other studios' included.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } } }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  onSnapshot: () => () => {},
  serverTimestamp: () => "now",
  deleteField: () => "__delete__",
  setDoc: async () => {},
  updateDoc: async () => {},
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));
vi.mock("../../../hooks/useMachineCatalog", async () => {
  const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
  const catalog = [MACHINE_DEFINITIONS["m-leg-press"]];
  return { useMachineCatalog: () => ({ catalog, byId: {}, loading: false, failed: false }) };
});
vi.mock("../../../hooks/useStudioMachines", () => {
  const rosterEntries = [
    { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" },
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
  return { useStudioMachines: () => ({ rosterEntries, loading: false }) };
});
vi.mock("../upkeep/useStudioUpkeep", () => ({ useStudioUpkeep: () => ({ events: [], loading: false }) }));
vi.mock("../upkeep/UpkeepDialog", () => ({ UpkeepDialog: () => null }));
vi.mock("./seed", () => ({ seedStandardSet: async () => ({ added: 0, alreadyPresent: 0, duplicates: [] }) }));
vi.mock("../machines/StudioInventoryManager", () => ({ StudioInventoryManager: () => null }));
// Arrange the floor (the studio map, phase 3): the editor itself is the lazy chunk's, tested on its own.
vi.mock("../../studio-map/lazy", () => ({
  LazyLayoutView: ({ studioName, canLead, onDone }: { studioName: string; canLead: boolean; onDone: () => void }) => (
    <div data-testid="arrange">
      Arranging {studioName}'s floor{canLead ? "" : " (read only)"}
      <button type="button" onClick={onDone}>
        Done arranging
      </button>
    </div>
  ),
  LazyFloorMapView: ({ door, onOpenCard }: { door: string; onOpenCard: (id: string, mode: "machines" | "cleaning") => void }) => (
    <div data-testid="the-map" data-door={door}>
      <button type="button" onClick={() => onOpenCard("m-leg-press", "machines")}>
        LEG PRESS on the map
      </button>
    </div>
  ),
}));
vi.mock("../../phone/device", () => ({ usePhone: () => false }));
// The studio's map (phase 4): the read held to a fixture, the map and the card stood in for (each has its own test).
const plan = vi.hoisted(() => ({ value: { state: "empty", plan: null, fromCache: false, dropped: 0 } as unknown }));
vi.mock("../../studio-map/hooks", () => ({
  useFloorPlan: (_s: string | null, opts: { enabled: boolean }) => (opts.enabled ? plan.value : { state: "off", plan: null, fromCache: false, dropped: 0 }),
}));
vi.mock("../../machine-card/MachineCard", () => ({
  MachineCard: ({ door, mode, machineId }: { door: string; mode: string; machineId: string }) => (
    <div data-testid="card">
      The card for {machineId}, from {door}, in {mode}
    </div>
  ),
}));

const { StudioEquipmentPanel } = await import("./StudioEquipmentPanel");
import type { Studio, Trainer } from "../../../types";

let host: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(authTrainer: Trainer | null = null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<StudioEquipmentPanel studio={{ id: "solon", name: "Solon" } as Studio} authTrainer={authTrainer} />);
  });
}

const row = (name: string) =>
  [...host.querySelectorAll(".adm-row")].find((r) => r.querySelector(".adm-row__name")?.textContent === name)!;
const labels = (el: Element) => [...el.querySelectorAll("button")].map((b) => b.textContent?.trim());

describe("the Equipment list on Admins → All locations", () => {
  it("offers Local setup on a Max Strength machine, and opens it", async () => {
    await mount();
    expect(labels(row("LEG PRESS"))).toContain("Local setup");

    await act(async () => {
      [...row("LEG PRESS").querySelectorAll("button")].find((b) => b.textContent?.trim() === "Local setup")!.click();
    });
    expect(host.querySelector("[role='dialog']")?.getAttribute("aria-label")).toBe("Local setup for LEG PRESS");
  });

  it("does not offer it on the studio's own machine, or on a copy of another studio's", async () => {
    await mount();
    expect(row("Solon Sled").textContent).toContain("This studio's own machine");
    expect(labels(row("Solon Sled"))).not.toContain("Local setup");
    expect(labels(row("Hip Sled"))).not.toContain("Local setup");
  });
});

describe("Arrange the floor on Admins → a studio → Floor (the studio map, phase 3)", () => {
  const admin = { id: "t-admin", authUid: "uid-admin", fullName: "Head Office", role: "Admin", studioId: "hq" } as unknown as Trainer;
  const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

  it("is an administrator's, and opens the same editor in place of the list, Done coming back", async () => {
    await mount(admin);
    // No map yet: Draw the floor (phase 4's words, the same in every door).
    expect(button("Arrange the floor")).toBeUndefined();
    expect(button("Draw the floor")).toBeTruthy();
    await act(async () => button("Draw the floor")!.click());
    expect(host.querySelector("[data-testid=arrange]")!.textContent).toContain("Arranging Solon's floor");
    expect(host.querySelector("[data-testid=arrange]")!.textContent).not.toContain("read only");
    expect(row("LEG PRESS")).toBeUndefined();
    expect(button("Draw the floor")).toBeUndefined();
    await act(async () => button("Done arranging")!.click());
    expect(row("LEG PRESS")).toBeTruthy();
  });

  it("is never offered to someone who doesn't lead the studio", async () => {
    await mount(null);
    expect(button("Arrange the floor")).toBeUndefined();
    expect(button("Draw the floor")).toBeUndefined();
  });
});

describe("the map and the card on Admins → a studio → Floor (the studio map, phase 4)", () => {
  const admin = { id: "t-admin", authUid: "uid-admin", fullName: "Head Office", role: "Admin", studioId: "hq" } as unknown as Trainer;
  const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  const tab = (label: string) => [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === label) as HTMLButtonElement | undefined;
  const ft = (n: number) => Math.round(n * 304.8);
  afterEach(() => {
    plan.value = { state: "empty", plan: null, fromCache: false, dropped: 0 };
  });

  it("opens on the map once the studio has one, with Map | List and Arrange the floor in the panel's actions", async () => {
    plan.value = {
      state: "ready",
      plan: {
        v: 1,
        name: "The layout",
        room: { areaSqFt: 1800, boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(60), h: ft(30) }], places: [] },
        placements: [{ machineId: "m-leg-press", x: ft(10), y: ft(10), rotationDeg: 0 }],
        rev: 1,
        updatedAt: null,
        updatedBy: "u",
      },
      fromCache: false,
      dropped: 0,
    };
    await mount(admin);
    expect(host.querySelector('[data-testid="the-map"]')?.getAttribute("data-door")).toBe("admins");
    expect(tab("Map")?.getAttribute("aria-selected")).toBe("true");
    expect(button("Arrange the floor")).toBeTruthy();
    // A tap on the map: the one card, door admins (Set up first), in Look up.
    await act(async () => button("LEG PRESS on the map")!.click());
    expect(host.querySelector('[data-testid="card"]')?.textContent).toBe("The card for m-leg-press, from admins, in machines");
    expect(host.querySelector(".cp__title")?.textContent).toContain("LEG PRESS");
    // The list is one tap away, with its rows.
    await act(async () => tab("List")!.click());
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(row("LEG PRESS")).toBeTruthy();
  });

  it("is the list while the studio has no map", async () => {
    await mount(admin);
    expect(host.querySelector('[data-testid="the-map"]')).toBeNull();
    expect(row("LEG PRESS")).toBeTruthy();
  });
});
