import { describe, expect, it } from "vitest";
import { footprint } from "./geometry";
import type { RoomBox, RoomPlace } from "./layout";
import { ftMm, roomShape } from "./room";
import { handlesFor, pickAt, pickRoomItem, roomIsTappable, type TapTarget } from "./tap";

const target = (id: string, x: number, y: number, size = { lengthMm: 1128, widthMm: 1008 }): TapTarget => ({
  id,
  footprint: footprint({ x, y, rotationDeg: 0 }, size),
  centre: { x, y },
});

describe("a tap on the map", () => {
  it("goes to the footprint that holds it, else the nearest within the slop", () => {
    const placed = [target("a", 1000, 1000), target("b", 3000, 1000)];
    expect(pickAt({ x: 1000, y: 1000 }, placed, 500)).toBe("a");
    expect(pickAt({ x: 1700, y: 1000 }, placed, 500)).toBe("a");
    expect(pickAt({ x: 2000, y: 3000 }, placed, 500)).toBeNull();
  });

  it("two touching 1,008 mm frames at 26.5 mm a pixel are tappable, and a tap inside each picks it", () => {
    const placed = [target("a", 504, 1000), target("b", 1512, 1000)];
    expect(roomIsTappable(26.5, placed)).toBe(true);
    expect(pickAt({ x: 990, y: 1000 }, placed, 22 * 26.5)).toBe("a");
    expect(pickAt({ x: 1020, y: 1000 }, placed, 22 * 26.5)).toBe("b");
  });

  it("is refused only when a machine's short side is under 24 px", () => {
    expect(roomIsTappable(1008 / 23, [target("a", 1000, 1000)])).toBe(false);
    expect(roomIsTappable(1008 / 24, [target("a", 1000, 1000)])).toBe(true);
    expect(roomIsTappable(0, [])).toBe(false);
  });

  it("never picks a place in the read doors: a tap on the AED is a tap on the floor", () => {
    // The read doors pass machines only; the AED isn't among the targets.
    expect(pickAt({ x: 5000, y: 5000 }, [target("a", 1000, 1000)], 500)).toBeNull();
  });
});

describe("the room tool's pick", () => {
  const big: RoomBox = { id: "bx-1", x: 0, y: 0, w: ftMm(60), h: ftMm(30) };
  const small: RoomBox = { id: "bx-2", x: ftMm(50), y: 0, w: ftMm(20), h: ftMm(10) };
  const shape = roomShape([big, small]);
  const bathroom: RoomPlace = { id: "pc-1", kind: "bathroom", x: ftMm(5), y: ftMm(5), w: ftMm(8), h: ftMm(8) };
  const pillar: RoomPlace = { id: "pc-2", kind: "pillar", x: ftMm(8), y: ftMm(8), w: ftMm(1), h: ftMm(1) };
  const mmPerPx = 20;

  it("a handle just outside the selected box's edge wins; a press inside its edge moves the box", () => {
    const handles = handlesFor(small, mmPerPx);
    const sel = { id: small.id, rect: small, handles };
    const right = handles.find((h) => h.edge === "right")!;
    expect(pickRoomItem(right.at, shape, [], 22 * mmPerPx, sel)).toEqual({ id: "bx-2", edge: "right" });
    const inside = { x: small.x + small.w - 5 * mmPerPx, y: right.at.y };
    expect(pickRoomItem(inside, shape, [], 22 * mmPerPx, sel)).toEqual({ id: "bx-2", edge: null });
    expect(handles.map((h) => h.edge)).toEqual(["top", "right", "bottom", "left", "corner"]);
  });

  it("a selected 1 ft pillar at 12.7 px a foot gets no handles, and a press on it moves it", () => {
    const perPx = 304.8 / 12.7;
    expect(handlesFor(pillar, perPx)).toEqual([]);
    expect(pickRoomItem({ x: ftMm(8.5), y: ftMm(8.5) }, shape, [bathroom, pillar], 22 * perPx, { id: pillar.id, rect: pillar, handles: [] })).toEqual({
      id: "pc-2",
      edge: null,
    });
  });

  it("a pillar inside a bathroom picks the pillar; a point in two overlapping boxes picks the smaller", () => {
    expect(pickRoomItem({ x: ftMm(8.5), y: ftMm(8.5) }, shape, [bathroom, pillar], 10)).toEqual({ id: "pc-2", edge: null });
    expect(pickRoomItem({ x: ftMm(55), y: ftMm(5) }, shape, [], 10)).toEqual({ id: "bx-2", edge: null });
    expect(pickRoomItem({ x: ftMm(100), y: ftMm(100) }, shape, [], 10)).toBeNull();
  });

  it("a door's handles are its two ends; the AED has none", () => {
    const door: RoomPlace = { id: "pc-3", kind: "door", x: -76, y: ftMm(10), w: 152, h: ftMm(3) };
    expect(handlesFor(door, 10).map((h) => h.edge)).toEqual(["top", "bottom"]);
    const aed: RoomPlace = { id: "pc-4", kind: "aed", x: 0, y: 0, w: 305, h: 305 };
    expect(handlesFor(aed, 1)).toEqual([]);
  });
});
