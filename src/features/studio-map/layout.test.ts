import { describe, expect, it } from "vitest";
import {
  CURRENT_ID,
  DRAFT_SLOTS,
  draftNames,
  freeSlot,
  isPlanned,
  LAYOUT_NAME,
  loadedPlanOf,
  planDocument,
  planProblems,
  PLAN_LIMITS,
  readPlan,
  reconcile,
  restoreOps,
  retireOps,
  undoUseLayoutOps,
  useLayoutOps,
  type LoadedPlan,
  type Placement,
  type PlannedPlacement,
  type PlanRoom,
  type RoomPlace,
} from "./layout";

const FT = 304.8;
const ft = (n: number) => Math.round(n * FT);
const ROOM: PlanRoom = {
  areaSqFt: 1800,
  boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(60), h: ft(30) }],
  places: [
    { id: "pc-1", kind: "door", x: -76, y: ft(22), w: 152, h: ft(3) },
    { id: "pc-2", kind: "aed", x: 0, y: ft(20), w: 305, h: 305 },
  ],
};
const unit = (machineId: string, x = 3000, y = 3000): Placement => ({ machineId, x, y, rotationDeg: 0 });
const planned = (id: string, over: Partial<PlannedPlacement> = {}): PlannedPlacement => ({
  kind: "planned",
  id,
  label: "Hip Abductor",
  movementId: "m-hip-abd",
  modelId: null,
  x: 5000,
  y: 5000,
  rotationDeg: 0,
  ...over,
});
const stored = (over: Record<string, unknown> = {}) => ({
  v: 1,
  name: "The layout",
  room: ROOM,
  placements: [unit("m-leg-press"), unit("m-lumbar", 6000)],
  rev: 3,
  updatedAt: null,
  updatedBy: "uid-aj",
  ...over,
});

/** Every value in a written object, deep, so an undefined anywhere is caught. */
const undefinedIn = (v: unknown): boolean =>
  v === undefined || (v !== null && typeof v === "object" && Object.values(v as Record<string, unknown>).some(undefinedIn));

describe("reading a stored layout without trusting it", () => {
  it("reads a good one, a door straddling the wall at 0 included", () => {
    const r = readPlan(stored(), { planId: CURRENT_ID })!;
    expect(r.dropped).toBe(0);
    expect(r.plan.room.places.map((p) => p.id)).toEqual(["pc-1", "pc-2"]);
    expect(r.plan.room.areaSqFt).toBe(1800);
  });

  it("is null without a version, a room, a usable box or a rev", () => {
    expect(readPlan(stored({ v: 2 }), { planId: CURRENT_ID })).toBeNull();
    expect(readPlan(stored({ room: undefined }), { planId: CURRENT_ID })).toBeNull();
    expect(readPlan(stored({ room: { boxes: [], places: [] } }), { planId: CURRENT_ID })).toBeNull();
    expect(readPlan(stored({ room: { boxes: [{ id: "bx-1", x: "0", y: 0, w: 1000, h: 1000 }], places: [] } }), { planId: CURRENT_ID })).toBeNull();
    expect(readPlan(stored({ rev: "3" }), { planId: CURRENT_ID })).toBeNull();
  });

  it("drops and counts junk: NaN, a string, a 13th box, an unknown place, the 41st place, the 9th door", () => {
    const boxes = Array.from({ length: 13 }, (_, i) => ({ id: `bx-${i + 1}`, x: 0, y: 0, w: 1000, h: 1000 }));
    const places = [
      { id: "pc-x", kind: "trampoline", x: 0, y: 0, w: 1000, h: 1000 },
      { id: "pc-n", kind: "desk", x: NaN, y: 0, w: 1000, h: 1000 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `pc-d${i}`, kind: "door", x: -76, y: 1000 * i, w: 152, h: 914 })),
      ...Array.from({ length: 33 }, (_, i) => ({ id: `pc-p${i}`, kind: "pillar", x: 100 * i, y: 100, w: 300, h: 300 })),
    ];
    const r = readPlan(stored({ room: { boxes, places } }), { planId: CURRENT_ID })!;
    expect(r.plan.room.boxes).toHaveLength(12);
    expect(r.plan.room.places.filter((p) => p.kind === "door")).toHaveLength(8);
    expect(r.plan.room.places).toHaveLength(40);
    // 1 box, the trampoline, the NaN desk, the 9th door, and the pillars past 40.
    expect(r.dropped).toBe(1 + 2 + 1 + (8 + 33 - 40));
  });

  it("keeps 120 placements and the first of a machine placed twice; drops a path-shaped or a 7,000-character id", () => {
    const many = Array.from({ length: 200 }, (_, i) => unit(`m-${i}`));
    expect(readPlan(stored({ placements: many }), { planId: CURRENT_ID })!.plan.placements).toHaveLength(120);
    const r = readPlan(
      stored({ placements: [unit("m-leg-press", 1000), unit("m-leg-press", 2000), unit("studios/x/roster/y"), unit("a".repeat(7000))] }),
      { planId: CURRENT_ID },
    )!;
    expect(r.plan.placements).toEqual([unit("m-leg-press", 1000)]);
    expect(r.dropped).toBe(3);
  });

  it("drops every machine still to buy read from the layout itself, and keeps them on a draft", () => {
    const doc = stored({ placements: [unit("m-leg-press"), planned("pm-1")] });
    const live = readPlan(doc, { planId: CURRENT_ID })!;
    expect(live.plan.placements.some(isPlanned)).toBe(false);
    expect(live.dropped).toBe(1);
    const draft = readPlan(doc, { planId: "d-1" })!;
    expect(draft.plan.placements.filter(isPlanned)).toHaveLength(1);
  });

  it("reads a 5,000-character place label as the kind's word, and drops a planned machine with a long label or a path for a model", () => {
    const r = readPlan(
      stored({
        room: { ...ROOM, places: [{ id: "pc-1", kind: "desk", x: 0, y: 0, w: 1000, h: 600, label: "x".repeat(5000) }] },
        placements: [planned("pm-1", { label: "y".repeat(61) }), planned("pm-2", { modelId: "../machineModels/x" }), planned("pm-3")],
      }),
      { planId: "d-2" },
    )!;
    expect(r.plan.room.places[0].label).toBeUndefined();
    expect(r.plan.placements.map((p) => (p as PlannedPlacement).id)).toEqual(["pm-3"]);
    expect(r.dropped).toBe(2);
  });

  it("reads a square footage out of range as absent, and the AED as 1 ft whatever was stored", () => {
    const r = readPlan(
      stored({ room: { ...ROOM, areaSqFt: 150, places: [{ id: "pc-2", kind: "aed", x: 0, y: 0, w: 2000, h: 2000 }] } }),
      { planId: CURRENT_ID },
    )!;
    expect(r.plan.room.areaSqFt).toBeUndefined();
    expect(r.plan.room.places[0]).toMatchObject({ w: 305, h: 305 });
    expect(r.dropped).toBe(0);
  });
});

