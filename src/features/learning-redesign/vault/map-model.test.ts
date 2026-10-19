import { describe, expect, it } from "vitest";
import type { PlacedNode } from "../../learning-vault/layout";
import type { GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../../learning-vault/types";
import {
  MAP_MIN_H,
  backlinksOf,
  connectionCounts,
  dotBox,
  hubsOf,
  mapHeight,
  nodeSummary,
  overlaps,
  pathDots,
  placeLabels,
  sectorPoints,
  shownIds,
  startNodes,
  withoutShown,
  wrapLabel,
  type LabelRequest,
} from "./map-model";

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
  edge("machine:m-leg-ext", "machine:m-leg-press", "substitutes", "is part of a set that replaces"),
  edge("machine:m-leg-press", "cue:0", "cued-at", "is cued at"),
  edge("topic:t-load", "machine:m-leg-press", "mentions", "talks about"),
  edge("topic:t-load", "term:pace", "mentions", "talks about"),
  edge("clinical:knee", "machine:m-leg-press", "affects", "affects"),
  edge("machine:m-leg-press", "machine:m-leg-ext", "same-category", "is in the same family as"),
  edge("topic:t-load", "module:performance", "part-of", "is part of"),
];
const GRAPH: VaultGraph = { nodes: NODES, edges: EDGES };

function placed(id: string, x: number, y: number, r = 7, angle?: number, domain: GraphNode["domain"] = "machine"): PlacedNode {
  return { id, x, y, r, domain, label: id, angle };
}

describe("mapHeight", () => {
  it("takes most of an upright iPad for the Overview, never more than it is wide", () => {
    const h = mapHeight(788, 1180, "home");
    expect(h).toBeGreaterThanOrEqual(600);
    expect(h).toBeLessThanOrEqual(788);
  });
  it("is shorter for a lens than for the Overview", () => {
    expect(mapHeight(788, 1180, "lens")).toBeLessThan(mapHeight(788, 1180, "home"));
  });
  it("never drops under the minimum, even on a phone or with no room measured", () => {
    expect(mapHeight(358, 844, "home")).toBe(MAP_MIN_H);
    expect(mapHeight(0, 0, "home")).toBe(MAP_MIN_H);
  });
});

describe("wrapLabel", () => {
  it("keeps a short name on one line", () => {
    expect(wrapLabel("Pace", 96, 7)).toEqual({ lines: 1, widest: 28 });
  });
  it("wraps by words and never claims more than the room", () => {
    const r = wrapLabel("Lower turnaround, where the stack touches", 96, 7);
    expect(r.lines).toBeGreaterThanOrEqual(3);
    expect(r.widest).toBeLessThanOrEqual(96);
  });
  it("breaks a word longer than a line rather than letting it run out", () => {
    expect(wrapLabel("Supercalifragilisticexpialidocious", 70, 7).lines).toBeGreaterThan(1);
  });
});

describe("placeLabels", () => {
  const bounds = { w: 400, h: 300 };
  it("places labels in priority order and leaves off one that would overlap", () => {
    const a = placed("a", 100, 150, 7, 0);
    const b = placed("b", 104, 152, 7, 0);
    const reqs: LabelRequest[] = [
      { id: "b", node: b, text: "Second", priority: 2 },
      { id: "a", node: a, text: "First", priority: 1 },
    ];
    const out = placeLabels(reqs, bounds);
    expect(out[0].id).toBe("a");
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) expect(overlaps(out[i].box, out[j].box)).toBe(false);
    }
  });
  it("puts a label on the side its angle points to, and keeps it inside the map", () => {
    const right = placeLabels([{ id: "r", node: placed("r", 300, 150, 7, 0), text: "Right", priority: 0 }], bounds)[0];
    expect(right.side).toBe("right");
    const left = placeLabels([{ id: "l", node: placed("l", 100, 150, 7, Math.PI), text: "Left", priority: 0 }], bounds)[0];
    expect(left.side).toBe("left");
    const edge = placeLabels([{ id: "e", node: placed("e", 395, 150, 7, 0), text: "Near the edge", priority: 0 }], bounds)[0];
    expect(edge.box.x + edge.box.w).toBeLessThanOrEqual(bounds.w);
  });
  it("never covers an obstacle dot", () => {
    const n = placed("n", 200, 150, 7, 0);
    const block = dotBox({ x: 230, y: 150, r: 9 });
    const out = placeLabels([{ id: "n", node: n, text: "Covered", priority: 0 }], bounds, [block]);
    for (const l of out) expect(overlaps(l.box, block)).toBe(false);
  });
  it("is the same every time", () => {
    const reqs: LabelRequest[] = NODES.map((g, i) => ({
      id: g.id,
      node: placed(g.id, 60 + i * 40, 100 + (i % 3) * 30, 7, i),
      text: g.label,
      priority: i,
    }));
    expect(placeLabels(reqs, bounds)).toEqual(placeLabels(reqs, bounds));
  });
});

