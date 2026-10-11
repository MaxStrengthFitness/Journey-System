import { describe, expect, it } from "vitest";
import { addressedTo, announcementReach, mayTakeDown } from "./reach";

const solon = { id: "solon", name: "Solon" };
const westlake = { id: "westlake", name: "Westlake" };
const demo = { id: "demo-studio", name: "Demo Mode", isDemo: true };
const all = [solon, westlake, demo];

const netSolon = { id: "netA", name: "East", studioIds: ["solon"] };
const netBoth = { id: "netAB", name: "Corporate", studioIds: ["solon", "westlake"] };
const netEmpty = { id: "net0", name: "Choose later", studioIds: [] as string[] };
const networks = [netSolon, netBoth, netEmpty];

const owner = { role: "FranchiseOwner" as const, primaryHomeStudioId: "solon", ownedStudioIds: [] as string[] };

describe("announcementReach — the realm rule (Oct 1 2026)", () => {
  it("REGRESSION: an administrator inside Demo Mode may address Demo Mode alone, fixed", () => {
    const r = announcementReach({
      isAdmin: true,
      isOwnerTier: true,
      trainer: null,
      allStudios: all,
      readable: [demo],
      allNetworks: networks,
      activeStudioId: "demo-studio",
    });
    expect(r.studios.map((s) => s.id)).toEqual(["demo-studio"]);
    expect(r.scopes).toEqual(["studio"]);
    expect(r.networks).toEqual([]);
    expect(r.fixedStudioId).toBe("demo-studio");
  });

  it("an owner or a leader inside Demo Mode gets the same one audience", () => {
    for (const [isAdmin, isOwnerTier] of [[false, true], [false, false]] as const) {
      const r = announcementReach({
        isAdmin,
        isOwnerTier,
        trainer: owner,
        allStudios: all,
        readable: [demo],
        allNetworks: networks,
        activeStudioId: "demo-studio",
      });
      expect(r.scopes).toEqual(["studio"]);
      expect(r.studios.map((s) => s.id)).toEqual(["demo-studio"]);
      expect(r.networks).toEqual([]);
    }
  });

  it("outside Demo Mode keeps each tier's reach, and never offers Demo Mode", () => {
    const admin = announcementReach({
      isAdmin: true,
      isOwnerTier: true,
      trainer: null,
      allStudios: all,
      readable: [solon],
      allNetworks: networks,
      activeStudioId: "solon",
    });
    expect(admin.scopes).toEqual(["universal", "network", "studio"]);
    expect(admin.studios.map((s) => s.id)).toEqual(["solon", "westlake"]);
    expect(admin.networks).toEqual(networks);
    expect(admin.fixedStudioId).toBeUndefined();
    const lead = announcementReach({
      isAdmin: false,
      isOwnerTier: false,
      trainer: { role: "StudioLeader", primaryHomeStudioId: "solon" },
      allStudios: all,
      readable: [solon, demo],
      allNetworks: networks,
      activeStudioId: "solon",
    });
    expect(lead.scopes).toEqual(["studio"]);
    expect(lead.studios.map((s) => s.id)).toEqual(["solon"]);
    expect(lead.networks).toEqual([]);
  });
});

// The franchise partition (Oct 2026): an owner addresses a network only when
// they run every studio in it (the rules' networkNoticeOfMine).
describe("announcementReach — an owner's networks", () => {
  const reachFor = (trainer: typeof owner) =>
    announcementReach({
      isAdmin: false,
      isOwnerTier: true,
      trainer,
      allStudios: all,
      readable: [solon],
      allNetworks: networks,
      activeStudioId: "solon",
    });

  it("offers an owner of A alone the network of A, never the network of A and B, nor an empty one", () => {
    const r = reachFor(owner);
    expect(r.networks.map((n) => n.id)).toEqual(["netA"]);
    expect(r.scopes).toEqual(["network", "studio"]);
  });

  it("offers the network of A and B to someone who runs both", () => {
    const r = reachFor({ ...owner, ownedStudioIds: ["westlake"] });
    expect(r.networks.map((n) => n.id)).toEqual(["netA", "netAB"]);
  });

  it("drops the network choice for an owner with no whole network", () => {
    const r = reachFor({ ...owner, primaryHomeStudioId: "willoughby" });
    expect(r.networks).toEqual([]);
    expect(r.scopes).toEqual(["studio"]);
  });
});

