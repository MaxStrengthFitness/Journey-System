/**
 * THE EDITOR'S WORKING COPY AND THE MOVE (the studio map, Oct 2026).
 *
 * The layout a leader is changing is a working copy: the room (its boxes
 * and places) and where each machine stands, kept apart from what was
 * loaded until it is saved. Two tools: Machines (drag machines, and on a
 * draft the machines still to buy) and The room (boxes and places). A
 * press becomes a drag after 8 screen pixels, so a tap is a tap.
 *
 * Rough on purpose (AJ, Oct 11 2026: "It just needs to be like a r- rough
 * placement editor, but then like actually knowing the sizes is correct"):
 *
 *   a machine   its MOVEMENT snaps to 6 in, so a machine on a wall stays on
 *               it; on release the soft magnet (place.ts `magnet`) slides it
 *               flush against a neighbour or a wall it ended within 6 in of,
 *               in the same Undo step. Nudges are exact and never pulled.
 *   a box       its position on whole feet, an edge on a whole foot, the
 *               corner handle both ways at once (room.ts).
 *   a place     6 in steps; a door slides along its wall.
 *
 * After any box change every door is put back on its nearest wall in the
 * same Undo step, so one Undo puts a box and its door back together.
 *
 * A machine with no size is a round marker: Back to the wall does nothing
 * for it (the screen hides the button), and its centre stays where the
 * whole 2 ft marker is inside the room's bounds. A sized machine's centre
 * stays inside the plan's 0–200 ft whatever a drag or a nudge does, so the
 * copy on screen is always one Save can send.
 *
 * Undo while editing keeps the last 20 changes. A copy the listener brings
 * while the leader has changes is ignored unless it is forced (Discard, the
 * practice layout), so nothing is replaced under a finger.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import { backToWall, rotateDeg, type Box, type FootprintSize } from "./geometry";
import {
  isPlanned,
  placementId,
  PLAN_LIMITS,
  type PlaceKind,
  type Placement,
  type PlannedPlacement,
  type PlanPoint,
  type PlanRoom,
  type RoomBox,
  type RoomPlace,
  type UnitPlacement,
} from "./layout";
import { magnet, type MagnetNeighbour } from "./place";
import {
  addPlace as addPlaceTo,
  firstBox,
  moveBox,
  movePlace,
  newBoxBeside,
  resizeCorner,
  resizeEdge,
  resizePlaceEdge,
  resnapDoors,
  roomShape,
  typedBoxSize,
  typedPlaceSize,
  type BoxEdge,
  type RoomShape,
} from "./room";
import { MARKER_MM } from "./sizes";
import { SNAP_MM } from "./units";

export interface Working {
  room: PlanRoom;
  /** Units and (on a draft) machines still to buy. */
  placements: Placement[];
  /** Placements whose machine left the floor: kept in every write, never drawn. */
  gone: UnitPlacement[];
}

export interface Px {
  x: number;
  y: number;
}

export type ItemKind = "box" | "place" | "planned" | "unit";

/** What an id names: "bx-" a box, "pc-" a place, "pm-" a machine still to buy, anything else a roster id. */
export function kindOfId(id: string): ItemKind {
  if (id.startsWith("bx-")) return "box";
  if (id.startsWith("pc-")) return "place";
  if (id.startsWith("pm-")) return "planned";
  return "unit";
}

/** view: a tap selects; machines: drag machines; room: boxes and places. */
export type Tool = "view" | "machines" | "room";
/** "corner": a box's bottom-right handle. */
export type Edge = BoxEdge | "corner";
export type Item = Placement | RoomBox | RoomPlace;

export type Drag =
  | { phase: "idle" }
  | { phase: "pressed"; id: string; edge: Edge | null; startPx: Px; origin: Item }
  | { phase: "dragging"; id: string; edge: Edge | null; startPx: Px; origin: Item; at: Item };

export interface EditorState {
  /** The document the copy came from; rev null = not saved yet. */
  base: { id: string; rev: number | null };
  working: Working;
  /** Up to 20, for Undo while editing. */
  history: Working[];
  selectedId: string | null;
  tool: Tool;
  drag: Drag;
  dirty: boolean;
}

