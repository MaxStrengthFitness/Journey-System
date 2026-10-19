/**
 * WHERE EACH NODE GOES — the constellation's geometry, by hand and the same
 * every time.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 * WHY HAND-LAID
 * -------------
 * There is no force-layout library in the repo (gaps.md §8), and a force
 * layout is the wrong tool here anyway: it settles differently on every run,
 * so a trainer who learned "the machines are at the top" would find them
 * somewhere else tomorrow. These layouts are pure arithmetic over the graph's
 * own order: the same graph and the same size give the same picture, to the
 * pixel, and a test holds it. No Math.random anywhere.
 *
 * THE TWO SHAPES
 * --------------
 *   layoutConstellation   one node and its links (a page's local
 *                         constellation, the "orbit"): the centre in the
 *                         middle, the links on an ellipse around it, half
 *                         down the right side and half back up the left, so
 *                         every label can run outwards from its dot into the
 *                         margin and none crosses the middle.
 *
 *   layoutMap             the whole map (the Vault's Overview): one SECTOR of
 *                         the circle per domain, sized by how many nodes it
 *                         holds, filled ring by ring from the inside, every
 *                         node at least 44px from its neighbours in its
 *                         sector and in the next. Related domains sit side by
 *                         side (machines beside clinical flags and cue
 *                         moments, topics beside modules and the method's
 *                         words) so the lines between them stay short.
 *
 * WHEN THE MAP DOES NOT FIT
 * -------------------------
 * About 230 nodes at 44px apart need a canvas near 1,000px square; an iPad in
 * portrait has 820. The map never shrinks the spacing to squeeze them in
 * (that would put nodes under a finger's width apart, CLAUDE.md "nothing
 * tappable under 40px"). Instead it shows, in this order, as many as fit:
 * the focus node's own neighbourhood, then each domain's hubs (its most-
 * connected nodes, one domain at a time so every domain keeps a landmark).
 * It says how many it left out (`omitted`), so the screen can say "the rest
 * are in the list" — every map has a list beside it (decision 12).
 *
 * PURE MODULE — no React, no DOM.
 */

import { constellationOf, KIND_PRIORITY } from "./graph";
import type { Constellation, EdgeKind, GraphDomain, GraphNode, VaultGraph } from "./types";

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  /** The dot's radius. Its tap target is drawn separately, at least 22 (44px across). */
  r: number;
  domain: GraphDomain;
  label: string;
  /** Radians from the layout's centre (screen axes, y down). Labels run outwards along it. Absent for the centre. */
  angle?: number;
}

/* ------------------------------------------------------------------ *
 * Shared numbers
 * ------------------------------------------------------------------ */

/** Nodes in one sector are never closer than this (a finger is 44px; Apple HIG). */
export const MIN_SEP = 44;
/** Rings of the map are this far apart. */
export const RING_GAP = 48;
/**
 * How wide a map label may run before it wraps: a renderer's budget, and the
 * most side margin the map keeps for it (a narrow canvas keeps less, see
 * mapSideRoom, so a phone still has a ring to draw on).
 */
export const MAP_LABEL_WIDTH = 96;

/** The margin left and right of the outer ring for labels: 16% of the width, 48 to MAP_LABEL_WIDTH + 8. */
export function mapSideRoom(width: number): number {
  return Math.min(MAP_LABEL_WIDTH + 8, Math.max(48, Math.round(width * 0.16)));
}
/** The margin above and below the outer ring, for a label's line or two. */
const MAP_LABEL_END = 40;

/** The order sectors go round the map, clockwise from the top. */
export const MAP_SECTOR_ORDER: GraphDomain[] = [
  "machine",
  "clinical",
  "playbook",
  "module",
  "topic",
  "method",
  "equipment",
  "cue",
];

const DOT = 7;
const HUB_DOT = 9;
const MODULE_DOT = 11;
const CENTRE_DOT = 15;

function dotFor(node: GraphNode): number {
  if (node.domain === "module") return MODULE_DOT;
  return node.weight >= 12 ? HUB_DOT : DOT;
}

/**
 * Where a node's label goes so it never sits on its own dot: outwards along
 * the node's angle. Right of the middle the words start after the dot; left
 * of it they end before it; near the top and bottom they centre above or
 * below. A node with no angle (the centre) takes its label underneath.
 */
