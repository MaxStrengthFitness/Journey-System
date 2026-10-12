/**
 * THE PRACTICE LAYOUT (the studio map, Oct 2026): Demo Mode's one-tap room.
 *
 * The prototype's floor in the room builder's shape: 1,800 sq ft, one box
 * of 60 × 30 ft, and its places: a 3 ft door on the left wall (22 to 25 ft
 * from the top), the AED on that wall beside the door, the front desk in
 * the bottom-left corner, the fire extinguisher on the bottom wall by the
 * desk, and a pillar out on the floor (AJ's word, "a pillar here"). The
 * twenty run along the walls in the prototype's order. Machines are found
 * by their MSF movement (`basedOn`), so it works for any floor running the
 * twenty; anything else stays Not placed yet.
 *
 * Only the editor's "Start from the practice layout" button uses it, in
 * Demo Mode, through the ordinary store: Demo Mode's seed never writes a
 * layout (the floorPlans rule pins the writer and the server's time).
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import { PLAN_LIMITS, type Placement, type PlanRoom } from "./layout";
import { MARKER_MM } from "./sizes";

export const PRACTICE_ROOM_W = 18288; // 60 ft
export const PRACTICE_ROOM_L = 9144; // 30 ft
export const PRACTICE_SQFT = 1800;

type Wall = "top" | "right" | "bottom" | "left";
/** [movement, the free floor before it along the wall, mm]. */
type Row = readonly (readonly [string, number])[];

const ROWS: readonly (readonly [Wall, Row])[] = [
  [
    "top",
    [
      ["m-compound-row", 700],
      ["m-pulldown", 762],
      ["m-pullover", 762],
      ["m-simple-row", 762],
      ["m-chest-press", 762],
      ["m-overhead-press", 762],
      ["m-lateral-raise", 762],
      ["m-chest-fly", 762],
      ["m-dip", 762],
    ],
  ],
  [
    "right",
    [
      ["m-hip-abd", 2400],
      ["m-hip-add", 700],
      ["m-torso-rotation", 700],
    ],
  ],
  [
    "bottom",
    [
      ["m-leg-press", 4200],
      ["m-lumbar", 407],
      ["m-ext", 800],
      ["m-leg-curl", 800],
      ["m-abs", 800],
      ["m-neck", 800],
    ],
  ],
  [
    "left",
    [
      ["m-bicep", 3000],
      ["m-tricep-ext", 792],
    ],
  ],
];

const DOOR_DEPTH = PLAN_LIMITS.doorDepth;
const MARKER = PLAN_LIMITS.markerMm;

export function practiceRoom(): PlanRoom {
  return {
    areaSqFt: PRACTICE_SQFT,
    boxes: [{ id: "bx-1", x: 0, y: 0, w: PRACTICE_ROOM_W, h: PRACTICE_ROOM_L }],
    places: [
      // A 3 ft door on the left wall, 22 to 25 ft from the top, straddling the wall.
      { id: "pc-1", kind: "door", x: -DOOR_DEPTH / 2, y: 6706, w: DOOR_DEPTH, h: 914 },
      // The AED on the left wall, just above the door.
      { id: "pc-2", kind: "aed", x: 0, y: 6706 - MARKER - 150, w: MARKER, h: MARKER },
      // The front desk, 6 ft 11 in × 2 ft 4 in, in the bottom-left corner.
      { id: "pc-3", kind: "desk", label: "Front desk", x: 1196, y: PRACTICE_ROOM_L - 711, w: 2108, h: 711 },
      // The fire extinguisher on the bottom wall, by the desk.
      { id: "pc-4", kind: "extinguisher", x: 3500, y: PRACTICE_ROOM_L - MARKER, w: MARKER, h: MARKER },
      // A 1 ft 4 in pillar out on the floor, its centre at 40 ft by 15 ft.
      { id: "pc-5", kind: "pillar", x: 12192 - 203, y: 4572 - 203, w: 406, h: 406 },
    ],
  };
}

/**
 * The practice layout for these machines: the room, and a spot for each
 * of the twenty movements' first unit on the floor (by walking order).
 */
export function practiceLayout(
  machines: readonly { machineId: string; basedOn: string | null }[],
  sizeOf: (machineId: string) => KnownSize | null,
): { room: PlanRoom; placements: Placement[] } {
  const room = practiceRoom();
  const byMovement = new Map<string, string>();
  for (const m of machines) if (m.basedOn && !byMovement.has(m.basedOn)) byMovement.set(m.basedOn, m.machineId);
  const placements: Placement[] = [];
  for (const [wall, row] of ROWS) {
    let pos = 0;
    for (const [movement, before] of row) {
      const id = byMovement.get(movement);
      if (!id) {
        pos += before;
        continue;
      }
      const s = sizeOf(id);
      const w = s?.widthMm ?? MARKER_MM;
      const l = s?.lengthMm ?? MARKER_MM;
      pos += before;
      const along = Math.round(pos + w / 2);
      const half = Math.ceil(l / 2);
      const p: Placement =
        wall === "top"
          ? { machineId: id, x: along, y: half, rotationDeg: 0 }
          : wall === "bottom"
            ? { machineId: id, x: along, y: PRACTICE_ROOM_L - half, rotationDeg: 180 }
            : wall === "left"
              ? { machineId: id, x: half, y: along, rotationDeg: 270 }
              : { machineId: id, x: PRACTICE_ROOM_W - half, y: along, rotationDeg: 90 };
      placements.push(p);
      pos += w;
    }
  }
  return { room, placements };
}
