import { describe, it, expect } from "vitest";
import {
  candidateOf,
  decideStaffAtSite,
  isMergedAway,
  normName,
  readStaffSite,
  StaffCandidate,
  staffEventNames,
  staffEventSite,
  staffIdForms,
  staffIdKey,
  staffLimboReason,
  staffSiteOf,
  StudioSite,
} from "./staffSite";

// Two Mindbody sites, as today: westlake and Strongsville share 29068, Solon is 5746957.
const STUDIOS: StudioSite[] = [
  { id: "westlake", siteId: "29068" },
  { id: "strongsville", siteId: "29068" },
  { id: "solon", siteId: "5746957" },
];

const trainer = (id: string, over: Partial<StaffCandidate> = {}): StaffCandidate => ({
  id,
  fullName: `Name ${id}`,
  staffId: "100000012",
  accessibleStudioIds: [],
  ownedStudioIds: [],
  ...over,
});

describe("candidateOf and isMergedAway", () => {
  it("reads the fields the lookups need, and drops what is not a string", () => {
    expect(
      candidateOf("t1", {
        fullName: " Ann A ",
        mindbodyStaffId: 100000012,
        primaryHomeStudioId: "westlake",
        accessibleStudioIds: ["solon", 7, " ", "strongsville"],
        ownedStudioIds: "westlake",
        mindbody: { staffId: 100000012, siteId: "29068" },
      }),
    ).toEqual({
      id: "t1",
      fullName: "Ann A",
      staffId: "100000012",
      primaryHomeStudioId: "westlake",
      accessibleStudioIds: ["solon", "strongsville"],
      ownedStudioIds: [],
      echoStaffId: "100000012",
      echoSiteId: "29068",
    });
  });

  it("a document with nothing on it is a candidate with nothing on record", () => {
    expect(candidateOf("t2", undefined)).toEqual({
      id: "t2",
      fullName: "",
      staffId: "",
      primaryHomeStudioId: undefined,
      accessibleStudioIds: [],
      ownedStudioIds: [],
      echoStaffId: undefined,
      echoSiteId: undefined,
    });
  });

  it("a merged-away document (a claimed placeholder, a migrated record) is no one", () => {
    expect(candidateOf("p", { mindbodyStaffId: "1", supersededByUid: "uid" })).toBeNull();
    expect(candidateOf("p", { mindbodyStaffId: "1", supersededById: "x" })).toBeNull();
    expect(candidateOf("p", { mindbodyStaffId: "1", migratedTo: "x" })).toBeNull();
    expect(isMergedAway({ supersededByUid: "" })).toBe(false);
    expect(isMergedAway(null)).toBe(false);
  });
});

describe("staffIdKey and staffIdForms", () => {
  it("keys strings and finite numbers, nothing else", () => {
    expect(staffIdKey(" 42 ")).toBe("42");
    expect(staffIdKey(42)).toBe("42");
    expect(staffIdKey(NaN)).toBe("");
    expect(staffIdKey(null)).toBe("");
    expect(staffIdKey({})).toBe("");
  });

  it("queries the number too only when it round-trips", () => {
    expect(staffIdForms("100000012")).toEqual(["100000012", 100000012]);
    expect(staffIdForms(42)).toEqual(["42", 42]);
    expect(staffIdForms("abc")).toEqual(["abc"]);
    expect(staffIdForms("007")).toEqual(["007"]);
    expect(staffIdForms("  ")).toEqual([]);
  });
});

