// @vitest-environment jsdom
/**
 * THE ONE CARD, MOUNTED (the studio map, phase 4, Oct 2026).
 *
 * AJ's "1a": one card from every door, Learn · Clean · Maintain · Set up in
 * one order, only the part open first changing. Mounted over a fake
 * Firestore that answers every listener from fixtures and counts them, so
 * the reads each part mounts (and closes when folded) are the real hooks'.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Data = Record<string, unknown>;
const fs = vi.hoisted(() => ({
  /** Collection path → id → document. */
  data: {} as Record<string, Record<string, Data>>,
  listeners: [] as { path: string; next: ((snap: unknown) => void) | undefined; live: boolean }[],
  batches: [] as { path: string; data: Data }[][],
  /** A batch's commit resolves only when this does (a write still on its way). */
  hold: null as Promise<void> | null,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sara" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const pathOf = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : (p as { path?: string } | null)?.path))
      .filter(Boolean)
      .join("/");
  const snapOf = (path: string) => {
    const segs = path.split("/");
    if (segs.length % 2 === 1) {
      const docs = Object.entries(fs.data[path] ?? {}).map(([id, d]) => ({ id, data: () => d, get: (k: string) => d[k], exists: () => true, ref: { path: `${path}/${id}` } }));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn), metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
    }
    const d = fs.data[segs.slice(0, -1).join("/")]?.[segs[segs.length - 1]];
    return { id: segs[segs.length - 1], exists: () => Boolean(d), data: () => d, get: (k: string) => d?.[k], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  return {
    ...real,
    doc: (...p: unknown[]) => ({ path: pathOf(p) }),
    collection: (...p: unknown[]) => ({ path: pathOf(p) }),
    collectionGroup: (_db: unknown, id: string) => ({ path: id }),
    query: (r: unknown) => r,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (ref: { path: string }, ...rest: unknown[]) => {
      const next = rest.find((x) => typeof x === "function") as ((snap: unknown) => void) | undefined;
      const l = { path: ref.path, next, live: true };
      fs.listeners.push(l);
      next?.(snapOf(ref.path));
      return () => {
        l.live = false;
      };
    },
    getDoc: async (ref: { path: string }) => snapOf(ref.path),
    getDocs: async (ref: { path: string }) => snapOf(ref.path),
    writeBatch: () => {
      const ops: { path: string; data: Data }[] = [];
      return {
        set: (r: { path: string }, d: Data) => ops.push({ path: r.path, data: d }),
        update: (r: { path: string }, d: Data) => ops.push({ path: r.path, data: d }),
        delete() {},
        commit: () => {
          fs.batches.push(ops);
          return fs.hold ?? Promise.resolve();
        },
      };
    },
    serverTimestamp: () => "__now__",
    deleteField: () => "__delete__",
    setDoc: async () => {},
    updateDoc: async () => {},
    addDoc: async () => ({ id: "x" }),
  };
});
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon", headTrainerId: "t-lead" }, studios: [{ id: "solon", name: "Solon" }] }),
}));

const { MACHINE_DEFINITIONS } = await import("../../data/machine-definitions");
const { ToastProvider } = await import("../../contexts/ToastContext");
const { UnsavedChangesProvider, UnsavedChangesScope, useLeaveScope } = await import("../unsaved-changes");
const { MachineCareProvider } = await import("../relay/board/machine-care-context");
const { RelayProvider } = await import("../relay/board/RelayContext");
const { MachineCard } = await import("./MachineCard");
const { CARD_DOORS, CARD_PARTS, firstPartFor } = await import("./parts");
type CardDoor = import("./parts").CardDoor;
type MapMode = import("./parts").MapMode;
type MachineCardProps = import("./MachineCard").MachineCardProps;
type Trainer = import("../../types").Trainer;

const SARA = { id: "t-sara", authUid: "uid-sara", fullName: "Sara Brook", role: "LifeTransformer", primaryHomeStudioId: "solon" } as unknown as Trainer;
const LEAD = { id: "t-lead", authUid: "uid-sara", fullName: "Elrond Peredhel", role: "StudioLeader", primaryHomeStudioId: "solon" } as unknown as Trainer;
const MARINA = { id: "u-marina", name: "Marina Bell" };
const GLORF = { id: "u-glorf", name: "Glorfindel Ash" };
const DAY = 86_400_000;