describe("what may be written", () => {
  const plan = (over: Partial<{ name: string; room: PlanRoom; placements: Placement[] }> = {}) => ({
    name: LAYOUT_NAME,
    room: ROOM,
    placements: [unit("m-leg-press")],
    ...over,
  });

  it("a good layout has no problem", () => {
    expect(planProblems(plan(), { planId: CURRENT_ID })).toEqual([]);
  });

  it("never a machine still to buy on the layout itself; up to 30 on a draft", () => {
    expect(planProblems(plan({ placements: [planned("pm-1")] }), { planId: CURRENT_ID })).toEqual([
      "A machine still to buy goes on a draft, not the layout.",
    ]);
    expect(planProblems(plan({ placements: [planned("pm-1")] }), { planId: "d-1" })).toEqual([]);
    const thirtyOne = Array.from({ length: 31 }, (_, i) => planned(`pm-${i}`));
    expect(planProblems(plan({ placements: thirtyOne }), { planId: "d-1" })).toContain("A draft holds up to 30 machines still to buy.");
  });

  it("says each cap in plain words", () => {
    expect(planProblems(plan({ room: { ...ROOM, boxes: [] } }), { planId: CURRENT_ID })).toContain("A room has 1 to 12 boxes.");
    expect(planProblems(plan({ room: { ...ROOM, boxes: [{ id: "bx-1", x: 0, y: 0, w: 300, h: 3000 }] } }), { planId: CURRENT_ID })).toContain(
      "A box is 2 ft or more on each side.",
    );
    const doors: RoomPlace[] = Array.from({ length: 9 }, (_, i) => ({ id: `pc-${i}`, kind: "door", x: -76, y: 1000 * i, w: 152, h: 914 }));
    expect(planProblems(plan({ room: { ...ROOM, places: doors } }), { planId: CURRENT_ID })).toContain("A room has up to 8 doors.");
    expect(planProblems(plan({ placements: [unit("m-a"), unit("m-a")] }), { planId: CURRENT_ID })).toContain("A machine is placed twice.");
    expect(planProblems(plan({ placements: [unit("m-a", -10)] }), { planId: CURRENT_ID })).toContain(
      "Everything on the layout is within 200 ft of the corner.",
    );
    expect(planProblems(plan({ room: { ...ROOM, areaSqFt: 150 } }), { planId: CURRENT_ID })).toContain("The studio's size is 200 to 20,000 sq ft.");
  });

  it("refuses a document over 64 KB", () => {
    const heavy = Array.from({ length: 120 }, (_, i) => unit(`m-${"x".repeat(180)}-${i}`));
    expect(planProblems(plan({ placements: heavy }), { planId: CURRENT_ID })).toEqual([]);
    const places: RoomPlace[] = Array.from({ length: 40 }, (_, i) => ({ id: `pc-${i}`, kind: "desk", x: 0, y: 0, w: 1000, h: 1000, label: "l".repeat(40) }));
    const huge = { ...plan({ placements: heavy, room: { ...ROOM, places } }), name: "n".repeat(60) };
    const bytes = JSON.stringify(huge).length;
    expect(bytes).toBeLessThan(PLAN_LIMITS.bytes);
    const boxes = Array.from({ length: 12 }, (_, i) => ({ id: `bx-${i}`, x: 0, y: 0, w: 1000, h: 1000 }));
    const absurd = { ...huge, room: { ...huge.room, boxes }, placements: heavy.map((p) => ({ ...p, machineId: (p as { machineId: string }).machineId + "y".repeat(400) })) };
    expect(planProblems(absurd, { planId: CURRENT_ID })).toContain("This layout is too large to save.");
  });
});

