import { describe, expect, it, vi } from "vitest";
import type { KnownSize } from "../../types/machines";
import * as geometry from "./geometry";

vi.mock("./geometry", async (importOriginal) => {
  const real = await importOriginal<typeof import("./geometry")>();
  return { ...real, satDepth: vi.fn(real.satDepth) };
});
import { overlapChecks, pairChecks, type CheckInput, type CheckMachine } from "./checks";
import type { RoomPlace } from "./layout";
import { ftMm, roomShape, snapDoor } from "./room";

const IN = 25.4;
const SIZE: KnownSize = { lengthMm: 1000, widthMm: 1000, heightMm: null };
const shape = roomShape([{ id: "bx-1", x: 0, y: 0, w: ftMm(60), h: ftMm(30) }]);

const m = (id: string, x: number, y: number, over: Partial<CheckMachine> = {}): CheckMachine => ({
  id,
  name: id === "lp" ? "Leg Press" : id === "lu" ? "Lumbar Extension" : id,
  placement: { machineId: id, x, y, rotationDeg: 0 },
  size: SIZE,
  planned: false,
  ...over,
});
const input = (placed: CheckMachine[], places: RoomPlace[] = []): CheckInput => ({ shape, places, placed });
const lines = (r: ReturnType<typeof overlapChecks>, id: string) => (r.linesById.get(id) ?? []).map((l) => l.text);

describe("overlaps, quietly", () => {
  it("say nothing for machines touching, or overlapping by 6 in; 7 in names the other machine on both", () => {
    expect(overlapChecks(input([m("lp", 3000, 3000), m("lu", 4000, 3000)])).warnIds.size).toBe(0);
    expect(overlapChecks(input([m("lp", 3000, 3000), m("lu", 4000 - 6 * IN, 3000)])).warnIds.size).toBe(0);
    const r = overlapChecks(input([m("lp", 3000, 3000), m("lu", 4000 - 7 * IN, 3000)]));
    expect(lines(r, "lp")).toEqual(["Overlaps the Lumbar Extension by 7 in."]);
    expect(lines(r, "lu")).toEqual(["Overlaps the Leg Press by 7 in."]);
    expect([...r.warnIds].sort()).toEqual(["lp", "lu"]);
  });

  it("let a machine sit flush on the wall, or 3 in into it; 7 in is said", () => {
    expect(overlapChecks(input([m("lp", 3000, 500)])).warnIds.size).toBe(0);
    expect(overlapChecks(input([m("lp", 3000, 500 - 3 * IN)])).warnIds.size).toBe(0);
    expect(lines(overlapChecks(input([m("lp", 3000, 500 - 7 * IN)])), "lp")).toEqual(["Goes 7 in into the wall."]);
  });

  it("say the safety facts past 1 in: the AED, the fire extinguisher, a doorway", () => {
    const aed: RoomPlace = { id: "pc-1", kind: "aed", x: 3500 - 2 * IN, y: 2800, w: 305, h: 305 };
    expect(lines(overlapChecks(input([m("lp", 3000, 3000)], [aed])), "lp")).toEqual(["Covers the AED."]);
    const ext: RoomPlace = { id: "pc-2", kind: "extinguisher", x: 3500 - 2 * IN, y: 2800, w: 305, h: 305 };
    expect(lines(overlapChecks(input([m("lp", 3000, 3000)], [ext])), "lp")).toEqual(["Covers the fire extinguisher."]);
    // A 3 ft door on the top wall, centred at x 10 ft.
    const door = snapDoor({ id: "pc-3", kind: "door", x: ftMm(10) - ftMm(1.5), y: -76, w: ftMm(3), h: 152 }, shape);
    // A machine 3 in off the wall, squarely in front of it: in its swing.
    expect(lines(overlapChecks(input([m("lp", ftMm(10), 500 + 3 * IN)], [door])), "lp")).toEqual(["Stands in the doorway."]);
    // 3 ft 6 in off it: clear.
    expect(overlapChecks(input([m("lp", ftMm(10), 500 + 42 * IN)], [door])).warnIds.size).toBe(0);
  });

  it("name a place by its kind in lower case, and a leader's label as written", () => {
    const desk: RoomPlace = { id: "pc-1", kind: "changing", x: 3170, y: 2500, w: 1000, h: 1000 };
    expect(lines(overlapChecks(input([m("lp", 3000, 3000)], [desk])), "lp")).toEqual(["Overlaps the changing room by 1 ft 1 in."]);
    const named: RoomPlace = { ...desk, label: "Men's changing room" };
    expect(lines(overlapChecks(input([m("lp", 3000, 3000)], [named])), "lp")).toEqual(["Overlaps Men's changing room by 1 ft 1 in."]);
  });

  it("name a machine still to buy as such", () => {
    const r = overlapChecks(input([m("lp", 3000, 3000), m("pm-1", 3500, 3000, { name: "Hip Abductor", planned: true })]));
    expect(lines(r, "lp")).toEqual(["Overlaps the Hip Abductor (to buy) by 1 ft 8 in."]);
  });

  it("leave out a machine with no size", () => {
    const r = overlapChecks(input([m("lp", 3000, 3000), m("lu", 3000, 3000, { size: null })]));
    expect(r.warnIds.size).toBe(0);
  });

  it("never say spacing, a path, or all clear, or a metric unit", () => {
    const r = overlapChecks(
      input([m("lp", 3000, 3000), m("lu", 3300, 3000), m("x", 3000, 200)], [{ id: "pc-1", kind: "desk", x: 2800, y: 2800, w: 900, h: 900 }]),
    );
    const all = [...r.linesById.values()].flat().map((l) => l.text).join(" ");
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toMatch(/apart|spacing|path|reach|All clear|\b(mm|cm|m)\b/);
  });
});

describe("the drag's check", () => {
  it("marks the dragged machine and the one it overlaps", () => {
    const r = pairChecks(input([m("lp", 3000, 3000), m("lu", 3500, 3000), m("z", 9000, 3000)]), "lp");
    expect([...r.warnIds].sort()).toEqual(["lp", "lu"]);
  });

  it("touches only the pairs with the dragged machine", () => {
    const spy = vi.mocked(geometry.satDepth);
    const placed = Array.from({ length: 10 }, (_, i) => m(`m${i}`, 1000 + i * 1500, 3000));
    spy.mockClear();
    pairChecks(input(placed), "m0");
    // n − 1 machines, no places, and the walls go through wallDepth.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(placed.length - 1);
  });
});
