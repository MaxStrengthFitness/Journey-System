import { describe, expect, it } from "vitest";
import type { RoomBox, RoomPlace } from "./layout";
import {
  addPlace,
  areaWords,
  firstBox,
  ftMm,
  inRoom,
  moveBox,
  newBoxBeside,
  nextBoxId,
  nextPlaceId,
  PLACE_KINDS,
  placeDefaults,
  placeName,
  resizeCorner,
  resizeEdge,
  resizePlaceEdge,
  resnapDoors,
  roomProblems,
  roomShape,
  snapDoor,
  typedBoxSize,
  typedPlaceSize,
} from "./room";
import { sqFtOf } from "./units";

const FT = 304.8;
const box = (id: string, x: number, y: number, w: number, h: number): RoomBox => ({ id, x: ftMm(x), y: ftMm(y), w: ftMm(x + w) - ftMm(x), h: ftMm(y + h) - ftMm(y) });
const feet = (b: RoomBox) => ({ x: Math.round(b.x / FT), y: Math.round(b.y / FT), w: Math.round(b.w / FT), h: Math.round(b.h / FT) });
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("the room's shape from its boxes", () => {
  it("one 60 × 30 ft box: 4 walls, 4 corners, 1,800 sq ft, 1 part", () => {
    const s = roomShape([box("bx-1", 0, 0, 60, 30)]);
    expect(s.walls).toHaveLength(4);
    expect(s.corners).toHaveLength(4);
    expect(sqFtOf(s.areaMm2)).toBe(1800);
    expect(s.parts).toBe(1);
  });

  it("an L from two boxes: 6 walls, its inner corner among the corners, the overlap counted once", () => {
    const s = roomShape([box("bx-1", 0, 0, 20, 10), box("bx-2", 0, 5, 10, 15)]);
    expect(s.walls).toHaveLength(6);
    expect(s.corners.some((c) => near(c.x, ftMm(10)) && near(c.y, ftMm(10)))).toBe(true);
    // 200 + 150 − 50 of overlap.
    expect(sqFtOf(s.areaMm2)).toBe(300);
  });

  it("counts two boxes overlapping by 5 ft once", () => {
    const s = roomShape([box("bx-1", 0, 0, 20, 10), box("bx-2", 15, 0, 20, 10)]);
    expect(sqFtOf(s.areaMm2)).toBe(350);
    expect(s.walls).toHaveLength(4);
  });

  it("four boxes round a hole: the hole's walls face into the floor, and the hole isn't floor", () => {
    const s = roomShape([box("bx-1", 0, 0, 30, 10), box("bx-2", 0, 20, 30, 10), box("bx-3", 0, 10, 10, 10), box("bx-4", 20, 10, 10, 10)]);
    expect(s.parts).toBe(1);
    expect(inRoom({ x: ftMm(15), y: ftMm(15) }, s)).toBe(false);
    expect(inRoom({ x: ftMm(5), y: ftMm(15) }, s)).toBe(true);
    const hole = s.walls.filter((w) => {
      const v = w.a.x === w.b.x;
      return v ? (near(w.a.x, ftMm(10)) || near(w.a.x, ftMm(20))) && Math.min(w.a.y, w.b.y) >= ftMm(10) - 1 && Math.max(w.a.y, w.b.y) <= ftMm(20) + 1 : false;
    });
    expect(hole).toHaveLength(2);
    const left = hole.find((w) => near(w.a.x, ftMm(10)))!;
    const right = hole.find((w) => near(w.a.x, ftMm(20)))!;
    // The floor is on the left of the hole's left wall, and on the right of its right wall.
    expect(left.inward).toBe("left");
    expect(right.inward).toBe("right");
    const top = s.walls.find((w) => w.a.y === w.b.y && near(w.a.y, ftMm(10)) && Math.min(w.a.x, w.b.x) >= ftMm(10) - 1)!;
    expect(top.inward).toBe("up");
  });

  it("two boxes apart are two parts, and the room tool says so once", () => {
    const boxes = [box("bx-1", 0, 0, 10, 10), box("bx-2", 20, 0, 10, 10)];
    const s = roomShape(boxes);
    expect(s.parts).toBe(2);
    expect(roomProblems(boxes, s)).toEqual(["Part of the room doesn't touch the rest. Drag a box onto another."]);
    expect(roomProblems([boxes[0]], roomShape([boxes[0]]))).toEqual([]);
  });
});

