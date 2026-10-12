/**
 * THE ROOM (the studio map, Oct 2026): boxes and places.
 *
 * AJ, Oct 11 2026: "you just need to put how many square feet it is. And
 * then from there, you should just have like a modular box tool where you
 * just kind of like, hey, build a like this is how big it is. And you just
 * place like squares and then you can resize the squares. And then it tells
 * you like how much square footage you've used."
 *
 * So the room is one to twelve axis-aligned boxes on whole feet, and the
 * floor is their union: "here's where the walls get narrow, here's where
 * the room gets a little bit bigger" is two or three boxes, never a polygon
 * a person has to close. The walls are worked out from the boxes every
 * time (`roomShape`); a leader never draws one.
 *
 * And the places in it ("a pillar here. Or a door here, or a desk here. Or
 * a bathroom here. Changing room. Lockers. Fire extinguisher. AED.
 * Office."): areas are labelled boxes, a pillar and the two safety markers
 * are small markers, and a door always sits on a wall.
 *
 * Nothing here refuses a shape or says a room is too big or too small: the
 * caps are layout.ts's `planProblems`, which the editor never reaches.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { segDist, type Box } from "./geometry";
import {
  PLACE_KINDS,
  PLACE_WORDS,
  PLAN_LIMITS,
  formOf,
  isSafety,
  placeName,
  placeRange,
  resizable,
  type PlaceKind,
  type PlanPoint,
  type RoomBox,
  type RoomPlace,
} from "./layout";
import { BOX_SNAP_MM, SNAP_MM, sqFtOf, sqFtWords } from "./units";

export { PLACE_KINDS, PLACE_WORDS, formOf, isSafety, placeName, resizable };

/** A stretch of wall, axis-aligned; `inward` is the side the floor is on. */
export interface Segment {
  a: PlanPoint;
  b: PlanPoint;
  inward: "up" | "down" | "left" | "right";
}

export interface RoomShape {
  boxes: readonly RoomBox[];
  /** The union's edge, merged into maximal straight runs. */
  walls: Segment[];
  /** Every wall's endpoints, de-duplicated (every inner corner of an L among them). */
  corners: PlanPoint[];
  /** Of the boxes. */
  bbox: Box;
  /** The union's area: boxes that overlap count once. */
  areaMm2: number;
  /** Connected pieces of floor (1 for a sensible room). */
  parts: number;
}

const FT = BOX_SNAP_MM;
const MAX_FT = Math.round(PLAN_LIMITS.coordMax / FT); // 200

/** A whole number of feet as whole millimetres. Every box edge is one of these, so boxes dragged together touch exactly. */
export const ftMm = (ft: number): number => Math.round(ft * FT);
/** The nearest whole foot. */
export const snapFt = (mm: number): number => Math.round(mm / FT);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The room's shape from its boxes. The boxes' edges cut their bounding box
 * into at most 23 × 23 cells (for twelve boxes); a cell is floor when its
 * centre is in any box. A wall is a cell edge with floor on one side only,
 * and runs of them on one line merge. A notch, an L, a T, even a courtyard
 * come out right with no polygon tracing. Cheap, and memoised by the host:
 * it runs once per room change, never during a machine's drag.
 */
