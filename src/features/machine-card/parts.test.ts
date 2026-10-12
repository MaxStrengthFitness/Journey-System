import { describe, expect, it } from "vitest";
import { CARD_DOORS, CARD_PARTS, PART_TITLE, firstPartFor, type CardDoor, type CardPart, type MapMode } from "./parts";

/*
 * AJ's "1a" (Oct 11 2026): one card from every door, the parts in one order,
 * only the part open first changing. A new part or a new door fails here
 * until this table says what it opens on.
 */
describe("the card's parts", () => {
  it("run Learn · Clean · Maintain · Set up, the same from every door", () => {
    expect([...CARD_PARTS]).toEqual(["learn", "clean", "maintain", "setup"]);
    expect(CARD_PARTS.map((p) => PART_TITLE[p])).toEqual(["Learn", "Clean", "Maintain", "Set up"]);
    expect(Object.keys(PART_TITLE).sort()).toEqual([...CARD_PARTS].sort());
  });

  it("open on the door's own part, or on Clean from any door in Cleaning", () => {
    const table: Record<CardDoor, Record<MapMode, CardPart>> = {
      "my-studio": { machines: "setup", cleaning: "clean" },
      operations: { machines: "setup", cleaning: "clean" },
      admins: { machines: "setup", cleaning: "clean" },
      relay: { machines: "clean", cleaning: "clean" },
      catalog: { machines: "learn", cleaning: "clean" },
    };
    expect([...CARD_DOORS].sort()).toEqual(Object.keys(table).sort());
    let cases = 0;
    for (const door of CARD_DOORS) {
      for (const mode of ["machines", "cleaning"] as const) {
        expect(firstPartFor(door, mode), `${door} in ${mode}`).toBe(table[door][mode]);
        cases += 1;
      }
    }
    expect(cases).toBe(10);
  });
});
