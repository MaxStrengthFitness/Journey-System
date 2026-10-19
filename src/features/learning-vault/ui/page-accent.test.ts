import { describe, expect, it } from "vitest";
import { machineAccentStyle, machineOfPage, pageAccent } from "./page-accent";

describe("a page's accent", () => {
  it("is its machine's category, as the Catalog colours it", () => {
    expect(machineAccentStyle("m-leg-press")).toMatchObject({ "--wk-accent": "var(--wk-cat-legs)" });
    expect(machineAccentStyle("m-pulldown")).toMatchObject({ "--wk-accent": "var(--wk-cat-pull)" });
  });

  it("a studio's own machine, with no category, is the grey 'other', never the act-blue", () => {
    expect(machineAccentStyle("sm-solon-sled")).toMatchObject({ "--wk-accent": "var(--wk-cat-other)" });
  });

  it("finds the machine from a machine page, its target, or the node a card, script or deep dive hangs on", () => {
    expect(machineOfPage({ route: { kind: "machine", id: "m-leg-press" } })).toBe("m-leg-press");
    expect(machineOfPage({ target: { ref: { kind: "machine", id: "m-leg-press" }, key: "machine:m-leg-press", title: "" } })).toBe(
      "m-leg-press",
    );
    expect(machineOfPage({ route: { kind: "script", id: "lower-body-lp" }, nodeId: "machine:m-leg-press" })).toBe("m-leg-press");
    expect(machineOfPage({ route: { kind: "topic", moduleId: "performance", topicId: "x" }, nodeId: "topic:x" })).toBeNull();
  });

  it("is undefined for a page that belongs to no machine (it inherits, else the neutral grey)", () => {
    expect(pageAccent({ route: { kind: "glossary" } })).toBeUndefined();
    expect(pageAccent({ route: { kind: "card", id: "lp" }, nodeId: "machine:m-leg-press" })).toMatchObject({
      "--wk-accent": "var(--wk-cat-legs)",
    });
  });
});
