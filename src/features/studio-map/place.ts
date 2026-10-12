/**
 * A SPOT FOR A MACHINE NOT PLACED YET, AND THE SOFT MAGNET (the studio map,
 * Oct 2026).
 *
 * AJ, Oct 11 2026: "we don't want to make it so that way you have to like
 * spend twenty minutes in the tool to get that precise location." MSF floors
 * run their machines round the walls in walking order, so:
 *
 *   freeSpot   a tap on one Not placed yet chip: the nearest clear spot to a
 *              wall, backed to it (then nearest the middle), on the floor and
 *              clear of every machine, marker and place (a doorway's swing
 *              included) by AUTO_GAP_MM.
 *   placeAll   Place them all: the machines lined up along the walls in
 *              walking order, backs to the wall, from beside the first door
 *              and going clockwise, AUTO_GAP_MM apart, skipping past places
 *              and turning each corner. One that fits no wall goes to
 *              freeSpot, then the middle, and is named.
 *   magnet     on a drop, a machine that ended within 6 in of flush against
 *              a neighbour or a wall slides flush.
 *
 * AUTO_GAP_MM is NOT a setting and never a check: it only keeps Place them
 * all from stacking machines on one spot. Nothing draws or says it, and
 * there is no spacing check anywhere (design §0.3).
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import {
  bbox,
  backToWall,
  boxPoly,
  footprint,
  OVERLAP_TOL_MM,
  polyGap,
  pointPolyDist,
  satDepth,
  wallDepth,
  type Box,
  type FootprintSize,
} from "./geometry";
import type { Placement, PlanPoint, RoomPlace } from "./layout";
import { inRoom, type RoomShape, type Segment } from "./room";
import { MARKER_MM } from "./sizes";
import { MM_PER_FT, SNAP_MM } from "./units";

/** Place them all's gap between machines: 1 ft. Never a check. */
export const AUTO_GAP_MM = 304.8;
/** The soft magnet's reach: 6 in either side of flush. */
export const MAGNET_MM = SNAP_MM;
/** The most candidates that get the full check in one call. */
export const FREE_SPOT_TRIES = 400;

export interface FreeSpotInput {
  shape: RoomShape;
  places: readonly RoomPlace[];
  /** The machines with a size already on the layout. */
  placed: readonly { footprint: readonly PlanPoint[] }[];
  /** The centres of the round markers (machines with no size). */
  markers: readonly PlanPoint[];
  /** The machine to place; null is a marker. */
  size: KnownSize | null;
}

interface Obstacle {
  poly: readonly PlanPoint[];
  box: Box;
}

/** Two boxes nearer than `r` (or overlapping). */
const near = (a: Box, b: Box, r: number) => a.x0 < b.x1 + r && b.x0 < a.x1 + r && a.y0 < b.y1 + r && b.y0 < a.y1 + r;

/** The square a door sweeps into the room (as checks.ts `doorSwing`, kept here so place.ts never imports checks.ts). */
function swingOf(door: RoomPlace, shape: RoomShape): PlanPoint[] {
  if (door.h > door.w) {
    const wx = door.x + door.w / 2;
    const along = door.h;
    if (inRoom({ x: wx + 10, y: door.y + along / 2 }, shape)) return boxPoly({ x: wx, y: door.y, w: along, h: along });
    if (inRoom({ x: wx - 10, y: door.y + along / 2 }, shape)) return boxPoly({ x: wx - along, y: door.y, w: along, h: along });
    return boxPoly(door);
  }
  const wy = door.y + door.h / 2;
  const along = door.w;
  if (inRoom({ x: door.x + along / 2, y: wy + 10 }, shape)) return boxPoly({ x: door.x, y: wy, w: along, h: along });
  if (inRoom({ x: door.x + along / 2, y: wy - 10 }, shape)) return boxPoly({ x: door.x, y: wy - along, w: along, h: along });
  return boxPoly(door);
}

