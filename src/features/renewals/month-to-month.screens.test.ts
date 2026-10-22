/** What the screens say for a month-to-month client (AJ, Oct 21 2026: "these should just list as 'M2M'"). */
import { describe, it, expect } from "vitest";
import { directoryPackageRead } from "../../lib/directory-row";
import { resolveContractTier } from "../client-admin/contract";
import { packageView } from "../client-admin/account";
import { headerContractWords, headerRenewalWords } from "../client-profile/header-renewal";
import { leftNowLine, situationWord } from "./row-facts";
import { buildRenewalSnapshot } from "./engine";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { Client } from "../../types";

const TODAY = "2026-10-21";
const client = {
  id: "c1",
  firstName: "Mary",
  lastName: "Smith",
  homeStudioId: "strongsville",
  mindbodyCommercialSyncedAt: "synced",
  mindbodyServicesSyncedAt: "synced",
  mindbodyServices: { m: { serviceId: 2, name: "8 Sessions", count: 8, remaining: 3, activeDate: "2026-10-01" } },
  mindbodyContracts: { k: { clientContractId: 9, status: "Active", autopayStatus: "Active", contractName: "2 x Week-Session Pack", startDate: "2026-09-01", endDate: "2027-09-01" } },
} as unknown as Client;
const renewal = buildRenewalSnapshot({ client, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, attendance: [], attendanceSince: "2026-06-01" });
const withRecord = { ...client, renewal } as Client;

describe("month to month on the screens", () => {
  it("the record is month to month", () => {
    expect(renewal.situation).toBe("month-to-month");
  });
  it("the tier reads Month-to-month", () => {
    expect(resolveContractTier(withRecord)).toMatchObject({ payment: "month-to-month", label: "Month-to-month" });
  });
  it("the Directory's old row says M2M", () => {
    expect(directoryPackageRead(withRecord, TODAY).sessionsLeft).toBe("M2M");
  });
  it("the header says no renewal date, from the record or from Mindbody's contract under a lock", () => {
    expect(headerRenewalWords(renewal)).toBeNull();
    expect(headerContractWords({ ...client, contractTierOverride: { term: null, payment: "month-to-month", setAt: TODAY } }, TODAY)).toBeNull();
    expect(headerContractWords(client, TODAY)).toMatch(/2027/);
  });
  it("Account's package card says M2M with no end date and no payments", () => {
    const v = packageView(withRecord as never, null, TODAY);
    expect(v).toMatchObject({ left: "M2M", when: "Month to month · no end date", payments: null, status: null, conversationDue: false });
  });
  it("the renewal row says M2M", () => {
    expect(situationWord("month-to-month")).toBe("M2M");
    expect(leftNowLine(renewal)).toBe("M2M");
  });
});
