/**
 * THE MAP'S ARITHMETIC — the map of Learning as a part any design can use
 * (lifted out of Design 2, the Living Vault, Oct 19 2026, so the mix AJ
 * picked can show the map as a lens on the Catalog and the Academy).
 *
 * The graph says why two things connect (../graph.ts) and places the nodes
 * (../layout.ts, by domain and ring, the same picture every time). This file
 * decides the rest of what the map draws, and nothing here touches React or
 * the DOM:
 *
 *   - what the explorer remembers and how a tap changes it (`MapState`,
 *     `startState`, `focusState`, `backState`, `toggleDomainState`);
 *   - how tall the map is for the room it has (`mapHeight`);
 *   - which labels are drawn, and where, so no two words sit on each other
 *     (`placeLabels`: a greedy pass in priority order, the focus first, its
 *     neighbours next, the busiest node of each domain after; a label that
 *     would overlap one already placed is simply not drawn, and its node is
 *     still a 44px target with its name in the list);
 *   - where each domain's name sits around the edge (`sectorPoints`);
 *   - which stars light, which go hollow, which lines show (`drawPlan`);
 *   - which few nodes to offer before anything is chosen (`startNodes`);
 *   - what the card under the map says about a node (`nodeSummary`).
 *
 * Nothing is scored or stored. Counts here only choose what fits; none is
 * a measure of anyone, and none is drawn.
 */

import type { CSSProperties } from "react";
import { constellationOf, DOMAIN_ORDER, linkHeading, nodeById } from "../graph";
import { labelPlacement, MAP_LABEL_WIDTH, type MapLayout, type PlacedNode } from "../layout";
import type { GraphDomain, GraphNode, VaultGraph } from "../types";
import type { VaultData } from "../useVaultData";

/* ------------------------------------------------------------------ *
 * What the explorer remembers
 * ------------------------------------------------------------------ */

/** What a map remembers while Learning is open: its focus, its trail, which domains, map or list. */
export interface MapState {
  focus: string | null;
  /** The nodes focused before this one, oldest first (the way back across the map). */
  trail: string[];
  /** Domains switched on by the chips; empty means all of them. */
  domains: GraphDomain[];
  mode: "map" | "list";
}

/** Nothing chosen yet. `startState` knows this one object by identity: keep it, never copy it. */
export const NO_MAP_STATE: MapState = { focus: null, trail: [], domains: [], mode: "map" };

/** The trail across the map keeps this many steps back. */
export const TRAIL_MAX = 6;

/**
 * Where an explorer starts when nothing has been chosen there yet: a map
 * page's own focus, if it has one; on a phone the List (review fix, Oct 19
 * 2026: three rows of controls left room for eight stars, so the list is the
 * useful view there, the map one tap away); else the map. Anything the
 * reader chose is kept as they left it.
 */
export function startState(remembered: MapState, opts: { initialFocus: string | null; phone: boolean }): MapState {
  if (remembered !== NO_MAP_STATE) return remembered;
  if (opts.initialFocus) return { ...NO_MAP_STATE, focus: opts.initialFocus };
  if (opts.phone) return { ...NO_MAP_STATE, mode: "list" };
  return NO_MAP_STATE;
}

/**
 * A star chosen (or, with null, the card closed). Choosing one already on
 * the trail goes back to it (the trail after it let go); choosing a new one
 * puts the old focus on the trail, at most `max` steps. The same state comes
 * back when nothing changes.
 */
export function focusState(st: MapState, id: string | null, max = TRAIL_MAX): MapState {
  if (id === null) return st.focus === null && st.trail.length === 0 ? st : { ...st, focus: null, trail: [] };
  if (id === st.focus) return st;
  const at = st.trail.indexOf(id);
  const trail = at >= 0 ? st.trail.slice(0, at) : st.focus ? [...st.trail, st.focus].slice(-max) : st.trail;
  return { ...st, focus: id, trail };
}