describe("readStaffSite", () => {
  it("the one site every studio they work at is on", () => {
    expect(readStaffSite(trainer("t", { primaryHomeStudioId: "westlake" }), STUDIOS)).toEqual({
      site: "29068",
      why: "linked",
      sites: ["29068"],
    });
    // Also works at a studio on the same site: still one site.
    expect(
      staffSiteOf(trainer("t", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["strongsville"] }), STUDIOS),
    ).toBe("29068");
  });

  it("no home studio: the site the studios they also work at or own share", () => {
    expect(staffSiteOf(trainer("t", { ownedStudioIds: ["solon"] }), STUDIOS)).toBe("5746957");
    expect(staffSiteOf(trainer("t", { primaryHomeStudioId: "unlinked", accessibleStudioIds: ["solon"] }), STUDIOS)).toBe(
      "5746957",
    );
  });

  it("no studio on a linked site: can't tell", () => {
    expect(readStaffSite(trainer("t"), STUDIOS)).toEqual({ site: null, why: "no-site", sites: [] });
    expect(readStaffSite(trainer("t", { primaryHomeStudioId: "unlinked" }), STUDIOS).why).toBe("no-site");
  });

  it("studios on two sites: can't tell, whichever is home (linked from either list)", () => {
    expect(
      readStaffSite(trainer("t", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["solon"] }), STUDIOS),
    ).toEqual({ site: null, why: "several-sites", sites: ["29068", "5746957"] });
    expect(staffSiteOf(trainer("t", { primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] }), STUDIOS)).toBeNull();
  });

  it("the echo of the same staff id from another site vetoes; an agreeing or stale echo does not", () => {
    const moved = trainer("t", { primaryHomeStudioId: "solon", echoStaffId: "100000012", echoSiteId: "29068" });
    expect(readStaffSite(moved, STUDIOS)).toEqual({
      site: null,
      why: "echo-differs",
      sites: ["5746957"],
      echoSite: "29068",
    });
    const agrees = trainer("t", { primaryHomeStudioId: "solon", echoStaffId: "100000012", echoSiteId: "5746957" });
    expect(staffSiteOf(agrees, STUDIOS)).toBe("5746957");
    // An echo of an OLD staff id says nothing about the one they hold now.
    const relinked = trainer("t", { primaryHomeStudioId: "solon", echoStaffId: "999", echoSiteId: "29068" });
    expect(readStaffSite(relinked, STUDIOS)).toEqual({ site: "5746957", why: "linked", sites: ["5746957"] });
  });
});

describe("staffEventSite", () => {
  it("the event's data first, either spelling, then the envelope's", () => {
    expect(staffEventSite({ eventData: { siteId: 5746957 }, siteId: 29068 })).toBe("5746957");
    expect(staffEventSite({ eventData: { SiteId: "5746957" }, siteId: 29068 })).toBe("5746957");
    expect(staffEventSite({ eventData: { siteId: "  " }, siteId: 29068 })).toBe("29068");
    expect(staffEventSite({ eventData: {}, SiteId: " 29068 " })).toBe("29068");
    expect(staffEventSite({ eventInstance: { siteId: 7 } })).toBe("7");
  });

  it("no site anywhere is blank", () => {
    expect(staffEventSite({ eventData: { staffId: 1 } })).toBe("");
    expect(staffEventSite({ siteId: "" })).toBe("");
    expect(staffEventSite({ siteId: { id: 1 } })).toBe("");
  });
});

describe("normName and staffEventNames", () => {
  it("accents, case and spaces never decide", () => {
    expect(normName("  José   DE la Cruz ")).toBe("jose de la cruz");
  });

  it("every name the event gives, once each; none for a bare deactivation", () => {
    expect(
      staffEventNames({ eventData: { displayName: "AJ Jurgens", firstName: "Austin", lastName: "Jurgens" } }),
    ).toEqual(["aj jurgens", "austin jurgens"]);
    expect(staffEventNames({ eventData: { FirstName: "Austin", LastName: "Jurgens", Name: "Austin Jurgens" } })).toEqual([
      "austin jurgens",
    ]);
    expect(staffEventNames({ eventData: { staffId: 12 } })).toEqual([]);
  });
});

