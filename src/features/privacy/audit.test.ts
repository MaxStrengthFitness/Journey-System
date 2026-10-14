import { describe, expect, it } from "vitest";
import {
  classifyTrainers,
  clientHomeOf,
  demoFindings,
  gateOf,
  reportLines,
  type AuthFacts,
  type DemoFindings,
  type TrainerRow,
} from "./audit";

const UID_SAM = "uidSamSamSamSamSamSamSamSam1"; // 28 characters, as Firebase Auth makes them
const UID_JO = "uidJoJoJoJoJoJoJoJoJoJoJoJo1";

const auth = (uids: string[], emails: Record<string, string> = {}): AuthFacts => ({
  uids: new Set(uids),
  uidByEmail: new Map(Object.entries(emails)),
});

const row = (id: string, data: TrainerRow["data"] = {}): TrainerRow => ({ id, data });

const NO_DEMO: DemoFindings = {
  demoHostedRealClient: [],
  demoHostedMissingClient: [],
  realHostedDemoClient: [],
  realClientApprovedAtDemo: [],
};

describe("item 0: every trainer record against trainers/{sign-in uid}", () => {
  it("a record at the person's sign-in uid is where the rules look", () => {
    const [r] = classifyTrainers([row(UID_SAM, { email: "sam@x.com" })], auth([UID_SAM], { "sam@x.com": UID_SAM }));
    expect(r.verdict).toBe("at-uid");
  });

  it("a person who signed in and has no record at their uid is stranded", () => {
    const [r] = classifyTrainers(
      [row("autoIdAutoIdAutoId01", { email: "Sam@X.com" })],
      auth([], { "sam@x.com": UID_SAM }),
    );
    expect(r).toEqual({ id: "autoIdAutoIdAutoId01", email: "sam@x.com", verdict: "stranded", uid: UID_SAM });
  });

  it("an older record that names its sign-in uid in authUid is stranded when trainers/{authUid} is missing", () => {
    const [r] = classifyTrainers([row("autoIdAutoIdAutoId01", { authUid: UID_JO })], auth([UID_JO]));
    expect(r.verdict).toBe("stranded");
    expect(r.uid).toBe(UID_JO);
  });

  it("a second record for someone who also has trainers/{uid} is a duplicate, never stranded", () => {
    const rows = classifyTrainers(
      [row(UID_SAM, { email: "sam@x.com" }), row("oldRecordOldRecord01", { email: "sam@x.com" })],
      auth([UID_SAM], { "sam@x.com": UID_SAM }),
    );
    expect(rows.map((r) => r.verdict)).toEqual(["at-uid", "duplicate"]);
  });

  it("a placeholder nobody has signed in to waits for its claim", () => {
    const [r] = classifyTrainers([row("placeholderPlace0001", { email: "new@x.com", pendingClaim: true })], auth([]));
    expect(r.verdict).toBe("placeholder");
  });

  it("a placeholder whose owner HAS signed in, with no trainers/{uid}, is stranded (the claim failed)", () => {
    const [r] = classifyTrainers(
      [row("placeholderPlace0001", { email: "new@x.com", pendingClaim: true })],
      auth([], { "new@x.com": UID_JO }),
    );
    expect(r.verdict).toBe("stranded");
  });

  it("a record nobody ever signed in to is counted apart, and is not a stop", () => {
    const report = {
      identity: classifyTrainers([row("autoIdAutoIdAutoId01", { email: "gone@x.com" })], auth([])),
      demo: NO_DEMO,
    };
    expect(report.identity[0].verdict).toBe("never-signed-in");
    expect(gateOf(report)).toEqual({ item0: 0, item12: 0, pass: true });
  });

  it("a record with no email that is not a sign-in uid is unreachable", () => {
    const [r] = classifyTrainers([row("autoIdAutoIdAutoId01", {})], auth([]));
    expect(r.verdict).toBe("unreachable");
  });

  it("leaves out switched-off, superseded and Demo Mode records, whatever else they say", () => {
    const rows = classifyTrainers(
      [
        row("autoIdAutoIdAutoId01", { email: "left@x.com", isActive: false }),
        row("autoIdAutoIdAutoId02", { email: "sam@x.com", supersededByUid: UID_SAM }),
        row("demo-trainer-ana", { isDemo: true }),
        row("autoIdAutoIdAutoId03", { email: "demo@x.com", isDemo: true }),
      ],
      auth([], { "left@x.com": UID_JO, "sam@x.com": UID_SAM, "demo@x.com": "uidDemoDemoDemoDemoDemoDemo1" }),
    );
    expect(rows.map((r) => r.verdict)).toEqual(["switched-off", "superseded", "demo", "demo"]);
  });

  it("an authUid that is not a real sign-in is ignored, and the email decides", () => {
    const [r] = classifyTrainers([row("autoIdAutoIdAutoId01", { authUid: "nobody", email: "sam@x.com" })], auth([], { "sam@x.com": UID_SAM }));
    expect(r.verdict).toBe("stranded");
    expect(r.uid).toBe(UID_SAM);
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
  it("stops on a stranded record or any real client tied to Demo Mode, and says so in one line", () => {
    const report = {
      identity: classifyTrainers([row("autoIdAutoIdAutoId01", { email: "sam@x.com" })], auth([], { "sam@x.com": UID_SAM })),
      demo: { ...NO_DEMO, realClientApprovedAtDemo: ["realClient"], demoHostedMissingClient: ["s9"] },
    };
    expect(gateOf(report)).toEqual({ item0: 1, item12: 1, pass: false });
    const lines = reportLines(report);
    expect(lines[lines.length - 1]).toBe("GATE item0=1 item12=1 STOP");
    expect(lines.join("\n")).toContain("autoIdAutoIdAutoId01  sam@x.com  signs in as " + UID_SAM);
    expect(lines.join("\n")).toContain("client realClient");
  });

  it("passes when both are 0, with the missing-client Demo sessions for the record only", () => {
    const report = {
      identity: classifyTrainers([row(UID_SAM, { email: "sam@x.com" })], auth([UID_SAM])),
      demo: { ...NO_DEMO, demoHostedMissingClient: ["s9"] },
    };
    const lines = reportLines(report);
    expect(lines[lines.length - 1]).toBe("GATE item0=0 item12=0 PASS");
  });

  it("names nobody it doesn't have to: an ordinary record's email never appears", () => {
    const report = {
      identity: classifyTrainers([row(UID_SAM, { email: "sam@x.com" })], auth([UID_SAM])),
      demo: NO_DEMO,
    };
    expect(reportLines(report).join("\n")).not.toContain("sam@x.com");
  });
});