/** One step back along the trail; the same state when there is nowhere to go. */
export function backState(st: MapState): MapState {
  if (st.trail.length === 0) return st;
  return { ...st, focus: st.trail[st.trail.length - 1], trail: st.trail.slice(0, -1) };
}

/** A chip tapped: a domain on or off; null is "All" (every domain the map may show). */
export function toggleDomainState(st: MapState, d: GraphDomain | null): MapState {
  if (d === null) return st.domains.length === 0 ? st : { ...st, domains: [] };
  const on = st.domains.includes(d);
  return { ...st, domains: on ? st.domains.filter((x) => x !== d) : [...st.domains, d] };
}

/**
 * The domains the map draws: the ones the host allows (all, when it names
 * none), narrowed by the chips the reader switched on (when chips show).
 * Always in the host's order.
 */
export function shownDomains(allowed: readonly GraphDomain[] | undefined, st: Pick<MapState, "domains">, chips: boolean): GraphDomain[] {
  const list = allowed && allowed.length > 0 ? [...allowed] : [...DOMAIN_ORDER];
  return chips && st.domains.length > 0 ? list.filter((d) => st.domains.includes(d)) : list;
}

/** A domain's name where room is short: a chip, a name on the map. The list says it in full. */
export const CHIP_LABEL: Record<GraphDomain, string> = {
  machine: "Machines",
  method: "The method",
  equipment: "Equipment",
  cue: "Cue moments",
  module: "Modules",
  topic: "Topics",
  clinical: "Clinical",
  playbook: "Playbooks",
};

/* ------------------------------------------------------------------ *
 * The map's size
 * ------------------------------------------------------------------ */

/**
 * How much of the screen a map may take: "page" when the map is the page
 * (the Vault's Overview, a map of its own), "lens" when it is one view of an
 * index (the Catalog's, the Academy's).
 */
export type MapSize = "page" | "lens";

/** Never shorter than this: below it the rings hold too few nodes to read as a map. */
export const MAP_MIN_H = 340;

/** Room kept under the map, inside the scroller, for its "N more in the list" door. */
export const MAP_DOOR_ROOM = 56;

/**
 * How tall the map is. A page's map takes most of an upright iPad's screen
 * (the brief: about 60%); a lens a little less. Never taller than it is
 * wide (layoutMap is a circle: the extra height would be empty), never
 * shorter than MAP_MIN_H.
 *
 * `roomH` is how much of the page's scroller is left below the map's top
 * (scrollerRoom), when it could be measured: the map never runs past it, so
 * on an iPad held sideways its lower ring and its door stay above the
 * bottom bar (review fix, Oct 19 2026: 60% of the window ignored the ~300px
 * of bars above the map). Still never under MAP_MIN_H.
 */
export function mapHeight(width: number, viewportH: number, size: MapSize, roomH?: number | null): number {
  const w = Math.max(0, Math.round(width));
  const vh = Math.max(0, Math.round(viewportH));
  const page = size === "page";
  const share = page ? 0.6 : 0.5;
  const cap = page ? 700 : 560;
  const wanted = Math.min(Math.round(w * (page ? 0.86 : 0.74)), Math.round(vh * share), cap);
  const base = Math.max(MAP_MIN_H, Math.min(Math.max(w, MAP_MIN_H), wanted));
  if (roomH === undefined || roomH === null || !Number.isFinite(roomH)) return base;
  return Math.min(base, Math.max(MAP_MIN_H, Math.round(roomH)));
}

/**
 * The scroller's room below a point, in the scroller's own content
 * coordinates (so a page restored half-scrolled measures the same), less
 * the door's room. `topInViewport` and `scrollerTopInViewport` are
 * getBoundingClientRect().top of the map and of the scroller.
 */
export function scrollerRoom(input: {
  scrollerHeight: number;
  scrollerTopInViewport: number;
  scrollTop: number;
  topInViewport: number;
}): number | null {
  const { scrollerHeight, scrollerTopInViewport, scrollTop, topInViewport } = input;
  if (![scrollerHeight, scrollerTopInViewport, scrollTop, topInViewport].every(Number.isFinite) || scrollerHeight <= 0) return null;
  const top = topInViewport - scrollerTopInViewport + scrollTop;
  return Math.round(scrollerHeight - top - MAP_DOOR_ROOM);
}