describe("decideStaffAtSite", () => {
  const home = (id: string, studio: string, over: Partial<StaffCandidate> = {}) =>
    trainer(id, { primaryHomeStudioId: studio, ...over });

  it("a site no studio is linked to", () => {
    expect(decideStaffAtSite([home("a", "westlake")], "31337", STUDIOS)).toEqual({ kind: "unmapped-site" });
  });

  it("one on the site: matched, whoever else holds the number elsewhere or can't be judged", () => {
    expect(decideStaffAtSite([home("a", "solon")], "5746957", STUDIOS)).toEqual({
      kind: "matched",
      trainerId: "a",
      by: "site",
    });
    expect(decideStaffAtSite([home("w", "westlake"), home("s", "solon")], "5746957", STUDIOS)).toEqual({
      kind: "matched",
      trainerId: "s",
      by: "site",
    });
    // No studio on record at all: nothing ties them to this site.
    expect(decideStaffAtSite([home("s", "solon"), trainer("loose")], "5746957", STUDIOS)).toMatchObject({
      kind: "matched",
      trainerId: "s",
    });
  });

  it("two on the site, or one plus someone who may be: ambiguous", () => {
    expect(decideStaffAtSite([home("a", "westlake"), home("b", "strongsville")], "29068", STUDIOS)).toEqual({
      kind: "ambiguous",
      trainers: [
        { id: "a", name: "Name a" },
        { id: "b", name: "Name b" },
      ],
    });
    const floater = home("f", "solon", { accessibleStudioIds: ["westlake"] });
    expect(decideStaffAtSite([home("a", "westlake"), floater], "29068", STUDIOS, ["name f"])).toMatchObject({
      kind: "ambiguous",
    });
  });

  it("one who may be on the site: matched only when the event carries the name Journey has", () => {
    const floater = home("f", "westlake", { accessibleStudioIds: ["solon"], fullName: "Austin Jurgens" });
    expect(decideStaffAtSite([floater], "5746957", STUDIOS, ["austin jurgens"])).toEqual({
      kind: "matched",
      trainerId: "f",
      by: "name",
    });
    const parked = decideStaffAtSite([floater], "5746957", STUDIOS, ["pat other"]);
    expect(parked).toMatchObject({ kind: "cant-tell" });
    expect(parked.kind === "cant-tell" && parked.trainers[0]).toMatchObject({ id: "f", why: "several-sites", tied: true });
    // A deactivation carries no name.
    expect(decideStaffAtSite([floater], "5746957", STUDIOS, []).kind).toBe("cant-tell");
    // A trainer with no name in Journey never matches a name.
    expect(decideStaffAtSite([{ ...floater, fullName: "" }], "5746957", STUDIOS, [""]).kind).toBe("cant-tell");
  });

  it("two who may be on the site are never matched by name", () => {
    const f1 = home("f1", "westlake", { accessibleStudioIds: ["solon"], fullName: "Austin Jurgens" });
    const f2 = home("f2", "solon", { ownedStudioIds: ["westlake"], fullName: "Other One" });
    expect(decideStaffAtSite([f1, f2], "5746957", STUDIOS, ["austin jurgens"]).kind).toBe("cant-tell");
  });

  it("an echo of this site ties a moved trainer to it", () => {
    const moved = home("m", "solon", { echoStaffId: "100000012", echoSiteId: "29068", fullName: "Mo Ved" });
    expect(decideStaffAtSite([moved], "29068", STUDIOS, ["mo ved"])).toMatchObject({ kind: "matched", by: "name" });
    // From the new home's site the echo says otherwise: parked, unless the
    // event carries their name.
    expect(decideStaffAtSite([moved], "5746957", STUDIOS, ["mo ved"])).toMatchObject({ kind: "matched", by: "name" });
    const r = decideStaffAtSite([moved], "5746957", STUDIOS, []);
    expect(r).toMatchObject({ kind: "cant-tell" });
    expect(r.kind === "cant-tell" && r.trainers[0]).toMatchObject({ why: "echo-differs", tied: true });
  });

  it("no studio on a linked site: can't tell, never written", () => {
    expect(decideStaffAtSite([trainer("x")], "29068", STUDIOS, ["name x"])).toMatchObject({
      kind: "cant-tell",
      trainers: [{ id: "x", why: "no-site", tied: false }],
    });
  });

  it("nobody, or only trainers elsewhere: unlinked, counting the elsewhere", () => {
    expect(decideStaffAtSite([], "29068", STUDIOS)).toEqual({ kind: "unlinked", elsewhere: 0 });
    expect(decideStaffAtSite([home("a", "solon"), home("b", "solon")], "29068", STUDIOS)).toEqual({
      kind: "unlinked",
      elsewhere: 2,
    });
  });

  it("the same document twice counts once", () => {
    expect(decideStaffAtSite([home("a", "solon"), home("a", "solon")], "5746957", STUDIOS)).toMatchObject({
      kind: "matched",
      trainerId: "a",
    });
  });
});

