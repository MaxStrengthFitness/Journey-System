/**
 * A TAP ON THE MAP (the studio map, Oct 2026).
 *
 * A finger is wider than a small machine drawn on an iPad mini, so a tap
 * goes to the machine whose footprint holds it, or else the nearest
 * footprint (or round marker) within the slop: 22 px either side, a hit
 * area of 44 px or more around every machine. Ties go to the nearer centre.
 *
 * A room is drawn for tapping when every machine's short side is 24 px or
 * more on screen. There is no centre-distance rule: a tap inside a
 * footprint goes to that machine exactly, and machines may sit tight
 * against each other (AJ, Oct 11 2026). Every read door applies this one
 * rule, so no door draws a map another refuses. Places are never tap
 * targets in the read doors: a tap on the AED is a tap on the floor.
 *
 * The editor's room tool picks boxes and places (`pickRoomItem`). The
 * handles of the selected box or place sit just OUTSIDE its shape, so a
 * press inside an item always moves it and never resizes it; an item whose
 * shorter side is under 44 px on screen gets no handles at all (its panel's
 * typed size resizes it). `handlesFor` decides, so the drawing and the pick
 * agree.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { pointInPolygon, pointPolyDist } from "./geometry";
import { isSafety, type PlanPoint, type RoomBox, type RoomPlace } from "./layout";
import type { Edge } from "./placement";
import type { RoomShape } from "./room";
import { MARKER_MM } from "./sizes";

export interface TapTarget {
  id: string;
  /** null for a round marker (no size). */
  footprint: readonly PlanPoint[] | null;
  centre: PlanPoint;
}

/** The machine a tap at `pointMm` means, or null. */
export function pickAt(pointMm: PlanPoint, placed: readonly TapTarget[], slopMm: number): string | null {
  const dist = (t: TapTarget) =>
    t.footprint ? pointPolyDist(pointMm, t.footprint) : Math.max(0, Math.hypot(pointMm.x - t.centre.x, pointMm.y - t.centre.y) - MARKER_MM / 2);
  const toCentre = (t: TapTarget) => Math.hypot(pointMm.x - t.centre.x, pointMm.y - t.centre.y);
  let best: TapTarget | null = null;
  let bestD = Infinity;
  for (const t of placed) {
    const inside = t.footprint ? pointInPolygon(pointMm, t.footprint) : toCentre(t) <= MARKER_MM / 2;
    const d = inside ? 0 : dist(t);
    if (d > slopMm) continue;
    if (d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && best && toCentre(t) < toCentre(best))) {
      best = t;
      bestD = d;
    }
  }
  return best?.id ?? null;
}

/** The smallest a machine's short side may be drawn for a door to offer the map: 24 px. */
export const MIN_SHORT_PX = 24;

/** Every machine big enough to tap at this scale (short sides of 24 px or more). Machines only. */
export function roomIsTappable(mmPerPx: number, placed: readonly Omit<TapTarget, "id">[]): boolean {
  if (!(mmPerPx > 0)) return false;
  for (const t of placed) {
    let short = MARKER_MM;
    if (t.footprint) {
      const fp = t.footprint;
      short = Math.min(...fp.map((p, i) => Math.hypot(fp[(i + 1) % fp.length].x - p.x, fp[(i + 1) % fp.length].y - p.y)));
    }
    if (short / mmPerPx < MIN_SHORT_PX) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * The room tool
 * ------------------------------------------------------------------ */

/** A handle's hit area, centred on its bar: 44 px. */
export const HANDLE_HIT_PX = 44;
/** The bar sits this far outside its edge, centre to edge: half its 12 px plus 2 px. */
export const HANDLE_OUT_PX = 8;
/** The corner square's centre sits this far outside the corner, each way. */
export const CORNER_OUT_PX = 12;

export interface Handle {
  edge: Edge;
  /** The handle's centre, in mm. */
  at: PlanPoint;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The handles a selected box or place gets at this scale: a box its four
 * edges and its bottom-right corner; an area or a pillar its four edges; a
 * door its two ends along the wall; the AED and the extinguisher none. None
 * at all when the shorter side is under 44 px on screen.
 */
export function handlesFor(item: Rect & { kind?: RoomPlace["kind"] }, mmPerPx: number): Handle[] {
  if (!(mmPerPx > 0)) return [];
  if (item.kind && isSafety(item.kind)) return [];
  const out = HANDLE_OUT_PX * mmPerPx;
  const corner = CORNER_OUT_PX * mmPerPx;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const right: Handle = { edge: "right", at: { x: item.x + item.w + out, y: cy } };
  const left: Handle = { edge: "left", at: { x: item.x - out, y: cy } };
  const top: Handle = { edge: "top", at: { x: cx, y: item.y - out } };
  const bottom: Handle = { edge: "bottom", at: { x: cx, y: item.y + item.h + out } };
  if (item.kind === "door") {
    // Its two ends along the wall; the door's own thickness never counts.
    const along = Math.max(item.w, item.h);
    if (along / mmPerPx < HANDLE_HIT_PX) return [];
    return item.h > item.w ? [top, bottom] : [left, right];
  }
  if (Math.min(item.w, item.h) / mmPerPx < HANDLE_HIT_PX) return [];
  const handles = [top, right, bottom, left];
  if (!item.kind) handles.push({ edge: "corner", at: { x: item.x + item.w + corner, y: item.y + item.h + corner } });
  return handles;
}

const holds = (r: Rect, p: PlanPoint) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * What a press at `pointMm` in the room tool means: a handle of the
 * selected item (only outside its shape, within the slop); else the place
 * that holds it, the smallest first (a pillar inside a changing room is
 * reachable); else the box that holds it, the smallest first; else null.
 */
export function pickRoomItem(
  pointMm: PlanPoint,
  shape: Pick<RoomShape, "boxes">,
  places: readonly RoomPlace[],
  slopMm: number,
  selected: { id: string; rect: Rect; handles: readonly Handle[] } | null = null,
): { id: string; edge: Edge | null } | null {
  if (selected && !holds(selected.rect, pointMm)) {
    let best: Handle | null = null;
    let bestD = Infinity;
    for (const h of selected.handles) {
      const d = Math.max(Math.abs(pointMm.x - h.at.x), Math.abs(pointMm.y - h.at.y));
      if (d <= slopMm && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    if (best) return { id: selected.id, edge: best.edge };
  }
  const area = (r: Rect) => r.w * r.h;
  const place = [...places].filter((p) => holds(p, pointMm)).sort((a, b) => area(a) - area(b))[0];
  if (place) return { id: place.id, edge: null };
  const box = [...(shape.boxes as readonly RoomBox[])].filter((b) => holds(b, pointMm)).sort((a, b) => area(a) - area(b))[0];
  if (box) return { id: box.id, edge: null };
  return null;
}