/* ------------------------------------------------------------------ *
 * Labels that never sit on each other
 * ------------------------------------------------------------------ */

/** Roughly how wide one character is, by voice (the shared orbit's numbers). */
const CHAR_PX = { label: 7.0, big: 8.2, sub: 6.3 } as const;
const LINE_PX = { label: 15, big: 18, sub: 14 } as const;
/** The label's pill: a little room either side of its words. */
const PAD_X = 6;
const PAD_Y = 2;
/** Two labels never come closer than this (a guessed width can be a few px short). */
const LABEL_GAP = 6;
/**
 * How much wider than its guessed box a drawn label may run (the renderer's
 * max-width is the box plus this, `anchorStyle`): a guess from character
 * counts is a little short for some words, and a label one word too narrow
 * would strand that word on a line of its own. placeLabels keeps this much
 * clear on the label's free side, so the extra can never cover a star or
 * another label (review fix, Oct 19 2026).
 */
export const LABEL_SLACK = 28;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** The lines a label wraps to at a width, and its widest line, in px (greedy, by words). */
export function wrapLabel(text: string, maxPx: number, charPx: number): { lines: number; widest: number } {
  const perLine = Math.max(4, Math.floor(maxPx / charPx));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: 1, widest: 0 };
  let lines = 1;
  let used = 0;
  let widest = 0;
  for (const word of words) {
    let len = word.length;
    // A word longer than a line breaks (overflow-wrap: anywhere).
    while (len > perLine) {
      if (used > 0) {
        widest = Math.max(widest, used);
        lines += 1;
        used = 0;
      }
      widest = Math.max(widest, perLine);
      lines += 1;
      len -= perLine;
    }
    if (used === 0) used = len;
    else if (used + 1 + len <= perLine) used += 1 + len;
    else {
      widest = Math.max(widest, used);
      lines += 1;
      used = len;
    }
  }
  widest = Math.max(widest, used);
  return { lines, widest: Math.min(maxPx, Math.ceil(widest * charPx)) };
}

export interface LabelRequest {
  id: string;
  node: PlacedNode;
  text: string;
  /** A second, quieter line: why this one connects to the focus. */
  sub?: string;
  /** Lower goes first. */
  priority: number;
  /** The focus's own name: a size up. */
  big?: boolean;
  /** Room for a glyph beside the words, in px. */
  extraPx?: number;
}

export interface PlacedLabel {
  id: string;
  text: string;
  sub?: string;
  big: boolean;
  /** The pill's box, inside the map: where it is anchored. */
  box: Box;
  /** Everything the pill may cover once drawn: the box and its slack on the free side. Kept clear of every star and label. */
  reach: Box;
  side: "left" | "right" | "above" | "below";
}

/**
 * A label's box with the slack its renderer may use: on the right for a
 * label right of its star, on the left for one left of it, half each way for
 * one centred above or below. The anchored edge never moves.
 */
export function reachOf(box: Box, side: PlacedLabel["side"], slack = LABEL_SLACK): Box {
  if (slack <= 0) return box;
  switch (side) {
    case "right":
      return { ...box, w: box.w + slack };
    case "left":
      return { ...box, x: box.x - slack, w: box.w + slack };
    case "above":
    case "below":
      return { ...box, x: box.x - slack / 2, w: box.w + slack };
  }
}

function sizeOf(req: LabelRequest, maxPx: number): { w: number; h: number } {
  const voice = req.big ? "big" : "label";
  const main = wrapLabel(req.text, maxPx, CHAR_PX[voice]);
  let w = main.widest;
  let h = main.lines * LINE_PX[voice];
  if (req.sub) {
    const sub = wrapLabel(req.sub, maxPx, CHAR_PX.sub);
    w = Math.max(w, sub.widest);
    h += sub.lines * LINE_PX.sub;
  }
  return { w: Math.ceil(w + 2 * PAD_X + (req.extraPx ?? 0)), h: Math.ceil(h + 2 * PAD_Y) };
}