describe("staffLimboReason", () => {
  it("a site no studio is linked to", () => {
    expect(staffLimboReason({ kind: "unmapped-site" }, "12", "31337")).toBe(
      "This staff update came from Mindbody site 31337, and no studio in Journey is linked to that site. Each site numbers its own staff, so staff id 12 can't be matched to a trainer. Nothing was written. If this site is one of ours, set its Mindbody Site ID in Admins -> Studios.",
    );
  });

  it("nobody on the site, with and without others elsewhere", () => {
    const none = staffLimboReason({ kind: "unlinked", elsewhere: 0 }, "12", "29068");
    expect(none).toBe(
      "No trainer whose studio is on Mindbody site 29068 carries staff id 12. Link them in Edit Trainer -> Mindbody Staff ID; a webhook never creates a trainer account.",
    );
    expect(staffLimboReason({ kind: "unlinked", elsewhere: 1 }, "12", "29068")).toBe(
      `${none} A trainer at another site has the same number. Each site numbers its own staff, so Journey can't tell it is the same person, and nothing was written to them.`,
    );
    expect(staffLimboReason({ kind: "unlinked", elsewhere: 3 }, "12", "29068")).toContain(
      "3 trainers at other sites have the same number.",
    );
  });

  it("more than one trainer", () => {
    expect(
      staffLimboReason(
        { kind: "ambiguous", trainers: [{ id: "a", name: "Ann A" }, { id: "b", name: "Ben B" }] },
        "12",
        "29068",
      ),
    ).toBe(
      "Mindbody staff id 12 on site 29068 could belong to more than one trainer (Ann A, Ben B). Fix the duplicate in Edit Trainer -> Mindbody Staff ID; nothing was written.",
    );
  });

  it("can't tell, for each reason", () => {
    const one = (why: "no-site" | "several-sites" | "echo-differs", tied: boolean, extra = {}) =>
      staffLimboReason(
        { kind: "cant-tell", trainers: [{ id: "a", name: "Ann A", why, tied, sites: ["5746957"], ...extra }] },
        "12",
        "29068",
      );
    expect(one("no-site", false)).toBe(
      "Mindbody staff id 12 on site 29068 matches Ann A, but none of their studios is linked to a Mindbody site, so Journey can't tell whether this is the same person. Nothing was written. Give them a home studio that is linked to Mindbody (Edit Trainer), and the next staff update will match.",
    );
    expect(one("several-sites", true)).toBe(
      "Mindbody staff id 12 on site 29068 matches Ann A, but they work at studios on more than one Mindbody site, and each site numbers its own staff, so Journey can't tell whether this is the same person. Nothing was written. An update that carries their name, spelled as it is in Journey, will match.",
    );
    expect(one("several-sites", false)).not.toContain("An update that carries their name");
    expect(one("echo-differs", true, { echoSite: "29068" })).toBe(
      "Mindbody staff id 12 on site 29068 matches Ann A, but their studios are on site 5746957 while the last staff update Journey matched to them came from site 29068, so Journey can't tell whether this is the same person. Nothing was written. An update that carries their name, spelled as it is in Journey, will match.",
    );
  });

  it("can't tell between several", () => {
    const note = { why: "no-site" as const, tied: false, sites: [] };
    expect(
      staffLimboReason(
        {
          kind: "cant-tell",
          trainers: [
            { id: "a", name: "Ann A", ...note },
            { id: "b", name: "Ben B", ...note },
            { id: "c", name: "Cy C", ...note },
          ],
        },
        "12",
        "29068",
      ),
    ).toBe(
      "Mindbody staff id 12 on site 29068 matches Ann A, Ben B and Cy C, but Journey can't tell which of them, if any, holds this site's number. Nothing was written. Check their staff ids in Edit Trainer -> Mindbody Staff ID.",
    );
  });
});
