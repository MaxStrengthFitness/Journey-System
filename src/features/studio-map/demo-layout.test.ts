import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { KnownSize } from "../../types/machines";
import { overlapChecks } from "./checks";
import { IMAGINE_STRENGTH_MODELS } from "./imagine-strength";
import { planProblems, readPlan, planDocument, LAYOUT_NAME, CURRENT_ID } from "./layout";
import { practiceLayout, practiceRoom } from "./demo-layout";
import { roomShape, snapDoor } from "./room";

const sizes = new Map<string, KnownSize>(IMAGINE_STRENGTH_MODELS.map((m) => [m.movementId, { lengthMm: m.lengthMm, widthMm: m.widthMm, heightMm: m.heightMm }]));
const machines = Object.keys(MACHINE_DEFINITIONS).map((id) => ({ machineId: id, basedOn: id }));

describe("the practice layout", () => {
  const { room, placements } = practiceLayout(machines, (id) => sizes.get(id) ?? null);
  const shape = roomShape(room.boxes);

  it("is 1,800 sq ft in one 60 × 30 ft box, with its door, desk, pillar, AED and fire extinguisher", () => {
    expect(room.areaSqFt).toBe(1800);
    expect(room.boxes).toHaveLength(1);
    expect(room.places.map((p) => p.kind).sort()).toEqual(["aed", "desk", "door", "extinguisher", "pillar"]);
    expect(room.places.find((p) => p.kind === "pillar")!.label).toBeUndefined();
  });

  it("puts the door on a wall (snapping leaves it as it is), and the AED and the extinguisher against one", () => {
    const door = room.places.find((p) => p.kind === "door")!;
    expect(snapDoor(door, shape)).toEqual(door);
    for (const kind of ["aed", "extinguisher"] as const) {
      const p = room.places.find((x) => x.kind === kind)!;
      const toWall = Math.min(p.x, p.y, shape.bbox.x1 - (p.x + p.w), shape.bbox.y1 - (p.y + p.h));
      expect(toWall, kind).toBeLessThanOrEqual(1);
    }
  });

  it("places the twenty with nothing overlapping", () => {
    expect(placements).toHaveLength(20);
    const r = overlapChecks({
      shape,
      places: room.places,
      placed: placements.map((p) => {
        const id = (p as { machineId: string }).machineId;
        return { id, name: id, placement: p, size: sizes.get(id)!, planned: false };
      }),
    });
    expect([...r.linesById.entries()]).toEqual([]);
  });

  it("is a layout the store would write, and reads back whole", () => {
    expect(planProblems({ name: LAYOUT_NAME, room, placements }, { planId: CURRENT_ID })).toEqual([]);
    const doc = planDocument({ room, placements }, LAYOUT_NAME, 1, "uid", null);
    const back = readPlan(doc, { planId: CURRENT_ID })!;
    expect(back.dropped).toBe(0);
    expect(back.plan.room).toEqual(practiceRoom());
  });
});
