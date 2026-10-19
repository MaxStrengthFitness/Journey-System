import { describe, it, expect } from "vitest";
import { toFloorMachines, dialLabelsOf, isPerSideMachine, studioFloorOf, floorWithHistoryMachines, studioBuiltDialNames, withSetupStandards } from "./floor-machines";
import { fieldsForMachine } from "../features/equipment/adapters";
import type { Machine } from "../types";
import type { ResolvedMachine } from "../types/machines";

/** Minimal ResolvedMachine — only the fields this module reads. */
const resolved = (over: Partial<ResolvedMachine> & { machineId: string; name: string }) =>
  ({
    studioId: "solon",
    source: "catalog",
    rosterStatus: "active",
    order: 10,
    comparisonKey: over.machineId,
    overriddenFields: [],
    ...over,
  }) as unknown as ResolvedMachine;

const legacyLegPress: Machine = {
  id: "m-leg-press",
  name: "LEG PRESS",
  settingOptions: ["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"],
  standardSettings: { Gap: "2" },
  trainerTips: "Belt them in before the handoff.",
  anatomicalRegion: "Lower Body",
  requiresHandoff: true,
  imageUrl: "/legacy.webp",
};

describe("studioFloorOf — the floor a profile hands the codex", () => {
  it("carries a studio's own machine and its lineage, which the app-wide list has neither of", () => {
    const floor = studioFloorOf(
      [
        resolved({ machineId: "m-leg-press", name: "LEG PRESS" }),
        resolved({ machineId: "sm-solon-hammer", name: "Our Hammer Leg Press", source: "studio", comparisonKey: "m-leg-press" } as never),
      ],
      [legacyLegPress, { id: "m-chest-press", name: "CHEST PRESS" }],
    );
    expect(floor.map((m) => m.id)).toEqual(["m-leg-press", "sm-solon-hammer"]);
    expect((floor[1] as Machine & { comparisonKey?: string }).comparisonKey).toBe("m-leg-press");
    // Only what is on this floor: the chest press is not rostered here.
    expect(floor.some((m) => m.id === "m-chest-press")).toBe(false);
    // The legacy fields still arrive for a catalog machine.
    expect(floor[0].trainerTips).toBe("Belt them in before the handoff.");
  });

  it("falls back to the app-wide list while the studio has no roster", () => {
    const all = [legacyLegPress];
    expect(studioFloorOf([], all)).toEqual(all);
  });
});