export function roomShape(boxes: readonly RoomBox[]): RoomShape {
  if (boxes.length === 0) {
    return { boxes, walls: [], corners: [], bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, areaMm2: 0, parts: 0 };
  }
  const xs = [...new Set(boxes.flatMap((b) => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  const ys = [...new Set(boxes.flatMap((b) => [b.y, b.y + b.h]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const floor: boolean[][] = [];
  let areaMm2 = 0;
  for (let i = 0; i < nx; i++) {
    floor.push([]);
    for (let j = 0; j < ny; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const on = boxes.some((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h);
      floor[i].push(on);
      if (on) areaMm2 += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  }
  const at = (i: number, j: number) => i >= 0 && i < nx && j >= 0 && j < ny && floor[i][j];

  const walls: Segment[] = [];
  // Vertical walls, on each x line, merged down the rows.
  for (let i = 0; i <= nx; i++) {
    let run: Segment | null = null;
    for (let j = 0; j < ny; j++) {
      const left = at(i - 1, j);
      const right = at(i, j);
      const inward = left !== right ? (left ? "left" : "right") : null;
      if (inward && run && run.inward === inward && run.b.y === ys[j]) {
        run.b = { x: xs[i], y: ys[j + 1] };
      } else {
        if (run) walls.push(run);
        run = inward ? { a: { x: xs[i], y: ys[j] }, b: { x: xs[i], y: ys[j + 1] }, inward } : null;
      }
    }
    if (run) walls.push(run);
  }
  // Horizontal walls, on each y line, merged along the columns.
  for (let j = 0; j <= ny; j++) {
    let run: Segment | null = null;
    for (let i = 0; i < nx; i++) {
      const above = at(i, j - 1);
      const below = at(i, j);
      const inward = above !== below ? (above ? "up" : "down") : null;
      if (inward && run && run.inward === inward && run.b.x === xs[i]) {
        run.b = { x: xs[i + 1], y: ys[j] };
      } else {
        if (run) walls.push(run);
        run = inward ? { a: { x: xs[i], y: ys[j] }, b: { x: xs[i + 1], y: ys[j] }, inward } : null;
      }
    }
    if (run) walls.push(run);
  }

  const seen = new Set<string>();
  const corners: PlanPoint[] = [];
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const k = `${p.x},${p.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        corners.push(p);
      }
    }
  }

  // Connected pieces of floor: a 4-neighbour flood.
  let parts = 0;
  const done = floor.map((col) => col.map(() => false));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!floor[i][j] || done[i][j]) continue;
      parts++;
      const stack: [number, number][] = [[i, j]];
      done[i][j] = true;
      while (stack.length) {
        const [ci, cj] = stack.pop()!;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const a = ci + di;
          const b = cj + dj;
          if (at(a, b) && !done[a][b]) {
            done[a][b] = true;
            stack.push([a, b]);
          }
        }
      }
    }
  }

  return { boxes, walls, corners, bbox: { x0: xs[0], y0: ys[0], x1: xs[nx], y1: ys[ny] }, areaMm2, parts };
}

/** On the floor: in any box (on an edge counts as in). */
export function inRoom(p: PlanPoint, shape: RoomShape): boolean {
  for (const b of shape.boxes) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * The box tool
 * ------------------------------------------------------------------ */

/** A box from whole feet. */
function boxFt(id: string, xFt: number, yFt: number, wFt: number, hFt: number): RoomBox {
  const x = ftMm(xFt);
  const y = ftMm(yFt);
  return { id, x, y, w: ftMm(xFt + wFt) - x, h: ftMm(yFt + hFt) - y };
}

/** A box's position and sides in whole feet. */
function feetOf(b: RoomBox): { x: number; y: number; w: number; h: number } {
  const x = snapFt(b.x);
  const y = snapFt(b.y);
  return { x, y, w: Math.max(2, snapFt(b.x + b.w) - x), h: Math.max(2, snapFt(b.y + b.h) - y) };
}

/**
 * The first box, from the square footage, on whole feet, landing exactly on
 * the typed area wherever whole feet allow: the whole-foot pair w × h = A,
 * at least 6 ft deep, at most 200 ft wide, w/h between 1 and 3, nearest
 * two feet across for one deep. With no exact pair (a prime), the nearest
 * round numbers. 1,800 sq ft is 60 × 30 ft; 1,000 is 40 × 25 ft.
 */
export function firstBox(areaSqFt: number): RoomBox {
  const A = Math.round(areaSqFt);
  const target = Math.round(Math.sqrt(2 * A));
  for (let d = 0; d <= MAX_FT; d++) {
    for (const w of d === 0 ? [target] : [target - d, target + d]) {
      if (w < 1 || w > MAX_FT || A % w !== 0) continue;
      const h = A / w;
      if (h >= 6 && h <= MAX_FT && w / h >= 1 && w / h <= 3) return boxFt("bx-1", 0, 0, w, h);
    }
  }
  const w = clamp(target, 6, MAX_FT);
  const h = clamp(Math.round(A / w), 6, MAX_FT);
  return boxFt("bx-1", 0, 0, w, h);
}

/** A box moved: its position on whole feet, inside 0–200 ft. Its sides keep their feet. */
export function moveBox(b: RoomBox, dxMm: number, dyMm: number): RoomBox {
  const f = feetOf(b);
  const x = clamp(snapFt(b.x + dxMm), 0, MAX_FT - f.w);
  const y = clamp(snapFt(b.y + dyMm), 0, MAX_FT - f.h);
  return boxFt(b.id, x, y, f.w, f.h);
}

export type BoxEdge = "top" | "right" | "bottom" | "left";

/** One edge to the whole foot nearest `toMm`; the opposite edge stays; never under 2 ft, never past 0 or 200 ft. */
export function resizeEdge(b: RoomBox, edge: BoxEdge, toMm: number): RoomBox {
  const f = feetOf(b);
  const to = snapFt(toMm);
  switch (edge) {
    case "right": {
      const r = clamp(to, f.x + 2, MAX_FT);
      return boxFt(b.id, f.x, f.y, r - f.x, f.h);
    }
    case "left": {
      const right = f.x + f.w;
      const l = clamp(to, 0, right - 2);
      return boxFt(b.id, l, f.y, right - l, f.h);
    }
    case "bottom": {
      const bt = clamp(to, f.y + 2, MAX_FT);
      return boxFt(b.id, f.x, f.y, f.w, bt - f.y);
    }
    case "top": {
      const bottom = f.y + f.h;
      const t = clamp(to, 0, bottom - 2);
      return boxFt(b.id, f.x, t, f.w, bottom - t);
    }
  }
}

/** The bottom-right corner handle: the right and bottom edges together, so a box grows both ways in one drag. */
export function resizeCorner(b: RoomBox, to: PlanPoint): RoomBox {
  return resizeEdge(resizeEdge(b, "right", to.x), "bottom", to.y);
}

/** The selected box's Width × Length typed (the way that never needs a drag): top-left kept, whole feet. */
export function typedBoxSize(b: RoomBox, wMm: number, hMm: number): RoomBox {
  const f = feetOf(b);
  const w = clamp(snapFt(wMm), 2, MAX_FT - f.x);
  const h = clamp(snapFt(hMm), 2, MAX_FT - f.y);
  return boxFt(b.id, f.x, f.y, w, h);
}

/** "bx-<n>", never a live id. */
export function nextBoxId(boxes: readonly RoomBox[]): string {
  let n = 0;
  for (const b of boxes) {
    const m = /^bx-(\d+)$/.exec(b.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `bx-${n + 1}`;
}

/** "pc-<base36>", never a live id. */
export function nextPlaceId(places: readonly RoomPlace[]): string {
  let n = 0;
  for (const p of places) {
    const m = /^pc-([0-9a-z]+)$/.exec(p.id);
    if (m) n = Math.max(n, parseInt(m[1], 36) || 0);
  }
  return `pc-${(n + 1).toString(36)}`;
}

/**
 * Add a box: 10 × 10 ft on the right of the selected box (or the room's
 * right edge), its top aligned, touching it, kept inside 200 ft.
 */
export function newBoxBeside(selected: RoomBox | null, shape: RoomShape, id = nextBoxId(shape.boxes)): RoomBox {
  const size = 10;
  const top = selected ? snapFt(selected.y) : snapFt(shape.bbox.y0);
  const right = selected ? snapFt(selected.x + selected.w) : snapFt(shape.bbox.x1);
  const x = clamp(right, 0, MAX_FT - size);
  const y = clamp(top, 0, MAX_FT - size);
  return boxFt(id, x, y, size, size);
}

/* ------------------------------------------------------------------ *
 * Places
 * ------------------------------------------------------------------ */

const IN6 = SNAP_MM;
const snap6 = (mm: number) => Math.round(Math.round(mm / IN6) * IN6);

/** A new place's size: a door 3 ft along its wall; a pillar 1 × 1 ft; a desk 7 × 2½ ft; and so on. */
export function placeDefaults(kind: PlaceKind): { w: number; h: number } {
  switch (kind) {
    case "door":
      return { w: ftMm(3), h: PLAN_LIMITS.doorDepth };
    case "pillar":
      return { w: ftMm(1), h: ftMm(1) };
    case "desk":
      return { w: ftMm(7), h: Math.round(2.5 * FT) };
    case "bathroom":
      return { w: ftMm(8), h: ftMm(8) };
    case "changing":
      return { w: ftMm(10), h: ftMm(8) };
    case "lockers":
      return { w: ftMm(6), h: Math.round(1.5 * FT) };
    case "office":
      return { w: ftMm(10), h: ftMm(10) };
    case "extinguisher":
    case "aed":
      return { w: PLAN_LIMITS.markerMm, h: PLAN_LIMITS.markerMm };
  }
}

/** A door lies along a vertical wall when it is taller than wide. */
export const doorIsVertical = (d: Pick<RoomPlace, "w" | "h">): boolean => d.h > d.w;
/** A door's width along its wall. */
export const doorAlong = (d: Pick<RoomPlace, "w" | "h">): number => Math.max(d.w, d.h);

const centreOf = (p: { x: number; y: number; w: number; h: number }): PlanPoint => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

/**
 * A door onto the nearest wall run long enough for 2 ft: centred on the
 * wall line, its width along the wall clamped to that run (2–16 ft), 152 mm
 * across; its centre slid along the run to the nearest point that keeps it
 * whole. Unchanged in a room with no walls (impossible: one box always).
 */
export function snapDoor(door: RoomPlace, shape: RoomShape): RoomPlace {
  const c = centreOf(door);
  let best: Segment | null = null;
  let bestD = Infinity;
  for (const w of shape.walls) {
    const len = Math.abs(w.b.x - w.a.x) + Math.abs(w.b.y - w.a.y);
    if (len < PLAN_LIMITS.doorMin - 1) continue;
    const d = segDist(c, w.a, w.b);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  if (!best) return door;
  const vertical = best.a.x === best.b.x;
  const lo = vertical ? Math.min(best.a.y, best.b.y) : Math.min(best.a.x, best.b.x);
  const hi = vertical ? Math.max(best.a.y, best.b.y) : Math.max(best.a.x, best.b.x);
  const along = Math.round(clamp(doorAlong(door), PLAN_LIMITS.doorMin, Math.min(PLAN_LIMITS.doorMax, hi - lo)));
  const half = along / 2;
  const mid = clamp(vertical ? c.y : c.x, lo + half, hi - half);
  const depth = PLAN_LIMITS.doorDepth;
  const start = Math.round(mid - half);
  if (vertical) return { ...door, x: Math.round(best.a.x - depth / 2), y: start, w: depth, h: along };
  return { ...door, x: start, y: Math.round(best.a.y - depth / 2), w: along, h: depth };
}

/** Every door to its nearest wall, after any box change. */
export function resnapDoors(places: readonly RoomPlace[], shape: RoomShape): RoomPlace[] {
  return places.map((p) => (p.kind === "door" ? snapDoor(p, shape) : p));
}

type Rect = { x: number; y: number; w: number; h: number };

/** Two rectangles share some floor (touching edges don't count). */
const touches = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** A rectangle on the floor: its four corners and its centre in the room (rough, like the rest). */
const onFloor = (r: Rect, shape: RoomShape) =>
  [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
    centreOf(r),
  ].every((p) => inRoom(p, shape));
/** A place's top-left kept inside 0–200 ft, its far side included. */
const inside = <P extends Rect>(p: P): P => ({
  ...p,
  x: Math.round(clamp(p.x, 0, PLAN_LIMITS.coordMax - p.w)),
  y: Math.round(clamp(p.y, 0, PLAN_LIMITS.coordMax - p.h)),
});

const STEP = ftMm(2);
/**
 * The AED and the extinguisher are drawn at least 28 px whatever the scale,
 * larger than their true foot: anything new keeps 3 ft clear of one (and one
 * new keeps 3 ft clear of anything), so neither hides the other on the
 * drawing.
 */
const SAFETY_CLEAR = ftMm(3);
type Kinded = Rect & { kind: PlaceKind };
/** Clear of every other place, with the safety markers' room. */
const clearOf = (r: Rect, kind: PlaceKind, others: readonly Kinded[]) =>
  !others.some((o) => {
    const g = isSafety(kind) || isSafety(o.kind) ? SAFETY_CLEAR : 0;
    return touches({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g }, o);
  });

/**
 * The AED and the extinguisher hang on walls: just inside the wall nearest
 * `at`, then 2 ft along it either way, then the next wall, until the spot is
 * clear of every place already there (a doorway included). Null when no wall
 * has one.
 */
function onAWall(r: Rect, kind: PlaceKind, at: PlanPoint, shape: RoomShape, others: readonly Kinded[]): Rect | null {
  const walls = [...shape.walls].sort((p, q) => segDist(at, p.a, p.b) - segDist(at, q.a, q.b));
  for (const w of walls) {
    const vertical = w.a.x === w.b.x;
    const lo = vertical ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x);
    const hi = vertical ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
    const along = vertical ? r.h : r.w;
    if (hi - lo < along) continue;
    const want = clamp(vertical ? at.y : at.x, lo + along / 2, hi - along / 2);
    for (let k = 0; k <= Math.ceil((hi - lo) / STEP); k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const mid = want + sign * k * STEP;
        if (mid < lo + along / 2 || mid > hi - along / 2) continue;
        let x: number;
        let y: number;
        if (vertical) {
          x = w.inward === "right" ? w.a.x : w.a.x - r.w;
          y = mid - r.h / 2;
        } else {
          x = mid - r.w / 2;
          y = w.inward === "down" ? w.a.y : w.a.y - r.h;
        }
        const c = inside({ ...r, x: Math.round(x), y: Math.round(y) });
        if (onFloor(c, shape) && clearOf(c, kind, others)) return c;
      }
    }
  }
  return null;
}

/** Stepped 2 ft to the right, then a row down, until clear of every place and on the floor; null when nothing is. */
function steppedClear(r: Rect, kind: PlaceKind, shape: RoomShape, others: readonly Kinded[]): Rect | null {
  const { x0, y0, x1, y1 } = shape.bbox;
  // From where it was put to the room's far side, then from the near side back round to it.
  const steps = (from: number, lo: number, hi: number) => {
    const out: number[] = [];
    for (let v = from; v <= hi; v += STEP) out.push(v);
    for (let v = lo; v < from; v += STEP) out.push(v);
    return out;
  };
  const xs = steps(r.x, x0, x1 - r.w);
  const ys = steps(r.y, y0, y1 - r.h);
  for (const y of ys) {
    for (const x of xs) {
      const c = inside({ ...r, x: snap6(x), y: snap6(y) });
      if (onFloor(c, shape) && clearOf(c, kind, others)) return c;
    }
  }
  return null;
}

/**
 * A new place, its defaults centred on `at`, on a spot of its own: a door
 * snapped onto the nearest wall; the AED and the extinguisher just inside
 * the nearest wall where nothing else is; anything else stepped 2 ft to the
 * right, then down, until it touches no other place (3 ft clear where a
 * safety marker is either one). Never on top of another place, so the
 * safety markers and their words never hide each other (where the room has
 * no clear spot at all, it stays where it was put).
 */
export function addPlace(kind: PlaceKind, at: PlanPoint, shape: RoomShape, places: readonly RoomPlace[]): RoomPlace {
  const { w, h } = placeDefaults(kind);
  const id = nextPlaceId(places);
  if (kind === "door") {
    // Centred on `at` exactly; snapDoor puts it on the nearest wall.
    return snapDoor({ id, kind, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h }, shape);
  }
  const start = inside({ x: snap6(at.x - w / 2), y: snap6(at.y - h / 2), w, h });
  const spot = (isSafety(kind) ? onAWall(start, kind, at, shape, places) : null) ?? steppedClear(start, kind, shape, places) ?? start;
  return { id, kind, x: spot.x, y: spot.y, w, h };
}

/** A place moved on 6 in steps, kept inside 0–200 ft; a door slides along its wall. */
export function movePlace(p: RoomPlace, dxMm: number, dyMm: number, shape: RoomShape): RoomPlace {
  const moved = inside({ ...p, x: p.x + snap6(dxMm), y: p.y + snap6(dyMm) });
  return p.kind === "door" ? snapDoor(moved, shape) : moved;
}

/**
 * One edge of a place to `toMm`, on 6 in steps, within its kind's range. A
 * door changes only its width along its wall (its two ends); the AED and the
 * extinguisher are fixed at 1 ft.
 */
export function resizePlaceEdge(p: RoomPlace, edge: BoxEdge, toMm: number, shape: RoomShape): RoomPlace {
  if (!resizable(p.kind)) return p;
  const r = placeRange(p.kind);
  if (p.kind === "door") {
    const vertical = doorIsVertical(p);
    if (vertical && (edge === "left" || edge === "right")) return p;
    if (!vertical && (edge === "top" || edge === "bottom")) return p;
  }
  const to = snap6(toMm);
  let { x, y, w, h } = p;
  if (edge === "right") w = clamp(to - x, r.min, r.max);
  if (edge === "bottom") h = clamp(to - y, r.min, r.max);
  if (edge === "left") {
    const right = x + w;
    w = clamp(right - to, r.min, r.max);
    x = right - w;
  }
  if (edge === "top") {
    const bottom = y + h;
    h = clamp(bottom - to, r.min, r.max);
    y = bottom - h;
  }
  const out = inside({ ...p, x, y, w: Math.round(w), h: Math.round(h) });
  return p.kind === "door" ? snapDoor(out, shape) : out;
}

/** An area's or a pillar's size typed (top-left kept), in its range; a door's width along its wall. */
export function typedPlaceSize(p: RoomPlace, wMm: number, hMm: number, shape: RoomShape): RoomPlace {
  if (!resizable(p.kind)) return p;
  const r = placeRange(p.kind);
  if (p.kind === "door") {
    const along = clamp(Math.round(wMm), r.min, r.max);
    const vertical = doorIsVertical(p);
    const c = centreOf(p);
    const resized = vertical ? { ...p, y: Math.round(c.y - along / 2), h: along } : { ...p, x: Math.round(c.x - along / 2), w: along };
    return snapDoor(resized, shape);
  }
  return { ...p, w: clamp(Math.round(wMm), r.min, r.max), h: clamp(Math.round(hMm), r.min, r.max) };
}

/* ------------------------------------------------------------------ *
 * What the room tool says
 * ------------------------------------------------------------------ */

/** The room tool's one line, when it has one. Never a refusal. */
export function roomProblems(boxes: readonly RoomBox[], shape: RoomShape): string[] {
  const out: string[] = [];
  if (shape.parts > 1) out.push("Part of the room doesn't touch the rest. Drag a box onto another.");
  if (boxes.length > PLAN_LIMITS.boxes) out.push("Up to 12 boxes.");
  return out;
}

/** About: to the nearest 10 sq ft over 100, so the line never reads as a measurement. */
const about = (sqFt: number) => (sqFt >= 100 ? Math.round(sqFt / 10) * 10 : sqFt);
const thousands = (n: number) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * The square-footage line: a tally, never a correction (AJ: "it tells you
 * like how much square footage you've used"). "Drawn: 1,600 sq ft · Studio:
 * 1,800 sq ft" when the boxes and the typed number are more than 2% apart,
 * the same either way round (never "1,900 of 1,800", which reads as an
 * error), else "Drawn: 1,790 sq ft"; then what the machines with a size take, "about", saying
 * how many have none, and how much of it is still to buy on a draft. A total
 * never counts a guess.
 */
export function areaWords(
  shape: RoomShape,
  typedSqFt: number | null | undefined,
  machines: { sized: number; unsized: number; mm2: number; planned: number },
): string {
  const drawn = sqFtOf(shape.areaMm2);
  const parts: string[] = [];
  if (typeof typedSqFt === "number" && typedSqFt > 0 && Math.abs(drawn - typedSqFt) / typedSqFt > 0.02) {
    parts.push(`Drawn: ${sqFtWords(drawn)}`, `Studio: ${sqFtWords(typedSqFt)}`);
  } else {
    parts.push(`Drawn: ${sqFtWords(drawn)}`);
  }
  if (machines.sized > 0 && machines.mm2 > 0) {
    let line = `Machines: about ${sqFtWords(about(sqFtOf(machines.mm2)))}`;
    if (machines.planned > 0) line += `, ${thousands(about(sqFtOf(machines.planned)))} of it still to buy`;
    if (machines.unsized > 0) line += ` (${machines.unsized} without a size)`;
    parts.push(line);
  }
  return parts.join(" · ");
}