describe("addressedTo", () => {
  it("is a notice to that one studio by name, in either spelling", () => {
    expect(addressedTo({ targetScope: "studio", targetStudioIds: ["demo-studio"] }, "demo-studio")).toBe(true);
    expect(addressedTo({ targetScope: "studio", targetId: "demo-studio" }, "demo-studio")).toBe(true);
    expect(addressedTo({ studioId: "demo-studio" }, "demo-studio")).toBe(true);
  });

  it("never a notice to everyone, a network, or another studio", () => {
    expect(addressedTo({ targetScope: "universal", studioId: "all" }, "demo-studio")).toBe(false);
    expect(addressedTo({ targetScope: "network", targetStudioIds: ["demo-studio"] }, "demo-studio")).toBe(false);
    expect(addressedTo({ targetScope: "studio", targetStudioIds: ["solon"] }, "demo-studio")).toBe(false);
  });
});

describe("mayTakeDown — the rules' take-down branch (the partition's attack round, Oct 2026)", () => {
  // A franchise owner whose home is Solon and who owns Westlake; Strongsville
  // is someone else's. netAB is every studio they run; netABC is not.
  const base = { primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [] as string[] };
  const ownerAB = { ...base, role: "FranchiseOwner" as const, ownedStudioIds: ["westlake"] };
  const leaderA = { ...base, role: "StudioLeader" as const, ownedStudioIds: [] as string[] };
  const admin = { ...base, role: "Admin" as const, ownedStudioIds: [] as string[] };
  const nets = [
    { id: "netAB", studioIds: ["solon", "westlake"] },
    { id: "netABC", studioIds: ["solon", "westlake", "strongsville"] },
  ];
  const hq = { authorId: "uid-hq" };
  const everyone = { ...hq, studioId: "all", targetScope: "universal" as const, targetId: "", targetStudioIds: [] };
  const toStudio = (id: string) => ({ ...hq, studioId: id, targetScope: "studio" as const, targetId: id, targetStudioIds: [id] });
  const toNet = (id: string, ids: string[]) => ({ ...hq, studioId: "", targetScope: "network" as const, targetId: id, targetStudioIds: ids });
  const as = (trainer: typeof ownerAB | typeof leaderA | typeof admin) => ({ uid: "uid-me", trainer });

  it("REGRESSION (OWNER-3): an owner is not offered head office's notice to everyone", () => {
    expect(mayTakeDown(everyone, as(ownerAB), nets)).toBe(false);
  });

  it("REGRESSION: an owner is not offered head office's notice to a studio they don't run", () => {
    expect(mayTakeDown(toStudio("strongsville"), as(ownerAB), nets)).toBe(false);
  });

  it("an owner may take down a notice to a studio they own, or to a network whose every studio they run", () => {
    expect(mayTakeDown(toStudio("westlake"), as(ownerAB), nets)).toBe(true);
    expect(mayTakeDown(toNet("netAB", ["solon", "westlake"]), as(ownerAB), nets)).toBe(true);
    // A network with a studio they don't run, by its reach or by its own list.
    expect(mayTakeDown(toNet("netABC", ["solon", "westlake", "strongsville"]), as(ownerAB), nets)).toBe(false);
    expect(mayTakeDown(toNet("netABC", ["solon"]), as(ownerAB), nets)).toBe(false);
    // A network the screen doesn't know is withheld, never offered and refused.
    expect(mayTakeDown(toNet("netX", ["solon"]), as(ownerAB), nets)).toBe(false);
  });

  it("a studio notice that reaches another studio too is not 'their studio's'", () => {
    expect(mayTakeDown({ ...toStudio("westlake"), targetStudioIds: ["westlake", "strongsville"] }, as(ownerAB), nets)).toBe(false);
  });

  it("a studio leader: their studio's notices only, never a network's (that is an owner's)", () => {
    expect(mayTakeDown(toStudio("solon"), as(leaderA), nets)).toBe(true);
    expect(mayTakeDown(toStudio("westlake"), as(leaderA), nets)).toBe(false);
    expect(mayTakeDown(everyone, as(leaderA), nets)).toBe(false);
    expect(mayTakeDown(toNet("netAB", ["solon", "westlake"]), as(leaderA), nets)).toBe(false);
  });

  it("the author may always take their own notice down, by the Auth uid", () => {
    expect(mayTakeDown({ ...everyone, authorId: "uid-me" }, as(leaderA), nets)).toBe(true);
    expect(mayTakeDown({ ...everyone, authorId: "uid-me" }, { uid: null, trainer: leaderA }, nets)).toBe(false);
  });

  it("an administrator may take any notice down; nobody signed in, none", () => {
    expect(mayTakeDown(everyone, as(admin), [])).toBe(true);
    expect(mayTakeDown(toStudio("strongsville"), as(admin), [])).toBe(true);
    expect(mayTakeDown(everyone, { uid: "uid-me", trainer: null }, nets)).toBe(false);
  });

  it("inside Demo Mode anyone signed in may take down Demo Mode's own notice", () => {
    const trainer = { ...base, role: "LifeTransformer" as const, ownedStudioIds: [] as string[] };
    expect(mayTakeDown(toStudio("demo-studio"), { uid: "uid-me", trainer }, [])).toBe(true);
  });
});
