/**
 * THE RUMOR MAP'S ARITHMETIC — Design 2, the Living Vault (the Learning vault
 * redesign, Oct 19 2026).
 *
 * The shared parts place the nodes (learning-vault/layout.ts, by domain and
 * ring, the same picture every time) and say why two things connect
 * (learning-vault/graph.ts). This file decides the rest of what the Vault's
 * map and pages draw, and nothing here touches React or the DOM:
 *
 *   - how tall the map is for the room it has (`mapHeight`);
 *   - which labels are drawn, and where, so no two words sit on each other
 *     (`placeLabels`: a greedy pass in priority order, the focus first, its
 *     neighbours next, the busiest node of each domain after; a label that
 *     would overlap one already placed is simply not drawn, and its node is
 *     still a 44px target with its name in the list);
 *   - where each domain's name sits around the edge (`sectorPoints`);
 *   - what one node connects to, counted by domain, for the Catalog's
 *     floor rows (`connectionCounts`), and what links INTO a page, for its
 *     "Linked here" (`backlinksOf`, Obsidian's backlinks);
 *   - which few nodes to offer before anything is chosen (`startNodes`);
 *   - a page's "read next" with anything its constellation already shows
 *     taken out (`withoutShown`: say it once).
 *
 * Nothing is scored or stored. Counts here choose what fits, or say how
 * many things a row connects to; none is a measure of anyone.
 */

import { constellationOf, DOMAIN_ORDER, KIND_PRIORITY, linkHeading, nodeById, nodeIdForRoute } from "../../learning-vault/graph";
import type { PlacedNode } from "../../learning-vault/layout";
import { labelPlacement, MAP_LABEL_WIDTH } from "../../learning-vault/layout";
import type { EdgeKind, GraphDomain, GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../../learning-vault/types";
import type { VaultData } from "../../learning-vault/useVaultData";

/* ------------------------------------------------------------------ *
 * The map's size
 * ------------------------------------------------------------------ */

/** Never shorter than this: below it the rings hold too few nodes to read as a map. */
export const MAP_MIN_H = 340;

/** Room kept under the map, inside the scroller, for its "N more in the list" door. */
export const MAP_DOOR_ROOM = 56;

/**
 * How tall the map is. The Overview's map takes most of an upright iPad's
 * screen (the brief: about 60%); a lens map inside the Catalog or the Academy
 * a little less. Never taller than it is wide (layoutMap is a circle: the
 * extra height would be empty), never shorter than MAP_MIN_H.
 *
 * `roomH` is how much of the page's scroller is left below the map's top
 * (scrollerRoom), when it could be measured: the map never runs past it, so
 * on an iPad held sideways its lower ring and its door stay above the
 * bottom bar (review fix, Oct 19 2026: 60% of the window ignored the ~300px
 * of bars above the map). Still never under MAP_MIN_H.
 */
export function mapHeight(width: number, viewportH: number, kind: "home" | "lens", roomH?: number | null): number {
  const w = Math.max(0, Math.round(width));
  const vh = Math.max(0, Math.round(viewportH));
  const share = kind === "home" ? 0.6 : 0.5;
  const cap = kind === "home" ? 700 : 560;
  const wanted = Math.min(Math.round(w * (kind === "home" ? 0.86 : 0.74)), Math.round(vh * share), cap);
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
 * max-width is the box plus this, RumorMap anchorStyle): a guess from
 * character counts is a little short for some words, and a label one word
 * too narrow would strand that word on a line of its own. placeLabels keeps
 * this much clear on the label's free side, so the extra can never cover a
 * star or another label (review fix, Oct 19 2026).
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

/** How many distinct things a node connects to, per domain, in the domains' own order. Empty for an unknown node. */
export function connectionCounts(graph: VaultGraph | null, nodeId: string | null): { domain: GraphDomain; count: number }[] {
  if (!graph || !nodeId) return [];
  const c = constellationOf(graph, nodeId, Number.MAX_SAFE_INTEGER);
  if (!c) return [];
  const by = new Map<GraphDomain, number>();
  for (const l of c.links) by.set(l.node.domain, (by.get(l.node.domain) ?? 0) + 1);
  return DOMAIN_ORDER.filter((d) => by.has(d)).map((d) => ({ domain: d, count: by.get(d)! }));
}

/** Kinds that read the same both ways: either end "links here". */
const MUTUAL: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["same-category", "see-also"]);

export interface Backlink {
  node: GraphNode;
  edge: GraphEdge;
}

/**
 * What links INTO a node (Obsidian's backlinks): every edge that ends at it,
 * and the mutual ones that start at it (a "same family" or "see also" link
 * reads the same from either end). One per other node, its strongest reason;
 * strongest reasons first, then the graph's own order.
 */