/** Every place as an obstacle; a door by the square it sweeps. */
function placeObstacles(places: readonly RoomPlace[], shape: RoomShape): Obstacle[] {
  return places.map((p) => {
    const poly = p.kind === "door" ? swingOf(p, shape) : boxPoly(p);
    return { poly, box: bbox(poly) };
  });
}

/** Which way a machine faces to put its back to a wall with the floor on `inward`'s side. */
export function turnFor(inward: Segment["inward"]): number {
  switch (inward) {
    case "down":
      return 0; // the wall above: back at the top
    case "left":
      return 90; // the wall on the right
    case "up":
      return 180; // the wall below
    case "right":
      return 270; // the wall on the left
  }
}

/** The machine's shape at a spot, or the marker's square. */
function shapeAt(p: Placement, size: KnownSize | null): readonly PlanPoint[] {
  if (size) return footprint(p, size);
  const r = MARKER_MM / 2;
  return boxPoly({ x: p.x - r, y: p.y - r, w: MARKER_MM, h: MARKER_MM });
}

/** Clear of every obstacle by the gap, of every marker, and on the floor. */
function clearAt(p: Placement, input: FreeSpotInput, obstacles: readonly Obstacle[]): boolean {
  const fp = shapeAt(p, input.size);
  const box = bbox(fp);
  if (!inRoom({ x: p.x, y: p.y }, input.shape)) return false;
  if (wallDepth(fp, input.shape) > 1) return false;
  const r = MARKER_MM / 2;
  for (const m of input.markers) {
    if (pointPolyDist(m, fp) < r + AUTO_GAP_MM) return false;
  }
  for (const o of obstacles) {
    if (!near(box, o.box, AUTO_GAP_MM)) continue;
    if (polyGap(fp, o.poly) < AUTO_GAP_MM) return false;
  }
  return true;
}

/**
 * The nearest clear spot to a wall, backed to it, else nearest the middle;
 * null when none is found. Candidates are the 1 ft lattice inside the
 * room's bounds, nearest a wall first; at most FREE_SPOT_TRIES get the full
 * check, so a big room never stalls a tap.
 */
