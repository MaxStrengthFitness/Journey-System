import { describe, expect, it } from "vitest";
import { TRIAL_MAX_CLIENTS, writeRefusal } from "./lock";

const real = { ready: false, emulator: false, trial: false, clientsToWrite: 3 };

describe("whether a run may write to the real database", () => {
  it("refuses the real database while the full import is switched off", () => {
    expect(writeRefusal(real)).toMatch(/switched off/);
  });

  it("lets a trial of a handful of clients through, and no more (AJ: 'Lets do all 3')", () => {
    expect(writeRefusal({ ...real, trial: true })).toBe(null);
    expect(writeRefusal({ ...real, trial: true, clientsToWrite: TRIAL_MAX_CLIENTS })).toBe(null);
    expect(writeRefusal({ ...real, trial: true, clientsToWrite: TRIAL_MAX_CLIENTS + 1 })).toMatch(/at most 5 clients/);
  });

  it("keeps the trial's limit even once the full import is on, and never locks the emulator", () => {
    expect(writeRefusal({ ...real, ready: true })).toBe(null);
    expect(writeRefusal({ ...real, ready: true, trial: true, clientsToWrite: 40 })).toMatch(/at most/);
    expect(writeRefusal({ ...real, emulator: true, clientsToWrite: 400 })).toBe(null);
  });
});
