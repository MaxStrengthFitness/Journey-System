// @vitest-environment jsdom
/**
 * THE MAP AND THE TEAM'S CLEANING CHECKLIST, MOUNTED (the studio map, phase
 * 4, Oct 2026). AJ: "have the team just check off what they did just like a
 * a checklist ... it doesn't need to be that military", "or even just mark
 * it all once they are done and go to the office".
 *
 * Over a fake Firestore that answers every listener from fixtures and keeps
 * every batch: the map's four states, Look up and Cleaning, a tap that marks
 * and one that opens the card, Mark all and its Undo, a care read that
 * failed, which doors remember Cleaning, and the words it never says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Data = Record<string, unknown>;
const fs = vi.hoisted(() => ({
  data: {} as Record<string, Record<string, Data>>,
  listeners: [] as { path: string; live: boolean; next?: (x: unknown) => void }[],
  batches: [] as { path: string; data: Data }[][],
  hold: null as Promise<void> | null,
  /** Paths whose listener answers with an error. */
  fail: new Set<string>(),
  /** Paths whose listener never answers. */
  silent: new Set<string>(),
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sara" } }, functions: {} }));
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
      const docs = Object.entries(fs.data[path] ?? {}).map(([id, d]) => ({ id, data: () => d, get: (k: string) => d[k], exists: () => true }));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn), metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
    }
    const d = fs.data[segs.slice(0, -1).join("/")]?.[segs[segs.length - 1]];
    return { id: segs[segs.length - 1], exists: () => Boolean(d), data: () => d, get: (k: string) => d?.[k], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  return {
    ...real,
    doc: (...p: unknown[]) => ({ path: pathOf(p) }),
    collection: (...p: unknown[]) => ({ path: pathOf(p) }),
    query: (r: unknown) => r,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (ref: { path: string }, ...rest: unknown[]) => {
      const fns = rest.filter((x) => typeof x === "function") as ((x: unknown) => void)[];
      const l = { path: ref.path, live: true, next: fns[0] };
      fs.listeners.push(l);
      if (fs.fail.has(ref.path)) fns[1]?.(new Error("permission-denied"));
      else if (!fs.silent.has(ref.path)) fns[0]?.(snapOf(ref.path));
      return () => {
        l.live = false;
      };
    },
    getDoc: async (ref: { path: string }) => snapOf(ref.path),
    writeBatch: () => {
      const ops: { path: string; data: Data }[] = [];
      return {
        set: (r: { path: string }, d: Data) => ops.push({ path: r.path, data: d }),
        update() {},
        delete() {},
        commit: () => {
          fs.batches.push(ops);
          // Firestore shows a write to this iPad's listeners at once (latency compensation), sent or not.
          const touched = new Set<string>();
          for (const op of ops) {
            const segs = op.path.split("/");
            const col = segs.slice(0, -1).join("/");
            if (!col.endsWith("machineCare")) continue;
            const id = segs[segs.length - 1];
            fs.data[col] = { ...(fs.data[col] ?? {}), [id]: { ...(fs.data[col]?.[id] ?? {}), ...op.data } };
            touched.add(col);
          }
          if (touched.size > 0) {
            queueMicrotask(() => {
              for (const l of fs.listeners) if (l.live && touched.has(l.path) && !fs.fail.has(l.path) && !fs.silent.has(l.path)) l.next?.(snapOf(l.path));
            });
          }
          return fs.hold ?? Promise.resolve();
        },
      };
    },
    serverTimestamp: () => "__now__",
  };
});
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" }, studios: [] }),
}));

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
const { ToastProvider } = await import("../../../contexts/ToastContext");
const { MachineCareProvider } = await import("../../relay/board/machine-care-context");
const { forgetPersonalMemory } = await import("../../sign-out/memory");
const { default: FloorMapView } = await import("./FloorMapView");
type Props = import("./FloorMapView").FloorMapViewProps;
type Trainer = import("../../../types").Trainer;