/** Where a label of this size goes on one side of its node. */
function boxOn(node: PlacedNode, side: PlacedLabel["side"], size: { w: number; h: number }, gap: number): Box {
  const r = node.r;
  switch (side) {
    case "right":
      return { x: node.x + r + gap, y: node.y - size.h / 2, w: size.w, h: size.h };
    case "left":
      return { x: node.x - r - gap - size.w, y: node.y - size.h / 2, w: size.w, h: size.h };
    case "above":
      return { x: node.x - size.w / 2, y: node.y - r - gap - size.h, w: size.w, h: size.h };
    case "below":
      return { x: node.x - size.w / 2, y: node.y + r + gap, w: size.w, h: size.h };
  }
}

/** Shift a box sideways back inside the map; null when it cannot fit there at all. */
function inside(box: Box, bounds: { w: number; h: number }): Box | null {
  if (box.w > bounds.w || box.h > bounds.h) return null;
  if (box.y < 0 || box.y + box.h > bounds.h) return null;
  const x = Math.min(Math.max(box.x, 2), bounds.w - box.w - 2);
  return { ...box, x };
}

/**
 * The labels that fit, in priority order. Each tries its natural side first
 * (outwards along its angle, layout.ts labelPlacement), then below, then
 * above; a label that overlaps one already placed, or any obstacle (a dot
 * that must stay visible), on every side, is left off: a star with no room
 * for its name stays a target, named in the list and the card, rather than
 * hidden under another star's name. Every test is on the label's REACH (its
 * box and the slack its renderer may use, `opts.slack`), so a pill drawn a
 * little wider than guessed still covers nothing. Deterministic.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  bounds: { w: number; h: number },
  obstacles: readonly Box[] = [],
  opts: { maxPx?: number; bigMaxPx?: number; gap?: number; slack?: number } = {},
): PlacedLabel[] {
  const maxPx = opts.maxPx ?? MAP_LABEL_WIDTH;
  const bigMaxPx = opts.bigMaxPx ?? 160;
  const gap = opts.gap ?? 6;
  const slack = Math.max(0, opts.slack ?? 0);
  const placed: PlacedLabel[] = [];
  const order = requests
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
    .map(({ r }) => r);
  const seen = new Set<string>();
  for (const req of order) {
    if (seen.has(req.id) || !req.text.trim()) continue;
    seen.add(req.id);
    const size = sizeOf(req, req.big ? bigMaxPx : maxPx);
    const natural = labelPlacement(req.node, gap).side;
    const sides: PlacedLabel["side"][] = [natural, "below", "above"].filter(
      (s, i, all) => all.indexOf(s) === i,
    ) as PlacedLabel["side"][];
    for (const side of sides) {
      const box = inside(boxOn(req.node, side, size, gap), bounds);
      if (!box) continue;
      const reach = reachOf(box, side, slack);
      if (placed.some((p) => overlaps(p.reach, reach, LABEL_GAP))) continue;
      if (obstacles.some((o) => overlaps(o, reach, 1))) continue;
      placed.push({ id: req.id, text: req.text, sub: req.sub, big: Boolean(req.big), box, reach, side });
      break;
    }
  }
  return placed;
}

/**
 * Where a label sits: pinned by the edge nearest its star (its words may run
 * a little longer or shorter than placeLabels guessed, so the far edge is
 * free), and never wider than the room it was given plus LABEL_SLACK, the
 * slack placeLabels kept clear for it.
 */
