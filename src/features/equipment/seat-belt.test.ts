import { describe, expect, it } from "vitest";
import {
  SEAT_BELT_CHOICES,
  SEAT_BELT_KEY,
  beltChoiceOf,
  beltWords,
  isSeatBelt,
  seatBeltField,
  unitHasSeatBelt,
  withSeatBelt,
} from "./seat-belt";
import type { SettingFieldSpec } from "./types";

const dial = (key: string, label = key): SettingFieldSpec => ({ key, label, type: "text", ghost: null, absolute: false });
const PULLDOWN = [dial("Gap"), dial("Back Pad"), dial("Seat"), dial("Handles")];

describe("the seat belt (AJ, Oct 19 2026: \"on or off\")", () => {
  it("is two choices, in the tile's order, saved under one key that never changes", () => {
    expect(SEAT_BELT_CHOICES).toEqual(["On", "Off"]);
    expect(SEAT_BELT_KEY).toBe("Seat belt");
    expect(seatBeltField()).toMatchObject({ key: "Seat belt", label: "Seat belt", type: "enum", options: ["On", "Off"], ghost: null });
  });

  it("knows the belt however it is spelled, and never takes the seat for it", () => {
    for (const k of ["Seat belt", "seat-belt", "SEAT BELT", "Belt", "seatbelt"]) expect(isSeatBelt(k), k).toBe(true);
    for (const k of ["Seat", "S", "Seat Angle", "Back Pad", "", undefined]) expect(isSeatBelt(k), String(k)).toBe(false);
  });

  it("is on every unit until the studio says the unit has none (AJ's Ba)", () => {
    expect(unitHasSeatBelt({})).toBe(true);
    expect(unitHasSeatBelt({ hasSeatBelt: true })).toBe(true);
    expect(unitHasSeatBelt(null)).toBe(true);
    expect(unitHasSeatBelt({ hasSeatBelt: false })).toBe(false);
  });

  it("joins a machine's dials last, once", () => {
    expect(withSeatBelt(PULLDOWN, {}).map((f) => f.key)).toEqual(["Gap", "Back Pad", "Seat", "Handles", "Seat belt"]);
    expect(withSeatBelt([], {}).map((f) => f.key)).toEqual(["Seat belt"]);
  });

  it("stays off a unit the studio says has none", () => {
    expect(withSeatBelt(PULLDOWN, { hasSeatBelt: false }).map((f) => f.key)).toEqual(["Gap", "Back Pad", "Seat", "Handles"]);
  });

  it("is never added beside a dial of the machine's own that already is the belt", () => {
    const own = [...PULLDOWN, dial("Belt")];
    expect(withSeatBelt(own, {}).map((f) => f.key)).toEqual(["Gap", "Back Pad", "Seat", "Handles", "Belt"]);
  });

  it("reads a written belt value as On or Off, or nothing", () => {
    for (const v of ["On", "on", "Yes", "y", "Belt", "Seat belt", "✓", "x"]) expect(beltChoiceOf(v), v).toBe("On");
    // "Not needed" is Off since AJ's "on or off".
    for (const v of ["Off", "no", "N", "No belt", "no seat belt", "Not needed", "N/A", "not required"]) expect(beltChoiceOf(v), v).toBe("Off");
    for (const v of ["", "3", "PILLOW", "Seat", null, undefined]) expect(beltChoiceOf(v), String(v)).toBeNull();
  });

  it("says the belt the Now Bar's way, and a value it can't read as written", () => {
    expect(beltWords("On")).toBe("Belt on");
    expect(beltWords("Off")).toBe("Belt off");
    expect(beltWords("Not needed")).toBe("Belt off");
    expect(beltWords("loose")).toBe("Seat belt loose");
  });
});