describe("toFloorMachines — the studio's truth over the legacy shape", () => {
  it("keeps every legacy field a floor screen still reads", () => {
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    // These are read by the machine sheet, the briefing and the routine rows.
    expect(m.trainerTips).toBe("Belt them in before the handoff.");
    expect(m.anatomicalRegion).toBe("Lower Body");
    expect(m.requiresHandoff).toBe(true);
  });

  it("uses the studio's name for its own unit", () => {
    // "Max Strength owns the method; a studio owns its hardware" — the name
    // the location uses is explicitly the studio's.
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "Leg Press (Hoist)" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.name).toBe("Leg Press (Hoist)");
  });

  it("puts the studio's dial labels on the floor, not the legacy list", () => {
    const [m] = toFloorMachines(
      [
        resolved({
          machineId: "m-leg-press",
          name: "LEG PRESS",
          settingFields: [
            { key: "gap", label: "Gap", type: "text" },
            { key: "seat", label: "Seat", type: "text" },
            { key: "foot-plate", label: "Foot Plate", type: "text" },
          ],
        } as Partial<ResolvedMachine> as never),
      ],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.settingOptions).toEqual(["Gap", "Seat", "Foot Plate"]);
  });

  it("falls back to the legacy dials when the machine declares none", () => {
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.settingOptions).toEqual(legacyLegPress.settingOptions);
  });

  it("uses the studio's resolved defaults over the legacy standard", () => {
    const [m] = toFloorMachines(
      [
        resolved({
          machineId: "m-leg-press",
          name: "LEG PRESS",
          defaultSettings: { gap: "5", seat: "3" },
        } as Partial<ResolvedMachine> as never),
      ],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.standardSettings).toEqual({ gap: "5", seat: "3" });
  });

  it("carries the roster order, so the floor runs in the studio's sequence", () => {
    const out = toFloorMachines(
      [
        resolved({ machineId: "b", name: "B", order: 10 }),
        resolved({ machineId: "a", name: "A", order: 20 }),
      ],
      {},
    );
    expect(out.map((m) => [m.id, m.order])).toEqual([
      ["b", 10],
      ["a", 20],
    ]);
  });

  it("includes a studio's own machine that the global catalog has never heard of", () => {
    // The whole point of the roster: a location's own unit reaches the floor.
    const out = toFloorMachines(
      [resolved({ machineId: "sm-solon-rear-delt", name: "Rear Delt Hoist", source: "custom" })],
      {},
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sm-solon-rear-delt");
    expect(out[0].name).toBe("Rear Delt Hoist");
  });

  it("does not invent a name for a machine with none", () => {
    const [m] = toFloorMachines([resolved({ machineId: "sm-x", name: "" })], {});
    expect(m.name).toBe("sm-x");
  });

  it("returns the legacy list unchanged in shape when the roster is the catalog bridge", () => {
    // Empty-roster studios (westlake, Willoughby) get the catalog through
    // bridgeWhenRosterEmpty, so this must degrade to today's behaviour.
    const out = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(out).toHaveLength(1);
    expect(out[0].settingOptions).toEqual(legacyLegPress.settingOptions);
    expect(out[0].standardSettings).toEqual(legacyLegPress.standardSettings);
  });

  it("carries the unit's seat belt answer, and leaves an unanswered unit unanswered (Oct 19 2026)", () => {
    const [none, has, unanswered] = toFloorMachines(
      [
        resolved({ machineId: "m-chest-press", name: "CHEST PRESS", hasSeatBelt: false }),
        resolved({ machineId: "m-pulldown", name: "PULLDOWN", hasSeatBelt: true }),
        resolved({ machineId: "m-leg-press", name: "LEG PRESS" }),
      ],
      { "m-leg-press": legacyLegPress },
    );
    expect(none.hasSeatBelt).toBe(false);
    expect(has.hasSeatBelt).toBe(true);
    expect("hasSeatBelt" in unanswered).toBe(false);
  });
});

describe("dialLabelsOf", () => {
  it("prefers the label and falls back to the key", () => {
    const r = resolved({
      machineId: "m",
      name: "M",
      settingFields: [
        { key: "gap", label: "Gap", type: "text" },
        { key: "back-pad", label: "", type: "text" },
      ],
    } as Partial<ResolvedMachine> as never);
    expect(dialLabelsOf(r)).toEqual(["Gap", "back-pad"]);
  });

  it("is empty for a machine with no declared dials", () => {
    expect(dialLabelsOf(resolved({ machineId: "m", name: "M" }))).toEqual([]);
  });
});

describe("isPerSideMachine", () => {
  it("recognises the torso rotation by canonical id even when renamed", () => {
    // The tracker's old inline check was name-only, so a studio that renamed
    // its unit lost the Left/Right fields.
    expect(isPerSideMachine({ id: "m-torso-rotation", name: "Trunk Twist" })).toBe(true);
    expect(isPerSideMachine({ id: "torso_rotation", name: "Anything" })).toBe(true);
  });

  it("still recognises it by name, for a studio's own copy", () => {
    expect(isPerSideMachine({ id: "sm-solon-tr", name: "Torso Rotation (MX)" })).toBe(true);
    expect(
      isPerSideMachine({ id: "sm-solon-tr", name: "Custom", comparisonKey: "m-torso-rotation" }),
    ).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isPerSideMachine({ id: "m-leg-press", name: "LEG PRESS" })).toBe(false);
    expect(isPerSideMachine({})).toBe(false);
  });
});