export function labelPlacement(
  node: PlacedNode,
  gap = 6,
): { x: number; y: number; anchor: "start" | "middle" | "end"; side: "left" | "right" | "above" | "below" } {
  if (node.angle === undefined) return { x: node.x, y: node.y + node.r + gap, anchor: "middle", side: "below" };
  const cos = Math.cos(node.angle);
  const sin = Math.sin(node.angle);
  if (cos > 0.35) return { x: node.x + node.r + gap, y: node.y, anchor: "start", side: "right" };
  if (cos < -0.35) return { x: node.x - node.r - gap, y: node.y, anchor: "end", side: "left" };
  if (sin < 0) return { x: node.x, y: node.y - node.r - gap, anchor: "middle", side: "above" };
  return { x: node.x, y: node.y + node.r + gap, anchor: "middle", side: "below" };
}

/* ------------------------------------------------------------------ *
 * How wide a label is, before it is drawn
 * ------------------------------------------------------------------ */

/**
 * About how wide one character is, in ems of its font (Geist at 600-700, the
 * weight Learning's labels use). Capitals are wider than small letters, so a
 * name in capitals ("LEG PRESS", the catalog's own spelling) is measured as
 * one, not as "leg press": the flat per-character guess this replaced read
 * capitals as small letters, said "PRESS" fitted a box it did not, and the
 * browser broke it mid-word ("PRES S"). A slight overestimate on purpose:
 * a name guessed too wide shows a glyph, one guessed too narrow breaks.
 */
function charEm(ch: string): number {
  if (ch === " ") return 0.28;
  if (/[A-Z]/.test(ch)) {
    if (/[IJ]/.test(ch)) return 0.34;
    if (/[MW]/.test(ch)) return 0.9;
    if (/[EFLPSTZ]/.test(ch)) return 0.63;
    return 0.72;
  }
  if (/[a-z]/.test(ch)) {
    if (/[ijl]/.test(ch)) return 0.28;
    if (/[ft]/.test(ch)) return 0.36;
    if (ch === "r") return 0.4;
    if (/[mw]/.test(ch)) return 0.86;
    return 0.57;
  }
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[.,:;'!|·]/.test(ch)) return 0.3;
  if (/[-\/()]/.test(ch)) return 0.4;
  return 0.64;
}

/** About how many px `text` takes at `fontPx` (one line, unwrapped). */
export function labelWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontPx;
}

/**
 * About how many lines `text` wraps to in a box `maxPx` wide at `fontPx`:
 * word by word, and a word wider than the box broken across lines, as
 * `overflow-wrap: anywhere` breaks it.
 */
export function wrappedLines(text: string, maxPx: number, fontPx: number): number {
  const room = Math.max(1, maxPx);
  const space = labelWidth(" ", fontPx);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = labelWidth(word, fontPx);
    if (used > 0 && used + space + w <= room) {
      used += space + w;
      continue;
    }
    if (used > 0) lines += 1;
    if (w <= room) {
      used = w;
    } else {
      const parts = Math.ceil(w / room);
      lines += parts - 1;
      used = w - (parts - 1) * room;
    }
  }
  return lines;
}

/** True when every word of `text` fits a line `maxPx` wide whole (none would be broken mid-word). */
export function wordsFit(text: string, maxPx: number, fontPx: number): boolean {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => labelWidth(w, fontPx) <= maxPx);
}

/* ------------------------------------------------------------------ *
 * One node and its links (the orbit)
 * ------------------------------------------------------------------ */

/** Room kept above the first and below the last node on each side. */
export const ORBIT_PAD_Y = 26;
/** A side's nodes are at least this far apart vertically. */
export const ORBIT_ROW = 52;
const ORBIT_MIN_H = 180;
/** Nodes nearest the poles keep this much room either side of the middle line. */
const ORBIT_MIN_X = 30;

/** How tall an orbit of `count` links wants to be, for rows of `row` px (default ORBIT_ROW). */
export function orbitHeight(count: number, row = ORBIT_ROW): number {
  const perSide = Math.ceil(Math.max(0, count) / 2);
  return Math.max(ORBIT_MIN_H, 2 * ORBIT_PAD_Y + perSide * Math.max(MIN_SEP, row));
}

/** The ellipse's half-width for a box `w` wide: room for the centre's name, the rest for the labels. */
export function orbitRadiusX(w: number): number {
  return Math.min(120, Math.max(48, Math.round(w * 0.17)));
}

/**
 * The centre in the middle; the first half of the links down the right side,
 * the rest back up the left (clockwise, so a group of links stays together).
 * Each side's nodes are spread evenly over the height and pushed out onto an
 * ellipse, widest at the middle, so the picture reads as an orbit.
 */