export function anchorStyle(l: Pick<PlacedLabel, "box" | "side">, mapW: number): CSSProperties {
  const { x, y, w, h } = l.box;
  const slack = w + LABEL_SLACK;
  switch (l.side) {
    case "right":
      return { left: x, top: y + h / 2, transform: "translateY(-50%)", maxWidth: Math.min(slack, mapW - x - 4) };
    case "left":
      return { right: mapW - (x + w), top: y + h / 2, transform: "translateY(-50%)", maxWidth: Math.min(slack, x + w - 4) };
    case "above":
    case "below": {
      const mid = x + w / 2;
      const maxWidth = Math.min(slack, 2 * Math.min(mid, mapW - mid) - 8);
      return l.side === "above"
        ? { left: mid, top: y + h, transform: "translate(-50%, -100%)", maxWidth }
        : { left: mid, top: y, transform: "translateX(-50%)", maxWidth };
    }
  }
}

/**
 * How many links the card under the map lists. The map names only these
 * (review fix, Oct 19 2026: it asked for 16 while the card listed 14, so it
 * could name a star the card never mentions), so a name on the map is
 * always a pill in the card.
 */
export const CARD_LINKS = 14;

/**
 * The names the map asks to draw around a focus: the focus itself (a size
 * up), then exactly the links its card lists, in the card's order, each
 * with why it connects. A link whose star is not on the map is skipped.
 */
export function focusLabelRequests(
  graph: VaultGraph,
  focus: string,
  at: ReadonlyMap<string, PlacedNode>,
  max = CARD_LINKS,
): LabelRequest[] {
  const out: LabelRequest[] = [];
  const centre = at.get(focus);
  if (centre) out.push({ id: centre.id, node: centre, text: centre.label, priority: 0, big: true });
  const links = constellationOf(graph, focus, max)?.links ?? [];
  links.forEach((link, i) => {
    const p = at.get(link.node.id);
    if (p) out.push({ id: p.id, node: p, text: p.label, sub: linkHeading(link), priority: 10 + i });
  });
  return out;
}

/** A dot as a box, for placeLabels' obstacles. */
export function dotBox(node: Pick<PlacedNode, "x" | "y" | "r">, pad = 2): Box {
  const r = node.r + pad;
  return { x: node.x - r, y: node.y - r, w: 2 * r, h: 2 * r };
}

/**
 * The stars no label may cover. At rest, EVERY star (review fix, Oct 19
 * 2026: only the big ones were, so a name could sit on a small star and read
 * as that star's name). With a focus, every star that is not dimmed: the
 * focus and its neighbours stay visible; a dimmed star may sit under a name.
 */
export function labelObstacles(
  nodes: readonly Pick<PlacedNode, "id" | "x" | "y" | "r">[],
  dimmed: (id: string) => boolean = () => false,
): Box[] {
  const out: Box[] = [];
  for (const n of nodes) if (!dimmed(n.id)) out.push(dotBox(n, 3));
  return out;
}

/* ------------------------------------------------------------------ *
 * The domains' names around the edge
 * ------------------------------------------------------------------ */

export interface SectorPoint {
  domain: GraphDomain;
  /** A stand-in node just outside the domain's outermost ring, on its middle angle. */
  node: PlacedNode;
}

/**
 * One point per domain on the map, for its name: the circular mean of its
 * nodes' angles, a little beyond its farthest node. The focus (no angle) is
 * left out. Domains in DOMAIN_ORDER.
 */
