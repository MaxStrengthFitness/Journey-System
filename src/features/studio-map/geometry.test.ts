import { describe, expect, it } from "vitest";
import {
  backToWall,
  bbox,
  boxPoly,
  footprint,
  OVERLAP_TOL_MM,
  overlaps,
  polyGap,
  rotateDeg,
  SAFETY_TOL_MM,
  satDepth,
  wallDepth,
} from "./geometry";
import type { RoomBox } from "./layout";
import { roomShape } from "./room";

const FT = 304.8;
const ft = (n: number) => Math.round(n * FT);
const box = (id: string, x: number, y: number, w: number, h: number): RoomBox => ({ id, x: ft(x), y: ft(y), w: ft(x + w) - ft(x), h: ft(y + h) - ft(y) });
const sq = (x: number, y: number, s: number) => boxPoly({ x, y, w: s, h: s });

describe("shapes", () => {
  it("a footprint's corner 0 to 1 is its back, at the top at 0°", () => {
    const fp = footprint({ x: 1000, y: 1000, rotationDeg: 0 }, { lengthMm: 2000, widthMm: 1000 });
    expect(fp[0]).toEqual({ x: 500, y: 0 });
    expect(fp[1]).toEqual({ x: 1500, y: 0 });
    const b = bbox(fp);
    expect([b.x0, b.y0, b.x1, b.y1]).toEqual([500, 0, 1500, 2000]);
  });

  it("a footprint turned 90° lies across", () => {
    const b = bbox(footprint({ x: 1000, y: 1000, rotationDeg: 90 }, { lengthMm: 2000, widthMm: 1000 }));
    expect(Math.round(b.x1 - b.x0)).toBe(2000);
    expect(Math.round(b.y1 - b.y0)).toBe(1000);
  });

  it("boxPoly runs clockwise from the top-left", () => {
    expect(boxPoly({ x: 1, y: 2, w: 3, h: 4 })).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ]);
  });

  it("turns as whole degrees 0 to 359", () => {
    expect(rotateDeg(350, 15)).toBe(5);
    expect(rotateDeg(0, -90)).toBe(270);
    expect(rotateDeg(359.6)).toBe(0);
  });
});

describe("overlaps, roughly", () => {
  it("the SAT depth of two 1 m squares overlapping by 120 mm is 120", () => {
    expect(satDepth(sq(0, 0, 1000), sq(880, 0, 1000))).toBeCloseTo(120, 6);
    expect(satDepth(sq(0, 0, 1000), sq(1000, 0, 1000))).toBe(0);
    expect(satDepth(sq(0, 0, 1000), sq(1200, 0, 1000))).toBe(0);
  });

  it("marks only what a person can see: 6 in is sitting tight, 153 mm overlaps", () => {
    expect(OVERLAP_TOL_MM).toBe(152.4);
    expect(overlaps(sq(0, 0, 1000), sq(1000 - 152, 0, 1000))).toBe(false);
    expect(overlaps(sq(0, 0, 1000), sq(1000 - 153, 0, 1000))).toBe(true);
  });

  it("the three safety facts are said past 1 in", () => {
    expect(SAFETY_TOL_MM).toBe(25.4);
    expect(overlaps(sq(0, 0, 1000), sq(1000 - 25, 0, 300), SAFETY_TOL_MM)).toBe(false);
    expect(overlaps(sq(0, 0, 1000), sq(1000 - 26, 0, 300), SAFETY_TOL_MM)).toBe(true);
  });

  it("the gap between two shapes apart, and 0 when they touch", () => {
    expect(polyGap(sq(0, 0, 1000), sq(1300, 0, 1000))).toBeCloseTo(300, 6);
    expect(polyGap(sq(0, 0, 1000), sq(1000, 0, 1000))).toBe(0);
  });
});