describe("the box tool", () => {
  it("starts from the square footage, exactly where whole feet allow", () => {
    expect(feet(firstBox(1800))).toEqual({ x: 0, y: 0, w: 60, h: 30 });
    expect(feet(firstBox(1000))).toEqual({ x: 0, y: 0, w: 40, h: 25 });
    const prime = firstBox(1009);
    expect(feet(prime)).toEqual({ x: 0, y: 0, w: 45, h: 22 });
    expect(firstBox(1800).id).toBe("bx-1");
  });

  it("moves a box on whole feet: dragged 1 ft 4 in, it lands 1 ft over", () => {
    const b = box("bx-1", 10, 10, 20, 10);
    const m = moveBox(b, Math.round(16 * 25.4), 0);
    expect(feet(m)).toEqual({ x: 11, y: 10, w: 20, h: 10 });
    expect(feet(moveBox(b, -ftMm(50), 0)).x).toBe(0);
    expect(feet(moveBox(b, ftMm(500), 0)).x).toBe(180);
  });

  it("resizes an edge to a whole foot, never under 2 ft and never past 200 ft", () => {
    const b = box("bx-1", 10, 10, 20, 10);
    expect(feet(resizeEdge(b, "right", ftMm(35.4)))).toEqual({ x: 10, y: 10, w: 25, h: 10 });
    // Dragged to 1 ft 7 in from the opposite edge: it stops at 2 ft.
    expect(feet(resizeEdge(b, "right", ftMm(10) + Math.round(19 * 25.4))).w).toBe(2);
    expect(feet(resizeEdge(b, "left", ftMm(-30)))).toEqual({ x: 0, y: 10, w: 30, h: 10 });
    expect(feet(resizeEdge(b, "bottom", ftMm(400))).h).toBe(190);
    expect(feet(resizeEdge(b, "top", ftMm(19.6))).h).toBe(2);
  });

  it("the corner handle grows a box both ways", () => {
    const b = box("bx-1", 0, 0, 20, 10);
    expect(feet(resizeCorner(b, { x: ftMm(25), y: ftMm(14) }))).toEqual({ x: 0, y: 0, w: 25, h: 14 });
  });

  it("takes Width × Length typed, top-left kept", () => {
    expect(feet(typedBoxSize(box("bx-2", 5, 5, 10, 10), ftMm(12.4), ftMm(1)))).toEqual({ x: 5, y: 5, w: 12, h: 2 });
  });

  it("adds a 10 × 10 ft box beside the selected one, touching it", () => {
    const sel = box("bx-1", 0, 0, 60, 30);
    const added = newBoxBeside(sel, roomShape([sel]));
    expect(feet(added)).toEqual({ x: 60, y: 0, w: 10, h: 10 });
    expect(added.id).toBe("bx-2");
    expect(roomShape([sel, added]).parts).toBe(1);
  });

  it("never reuses a live id", () => {
    expect(nextBoxId([box("bx-1", 0, 0, 2, 2), box("bx-7", 0, 0, 2, 2)])).toBe("bx-8");
    expect(nextPlaceId([{ id: "pc-z", kind: "desk", x: 0, y: 0, w: 400, h: 400 }])).toBe("pc-10");
  });
});

