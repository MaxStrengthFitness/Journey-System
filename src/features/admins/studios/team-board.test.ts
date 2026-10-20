import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import { mindbodyNotInJourney, teamBoard } from "./team-board";

const S = "strongsville";
const uid = (n: string) => n.padEnd(28, "0");
const auto = (n: string) => n.padEnd(20, "0");
const t = (over: Partial<Trainer> & { id: string; fullName: string }): Trainer =>
  ({ initials: "XX", role: "LifeTransformer", primaryHomeStudioId: S, accessibleStudioIds: [S], ...over }) as Trainer;

// Strongsville on Oct 20 2026, before the merges.
const kyleOld = t({ id: auto("kyleOld"), fullName: "Kyle McManus", mindbodyStaffId: "100000071" });
const kyleNew = t({ id: uid("kyleNew"), fullName: "Kyle McManus", email: "kyle@maxstrengthfitness.com", authUid: uid("kyleNew") });
const austin = t({ id: uid("austin"), fullName: "Austin Jurgens", email: "ajurgens@maxstrengthfitness.com", authUid: uid("austin"), mindbodyStaffId: "100000012" });
const admin = t({ id: uid("gmail"), fullName: "Austin Jurgens", email: "jurgensaj@gmail.com", role: "Admin", isVisibleOnCalendar: false });
const sam = t({ id: uid("sam"), fullName: "Sam Lee", email: "sam@maxstrengthfitness.com", authUid: uid("sam") });
const nia = t({ id: auto("nia"), fullName: "Nia Park", mindbodyStaffId: "100000080" });
const rotation = t({ id: "rotation_strongsville_AM", fullName: "Rotation" });
const gone = t({ id: auto("gone"), fullName: "Old Trainer", isActive: false });
const tomb = t({ id: auto("tomb"), fullName: "Kyle McManus", supersededByUid: uid("kyleNew") });
const elsewhere = t({ id: uid("other"), fullName: "Other Person", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] });

const staff = [
  { id: "100000071", fullName: "Kyle McManus", email: "kyle@maxstrengthfitness.com" },
  { id: "100000012", fullName: "Austin Jurgens", email: "Austin@MaxStrengthFitness.com" },
  { id: "100000080", fullName: "Nia Park" },
  { id: "100000090", fullName: "Sam Lee" },
  { id: "100000099", fullName: "Trainer Two" },
];

describe("a studio's staff, organised (Oct 20 2026)", () => {
  const board = teamBoard({ trainers: [kyleOld, kyleNew, austin, admin, sam, nia, rotation, gone, tomb, elsewhere], studioId: S, mindbodyStaff: staff, mindbodyRead: true });
  const groupOf = (id: string) => board.find((e) => e.trainer.id === id)?.group;

  it("lists one person on two records once, on the record they sign in to, with the other to merge", () => {
    const kyle = board.filter((e) => e.trainer.fullName === "Kyle McManus");
    expect(kyle).toHaveLength(1);
    expect(kyle[0]).toMatchObject({ group: "needs", mergeWith: { id: kyleOld.id } });
    expect(kyle[0].trainer.id).toBe(kyleNew.id);
    expect(kyle[0].note).toContain("staff 100000071");
  });

  it("offers the Mindbody staff member a signed-in, unlinked trainer could be", () => {
    const e = board.find((x) => x.trainer.id === sam.id)!;
    expect(e.group).toBe("needs");
    expect(e.linkTo?.id).toBe("100000090");
  });

  it("puts each other person in the group that says what to do, needs first, then by name", () => {
    expect(groupOf(austin.id)).toBe("team");
    expect(groupOf(admin.id)).toBe("team");
    expect(groupOf(nia.id)).toBe("waiting");
    expect(groupOf(rotation.id)).toBe("rotation");
    expect(groupOf(gone.id)).toBe("off");
    expect(groupOf(tomb.id)).toBeUndefined();
    expect(groupOf(elsewhere.id)).toBeUndefined();
    expect(board.map((e) => e.group)).toEqual(["needs", "needs", "team", "team", "waiting", "rotation", "off"]);
  });

  it("says where Journey and Mindbody disagree, Mindbody's side", () => {
    const e = board.find((x) => x.trainer.id === austin.id)!;
    expect(e.mindbodyEmail).toBe("austin@maxstrengthfitness.com");
    expect(e.mindbodyName).toBeNull();
  });

  it("never pairs two people whose Mindbody ids differ", () => {
    const b = teamBoard({
      trainers: [kyleOld, { ...kyleNew, mindbodyStaffId: "100000555" } as Trainer],
      studioId: S,
      mindbodyStaff: staff,
      mindbodyRead: true,
    });
    expect(b.every((e) => e.mergeWith === null)).toBe(true);
  });

  it("names Mindbody staff Journey has no record of", () => {
    expect(mindbodyNotInJourney([kyleOld, austin, nia], staff).map((s) => s.fullName)).toEqual(["Sam Lee", "Trainer Two"]);
  });
});
