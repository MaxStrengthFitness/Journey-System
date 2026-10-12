/**
 * THE ROOM'S GEOMETRY (the studio map, Oct 2026).
 *
 * Every shape here is in whole millimetres, origin top-left, y down: a
 * machine's footprint (its frame at rest, turned about its centre), a box
 * of the room or a place in it (axis-aligned), and the distances the
 * editor's overlap lines say in feet and inches. The room itself is the
 * union of its boxes (room.ts `roomShape`): its walls are axis-aligned
 * segments, and its inner corners are points, so an L, a T or a notch is
 * never a polygon a person has to close.
 *
 * Rough on purpose (AJ, Oct 11 2026: "machines need to have a little room
 * to be a little bit tighter together ... I don't want it to be like a very
 * picky builder"): only an overlap a person can see is marked, more than
 * 6 in (`OVERLAP_TOL_MM`, the snap step), and the three safety facts (a
 * machine over the AED, the fire extinguisher, or in a doorway) past 1 in.
 *
 * At 0° a machine's length runs down the screen with its back at the top;
 * corner 0 → 1 is the back edge, and a turn is clockwise.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { Placement, PlanPoint } from "./layout";
import type { RoomShape } from "./room";

export interface FootprintSize {
  lengthMm: number;
  widthMm: number;
}

/** An overlap a person can see: 6 in, the snap step. Less is "sitting tight", never marked. */
export const OVERLAP_TOL_MM = 152.4;
/** The three safety facts (the AED, the extinguisher, a doorway): past 1 in. */
export const SAFETY_TOL_MM = 25.4;

const rad = (d: number) => (d * Math.PI) / 180;

/** A point of a placed shape, from its own frame (x across the width, y along the length) to the room's. */
export function toWorld(p: Pick<Placement, "x" | "y" | "rotationDeg">, local: PlanPoint): PlanPoint {
  const t = rad(p.rotationDeg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: p.x + local.x * c - local.y * s, y: p.y + local.x * s + local.y * c };
}

/** The four corners of a placed machine. Corner 0 → 1 is its back. */
export function footprint(p: Pick<Placement, "x" | "y" | "rotationDeg">, size: FootprintSize): PlanPoint[] {
  const hx = size.widthMm / 2;
  const hy = size.lengthMm / 2;
  return [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ].map((q) => toWorld(p, q));
}

/** An axis-aligned box (a room box or a place) as four corners, clockwise from its top-left. */
export function boxPoly(b: { x: number; y: number; w: number; h: number }): PlanPoint[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

function axesOf(poly: readonly PlanPoint[]): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const len = Math.hypot(nx, ny);
    if (len > 0) out.push({ x: nx / len, y: ny / len });
  }
  return out;
}

function projectOn(poly: readonly PlanPoint[], ax: PlanPoint): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const p of poly) {
    const v = p.x * ax.x + p.y * ax.y;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}

/**
 * The separating-axis test for two convex shapes (two footprints, or a
 * footprint and a place): 0 when they are apart or only touch, otherwise how
 * far they go into each other, in mm.
 */
export function satDepth(A: readonly PlanPoint[], B: readonly PlanPoint[]): number {
  let best = Infinity;
  for (const ax of [...axesOf(A), ...axesOf(B)]) {
    const a = projectOn(A, ax);
    const b = projectOn(B, ax);
    const o = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    if (o <= 0) return 0;
    if (o < best) best = o;
  }
  return best === Infinity ? 0 : best;
}

/** Half a millimetre: two machines pushed exactly 6 in into each other never read as 6.0000001 in. */
export const DEPTH_EPS_MM = 0.5;

/** Two shapes overlap by more than `tol` (an overlap a person can see; 6 in unless said). */
export function overlaps(A: readonly PlanPoint[], B: readonly PlanPoint[], tol = OVERLAP_TOL_MM): boolean {
  return satDepth(A, B) > tol + DEPTH_EPS_MM;
}

