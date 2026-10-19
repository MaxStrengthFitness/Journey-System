/**
 * THE CONSTELLATION'S GEOMETRY (Learning vault redesign, Oct 19 2026).
 *
 * Holds layout.ts's promises: the same graph and size give the same picture;
 * no two nodes closer than a finger (44px); everything inside the canvas;
 * the focus in the middle; and when the canvas is too small, the focus's
 * neighbourhood first and every domain's hubs after, with a count of what
 * was left out. Fixtures are made here, so these tests stand on their own.
 */
import { describe, expect, it } from "vitest";
import { constellationOf } from "./graph";
import {
  MAP_LABEL_WIDTH,
  MIN_SEP,
  ORBIT_PAD_Y,
  labelPlacement,
  layoutConstellation,
  layoutMap,
  mapSideRoom,
  orbitHeight,
  type PlacedNode,
} from "./layout";
import type { Constellation, EdgeKind, GraphDomain, GraphEdge, GraphNode, VaultGraph } from "./types";

const DOMAINS: GraphDomain[] = ["machine", "method", "equipment", "cue", "module", "topic", "clinical", "playbook"];

/** A graph shaped like the real one: ~230 nodes, topics the biggest domain, every topic in a module. */
function bigGraph(): VaultGraph {
  const sizes: Record<GraphDomain, number> = {
    machine: 20,
    method: 40,
    equipment: 12,
    cue: 14,
    module: 13,
    topic: 98,
    clinical: 17,
    playbook: 9,
  };
  const nodes: GraphNode[] = [];
  for (const d of DOMAINS) {
    for (let i = 0; i < sizes[d]; i += 1) {
      nodes.push({ id: `${d}:${i}`, label: `${d} ${i}`, domain: d, route: { kind: "map", focus: `${d}:${i}` }, weight: 0 });
    }
  }
  const edges: GraphEdge[] = [];
  const add = (from: string, to: string, kind: EdgeKind) => edges.push({ from, to, kind, label: kind });
  for (let i = 0; i < 98; i += 1) add(`topic:${i}`, `module:${i % 13}`, "part-of");
  for (let i = 0; i < 20; i += 1) {
    for (let k = 0; k < 4; k += 1) add(`topic:${(i * 7 + k * 11) % 98}`, `machine:${i}`, "mentions");
    add(`clinical:${i % 17}`, `machine:${i}`, "affects");
  }
  for (let i = 0; i < 40; i += 1) add(`method:${i}`, `topic:${(i * 3) % 98}`, "explained-in");
  for (let i = 0; i < 14; i += 1) add(`machine:${i}`, `cue:${i}`, "cued-at");
  for (let i = 0; i < 9; i += 1) add(`playbook:${i}`, `machine:${i}`, "playbook-for");
  // Two reasons between one pair: the map draws one line, the stronger.
  add("machine:0", "machine:1", "same-category");
  add("machine:1", "machine:0", "substitutes");
  for (const e of edges) {
    nodes.find((n) => n.id === e.from)!.weight += 1;
    nodes.find((n) => n.id === e.to)!.weight += 1;
  }
  return { nodes, edges };
}

function minDistance(nodes: PlacedNode[]): number {
  let min = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      min = Math.min(min, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    }
  }
  return min;
}

function inside(nodes: PlacedNode[], w: number, h: number): boolean {
  return nodes.every((n) => n.x - n.r >= 0 && n.y - n.r >= 0 && n.x + n.r <= w && n.y + n.r <= h);
}

const G = bigGraph();