export function layoutConstellation(
  c: Constellation,
  size: { w: number; h: number },
): { center: PlacedNode; points: PlacedNode[] } {
  const w = Math.max(1, size.w);
  const h = Math.max(1, size.h);
  const cx = w / 2;
  const cy = h / 2;
  const center: PlacedNode = {
    id: c.center.id,
    x: cx,
    y: cy,
    r: CENTRE_DOT,
    domain: c.center.domain,
    label: c.center.label,
  };
  const n = c.links.length;
  const right = Math.ceil(n / 2);
  const left = n - right;
  const rx = orbitRadiusX(w);
  const ry = h / 2;
  const top = ORBIT_PAD_Y;
  const bottom = h - ORBIT_PAD_Y;

  const place = (i: number, count: number, side: 1 | -1) => {
    const spacing = (bottom - top) / Math.max(1, count);
    // Right side top to bottom; left side bottom to top.
    const slot = side === 1 ? i : count - 1 - i;
    const y = top + spacing * (slot + 0.5);
    const t = (y - cy) / ry;
    const off = Math.max(ORBIT_MIN_X, rx * Math.sqrt(Math.max(0, 1 - t * t)));
    return { x: cx + side * off, y };
  };

  const points: PlacedNode[] = c.links.map((link, i) => {
    const onRight = i < right;
    const at = onRight ? place(i, right, 1) : place(i - right, left, -1);
    return {
      id: link.node.id,
      x: at.x,
      y: at.y,
      r: DOT,
      domain: link.node.domain,
      label: link.node.label,
      angle: Math.atan2(at.y - cy, at.x - cx),
    };
  });
  return { center, points };
}

/* ------------------------------------------------------------------ *
 * The whole map
 * ------------------------------------------------------------------ */

interface Slot {
  ring: number;
  rho: number;
  angle: number;
}

/** The angle two neighbours on a ring of radius rho must keep to be MIN_SEP apart. */
function stepAt(rho: number): number {
  return 2 * Math.asin(Math.min(1, MIN_SEP / (2 * rho)));
}

function ringsBetween(inner: number, outer: number): number[] {
  const out: number[] = [];
  for (let rho = inner; rho <= outer + 0.0001; rho += RING_GAP) out.push(rho);
  return out;
}

/** How many nodes fit in a sector of `span` radians: one per cell on each ring. */
function capacity(span: number, rings: number[]): number {
  let n = 0;
  for (const rho of rings) n += Math.max(0, Math.floor(span / stepAt(rho)));
  return n;
}

/**
 * `count` slots in a sector, inner rings first; the last ring used spreads
 * its few nodes over the whole span. Sorted by angle (then ring) so the
 * sector's nodes, taken in order, sweep across it in bands.
 */
function sectorSlots(start: number, span: number, rings: number[], count: number): Slot[] {
  const slots: Slot[] = [];
  let left = count;
  rings.forEach((rho, ring) => {
    if (left <= 0) return;
    const cells = Math.max(0, Math.floor(span / stepAt(rho)));
    const take = Math.min(cells, left);
    for (let c = 0; c < take; c += 1) {
      slots.push({ ring, rho, angle: start + (span * (c + 0.5)) / take });
    }
    left -= take;
  });
  return slots.sort((a, b) => a.angle - b.angle || a.ring - b.ring);
}

interface Plan {
  domain: GraphDomain;
  nodes: GraphNode[];
  start: number;
  span: number;
}

/** A sector's share never drops below this many nodes' worth, so a small domain stays findable. */
const MIN_SECTOR_SHARE = 3;