describe("places", () => {
  const room = roomShape([box("bx-1", 0, 0, 60, 30)]);

  it("come in AJ's order, the two safety markers last and together", () => {
    expect(PLACE_KINDS).toEqual(["pillar", "door", "desk", "bathroom", "changing", "lockers", "office", "extinguisher", "aed"]);
  });

  it("take their kind's word until a leader names them", () => {
    expect(placeName({ kind: "changing" })).toBe("Changing room");
    expect(placeName({ kind: "changing", label: "Men's changing room" })).toBe("Men's changing room");
    expect(placeName({ kind: "aed", label: "  " })).toBe("AED");
  });

  it("a door lands on the nearest wall, centred on its line; on a vertical wall 152 mm across and 3 ft tall", () => {
    const d = addPlace("door", { x: 400, y: ftMm(15) }, room, []);
    expect(d.w).toBe(152);
    expect(d.h).toBe(ftMm(3));
    expect(d.x + d.w / 2).toBe(0);
    expect(Math.abs(d.y + d.h / 2 - ftMm(15))).toBeLessThanOrEqual(1);
    const top = addPlace("door", { x: ftMm(30), y: 200 }, room, [d]);
    expect(top.h).toBe(152);
    expect(top.y + top.h / 2).toBe(0);
    expect(top.id).not.toBe(d.id);
  });

  it("on a two-box L, a door lands on the nearest wall run", () => {
    const L = roomShape([box("bx-1", 0, 0, 20, 10), box("bx-2", 0, 10, 10, 10)]);
    // Near the notch's horizontal wall at y 10 ft, x 15 ft.
    const d = addPlace("door", { x: ftMm(15), y: ftMm(10) + 300 }, L, []);
    expect(d.y + d.h / 2).toBe(ftMm(10));
    expect(d.x).toBeGreaterThanOrEqual(ftMm(10));
  });

  it("a door wider than its wall run is clamped to the run", () => {
    const small = roomShape([box("bx-1", 0, 0, 4, 10)]);
    const d = snapDoor({ id: "pc-1", kind: "door", x: ftMm(2) - ftMm(5), y: -76, w: ftMm(10), h: 152 }, small);
    expect(Math.max(d.w, d.h)).toBe(ftMm(4));
  });

  it("follow their wall after a box shrinks", () => {
    const big = box("bx-1", 0, 0, 60, 30);
    const door: RoomPlace = snapDoor({ id: "pc-1", kind: "door", x: ftMm(59), y: ftMm(10), w: 152, h: ftMm(3) }, roomShape([big]));
    expect(door.x + door.w / 2).toBe(ftMm(60));
    const shrunk = resizeEdge(big, "right", ftMm(50));
    const [moved] = resnapDoors([door], roomShape([shrunk]));
    expect(moved.x + moved.w / 2).toBe(ftMm(50));
  });

  it("resize on 6 in steps within their kind's range; a door only along its wall; the safety markers never", () => {
    const desk = addPlace("desk", { x: ftMm(10), y: ftMm(10) }, room, []);
    const wider = resizePlaceEdge(desk, "right", desk.x + desk.w + 200, room);
    expect(wider.w - desk.w).toBeCloseTo(152, -1);
    const aed = addPlace("aed", { x: ftMm(10), y: ftMm(10) }, room, []);
    expect(resizePlaceEdge(aed, "right", aed.x + 2000, room)).toBe(aed);
    expect(typedPlaceSize(aed, 2000, 2000, room)).toBe(aed);
    const door = addPlace("door", { x: 100, y: ftMm(15) }, room, []);
    expect(resizePlaceEdge(door, "right", 2000, room)).toBe(door);
    const taller = resizePlaceEdge(door, "bottom", door.y + door.h + ftMm(1), room);
    expect(taller.h).toBeGreaterThan(door.h);
    expect(placeDefaults("aed")).toEqual({ w: 305, h: 305 });
  });
});

describe("the square-footage line", () => {
  const one = roomShape([box("bx-1", 0, 0, 60, 30)]);
  const none = { sized: 0, unsized: 0, mm2: 0, planned: 0 };

  it("says what is drawn, against the number typed when they are more than 2% apart", () => {
    expect(areaWords(roomShape([box("bx-1", 0, 0, 40, 40)]), 1800, none)).toBe("Drawn: 1,600 of 1,800 sq ft");
    expect(areaWords(one, 1800, none)).toBe("Drawn: 1,800 sq ft");
    expect(areaWords(one, 1790, none)).toBe("Drawn: 1,800 sq ft");
    expect(areaWords(one, undefined, none)).toBe("Drawn: 1,800 sq ft");
  });

  it("says what the machines take, about, and never counts a guess", () => {
    const sqft = (n: number) => n * 92_903.04;
    expect(areaWords(one, 1800, { sized: 20, unsized: 0, mm2: sqft(372), planned: 0 })).toBe("Drawn: 1,800 sq ft · Machines: about 370 sq ft");
    expect(areaWords(one, 1800, { sized: 18, unsized: 2, mm2: sqft(341), planned: 0 })).toBe(
      "Drawn: 1,800 sq ft · Machines: about 340 sq ft (2 without a size)",
    );
    expect(areaWords(one, 1800, { sized: 22, unsized: 0, mm2: sqft(410), planned: sqft(40) })).toBe(
      "Drawn: 1,800 sq ft · Machines: about 410 sq ft, 40 of it still to buy",
    );
    expect(areaWords(one, 1800, { sized: 0, unsized: 5, mm2: 0, planned: 0 })).toBe("Drawn: 1,800 sq ft");
  });

  it("never says a metric unit", () => {
    const line = areaWords(one, 1000, { sized: 3, unsized: 1, mm2: 3_000_000, planned: 0 });
    expect(line).not.toMatch(/\b(mm|cm|m|m²|sq m)\b/);
  });
});
