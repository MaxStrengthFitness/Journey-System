import { describe, expect, it } from "vitest";
import { planProblems, type Placement, type PlannedPlacement, type PlanRoom, type RoomBox, type RoomPlace } from "./layout";
import { dragStep, editorReducer, emptyWorking, HISTORY_MAX, initialEditor, kindOfId, type Action, type Edge, type EditorState } from "./placement";
import { ftMm, snapDoor, roomShape } from "./room";

const IN = 25.4;
const SIZE = { lengthMm: 1000, widthMm: 1000 };
const box: RoomBox = { id: "bx-1", x: 0, y: 0, w: ftMm(60), h: ftMm(30) };
const room = (over: Partial<PlanRoom> = {}): PlanRoom => ({ areaSqFt: 1800, boxes: [box], places: [], ...over });
const unit = (machineId: string, x: number, y: number, rotationDeg = 0): Placement => ({ machineId, x, y, rotationDeg });

function state(placements: Placement[] = [], r: PlanRoom = room(), tool: EditorState["tool"] = "machines"): EditorState {
  return { ...initialEditor({ id: "current", rev: 3 }, { ...emptyWorking(r), placements }), tool };
}
const run = (s: EditorState, ...actions: Action[]) => actions.reduce(editorReducer, s);
const at = (s: EditorState, id: string) => s.working.placements.find((p) => ("machineId" in p ? p.machineId : (p as PlannedPlacement).id) === id)!;
const sizeOf = (id: string) => (id.startsWith("m-") || id.startsWith("pm-") ? SIZE : null);

/** Press, move by (dx, dy) screen px, release. */
const drag = (id: string, dx: number, dy: number, mmPerPx = 1, edge: Edge | null = null): Action[] => [
  { type: "press", id, px: { x: 0, y: 0 }, edge },
  { type: "move", px: { x: dx, y: dy }, mmPerPx },
  { type: "release", sizeOf },
];

describe("ids", () => {
  it("say what they name", () => {
    expect(kindOfId("bx-2")).toBe("box");
    expect(kindOfId("pc-a")).toBe("place");
    expect(kindOfId("pm-3")).toBe("planned");
    expect(kindOfId("m-leg-press")).toBe("unit");
  });
});