describe("layoutMap", () => {
  it("draws the whole graph when the canvas has room, 44px apart, inside the canvas", () => {
    const m = layoutMap(G, { width: 1500, height: 1500 });
    expect(m.omitted).toBe(0);
    expect(m.nodes).toHaveLength(G.nodes.length);
    expect(new Set(m.nodes.map((n) => n.id)).size).toBe(G.nodes.length);
    expect(minDistance(m.nodes)).toBeGreaterThanOrEqual(MIN_SEP - 1e-6);
    expect(inside(m.nodes, 1500, 1500)).toBe(true);
  });

  it("is the same picture every time", () => {
    const a = layoutMap(G, { width: 820, height: 900, focus: "machine:3" });
    const b = layoutMap(G, { width: 820, height: 900, focus: "machine:3" });
    expect(a).toEqual(b);
  });

  it("puts the focus in the middle and keeps its labels' room", () => {
    const m = layoutMap(G, { width: 820, height: 900, focus: "machine:3" });
    expect(m.nodes[0]).toMatchObject({ id: "machine:3", x: 410, y: 450 });
    expect(m.nodes[0].angle).toBeUndefined();
    expect(minDistance(m.nodes)).toBeGreaterThanOrEqual(MIN_SEP - 1e-6);
    const side = mapSideRoom(820);
    expect(side).toBe(MAP_LABEL_WIDTH + 8);
    for (const n of m.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(side - 1e-6);
      expect(n.x).toBeLessThanOrEqual(820 - side + 1e-6);
    }
  });

  it("on an iPad in portrait shows the focus's whole neighbourhood, then hubs from every domain, and says how many it left out", () => {
    const m = layoutMap(G, { width: 820, height: 900, focus: "machine:3" });
    expect(m.omitted).toBeGreaterThan(0);
    expect(m.nodes.length + m.omitted).toBe(G.nodes.length);
    const placed = new Set(m.nodes.map((n) => n.id));
    for (const link of constellationOf(G, "machine:3", 1000)!.links) expect(placed.has(link.node.id), link.node.id).toBe(true);
    for (const d of DOMAINS) expect(m.nodes.some((n) => n.domain === d), d).toBe(true);
    expect(minDistance(m.nodes)).toBeGreaterThanOrEqual(MIN_SEP - 1e-6);
    expect(inside(m.nodes, 820, 900)).toBe(true);
  });

  it("without a focus keeps each domain's best-connected nodes", () => {
    const m = layoutMap(G, { width: 820, height: 900 });
    const placed = new Set(m.nodes.map((n) => n.id));
    for (const d of DOMAINS) {
      const top = G.nodes.filter((n) => n.domain === d).sort((a, b) => b.weight - a.weight)[0];
      expect(placed.has(top.id), d).toBe(true);
    }
  });

  it("still draws a ring on a phone", () => {
    const m = layoutMap(G, { width: 358, height: 600, focus: "machine:3" });
    expect(m.nodes.length).toBeGreaterThan(6);
    expect(minDistance(m.nodes)).toBeGreaterThanOrEqual(MIN_SEP - 1e-6);
    expect(inside(m.nodes, 358, 600)).toBe(true);
  });

  it("with no room at all keeps only the focus", () => {
    const m = layoutMap(G, { width: 120, height: 120, focus: "topic:5" });
    expect(m.nodes.map((n) => n.id)).toEqual(["topic:5"]);
    expect(m.omitted).toBe(G.nodes.length - 1);
    expect(m.edges).toEqual([]);
  });

  it("narrows to the domains asked for, the focus kept whatever its domain", () => {
    const m = layoutMap(G, { width: 1500, height: 1500, focus: "topic:0", domains: ["machine", "clinical"] });
    expect(new Set(m.nodes.slice(1).map((n) => n.domain))).toEqual(new Set(["machine", "clinical"]));
    expect(m.nodes[0].id).toBe("topic:0");
    expect(m.omitted).toBe(0);
  });

  it("gives each domain one unbroken sector", () => {
    const m = layoutMap(G, { width: 1500, height: 1500 });
    const norm = (a: number) => (a + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    const ranges = new Map<GraphDomain, [number, number]>();
    for (const n of m.nodes) {
      const a = norm(n.angle!);
      const r = ranges.get(n.domain);
      ranges.set(n.domain, r ? [Math.min(r[0], a), Math.max(r[1], a)] : [a, a]);
    }
    const sorted = [...ranges.values()].sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i][0]).toBeGreaterThan(sorted[i - 1][1]);
  });

  it("draws one line per pair, the stronger reason, the focus's own lines first", () => {
    const m = layoutMap(G, { width: 1500, height: 1500, focus: "machine:1" });
    const pair = m.edges.filter((e) => [e.from, e.to].sort().join() === ["machine:0", "machine:1"].sort().join());
    expect(pair).toEqual([{ from: "machine:1", to: "machine:0", kind: "substitutes" }]);
    const touches = m.edges.map((e) => e.from === "machine:1" || e.to === "machine:1");
    const firstOther = touches.indexOf(false);
    expect(touches.slice(firstOther).every((t) => !t)).toBe(true);
    const placed = new Set(m.nodes.map((n) => n.id));
    for (const e of m.edges) expect(placed.has(e.from) && placed.has(e.to)).toBe(true);
  });
});

