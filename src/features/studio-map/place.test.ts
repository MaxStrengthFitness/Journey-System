import { describe, expect, it } from "vitest";
import type { KnownSize } from "../../types/machines";
import { overlapChecks } from "./checks";
import { bbox, footprint, polyGap, wallDepth } from "./geometry";
import { IMAGINE_STRENGTH_MODELS } from "./imagine-strength";
import type { RoomBox, RoomPlace } from "./layout";
import { AUTO_GAP_MM, freeSpot, magnet, middleOf, placeAll, wallRuns } from "./place";
import { ftMm, inRoom, roomShape, snapDoor } from "./room";

const sizeOfModel = (i: number): KnownSize => {
  const m = IMAGINE_STRENGTH_MODELS[i];
  return { lengthMm: m.lengthMm, widthMm: m.widthMm, heightMm: m.heightMm };
};
const one: RoomBox = { id: "bx-1", x: 0, y: 0, w: ftMm(60), h: ftMm(30) };
const shape = roomShape([one]);
/** A 3 ft door on the left wall, 22 to 25 ft from the top. */
const door: RoomPlace = snapDoor({ id: "pc-1", kind: "door", x: -76, y: ftMm(22), w: 152, h: ftMm(3) }, shape);
const SIZE: KnownSize = { lengthMm: 1500, widthMm: 1200, heightMm: null };

describe("a spot for one machine", () => {
  it("is against a wall, inside the room, clear of the rest by 1 ft", () => {
    const first = freeSpot({ shape, places: [door], placed: [], markers: [], size: SIZE }, "m-a")!;
    const fp = footprint(first, SIZE);
    expect(wallDepth(fp, shape)).toBeLessThanOrEqual(1);
    const b = bbox(fp);
    expect(Math.min(b.x0, b.y0, shape.bbox.x1 - b.x1, shape.bbox.y1 - b.y1)).toBeLessThanOrEqual(1);
    const second = freeSpot({ shape, places: [door], placed: [{ footprint: fp }], markers: [], size: SIZE }, "m-b")!;
    expect(polyGap(footprint(second, SIZE), fp)).toBeGreaterThanOrEqual(AUTO_GAP_MM - 1);
  });

  it("never lands in an L's notch, nor in a doorway", () => {
    const L = roomShape([
      { id: "bx-1", x: 0, y: 0, w: ftMm(20), h: ftMm(10) },
      { id: "bx-2", x: 0, y: ftMm(10), w: ftMm(10), h: ftMm(10) },
    ]);
    const placed: { footprint: ReturnType<typeof footprint> }[] = [];
    for (let i = 0; i < 6; i++) {
      const p = freeSpot({ shape: L, places: [], placed, markers: [], size: SIZE }, `m-${i}`);
      if (!p) break;
      const fp = footprint(p, SIZE);
      expect(fp.every((c) => inRoom(c, L))).toBe(true);
      expect(wallDepth(fp, L)).toBeLessThanOrEqual(1);
      placed.push({ footprint: fp });
    }
    // In front of the door: its swing square (x 0-3 ft, y 22-25 ft) is never chosen.
    const small = roomShape([{ id: "bx-1", x: 0, y: ftMm(20), w: ftMm(6), h: ftMm(6) }]);
    const d = snapDoor({ id: "pc-1", kind: "door", x: -76, y: ftMm(21), w: 152, h: ftMm(3) }, small);
    const p = freeSpot({ shape: small, places: [d], placed: [], markers: [], size: { lengthMm: 600, widthMm: 600, heightMm: null } }, "m-x");
    if (p) {
      const b = bbox(footprint(p, { lengthMm: 600, widthMm: 600 }));
      const inSwing = b.x0 < ftMm(3) && b.y1 > ftMm(21) && b.y0 < ftMm(24);
      expect(inSwing).toBe(false);
    }
  });

  it("is null when the room is full", () => {
    const tiny = roomShape([{ id: "bx-1", x: 0, y: 0, w: ftMm(4), h: ftMm(4) }]);
    expect(freeSpot({ shape: tiny, places: [], placed: [], markers: [], size: SIZE })).toBeNull();
  });

  it("the middle of an L is on its floor: the centre of its largest box", () => {
    const L = roomShape([
      { id: "bx-1", x: 0, y: 0, w: ftMm(30), h: ftMm(10) },
      { id: "bx-2", x: 0, y: ftMm(10), w: ftMm(10), h: ftMm(30) },
    ]);
    const mid = middleOf(L, "m-a");
    expect(inRoom(mid, L)).toBe(true);
  });
});

