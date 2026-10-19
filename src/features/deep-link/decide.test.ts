import { describe, expect, it } from "vitest";
import {
  DEMO_NAME,
  DIDNT_OPEN_LINE,
  HOLD_LINE,
  IN_DEMO_LINE,
  OFFLINE_LINE,
  REFUSED_LINE,
  SESSION_STILL_OPEN_LINE,
  SESSION_UNASSIGNED_LINE,
  decide,
  sessionCase,
  type DecideFacts,
} from "./decide";
import type { ShareRead } from "./share";

const names: Record<string, string> = { solon: "Solon", westlake: "Westlake", strongsville: "Strongsville" };

function facts(over: Partial<DecideFacts> = {}): DecideFacts {
  return {
    link: { kind: "learning", ref: { kind: "machine", id: "m-leg-press" } },
    activeStudioId: "solon",
    myStudioIds: ["solon", "westlake"],
    studioNameOf: (id) => names[id] ?? null,
    sessionRunning: false,
    share: null,
    ...over,
  };
}

const clientShare = (studioId = "solon"): ShareRead => ({
  status: "ready",
  share: { kind: "client", targetId: "100000123", clientId: "100000123", studioId, createdBy: "u1", createdAt: null },
});
const sessionShare = (studioId = "solon"): ShareRead => ({
  status: "ready",
  share: { kind: "session", targetId: "sess1", clientId: "100000123", studioId, createdBy: "u1", createdAt: null },
});

