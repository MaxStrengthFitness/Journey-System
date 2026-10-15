import { describe, expect, it } from "vitest";
import {
  auditReport,
  classifyTrainers,
  clientHomeOf,
  demoFindings,
  gateOf,
  reportLines,
  resolvedEmailOf,
  signInLandsOn,
  type AuthAccount,
  type DemoFindings,
  type TrainerRow,
} from "./audit";

const UID_SAM = "uidSamSamSamSamSamSamSamSam1"; // 28 characters, as Firebase Auth makes them
const UID_JO = "uidJoJoJoJoJoJoJoJoJoJoJoJo1";

const row = (id: string, data: TrainerRow["data"] = {}): TrainerRow => ({ id, data });
const account = (uid: string, email: string | null, providerEmails: string[] = []): AuthAccount => ({ uid, email, providerEmails });

const NO_DEMO: DemoFindings = {
  demoHostedRealClient: [],
  demoHostedMissingClient: [],
  realHostedDemoClient: [],
  realClientApprovedAtDemo: [],
};

describe("item 0: every sign-in account, followed the way the app signs a person in", () => {
  it("someone with a record at their uid lands on it", () => {
    expect(signInLandsOn(account(UID_SAM, "sam@x.com"), [row(UID_SAM, { email: "sam@x.com" })])).toEqual({ kind: "own", recordId: UID_SAM });
  });

  it("someone found only by email, on a record kept under another id, is stranded", () => {
    expect(signInLandsOn(account(UID_SAM, "Sam@X.com"), [row("autoIdAutoIdAutoId01", { email: "sam@x.com" })])).toEqual({
      kind: "stranded",
      recordId: "autoIdAutoIdAutoId01",
    });
  });

  it("a Microsoft account with its email only on the provider is looked up by it too", () => {
    expect(resolvedEmailOf(account(UID_SAM, null, ["sam@maxstrengthfitness.com"]))).toBe("sam@maxstrengthfitness.com");
    expect(
      signInLandsOn(account(UID_SAM, null, ["sam@maxstrengthfitness.com"]), [row("autoIdAutoIdAutoId01", { email: "sam@maxstrengthfitness.com" })]).kind,
    ).toBe("stranded");
  });

  it("a placeholder is claimed when the token carries its email, and stranded when the claim would be refused", () => {
    const placeholder = row("placeholderPlace0001", { email: "new@x.com", pendingClaim: true });
    expect(signInLandsOn(account(UID_JO, "New@x.com"), [placeholder])).toEqual({ kind: "claims", recordId: "placeholderPlace0001" });
    // The rules' claim needs the token's own email; a provider-only email is refused, and the app opens on the placeholder.
    expect(signInLandsOn(account(UID_JO, null, ["new@x.com"]), [placeholder])).toEqual({ kind: "stranded", recordId: "placeholderPlace0001" });
  });

  it("a second account for an email whose record sits at the first account's uid is stranded on it", () => {
    const rows = [row(UID_SAM, { email: "sam@x.com" })];
    expect(signInLandsOn(account(UID_SAM, "sam@x.com"), rows).kind).toBe("own");
    expect(signInLandsOn(account(UID_JO, null, ["sam@x.com"]), rows)).toEqual({ kind: "stranded", recordId: UID_SAM });
  });

  it("follows the app's lookup exactly: a stored mixed-case email is never found, so it is the access request", () => {
    expect(signInLandsOn(account(UID_SAM, "sam@x.com"), [row("autoIdAutoIdAutoId01", { email: "Sam@X.com" })]).kind).toBe("request");
  });

  it("no email at all is the access request, even with a record at the uid (the app looks nothing up)", () => {
    expect(signInLandsOn(account(UID_SAM, null), [row(UID_SAM, {})]).kind).toBe("request");
  });

  it("a switched-off record is refused at the door; a superseded one is skipped; the first by id wins", () => {
    expect(signInLandsOn(account(UID_SAM, "sam@x.com"), [row("autoIdAutoIdAutoId01", { email: "sam@x.com", isActive: false })]).kind).toBe("refused");
    expect(
      signInLandsOn(account(UID_SAM, "sam@x.com"), [
        row("aaa", { email: "sam@x.com", supersededByUid: UID_JO }),
        row("ccc", { email: "sam@x.com", isActive: false }),
        row("bbb", { email: "sam@x.com" }),
      ]),
    ).toEqual({ kind: "stranded", recordId: "bbb" });
  });
});

describe("item 0: the records, from the same landings", () => {
  it("names each record's standing", () => {
    const rows = [
      row(UID_SAM, { email: "sam@x.com" }),
      row("oldSam00000000000001", { email: "sam@x.com" }),
      row("stranded000000000001", { email: "jo@x.com" }),
      row("placeholderPlace0001", { email: "new@x.com", pendingClaim: true }),
      row("neverneverneverne001", { email: "gone@x.com" }),
      row("noEmailNoEmailNoE001", {}),
      row("leftLeftLeftLeft0001", { email: "left@x.com", isActive: false }),
      row("claimedClaimedCla001", { email: "c@x.com", supersededByUid: UID_SAM }),
      row("demo-trainer-ana", { isDemo: true }),
    ];
    const accounts = [account(UID_SAM, "sam@x.com"), account(UID_JO, "jo@x.com")];
    const verdicts = Object.fromEntries(classifyTrainers(rows, accounts).map((r) => [r.id, r.verdict]));
    expect(verdicts).toEqual({
      [UID_SAM]: "at-uid",
      oldSam00000000000001: "duplicate",
      stranded000000000001: "stranded",
      placeholderPlace0001: "placeholder",
      neverneverneverne001: "never-signed-in",
      noEmailNoEmailNoE001: "unreachable",
      leftLeftLeftLeft0001: "switched-off",
      claimedClaimedCla001: "superseded",
      "demo-trainer-ana": "demo",
    });
  });
});

