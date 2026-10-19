import { describe, expect, it } from "vitest";
import { constellationOf, DOMAIN_ORDER } from "../graph";
import type { PlacedNode } from "../layout";
import type { GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../types";
import {
  CARD_LINKS,
  LABEL_SLACK,
  MAP_DOOR_ROOM,
  MAP_MIN_H,
  NO_MAP_STATE,
  TRAIL_MAX,
  anchorStyle,
  backState,
  dotBox,
  drawPlan,
  focusLabelRequests,
  focusState,
  hubsOf,
  labelObstacles,
  mapHeight,
  nodeSummary,
  overlaps,
  placeLabels,
  reachOf,
  scrollerRoom,
  sectorPoints,
  shownDomains,
  startNodes,
  startState,
  toggleDomainState,
  wrapLabel,
  type LabelRequest,
  type MapState,
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

describe("what the explorer remembers", () => {
  it("starts where the reader left it, else on a map page's focus, else the list on a phone", () => {
    const left = { ...NO_MAP_STATE, mode: "map" as const, focus: "machine:m-leg-press" };
    expect(startState(left, { initialFocus: null, phone: true })).toBe(left);
    expect(startState(NO_MAP_STATE, { initialFocus: "cue:3", phone: true })).toEqual({ ...NO_MAP_STATE, focus: "cue:3" });
    expect(startState(NO_MAP_STATE, { initialFocus: null, phone: true }).mode).toBe("list");
    expect(startState(NO_MAP_STATE, { initialFocus: null, phone: false })).toBe(NO_MAP_STATE);
    // A copy of "nothing chosen" is something chosen: only the one object starts fresh.
    const copy: MapState = { ...NO_MAP_STATE };
    expect(startState(copy, { initialFocus: "cue:3", phone: true })).toBe(copy);
  });

  it("puts the old focus on the trail, and goes back along it", () => {
    const a = focusState(NO_MAP_STATE, "machine:m-leg-press");
    expect(a).toMatchObject({ focus: "machine:m-leg-press", trail: [] });
    const b = focusState(a, "cue:0");
    expect(b).toMatchObject({ focus: "cue:0", trail: ["machine:m-leg-press"] });
    const c = focusState(b, "term:pace");
    expect(c.trail).toEqual(["machine:m-leg-press", "cue:0"]);
    expect(backState(c)).toMatchObject({ focus: "cue:0", trail: ["machine:m-leg-press"] });
    // Choosing one already on the trail goes back to it, the trail after it let go.
    expect(focusState(c, "machine:m-leg-press")).toMatchObject({ focus: "machine:m-leg-press", trail: [] });
  });

  it("keeps the trail short, and changes nothing for the star already chosen or a card already closed", () => {
    let st: MapState = NO_MAP_STATE;
    for (let i = 0; i < TRAIL_MAX + 4; i += 1) st = focusState(st, `cue:${i}`);
    expect(st.trail).toHaveLength(TRAIL_MAX);
    expect(focusState(st, st.focus)).toBe(st);
    expect(backState(NO_MAP_STATE)).toBe(NO_MAP_STATE);
    expect(focusState(NO_MAP_STATE, null)).toBe(NO_MAP_STATE);
    // Closing the card lets the whole trail go.
    expect(focusState(st, null)).toMatchObject({ focus: null, trail: [] });
  });

  it("turns a domain on and off, and All shows every domain again", () => {
    const one = toggleDomainState(NO_MAP_STATE, "machine");
    expect(one.domains).toEqual(["machine"]);
    const two = toggleDomainState(one, "cue");
    expect(two.domains).toEqual(["machine", "cue"]);
    expect(toggleDomainState(two, "machine").domains).toEqual(["cue"]);
    expect(toggleDomainState(two, null).domains).toEqual([]);
    expect(toggleDomainState(NO_MAP_STATE, null)).toBe(NO_MAP_STATE);
  });

  it("draws the domains the host allows, in its order, narrowed by the chips only when they show", () => {
    const st = { ...NO_MAP_STATE, domains: ["cue", "machine"] as MapState["domains"] };
    expect(shownDomains(undefined, NO_MAP_STATE, true)).toEqual(DOMAIN_ORDER);
    expect(shownDomains(["machine", "clinical", "cue"], st, true)).toEqual(["machine", "cue"]);
    expect(shownDomains(["machine", "clinical", "cue"], st, false)).toEqual(["machine", "clinical", "cue"]);
    expect(shownDomains([], st, false)).toEqual(DOMAIN_ORDER);
  });
});

describe("mapHeight", () => {
  it("takes most of an upright iPad for a map that is the page, never more than it is wide", () => {
    const h = mapHeight(788, 1180, "page");
    expect(h).toBeGreaterThanOrEqual(600);
    expect(h).toBeLessThanOrEqual(788);
  });
  it("is shorter for a lens than for a page", () => {
    expect(mapHeight(788, 1180, "lens")).toBeLessThan(mapHeight(788, 1180, "page"));
  });
  it("never drops under the minimum, even on a phone or with no room measured", () => {
    expect(mapHeight(358, 844, "page")).toBe(MAP_MIN_H);
    expect(mapHeight(0, 0, "page")).toBe(MAP_MIN_H);
  });
  it("never runs past the room the scroller has below it (an iPad held sideways), and never under the minimum", () => {
    // 1180 x 820: 60% of the window is 492, but the scroller has 485 left under the map.
    expect(mapHeight(760, 820, "page")).toBe(492);
    expect(mapHeight(760, 820, "page", 485)).toBe(485);
    expect(mapHeight(760, 820, "page", 120)).toBe(MAP_MIN_H);
    // Room to spare changes nothing; no measure changes nothing.
    expect(mapHeight(788, 1180, "page", 2000)).toBe(mapHeight(788, 1180, "page"));
    expect(mapHeight(788, 1180, "page", null)).toBe(mapHeight(788, 1180, "page"));
    expect(mapHeight(788, 1180, "page", Number.NaN)).toBe(mapHeight(788, 1180, "page"));
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

describe("anchorStyle", () => {
  const box = { x: 100, y: 40, w: 60, h: 20 };
  it("pins a label by the edge nearest its star, never wider than its room and slack", () => {
    expect(anchorStyle({ box, side: "right" }, 400)).toEqual({ left: 100, top: 50, transform: "translateY(-50%)", maxWidth: 60 + LABEL_SLACK });
    expect(anchorStyle({ box, side: "left" }, 400)).toEqual({ right: 240, top: 50, transform: "translateY(-50%)", maxWidth: 60 + LABEL_SLACK });
    expect(anchorStyle({ box, side: "below" }, 400)).toMatchObject({ left: 130, top: 40, transform: "translateX(-50%)" });
    expect(anchorStyle({ box, side: "above" }, 400)).toMatchObject({ left: 130, top: 60, transform: "translate(-50%, -100%)" });
  });
  it("keeps a label near the map's edge inside it", () => {
    const near = { x: 360, y: 40, w: 36, h: 20 };
    expect(anchorStyle({ box: near, side: "right" }, 400).maxWidth).toBe(400 - 360 - 4);
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

describe("where to start", () => {
  it("offers the busiest of each domain to start with, never a module or a topic", () => {
    const start = startNodes(GRAPH, 6);
    expect(start.map((n) => n.id)).toEqual(["machine:m-leg-press", "term:pace", "cue:0", "clinical:knee"]);
    expect(startNodes(null)).toEqual([]);
  });

  it("offers only the domains the map shows", () => {
    expect(startNodes(GRAPH, 6, ["machine", "clinical", "cue"]).map((n) => n.id)).toEqual(["machine:m-leg-press", "clinical:knee", "cue:0"]);
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

describe("drawPlan", () => {
  // Every node on a ring around the middle of a 400 x 400 map, the focus (no angle) in the middle.
  const ring = (focus: string | null) =>
    NODES.map((n, i) => {
      if (n.id === focus) return placed(n.id, 200, 200, 12, undefined, n.domain);
      const a = (i / NODES.length) * 2 * Math.PI;
      return placed(n.id, 200 + 150 * Math.cos(a), 200 + 150 * Math.sin(a), 7, a, n.domain);
    });
  const size = { w: 400, h: 400 };

  it("at rest draws every line, lights nothing, and names the domains", () => {
    const plan = drawPlan(GRAPH, { nodes: ring(null), edges: EDGES }, size, null, undefined);
    expect(plan.edges).toHaveLength(EDGES.length);
    expect(plan.edges.every((e) => !e.lit)).toBe(true);
    expect([...plan.state.values()].every((s) => s === "rest")).toBe(true);
    expect(plan.rings).toEqual([150]);
    expect(plan.sectors.size).toBeGreaterThan(0);
  });

  it("with a focus, draws only its own lines, lights its neighbours and dims the rest", () => {
    const plan = drawPlan(GRAPH, { nodes: ring("term:pace"), edges: EDGES }, size, "term:pace", undefined);
    expect(plan.edges.map((e) => `${e.from}|${e.to}`)).toEqual(["topic:t-load|term:pace"]);
    expect(plan.edges[0].lit).toBe(true);
    expect(plan.state.get("term:pace")).toBe("focus");
    expect(plan.state.get("topic:t-load")).toBe("lit");
    expect(plan.state.get("machine:m-leg-press")).toBe("dim");
    // The focus is named, a size up; no domain names around a focus.
    expect(plan.labels.find((l) => l.id === "term:pace")?.big).toBe(true);
    expect(plan.sectors.size).toBe(0);
  });

  it("draws a machine off the studio's floor hollow, and nothing hollow with no floor", () => {
    const floor = new Set(["machine:m-leg-press"]);
    const plan = drawPlan(GRAPH, { nodes: ring(null), edges: EDGES }, size, null, floor);
    expect([...plan.hollow]).toEqual(["machine:m-leg-ext"]);
    expect(drawPlan(GRAPH, { nodes: ring(null), edges: EDGES }, size, null, new Set()).hollow.size).toBe(0);
  });

  it("runs each line from dot edge to dot edge, never through a dot", () => {
    const plan = drawPlan(GRAPH, { nodes: ring(null), edges: EDGES }, size, null, undefined);
    const nodes = new Map(ring(null).map((n) => [n.id, n]));
    for (const e of plan.edges) {
      const a = nodes.get(e.from)!;
      expect(Math.hypot(e.x1 - a.x, e.y1 - a.y)).toBeCloseTo(a.r + 2, 5);
    }
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