describe("floorWithHistoryMachines (the profile's Journey grid rows, Oct 2 2026)", () => {
  const m = (id: string, name: string, order: number) => ({ id, name, order }) as Machine;
  const floor = [m("leg", "Leg Press", 1), m("sm-solon-row", "Our Row", 2)];
  const appWide = [m("chest", "Chest Press", 3), m("leg", "Leg Press (catalog)", 1), m("neck", "Neck", 0)];

  it("is the studio's floor, in its order, when she has no history off it", () => {
    expect(floorWithHistoryMachines(floor, appWide, ["leg"]).map((x) => x.id)).toEqual(["leg", "sm-solon-row"]);
  });

  it("keeps a machine she trained on that the floor no longer has, after the floor", () => {
    const rows = floorWithHistoryMachines(floor, appWide, ["chest", "neck", "leg", "chest"]);
    expect(rows.map((x) => x.id)).toEqual(["leg", "sm-solon-row", "neck", "chest"]);
    // The floor's own version wins for a machine on it.
    expect(rows[0].name).toBe("Leg Press");
  });

  it("never drops history on a machine no list knows", () => {
    expect(floorWithHistoryMachines(floor, appWide, ["gone"]).map((x) => x.name)).toEqual(["Leg Press", "Our Row", "gone"]);
  });
});

/*
 * STUDIO SETUP ON THE FLOOR (the studio machines round, Oct 13 2026). AJ:
 * "i wasnt able to add settings for a client onto our hoist leg press at
 * strongsville, in the machine catalog it has a seat setting to it". The
 * Catalog's Preset reads the Studio setup card first; the floor read only
 * the machine's own dials, and a studio-built machine has no catalog entry
 * behind it, so the client's card had no dial to save.
 */
