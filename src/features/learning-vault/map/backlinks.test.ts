import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../types";
import { backlinksOf, backlinkWhy, linkedHere, shownIds, withoutShown } from "./backlinks";

/* A small vault: two machines that stand in for each other, a cue moment,
   a topic that talks about one machine, a term, a clinical flag. */
function node(id: string, domain: GraphNode["domain"], route: VaultRoute, weight = 0): GraphNode {
  return { id, label: id.split(":")[1] ?? id, domain, route, weight };
}
function edge(from: string, to: string, kind: GraphEdge["kind"], label: string = kind): GraphEdge {
  return { from, to, kind, label };
}

const NODES: GraphNode[] = [
  node("machine:m-leg-press", "machine", { kind: "machine", id: "m-leg-press" }, 5),
  node("machine:m-leg-ext", "machine", { kind: "machine", id: "m-leg-ext" }, 2),
  node("cue:0", "cue", { kind: "cueing", moment: 0 }, 1),
  node("topic:t-load", "topic", { kind: "topic", moduleId: "performance", topicId: "t-load" }, 2),
  node("term:pace", "method", { kind: "glossary", term: "Pace" }, 3),
  node("clinical:knee", "clinical", { kind: "map", focus: "clinical:knee" }, 1),
  node("module:performance", "module", { kind: "module", moduleId: "performance" }, 9),
];
const EDGES: GraphEdge[] = [
  edge("machine:m-leg-ext", "machine:m-leg-press", "substitutes", "is part of a set that can replace"),
  edge("machine:m-leg-press", "cue:0", "cued-at", "is cued at"),
  edge("topic:t-load", "machine:m-leg-press", "mentions", "talks about"),
  edge("topic:t-load", "term:pace", "mentions", "talks about"),
  edge("clinical:knee", "machine:m-leg-press", "affects", "affects"),
  edge("machine:m-leg-press", "machine:m-leg-ext", "same-category", "is in the same family as"),
  edge("topic:t-load", "module:performance", "part-of", "is part of"),
];
const GRAPH: VaultGraph = { nodes: NODES, edges: EDGES };

describe("what links here", () => {
  it("finds what links INTO a page, strongest reason first, one row per other page", () => {
    const back = backlinksOf(GRAPH, "machine:m-leg-press");
    const ids = back.map((b) => b.node.id);
    // The substitute (stronger than "same family" for the same machine), the flag, the topic.
    expect(ids).toEqual(["machine:m-leg-ext", "clinical:knee", "topic:t-load"]);
    expect(back[0].edge.kind).toBe("substitutes");
    // A cue moment the machine points AT does not link here.
    expect(ids).not.toContain("cue:0");
  });

  it("counts a mutual link from either end", () => {
    const g: VaultGraph = { nodes: NODES, edges: [edge("machine:m-leg-press", "machine:m-leg-ext", "same-category")] };
    expect(backlinksOf(g, "machine:m-leg-press").map((b) => b.node.id)).toEqual(["machine:m-leg-ext"]);
    expect(backlinksOf(g, "machine:m-leg-ext").map((b) => b.node.id)).toEqual(["machine:m-leg-press"]);
  });

  it("has nothing to say without a graph, a node, or a node the graph does not have", () => {
    expect(backlinksOf(null, "machine:m-leg-press")).toEqual([]);
    expect(backlinksOf(GRAPH, null)).toEqual([]);
    expect(backlinksOf(GRAPH, undefined)).toEqual([]);
    expect(backlinksOf(GRAPH, "machine:m-nowhere")).toEqual([]);
  });

  it("leaves out what the page already shows, and only that", () => {
    const shown = new Set(["clinical:knee"]);
    expect(linkedHere(GRAPH, "machine:m-leg-press", shown).map((b) => b.node.id)).toEqual(["machine:m-leg-ext", "topic:t-load"]);
    expect(linkedHere(GRAPH, "machine:m-leg-press", new Set())).toEqual(backlinksOf(GRAPH, "machine:m-leg-press"));
    expect(linkedHere(GRAPH, "machine:m-leg-press")).toEqual(backlinksOf(GRAPH, "machine:m-leg-press"));
  });

  it("says each row's why as a sentence about this page", () => {
    const [, , topic] = backlinksOf(GRAPH, "machine:m-leg-press");
    expect(backlinkWhy(topic, "LEG PRESS")).toBe("talks about LEG PRESS");
    expect(backlinkWhy(topic, "  ")).toBe("talks about");
  });
});

describe("say it once", () => {
  it("drops a related link the constellation already draws, keeps one it does not", () => {
    const shown = shownIds(GRAPH, "machine:m-leg-press", 8);
    const related = [
      { route: { kind: "machine", id: "m-leg-ext" } as VaultRoute, title: "Leg Extension", why: "" },
      { route: { kind: "card", id: "lp" } as VaultRoute, title: "Quick reference card", why: "" },
    ];
    expect(withoutShown(related, shown).map((r) => r.title)).toEqual(["Quick reference card"]);
  });

  it("knows nothing is shown without a graph or a node", () => {
    expect(shownIds(null, "machine:m-leg-press", 8).size).toBe(0);
    expect(shownIds(GRAPH, null, 8).size).toBe(0);
  });
});
