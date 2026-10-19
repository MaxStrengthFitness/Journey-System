import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import { MAX_IN_VALUES } from "../../lib/tenancy";
import { inScope, SCOPE_FIELDS, scopeKey, trainerScopeFor } from "./scope";

function trainer(over: Partial<Trainer> = {}): Trainer {
  return {
    id: "t1",
    fullName: "Sam Reed",
    initials: "SR",
    role: "LifeTransformer",
    primaryHomeStudioId: "westlake",
    accessibleStudioIds: ["westlake"],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

describe("trainerScopeFor", () => {
  it("is nothing with no record", () => {
    expect(trainerScopeFor(null)).toBeNull();
    expect(trainerScopeFor(undefined)).toBeNull();
  });

  it("is everyone for the company tier", () => {
    for (const role of ["Admin", "Founder", "Overseer"] as const) {
      expect(trainerScopeFor(trainer({ role }))).toEqual({ kind: "all" });
    }
  });

  it("is home, also works at, guests and Demo Mode for a trainer", () => {
    expect(
      trainerScopeFor(trainer({ accessibleStudioIds: ["westlake", "strongsville"], activeGuestStudioIds: ["solon"] })),
    ).toEqual({ kind: "studios", ids: ["westlake", "strongsville", "solon", "demo-studio"] });
  });

  it("never counts a plain trainer's leftover owned studios, as the rules don't", () => {
    expect(trainerScopeFor(trainer({ ownedStudioIds: ["solon"] }))).toEqual({
      kind: "studios",
      ids: ["westlake", "demo-studio"],
    });
  });

  it("counts the owned studios of a role that runs its own, and the grant for anyone", () => {
    expect(trainerScopeFor(trainer({ role: "FranchiseOwner", ownedStudioIds: ["solon", "willoughby"] }))).toEqual({
      kind: "studios",
      ids: ["westlake", "solon", "willoughby", "demo-studio"],
    });
    expect(trainerScopeFor(trainer({ managedStudioIds: ["strongsville"] }))).toEqual({
      kind: "studios",
      ids: ["westlake", "strongsville", "demo-studio"],
    });
  });

  it("drops duplicates and blanks, and keeps the order of first appearance", () => {
    expect(
      trainerScopeFor(
        trainer({
          primaryHomeStudioId: "solon",
          accessibleStudioIds: ["solon", "", "westlake"],
          activeGuestStudioIds: ["westlake"],
          managedStudioIds: ["solon"],
        }),
      ),
    ).toEqual({ kind: "studios", ids: ["solon", "westlake", "demo-studio"] });
  });

  it("holds the list to Firestore's thirty", () => {
    const many = Array.from({ length: 40 }, (_, n) => `s${n}`);
    const scope = trainerScopeFor(trainer({ accessibleStudioIds: many }));
    expect(scope?.kind).toBe("studios");
    expect(scope && scope.kind === "studios" ? scope.ids.length : 0).toBe(MAX_IN_VALUES);
  });

  it("a record with no home still reads Demo Mode's people", () => {
    expect(trainerScopeFor(trainer({ primaryHomeStudioId: "" as string, accessibleStudioIds: [] }))).toEqual({
      kind: "studios",
      ids: ["demo-studio"],
    });
  });
});

describe("scopeKey", () => {
  it("is the same for the same studios in any order, and differs when they differ", () => {
    expect(scopeKey({ kind: "studios", ids: ["b", "a"] })).toBe(scopeKey({ kind: "studios", ids: ["a", "b"] }));
    expect(scopeKey({ kind: "studios", ids: ["a"] })).not.toBe(scopeKey({ kind: "studios", ids: ["a", "b"] }));
    expect(scopeKey({ kind: "all" })).toBe("all");
    expect(scopeKey(null)).toBe("");
    expect(scopeKey({ kind: "all" })).not.toBe(scopeKey({ kind: "studios", ids: [] }));
  });

  it("a photo or a nickname changing leaves the key alone", () => {
    const before = trainerScopeFor(trainer({ nickname: "Sam" }));
    const after = trainerScopeFor(trainer({ nickname: "Sammy", photoUrl: "x" }));
    expect(scopeKey(before)).toBe(scopeKey(after));
  });
});

describe("inScope", () => {
  const scope = trainerScopeFor(trainer({ accessibleStudioIds: ["westlake", "strongsville"] }));

  it("reads every field the queries read", () => {
    expect(SCOPE_FIELDS).toEqual([
      "primaryHomeStudioId",
      "accessibleStudioIds",
      "activeGuestStudioIds",
      "ownedStudioIds",
      "managedStudioIds",
    ]);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "westlake", accessibleStudioIds: [] }))).toBe(true);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "solon", accessibleStudioIds: ["strongsville"] }))).toBe(true);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "solon", accessibleStudioIds: [], activeGuestStudioIds: ["westlake"] }))).toBe(true);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "solon", accessibleStudioIds: [], ownedStudioIds: ["westlake"] }))).toBe(true);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "solon", accessibleStudioIds: [], managedStudioIds: ["westlake"] }))).toBe(true);
  });

  it("says no to a record tied to none of the studios, and to nothing at all", () => {
    expect(inScope(scope, trainer({ primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }))).toBe(false);
    expect(inScope(scope, null)).toBe(false);
    expect(inScope(null, trainer())).toBe(false);
  });

  it("the company tier holds everyone, and Demo Mode's people are everyone's", () => {
    expect(inScope({ kind: "all" }, trainer({ primaryHomeStudioId: "anywhere" }))).toBe(true);
    expect(inScope(scope, trainer({ primaryHomeStudioId: "demo-studio", accessibleStudioIds: ["demo-studio"] }))).toBe(true);
  });
});
