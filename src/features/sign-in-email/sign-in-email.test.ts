import { describe, expect, it } from "vitest";
import {
  addressFits,
  emailWrites,
  holdersOf,
  whoIsThis,
  looksLikeEmail,
  neverSignedIn,
  normalEmail,
} from "./sign-in-email";

const autoId = (n: number) => `augustRecord${String(n).padStart(8, "0")}`; // 20 characters
const uid = (n: number) => `uidSignedIn${String(n).padStart(17, "0")}`; // 28 characters

const kayla = { id: autoId(1), fullName: "Kayla Sharratt" };
const kyle = { id: autoId(2), fullName: "Kyle McManus", email: "kyle@maxstrengthfitness.com" };
const austin = { id: uid(1), fullName: "Austin Jurgens", email: "ajurgens@maxstrengthfitness.com", authUid: uid(1) };
const tomb = { id: autoId(3), fullName: "Old Kayla", email: "kayla@maxstrengthfitness.com", supersededByUid: uid(9) };
const demo = { id: "demo-trainer-aragorn", fullName: "Aragorn Strider", email: "kayla@maxstrengthfitness.com" };

describe("an address", () => {
  it("is stored trimmed and in lower case", () => {
    expect(normalEmail("  AJurgens@MaxStrengthFitness.com ")).toBe("ajurgens@maxstrengthfitness.com");
    expect(normalEmail(undefined)).toBe("");
  });
  it("needs a name, an @ and a domain", () => {
    expect(looksLikeEmail("kayla@maxstrengthfitness.com")).toBe(true);
    expect(looksLikeEmail("kayla@")).toBe(false);
    expect(looksLikeEmail("kayla sharratt@x.com")).toBe(false);
  });
});

describe("who has signed in", () => {
  it("is anyone at a uid or with an authUid; an August auto-id with neither has not", () => {
    expect(neverSignedIn(kayla)).toBe(true);
    expect(neverSignedIn(austin)).toBe(false);
    expect(neverSignedIn({ ...kayla, authUid: uid(4) })).toBe(false);
  });
  it("never counts a tombstone or a Demo Mode trainer", () => {
    expect(neverSignedIn(tomb)).toBe(false);
    expect(neverSignedIn({ ...kayla, isDemo: true })).toBe(false);
  });
});

describe("one address, one person", () => {
  const everyone = [kayla, kyle, austin, tomb, demo];

  it("finds the live holders, in any case, never a tombstone or a demo trainer", () => {
    expect(holdersOf("KYLE@maxstrengthfitness.com", everyone).map((t) => t.id)).toEqual([kyle.id]);
    expect(holdersOf("kayla@maxstrengthfitness.com", everyone)).toEqual([]);
    expect(holdersOf("", everyone)).toEqual([]);
  });

  it("sets the address on someone who never signed in and opens their claim", () => {
    expect(emailWrites(kayla, " Kayla@MaxStrengthFitness.com", everyone)).toEqual([
      { id: kayla.id, name: "Kayla Sharratt", patch: { email: "kayla@maxstrengthfitness.com", pendingClaim: true } },
    ]);
  });

  it("moves an address another person holds: set here, cleared there", () => {
    expect(emailWrites(kayla, "kyle@maxstrengthfitness.com", everyone)).toEqual([
      { id: kayla.id, name: "Kayla Sharratt", patch: { email: "kyle@maxstrengthfitness.com", pendingClaim: true } },
      { id: kyle.id, name: "Kyle McManus", patch: { email: "" } },
    ]);
  });

  it("changes only the address on someone already signed in", () => {
    expect(emailWrites(austin, "aj@maxstrengthfitness.com", everyone)).toEqual([
      { id: austin.id, name: "Austin Jurgens", patch: { email: "aj@maxstrengthfitness.com" } },
    ]);
  });

  it("writes nothing when nothing changes", () => {
    expect(emailWrites(austin, "AJURGENS@maxstrengthfitness.com", everyone)).toEqual([]);
    expect(emailWrites({ ...kyle, pendingClaim: true }, "kyle@maxstrengthfitness.com", everyone)).toEqual([]);
  });

  it("opens the claim on an address set before this round", () => {
    expect(emailWrites(kyle, "kyle@maxstrengthfitness.com", everyone)).toEqual([
      { id: kyle.id, name: "Kyle McManus", patch: { pendingClaim: true } },
    ]);
  });

  it("clears an address without opening anything", () => {
    expect(emailWrites(kyle, "", everyone)).toEqual([{ id: kyle.id, name: "Kyle McManus", patch: { email: "" } }]);
  });
});

describe("Who is this?", () => {
  it("knows the company's two patterns", () => {
    expect(addressFits("ajurgens@maxstrengthfitness.com", "Austin Jurgens")).toBe("first initial and last name");
    expect(addressFits("kayla@maxstrengthfitness.com", "Kayla Sharratt")).toBe("first name");
    expect(addressFits("kayla.sharratt@gmail.com", "Kayla Sharratt")).toBe("first and last name");
    expect(addressFits("kyle@maxstrengthfitness.com", "Kayla Sharratt")).toBeNull();
    expect(addressFits("dcoduti@maxstrengthfitness.com", "Dominic Coduti")).toBe("first initial and last name");
  });

  it("puts the likeliest first, offers only people who never signed in, and keeps the rest by name", () => {
    const list = whoIsThis({ email: "ksharratt@maxstrengthfitness.com", fullName: "Kayla S" }, [kyle, austin, kayla, tomb, demo]);
    expect(list.map((c) => c.name)).toEqual(["Kayla Sharratt", "Kyle McManus"]);
    expect(list[0]).toEqual({ kind: "record", key: `t:${kayla.id}`, id: kayla.id, name: "Kayla Sharratt", why: "the address is their first initial and last name" });
    expect(list[1].why).toBeNull();
  });

  it("falls back to the name they typed", () => {
    const list = whoIsThis({ email: "kms1990@gmail.com", fullName: "Kyle McManus" }, [kayla, kyle]);
    expect(list[0]).toMatchObject({ id: kyle.id, why: "the same name" });
  });

  it("offers Mindbody staff with no record, after a record at the same fit", () => {
    const staff = [
      { id: "100000059", fullName: "Kayla Sharratt" },
      { id: "100000006", fullName: "Dominic Coduti" },
    ];
    const list = whoIsThis({ email: "dcoduti@maxstrengthfitness.com", fullName: "Dom" }, [kayla], staff);
    expect(list.map((c) => c.key)).toEqual(["mb:100000006", `t:${kayla.id}`, "mb:100000059"]);
    expect(list[0]).toEqual({ kind: "mindbody", key: "mb:100000006", staffId: "100000006", name: "Dominic Coduti", why: "the address is their first initial and last name" });
  });
});