describe("the document written", () => {
  it("leaves out what was never typed, a label that is the kind's word, and any kind on a unit", () => {
    const room: PlanRoom = {
      boxes: ROOM.boxes,
      places: [
        { id: "pc-1", kind: "desk", x: 0.4, y: 0, w: 1000, h: 600, label: "Desk" },
        { id: "pc-2", kind: "desk", x: 0, y: 0, w: 1000, h: 600, label: "Front desk" },
      ],
    };
    const doc = planDocument({ room, placements: [unit("m-leg-press"), planned("pm-1")] }, "Remodel 1", 2, "uid-aj", "__now__");
    expect(undefinedIn(doc)).toBe(false);
    const r = doc.room as { areaSqFt?: unknown; places: { label?: string; x: number }[] };
    expect("areaSqFt" in r).toBe(false);
    expect(r.places[0]).not.toHaveProperty("label");
    expect(r.places[0].x).toBe(0);
    expect(r.places[1].label).toBe("Front desk");
    const [u, p] = doc.placements as Record<string, unknown>[];
    expect(u).toEqual({ machineId: "m-leg-press", x: 3000, y: 3000, rotationDeg: 0 });
    expect(p.kind).toBe("planned");
    expect(p).not.toHaveProperty("lengthMm");
    expect(doc).toMatchObject({ v: 1, name: "Remodel 1", rev: 2, updatedAt: "__now__", updatedBy: "uid-aj" });
  });

  it("keeps a gone machine's spot after the ones on the floor", () => {
    const doc = planDocument({ room: ROOM, placements: [unit("m-a")], gone: [unit("m-gone", 9000) as never] }, LAYOUT_NAME, 1, "u", "t");
    expect((doc.placements as { machineId: string }[]).map((p) => p.machineId)).toEqual(["m-a", "m-gone"]);
  });
});

describe("the layout against the floor", () => {
  const floor = [
    { machineId: "m-leg-press", name: "Leg Press", code: "LP", status: "active" },
    { machineId: "m-lumbar", name: "Lumbar", code: "LU", status: "maintenance" },
    { machineId: "m-ext", name: "Leg Extension", code: "EXT", status: "active" },
  ];

  it("puts the machines placed, not placed yet, gone, and still to buy apart, in walking order", () => {
    const r = reconcile(
      { placements: [unit("m-lumbar"), unit("m-leg-press"), unit("m-leg-press", 1), unit("m-sold"), planned("pm-1")] },
      floor,
    );
    expect(r.placed.map((p) => p.machine.machineId)).toEqual(["m-leg-press", "m-lumbar"]);
    expect(r.placed[0].placement.x).toBe(3000);
    expect(r.unplaced.map((m) => m.machineId)).toEqual(["m-ext"]);
    expect(r.gone.map((g) => g.machineId)).toEqual(["m-sold"]);
    expect(r.planned.map((p) => p.id)).toEqual(["pm-1"]);
  });

  it("with no layout, every machine is not placed yet", () => {
    expect(reconcile(null, floor).unplaced).toHaveLength(3);
  });
});