describe("Studio setup on the floor", () => {
  const HOIST = "sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press";
  const hoist = (over: Partial<ResolvedMachine> = {}) =>
    resolved({ machineId: HOIST, name: "Hoist leg press", source: "custom", comparisonKey: "m-leg-press", ...over } as never);

  it("gives a studio-built machine with no dials of its own the names and standards from Studio setup", () => {
    const [m] = toFloorMachines([hoist()], {}, { [HOIST]: { settingOptions: ["Seat"], standardSettings: { Seat: "4" } } });
    expect(m.settingOptions).toEqual(["Seat"]);
    expect(m.standardSettings).toEqual({ Seat: "4" });
  });

  it("the client's card then has a Seat dial to type into, with the studio standard as its hint", () => {
    const [m] = toFloorMachines([hoist()], {}, { [HOIST]: { settingOptions: ["Seat"], standardSettings: { Seat: "4" } } });
    // No catalog entry stands behind a studio-built machine.
    const fields = fieldsForMachine(m, {}, undefined);
    // The seat belt every unit carries comes last (the seat belt round, Oct 19 2026).
    expect(fields.map((f) => [f.key, f.label, f.type, f.ghost])).toEqual([
      ["Seat", "Seat", "text", "4"],
      ["Seat belt", "Seat belt", "enum", null],
    ]);
    // Before this round: no dial to type into, only the belt.
    expect(fieldsForMachine(toFloorMachines([hoist()], {})[0], {}, undefined).map((f) => f.key)).toEqual(["Seat belt"]);
  });

  it("puts Studio setup's names first on a studio-built machine, then its own it didn't name, never twice", () => {
    const [m] = toFloorMachines(
      [
        hoist({
          settingFields: [
            { key: "seat", label: "Seat", type: "text" },
            { key: "foot-plate", label: "Foot plate", type: "text" },
          ],
        } as never),
      ],
      {},
      { [HOIST]: { settingOptions: ["Back pad", " seat ", "", "Back Pad"] } },
    );
    // A value saved under its own "Seat" or "Foot plate" is never hidden:
    // a name both hold keeps the machine's own spelling.
    expect(m.settingOptions).toEqual(["Back pad", "Seat", "Foot plate"]);
  });

  it("keeps a standard machine's own names, and gives it the studio's standards", () => {
    const [m] = toFloorMachines(
      [
        resolved({
          machineId: "m-leg-press",
          name: "LEG PRESS",
          settingFields: [
            { key: "gap", label: "Gap", type: "text" },
            { key: "seat-position", label: "Seat Position", type: "text" },
          ],
          defaultSettings: { Gap: "2" },
        } as never),
      ],
      { "m-leg-press": legacyLegPress },
      { "m-leg-press": { settingOptions: ["Seat", "Back pad"], standardSettings: { Seat: "5", "Back pad": " " } } },
    );
    // "Seat" beside "Seat Position" is the settings audit's to settle, not the card's.
    expect(m.settingOptions).toEqual(["Gap", "Seat Position"]);
    // The studio's Seat is a hint now; an empty value never counts.
    expect(m.standardSettings).toEqual({ Gap: "2", Seat: "5" });
  });

  /* The review (Oct 13 2026): a fixed dial (the gap) opens already filled
     with its standard and any Save writes it, so Studio setup's gap would
     reach a client's record nobody chose; and the card saves with a merge,
     so a setting a leader took off leaves its value behind. */
  it("never lets Studio setup's gap stand in for the machine's own, and counts only the settings it still lists", () => {
    const legPress = resolved({
      machineId: "m-leg-press",
      name: "LEG PRESS",
      settingFields: [
        { key: "gap", label: "Gap", type: "text" },
        { key: "seat", label: "Seat", type: "text" },
      ],
    } as never);
    // The Academy's leg-press gap is per client: no default of its own.
    const [m] = toFloorMachines([legPress], {}, {
      "m-leg-press": { settingOptions: ["Gap", "Seat"], standardSettings: { Gap: "2", Seat: "5", "Back pad": "3" } },
    });
    expect(m.standardSettings).toEqual({ Seat: "5" });
    const gap = fieldsForMachine(m, {}, undefined).find((f) => f.key === "Gap")!;
    expect(gap.absolute).toBe(false);
    expect(gap.ghost).toBeNull();
    // A machine with a gap of its own keeps it.
    const [own] = toFloorMachines([{ ...legPress, defaultSettings: { Gap: "4" } } as never], {}, {
      "m-leg-press": { settingOptions: ["Gap"], standardSettings: { Gap: "2" } },
    });
    expect(own.standardSettings).toEqual({ Gap: "4" });
  });

  it("says exactly what it said before when Studio setup isn't read (or failed)", () => {
    const before = toFloorMachines([hoist(), resolved({ machineId: "m-leg-press", name: "LEG PRESS" })], { "m-leg-press": legacyLegPress });
    expect(toFloorMachines([hoist(), resolved({ machineId: "m-leg-press", name: "LEG PRESS" })], { "m-leg-press": legacyLegPress }, {})).toEqual(before);
    expect(toFloorMachines([hoist(), resolved({ machineId: "m-leg-press", name: "LEG PRESS" })], { "m-leg-press": legacyLegPress }, null)).toEqual(before);
  });

  it("a studio with no roster yet keeps the app-wide list, with the studio's standards", () => {
    const out = studioFloorOf([], [legacyLegPress], {
      "m-leg-press": { settingOptions: ["Seat Distance"], standardSettings: { "Seat Distance": "6", Gap: "9" } },
    });
    expect(out[0].settingOptions).toEqual(legacyLegPress.settingOptions);
    expect(out[0].standardSettings).toEqual({ Gap: "2", "Seat Distance": "6" });
    expect(studioFloorOf([], [legacyLegPress], {})[0]).toBe(legacyLegPress);
  });
});

describe("studioBuiltDialNames and withSetupStandards", () => {
  it("names nothing twice, ignoring case and spacing", () => {
    expect(studioBuiltDialNames(["Seat", "Gap"], ["SEAT", "Back-pad", "back pad"])).toEqual(["Seat", "Back-pad", "Gap"]);
    expect(studioBuiltDialNames([], undefined)).toEqual([]);
  });

  it("leaves the defaults alone with no studio standard", () => {
    expect(withSetupStandards({ a: "1" }, undefined)).toEqual({ a: "1" });
    expect(withSetupStandards(undefined, { standardSettings: {} })).toBeUndefined();
    // A standard for a setting Studio setup no longer lists is no standard.
    expect(withSetupStandards({ a: "1" }, { settingOptions: [], standardSettings: { Seat: "4" } })).toEqual({ a: "1" });
    expect(withSetupStandards(undefined, { settingOptions: ["seat"], standardSettings: { Seat: "4" } })).toEqual({ Seat: "4" });
  });
});
