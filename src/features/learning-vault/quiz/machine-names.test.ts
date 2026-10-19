/**
 * A MACHINE'S NAME IN THE QUIZ: the Academy's, else a calm-cased one. The
 * seed's capitals ("CX (4 WAY NECK)") never reach a question.
 */
import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { calmCase, quizMachineName } from "./machine-names";

const seed = (id: string) => (MACHINE_DEFINITIONS as unknown as Record<string, { name?: string }>)[id]?.name ?? id;

describe("calmCase", () => {
  it("calms a name written in capitals and leaves any other alone", () => {
    expect(calmCase("SEATED ABDOMINALS")).toBe("Seated Abdominals");
    expect(calmCase("CHEST/PEC FLY")).toBe("Chest/Pec Fly");
    expect(calmCase("CX (4 WAY NECK)")).toBe("Cx (4 Way Neck)");
    expect(calmCase("Leg Press")).toBe("Leg Press");
    expect(calmCase("Nautilus leg press")).toBe("Nautilus leg press");
    expect(calmCase("")).toBe("");
  });
});

describe("quizMachineName", () => {
  it("is the Academy's name for every machine in the seed", () => {
    for (const id of Object.keys(MACHINE_DEFINITIONS)) {
      expect(ACADEMY_MOVEMENT_NAME[id], id).toBeTruthy();
      expect(quizMachineName(id, seed), id).toBe(ACADEMY_MOVEMENT_NAME[id]);
    }
    expect(quizMachineName("m-neck", seed)).toBe("Cervical Extension");
    expect(quizMachineName("m-abs", seed)).toBe("Abdominals");
  });

  it("calms a name the Academy doesn't give, and falls back to the id", () => {
    expect(quizMachineName("studio-own-1", () => "HOIST LEG PRESS")).toBe("Hoist Leg Press");
    expect(quizMachineName("studio-own-2", () => "")).toBe("studio-own-2");
  });
});
