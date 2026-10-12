// @vitest-environment jsdom
/**
 * RELAY'S FLOOR, MOUNTED IN THE WHOLE MY STUDIO SHELL (the studio map, phase
 * 4, Oct 2026).
 *
 * The tiles' Cleaning (where a phone cleans, and where three trainers split
 * the cleaning before a map is ever drawn): a tap marks a machine in one
 * batch. Look up opens the one machine card in the Context Panel with Clean
 * open, and that card stays live. And the floor's care record is read ONCE
 * for the whole subtree: the Board, the floor, Since you were in and the
 * card in the panel all take the shell's one read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Data = Record<string, unknown>;
const fs = vi.hoisted(() => ({
  data: {} as Record<string, Record<string, Data>>,
  listeners: [] as { path: string; next: ((s: unknown) => void) | undefined; live: boolean }[],
  batches: [] as { path: string; data: Data }[][],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-sara" } }, functions: {} }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Solon" },
    availableStudios: [{ id: "s1", name: "Solon" }],
    studios: [{ id: "s1", name: "Solon" }],
    network: null,
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));
vi.mock("firebase/firestore", () => {
  const pathOf = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : (p as { path?: string } | null)?.path))
      .filter(Boolean)
      .join("/");
  const ref = (...parts: unknown[]) => ({ path: pathOf(parts), id: "id" });
  const snapOf = (path: string) => {
    const segs = path.split("/");
    if (segs.length % 2 === 1) {
      const docs = Object.entries(fs.data[path] ?? {}).map(([id, d]) => ({ id, data: () => d, get: (k: string) => d[k], exists: () => true }));
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: unknown) => void) => docs.forEach(fn), metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
    }
    const d = fs.data[segs.slice(0, -1).join("/")]?.[segs[segs.length - 1]];
    return { id: segs[segs.length - 1], exists: () => Boolean(d), data: () => d, get: (k: string) => d?.[k], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    startAfter: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (target: { path: string }, ...rest: unknown[]) => {
      const next = rest.find((x) => typeof x === "function") as ((s: unknown) => void) | undefined;
      const l = { path: target.path, next, live: true };
      fs.listeners.push(l);
      const t = setTimeout(() => l.live && next?.(snapOf(target.path)), 0);
      return () => {
        l.live = false;
        clearTimeout(t);
      };
    },
    getDocs: async (q: { path: string }) => snapOf(q.path),
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    getDoc: async (r: { path: string }) => snapOf(r.path),
    setDoc: async () => {},
    updateDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    writeBatch: () => {
      const ops: { path: string; data: Data }[] = [];
      return {
        set: (r: { path: string }, d: Data) => ops.push({ path: r.path, data: d }),
        update() {},
        delete() {},
        commit: async () => {
          fs.batches.push(ops);
        },
      };
    },
    serverTimestamp: () => new Date(),
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
    increment: (n: number) => n,
    deleteField: () => null,
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  };
});

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
const { ToastProvider } = await import("../../../contexts/ToastContext");
const { MyStudioView } = await import("../../my-studio/MyStudioView");
const { forgetPersonalMemory } = await import("../../sign-out/memory");

const SARA = { id: "t-sara", fullName: "Sara Brook", role: "LifeTransformer", primaryHomeStudioId: "s1" } as never;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  forgetPersonalMemory();
  fs.listeners = [];
  fs.batches = [];
  fs.data = {
    machines: {
      "m-leg-press": MACHINE_DEFINITIONS["m-leg-press"] as unknown as Data,
      "m-chest-press": MACHINE_DEFINITIONS["m-chest-press"] as unknown as Data,
    },
    "studios/s1/roster": {
      "m-leg-press": { machineId: "m-leg-press", studioId: "s1", source: "catalog", basedOn: "m-leg-press", status: "active", order: 1 },
      "m-chest-press": { machineId: "m-chest-press", studioId: "s1", source: "catalog", basedOn: "m-chest-press", status: "active", order: 2 },
    },
    "studios/s1/machineCare": {
      // Flagged, so the floor opens by itself; wiped long ago by someone it never names.
      "m-leg-press": { machineId: "m-leg-press", lastWipedAt: Date.now() - 5 * 86_400_000, lastWipedBy: { id: "u-m", name: "Marina Bell" }, flag: { note: "torn pad", by: { id: "u-m", name: "Marina Bell" }, at: Date.now() } },
    },
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const tile = (name: string) => [...host.querySelectorAll(".fm__tile")].find((t) => t.querySelector(".fm__name")?.textContent === name);
const view = (label: string) => [...host.querySelectorAll(".fm__view")].find((b) => b.textContent === label);

async function mountShell() {
  await act(async () => {
    root.render(
      <ToastProvider>
        <MyStudioView authTrainer={SARA} clients={[]} trainers={[SARA]} sessions={[]} machines={[]} />
      </ToastProvider>,
    );
  });
  await settle();
  await settle();
}

describe("Relay's floor (tiles), the cleaning checklist and the card", () => {
  it("opens in Cleaning, where a tap on a tile marks it in one batch", async () => {
    await mountShell();
    expect(host.querySelector(".fm__head")?.getAttribute("aria-expanded")).toBe("true");
    expect(view("Cleaning")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("Tap a machine when it's wiped.");
    await click(tile("CHEST PRESS"));
    const marks = fs.batches.filter((b) => b.some((w) => w.path.includes("/machineCare/")));
    expect(marks).toHaveLength(1);
    expect(marks[0].filter((w) => w.path.includes("/machineCare/")).map((w) => w.path)).toEqual(["studios/s1/machineCare/m-chest-press"]);
  });

  it("opens the one card in the Context Panel from Look up, Clean open, and reads the floor's care once for the whole shell", async () => {
    await mountShell();
    await click(view("Look up"));
    await click(tile("LEG PRESS"));
    const panel = host.querySelector("aside.cp");
    expect(panel?.querySelector(".cp__title")?.textContent).toContain("LEG PRESS");
    expect(panel?.querySelector('.mdc-part[data-part="clean"] .mdc-part__head')?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.querySelector(".mdc-head")?.textContent).toContain("Flagged: torn pad.");
    expect(panel?.textContent).not.toContain("Marina");
    // The Board, the floor, Since you were in and the card in the panel: one read of the care record.
    expect(fs.listeners.filter((l) => l.live && l.path === "studios/s1/machineCare")).toHaveLength(1);
  });
});