describe("sectorPoints", () => {
  it("puts one point per domain beyond its farthest node, the focus left out", () => {
    const nodes = [
      placed("m1", 200, 100, 7, -Math.PI / 2, "machine"),
      placed("m2", 220, 110, 7, -Math.PI / 2 + 0.2, "machine"),
      placed("t1", 200, 250, 7, Math.PI / 2, "topic"),
      placed("focus", 200, 175, 15, undefined, "cue"),
    ];
    const pts = sectorPoints(nodes, { w: 400, h: 350 });
    expect(pts.map((p) => p.domain)).toEqual(["machine", "topic"]);
    expect(pts[0].node.y).toBeLessThan(100);
    expect(pts[1].node.y).toBeGreaterThan(250);
  });
});

describe("what a node connects to", () => {
  it("counts a machine's links by domain, in the domains' order", () => {
    expect(connectionCounts(GRAPH, "machine:m-leg-press")).toEqual([
      { domain: "machine", count: 1 },
      { domain: "cue", count: 1 },
      { domain: "topic", count: 1 },
      { domain: "clinical", count: 1 },
    ]);
    expect(connectionCounts(GRAPH, "machine:nowhere")).toEqual([]);
    expect(connectionCounts(null, "machine:m-leg-press")).toEqual([]);
  });

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

  it("offers the busiest of each domain to start with, never a module or a topic", () => {
    const start = startNodes(GRAPH, 6);
    expect(start.map((n) => n.id)).toEqual(["machine:m-leg-press", "term:pace", "cue:0", "clinical:knee"]);
    expect(startNodes(null)).toEqual([]);
  });

  it("names each domain's busiest placed nodes, round robin", () => {
    const nodes = [
      placed("machine:m-leg-press", 1, 1, 7, 0, "machine"),
      placed("machine:m-leg-ext", 2, 2, 7, 0, "machine"),
      placed("term:pace", 3, 3, 7, 1, "method"),
    ];
    expect(hubsOf(GRAPH, nodes, 2)).toEqual(["machine:m-leg-press", "term:pace", "machine:m-leg-ext"]);
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
});

describe("nodeSummary", () => {
  const data = {
    entities: {
      byId: new Map([["machine:m-leg-press", { summary: "  Multi-joint lower-body push.  " }]]),
    } as unknown as NonNullable<Parameters<typeof nodeSummary>[1]["entities"]>,
    index: { modules: [{ id: "performance", n: 4, title: "Exercise Performance", blurb: "How a rep is done.", topics: [] }] } as unknown as Parameters<typeof nodeSummary>[1]["index"],
    cues: [{ moment: "Speed of motion", phrases: ["Slow and smooth"], notes: [] }],
  };
  it("says what the source says, trimmed", () => {
    expect(nodeSummary(NODES[0], data)).toBe("Multi-joint lower-body push.");
  });
  it("uses a module's blurb and a cue moment's first line", () => {
    expect(nodeSummary(NODES[6], data)).toBe("How a rep is done.");
    expect(nodeSummary(NODES[2], data)).toBe("Slow and smooth");
  });
  it("says nothing rather than something invented", () => {
    expect(nodeSummary(NODES[5], data)).toBeNull();
  });
});

describe("pathDots", () => {
  it("draws one stop per step, never more than nine", () => {
    expect(pathDots(5)).toBe(5);
    expect(pathDots(14)).toBe(9);
    expect(pathDots(-1)).toBe(0);
  });
});