const SARA = { id: "t-sara", authUid: "uid-sara", fullName: "Sara Brook", role: "LifeTransformer", primaryHomeStudioId: "solon" } as unknown as Trainer;
const MARINA = { id: "u-marina", name: "Marina Bell" };
const ft = (n: number) => Math.round(n * 304.8);
const size = (lengthMm: number) => ({ lengthMm, widthMm: 1270, by: "u", at: null });
const IDS = ["m-leg-press", "m-chest-press", "m-lumbar"] as const;

function seed() {
  fs.data = {
    machines: Object.fromEntries(IDS.map((id) => [id, MACHINE_DEFINITIONS[id] as unknown as Data])),
    "studios/solon/roster": Object.fromEntries(
      IDS.map((id, i) => [
        id,
        { machineId: id, studioId: "solon", source: "catalog", basedOn: id, status: id === "m-lumbar" ? "maintenance" : "active", order: i + 1, unit: { size: size(1800) } },
      ]),
    ),
    "studios/solon/floorPlans": {
      current: {
        v: 1,
        name: "The layout",
        room: {
          areaSqFt: 1800,
          boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(40), h: ft(30) }],
          places: [
            { id: "pc-1", kind: "aed", x: 0, y: ft(10), w: 305, h: 305 },
            { id: "pc-2", kind: "extinguisher", x: ft(39), y: ft(2), w: 305, h: 305 },
          ],
        },
        placements: IDS.map((id, i) => ({ machineId: id, x: ft(8 + i * 10), y: ft(12), rotationDeg: 0 })),
        rev: 2,
        updatedAt: null,
        updatedBy: "u",
      },
    },
    "studios/solon/machineCare": {
      // Wiped today, by someone the map never names.
      "m-leg-press": { machineId: "m-leg-press", lastWipedAt: Date.now() - 60_000, lastWipedBy: MARINA, lastDeepCleanAt: null, lastDeepCleanBy: null, flag: null },
      "m-chest-press": { machineId: "m-chest-press", lastWipedAt: Date.now() - 3 * 86_400_000, lastWipedBy: MARINA, lastDeepCleanAt: null, lastDeepCleanBy: null, flag: null },
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
  fs.fail = new Set();
  fs.silent = new Set();
  forgetPersonalMemory();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function mount(p: Partial<Props> = {}) {
  const onOpenCard = p.onOpenCard ?? vi.fn();
  await act(async () => {
    root.render(
      <ToastProvider>
        <MachineCareProvider studioId="solon">
          <FloorMapView door="my-studio" studioId="solon" studioName="Solon" authTrainer={SARA} onOpenCard={onOpenCard} {...p} />
        </MachineCareProvider>
      </ToastProvider>,
    );
  });
  return { onOpenCard };
}
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
const enter = (id: string) =>
  act(async () => {
    host.querySelector(`[data-id="${id}"].smap-m`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
const careWrites = (i: number) => fs.batches[i].filter((w) => w.path.includes("/machineCare/")).map((w) => w.path.split("/").pop());

describe("the map's states", () => {
  it("says loading, unreadable and no map yet, and never draws a guess", async () => {
    fs.silent.add("studios/solon/floorPlans/current");
    await mount();
    expect(host.textContent).toBe("Loading the map…");
    await act(async () => root.render(<></>));
    fs.silent.clear();
    fs.fail.add("studios/solon/floorPlans/current");
    await mount();
    expect(host.textContent).toBe("Can't show the map right now.");
    await act(async () => root.render(<></>));
    fs.fail.clear();
    delete fs.data["studios/solon/floorPlans"];
    await mount();
    expect(host.textContent).toBe("No map yet.");
  });

  it("draws catalog copies that name no model at their Imagine Strength size, never a marker, and waits for the models rather than guess", async () => {
    // AJ, Oct 12 2026: every machine on the practice floor was a "?" until someone found Sizes. "Fill them in".
    const { IMAGINE_STRENGTH_MODELS, seedModelDocument } = await import("../imagine-strength");
    for (const id of IDS) delete (fs.data["studios/solon/roster"][id] as { unit?: unknown }).unit;
    fs.data.machineModels = Object.fromEntries(
      IMAGINE_STRENGTH_MODELS.filter((m) => (IDS as readonly string[]).includes(m.movementId)).map((r) => [r.id, seedModelDocument(r) as unknown as Data]),
    );
    fs.silent.add("machineModels");
    await mount();
    expect(host.querySelector(".smap-m--marker")).toBeNull();
    expect(host.querySelector("svg.smap-svg")).toBeNull();
    await act(async () => root.render(<></>));
    fs.silent.clear();
    await mount();
    expect(fs.listeners.some((l) => l.path === "machineModels")).toBe(true);
    expect(host.querySelector(".smap-m--marker")).toBeNull();
    expect(host.querySelector('[data-id="m-leg-press"].smap-m')?.getAttribute("aria-label")).toContain("6 ft 11 in long × 4 ft 2 in wide");
  });

  it("never reads the models while every unit is measured", async () => {
    await mount();
    expect(fs.listeners.some((l) => l.path === "machineModels")).toBe(false);
  });

  it("draws the room, the AED and the extinguisher with their words, and the floor in walking order; never Arrange the floor", async () => {
    await mount();
    expect(host.querySelector("svg.smap-svg")?.getAttribute("aria-label")).toBe("Solon's map");
    expect([...host.querySelectorAll(".smap-safety__name")].map((t) => t.textContent)).toEqual(["AED", "Fire extinguisher"]);
    expect([...host.querySelectorAll(".smap-clean__name")].map((b) => b.textContent)).toEqual(["LEG PRESS", "CHEST PRESS", "LUMBAR"]);
    expect(host.textContent).toContain("AED · Fire extinguisher");
    expect(host.textContent).not.toMatch(/Arrange the floor|Draw the floor/);
  });
});

describe("Look up", () => {
  it("is where My Studio opens; a tap opens the card", async () => {
    const { onOpenCard } = await mount();
    expect(button("Look up")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).not.toContain("Tap a machine when it's wiped.");
    await enter("m-chest-press");
    expect(onOpenCard).toHaveBeenCalledWith("m-chest-press", "machines");
    expect(fs.batches).toHaveLength(0);
  });

  it("reads no task rows (only Cleaning does, and never when the host passed them)", async () => {
    await mount();
    expect(fs.listeners.some((l) => l.path.includes("taskTemplates"))).toBe(false);
    await click(button("Cleaning"));
    expect(fs.listeners.some((l) => l.live && l.path.includes("taskTemplates"))).toBe(true);
    await act(async () => root.render(<></>));
    fs.listeners = [];
    await mount({ door: "relay", rows: [] });
    expect(fs.listeners.some((l) => l.path.includes("taskTemplates"))).toBe(false);
  });
});

describe("Cleaning", () => {
  it("shows its line and Mark all in the row above the drawing, the tick on today's wipe and Out of service, and its words always", async () => {
    await mount({ door: "relay" });
    // Relay opens in Cleaning the first time (design §G question 1's default).
    expect(button("Cleaning")?.getAttribute("aria-pressed")).toBe("true");
    const head = host.querySelector(".smap-head")!;
    expect(head.textContent).toContain("1 of 2 wiped today");
    expect(head.querySelector("button.smap-btn--primary")?.textContent).toBe("Mark all 1 wiped");
    expect(head.compareDocumentPosition(host.querySelector(".smap-frame")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).toContain("Tap a machine when it's wiped.");
    expect(host.querySelector('[data-id="m-leg-press"].smap-m')?.getAttribute("class")).toContain("smap-m--wiped");
    expect(host.querySelector('[data-id="m-leg-press"] .smap-m__tick')).not.toBeNull();
    expect(host.querySelector('[data-id="m-lumbar"].smap-m')?.getAttribute("class")).toContain("smap-m--out");
    expect([...host.querySelectorAll(".smap-clean__state")].map((s) => s.textContent)).toEqual(["Wiped today", "Out of service"]);
  });

  it("marks a machine not wiped today with one tap, one batch, not waiting for it, Undo on the toast", async () => {
    let release = () => {};
    fs.hold = new Promise<void>((r) => (release = r));
    const { onOpenCard } = await mount({ door: "relay" });
    await enter("m-chest-press");
    expect(onOpenCard).not.toHaveBeenCalled();
    expect(fs.batches).toHaveLength(2); // the mark, and its upkeep log entry (no chore row to record it)
    expect(careWrites(0)).toEqual(["m-chest-press"]);
    expect(document.body.textContent).toContain("CHEST PRESS wiped today.");
    await click(document.querySelector("[data-toast-action]"));
    expect(fs.batches[2].find((w) => w.path.endsWith("m-chest-press"))?.data).toMatchObject({ lastWipedBy: MARINA });
    release();
  });

  it("opens the card at Clean for a machine already wiped today", async () => {
    const { onOpenCard } = await mount({ door: "relay" });
    await enter("m-leg-press");
    expect(onOpenCard).toHaveBeenCalledWith("m-leg-press", "cleaning");
    expect(fs.batches).toHaveLength(0);
  });

  it("Mark all sends one batch with exactly the in-service machines not wiped today, and its Undo restores them", async () => {
    await mount({ door: "relay" });
    await click(button("Mark all 1 wiped"));
    expect(careWrites(0)).toEqual(["m-chest-press"]);
    expect(document.body.textContent).toContain("1 machine marked wiped today.");
    await click(document.querySelector("[data-toast-action]"));
    expect(careWrites(2)).toEqual(["m-chest-press"]);
  });

  it("with a failed care read draws no mark and no state word, says so, and offers no Undo", async () => {
    fs.fail.add("studios/solon/machineCare");
    await mount({ door: "relay" });
    expect(host.querySelector(".smap-m--wiped, .smap-m--used")).toBeNull();
    expect([...host.querySelectorAll(".smap-clean__state")].map((s) => s.textContent)).toEqual(["Out of service"]);
    expect(host.querySelector(".smap-head")?.textContent).toContain("Can't read the cleaning marks right now.");
    await click(button("Mark all 2 wiped"));
    expect(careWrites(0)).toEqual(["m-leg-press", "m-chest-press"]);
    expect(document.querySelector("[data-toast-action]")).toBeNull();
  });

  it("is never remembered on My Studio, and is on Relay", async () => {
    await mount();
    await click(button("Cleaning"));
    await act(async () => root.render(<></>));
    await mount();
    expect(button("Look up")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.render(<></>));
    await mount({ door: "relay" });
    await click(button("Look up"));
    await act(async () => root.render(<></>));
    await mount({ door: "relay" });
    expect(button("Look up")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("draws an empty box on every in-service machine still to wipe, so Cleaning never looks like Look up; Look up draws none", async () => {
    delete fs.data["studios/solon/machineCare"]["m-leg-press"];
    await mount({ door: "relay" });
    expect(button("Cleaning")?.getAttribute("aria-pressed")).toBe("true");
    // Nothing wiped: one empty box a machine in service, none on the one out of service, no tick.
    expect([...host.querySelectorAll(".smap-m__box")].map((b) => b.closest(".smap-m")?.getAttribute("data-id"))).toEqual(["m-leg-press", "m-chest-press"]);
    expect(host.querySelector(".smap-m__tick")).toBeNull();
    expect(host.querySelector('[data-id="m-chest-press"].smap-m')?.getAttribute("aria-label")).toMatch(/, tap when it's wiped$/);
    await click(button("Look up"));
    expect(host.querySelector(".smap-m__box")).toBeNull();
    expect(host.querySelector('[data-id="m-chest-press"].smap-m')?.getAttribute("aria-label")).not.toContain("tap when it's wiped");
  });

  it("says it is reading the marks while the care read hasn't answered, never that it can't", async () => {
    fs.silent.add("studios/solon/machineCare");
    await mount({ door: "relay" });
    expect(host.querySelector(".smap-head")?.textContent).toContain("Reading the cleaning marks…");
    expect(host.querySelector(".smap-head")?.textContent).not.toContain("Can't read");
    expect(host.querySelector(".smap-m__box, .smap-m__tick")).toBeNull();
  });

  it("never says who, a minute, or Due", async () => {
    await mount({ door: "relay" });
    const text = host.textContent ?? "";
    for (const bad of ["Marina", "min", " AM", " PM", "Due"]) expect(text).not.toContain(bad);
  });
});
