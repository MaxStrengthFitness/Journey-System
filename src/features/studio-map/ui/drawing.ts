/**
 * THE DRAWING'S FRAME — millimetres to pixels and back (the studio map, Oct
 * 2026). The drawing and the editor work their scale out the same way, so
 * a press lands on what is drawn under it.
 *
 * Plain SVG with the viewBox equal to its pixel size. At zoom 1 the room
 * (its boxes and anything placed past them, a door straddling a wall) fits
 * the container's width and, where the host knows it, its height, less a
 * pad either side for the handles and
 * the safety markers' words; zoom makes it wider and the frame scrolls.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { Box } from "../geometry";
import type { PlanPoint, PlanRoom } from "../layout";
import type { RoomShape } from "../room";

/** Room left round the drawing for the handles, a door's swing past a wall and the markers' words. */
export const PAD_PX = 28;
/** The width a drawing assumes before its container has been measured (and in a test). */
export const FALLBACK_WIDTH_PX = 720;
export const ZOOMS = [1, 1.5, 2, 3, 4] as const;

/** The room's extent: its boxes, and any place reaching past them. */
export function roomBounds(room: Pick<PlanRoom, "places">, shape: Pick<RoomShape, "bbox" | "boxes">): Box {
  if (shape.boxes.length === 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  let { x0, y0, x1, y1 } = shape.bbox;
  for (const p of room.places) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.w);
    y1 = Math.max(y1, p.y + p.h);
  }
  return { x0, y0, x1, y1 };
}

export interface Frame {
  /** Pixels a millimetre. */
  s: number;
  /** Millimetres a pixel. */
  mmPerPx: number;
  widthPx: number;
  heightPx: number;
  bounds: Box;
  toPx: (p: PlanPoint) => PlanPoint;
  toMm: (p: PlanPoint) => PlanPoint;
}

/**
 * `containerHeightPx`, when known (over 0), is the most the frame may be
 * tall: at zoom 1 the whole room fits both ways, so Fit is true in landscape
 * too. Unknown, the width alone decides.
 */
export function frameOf(bounds: Box, containerWidthPx: number, zoom = 1, containerHeightPx = 0): Frame {
  const w = containerWidthPx > 0 ? containerWidthPx : FALLBACK_WIDTH_PX;
  const roomW = Math.max(1, bounds.x1 - bounds.x0);
  const roomH = Math.max(1, bounds.y1 - bounds.y0);
  const byWidth = Math.max(80, w - 2 * PAD_PX) / roomW;
  const byHeight = containerHeightPx > 0 ? Math.max(80, containerHeightPx - 2 * PAD_PX) / roomH : Infinity;
  const s = Math.min(byWidth, byHeight) * zoom;
  const widthPx = Math.round(roomW * s + 2 * PAD_PX);
  const heightPx = Math.round(roomH * s + 2 * PAD_PX);
  return {
    s,
    mmPerPx: 1 / s,
    widthPx,
    heightPx,
    bounds,
    toPx: (p) => ({ x: PAD_PX + (p.x - bounds.x0) * s, y: PAD_PX + (p.y - bounds.y0) * s }),
    toMm: (p) => ({ x: (p.x - PAD_PX) / s + bounds.x0, y: (p.y - PAD_PX) / s + bounds.y0 }),
  };
}