describe("item 12: real clients tied to Demo Mode", () => {
  const clients = new Map<string, Record<string, unknown>>([
    ["demoClient", { homeStudioId: "demo-studio" }],
    ["realClient", { homeStudioId: "studioA" }],
    ["legacyReal", { studioId: "studioB" }],
    ["legacyDemo", { studioId: "demo-studio" }],
  ]);

  it("finds a Demo session naming a real client, and keeps a missing client apart", () => {
    const d = demoFindings({
      demoHosted: [
        { id: "s1", hostedAtStudioId: "demo-studio", clientId: "demoClient" },
        { id: "s2", hostedAtStudioId: "demo-studio", clientId: "realClient" },
        { id: "s3", hostedAtStudioId: "demo-studio", clientId: "legacyReal" },
        { id: "s4", hostedAtStudioId: "demo-studio", clientId: "gone" },
        { id: "s5", hostedAtStudioId: "demo-studio" },
        { id: "s6", hostedAtStudioId: "demo-studio", clientId: "legacyDemo" },
      ],
      demoClientSessions: [],
      clients,
      approvedAtDemo: [],
    });
    expect(d.demoHostedRealClient).toEqual(["s2", "s3"]);
    expect(d.demoHostedMissingClient).toEqual(["s4"]);
  });

  it("finds a Demo client's session hosted at a real studio", () => {
    const d = demoFindings({
      demoHosted: [],
      demoClientSessions: [
        { id: "s1", hostedAtStudioId: "demo-studio", clientId: "demoClient" },
        { id: "s2", hostedAtStudioId: "studioA", clientId: "demoClient" },
        { id: "s3", clientId: "legacyDemo" },
        { id: "s4", hostedAtStudioId: "studioA", clientId: "realClient" },
      ],
      clients,
      approvedAtDemo: [],
    });
    expect(d.realHostedDemoClient).toEqual(["s2", "s3"]);
  });

  it("finds a real client approved at demo-studio, and leaves a Demo client's approvals alone", () => {
    const d = demoFindings({
      demoHosted: [],
      demoClientSessions: [],
      clients,
      approvedAtDemo: [
        { id: "realClient", data: { homeStudioId: "studioA", approvedCrossTrainStudioIds: ["studioB", "demo-studio"] } },
        { id: "demoClient", data: { homeStudioId: "demo-studio", approvedCrossTrainStudioIds: ["demo-studio"] } },
        { id: "other", data: { homeStudioId: "studioA", approvedCrossTrainStudioIds: ["studioB"] } },
      ],
    });
    expect(d.realClientApprovedAtDemo).toEqual(["realClient"]);
  });

  it("reads a client's home as the rules do: homeStudioId, else studioId", () => {
    expect(clientHomeOf({ homeStudioId: "a", studioId: "b" })).toBe("a");
    expect(clientHomeOf({ studioId: "b" })).toBe("b");
    expect(clientHomeOf({ homeStudioId: null, studioId: "b" })).toBe("");
    expect(clientHomeOf(null)).toBe("");
  });
});

describe("the gate and the report", () => {
  it("stops on a stranded account or any real client tied to Demo Mode, and says so in one line", () => {
    const report = auditReport({
      trainers: [row("autoIdAutoIdAutoId01", { email: "sam@x.com" })],
      accounts: [account(UID_SAM, "sam@x.com")],
      demo: { ...NO_DEMO, realClientApprovedAtDemo: ["realClient"], demoHostedMissingClient: ["s9"] },
    });
    expect(gateOf(report)).toEqual({ item0: 1, item12: 1, pass: false });
    const lines = reportLines(report);
    expect(lines[lines.length - 1]).toBe("GATE item0=1 item12=1 STOP");
    expect(lines.join("\n")).toContain(`account ${UID_SAM} opens on trainers/autoIdAutoIdAutoId01  sam@x.com`);
    expect(lines.join("\n")).toContain("client realClient");
  });

  it("passes when both are 0; a record nobody signs in to yet is listed, not a stop", () => {
    const report = auditReport({
      trainers: [row(UID_SAM, { email: "sam@x.com" }), row("autoIdAutoIdAutoId01", { email: "gone@x.com" })],
      accounts: [account(UID_SAM, "sam@x.com")],
      demo: { ...NO_DEMO, demoHostedMissingClient: ["s9"] },
    });
    const lines = reportLines(report);
    expect(lines[lines.length - 1]).toBe("GATE item0=0 item12=0 PASS");
    expect(lines.join("\n")).toContain("autoIdAutoIdAutoId01  gone@x.com");
  });

  it("names nobody it doesn't have to: an ordinary record's email never appears", () => {
    const report = auditReport({
      trainers: [row(UID_SAM, { email: "sam@x.com" })],
      accounts: [account(UID_SAM, "sam@x.com")],
      demo: NO_DEMO,
    });
    expect(reportLines(report).join("\n")).not.toContain("sam@x.com");
  });
});