describe("decide", () => {
  it("holds every link while a session screen is up, as one quiet line", () => {
    expect(decide(facts({ sessionRunning: true }))).toEqual({ kind: "hold", line: HOLD_LINE });
    expect(decide(facts({ sessionRunning: true, link: { kind: "share", shareId: "abc" }, share: clientShare() }))).toEqual({
      kind: "hold",
      line: HOLD_LINE,
    });
    expect(HOLD_LINE).toBe("Opens when you finish this session");
  });

  it("waits for the share document, then opens the client here", () => {
    const link = { kind: "share", shareId: "abc" } as const;
    expect(decide(facts({ link }))).toEqual({ kind: "wait" });
    expect(decide(facts({ link, share: { status: "loading" } }))).toEqual({ kind: "wait" });
    expect(decide(facts({ link, share: clientShare() }))).toEqual({
      kind: "open",
      target: { kind: "client", clientId: "100000123", studioId: "solon" },
    });
    expect(decide(facts({ link, share: sessionShare() }))).toEqual({
      kind: "open",
      target: { kind: "session", sessionId: "sess1", clientId: "100000123", studioId: "solon" },
    });
  });

  it("offers Switch for a link at another studio you work at, and never switches", () => {
    const d = decide(facts({ link: { kind: "share", shareId: "abc" }, share: clientShare("westlake") }));
    expect(d).toEqual({
      kind: "switch",
      studioId: "westlake",
      studioName: "Westlake",
      sentence: "That link is at Westlake.",
      action: "Switch to Westlake",
    });
    const ask = decide(facts({ link: { kind: "ask", askId: "r1", studioId: "westlake" } }));
    expect(ask.kind).toBe("switch");
    const page = decide(facts({ link: { kind: "learning", ref: { kind: "studio-page", id: "p1", studioId: "westlake" } } }));
    expect(page.kind).toBe("switch");
  });

  it("says a studio it cannot name as another studio", () => {
    const d = decide(facts({ link: { kind: "ask", askId: "r1", studioId: "westlake" }, studioNameOf: () => null }));
    expect(d).toMatchObject({ kind: "switch", action: "Switch to another studio" });
  });

  it("refuses an ask or a studio page at a studio you don't work at", () => {
    expect(decide(facts({ link: { kind: "ask", askId: "r1", studioId: "strongsville" } }))).toEqual({
      kind: "refuse",
      sentence: REFUSED_LINE,
      keep: false,
    });
    expect(
      decide(facts({ link: { kind: "learning", ref: { kind: "studio-page", id: "p1", studioId: "strongsville" } } })).kind,
    ).toBe("refuse");
  });

  it("opens a share the rules let through at a studio you don't work at, where you stand", () => {
    // A client approved to cross-train here: the rules said yes, so the link opens here.
    expect(decide(facts({ link: { kind: "share", shareId: "abc" }, share: clientShare("strongsville") }))).toEqual({
      kind: "open",
      target: { kind: "client", clientId: "100000123", studioId: "strongsville" },
    });
  });

  it("refuses by error code, telling permission-denied from offline, and never says not found", () => {
    const link = { kind: "share", shareId: "abc" } as const;
    expect(decide(facts({ link, share: { status: "refused", code: "permission-denied" } }))).toEqual({
      kind: "refuse",
      sentence: REFUSED_LINE,
      keep: false,
    });
    expect(decide(facts({ link, share: { status: "refused", code: "missing" } }))).toEqual({
      kind: "refuse",
      sentence: REFUSED_LINE,
      keep: false,
    });
    expect(decide(facts({ link, share: { status: "refused", code: "unavailable" } }))).toEqual({
      kind: "refuse",
      sentence: OFFLINE_LINE,
      keep: true,
    });
    expect(decide(facts({ link, share: { status: "refused", code: "internal" } }))).toEqual({
      kind: "refuse",
      sentence: DIDNT_OPEN_LINE,
      keep: false,
    });
    expect(REFUSED_LINE).not.toMatch(/not found/i);
    expect(REFUSED_LINE).toMatch(/isn't at a studio you work at, or the link is wrong/);
  });

  it("opens a Learning page with no studio anywhere", () => {
    expect(decide(facts({ activeStudioId: "strongsville", myStudioIds: [] }))).toEqual({
      kind: "open",
      target: { kind: "learning", ref: { kind: "machine", id: "m-leg-press" } },
    });
  });

  it("gives Demo Mode its own sentences", () => {
    // In Demo Mode, a link to a real studio.
    expect(decide(facts({ activeStudioId: "demo-studio", link: { kind: "ask", askId: "r1", studioId: "solon" } }))).toEqual({
      kind: "demo",
      sentence: IN_DEMO_LINE,
    });
    // At a real studio, a link into Demo Mode: offered, like any other switch.
    expect(decide(facts({ link: { kind: "ask", askId: "r1", studioId: "demo-studio" } }))).toMatchObject({
      kind: "switch",
      studioId: "demo-studio",
      action: `Switch to ${DEMO_NAME}`,
    });
    // In Demo Mode, a Demo Mode link opens.
    expect(decide(facts({ activeStudioId: "demo-studio", link: { kind: "ask", askId: "r1", studioId: "demo-studio" } })).kind).toBe(
      "open",
    );
  });
});

describe("sessionCase", () => {
  const mine = ["t1", "uid1"];
  it("opens a finished session's pop-up", () => {
    expect(sessionCase({ status: "Completed", trainerId: "t9", clientId: "c" }, mine)).toEqual({ kind: "finished" });
    expect(sessionCase({ trainerId: "t1", clientId: "c" }, mine)).toEqual({ kind: "finished" });
  });
  it("watches another trainer's running session", () => {
    expect(sessionCase({ status: "In-Progress", trainerId: "t9", clientId: "c" }, mine)).toEqual({ kind: "watch" });
  });
  it("says your own open session is still open where you started it", () => {
    expect(sessionCase({ status: "In-Progress", trainerId: "t1", clientId: "c" }, mine)).toEqual({
      kind: "say",
      sentence: SESSION_STILL_OPEN_LINE,
    });
  });
  it("says a session with no client yet has none", () => {
    expect(sessionCase({ status: "In-Progress", trainerId: "t9", isUnassigned: true }, mine)).toEqual({
      kind: "say",
      sentence: SESSION_UNASSIGNED_LINE,
    });
  });
  it("uses the refusal's words for a session that is not there, never not found", () => {
    expect(sessionCase(null, mine)).toEqual({ kind: "say", sentence: REFUSED_LINE });
  });
});