describe("labelPlacement", () => {
  const at = (angle: number | undefined): PlacedNode => ({ id: "x", x: 100, y: 100, r: 7, domain: "topic", label: "x", angle });

  it("runs a label outwards and never over its own dot", () => {
    expect(labelPlacement(at(0))).toMatchObject({ anchor: "start", side: "right", x: 113, y: 100 });
    expect(labelPlacement(at(Math.PI))).toMatchObject({ anchor: "end", side: "left", x: 87 });
    expect(labelPlacement(at(-Math.PI / 2))).toMatchObject({ anchor: "middle", side: "above", y: 87 });
    expect(labelPlacement(at(Math.PI / 2))).toMatchObject({ anchor: "middle", side: "below", y: 113 });
    expect(labelPlacement(at(undefined))).toMatchObject({ side: "below", y: 113 });
  });
});

describe("layoutConstellation", () => {
  const constellation = (n: number): Constellation => {
    const center = G.nodes.find((x) => x.id === "machine:0")!;
    const links = G.nodes.slice(20, 20 + n).map((node) => ({
      node,
      edge: { from: center.id, to: node.id, kind: "mentions" as EdgeKind, label: "talks about" },
      direction: "out" as const,
    }));
    return { center, links };
  };

  it("puts the centre in the middle and every link inside the box", () => {
    const h = orbitHeight(9);
    const { center, points } = layoutConstellation(constellation(9), { w: 360, h });
    expect(center).toMatchObject({ id: "machine:0", x: 180, y: h / 2 });
    expect(points).toHaveLength(9);
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(ORBIT_PAD_Y);
      expect(p.y).toBeLessThanOrEqual(h - ORBIT_PAD_Y);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(360);
    }
  });

  it("goes down the right side, then back up the left", () => {
    const { center, points } = layoutConstellation(constellation(6), { w: 360, h: orbitHeight(6) });
    const right = points.slice(0, 3);
    const left = points.slice(3);
    expect(right.every((p) => p.x > center.x)).toBe(true);
    expect(left.every((p) => p.x < center.x)).toBe(true);
    expect(right[0].y).toBeLessThan(right[2].y);
    expect(left[0].y).toBeGreaterThan(left[2].y);
  });

  it("keeps every dot a finger's width from the next", () => {
    for (const n of [1, 2, 5, 12]) {
      const { center, points } = layoutConstellation(constellation(n), { w: 340, h: orbitHeight(n) });
      expect(minDistance([center, ...points])).toBeGreaterThanOrEqual(MIN_SEP);
    }
  });

  it("is the same every time, and empty with no links", () => {
    const size = { w: 400, h: orbitHeight(7) };
    expect(layoutConstellation(constellation(7), size)).toEqual(layoutConstellation(constellation(7), size));
    expect(layoutConstellation(constellation(0), { w: 300, h: 200 }).points).toEqual([]);
  });

  it("grows taller with more links, and taller rows for long labels", () => {
    expect(orbitHeight(12)).toBeGreaterThan(orbitHeight(4));
    expect(orbitHeight(8, 80)).toBeGreaterThan(orbitHeight(8));
    expect(orbitHeight(0)).toBeGreaterThan(0);
  });
});