function seed() {
  fs.data = {
    machines: { "m-leg-press": MACHINE_DEFINITIONS["m-leg-press"] as unknown as Data },
    "studios/solon/roster": {
      "m-leg-press": { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" },
    },
    "studios/solon/machineCare": {
      "m-leg-press": {
        machineId: "m-leg-press",
        lastWipedAt: Date.now() - 2 * DAY,
        lastWipedBy: MARINA,
        lastDeepCleanAt: Date.now() - 3 * DAY,
        lastDeepCleanBy: GLORF,
        flag: null,
      },
    },
  };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  seed();
  fs.listeners = [];
  fs.batches = [];
  fs.hold = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const live = () => fs.listeners.filter((l) => l.live).map((l) => l.path);
const push = (path: string) => {
  for (const l of fs.listeners) if (l.live && l.path === path) l.next?.(((): unknown => {
    const docs = Object.entries(fs.data[path] ?? {}).map(([id, d]) => ({ id, data: () => d }));
    return { docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn), metadata: { fromCache: false } };
  })());
};

function Shell({ children, relay }: { children: ReactNode; relay?: boolean }) {
  const inner = (
    <MachineCareProvider studioId="solon">
      {relay ? (
        <RelayProvider
          value={
            {
              studioId: "solon",
              studioName: "Solon",
              authTrainer: SARA,
              uid: "uid-sara",
              trainers: [],
              clients: [],
              schedules: [],
              sessions: [],
              machines: [],
              now: { todayKey: "2026-10-12", nowMin: 600, phase: "mid" },
              canLead: false,
              panel: null,
              openCapture: () => {},
              openPanel: () => {},
              closePanel: () => {},
              dayRows: [],
            } as never
          }
        >
          {children}
        </RelayProvider>
      ) : (
        children
      )}
    </MachineCareProvider>
  );
  return (
    <UnsavedChangesProvider>
      <ToastProvider>{inner}</ToastProvider>
    </UnsavedChangesProvider>
  );
}

async function mount(p: Partial<MachineCardProps> = {}, opts: { relay?: boolean } = {}) {
  const onClose = p.onClose ?? vi.fn();
  await act(async () => {
    root.render(
      <Shell relay={opts.relay}>
        <MachineCard door="my-studio" mode="machines" studioId="solon" studioName="Solon" machineId="m-leg-press" authTrainer={SARA} onClose={onClose} {...p} />
      </Shell>,
    );
  });
  return { onClose };
}

const parts = () => [...host.querySelectorAll(".mdc-part")];
const isOpen = (part: string) => host.querySelector(`.mdc-part[data-part="${part}"] .mdc-part__head`)?.getAttribute("aria-expanded") === "true";
const unfold = (part: string) => act(async () => (host.querySelector(`.mdc-part[data-part="${part}"] .mdc-part__head`) as HTMLButtonElement).click());
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const click = (el: Element | undefined | null) => act(async () => (el as HTMLElement).click());

describe("one card from every door", () => {
  it("opens the part its door says, in every door and mode, the parts always in one order", async () => {
    for (const door of CARD_DOORS) {
      for (const mode of ["machines", "cleaning"] as MapMode[]) {
        await mount({ door: door as CardDoor, mode });
        expect(parts().map((p) => p.getAttribute("data-part"))).toEqual([...CARD_PARTS]);
        for (const part of CARD_PARTS) expect(isOpen(part), `${door} ${mode} ${part}`).toBe(part === firstPartFor(door as CardDoor, mode));
        await act(async () => root.render(<></>));
      }
    }
  });

  it("gives a trainer Set up read only and no Out of service, and a leader the button", async () => {
    await mount({ authTrainer: SARA });
    expect(isOpen("setup")).toBe(true);
    await unfold("maintain");
    expect(button("Take it out of service")).toBeUndefined();
    expect(host.textContent).toContain("In service.");
    await act(async () => root.render(<></>));
    await mount({ authTrainer: LEAD });
    await unfold("maintain");
    expect(button("Take it out of service")).toBeTruthy();
  });

  it("calls onOpenCatalogPage from Learn", async () => {
    const onOpenCatalogPage = vi.fn();
    await mount({ door: "catalog", onOpenCatalogPage });
    await click(button("Open its Catalog page"));
    expect(onOpenCatalogPage).toHaveBeenCalledWith("m-leg-press");
  });
});

describe("Clean", () => {
  it("says the wipe and the deep clean in days, holds no flag button, and never a name or a minute", async () => {
    await mount({ door: "relay", mode: "machines" }, { relay: true });
    expect(isOpen("clean")).toBe(true);
    const clean = host.querySelector('.mdc-part[data-part="clean"]')!;
    expect(clean.textContent).toContain("Last wiped");
    expect(clean.textContent).toContain("Deep cleaned");
    expect([...clean.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(expect.not.arrayContaining(["Flag", "Report it"]));
    await unfold("maintain");
    for (const bad of ["Marina", "Glorfindel", "min ago", " AM", " PM"]) expect(host.textContent).not.toContain(bad);
  });

  it("Wiped closes the card before its write resolves, and the toast's Undo puts the last wipe back", async () => {
    let release = () => {};
    fs.hold = new Promise<void>((r) => (release = r));
    const before = fs.data["studios/solon/machineCare"]["m-leg-press"];
    const { onClose } = await mount({ door: "relay" }, { relay: true });
    await click(button("Wiped"));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The mark (one batch), and, with no chore row to record it, one upkeep log entry beside it.
    expect(fs.batches).toHaveLength(2);
    expect(fs.batches[0][0]).toMatchObject({ path: "studios/solon/machineCare/m-leg-press", data: { machineId: "m-leg-press", lastWipedBy: { id: "uid-sara", name: "Sara Brook" } } });
    expect(fs.batches[1][0]).toMatchObject({ data: { machineId: "m-leg-press", kind: "clean" } });
    expect(document.body.textContent).toContain("LEG PRESS wiped today.");
    await click(document.querySelector("[data-toast-action]"));
    expect(fs.batches[2][0].data).toMatchObject({ lastWipedAt: before.lastWipedAt, lastWipedBy: MARINA });
    release();
  });
});

describe("Maintain", () => {
  it("opens with Report a problem, which asks before the card closes over its typing", async () => {
    function Host() {
      const scope = useLeaveScope();
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => scope.guard(() => setOpen(false))}>
            Close the card
          </button>
          {open && (
            <UnsavedChangesScope scope={scope}>
              <MachineCard door="my-studio" mode="machines" studioId="solon" studioName="Solon" machineId="m-leg-press" authTrainer={SARA} onClose={() => {}} />
            </UnsavedChangesScope>
          )}
        </>
      );
    }
    await act(async () => root.render(<Shell><Host /></Shell>));
    await unfold("maintain");
    const maintain = host.querySelector('.mdc-part[data-part="maintain"] .mdc-part__body')!;
    expect(maintain.querySelector("h3")?.textContent).toBe("Report a problem");
    const box = maintain.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "The seat pad is torn");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Close the card"));
    expect(document.body.querySelector("[role='alertdialog']")?.textContent).toContain("problem report");
    expect(host.querySelector(".mdc")).not.toBeNull();
  });

  it("Report it writes the machine's flag, and the header says it without a name", async () => {
    await mount({ door: "relay" }, { relay: true });
    await unfold("maintain");
    const box = host.querySelector('.mdc-part[data-part="maintain"] textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "torn pad on the seat");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Report it"));
    expect(fs.batches.at(-1)![0]).toMatchObject({ path: "studios/solon/machineCare/m-leg-press", data: { flag: { note: "torn pad on the seat" } } });
  });
});

describe("the card's reads", () => {
  it("opens no listener when the host supplies every read", async () => {
    const floor = {
      rosterEntries: [fs.data["studios/solon/roster"]["m-leg-press"]] as never,
      byId: { "m-leg-press": { machineId: "m-leg-press", name: "LEG PRESS", comparisonKey: "m-leg-press", primaryMuscles: [], rosterStatus: "active" } } as never,
      catalog: [],
      loading: false,
    };
    await act(async () => {
      root.render(
        <Shell>
          <MachineCard
            door="relay"
            mode="cleaning"
            studioId="solon"
            studioName="Solon"
            machineId="m-leg-press"
            authTrainer={SARA}
            onClose={() => {}}
            rows={[]}
            reads={{ floor, cleaning: { deepDays: 14, wipeAfter: 4, weeklyDay: null } }}
          />
        </Shell>,
      );
    });
    // The provider's one care read, and nothing the card opened beside the app's two shared reads
    // (the catalog and head office's defaults: one listener each for the whole app, held by every screen).
    expect(live().filter((p) => p !== "machines" && p !== "system/studioDefaults")).toEqual(["studios/solon/machineCare"]);
  });

  it("from Relay at Clean, adds only the roster and the studio's own settings beside the app's shared reads; Maintain at most 6, Set up at most 2, each closed when folded", async () => {
    const SHARED = new Set(["machines", "system/studioDefaults"]);
    const own = () => live().filter((p) => p !== "studios/solon/machineCare" && !SHARED.has(p));
    await mount({ door: "relay" }, { relay: true });
    const atClean = own();
    expect(atClean.length).toBeLessThanOrEqual(2);
    await unfold("maintain");
    const withMaintain = own().length - atClean.length;
    expect(withMaintain).toBeGreaterThan(0);
    expect(withMaintain).toBeLessThanOrEqual(6);
    await unfold("maintain");
    expect(own()).toEqual(atClean);
    await unfold("setup");
    const withSetup = own().length - atClean.length;
    expect(withSetup).toBeLessThanOrEqual(2);
    await unfold("setup");
    expect(own()).toEqual(atClean);
  });
});

describe("a card opened through relay.openPanel stays live", () => {
  it("shows a deep clean and a flag from another iPad while it is open", async () => {
    // The panel's content is an element held in state, as MyStudioView holds it.
    let show: (el: ReactNode) => void = () => {};
    function PanelHost() {
      const [panel, setPanel] = useState<ReactNode>(null);
      show = setPanel;
      return <div className="panel">{panel}</div>;
    }
    await act(async () => root.render(<Shell relay><PanelHost /></Shell>));
    await act(async () =>
      show(<MachineCard door="relay" mode="machines" studioId="solon" studioName="Solon" machineId="m-leg-press" authTrainer={SARA} onClose={() => {}} />),
    );
    expect(host.textContent).not.toContain("Deep cleaned today");
    fs.data["studios/solon/machineCare"]["m-leg-press"] = { ...fs.data["studios/solon/machineCare"]["m-leg-press"], lastDeepCleanAt: Date.now() - 60_000, lastDeepCleanBy: GLORF };
    await act(async () => push("studios/solon/machineCare"));
    expect(host.textContent).toContain("Deep cleaned today");
    fs.data["studios/solon/machineCare"]["m-leg-press"] = { ...fs.data["studios/solon/machineCare"]["m-leg-press"], flag: { note: "squeaks", by: GLORF, at: Date.now() } };
    await act(async () => push("studios/solon/machineCare"));
    expect(host.querySelector(".mdc-head")?.textContent).toContain("Flagged: squeaks.");
    expect(host.textContent).not.toContain("Glorfindel");
  });
});

describe("a machine not on the floor list yet (the catalog stand-in)", () => {
  it("has Learn and Clean, and says so in Set up and Maintain", async () => {
    const floor = {
      rosterEntries: [],
      byId: { "m-leg-press": { machineId: "m-leg-press", name: "LEG PRESS", comparisonKey: "m-leg-press", primaryMuscles: [], rosterStatus: "active" } } as never,
      catalog: [],
      loading: false,
    };
    await mount({ door: "relay", reads: { floor } }, { relay: true });
    expect(host.querySelector(".mdc-head")?.textContent).toContain("MSF catalog · not on this floor's list yet");
    expect(button("Wiped")).toBeTruthy();
    await unfold("setup");
    await unfold("maintain");
    expect(host.querySelector('.mdc-part[data-part="setup"]')?.textContent).toContain("Not on the floor list yet.");
    expect(host.querySelector('.mdc-part[data-part="maintain"]')?.textContent).toContain("Not on the floor list yet.");
  });
});