describe("a machine's drag", () => {
  it("moves nothing for 7 px of travel, and moves at 8", () => {
    expect(dragStep({ x: 0, y: 0 }, 7, 300, 0)).toBeNull();
    const s = run(state([unit("m-a", 5000, 5000)]), { type: "press", id: "m-a", px: { x: 0, y: 0 } }, { type: "move", px: { x: 7, y: 0 }, mmPerPx: 50 });
    expect(s.drag.phase).toBe("pressed");
    const t = run(s, { type: "move", px: { x: 8, y: 0 }, mmPerPx: 50 });
    expect(t.drag.phase).toBe("dragging");
  });

  it("snaps the movement to 6 in: 100 mm is 152", () => {
    const s = run(state([unit("m-a", 5000, 5000)]), ...drag("m-a", 100, 0, 1).slice(0, 2));
    // 100 px at 1 mm/px is under the dead zone in mm but over it in px.
    expect(s.drag.phase === "dragging" && s.drag.at.x).toBe(5152);
  });

  // m-b's left edge is at 6000; m-a is 1000 wide and is dragged 6 in down, so it still faces m-b.
  it.each([
    ["5 in short of it", -5 * IN],
    ["4 in into it", 4 * IN],
  ])("slides flush onto a neighbour it ended %s, in one Undo step", (_, off) => {
    const s0 = state([unit("m-a", Math.round(5500 + off), 5000), unit("m-b", 6500, 5000)]);
    const s = run(s0, ...drag("m-a", 0, 152.4));
    expect(s.history.length).toBe(1);
    expect(at(s, "m-a").x + 500).toBe(6000);
  });

  it("leaves one dropped 8 in away where it landed", () => {
    const s0 = state([unit("m-a", Math.round(5500 - 8 * IN), 5000), unit("m-b", 6500, 5000)]);
    const s = run(s0, ...drag("m-a", 0, 152.4));
    expect(at(s, "m-a").x).toBe(Math.round(5500 - 8 * IN));
  });

  it("never magnetises a machine at 15°", () => {
    const s0 = state([unit("m-a", Math.round(5500 - 4 * IN), 5000, 15), unit("m-b", 6500, 5000)]);
    const s = run(s0, ...drag("m-a", 0, 152.4));
    expect(at(s, "m-a").x).toBe(Math.round(5500 - 4 * IN));
  });

  it("skips a slide that would push it 7 in into a third machine", () => {
    // After the drag m-a spans y 4652-5652. m-b (5152-6152) faces it; m-c
    // (x 5758-6758, y 3852-4852) is 140 mm into its corner now, and would be
    // 242 × 200 mm into it once flush on m-b.
    const s0 = state([unit("m-a", 5398, 5000), unit("m-b", 6500, 5652), unit("m-c", 6258, 4352)]);
    const s = run(s0, ...drag("m-a", 0, 152.4));
    expect(at(s, "m-a").x).toBe(5398);
  });

  it("is exact on a Fine moves nudge, and never pulled back to the wall", () => {
    const s0 = run(state([unit("m-a", 3000, 500)]), { type: "select", id: "m-a" });
    const s = run(s0, { type: "nudge", dir: "down" });
    expect(at(s, "m-a").y).toBe(Math.round(500 + 152.4));
  });

  it("never leaves a copy Save refuses: nudged or dragged past the left or top wall, its centre stops at the plan's edge", () => {
    const problems = (s: EditorState) => planProblems({ name: "The layout", room: s.working.room, placements: s.working.placements }, { planId: "current" });
    let s = run(state([unit("m-a", 400, 800)]), { type: "select", id: "m-a" });
    for (let i = 0; i < 6; i++) s = run(s, { type: "nudge", dir: "left" });
    expect(at(s, "m-a").x).toBe(0);
    expect(problems(s)).toEqual([]);
    // A drag of -100 px at 10 mm/px, from y 800.
    const d = run(state([unit("m-a", 3000, 800)]), ...drag("m-a", 0, -100, 10));
    expect(at(d, "m-a").y).toBeGreaterThanOrEqual(0);
    expect(problems(d)).toEqual([]);
  });

  it("keeps a place inside the plan however far it is moved", () => {
    const s0 = run(state([], room(), "room"), { type: "addPlace", kind: "desk", at: { x: 3000, y: 3000 } });
    const id = s0.working.room.places[0].id;
    const s = run(s0, ...drag(id, 70_000, 70_000));
    const desk = s.working.room.places[0];
    expect(desk.x + desk.w).toBeLessThanOrEqual(60_960);
    expect(desk.y + desk.h).toBeLessThanOrEqual(60_960);
    expect(planProblems({ name: "The layout", room: s.working.room, placements: [] }, { planId: "current" })).toEqual([]);
  });

  it("turns about the centre and goes back to the wall", () => {
    const s0 = run(state([unit("m-a", 3000, 3000)]), { type: "select", id: "m-a" });
    expect(at(run(s0, { type: "turn", by: -90 }), "m-a").rotationDeg).toBe(270);
    expect(at(run(s0, { type: "toWall", size: SIZE }), "m-a").y).toBe(500);
    expect(run(s0, { type: "toWall", size: null })).toBe(s0);
  });

  it("swaps a machine still to buy for the real one at the same spot and turn; takes one off", () => {
    const p: PlannedPlacement = { kind: "planned", id: "pm-1", label: "Hip Abductor", movementId: "m-hip-abd", modelId: null, x: 4000, y: 4100, rotationDeg: 90 };
    const s0 = run(state([]), { type: "addPlanned", planned: p });
    const s = run(s0, { type: "swapIn", plannedId: "pm-1", machineId: "m-hip-abd" });
    expect(s.working.placements).toEqual([{ machineId: "m-hip-abd", x: 4000, y: 4100, rotationDeg: 90 }]);
    expect(run(s0, { type: "takeOff", id: "pm-1" }).working.placements).toEqual([]);
  });
});