describe("Use this layout and its Undo", () => {
  const T = Date.UTC(2026, 9, 12, 19, 40);
  const loaded = (id: string, rev: number, placements: Placement[], name = "x"): LoadedPlan => ({
    id,
    name,
    rev,
    retired: false,
    room: ROOM,
    placements,
    updatedAtMs: 0,
    updatedBy: "u",
  });
  const current = loaded(CURRENT_ID, 4, [unit("m-a")], LAYOUT_NAME);

  it("with no machine still to buy: the layout takes the draft, the draft's slot takes the old layout", () => {
    const draft = loaded("d-2", 7, [unit("m-b")], "Remodel 2");
    const { ops, record } = useLayoutOps(current, draft, null, T);
    expect(ops.map((o) => [o.id, o.data.rev])).toEqual([
      [CURRENT_ID, 5],
      ["d-2", 8],
    ]);
    expect(ops[1].data.name).toBe("Before Oct 12, 3:40 PM");
    expect(ops[1].data.placements).toEqual(current.placements);
    expect(ops.every((o) => o.kind === "set")).toBe(true);
    const undo = undoUseLayoutOps(record, { current: 5, slot: 8, before: null })!;
    expect(undo.map((o) => [o.id, o.data.rev])).toEqual([
      [CURRENT_ID, 6],
      ["d-2", 9],
    ]);
    expect(undo[0].data.placements).toEqual(current.placements);
    expect(undo[1].data.placements).toEqual(draft.placements);
    expect(undoUseLayoutOps(record, { current: 6, slot: 8, before: null })).toBeNull();
  });

  it("with no layout yet: the draft becomes it and its slot is retired; there is no Undo", () => {
    const draft = loaded("d-1", 1, [unit("m-b")]);
    const { ops, record } = useLayoutOps(null, draft, null, T);
    expect(ops.map((o) => [o.id, o.data.rev, o.data.retired ?? false])).toEqual([
      [CURRENT_ID, 1, false],
      ["d-1", 2, true],
    ]);
    expect(undoUseLayoutOps(record, { current: 1, slot: 2, before: null })).toBeNull();
  });

  it("with machines still to buy: the layout takes the units only, the draft keeps its own, the old layout goes to a free slot", () => {
    const draft = loaded("d-1", 3, [unit("m-b"), planned("pm-1")]);
    const { ops, record } = useLayoutOps(current, draft, { id: "d-4", rev: 2 }, T);
    expect(ops.map((o) => [o.id, o.data.rev])).toEqual([
      [CURRENT_ID, 5],
      ["d-1", 4],
      ["d-4", 3],
    ]);
    expect(ops[0].data.placements.some(isPlanned)).toBe(false);
    expect(ops[1].data.placements).toEqual(draft.placements);
    expect(ops[2].data.placements).toEqual(current.placements);
    const undo = undoUseLayoutOps(record, { current: 5, slot: 4, before: 3 })!;
    expect(undo.map((o) => [o.id, o.data.rev, o.data.retired ?? false])).toEqual([
      [CURRENT_ID, 6, false],
      ["d-4", 4, true],
    ]);
    expect(undoUseLayoutOps(record, { current: 5, slot: 4, before: 4 })).toBeNull();
  });

  it("with machines still to buy and no free slot: two writes", () => {
    const draft = loaded("d-1", 3, [planned("pm-1")]);
    expect(useLayoutOps(current, draft, null, T).ops).toHaveLength(2);
  });

  it("Delete draft retires the slot at rev + 1, and its Undo brings it back at rev + 2", () => {
    const draft = loaded("d-3", 5, [unit("m-b")]);
    const [retire] = retireOps(draft);
    expect([retire.id, retire.data.rev, retire.data.retired]).toEqual(["d-3", 6, true]);
    const retiredDraft = { ...draft, rev: 6, retired: true };
    const [restore] = restoreOps(retiredDraft);
    expect([restore.id, restore.data.rev, restore.data.retired]).toEqual(["d-3", 7, undefined]);
  });

  it("names a kept copy and a new draft", () => {
    expect(draftNames.kept("AJ Jurgens", T)).toBe("AJ's, Oct 12 3:40 PM");
    expect(draftNames.kept(null, T)).toBe("Kept, Oct 12 3:40 PM");
    expect(draftNames.draft("d-3")).toBe("Remodel 3");
  });
});

describe("the draft slots", () => {
  it("are five, and a retired one is free", () => {
    expect(DRAFT_SLOTS).toEqual(["d-1", "d-2", "d-3", "d-4", "d-5"]);
    const live = DRAFT_SLOTS.map((id) => ({ id, retired: false }));
    expect(freeSlot(live)).toBeNull();
    expect(freeSlot(live.map((s) => (s.id === "d-3" ? { ...s, retired: true } : s)))).toBe("d-3");
    expect(freeSlot([])).toBe("d-1");
  });

  it("a stored document as the editor holds it", () => {
    const r = readPlan(stored({ retired: true }), { planId: "d-2" })!;
    expect(loadedPlanOf("d-2", r.plan, 5)).toMatchObject({ id: "d-2", rev: 3, retired: true, updatedAtMs: 5 });
    expect(readPlan(stored({ retired: true }), { planId: CURRENT_ID })!.plan.retired).toBeUndefined();
  });
});
