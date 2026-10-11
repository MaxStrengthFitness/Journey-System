import { describe, expect, it } from "vitest";
import { mayReadAccessRequests, mergeRequests, requestQueryPlan } from "./request-readers";

describe("mayReadAccessRequests (the access_requests read rule's mirror)", () => {
  it("lets administrators read every request", () => {
    for (const role of ["Admin", "Founder", "Overseer"]) {
      expect(mayReadAccessRequests({ role }), role).toBe(true);
    }
  });

  // The franchise partition (Oct 2026): a leader or owner reads the requests
  // that name a studio they lead, so they need a studio to lead.
  it("lets the people who run a studio read: leaders and owners at their home or owned studios", () => {
    for (const role of ["StudioOwner", "HeadTrainer", "StudioLeader", "Owner", "FranchiseOwner"]) {
      expect(mayReadAccessRequests({ role, primaryHomeStudioId: "s1" }), role).toBe(true);
    }
  });

  it("lets a trainer the studio granted read", () => {
    expect(mayReadAccessRequests({ role: "LifeTransformer", managedStudioIds: ["s1"] })).toBe(true);
  });

  it("keeps everyone else out: a trainer, the front desk, a document with no role, nobody, a leader of no studio", () => {
    expect(mayReadAccessRequests({ role: "LifeTransformer", primaryHomeStudioId: "s1" })).toBe(false);
    expect(mayReadAccessRequests({ role: "Trainer", managedStudioIds: [] })).toBe(false);
    expect(mayReadAccessRequests({ role: "Administrative" })).toBe(false);
    expect(mayReadAccessRequests({})).toBe(false);
    expect(mayReadAccessRequests(null)).toBe(false);
    expect(mayReadAccessRequests({ role: "StudioLeader", primaryHomeStudioId: "" })).toBe(false);
  });
});

describe("requestQueryPlan: which listeners the roster opens", () => {
  it("is one status query for administrators", () => {
    expect(requestQueryPlan({ role: "Admin" })).toEqual({ kind: "all" });
  });

  it("names the studios a leader runs: home, owned for a running role, and the grant", () => {
    expect(requestQueryPlan({ role: "StudioLeader", primaryHomeStudioId: "solon" })).toEqual({
      kind: "studios",
      studioIds: ["solon"],
      chunks: [["solon"]],
    });
    expect(
      requestQueryPlan({ role: "FranchiseOwner", primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] }),
    ).toMatchObject({ kind: "studios", studioIds: ["solon", "westlake"] });
    expect(requestQueryPlan({ role: "LifeTransformer", primaryHomeStudioId: "solon", managedStudioIds: ["willoughby"] })).toMatchObject({
      kind: "studios",
      studioIds: ["willoughby"],
    });
  });

  it("ignores a trainer's ownedStudioIds, and plans nothing for them", () => {
    expect(requestQueryPlan({ role: "LifeTransformer", primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] })).toEqual({
      kind: "none",
    });
    expect(requestQueryPlan(null)).toEqual({ kind: "none" });
  });

  it("never names Demo Mode's studio or a missing home (the rule refuses '' and would refuse the whole query)", () => {
    const plan = requestQueryPlan({
      role: "FranchiseOwner",
      primaryHomeStudioId: "",
      ownedStudioIds: ["demo-studio", "westlake", "westlake"],
      managedStudioIds: ["", "demo-studio"],
    });
    expect(plan).toEqual({ kind: "studios", studioIds: ["westlake"], chunks: [["westlake"]] });
    expect(requestQueryPlan({ role: "StudioLeader", primaryHomeStudioId: "demo-studio" })).toEqual({ kind: "none" });
  });

  it("chunks at 30, Firestore's cap on `in`", () => {
    const owned = Array.from({ length: 30 }, (_, i) => `s${i + 1}`);
    const plan = requestQueryPlan({ role: "Owner", primaryHomeStudioId: "home", ownedStudioIds: owned });
    expect(plan.kind).toBe("studios");
    if (plan.kind !== "studios") return;
    expect(plan.studioIds).toHaveLength(31);
    expect(plan.chunks.map((c) => c.length)).toEqual([30, 1]);
    expect(plan.chunks.flat()).toEqual(plan.studioIds);
  });
});

describe("mergeRequests", () => {
  it("keeps one row per request, whichever listener brought it", () => {
    const merged = mergeRequests([
      [{ id: "a", v: 1 }, { id: "b", v: 1 }],
      [{ id: "b", v: 2 }, { id: "c", v: 1 }],
    ]);
    expect(merged.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });
});
