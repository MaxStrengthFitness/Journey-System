import { describe, expect, it } from "vitest";
import { seatBeltField } from "../../equipment/seat-belt";
import type { SettingFieldSpec } from "../../equipment/types";
import { toFitFields } from "./field-values";

const dial = (key: string): SettingFieldSpec => ({ key, label: key, type: "text", ghost: null, absolute: false });

describe("toFitFields", () => {
  it("gives each dial its engine key, the first of two that normalise alike", () => {
    expect(toFitFields([dial("Back Pad"), dial("back-pad"), dial("Seat")]).map((f) => [f.key, f.nk])).toEqual([
      ["Back Pad", "back-pad"],
      ["Seat", "seat"],
    ]);
  });

  it("leaves the seat belt out, so machine fit neither suggests nor judges it (Oct 19 2026)", () => {
    expect(toFitFields([dial("Gap"), dial("Seat"), seatBeltField()]).map((f) => f.key)).toEqual(["Gap", "Seat"]);
  });
});
