/**
 * Contract A and B (AJ, Oct 21 2026): "Contract A is the commitment length
 * and Contract B is price they agree to". A Part A / Part B pair is one
 * package: the commitment from A's name, the billing from B, keyed by B.
 */
import { describe, it, expect } from "vitest";
import { buildRenewalSnapshot, pickContracts } from "./engine";
import { isSuccessor } from "./outcomes";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { Client, MindbodyContract } from "../../types";

const settings = DEFAULT_RENEWAL_SETTINGS;
const index = buildPackageNameIndex(settings);

function contract(id: string, contractName: string, startDate: string, endDate: string, over: Partial<MindbodyContract> = {}): MindbodyContract {
  return { clientContractId: id, status: "Active", contractName, startDate, endDate, ...over };
}
const charges = (amount: number, ...days: string[]) => days.map((scheduleDate) => ({ scheduleDate, chargeAmount: amount }));

/** westlake's real shape (Oct 22 2026): A a month long, B 18 months with the charges, at $392 (special). */
function client(aStart: string, bStart: string): Client {
  return {
    id: "c1",
    homeStudioId: "westlake",
    mindbodyCommercialSyncedAt: "x",
    mindbodyServicesSyncedAt: "x",
    mindbodyContracts: {
      a: contract("a", "144 Sessions Part A", aStart, "2026-11-01"),
      b: contract("b", "144 Sessions Part B", bStart, "2028-04-08", {
        autopayStatus: "Active",
        upcomingAutopayEvents: charges(392, "2026-11-10", "2026-12-10", "2027-01-10"),
      }),
    },
    mindbodyServices: { o: { serviceId: 1, name: "144 Sessions w/ Roll Over", count: 144, remaining: 128, activeDate: aStart } },
  } as unknown as Client;
}
const run = (c: Client, today: string) => buildRenewalSnapshot({ client: c, settings, today, attendance: [], attendanceSince: "2026-01-01" });

describe("a Part A / Part B pair is one package", () => {
  it("while Part A runs, the billing is B's: its end date and its special price", () => {
    const s = run(client("2026-10-01", "2026-10-01"), "2026-10-20");
    expect(s.cycleKey).toBe("b");
    expect(s.clientContractId).toBe("b");
    expect(s.chargeDate).toBe("2028-04-08");
    expect(s.packageKey).toBe("transformed");
    expect(s.billingStart).toBe("2026-10-01");
    expect(s.rate).toMatchObject({ perSession: 49, special: true });
  });

  it("Part A ending is not a renewal: one cycle from the first day", () => {
    const c = client("2026-10-01", "2026-10-08");
    const firstWeek = run(c, "2026-10-05");
    const afterA = run(c, "2026-11-05");
    expect(firstWeek.cycleKey).toBe("b");
    expect(afterA.cycleKey).toBe("b");
    expect(firstWeek.chargeDate).toBe("2028-04-08");
    expect(isSuccessor(firstWeek, afterA, "2026-11-05")).toBe(false);
  });

  it("the commitment is A's when the two halves name different packages", () => {
    const p = pickContracts(
      { a: contract("a", "48 Sessions Part A", "2026-09-01", "2027-03-01"), b: contract("b", "144 Sessions Part B", "2026-09-03", "2028-03-03") },
      "2026-10-20",
      index,
    );
    expect(p.current?.id).toBe("b");
    expect(p.current?.tier?.key).toBe("trial");
    expect(p.current?.end).toBe("2028-03-03");
  });

  it("a Part B alone (Part A not synced yet) is read as itself, and so is an ordinary contract", () => {
    const lone = pickContracts({ b: contract("b", "96 Sessions Part B", "2026-10-01", "2027-10-01") }, "2026-10-20", index);
    expect(lone.current?.id).toBe("b");
    expect(lone.current?.tier?.key).toBe("committed");
    const plain = pickContracts({ k: contract("k", "96 Sessions - 2X Week", "2026-10-01", "2027-10-01") }, "2026-10-20", index);
    expect(plain.current?.id).toBe("k");
  });

  it("each package's halves pair with each other, not with the next package's", () => {
    const p = pickContracts(
      {
        a1: contract("a1", "48 Sessions Part A", "2025-04-21", "2025-10-21"),
        b1: contract("b1", "48 Sessions Part B", "2025-04-25", "2025-10-25"),
        a2: contract("a2", "96 Sessions Part A", "2025-10-22", "2025-10-22"),
        b2: contract("b2", "96 Sessions Part B", "2025-10-22", "2026-10-22"),
      },
      "2026-10-20",
      index,
    );
    expect(p.current?.id).toBe("b2");
    expect(p.current?.tier?.key).toBe("committed");
    expect(p.current?.start).toBe("2025-10-22");
    expect(p.lastEnded?.id).toBe("b1");
  });
});

describe("the night the key moves from Part A to Part B", () => {
  it("a record once keyed by Part A is the same package, never its successor", () => {
    const c = client("2026-10-01", "2026-10-08");
    const now = run(c, "2026-10-20");
    expect(now.partAContractId).toBe("a");
    const before = { ...now, cycleKey: "a", billingStart: null };
    expect(isSuccessor(before, { ...now, billingStart: null }, "2026-10-20")).toBe(false);
    // An ordinary contract carries no Part A.
    const plain = run({ ...c, mindbodyContracts: { k: contract("k", "96 Sessions - 2X Week", "2026-10-01", "2027-10-01") } } as Client, "2026-10-20");
    expect(plain.partAContractId).toBeUndefined();
  });
});

describe("a record Journey couldn't read", () => {
  it("is never the before of a renewal, when its names are first matched", () => {
    const now = run(client("2026-10-01", "2026-10-01"), "2026-10-20");
    const unread = { ...now, situation: "unknown" as const, cycleKey: "old-ended", billingStart: null, packageKey: null, focusDate: "2026-02-01" };
    expect(isSuccessor(unread, now, "2026-10-20")).toBe(false);
    expect(isSuccessor({ ...unread, situation: "ended" }, now, "2026-10-20")).toBe(true);
  });
});
