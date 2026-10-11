import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Trainer } from "../types";
import { isStudioInTerritory } from "./permissions";

const owner = {
  id: "own-1",
  fullName: "Olive Owner",
  initials: "OO",
  role: "FranchiseOwner",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: [],
  activeGuestStudioIds: [],
  ownedStudioIds: ["westlake"],
} as unknown as Trainer;

describe("isStudioInTerritory", () => {
  it("counts the home and the studios an administrator marked as owned", () => {
    expect(isStudioInTerritory(owner, "solon")).toBe(true);
    expect(isStudioInTerritory(owner, "westlake")).toBe(true);
    expect(isStudioInTerritory(owner, "")).toBe(false);
  });

  // The franchise partition (Oct 2026): owning a network grants no studio.
  it("never counts a studio through a network the trainer owns", () => {
    const networks = [{ id: "n1", name: "East", ownerId: "own-1", ownerIds: ["own-1"], studioIds: ["willoughby"] }] as FranchiseNetwork[];
    expect(isStudioInTerritory(owner, "willoughby", networks)).toBe(false);
  });
});