export function freeSpot(input: FreeSpotInput, machineId = ""): Placement | null {
  const { shape } = input;
  if (shape.walls.length === 0) return null;
  const obstacles: Obstacle[] = [
    ...input.placed.map((m) => ({ poly: m.footprint, box: bbox(m.footprint) })),
    ...placeObstacles(input.places, shape),
  ];
  const b = shape.bbox;
  const mid = middleOf(shape, machineId);
  const cands: { p: PlanPoint; wall: Segment; d: number; m: number }[] = [];
  for (let y = b.y0 + MM_PER_FT / 2; y < b.y1; y += MM_PER_FT) {
    for (let x = b.x0 + MM_PER_FT / 2; x < b.x1; x += MM_PER_FT) {
      const p = { x: Math.round(x), y: Math.round(y) };
      if (!inRoom(p, shape)) continue;
      let wall = shape.walls[0];
      let d = Infinity;
      for (const w of shape.walls) {
        const v = w.a.x === w.b.x;
        const lo = v ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x);
        const hi = v ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
        const along = v ? p.y : p.x;
        if (along < lo || along > hi) continue;
        const dd = Math.abs(v ? p.x - w.a.x : p.y - w.a.y);
        if (dd < d) {
          d = dd;
          wall = w;
        }
      }
      if (!Number.isFinite(d)) continue;
      cands.push({ p, wall, d, m: Math.hypot(p.x - mid.x, p.y - mid.y) });
    }
  }
  cands.sort((a, c) => a.d - c.d || a.m - c.m);

  const seen = new Set<string>();
  let tried = 0;
  for (const c of cands) {
    if (tried >= FREE_SPOT_TRIES) break;
    const rotationDeg = turnFor(c.wall.inward);
    let p: Placement = { machineId, x: c.p.x, y: c.p.y, rotationDeg };
    if (input.size) {
      const q = backToWall(p, input.size, shape);
      p = { ...p, x: q.x, y: q.y };
    }
    const key = `${p.x},${p.y},${p.rotationDeg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tried++;
    if (clearAt(p, input, obstacles)) return p;
  }
  return null;
}

/** The middle of the room: the centre of its largest box, so the middle of an L is on the floor. */
export function middleOf(shape: RoomShape, machineId: string): Placement {
  let best = shape.boxes[0];
  for (const b of shape.boxes) if (b.w * b.h > best.w * best.h) best = b;
  if (!best) return { machineId, x: 0, y: 0, rotationDeg: 0 };
  return { machineId, x: Math.round(best.x + best.w / 2), y: Math.round(best.y + best.h / 2), rotationDeg: 0 };
}

/* ------------------------------------------------------------------ *
 * Place them all: along the walls, in walking order
 * ------------------------------------------------------------------ */

/** A stretch of wall to walk along: its start, its direction (clockwise round the floor), its length, and the floor's side. */
export interface WallRun {
  start: PlanPoint;
  dir: PlanPoint;
  length: number;
  inward: Segment["inward"];
}

/** The direction a wall is walked clockwise (y down): the floor on the walker's right. */
function travelOf(inward: Segment["inward"]): PlanPoint {
  switch (inward) {
    case "down":
      return { x: 1, y: 0 };
    case "left":
      return { x: 0, y: 1 };
    case "up":
      return { x: -1, y: 0 };
    case "right":
      return { x: 0, y: -1 };
  }
}

function runOf(w: Segment): WallRun {
  const dir = travelOf(w.inward);
  const forward = (w.b.x - w.a.x) * dir.x + (w.b.y - w.a.y) * dir.y >= 0;
  const start = forward ? w.a : w.b;
  return { start, dir, length: Math.abs(w.b.x - w.a.x) + Math.abs(w.b.y - w.a.y), inward: w.inward };
}

const endOf = (r: WallRun): PlanPoint => ({ x: r.start.x + r.dir.x * r.length, y: r.start.y + r.dir.y * r.length });
const same = (a: PlanPoint, b: PlanPoint) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/**
 * The walls as runs in clockwise order, starting beside the first door: the
 * door's own wall from the door's far end, every wall after it round the
 * room, then the door's wall again from its corner up to the door. With no
 * door, from the top-left. A wall of a hole in the floor (a courtyard) comes
 * after the outside walls.
 */
export function wallRuns(shape: RoomShape, places: readonly RoomPlace[]): WallRun[] {
  const runs = shape.walls.map(runOf);
  if (runs.length === 0) return [];
  const door = places.find((p) => p.kind === "door");
  const doorCentre = door ? { x: door.x + door.w / 2, y: door.y + door.h / 2 } : null;
  const along = (r: WallRun, p: PlanPoint) => (p.x - r.start.x) * r.dir.x + (p.y - r.start.y) * r.dir.y;
  const across = (r: WallRun, p: PlanPoint) => Math.abs((p.x - r.start.x) * r.dir.y - (p.y - r.start.y) * r.dir.x);
  let first = 0;
  if (doorCentre) {
    let best = Infinity;
    runs.forEach((r, i) => {
      const t = along(r, doorCentre);
      if (t < 0 || t > r.length) return;
      const d = across(r, doorCentre);
      if (d < best) {
        best = d;
        first = i;
      }
    });
  } else {
    let best = Infinity;
    runs.forEach((r, i) => {
      const k = r.start.y * 1e6 + r.start.x;
      if (r.inward === "down" && k < best) {
        best = k;
        first = i;
      }
    });
  }
  // Walk the loop from the first run.
  const order: number[] = [first];
  const used = new Set<number>([first]);
  for (;;) {
    const end = endOf(runs[order[order.length - 1]]);
    const next = runs.findIndex((r, i) => !used.has(i) && same(r.start, end));
    if (next < 0) break;
    order.push(next);
    used.add(next);
  }
  runs.forEach((_, i) => {
    if (!used.has(i)) order.push(i);
  });
  const out: WallRun[] = [];
  const head = runs[first];
  if (door && doorCentre) {
    const doorAlong = Math.max(door.w, door.h);
    const t = along(head, doorCentre);
    const after = t + doorAlong / 2;
    const before = t - doorAlong / 2;
    out.push({ ...head, start: { x: head.start.x + head.dir.x * after, y: head.start.y + head.dir.y * after }, length: Math.max(0, head.length - after) });
    for (const i of order.slice(1)) out.push(runs[i]);
    out.push({ ...head, length: Math.max(0, before) });
  } else {
    for (const i of order) out.push(runs[i]);
  }
  return out.filter((r) => r.length > 0);
}

/**
 * Place them all: each machine in walking order along the walls, back to
 * the wall, AUTO_GAP_MM from the last, skipping past places and turning
 * each corner. A machine that fits no wall run goes to freeSpot, and one
 * that still doesn't fit is named in `noRoom` (the caller puts it in the
 * middle and says so).
 */
export function placeAll(
  input: Omit<FreeSpotInput, "size">,
  machines: readonly { id: string; size: KnownSize | null }[],
): { placed: Placement[]; noRoom: string[] } {
  const { shape } = input;
  const obstacles: Obstacle[] = [
    ...input.placed.map((m) => ({ poly: m.footprint, box: bbox(m.footprint) })),
    ...placeObstacles(input.places, shape),
  ];
  const markers = [...input.markers];
  const runs = wallRuns(shape, input.places);
  const placed: Placement[] = [];
  const noRoom: string[] = [];
  let run = 0;
  let pos = 0;

  const tryRun = (m: { id: string; size: KnownSize | null }): Placement | null => {
    const along = m.size ? m.size.widthMm : MARKER_MM;
    const depth = m.size ? m.size.lengthMm : MARKER_MM;
    while (run < runs.length) {
      const r = runs[run];
      if (pos + along > r.length + 0.5) {
        run++;
        pos = 0;
        continue;
      }
      const t = pos + along / 2;
      const inDir = { x: -r.dir.y, y: r.dir.x }; // the floor's side: the walker's right
      const p: Placement = {
        machineId: m.id,
        x: Math.round(r.start.x + r.dir.x * t + inDir.x * (depth / 2)),
        y: Math.round(r.start.y + r.dir.y * t + inDir.y * (depth / 2)),
        rotationDeg: m.size ? turnFor(r.inward) : 0,
      };
      const fp = shapeAt(p, m.size);
      const box = bbox(fp);
      if (wallDepth(fp, shape) > 1) {
        pos += SNAP_MM;
        continue;
      }
      let hitFar = -Infinity;
      for (const o of obstacles) {
        if (!near(box, o.box, AUTO_GAP_MM - 1)) continue;
        if (polyGap(fp, o.poly) >= AUTO_GAP_MM - 1) continue;
        // How far along this run the obstacle reaches: skip past it.
        for (const q of o.poly) hitFar = Math.max(hitFar, (q.x - r.start.x) * r.dir.x + (q.y - r.start.y) * r.dir.y);
      }
      const r2 = MARKER_MM / 2;
      for (const mk of markers) {
        if (pointPolyDist(mk, fp) < r2 + AUTO_GAP_MM - 1) {
          hitFar = Math.max(hitFar, (mk.x - r.start.x) * r.dir.x + (mk.y - r.start.y) * r.dir.y + r2);
        }
      }
      if (hitFar > -Infinity) {
        pos = Math.max(pos + SNAP_MM, hitFar + AUTO_GAP_MM);
        continue;
      }
      pos += along + AUTO_GAP_MM;
      return p;
    }
    return null;
  };

  for (const m of machines) {
    let spot = tryRun(m);
    if (!spot) {
      spot = freeSpot({ shape, places: input.places, placed: obstacles.map((o) => ({ footprint: o.poly })), markers, size: m.size }, m.id);
    }
    if (!spot) {
      noRoom.push(m.id);
      continue;
    }
    placed.push(spot);
    if (m.size) {
      const fp = footprint(spot, m.size);
      obstacles.push({ poly: fp, box: bbox(fp) });
    } else {
      markers.push({ x: spot.x, y: spot.y });
    }
  }
  return { placed, noRoom };
}

/* ------------------------------------------------------------------ *
 * The soft magnet
 * ------------------------------------------------------------------ */

export interface MagnetNeighbour {
  id: string;
  placement: Placement;
  size: FootprintSize;
}

const square = (deg: number) => ((Math.round(deg) % 90) + 90) % 90 === 0;

/**
 * A dropped machine that ended within 6 in of flush against a sized
 * neighbour or a wall, either side (a gap or an overlap), slides flush: one
 * axis, the nearest edge. Only a machine turned 0, 90, 180 or 270; never
 * when the slide would put it more than the overlap tolerance into a third
 * machine. Unchanged otherwise.
 */
export function magnet(p: Placement, size: FootprintSize, neighbours: readonly MagnetNeighbour[], shape: RoomShape): { x: number; y: number } {
  if (!square(p.rotationDeg)) return { x: p.x, y: p.y };
  const me = bbox(footprint(p, size));
  const cx = (me.x0 + me.x1) / 2;
  const cy = (me.y0 + me.y1) / 2;
  type Cand = { dx: number; dy: number; target: string | null };
  const cands: Cand[] = [];
  const consider = (dx: number, dy: number, target: string | null) => {
    if (Math.abs(dx) > MAGNET_MM + 0.5 || Math.abs(dy) > MAGNET_MM + 0.5) return;
    cands.push({ dx, dy, target });
  };
  const overlapY = (b: Box) => Math.min(me.y1, b.y1) - Math.max(me.y0, b.y0) > 0.5;
  const overlapX = (b: Box) => Math.min(me.x1, b.x1) - Math.max(me.x0, b.x0) > 0.5;

  for (const n of neighbours) {
    if (!square(n.placement.rotationDeg)) continue;
    const b = bbox(footprint(n.placement, n.size));
    const bx = (b.x0 + b.x1) / 2;
    const by = (b.y0 + b.y1) / 2;
    if (overlapY(b)) {
      consider(cx < bx ? b.x0 - me.x1 : b.x1 - me.x0, 0, n.id);
    }
    if (overlapX(b)) {
      consider(0, cy < by ? b.y0 - me.y1 : b.y1 - me.y0, n.id);
    }
  }
  for (const w of shape.walls) {
    if (w.a.x === w.b.x) {
      const b = { x0: w.a.x, x1: w.a.x, y0: Math.min(w.a.y, w.b.y), y1: Math.max(w.a.y, w.b.y) };
      if (!overlapY(b)) continue;
      if (w.inward === "right") consider(w.a.x - me.x0, 0, null);
      else consider(w.a.x - me.x1, 0, null);
    } else {
      const b = { y0: w.a.y, y1: w.a.y, x0: Math.min(w.a.x, w.b.x), x1: Math.max(w.a.x, w.b.x) };
      if (!overlapX(b)) continue;
      if (w.inward === "down") consider(0, w.a.y - me.y0, null);
      else consider(0, w.a.y - me.y1, null);
    }
  }
  if (cands.length === 0) return { x: p.x, y: p.y };
  cands.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
  const best = cands[0];
  // Already flush against the nearest edge: it stays.
  if (Math.abs(best.dx) + Math.abs(best.dy) < 0.5) return { x: p.x, y: p.y };
  const moved = { ...p, x: Math.round(p.x + best.dx), y: Math.round(p.y + best.dy) };
  const fp = footprint(moved, size);
  for (const n of neighbours) {
    if (n.id === best.target) continue;
    if (satDepth(fp, footprint(n.placement, n.size)) > OVERLAP_TOL_MM) return { x: p.x, y: p.y };
  }
  return { x: moved.x, y: moved.y };
}