describe("into the wall, for a room of boxes", () => {
  const one = roomShape([box("bx-1", 0, 0, 30, 20)]);
  const size = { lengthMm: 1000, widthMm: 1000 };

  it("is 0 for a machine standing clear, or flush on the wall", () => {
    expect(wallDepth(footprint({ x: 3000, y: 3000, rotationDeg: 0 }, size), one)).toBe(0);
    expect(wallDepth(footprint({ x: 3000, y: 500, rotationDeg: 0 }, size), one)).toBe(0);
  });

  it("is how far a machine pokes through the wall", () => {
    expect(wallDepth(footprint({ x: 3000, y: 300, rotationDeg: 0 }, size), one)).toBeCloseTo(200, 6);
  });

  it("finds a notch running under a machine whose four corners are all on the floor", () => {
    // Boxes 0-14 × 0-30 ft, 16-30 × 0-30 ft and 0-30 × 20-30 ft: a 2 ft notch
    // from the top down to 20 ft between x 14 and 16 ft.
    const notch = roomShape([box("bx-1", 0, 0, 14, 30), box("bx-2", 16, 0, 14, 30), box("bx-3", 0, 20, 30, 10)]);
    // A machine spanning x 10-20 ft at y 9-11 ft.
    const fp = boxPoly({ x: ft(10), y: ft(9), w: ft(10), h: ft(2) });
    expect(wallDepth(fp, notch)).toBeGreaterThan(0);
  });

  it("finds an L's inner corner inside a machine straddling it", () => {
    const L = roomShape([box("bx-1", 0, 0, 20, 10), box("bx-2", 0, 10, 10, 10)]);
    // The inner corner at (10, 10) ft pokes into a machine spanning x 8-12, y 8-11 ft.
    const fp = boxPoly({ x: ft(8), y: ft(8), w: ft(4), h: ft(3) });
    expect(wallDepth(fp, L)).toBeGreaterThan(0);
  });

  it("is 0 for a turned square that only nearly touches the wall", () => {
    // A 45° square whose nearest corner sits 50 mm off the top wall.
    const half = 500 * Math.SQRT2;
    const fp = footprint({ x: 3000, y: half + 50, rotationDeg: 45 }, size);
    expect(wallDepth(fp, one)).toBe(0);
  });
});

describe("back to the wall", () => {
  const room = roomShape([box("bx-1", 0, 0, 30, 20)]);
  const size = { lengthMm: 2000, widthMm: 1000 };

  it.each([
    [0, { x: 3000, y: 1000 }],
    [180, { x: 3000, y: ft(20) - 1000 }],
    [90, { x: ft(30) - 1000, y: 3000 }],
    [270, { x: 1000, y: 3000 }],
  ] as const)("lands flush at %i°", (deg, want) => {
    const q = backToWall({ x: 3000, y: 3000, rotationDeg: deg }, size, room);
    expect(Math.abs(q.x - want.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(q.y - want.y)).toBeLessThanOrEqual(1);
    expect(wallDepth(footprint({ ...q, rotationDeg: deg }, size), room)).toBeLessThanOrEqual(1);
  });

  it("at 15° slides back until a back corner meets the wall, and no further", () => {
    const q = backToWall({ x: 4000, y: 4000, rotationDeg: 15 }, size, room);
    const fp = footprint({ ...q, rotationDeg: 15 }, size);
    expect(wallDepth(fp, room)).toBeLessThanOrEqual(1);
    expect(Math.min(...fp.map((p) => p.y))).toBeLessThanOrEqual(1);
  });

  it("in an L lands on the nearer wall of the notch", () => {
    const L = roomShape([box("bx-1", 0, 0, 20, 10), box("bx-2", 0, 10, 10, 10)]);
    // In the bottom leg, facing up (back at the top): its back meets the
    // floor's top wall at 0 only if nothing is in the way; here, in the leg
    // under the notch's edge at x 10-20 ft, it is the notch's wall at 10 ft.
    const q = backToWall({ x: ft(5), y: ft(17), rotationDeg: 270 }, size, L);
    // Back to the left wall: x = half the length.
    expect(Math.abs(q.x - 1000)).toBeLessThanOrEqual(1);
    const r = backToWall({ x: ft(5), y: ft(17), rotationDeg: 90 }, size, L);
    // Back to the right: the leg's own wall at 10 ft, not the room's at 20 ft.
    expect(Math.abs(r.x - (ft(10) - 1000))).toBeLessThanOrEqual(1);
  });

  it("stays put when nothing is behind it", () => {
    const empty = roomShape([]);
    expect(backToWall({ x: 10, y: 20, rotationDeg: 0 }, size, empty)).toEqual({ x: 10, y: 20 });
  });
});