export type NudgeDir = "up" | "down" | "left" | "right";

export type Action =
  /** `dirty`: the copy loaded is still unsaved work (a save that was refused, put back on screen). */
  | { type: "load"; id: string; rev: number | null; working: Working; force?: boolean; dirty?: boolean }
  | { type: "tool"; tool: Tool }
  | { type: "select"; id: string | null }
  | { type: "press"; id: string; px: Px; edge?: Edge | null }
  /** `marker`: the pressed machine has no size, so its centre is held inside the room's bounds. */
  | { type: "move"; px: Px; mmPerPx: number; marker?: boolean }
  /** `sizeOf`: a machine's size by its id, for the soft magnet; left out, nothing is magnetised. */
  | { type: "release"; sizeOf?: (id: string) => FootprintSize | null }
  | { type: "cancel" }
  | { type: "nudge"; dir: NudgeDir; marker?: boolean }
  | { type: "turn"; by: 90 | -90 | 15 | -15 }
  | { type: "toWall"; size: FootprintSize | null }
  | { type: "place"; id: string; at: Placement }
  | { type: "placeMany"; at: Placement[] }
  | { type: "takeOff"; id: string }
  | { type: "dropGone" }
  | { type: "room"; room: PlanRoom }
  | { type: "practice"; room: PlanRoom; placements: Placement[] }
  | { type: "firstRoom"; areaSqFt: number }
  | { type: "setArea"; sqFt: number | null }
  | { type: "addBox" }
  | { type: "removeBox"; id: string }
  | { type: "typedBox"; id: string; wMm: number; hMm: number }
  | { type: "addPlace"; kind: PlaceKind; at: PlanPoint }
  | { type: "removePlace"; id: string }
  | { type: "label"; id: string; text: string }
  | { type: "typedPlace"; id: string; wMm: number; hMm: number }
  | { type: "addPlanned"; planned: PlannedPlacement }
  | { type: "swapIn"; plannedId: string; machineId: string }
  | { type: "undo" }
  | { type: "saved"; id: string; rev: number }
  /** A save that didn't land: what is on screen is unsaved work again, against the rev it was opened at. */
  | { type: "unsaved"; rev: number | null };

export const DEAD_PX = 8;
export const HISTORY_MAX = 20;

export function emptyWorking(room: PlanRoom): Working {
  return { room, placements: [], gone: [] };
}

export function initialEditor(base: { id: string; rev: number | null }, working: Working): EditorState {
  return { base, working, history: [], selectedId: null, tool: "view", drag: { phase: "idle" }, dirty: false };
}

const snap6 = (v: number) => Math.round(Math.round(v / SNAP_MM) * SNAP_MM);

/**
 * Where a drag puts a machine: nothing until the press has travelled
 * DEAD_PX on screen; then its origin plus the movement snapped to 6 in.
 */
export function dragStep<P extends { x: number; y: number }>(origin: P, travelledPx: number, dxMm: number, dyMm: number): P | null {
  if (!(travelledPx >= DEAD_PX)) return null;
  return { ...origin, x: origin.x + snap6(dxMm), y: origin.y + snap6(dyMm) };
}

/** The room's bounds from its boxes, without working the walls out. */
export function boundsOf(boxes: readonly RoomBox[]): Box {
  if (boxes.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x0, y0, x1, y1 };
}

/** A marker's centre, held so the whole 2 ft marker stays inside the room's bounds. */
export function clampMarker<P extends { x: number; y: number }>(p: P, bounds: Box): P {
  const r = MARKER_MM / 2;
  return {
    ...p,
    x: Math.round(Math.max(bounds.x0 + r, Math.min(bounds.x1 - r, p.x))),
    y: Math.round(Math.max(bounds.y0 + r, Math.min(bounds.y1 - r, p.y))),
  };
}

/**
 * A sized machine's centre, held inside 0–200 ft (what a layout may store),
 * so a few nudges toward a wall or a drag beyond it never make a copy Save
 * refuses. Past the wall it may go (the overlap shows it); off the plan it
 * may not.
 */