describe("Place them all", () => {
  const twenty = IMAGINE_STRENGTH_MODELS.map((m, i) => ({ id: m.movementId, size: sizeOfModel(i) }));

  it("lines the twenty up along the walls from beside the door, clockwise, with nothing overlapping, quickly", () => {
    const t0 = performance.now();
    const { placed, noRoom } = placeAll({ shape, places: [door], placed: [], markers: [] }, twenty);
    const ms = performance.now() - t0;
    expect(noRoom).toEqual([]);
    expect(placed.map((p) => (p as { machineId: string }).machineId)).toEqual(twenty.map((m) => m.id));
    const checks = overlapChecks({
      shape,
      places: [door],
      placed: placed.map((p, i) => ({ id: twenty[i].id, name: twenty[i].id, placement: p, size: twenty[i].size, planned: false })),
    });
    expect([...checks.linesById.values()].flat()).toEqual([]);
    for (const [i, p] of placed.entries()) {
      const b = bbox(footprint(p, twenty[i].size));
      const toWall = Math.min(b.x0, b.y0, shape.bbox.x1 - b.x1, shape.bbox.y1 - b.y1);
      expect(toWall, twenty[i].id).toBeLessThanOrEqual(152.4);
    }
    // Clockwise from the door on the left wall: the first goes up the left wall, above the door.
    const first = placed[0];
    expect(first.x).toBeLessThan(ftMm(5));
    expect(first.y).toBeLessThan(ftMm(22));
    expect(ms).toBeLessThan(50);
  });

  it("walks the walls clockwise from the door", () => {
    const runs = wallRuns(shape, [door]);
    // Up the left wall from the door's top end, then the top, the right, the bottom, and the left again up to the door.
    expect(runs.map((r) => r.inward)).toEqual(["right", "down", "left", "up", "right"]);
    expect(runs[0].start.y).toBeCloseTo(ftMm(22), -1);
  });

  it("puts the ones that don't fit by freeSpot, and names the rest", () => {
    const small = roomShape([{ id: "bx-1", x: 0, y: 0, w: ftMm(12), h: ftMm(10) }]);
    const { placed, noRoom } = placeAll({ shape: small, places: [], placed: [], markers: [] }, twenty);
    expect(placed.length).toBeGreaterThan(0);
    expect(noRoom.length).toBeGreaterThan(0);
    expect(placed.length + noRoom.length).toBe(20);
  });
});

describe("the soft magnet", () => {
  const neighbour = { id: "m-b", placement: { machineId: "m-b", x: 6500, y: 5000, rotationDeg: 0 }, size: { lengthMm: 1000, widthMm: 1000 } };
  it("slides flush within 6 in, either side, and leaves 8 in alone", () => {
    const size = { lengthMm: 1000, widthMm: 1000 };
    expect(magnet({ machineId: "m-a", x: 5373, y: 5000, rotationDeg: 0 }, size, [neighbour], shape).x).toBe(5500);
    expect(magnet({ machineId: "m-a", x: 5602, y: 5000, rotationDeg: 0 }, size, [neighbour], shape).x).toBe(5500);
    expect(magnet({ machineId: "m-a", x: 5297, y: 5000, rotationDeg: 0 }, size, [neighbour], shape).x).toBe(5297);
  });

  it("pulls a machine onto the wall", () => {
    const q = magnet({ machineId: "m-a", x: 3000, y: 600, rotationDeg: 0 }, { lengthMm: 1000, widthMm: 1000 }, [], shape);
    expect(q).toEqual({ x: 3000, y: 500 });
  });
});