describe("the room tool", () => {
  it("draws the first box from the square footage and opens the room tool", () => {
    const s = run(initialEditor({ id: "current", rev: null }, emptyWorking({ boxes: [], places: [] })), { type: "firstRoom", areaSqFt: 1800 });
    expect(s.working.room.boxes.map((b) => [Math.round(b.w / 304.8), Math.round(b.h / 304.8)])).toEqual([[60, 30]]);
    expect(s.working.room.areaSqFt).toBe(1800);
    expect(s.tool).toBe("room");
    expect(s.dirty).toBe(true);
  });

  it("lands a box dragged 1 ft 4 in exactly 1 ft over", () => {
    const s = run(state([], room({ boxes: [box, { id: "bx-2", x: ftMm(60), y: 0, w: ftMm(10), h: ftMm(10) }] }), "room"), ...drag("bx-2", 16 * IN, 0));
    expect(s.working.room.boxes[1].x).toBe(ftMm(61));
  });

  it("stops an edge dragged to 1 ft 7 in from the opposite edge at 2 ft; the corner handle grows both ways", () => {
    const b2: RoomBox = { id: "bx-2", x: ftMm(60), y: 0, w: ftMm(10), h: ftMm(10) };
    const s = run(state([], room({ boxes: [box, b2] }), "room"), ...drag("bx-2", -(ftMm(10) - 19 * IN), 0, 1, "right"));
    expect(s.working.room.boxes[1].w).toBe(ftMm(62) - ftMm(60));
    const c = run(state([], room({ boxes: [box, b2] }), "room"), ...drag("bx-2", ftMm(5), ftMm(3), 1, "corner"));
    expect([c.working.room.boxes[1].w, c.working.room.boxes[1].h]).toEqual([ftMm(75) - ftMm(60), ftMm(13)]);
  });

  it("never removes the last box", () => {
    const s = state([], room(), "room");
    expect(run(s, { type: "removeBox", id: "bx-1" })).toBe(s);
  });

  it("puts a door back on its wall when the box under it shrinks, and one Undo restores both", () => {
    const door: RoomPlace = snapDoor({ id: "pc-1", kind: "door", x: ftMm(59), y: ftMm(10), w: 152, h: ftMm(3) }, roomShape([box]));
    const s0 = state([], room({ places: [door] }), "room");
    const s1 = run(s0, ...drag("bx-1", -ftMm(10), 0, 1, "right"));
    expect(s1.working.room.boxes[0].w).toBe(ftMm(50));
    const moved = s1.working.room.places[0];
    expect(moved.x + moved.w / 2).toBe(ftMm(50));
    const back = run(s1, { type: "undo" });
    expect(back.working.room).toEqual(s0.working.room);
  });

  it("adds a door on the nearest wall of a two-box L, selected", () => {
    const L = room({ boxes: [{ id: "bx-1", x: 0, y: 0, w: ftMm(20), h: ftMm(10) }, { id: "bx-2", x: 0, y: ftMm(10), w: ftMm(10), h: ftMm(10) }] });
    const s = run(state([], L, "room"), { type: "addPlace", kind: "door", at: { x: ftMm(15), y: ftMm(10) + 300 } });
    const d = s.working.room.places[0];
    expect(d.y + d.h / 2).toBe(ftMm(10));
    expect(s.selectedId).toBe(d.id);
  });

  it("labels a place, and an empty label gives back the kind's word", () => {
    const s0 = run(state([], room(), "room"), { type: "addPlace", kind: "changing", at: { x: 3000, y: 3000 } });
    const id = s0.working.room.places[0].id;
    const named = run(s0, { type: "label", id, text: "Men's changing room" });
    expect(named.working.room.places[0].label).toBe("Men's changing room");
    expect(run(named, { type: "label", id, text: "  " }).working.room.places[0]).not.toHaveProperty("label");
  });

  it("a press in the room tool never takes a machine, and in the machines tool never a box", () => {
    const s = state([unit("m-a", 3000, 3000)], room(), "room");
    expect(run(s, { type: "press", id: "m-a", px: { x: 0, y: 0 } }).drag.phase).toBe("idle");
    const t = state([unit("m-a", 3000, 3000)], room(), "machines");
    expect(run(t, { type: "press", id: "bx-1", px: { x: 0, y: 0 } }).drag.phase).toBe("idle");
  });
});

describe("Undo and loading", () => {
  it("keeps the last 20", () => {
    let s = run(state([unit("m-a", 3000, 3000)]), { type: "select", id: "m-a" });
    for (let i = 0; i < 21; i++) s = run(s, { type: "turn", by: 15 });
    expect(s.history).toHaveLength(HISTORY_MAX);
  });

  it("ignores a copy the listener brings while there are changes, unless forced", () => {
    const s = run(state([unit("m-a", 3000, 3000)]), { type: "select", id: "m-a" }, { type: "turn", by: 90 });
    const other = { ...emptyWorking(room()), placements: [unit("m-z", 1, 1)] };
    expect(run(s, { type: "load", id: "current", rev: 9, working: other })).toBe(s);
    const forced = run(s, { type: "load", id: "current", rev: 9, working: other, force: true });
    expect(forced.working).toBe(other);
    expect(forced.dirty).toBe(false);
    expect(forced.base.rev).toBe(9);
  });

  it("a save that didn't land is unsaved work again at the rev it was opened at, the copy untouched", () => {
    const s = run(state([unit("m-a", 3000, 3000)]), { type: "select", id: "m-a" }, { type: "turn", by: 90 }, { type: "saved", id: "current", rev: 4 });
    expect([s.dirty, s.base.rev]).toEqual([false, 4]);
    const back = run(s, { type: "unsaved", rev: 3 });
    expect([back.dirty, back.base.rev]).toEqual([true, 3]);
    expect(back.working).toBe(s.working);
  });
});