export function clampCentre<P extends { x: number; y: number }>(p: P): P {
  return {
    ...p,
    x: Math.round(Math.max(0, Math.min(PLAN_LIMITS.coordMax, p.x))),
    y: Math.round(Math.max(0, Math.min(PLAN_LIMITS.coordMax, p.y))),
  };
}

/** Where an item stands now: a placement, a box or a place. */
export function standing(w: Working, id: string): Item | null {
  switch (kindOfId(id)) {
    case "box":
      return w.room.boxes.find((b) => b.id === id) ?? null;
    case "place":
      return w.room.places.find((p) => p.id === id) ?? null;
    default:
      return w.placements.find((p) => placementId(p) === id) ?? null;
  }
}

const isBox = (item: Item, id: string): item is RoomBox => kindOfId(id) === "box";
const isPlace = (item: Item, id: string): item is RoomPlace => kindOfId(id) === "place";

/** The working copy with one item changed; a box change re-snaps the doors in the same step. */
function withItem(w: Working, id: string, at: Item): Working {
  if (isBox(at, id)) {
    const boxes = w.room.boxes.map((b) => (b.id === id ? at : b));
    return { ...w, room: withDoors({ ...w.room, boxes }) };
  }
  if (isPlace(at, id)) {
    return { ...w, room: { ...w.room, places: w.room.places.map((p) => (p.id === id ? at : p)) } };
  }
  const p = at as Placement;
  return { ...w, placements: w.placements.map((q) => (placementId(q) === id ? { ...p, rotationDeg: rotateDeg(p.rotationDeg) } : q)) };
}

/** Every door back on its nearest wall, after a box changed. */
function withDoors(room: PlanRoom): PlanRoom {
  if (!room.places.some((p) => p.kind === "door")) return room;
  return { ...room, places: resnapDoors(room.places, roomShape(room.boxes)) };
}

function changed(s: EditorState, working: Working, extra: Partial<EditorState> = {}): EditorState {
  const history = [...s.history, s.working].slice(-HISTORY_MAX);
  return { ...s, working, history, dirty: true, ...extra };
}

const NUDGE: Record<NudgeDir, Px> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** The shape a drag of a place needs (a door follows its wall): worked out once per drag step from the boxes. */
let shapeCache: { boxes: readonly RoomBox[]; shape: RoomShape } | null = null;
function shapeOf(boxes: readonly RoomBox[]): RoomShape {
  if (shapeCache && shapeCache.boxes === boxes) return shapeCache.shape;
  const shape = roomShape(boxes);
  shapeCache = { boxes, shape };
  return shape;
}

/** Where a drag has taken an item, from its origin and the travel in mm. */
function dragged(s: EditorState, id: string, edge: Edge | null, origin: Item, dxMm: number, dyMm: number, marker: boolean): Item {
  if (isBox(origin, id)) {
    if (edge === "corner") return resizeCorner(origin, { x: origin.x + origin.w + dxMm, y: origin.y + origin.h + dyMm });
    if (edge === "right") return resizeEdge(origin, "right", origin.x + origin.w + dxMm);
    if (edge === "left") return resizeEdge(origin, "left", origin.x + dxMm);
    if (edge === "bottom") return resizeEdge(origin, "bottom", origin.y + origin.h + dyMm);
    if (edge === "top") return resizeEdge(origin, "top", origin.y + dyMm);
    return moveBox(origin, dxMm, dyMm);
  }
  if (isPlace(origin, id)) {
    const shape = shapeOf(s.working.room.boxes);
    if (edge === "right") return resizePlaceEdge(origin, "right", origin.x + origin.w + dxMm, shape);
    if (edge === "left") return resizePlaceEdge(origin, "left", origin.x + dxMm, shape);
    if (edge === "bottom") return resizePlaceEdge(origin, "bottom", origin.y + origin.h + dyMm, shape);
    if (edge === "top") return resizePlaceEdge(origin, "top", origin.y + dyMm, shape);
    return movePlace(origin, dxMm, dyMm, shape);
  }
  const at = { ...(origin as Placement), x: origin.x + snap6(dxMm), y: origin.y + snap6(dyMm) };
  return marker ? clampMarker(at, boundsOf(s.working.room.boxes)) : clampCentre(at);
}

