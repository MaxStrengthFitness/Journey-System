import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../types";
import { operationsStudios, studiosInScope } from "./scope";

const studios = [
  { id: "westlake", name: "Westlake", ownerId: "own-w" },
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "willoughby", name: "Willoughby" },
] as Studio[];

const trainer = (extra: Partial<Trainer>): Trainer =>
  ({
    id: "t1",
    fullName: "T One",
    initials: "TO",
    role: "LifeTransformer",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
    activeGuestStudioIds: [],
    ...extra,
  }) as Trainer;

describe("operationsStudios — what a reader may look at", () => {
  it("gives the company tier every studio, by name", () => {
    expect(operationsStudios(trainer({ role: "Founder" }), studios).map((s) => s.id)).toEqual([
      "solon",
      "strongsville",
      "westlake",
      "willoughby",
    ]);
    expect(operationsStudios(trainer({}), studios, true)).toHaveLength(4);
  });

  // The franchise partition (Oct 2026): an owner leads their home and the
  // studios an administrator marked them as owning, and nothing else.
  it("gives an owner their home and the studios marked as theirs", () => {
    expect(
      operationsStudios(trainer({ role: "Owner", ownedStudioIds: ["strongsville"] }), studios).map((s) => s.id),
    ).toEqual(["solon", "strongsville"]);
    expect(
      operationsStudios(trainer({ role: "FranchiseOwner", ownedStudioIds: ["westlake", "willoughby"] }), studios).map(
        (s) => s.id,
      ),
    ).toEqual(["solon", "westlake", "willoughby"]);
  });

  it("gives nothing for a studio's ownerId or a network: an owner who owns nothing has only their home", () => {
    // own-w is westlake's ownerId (the administrator who created it, really);
    // own-e is a network's owner. Neither counts.
    expect(operationsStudios(trainer({ id: "own-w", role: "Owner" }), studios).map((s) => s.id)).toEqual(["solon"]);
    expect(operationsStudios(trainer({ id: "own-e", role: "FranchiseOwner" }), studios).map((s) => s.id)).toEqual([
      "solon",
    ]);
  });

  it("gives a studio leader the studios they run, and the grant counts", () => {
    expect(operationsStudios(trainer({ role: "HeadTrainer" }), studios).map((s) => s.id)).toEqual(["solon"]);
    expect(
      operationsStudios(trainer({ role: "StudioOwner", ownedStudioIds: ["westlake"] }), studios).map((s) => s.id),
    ).toEqual(["solon", "westlake"]);
    expect(operationsStudios(trainer({ managedStudioIds: ["strongsville"] }), studios).map((s) => s.id)).toEqual([
      "strongsville",
    ]);
    expect(operationsStudios(trainer({}), studios)).toEqual([]);
    expect(operationsStudios(null, studios)).toEqual([]);
  });
});

describe("studiosInScope", () => {
  it("is every readable studio for all, and the one studio otherwise — the app's own copy when it is the active one", () => {
    const readable = studios.slice(0, 2);
    expect(studiosInScope({ kind: "all" }, readable, null)).toHaveLength(2);
    const active = { id: "solon", name: "Solon (live)" } as Studio;
    expect(studiosInScope({ kind: "studio", studioId: "solon" }, readable, active)).toEqual([active]);
    expect(studiosInScope({ kind: "studio", studioId: "westlake" }, readable, active).map((s) => s.id)).toEqual(["westlake"]);
  });
});
