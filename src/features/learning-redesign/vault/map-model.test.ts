import { describe, expect, it } from "vitest";
import { constellationOf } from "../../learning-vault/graph";
import type { PlacedNode } from "../../learning-vault/layout";
import type { GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../../learning-vault/types";
import {
  CARD_LINKS,
  LABEL_SLACK,
  MAP_DOOR_ROOM,
  focusLabelRequests,
  MAP_MIN_H,
  backlinksOf,
  bodySections,
  dotBox,
  hubsOf,
  labelObstacles,
  letterIndex,
  mapHeight,
  nodeSummary,
  overlaps,
  pathDots,
  peekOnlySection,
  placeLabels,
  reachOf,
  scrollerRoom,
  sectorPoints,
  shownIds,
  startNodes,
  studioLineKeys,
  unionKeys,
  whoSaid,
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
  edge("machine:m-leg-ext", "machine:m-leg-press", "substitutes", "is part of a set that can replace"),
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
  it("never runs past the room the scroller has below it (an iPad held sideways), and never under the minimum", () => {
    // 1180 x 820: 60% of the window is 492, but the scroller has 485 left under the map.
    expect(mapHeight(760, 820, "home")).toBe(492);
    expect(mapHeight(760, 820, "home", 485)).toBe(485);
    expect(mapHeight(760, 820, "home", 120)).toBe(MAP_MIN_H);
    // Room to spare changes nothing; no measure changes nothing.
    expect(mapHeight(788, 1180, "home", 2000)).toBe(mapHeight(788, 1180, "home"));
    expect(mapHeight(788, 1180, "home", null)).toBe(mapHeight(788, 1180, "home"));
    expect(mapHeight(788, 1180, "home", Number.NaN)).toBe(mapHeight(788, 1180, "home"));
  });
});

describe("scrollerRoom", () => {
  it("measures in the scroller's own content, so a page restored half-scrolled measures the same", () => {
    const top = scrollerRoom({ scrollerHeight: 557, scrollerTopInViewport: 183, scrollTop: 0, topInViewport: 199 });
    const scrolled = scrollerRoom({ scrollerHeight: 557, scrollerTopInViewport: 183, scrollTop: 300, topInViewport: -101 });
    expect(top).toBe(557 - 16 - MAP_DOOR_ROOM);
    expect(scrolled).toBe(top);
  });
  it("says nothing when there is nothing to measure", () => {
    expect(scrollerRoom({ scrollerHeight: 0, scrollerTopInViewport: 0, scrollTop: 0, topInViewport: 0 })).toBeNull();
    expect(scrollerRoom({ scrollerHeight: Number.NaN, scrollerTopInViewport: 0, scrollTop: 0, topInViewport: 0 })).toBeNull();
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

  it("keeps the slack a drawn label may use clear of every star (a pill a little wider than guessed covers nothing)", () => {
    const n = placed("n", 100, 150, 7, 0);
    const label: LabelRequest = { id: "n", node: n, text: "Pace", priority: 0 };
    // Without slack the guessed box ends before x = 150; a star just past it is not in the way.
    const plain = placeLabels([label], bounds)[0];
    const star = { x: plain.box.x + plain.box.w + 12, y: 150, r: 7 };
    expect(overlaps(plain.box, dotBox(star, 3), 1)).toBe(false);
    // With the slack, the right side would cover it: the label goes elsewhere, or not at all.
    const out = placeLabels([label], bounds, [dotBox(star, 3)], { slack: LABEL_SLACK });
    for (const l of out) {
      expect(overlaps(l.reach, dotBox(star, 3), 1)).toBe(false);
      expect(l.side).not.toBe("right");
    }
  });

  it("keeps two labels' slack apart, not only their guessed boxes", () => {
    const a = placed("a", 100, 150, 7, 0);
    const b = placed("b", 100 + 7 + 6 + 40 + 20, 150, 7, 0);
    const reqs: LabelRequest[] = [
      { id: "a", node: a, text: "Pace", priority: 0 },
      { id: "b", node: b, text: "Gap", priority: 1 },
    ];
    const out = placeLabels(reqs, bounds, [], { slack: LABEL_SLACK });
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) expect(overlaps(out[i].reach, out[j].reach)).toBe(false);
    }
  });

  it("reaches out only on a label's free side", () => {
    const box = { x: 100, y: 10, w: 50, h: 15 };
    expect(reachOf(box, "right", 28)).toEqual({ x: 100, y: 10, w: 78, h: 15 });
    expect(reachOf(box, "left", 28)).toEqual({ x: 72, y: 10, w: 78, h: 15 });
    expect(reachOf(box, "below", 28)).toEqual({ x: 86, y: 10, w: 78, h: 15 });
    expect(reachOf(box, "above", 0)).toBe(box);
  });

  it("at rest names no star over another, however small (every star is an obstacle)", () => {
    // A 14px star (r = 7) right where "Upper turnaround with a squeeze" would run.
    const named = placed("named", 100, 150, 7, 0);
    const small = placed("small", 150, 150, 7, 0);
    const obstacles = labelObstacles([named, small]);
    expect(obstacles).toHaveLength(2);
    const out = placeLabels(
      [{ id: "named", node: named, text: "Upper turnaround with a squeeze", priority: 0 }],
      bounds,
      obstacles,
      { slack: LABEL_SLACK },
    );
    for (const l of out) expect(overlaps(l.reach, dotBox(small, 3), 1)).toBe(false);
    // A star's own dot never stops its own name.
    expect(placeLabels([{ id: "small", node: small, text: "Gap", priority: 0 }], bounds, labelObstacles([small]), { slack: LABEL_SLACK })).toHaveLength(1);
  });

  it("with a focus, keeps the lit stars clear and lets a dimmed one sit under a name", () => {
    const nodes = [placed("lit", 10, 10), placed("dim", 50, 50)];
    const boxes = labelObstacles(nodes, (id) => id === "dim");
    expect(boxes).toEqual([dotBox(nodes[0], 3)]);
  });
});