const samePos = (a: Item, b: Item) =>
  a.x === b.x && a.y === b.y && (a as RoomBox).w === (b as RoomBox).w && (a as RoomBox).h === (b as RoomBox).h;

/** The neighbours a dropped machine may be pulled against: every other placed machine with a size. */
function neighboursOf(w: Working, id: string, sizeOf: (id: string) => FootprintSize | null): MagnetNeighbour[] {
  const out: MagnetNeighbour[] = [];
  for (const p of w.placements) {
    const pid = placementId(p);
    if (pid === id) continue;
    const size = sizeOf(pid);
    if (size) out.push({ id: pid, placement: p, size });
  }
  return out;
}

const placedOnly = (p: Placement): Placement => ({ ...p, rotationDeg: rotateDeg(p.rotationDeg) });

export function editorReducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case "load": {
      // Never under a finger: unsaved changes, or a drag in progress.
      if ((s.dirty || s.drag.phase !== "idle") && !a.force) return s;
      const selectedId = s.selectedId && standing(a.working, s.selectedId) ? s.selectedId : null;
      return { ...s, base: { id: a.id, rev: a.rev }, working: a.working, history: [], drag: { phase: "idle" }, dirty: !!a.dirty, selectedId };
    }
    case "tool":
      return { ...s, tool: a.tool, drag: { phase: "idle" } };
    case "select":
      return s.selectedId === a.id ? s : { ...s, selectedId: a.id };
    case "press": {
      if (s.tool === "view") return s;
      const kind = kindOfId(a.id);
      if (s.tool === "machines" && (kind === "box" || kind === "place")) return s;
      if (s.tool === "room" && (kind === "unit" || kind === "planned")) return s;
      const origin = standing(s.working, a.id);
      if (!origin) return s;
      return { ...s, selectedId: a.id, drag: { phase: "pressed", id: a.id, edge: a.edge ?? null, startPx: a.px, origin } };
    }
    case "move": {
      if (s.drag.phase === "idle") return s;
      const { id, edge, startPx, origin } = s.drag;
      const travelled = Math.hypot(a.px.x - startPx.x, a.px.y - startPx.y);
      if (s.drag.phase === "pressed" && !(travelled >= DEAD_PX)) return s;
      const at = dragged(s, id, edge, origin, (a.px.x - startPx.x) * a.mmPerPx, (a.px.y - startPx.y) * a.mmPerPx, !!a.marker);
      if (s.drag.phase === "dragging" && samePos(s.drag.at, at)) return s;
      return { ...s, drag: { phase: "dragging", id, edge, startPx, origin, at } };
    }
    case "release": {
      const d = s.drag;
      if (d.phase === "pressed") return { ...s, drag: { phase: "idle" }, selectedId: d.id };
      if (d.phase !== "dragging") return s;
      let at = d.at;
      const kind = kindOfId(d.id);
      if ((kind === "unit" || kind === "planned") && a.sizeOf) {
        const size = a.sizeOf(d.id);
        if (size) {
          const moved = magnet(at as Placement, size, neighboursOf(s.working, d.id, a.sizeOf), shapeOf(s.working.room.boxes));
          at = { ...(at as Placement), x: moved.x, y: moved.y };
        }
      }
      if (samePos(at, d.origin)) return { ...s, drag: { phase: "idle" }, selectedId: d.id };
      return changed(s, withItem(s.working, d.id, at), { drag: { phase: "idle" }, selectedId: d.id });
    }
    case "cancel":
      return s.drag.phase === "idle" ? s : { ...s, drag: { phase: "idle" } };
    case "nudge": {
      const id = s.selectedId;
      const p = id ? standing(s.working, id) : null;
      if (!id || !p) return s;
      const d = NUDGE[a.dir];
      const kind = kindOfId(id);
      let at: Item;
      if (kind === "box") at = moveBox(p as RoomBox, d.x * 304.8, d.y * 304.8);
      else if (kind === "place") at = movePlace(p as RoomPlace, d.x * SNAP_MM, d.y * SNAP_MM, shapeOf(s.working.room.boxes));
      else {
        at = { ...(p as Placement), x: Math.round(p.x + d.x * SNAP_MM), y: Math.round(p.y + d.y * SNAP_MM) };
        at = a.marker ? clampMarker(at as Placement, boundsOf(s.working.room.boxes)) : clampCentre(at as Placement);
      }
      if (samePos(at, p)) return s;
      return changed(s, withItem(s.working, id, at));
    }
    case "turn": {
      const id = s.selectedId;
      if (!id || kindOfId(id) === "box" || kindOfId(id) === "place") return s;
      const p = standing(s.working, id) as Placement | null;
      if (!p) return s;
      return changed(s, withItem(s.working, id, { ...p, rotationDeg: rotateDeg(p.rotationDeg, a.by) }));
    }
    case "toWall": {
      const id = s.selectedId;
      if (!id || !a.size || kindOfId(id) === "box" || kindOfId(id) === "place") return s;
      const p = standing(s.working, id) as Placement | null;
      if (!p) return s;
      const q = backToWall(p, a.size, shapeOf(s.working.room.boxes));
      if (q.x === p.x && q.y === p.y) return s;
      return changed(s, withItem(s.working, id, { ...p, ...q }));
    }
    case "place": {
      const id = placementId(a.at);
      if (id !== a.id) return s;
      const placements = [...s.working.placements.filter((p) => placementId(p) !== id), placedOnly(a.at)];
      const gone = s.working.gone.filter((g) => g.machineId !== id);
      return changed(s, { ...s.working, placements, gone }, { selectedId: id });
    }
    case "placeMany": {
      if (a.at.length === 0) return s;
      const ids = new Set(a.at.map(placementId));
      const placements = [...s.working.placements.filter((p) => !ids.has(placementId(p))), ...a.at.map(placedOnly)];
      const gone = s.working.gone.filter((g) => !ids.has(g.machineId));
      return changed(s, { ...s.working, placements, gone });
    }
    case "takeOff": {
      if (!s.working.placements.some((p) => placementId(p) === a.id)) return s;
      return changed(s, { ...s.working, placements: s.working.placements.filter((p) => placementId(p) !== a.id) }, { selectedId: null });
    }
    case "dropGone":
      return s.working.gone.length === 0 ? s : changed(s, { ...s.working, gone: [] });
    case "room":
      return changed(s, { ...s.working, room: a.room });
    case "practice":
      return changed(s, { room: a.room, placements: a.placements, gone: [] }, { tool: "machines", selectedId: null });
    case "firstRoom": {
      const room: PlanRoom = { areaSqFt: Math.round(a.areaSqFt), boxes: [firstBox(a.areaSqFt)], places: [] };
      return changed(s, { ...s.working, room }, { tool: "room", selectedId: room.boxes[0].id });
    }
    case "setArea": {
      const { areaSqFt: _old, ...rest } = s.working.room;
      const room: PlanRoom = a.sqFt === null ? rest : { ...rest, areaSqFt: Math.round(a.sqFt) };
      if (room.areaSqFt === s.working.room.areaSqFt) return s;
      return changed(s, { ...s.working, room });
    }
    case "addBox": {
      const { boxes } = s.working.room;
      if (boxes.length >= PLAN_LIMITS.boxes) return s;
      const sel = s.selectedId ? boxes.find((b) => b.id === s.selectedId) ?? null : null;
      const box = newBoxBeside(sel, shapeOf(boxes));
      return changed(s, { ...s.working, room: withDoors({ ...s.working.room, boxes: [...boxes, box] }) }, { selectedId: box.id });
    }
    case "removeBox": {
      const { boxes } = s.working.room;
      if (boxes.length <= PLAN_LIMITS.boxesMin || !boxes.some((b) => b.id === a.id)) return s;
      const room = withDoors({ ...s.working.room, boxes: boxes.filter((b) => b.id !== a.id) });
      return changed(s, { ...s.working, room }, { selectedId: null });
    }
    case "typedBox": {
      const b = s.working.room.boxes.find((x) => x.id === a.id);
      if (!b) return s;
      const next = typedBoxSize(b, a.wMm, a.hMm);
      if (samePos(next, b)) return s;
      return changed(s, withItem(s.working, a.id, next));
    }
    case "addPlace": {
      const place = addPlaceTo(a.kind, a.at, shapeOf(s.working.room.boxes), s.working.room.places);
      return changed(s, { ...s.working, room: { ...s.working.room, places: [...s.working.room.places, place] } }, { selectedId: place.id });
    }
    case "removePlace": {
      if (!s.working.room.places.some((p) => p.id === a.id)) return s;
      return changed(s, { ...s.working, room: { ...s.working.room, places: s.working.room.places.filter((p) => p.id !== a.id) } }, { selectedId: null });
    }
    case "label": {
      const text = a.text.trim();
      if (kindOfId(a.id) === "place") {
        const p = s.working.room.places.find((x) => x.id === a.id);
        if (!p) return s;
        const { label: _l, ...rest } = p;
        const next: RoomPlace = text ? { ...rest, label: text.slice(0, PLAN_LIMITS.label) } : rest;
        if ((next.label ?? "") === (p.label ?? "")) return s;
        return changed(s, withItem(s.working, a.id, next));
      }
      if (kindOfId(a.id) === "planned") {
        const p = s.working.placements.find((x) => isPlanned(x) && x.id === a.id) as PlannedPlacement | undefined;
        if (!p || !text || text === p.label) return s;
        return changed(s, withItem(s.working, a.id, { ...p, label: text.slice(0, PLAN_LIMITS.plannedLabel) }));
      }
      return s;
    }
    case "typedPlace": {
      const p = s.working.room.places.find((x) => x.id === a.id);
      if (!p) return s;
      const next = typedPlaceSize(p, a.wMm, a.hMm, shapeOf(s.working.room.boxes));
      if (samePos(next, p)) return s;
      return changed(s, withItem(s.working, a.id, next));
    }
    case "addPlanned": {
      if (s.working.placements.filter(isPlanned).length >= PLAN_LIMITS.planned) return s;
      if (s.working.placements.some((p) => placementId(p) === a.planned.id)) return s;
      return changed(s, { ...s.working, placements: [...s.working.placements, placedOnly(a.planned)] }, { selectedId: a.planned.id });
    }
    case "swapIn": {
      const planned = s.working.placements.find((p) => isPlanned(p) && p.id === a.plannedId) as PlannedPlacement | undefined;
      if (!planned || kindOfId(a.machineId) !== "unit") return s;
      const unit: UnitPlacement = { machineId: a.machineId, x: planned.x, y: planned.y, rotationDeg: planned.rotationDeg };
      const placements = s.working.placements
        .filter((p) => placementId(p) !== a.machineId)
        .map((p) => (isPlanned(p) && p.id === a.plannedId ? unit : p));
      const gone = s.working.gone.filter((g) => g.machineId !== a.machineId);
      return changed(s, { ...s.working, placements, gone }, { selectedId: a.machineId });
    }
    case "undo": {
      if (s.history.length === 0) return s;
      const working = s.history[s.history.length - 1];
      const selectedId = s.selectedId && standing(working, s.selectedId) ? s.selectedId : null;
      return { ...s, working, history: s.history.slice(0, -1), dirty: true, drag: { phase: "idle" }, selectedId };
    }
    case "saved":
      return { ...s, base: { id: a.id, rev: a.rev }, dirty: false };
    case "unsaved":
      return { ...s, base: { ...s.base, rev: a.rev }, dirty: true };
  }
}

/** A machine's size for the drawing and the magnet: its known size, else null (a marker). */
export type SizeOf = (id: string) => KnownSize | null;
