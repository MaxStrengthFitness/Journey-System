/**
 * OVERLAPS, QUIETLY (the studio map, Oct 2026).
 *
 * The one check the editor keeps (AJ, Oct 11 2026: "the machines need to
 * have a little room to be a little bit tighter together ... I don't want
 * it to be like a very picky builder"): where two things really occupy the
 * same floor. Only an overlap a person can see is marked, more than 6 in
 * (geometry.ts `OVERLAP_TOL_MM`): two machines, a machine and the wall, a
 * machine and a place. The three safety facts are said past 1 in: a
 * machine over the AED, over the fire extinguisher, or standing in a door's
 * swing.
 *
 * The lines are never a list on screen. The drawing marks each machine in
 * `warnIds` with a plum edge, and the selected machine's panel says that
 * machine's own lines. With nothing overlapping, nothing is said anywhere:
 * no "All clear", no count, no caveat. There is no spacing check and no
 * path check (both dropped Oct 11; design §0.3).
 *
 * A machine with no size is in no check. Places overlapping places, and
 * boxes, are never checked (a desk in a changing room is the leader's
 * business). Names are full names; lengths are feet and inches.
 *
 * `pairChecks` is the drag's: one machine against the rest, O(n).
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import { boxPoly, DEPTH_EPS_MM, footprint, OVERLAP_TOL_MM, SAFETY_TOL_MM, satDepth, wallDepth } from "./geometry";
import { PLACE_WORDS, type Placement, type PlanPoint, type RoomPlace } from "./layout";
import { doorIsVertical, inRoom, type RoomShape } from "./room";
import { lengthWords } from "./units";

/** More than the tolerance, past floating-point dust. */
const over = (depth: number, tol: number) => depth > tol + DEPTH_EPS_MM;

export type CheckKind = "machine" | "wall" | "place";
export interface CheckLine {
  kind: CheckKind;
  text: string;
  ids: string[];
}

export interface CheckMachine {
  id: string;
  name: string;
  placement: Placement;
  size: KnownSize | null;
  /** A machine still to buy, on a draft: named "{label} (to buy)". */
  planned: boolean;
}

export interface CheckInput {
  shape: RoomShape;
  places: readonly RoomPlace[];
  placed: readonly CheckMachine[];
}

/** A place's shape. */
export function placePoly(p: RoomPlace): PlanPoint[] {
  return boxPoly(p);
}

/**
 * The square a door sweeps: its width along the wall, and the same into the
 * room. Worked out from the wall, never stored. A door not on a wall (only a
 * bad write) sweeps nothing but itself.
 */
export function doorSwing(door: RoomPlace, shape: RoomShape): PlanPoint[] {
  if (doorIsVertical(door)) {
    const wx = door.x + door.w / 2;
    const midY = door.y + door.h / 2;
    const along = door.h;
    if (inRoom({ x: wx + 10, y: midY }, shape)) return boxPoly({ x: wx, y: door.y, w: along, h: along });
    if (inRoom({ x: wx - 10, y: midY }, shape)) return boxPoly({ x: wx - along, y: door.y, w: along, h: along });
    return placePoly(door);
  }
  const wy = door.y + door.h / 2;
  const midX = door.x + door.w / 2;
  const along = door.w;
  if (inRoom({ x: midX, y: wy + 10 }, shape)) return boxPoly({ x: door.x, y: wy, w: along, h: along });
  if (inRoom({ x: midX, y: wy - 10 }, shape)) return boxPoly({ x: door.x, y: wy - along, w: along, h: along });
  return placePoly(door);
}

const nameOf = (m: CheckMachine) => (m.planned ? `${m.name} (to buy)` : m.name);

/** "the desk", "the changing room"; a leader's own label as written ("Men's changing room"). */
function placeWords(p: RoomPlace): string {
  const label = p.label?.trim();
  if (label && label !== PLACE_WORDS[p.kind]) return label;
  return `the ${PLACE_WORDS[p.kind].toLowerCase()}`;
}

interface Shape {
  m: CheckMachine;
  poly: PlanPoint[];
}

/** What one machine overlaps among the places and the walls: its lines. */
function roomLines(me: Shape, input: CheckInput, out: CheckLine[]): void {
  const wd = wallDepth(me.poly, input.shape);
  if (over(wd, OVERLAP_TOL_MM)) out.push({ kind: "wall", text: `Goes ${lengthWords(wd)} into the wall.`, ids: [me.m.id] });
  for (const p of input.places) {
    if (p.kind === "door") {
      if (over(satDepth(me.poly, doorSwing(p, input.shape)), SAFETY_TOL_MM)) {
        out.push({ kind: "place", text: "Stands in the doorway.", ids: [me.m.id] });
      }
      continue;
    }
    const d = satDepth(me.poly, placePoly(p));
    if (p.kind === "aed" || p.kind === "extinguisher") {
      if (over(d, SAFETY_TOL_MM)) {
        out.push({ kind: "place", text: p.kind === "aed" ? "Covers the AED." : "Covers the fire extinguisher.", ids: [me.m.id] });
      }
      continue;
    }
    if (over(d, OVERLAP_TOL_MM)) out.push({ kind: "place", text: `Overlaps ${placeWords(p)} by ${lengthWords(d)}.`, ids: [me.m.id] });
  }
}

/**
 * Every overlap a person can see, as each machine's own lines: "Overlaps
 * the Leg Press by 8 in." (the selected machine isn't named), "Goes 7 in
 * into the wall.", "Stands in the doorway.", "Covers the AED.". Two
 * machines that overlap each carry a line naming the other.
 */
export function overlapChecks(input: CheckInput): { linesById: Map<string, CheckLine[]>; warnIds: Set<string> } {
  const shapes: Shape[] = input.placed.filter((m) => m.size).map((m) => ({ m, poly: footprint(m.placement, m.size!) }));
  const linesById = new Map<string, CheckLine[]>();
  const add = (id: string, line: CheckLine) => {
    const list = linesById.get(id);
    if (list) list.push(line);
    else linesById.set(id, [line]);
  };
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const d = satDepth(shapes[i].poly, shapes[j].poly);
      if (!over(d, OVERLAP_TOL_MM)) continue;
      const ids = [shapes[i].m.id, shapes[j].m.id];
      add(shapes[i].m.id, { kind: "machine", text: `Overlaps the ${nameOf(shapes[j].m)} by ${lengthWords(d)}.`, ids });
      add(shapes[j].m.id, { kind: "machine", text: `Overlaps the ${nameOf(shapes[i].m)} by ${lengthWords(d)}.`, ids });
    }
    const own: CheckLine[] = [];
    roomLines(shapes[i], input, own);
    for (const l of own) add(shapes[i].m.id, l);
  }
  return { linesById, warnIds: new Set(linesById.keys()) };
}

/** The drag's check: the dragged machine against the others, the walls and the places. */
export function pairChecks(input: CheckInput, draggedId: string): { warnIds: Set<string> } {
  const warnIds = new Set<string>();
  const me = input.placed.find((m) => m.id === draggedId);
  if (!me || !me.size) return { warnIds };
  const poly = footprint(me.placement, me.size);
  for (const other of input.placed) {
    if (other.id === draggedId || !other.size) continue;
    if (over(satDepth(poly, footprint(other.placement, other.size)), OVERLAP_TOL_MM)) {
      warnIds.add(draggedId);
      warnIds.add(other.id);
    }
  }
  const own: CheckLine[] = [];
  roomLines({ m: me, poly }, input, own);
  if (own.length > 0) warnIds.add(draggedId);
  return { warnIds };
}