describe("focusLabelRequests", () => {
  // A machine that twenty topics talk about: more links than the card lists.
  const topics = Array.from({ length: 20 }, (_, i) =>
    node(`topic:t${i}`, "topic", { kind: "topic", moduleId: "performance", topicId: `t${i}` }, 1),
  );
  const g: VaultGraph = {
    nodes: [NODES[0], ...topics],
    edges: topics.map((t) => edge(t.id, "machine:m-leg-press", "mentions", "talks about")),
  };
  const at = new Map(g.nodes.map((n, i) => [n.id, placed(n.id, 20 * i, 20 * i, 7, i, n.domain)]));

  it("names the focus and exactly the links its card lists, never more", () => {
    const reqs = focusLabelRequests(g, "machine:m-leg-press", at);
    expect(reqs[0]).toMatchObject({ id: "machine:m-leg-press", big: true, priority: 0 });
    expect(reqs).toHaveLength(1 + CARD_LINKS);
    const card = new Set(constellationOf(g, "machine:m-leg-press", CARD_LINKS)!.links.map((l) => l.node.id));
    for (const r of reqs.slice(1)) {
      expect(card.has(r.id)).toBe(true);
      expect(r.sub).toBeTruthy();
    }
  });

  it("skips a link whose star is not on the map", () => {
    const fewer = new Map([...at].filter(([id]) => id !== "topic:t0"));
    expect(focusLabelRequests(g, "machine:m-leg-press", fewer).map((r) => r.id)).not.toContain("topic:t0");
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

describe("whoSaid", () => {
  it("knows when a path's title already says who it is for", () => {
    expect(whoSaid("For a head trainer", "A head trainer")).toBe(true);
    expect(whoSaid("For a studio leader", "A studio leader.")).toBe(true);
    expect(whoSaid("For the studio leader", "a Studio Leader")).toBe(true);
  });
  it("and when it does not", () => {
    expect(whoSaid("Life Transformer 101", "A new Life Transformer")).toBe(false);
    expect(whoSaid("Equipment and cueing", "Anyone sharpening how they set up and cue")).toBe(false);
  });
  it("has nothing to say for an empty who", () => {
    expect(whoSaid("Anything", "  ")).toBe(true);
  });
});

describe("a page's body", () => {
  const sec = (id: string, keys: string[]) => ({ id, title: id, blocks: keys.map((key) => ({ key })) });
  const machine = [sec("leaf-stop", ["s1"]), sec("beat-0", ["b1"]), sec("beat-1", ["b2"]), sec("moment-3", ["c1"]), sec("deep-dive", ["d1"])];

  it("knows which of a machine's sections are better peeked: its spoken script and its deep dive", () => {
    expect(["beat-0", "beat-12", "deep-dive"].every(peekOnlySection)).toBe(true);
    expect(["leaf-stop", "moment-3", "card-target", "beats", "deep-dive-2"].some(peekOnlySection)).toBe(false);
  });

  it("leaves a machine's script and deep dive to their peeks", () => {
    expect(bodySections("machine", machine, new Set()).map((s) => s.id)).toEqual(["leaf-stop", "moment-3"]);
  });

  it("keeps a section that carries one of this studio's marks, so no mark goes missing", () => {
    expect(bodySections("machine", machine, new Set(["b2"])).map((s) => s.id)).toEqual(["leaf-stop", "beat-1", "moment-3"]);
  });

  it("draws every other page whole, the same array", () => {
    expect(bodySections("topic", machine, new Set())).toBe(machine);
    const plain = [sec("leaf-stop", ["s1"])];
    expect(bodySections("machine", plain, new Set())).toBe(plain);
  });
});

describe("the lines that tie a page to this studio (recheck fix, Oct 19 2026)", () => {
  const strike = (blockKey: string) => ({ blockKey }) as never;
  const sub = (studioId: string, targetKey: string, blockKey?: string) => ({ studioId, targetKey, blockKey });
  const sec = (id: string, keys: string[]) => ({ id, title: id, blocks: keys.map((key) => ({ key })) });

  it("takes every line crossed out, noted, or told head office about, this studio's and this page's only", () => {
    const keys = studioLineKeys(
      { strikes: [strike("b1")], notes: [strike("b2")] },
      [sub("solon", "machine:m-leg-press", "b3"), sub("north", "machine:m-leg-press", "b4"), sub("solon", "topic:x", "b5"), sub("solon", "machine:m-leg-press")],
      "solon",
      "machine:m-leg-press",
    );
    expect([...keys].sort()).toEqual(["b1", "b2", "b3"]);
    expect(studioLineKeys(null, [sub("solon", "t", "b3")], null, "t").size).toBe(0);
  });

  it("keeps a beat section for a line told to head office alone", () => {
    const machine = [sec("leaf-stop", ["s1"]), sec("beat-0", ["b1", "b2"]), sec("moment-3", ["m1"])];
    const keys = studioLineKeys(null, [sub("solon", "machine:m-leg-press", "b2")], "solon", "machine:m-leg-press");
    expect(bodySections("machine", machine, keys).map((s) => s.id)).toEqual(["leaf-stop", "beat-0", "moment-3"]);
  });

  it("never lets a kept key go, and hands back the same set when nothing is new", () => {
    const kept = new Set(["b1"]);
    expect(unionKeys(kept, new Set())).toBe(kept);
    expect(unionKeys(kept, new Set(["b1"]))).toBe(kept);
    const more = unionKeys(kept, new Set(["b2"]));
    expect([...more].sort()).toEqual(["b1", "b2"]);
    expect([...kept]).toEqual(["b1"]);
    // The line put back: its key is gone from the markup, never from the visit.
    expect(unionKeys(more, new Set())).toBe(more);
  });
});

describe("letterIndex", () => {
  const letters = (titles: string[]) => titles.map((title) => ({ title }));
  it("lists the glossary's letters in the page's order, with where each is", () => {
    expect(letterIndex(letters(["", "A", "b", "C", "D"]))).toEqual([
      { letter: "A", at: 1 },
      { letter: "B", at: 2 },
      { letter: "C", at: 3 },
      { letter: "D", at: 4 },
    ]);
  });
  it("offers nothing to jump between on a short page, or one not titled by letters", () => {
    expect(letterIndex(letters(["A", "B"]))).toEqual([]);
    expect(letterIndex(letters(["Stop", "Set up", "Get set", "Begin", "The rep"]))).toEqual([]);
  });
});