export function backlinksOf(graph: VaultGraph | null, nodeId: string | null): Backlink[] {
  if (!graph || !nodeId || !nodeById(graph, nodeId)) return [];
  const best = new Map<string, { link: Backlink; at: number }>();
  graph.edges.forEach((edge, at) => {
    let other: string | null = null;
    if (edge.to === nodeId) other = edge.from;
    else if (edge.from === nodeId && MUTUAL.has(edge.kind)) other = edge.to;
    if (!other || other === nodeId) return;
    const node = nodeById(graph, other);
    if (!node) return;
    const had = best.get(other);
    if (!had || KIND_PRIORITY.indexOf(edge.kind) < KIND_PRIORITY.indexOf(had.link.edge.kind)) {
      best.set(other, { link: { node, edge }, at: had ? had.at : at });
    }
  });
  return [...best.values()]
    .sort((a, b) => KIND_PRIORITY.indexOf(a.link.edge.kind) - KIND_PRIORITY.indexOf(b.link.edge.kind) || a.at - b.at)
    .map((x) => x.link);
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

/** A page's related links less the ones its constellation already draws (say it once). */
export function withoutShown<T extends { route: VaultRoute }>(related: readonly T[], shownNodeIds: ReadonlySet<string>): T[] {
  return related.filter((r) => {
    const id = nodeIdForRoute(r.route);
    return !id || !shownNodeIds.has(id);
  });
}

/** The node ids a constellation of at most `max` links draws, for withoutShown. */
export function shownIds(graph: VaultGraph | null, nodeId: string | null | undefined, max: number): Set<string> {
  const out = new Set<string>();
  if (!graph || !nodeId) return out;
  const c = constellationOf(graph, nodeId, max);
  for (const l of c?.links ?? []) out.add(l.node.id);
  return out;
}

/**
 * One or two sentences about a node for its card under the map, in the
 * source's own words: the concept card's summary when the vault has one (a
 * term, a machine, a rule, a topic, a clinical flag, a playbook), a module's
 * blurb, a cue moment's first note. Null when there is nothing honest to say.
 */
export function nodeSummary(
  node: Pick<GraphNode, "id" | "domain" | "route">,
  data: Pick<VaultData, "entities" | "index" | "cues">,
): string | null {
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

/** Each step of a path as a dot, for the small picture on a track card: never more than `max`. */
export function pathDots(count: number, max = 9): number {
  return Math.max(0, Math.min(max, Math.floor(count)));
}

/* ------------------------------------------------------------------ *
 * Say it once, on the pages
 * ------------------------------------------------------------------ */

/** Lower case, no leading "for", no leading article, no end stop: "For a head trainer." → "head trainer". */
function whoWords(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .replace(/^for\s+/, "")
    .replace(/^(a|an|the)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a reading path's title already says who it is for (review fix,
 * Oct 19 2026): "For a head trainer" over "A head trainer" said it twice. The
 * card's who line and the page's "For …" lede show only when this is false.
 */
export function whoSaid(title: string, who: string): boolean {
  const w = whoWords(who);
  if (!w) return true;
  return whoWords(title).includes(w);
}

/**
 * A machine page's sections the reader would rather PEEK than scroll past:
 * the Academy's spoken script, beat by beat, and its deep dive. Both are
 * pages of their own ("Full spoken script", "Deep dive" under Read
 * alongside), and printed in the machine's body they made it eleven screens
 * long with nothing to jump with (review fix, Oct 19 2026).
 */
export function peekOnlySection(id: string): boolean {
  return /^beat-\d+$/.test(id) || id === "deep-dive";
}

/**
 * The sections a page's body draws. A machine page leaves out its peek-only
 * sections, except one carrying a mark of this studio's (a line crossed out
 * or noted on this page in another design stays where it was marked: no
 * mark ever disappears). Any other page draws every section. Returns the
 * same array when nothing is left out.
 */
export function bodySections<S extends { id: string; blocks: readonly { key: string }[] }>(
  routeKind: VaultRoute["kind"],
  sections: S[],
  markedKeys: ReadonlySet<string>,
): S[] {
  if (routeKind !== "machine") return sections;
  const kept = sections.filter((s) => !peekOnlySection(s.id) || s.blocks.some((b) => markedKeys.has(b.key)));
  return kept.length === sections.length ? sections : kept;
}

/**
 * The glossary's letters, for its row of jumps: each section titled with one
 * letter or digit, in the page's order, with where it is in that order.
 * Empty unless there are enough letters to be worth jumping between.
 */
export function letterIndex(sections: readonly { title: string }[], min = 4): { letter: string; at: number }[] {
  const out: { letter: string; at: number }[] = [];
  sections.forEach((s, at) => {
    const t = s.title.trim();
    if (/^[A-Za-z0-9#]$/.test(t)) out.push({ letter: t.toUpperCase(), at });
  });
  return out.length >= min ? out : [];
}
