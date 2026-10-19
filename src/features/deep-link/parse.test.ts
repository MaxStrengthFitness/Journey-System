import { describe, expect, it } from "vitest";
import {
  LINK_ID_MAX,
  isLinkId,
  isLinkPath,
  learningPageId,
  linkPathFor,
  linkUrl,
  parseLink,
  studioNamedByLink,
} from "./parse";

describe("a Journey link's id", () => {
  it("is letters, digits, - and _ only, at most 64 long", () => {
    expect(isLinkId("a1B2-c3_D4")).toBe(true);
    expect(isLinkId("x".repeat(LINK_ID_MAX))).toBe(true);
    expect(isLinkId("x".repeat(LINK_ID_MAX + 1))).toBe(false);
    expect(isLinkId("")).toBe(false);
    expect(isLinkId(null)).toBe(false);
  });

  it("refuses a dot, a slash, a space and anything a URL would encode", () => {
    // The server answers a path ending in ".xxx" with Not found.
    expect(isLinkId("abc.png")).toBe(false);
    expect(isLinkId("abc/def")).toBe(false);
    expect(isLinkId("abc def")).toBe(false);
    expect(isLinkId("abc:def")).toBe(false);
    expect(isLinkId("abc~def")).toBe(false);
  });
});

describe("parseLink", () => {
  it("reads a share link", () => {
    expect(parseLink("/t/5f1f4f8c2d8b4c6a9e0f1a2b3c4d5e6f")).toEqual({
      kind: "share",
      shareId: "5f1f4f8c2d8b4c6a9e0f1a2b3c4d5e6f",
    });
    expect(parseLink("/t/abc/")).toEqual({ kind: "share", shareId: "abc" });
  });

  it("never reads a record id off a client link: a client is always a share", () => {
    expect(parseLink("/c/100000123")).toBeNull();
    expect(parseLink("/clients/100000123")).toBeNull();
    expect(parseLink("/s/sess1")).toBeNull();
  });

  it("refuses a share id with a dot, a slash or over 64 characters", () => {
    expect(parseLink("/t/abc.png")).toBeNull();
    expect(parseLink("/t/abc/def")).toBeNull();
    expect(parseLink(`/t/${"x".repeat(65)}`)).toBeNull();
    expect(parseLink("/t/")).toBeNull();
    expect(parseLink("/t")).toBeNull();
  });

  it("reads a Learning page: a machine, an Academy page, the two pages with no id", () => {
    expect(parseLink("/l/machine~m-leg-press")).toEqual({ kind: "learning", ref: { kind: "machine", id: "m-leg-press" } });
    expect(parseLink("/l/academy-topic~hydration")).toEqual({
      kind: "learning",
      ref: { kind: "academy-topic", id: "hydration" },
    });
    expect(parseLink("/l/academy-cueing")).toEqual({ kind: "learning", ref: { kind: "academy-cueing" } });
    expect(parseLink("/l/academy-glossary")).toEqual({ kind: "learning", ref: { kind: "academy-glossary" } });
    expect(parseLink("/l/academy-glossary~tul")).toEqual({ kind: "learning", ref: { kind: "academy-glossary", id: "tul" } });
  });

  it("needs the studio for a studio's own page, and refuses a kind it doesn't know", () => {
    expect(parseLink("/l/studio-page~p1", "?studio=solon")).toEqual({
      kind: "learning",
      ref: { kind: "studio-page", id: "p1", studioId: "solon" },
    });
    expect(parseLink("/l/studio-page~p1")).toBeNull();
    expect(parseLink("/l/machine")).toBeNull(); // a machine needs its id
    expect(parseLink("/l/academy-cueing~x")).toBeNull(); // and the phrasebook has none
    expect(parseLink("/l/notes~p1")).toBeNull();
    expect(parseLink("/l/machine~m.leg")).toBeNull();
  });

  it("reads an ask only with its studio", () => {
    expect(parseLink("/a/req1", "?studio=solon")).toEqual({ kind: "ask", askId: "req1", studioId: "solon" });
    expect(parseLink("/a/req1", "studio=solon")).toEqual({ kind: "ask", askId: "req1", studioId: "solon" });
    expect(parseLink("/a/req1")).toBeNull();
    expect(parseLink("/a/req1", "?studio=so.lon")).toBeNull();
  });

  it("reads nothing off any other address", () => {
    expect(parseLink("/")).toBeNull();
    expect(parseLink("/index.html")).toBeNull();
    expect(parseLink("/t/abc", "?view=trainer-hub")).not.toBeNull();
    expect(parseLink("/x/abc")).toBeNull();
    expect(parseLink("/t/%E2%82")).toBeNull(); // a bad escape
    expect(parseLink("/t/a%20b")).toBeNull(); // a decoded space
  });

  it("isLinkPath says which addresses are links before parsing", () => {
    expect(isLinkPath("/t/abc")).toBe(true);
    expect(isLinkPath("/l/machine~x")).toBe(true);
    expect(isLinkPath("/a/x")).toBe(true);
    expect(isLinkPath("/")).toBe(false);
    expect(isLinkPath("/t/")).toBe(false);
    expect(isLinkPath("/trainer")).toBe(false);
  });
});

describe("building a link", () => {
  it("round-trips every target through its path", () => {
    const targets = [
      parseLink("/t/abc123")!,
      parseLink("/l/machine~m-leg-press")!,
      parseLink("/l/academy-cueing")!,
      parseLink("/l/academy-glossary~tul")!,
      parseLink("/l/studio-page~p1", "?studio=solon")!,
      parseLink("/a/req1", "?studio=solon")!,
    ];
    for (const t of targets) {
      const path = linkPathFor(t)!;
      const [pathname, search = ""] = path.split("?");
      expect(parseLink(pathname, search ? `?${search}` : "")).toEqual(t);
    }
  });

  it("refuses to build a link it could not read back", () => {
    expect(linkPathFor({ kind: "share", shareId: "a.b" })).toBeNull();
    expect(linkPathFor({ kind: "learning", ref: { kind: "machine", id: "x".repeat(65) } })).toBeNull();
    expect(learningPageId({ kind: "academy-card", id: "has space" })).toBeNull();
    expect(linkPathFor({ kind: "ask", askId: "r1", studioId: "so/lon" })).toBeNull();
  });

  it("joins the origin without a double slash", () => {
    expect(linkUrl("https://journey.example/", { kind: "share", shareId: "abc" })).toBe("https://journey.example/t/abc");
    expect(linkUrl("https://journey.example", { kind: "ask", askId: "r1", studioId: "solon" })).toBe(
      "https://journey.example/a/r1?studio=solon",
    );
  });

  it("names the studio a link carries before anything is read", () => {
    expect(studioNamedByLink({ kind: "ask", askId: "r1", studioId: "solon" })).toBe("solon");
    expect(studioNamedByLink({ kind: "learning", ref: { kind: "studio-page", id: "p", studioId: "solon" } })).toBe("solon");
    expect(studioNamedByLink({ kind: "learning", ref: { kind: "machine", id: "m" } })).toBeNull();
    expect(studioNamedByLink({ kind: "share", shareId: "abc" })).toBeNull();
  });
});