function planSectors(nodes: GraphNode[], domains: GraphDomain[]): Plan[] {
  const byDomain = new Map<GraphDomain, GraphNode[]>();
  for (const n of nodes) {
    const list = byDomain.get(n.domain);
    if (list) list.push(n);
    else byDomain.set(n.domain, [n]);
  }
  const present = domains.filter((d) => (byDomain.get(d)?.length ?? 0) > 0);
  const weights = present.map((d) => Math.max(MIN_SECTOR_SHARE, byDomain.get(d)!.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let at = -Math.PI / 2;
  return present.map((domain, i) => {
    const span = total > 0 ? (2 * Math.PI * weights[i]) / total : 0;
    const plan = { domain, nodes: byDomain.get(domain)!, start: at, span };
    at += span;
    return plan;
  });
}

function fits(nodes: GraphNode[], domains: GraphDomain[], rings: number[]): boolean {
  if (nodes.length === 0) return true;
  if (rings.length === 0) return false;
  return planSectors(nodes, domains).every((p) => p.nodes.length <= capacity(p.span, rings));
}

export interface MapLayout {
  nodes: PlacedNode[];
  edges: { from: string; to: string; kind: EdgeKind }[];
  /** Nodes the canvas had no room for (see the header). 0 when the whole map is drawn. */
  omitted: number;
}

/**
 * The map: sectors by domain, rings from the inside out, the focus (when
 * there is one) in the middle. `domains` narrows it to some domains (the
 * focus stays, whatever its domain). Deterministic: graph order inside each
 * sector, no randomness.
 */
export function layoutMap(
  graph: VaultGraph,
  opts: { width: number; height: number; focus?: string | null; domains?: GraphDomain[] },
): MapLayout {
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const cx = width / 2;
  const cy = height / 2;
  const allowed = opts.domains && opts.domains.length > 0 ? new Set(opts.domains) : null;
  const focus = opts.focus ? graph.nodes.find((n) => n.id === opts.focus) ?? null : null;
  const sectorOrder = MAP_SECTOR_ORDER.filter((d) => !allowed || allowed.has(d));

  const candidates = graph.nodes.filter((n) => n !== focus && (!allowed || allowed.has(n.domain)));
  const inner = focus ? 72 : 56;
  const outer = Math.min(width / 2 - mapSideRoom(width), height / 2 - MAP_LABEL_END);
  const rings = outer >= inner ? ringsBetween(inner, outer) : [];

  let chosen = candidates;
  if (!fits(candidates, sectorOrder, rings)) {
    // Too many for the space: the focus's neighbourhood first, then each
    // domain's hubs in turn (see the header).
    const wanted = new Set(candidates.map((n) => n.id));
    const order: GraphNode[] = [];
    const seen = new Set<string>();
    const push = (n: GraphNode) => {
      if (!seen.has(n.id) && wanted.has(n.id)) {
        seen.add(n.id);
        order.push(n);
      }
    };
    if (focus) {
      for (const link of constellationOf(graph, focus.id, Number.MAX_SAFE_INTEGER)?.links ?? []) push(link.node);
    }
    const hubs = sectorOrder.map((d) =>
      candidates
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.domain === d)
        .sort((a, b) => b.n.weight - a.n.weight || a.i - b.i)
        .map(({ n }) => n),
    );
    for (let i = 0; hubs.some((list) => i < list.length); i += 1) {
      for (const list of hubs) if (i < list.length) push(list[i]);
    }
    let n = order.length;
    while (n > 0 && !fits(order.slice(0, n), sectorOrder, rings)) n -= 1;
    const keep = new Set(order.slice(0, n).map((x) => x.id));
    // Back into graph order, so a sector reads the same whatever was picked.
    chosen = candidates.filter((x) => keep.has(x.id));
  }

  const placed: PlacedNode[] = [];
  if (focus) {
    placed.push({ id: focus.id, x: cx, y: cy, r: CENTRE_DOT, domain: focus.domain, label: focus.label });
  }
  for (const plan of planSectors(chosen, sectorOrder)) {
    const slots = sectorSlots(plan.start, plan.span, rings, plan.nodes.length);
    plan.nodes.forEach((node, i) => {
      const s = slots[i];
      if (!s) return;
      placed.push({
        id: node.id,
        x: cx + s.rho * Math.cos(s.angle),
        y: cy + s.rho * Math.sin(s.angle),
        r: dotFor(node),
        domain: node.domain,
        label: node.label,
        angle: s.angle,
      });
    });
  }

  // One line per pair, the strongest reason, the focus's own lines first.
  const on = new Set(placed.map((p) => p.id));
  const best = new Map<string, { from: string; to: string; kind: EdgeKind; at: number }>();
  graph.edges.forEach((e, at) => {
    if (!on.has(e.from) || !on.has(e.to)) return;
    const key = e.from < e.to ? `${e.from}\n${e.to}` : `${e.to}\n${e.from}`;
    const had = best.get(key);
    if (!had || KIND_PRIORITY.indexOf(e.kind) < KIND_PRIORITY.indexOf(had.kind)) {
      best.set(key, { from: e.from, to: e.to, kind: e.kind, at });
    }
  });
  const touchesFocus = (e: { from: string; to: string }) => (focus ? e.from === focus.id || e.to === focus.id : false);
  const edges = [...best.values()]
    .sort(
      (a, b) =>
        Number(touchesFocus(b)) - Number(touchesFocus(a)) ||
        KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind) ||
        a.at - b.at,
    )
    .map(({ from, to, kind }) => ({ from, to, kind }));

  return { nodes: placed, edges, omitted: candidates.length - (placed.length - (focus ? 1 : 0)) };
}