export function sectorPoints(nodes: readonly PlacedNode[], size: { w: number; h: number }, beyond = 16): SectorPoint[] {
  const cx = size.w / 2;
  const cy = size.h / 2;
  const by = new Map<GraphDomain, { sx: number; sy: number; far: number }>();
  for (const n of nodes) {
    if (n.angle === undefined) continue;
    const acc = by.get(n.domain) ?? { sx: 0, sy: 0, far: 0 };
    acc.sx += Math.cos(n.angle);
    acc.sy += Math.sin(n.angle);
    acc.far = Math.max(acc.far, Math.hypot(n.x - cx, n.y - cy));
    by.set(n.domain, acc);
  }
  const out: SectorPoint[] = [];
  for (const domain of DOMAIN_ORDER) {
    const acc = by.get(domain);
    if (!acc) continue;
    const angle = Math.atan2(acc.sy, acc.sx);
    const rho = acc.far + beyond;
    out.push({
      domain,
      node: {
        id: `sector:${domain}`,
        x: cx + rho * Math.cos(angle),
        y: cy + rho * Math.sin(angle),
        r: 0,
        domain,
        label: domain,
        angle,
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * What a node connects to
 * ------------------------------------------------------------------ */

/** The busiest placed nodes of each domain, busiest first, `perDomain` each. */
export function hubsOf(graph: VaultGraph, placed: readonly PlacedNode[], perDomain = 2): string[] {
  const by = new Map<GraphDomain, { id: string; weight: number; i: number }[]>();
  placed.forEach((p, i) => {
    if (p.angle === undefined) return;
    const weight = nodeById(graph, p.id)?.weight ?? 0;
    const list = by.get(p.domain) ?? [];
    list.push({ id: p.id, weight, i });
    by.set(p.domain, list);
  });
  const ranked = DOMAIN_ORDER.map((d) =>
    (by.get(d) ?? []).sort((a, b) => b.weight - a.weight || a.i - b.i).slice(0, perDomain),
  );
  // Round robin: every domain's busiest, then every domain's second.
  const out: string[] = [];
  for (let k = 0; k < perDomain; k += 1) {
    for (const list of ranked) if (list[k]) out.push(list[k].id);
  }
  return out;
}

/**
 * Before anything is chosen: the busiest node of each domain, in the
 * domains' order, at most `max`. A way into the map that is the map's own
 * content, never an instruction.
 */
export function startNodes(graph: VaultGraph | null, max = 6, domains: readonly GraphDomain[] = DOMAIN_ORDER): GraphNode[] {
  if (!graph) return [];
  const out: GraphNode[] = [];
  for (const d of domains) {
    if (d === "module" || d === "topic") continue; // the curriculum has its own index; start with things
    let top: GraphNode | null = null;
    for (const n of graph.nodes) {
      if (n.domain !== d) continue;
      if (!top || n.weight > top.weight) top = n;
    }
    if (top) out.push(top);
    if (out.length >= max) break;
  }
  return out;
}

/** What the card under the map reads about a node: the shared data, these parts of it. */
export type SummaryData = Pick<VaultData, "entities" | "index" | "cues">;

/**
 * One or two sentences about a node for its card under the map, in the
 * source's own words: the concept card's summary when the vault has one (a
 * term, a machine, a rule, a topic, a clinical flag, a playbook), a module's
 * blurb, a cue moment's first note. Null when there is nothing honest to say.
 */
export function nodeSummary(node: Pick<GraphNode, "id" | "domain" | "route">, data: SummaryData): string | null {
  const entity = data.entities?.byId.get(node.id);
  if (entity?.summary.trim()) return entity.summary.trim();
  if (node.route.kind === "module") {
    const id = node.route.moduleId;
    const blurb = data.index.modules.find((m) => m.id === id)?.blurb ?? "";
    return blurb.trim() || null;
  }
  if (node.route.kind === "cueing" && typeof node.route.moment === "number") {
    const c = data.cues?.[node.route.moment];
    const first = c?.notes.find((n) => n.trim()) ?? c?.phrases.find((p) => p.trim());
    return first?.trim() || null;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * What the canvas draws
 * ------------------------------------------------------------------ */

export type NodeState = "focus" | "lit" | "dim" | "rest";

export interface DrawPlan {
  rings: number[];
  edges: { from: string; to: string; x1: number; y1: number; x2: number; y2: number; lit: boolean; domain: GraphDomain }[];
  state: Map<string, NodeState>;
  hollow: Set<string>;
  labels: PlacedLabel[];
  /** Label ids that are a domain's name, with their domain. */
  sectors: Map<string, GraphDomain>;
}

/**
 * Everything the canvas draws, from the layout: the rings, which lines show
 * (with a focus, only its own), which stars light, which labels fit. With
 * `marked` (a floor lens: the studio's own machines), every other machine is
 * drawn hollow.
 */
export function drawPlan(
  graph: VaultGraph,
  layout: Pick<MapLayout, "nodes" | "edges">,
  size: { w: number; h: number },
  focus: string | null,
  marked: ReadonlySet<string> | undefined,
): DrawPlan {
  const at = new Map<string, PlacedNode>(layout.nodes.map((n) => [n.id, n]));
  const cx = size.w / 2;
  const cy = size.h / 2;

  // The rings the stars sit on: each distinct distance from the middle.
  const ringSet = new Set<number>();
  for (const n of layout.nodes) {
    if (n.angle === undefined) continue;
    ringSet.add(Math.round(Math.hypot(n.x - cx, n.y - cy)));
  }
  const rings = [...ringSet].sort((a, b) => a - b).filter((r, i, all) => i === 0 || r - all[i - 1] > 8);

  const state = new Map<string, NodeState>();
  const neighbours = focus ? constellationOf(graph, focus, Number.MAX_SAFE_INTEGER) : null;
  const lit = new Set<string>((neighbours?.links ?? []).map((l) => l.node.id));
  for (const n of layout.nodes) {
    state.set(n.id, !focus ? "rest" : n.id === focus ? "focus" : lit.has(n.id) ? "lit" : "dim");
  }

  // A floor lens: the studio's own machines solid, the rest of their domain hollow.
  const hollow = new Set<string>();
  if (marked && marked.size > 0) {
    for (const n of layout.nodes) if (n.domain === "machine" && !marked.has(n.id)) hollow.add(n.id);
  }

  const edges: DrawPlan["edges"] = [];
  for (const e of layout.edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) continue;
    const touches = focus !== null && (e.from === focus || e.to === focus);
    if (focus && !touches) continue; // with a focus, only its own lines are drawn
    const other = e.from === focus ? b : a;
    // Each line runs from dot edge to dot edge, never through a dot.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    edges.push({
      from: e.from,
      to: e.to,
      x1: a.x + ux * (a.r + 2),
      y1: a.y + uy * (a.r + 2),
      x2: b.x - ux * (b.r + 2),
      y2: b.y - uy * (b.r + 2),
      lit: touches,
      domain: other.domain,
    });
  }

  // Labels: the focus first, then its neighbours in the card's order with
  // why beneath (only the ones the card lists), or (with no focus) each
  // domain's name and its busiest stars. No label covers a star that shows.
  const requests: LabelRequest[] = [];
  const obstacles = labelObstacles(layout.nodes, (id) => state.get(id) === "dim");
  const sectors = new Map<string, GraphDomain>();
  if (focus && neighbours) {
    requests.push(...focusLabelRequests(graph, focus, at, CARD_LINKS));
  } else {
    for (const s of sectorPoints(layout.nodes, size)) {
      sectors.set(s.node.id, s.domain);
      requests.push({ id: s.node.id, node: s.node, text: CHIP_LABEL[s.domain], priority: 0, extraPx: 24 });
    }
    const hubs = hubsOf(graph, layout.nodes, 2);
    hubs.forEach((id, i) => {
      const p = at.get(id);
      if (p) requests.push({ id: p.id, node: p, text: p.label, priority: 10 + i });
    });
    // Then the rest, busiest first, while the budget lasts: a small map names
    // every star; the whole vault names its landmarks and stays calm.
    const rest = layout.nodes
      .filter((n) => n.angle !== undefined && !hubs.includes(n.id))
      .map((n) => ({ n, weight: nodeById(graph, n.id)?.weight ?? 0 }))
      .sort((a, b) => b.weight - a.weight);
    rest.forEach(({ n }, i) => requests.push({ id: n.id, node: n, text: n.label, priority: 100 + i }));
  }
  const budget = focus ? CARD_LINKS + 1 : layout.nodes.length <= 40 ? 40 : 18;
  const labels = placeLabels(requests, size, obstacles, { slack: LABEL_SLACK }).slice(0, budget + (focus ? 0 : 8));
  return { rings, edges, state, hollow, labels, sectors };
}