/** The distance from a point to a segment. */
export function segDist(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = 0;
  if (L2 > 0) t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Inside a simple polygon (a footprint, for a tap), by ray casting. A point exactly on an edge may fall either way. */
export function pointInPolygon(p: PlanPoint, poly: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The distance from a point to the nearest edge of a closed polygon. */
export function distToEdges(p: PlanPoint, poly: readonly PlanPoint[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}

/** 0 inside the polygon, otherwise the distance to its nearest edge. */
export function pointPolyDist(p: PlanPoint, poly: readonly PlanPoint[]): number {
  return pointInPolygon(p, poly) ? 0 : distToEdges(p, poly);
}

/** The gap between two shapes in mm; 0 when they touch or overlap. */
export function polyGap(A: readonly PlanPoint[], B: readonly PlanPoint[]): number {
  if (satDepth(A, B) > 0) return 0;
  let m = Infinity;
  for (const p of A) for (let j = 0; j < B.length; j++) m = Math.min(m, segDist(p, B[j], B[(j + 1) % B.length]));
  for (const p of B) for (let j = 0; j < A.length; j++) m = Math.min(m, segDist(p, A[j], A[(j + 1) % A.length]));
  return m;
}

/** In any box of the room (on an edge counts as in). */
function inBoxes(p: PlanPoint, shape: RoomShape): boolean {
  for (const b of shape.boxes) {
    if (p.x >= b.x - 1e-6 && p.x <= b.x + b.w + 1e-6 && p.y >= b.y - 1e-6 && p.y <= b.y + b.h + 1e-6) return true;
  }
  return false;
}

/** The sign of a convex polygon's winding (+1 or −1), from its cross products. */
function windingOf(poly: readonly PlanPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s >= 0 ? 1 : -1;
}

/** How long a stretch of segment a–b lies strictly inside a convex polygon, in mm. */
function lengthInside(a: PlanPoint, b: PlanPoint, poly: readonly PlanPoint[]): number {
  const w = windingOf(poly);
  const d = { x: b.x - a.x, y: b.y - a.y };
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const e = { x: q.x - p.x, y: q.y - p.y };
    // Inside: w × cross(e, x − p) > 0, linear in t along the segment.
    const f0 = w * (e.x * (a.y - p.y) - e.y * (a.x - p.x));
    const f1 = w * (e.x * d.y - e.y * d.x);
    const eps = 1e-6;
    if (Math.abs(f1) < 1e-12) {
      if (f0 <= eps) return 0;
      continue;
    }
    const t = (eps - f0) / f1;
    if (f1 > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(d.x, d.y);
}

/**
 * How far a machine goes into the wall, for any room of boxes: the maximum
 * of (1) how far a footprint corner outside the floor is from the nearest
 * wall, (2) how far an inner corner of the room pokes into the footprint,
 * and (3) for a wall that runs across the footprint's inside (a notch under
 * a machine whose four corners are all on the floor), the footprint's
 * smaller reach on either side of that wall's line: how far it would have
 * to move to clear it. 0 when it stands clear.
 */
export function wallDepth(fp: readonly PlanPoint[], shape: RoomShape): number {
  let m = 0;
  for (const c of fp) {
    if (!inBoxes(c, shape)) {
      let d = Infinity;
      for (const w of shape.walls) d = Math.min(d, segDist(c, w.a, w.b));
      if (Number.isFinite(d)) m = Math.max(m, d);
    }
  }
  for (const v of shape.corners) {
    if (insideConvexStrict(v, fp)) m = Math.max(m, distToEdges(v, fp));
  }
  for (const w of shape.walls) {
    if (lengthInside(w.a, w.b, fp) <= 1) continue;
    const vertical = Math.abs(w.a.x - w.b.x) < 0.5;
    const line = vertical ? w.a.x : w.a.y;
    let lo = 0;
    let hi = 0;
    for (const c of fp) {
      const v = (vertical ? c.x : c.y) - line;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    m = Math.max(m, Math.min(-lo, hi));
  }
  return m;
}

/** Strictly inside a convex polygon (any winding). */
function insideConvexStrict(p: PlanPoint, poly: readonly PlanPoint[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cr) < 1e-6) return false;
    const s = cr > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Where a ray from `o` along `d` meets segment a–b: the distance along the ray, or null. */
function rayHit(o: PlanPoint, d: PlanPoint, a: PlanPoint, b: PlanPoint): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

/**
 * Back to the wall: slide a machine straight back, along its back direction
 * (sin θ, −cos θ), until its back first meets a wall of the room: the
 * nearest hit of either back corner on a wall, or an inner corner of the
 * room on its back edge (an L's notch). Rounded toward the room, so nothing
 * pokes a millimetre into the wall. Unchanged when no wall is hit.
 */
export function backToWall(p: Pick<Placement, "x" | "y" | "rotationDeg">, size: FootprintSize, shape: RoomShape): { x: number; y: number } {
  const t = rad(p.rotationDeg);
  const dir = { x: Math.sin(t), y: -Math.cos(t) };
  const fp = footprint(p, size);
  const back = [fp[0], fp[1]];
  let best = Infinity;
  for (const c of back) {
    for (const w of shape.walls) {
      const hit = rayHit(c, dir, w.a, w.b);
      if (hit !== null && hit >= -0.5 && hit < best) best = hit;
    }
  }
  const away = { x: -dir.x, y: -dir.y };
  for (const v of shape.corners) {
    const hit = rayHit(v, away, back[0], back[1]);
    if (hit !== null && hit >= -0.5 && hit < best) best = hit;
  }
  if (!Number.isFinite(best)) return { x: p.x, y: p.y };
  const step = Math.max(0, best);
  const x = p.x + dir.x * step;
  const y = p.y + dir.y * step;
  return {
    x: dir.x > 1e-9 ? Math.floor(x) : dir.x < -1e-9 ? Math.ceil(x) : Math.round(x),
    y: dir.y > 1e-9 ? Math.floor(y) : dir.y < -1e-9 ? Math.ceil(y) : Math.round(y),
  };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bbox(poly: readonly PlanPoint[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** An angle turned by `by` degrees, as a whole number 0–359. */
export function rotateDeg(deg: number, by = 0): number {
  const d = Math.round(deg + by) % 360;
  return d < 0 ? d + 360 : d;
}
