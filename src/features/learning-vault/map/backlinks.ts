/**
 * WHAT LINKS HERE — Obsidian's backlinks, for any page of Learning (lifted
 * out of Design 2, the Living Vault, Oct 19 2026, so the mix AJ picked can
 * put "Linked here" at the foot of a page).
 *
 * A page's own constellation (constellationOf, LocalConstellation) says what
 * the page points AT; this says what points at IT, and why, so a reader who
 * lands on the Leg Press sees the topics that talk about it, the flags that
 * affect it and the machines that can stand in for it, each one tap away.
 *
 * Say it once: a page that already draws its constellation leaves those
 * nodes out of "Linked here" (`shownIds` → LinkedHere's `exclude`), and its
 * "read alongside" list leaves out both (`withoutShown`).
 */

import { constellationOf, KIND_PRIORITY, nodeById, nodeIdForRoute } from "../graph";
import type { EdgeKind, GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../types";

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
export function backlinksOf(graph: VaultGraph | null, nodeId: string | null | undefined): Backlink[] {
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

/** The backlinks a page lists: backlinksOf, less the nodes it already shows elsewhere (say it once). */
export function linkedHere(graph: VaultGraph | null, nodeId: string | null | undefined, exclude?: ReadonlySet<string>): Backlink[] {
  const all = backlinksOf(graph, nodeId);
  return exclude && exclude.size > 0 ? all.filter((b) => !exclude.has(b.node.id)) : all;
}

/**
 * One row's why, in a sentence about this page: the edge's own words, then
 * the page's title ("talks about LEG PRESS", "affects LEG PRESS").
 */
export function backlinkWhy(link: Pick<Backlink, "edge">, title: string): string {
  const t = title.trim();
  return t ? `${link.edge.label} ${t}` : link.edge.label;
}

/** The node ids a constellation of at most `max` links draws, for LinkedHere's `exclude` and withoutShown. */
export function shownIds(graph: VaultGraph | null, nodeId: string | null | undefined, max: number): Set<string> {
  const out = new Set<string>();
  if (!graph || !nodeId) return out;
  const c = constellationOf(graph, nodeId, max);
  for (const l of c?.links ?? []) out.add(l.node.id);
  return out;
}

/** A page's related links less the ones its constellation (or "Linked here") already draws (say it once). */
export function withoutShown<T extends { route: VaultRoute }>(related: readonly T[], shownNodeIds: ReadonlySet<string>): T[] {
  return related.filter((r) => {
    const id = nodeIdForRoute(r.route);
    return !id || !shownNodeIds.has(id);
  });
}
