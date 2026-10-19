import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, List, Network, PanelBottomOpen, X } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { usePhone } from "../../phone/device";
import {
  DOMAIN_COLOUR,
  DOMAIN_LABEL,
  DOMAIN_NOUN,
  DOMAIN_ORDER,
  constellationOf,
  groupLinks,
  nodeById,
} from "../../learning-vault/graph";
import { layoutMap, type MapLayout, type PlacedNode } from "../../learning-vault/layout";
import { isPageRoute } from "../../learning-vault/routes";
import type { GraphDomain, GraphNode, VaultGraph } from "../../learning-vault/types";
import { DOMAIN_ICON } from "../../learning-vault/ui/LocalConstellation";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import {
  CARD_LINKS,
  LABEL_SLACK,
  focusLabelRequests,
  hubsOf,
  labelObstacles,
  mapHeight,
  nodeSummary,
  placeLabels,
  scrollerRoom,
  sectorPoints,
  startNodes,
  type LabelRequest,
  type PlacedLabel,
} from "./map-model";
import { DidNotLoad, NO_EXPLORE, useVaultScreen, type ExploreState } from "./shell";
import "./vault-map.css";

/**
 * THE RUMOR MAP — the Living Vault's signature (Design 2, the Learning vault
 * redesign, Oct 19 2026).
 *
 * Everything in Learning as one sky: machines, the method's words, equipment
 * words, cue moments, the Academy's modules and topics, clinical flags and
 * the Life Transformer playbooks, each domain its own constellation
 * (learning-vault/layout.ts lays them out, the same every time). Tap a star
 * and it comes to the middle: its neighbours light, the lines to them say
 * why they connect, everything else falls back. The card under the map says
 * what it is in the source's own words, lists its links grouped by why, and
 * offers Open (the page) and Peek (the page on the sheet, keeping this one).
 * A tap on any of its links moves the focus there: you wander the vault,
 * Outer Wilds' ship log style, and the trail of where you have been is one
 * tap back.
 *
 * NEVER THE ONLY WAY IN. The drawing is a picture with shortcuts for a
 * finger (every star a 44px target), hidden from a screen reader; the List
 * shows the same stars as rows, grouped by domain (decision 12 of the round:
 * every map has a list, and hover is never the only way). No pinch, no pan:
 * the map is a fixed canvas you tap, so it never fights the page's scroll.
 *
 * A label is drawn only where it fits without touching another (map-model's
 * placeLabels); a star with no room for its name is still a target, and is
 * named in the list and in the card.
 */

export interface MapExplorerProps {
  /** Which remembered state this explorer reads (the Overview's, the Catalog's lens, ...). */
  stateKey: string;
  kind: "home" | "lens";
  /** The domains this map may show; the chips choose among them. All, when absent. */
  domains?: GraphDomain[];
  /** Show the domain chips. */
  chips?: boolean;
  /** Node ids drawn solid; every other node of their domain is drawn hollow (the studio's floor). */
  marked?: ReadonlySet<string>;
  /** Where the map starts when nothing has been chosen yet (a map page's own focus). */
  initialFocus?: string | null;
  /** Map or list, when the page's own switch decides (the Catalog's and the Academy's lens); its own switch then is not drawn. */
  mode?: ExploreState["mode"];
}

/** The token colours of a domain, as the custom properties vault-map.css reads. */
export function domainVars(domain: GraphDomain): CSSProperties {
  const c = DOMAIN_COLOUR[domain];
  return { "--vm-c": c.accent, "--vm-fill": c.fill, "--vm-text": c.text } as CSSProperties;
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

/** The trail across the map keeps this many steps back. */
const TRAIL_MAX = 6;

/**
 * Where an explorer starts when nothing has been chosen there yet: a map
 * page's own focus, if it has one; on a phone the List (review fix, Oct 19
 * 2026: three rows of controls left room for eight stars, so the list is the
 * useful view there, the map one tap away); else the map. Anything the
 * reader chose is kept as they left it.
 */
export function startState(remembered: ExploreState, opts: { initialFocus: string | null; phone: boolean }): ExploreState {
  if (remembered !== NO_EXPLORE) return remembered;
  if (opts.initialFocus) return { ...NO_EXPLORE, focus: opts.initialFocus };
  if (opts.phone) return { ...NO_EXPLORE, mode: "list" };
  return NO_EXPLORE;
}

/** The pressed control went with what it was in: the focus fell to <body>, or nowhere. */
function focusWasLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

export function MapExplorer({ stateKey, kind, domains: allowed, chips = false, marked, initialFocus = null, mode: fixedMode }: MapExplorerProps) {
  const { data, explore, setExplore } = useVaultScreen();
  const phone = usePhone();
  const graph = data.graph;
  const remembered = explore(stateKey);
  const base: ExploreState = startState(remembered, { initialFocus, phone });
  const st: ExploreState = fixedMode ? { ...base, mode: fixedMode } : base;
  const set = (next: ExploreState) => setExplore(stateKey, next);

  const sectionRef = useRef<HTMLElement>(null);
  const startHeadRef = useRef<HTMLHeadingElement>(null);

  // Closing the card, or "Whole map", takes away the button that was pressed
  // (the card gives way to Start with; the map's tools go). A keyboard or
  // VoiceOver reader's place then moves to Start with, never back to the top
  // of the document (review fix, Oct 19 2026). Only when the focus really was
  // lost: a reader who has already moved on keeps their place.
  const cleared = useRef(false);
  useLayoutEffect(() => {
    if (st.focus !== null || !cleared.current) return;
    cleared.current = false;
    if (!focusWasLost()) return;
    try {
      startHeadRef.current?.focus({ preventScroll: true });
    } catch {
      /* focus is a courtesy, never a reason to fail */
    }
  }, [st.focus]);
  const allowedList = allowed && allowed.length > 0 ? allowed : DOMAIN_ORDER;
  const domainsKey = (chips && st.domains.length > 0 ? allowedList.filter((d) => st.domains.includes(d)) : allowedList).join(",");
  // One array per choice of domains, so the map is laid out again only when the choice changes.
  const shown = useMemo(() => domainsKey.split(",") as GraphDomain[], [domainsKey]);

  const focusNode = graph && st.focus ? nodeById(graph, st.focus) : null;

  const focusOn = (id: string | null) => {
    if (id === null) {
      if (st.focus !== null) cleared.current = true;
      set({ ...st, focus: null, trail: [] });
      return;
    }
    if (id === st.focus) return;
    const at = st.trail.indexOf(id);
    const trail = at >= 0 ? st.trail.slice(0, at) : st.focus ? [...st.trail, st.focus].slice(-TRAIL_MAX) : st.trail;
    set({ ...st, focus: id, trail });
  };
  /** A focus chosen in the card: bring the map up, so the reader sees it move there. */
  const wander = (id: string | null) => {
    focusOn(id);
    if (st.mode === "map") showMap(sectionRef.current);
  };
  const back = () => {
    if (st.trail.length === 0) return;
    const prev = st.trail[st.trail.length - 1];
    set({ ...st, focus: prev, trail: st.trail.slice(0, -1) });
  };
  const toggleDomain = (d: GraphDomain | null) => {
    if (d === null) {
      set({ ...st, domains: [] });
      return;
    }
    const on = st.domains.includes(d);
    set({ ...st, domains: on ? st.domains.filter((x) => x !== d) : [...st.domains, d] });
  };
  const setMode = (mode: ExploreState["mode"]) => {
    if (mode !== st.mode) set({ ...st, mode });
  };

  if (!graph) {
    // The map is drawn from the reference chunks: one that cannot arrive is
    // said, with the reader's Try again, never a spinner that never ends.
    return (
      <section className="vm__explore" data-kind={kind}>
        <div className="vm__mapcard vm__mapcard--wait">
          {data.referenceFailed ? (
            <DidNotLoad retry={data.retryReference} onPanel />
          ) : (
            <LoadingMark size="sm" label="Drawing the map…" />
          )}
        </div>
      </section>
    );
  }

  const card = focusNode ? (
    <FocusCard
      graph={graph}
      node={focusNode}
      trail={st.trail}
      onFocus={wander}
      onBack={() => {
        back();
        if (st.mode === "map") showMap(sectionRef.current);
      }}
      onClear={() => focusOn(null)}
    />
  ) : (
    <StartWith graph={graph} domains={shown} onFocus={wander} headRef={startHeadRef} />
  );

  return (
    <section className="vm__explore" ref={sectionRef} data-kind={kind} data-mode={st.mode} aria-label="The map of Learning">
      {(chips || !fixedMode) && (
        <div className="vm__tools">
          {chips && (
            <div className="vm__chips" role="group" aria-label="Which parts of Learning to show">
              <button
                type="button"
                className="vm__chip"
                aria-pressed={st.domains.length === 0}
                onClick={() => toggleDomain(null)}
              >
                <span>All</span>
              </button>
              {allowedList.map((d) => {
                const Icon = DOMAIN_ICON[d];
                return (
                  <button
                    key={d}
                    type="button"
                    className="vm__chip"
                    style={domainVars(d)}
                    aria-pressed={st.domains.includes(d)}
                    aria-label={DOMAIN_LABEL[d]}
                    onClick={() => toggleDomain(d)}
                  >
                    <span className="vm__chip-icon" aria-hidden="true">
                      <Icon size={14} strokeWidth={2.25} />
                    </span>
                    <span className="vm__chip-text">{CHIP_LABEL[d]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!fixedMode && (
            <div className="vm__seg" role="group" aria-label="Show as">
              <button type="button" className="vm__seg-opt" aria-pressed={st.mode === "map"} onClick={() => setMode("map")}>
                <Network size={16} aria-hidden />
                <span>Map</span>
              </button>
              <button type="button" className="vm__seg-opt" aria-pressed={st.mode === "list"} onClick={() => setMode("list")}>
                <List size={16} aria-hidden />
                <span>List</span>
              </button>
            </div>
          )}
        </div>
      )}

      {st.mode === "map" ? (
        <>
          <MapCanvas
            key={domainsKey}
            graph={graph}
            kind={kind}
            domains={shown}
            focus={focusNode?.id ?? null}
            marked={marked}
            onFocus={focusOn}
            onShowList={fixedMode ? undefined : () => setMode("list")}
          />
          <div className="vm__focus-slot">{card}</div>
        </>
      ) : (
        <>
          <div className="vm__focus-slot">{card}</div>
          <MapList graph={graph} domains={shown} focus={focusNode?.id ?? null} marked={marked} onFocus={focusOn} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The canvas
 * ------------------------------------------------------------------ */

/** A width to lay out for when nothing can be measured (a render test). */
const FALLBACK_W = 720;
const FALLBACK_VH = 1000;
/** Half a star's 44px target. */
const HIT = 22;

function MapCanvas({
  graph,
  kind,
  domains,
  focus,
  marked,
  onFocus,
  onShowList,
}: {
  graph: VaultGraph;
  kind: "home" | "lens";
  domains: GraphDomain[];
  focus: string | null;
  marked?: ReadonlySet<string>;
  onFocus: (id: string | null) => void;
  onShowList?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; vh: number; below: number | null } | null>(null);

  // Laid out for the width it really has, and never taller than the page's
  // scroller has room for below its top (so the lower ring and the door stay
  // on screen on an iPad held sideways). Measured where it cannot throw
  // (KNOWN-TRAPS: a throw in a layout effect takes the screen down), and
  // ResizeObserver only where it exists.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const w = Math.round(el.clientWidth) || FALLBACK_W;
        const vh = Math.round(window.innerHeight) || FALLBACK_VH;
        const sc = el.closest(".wk__scroll");
        const below =
          sc instanceof HTMLElement
            ? scrollerRoom({
                scrollerHeight: sc.clientHeight,
                scrollerTopInViewport: sc.getBoundingClientRect().top,
                scrollTop: sc.scrollTop,
                topInViewport: el.getBoundingClientRect().top,
              })
            : null;
        setRoom((prev) => (prev && prev.w === w && prev.vh === vh && prev.below === below ? prev : { w, vh, below }));
      } catch {
        setRoom((prev) => prev ?? { w: FALLBACK_W, vh: FALLBACK_VH, below: null });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      try {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      } catch {
        ro = null;
      }
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  const w = room?.w ?? 0;
  const h = room ? mapHeight(room.w, room.vh, kind, room.below) : 0;
  const layout = useMemo<MapLayout | null>(
    () => (w > 0 ? layoutMap(graph, { width: w, height: h, focus, domains }) : null),
    [graph, w, h, focus, domains],
  );

  const picture = useMemo(() => (layout ? drawPlan(graph, layout, { w, h }, focus, marked) : null), [graph, layout, w, h, focus, marked]);

  return (
    <div className="vm__mapcard">
      <div className="vm__map" ref={boxRef} style={h ? { height: h } : undefined} data-focused={focus ? "" : undefined}>
        {picture && layout && (
          <div className="vm__map-canvas" aria-hidden="true">
            <svg className="vm__map-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} focusable="false">
              {picture.rings.map((r) => (
                <circle key={r} className="vm__ring" cx={w / 2} cy={h / 2} r={r} />
              ))}
              <g key={`edges:${focus ?? ""}`} className="vm__edges">
                {picture.edges.map((e) => (
                  <line
                    key={`${e.from}|${e.to}`}
                    className="vm__edge"
                    data-lit={e.lit ? "" : undefined}
                    style={e.lit ? domainVars(e.domain) : undefined}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                  />
                ))}
              </g>
            </svg>
            {layout.nodes.map((n) => (
              <button
                key={n.id}
                type="button"
                tabIndex={-1}
                aria-label={n.label}
                className="vm__node"
                data-state={picture.state.get(n.id) ?? "rest"}
                data-hollow={picture.hollow.has(n.id) ? "" : undefined}
                style={{ ...domainVars(n.domain), transform: `translate(${n.x - HIT}px, ${n.y - HIT}px)` }}
                onClick={() => onFocus(n.id)}
              >
                <span className="vm__dot" style={{ width: 2 * n.r, height: 2 * n.r }} />
              </button>
            ))}
            {picture.labels.map((l) => {
              const sector = picture.sectors.get(l.id);
              const style: CSSProperties = { ...anchorStyle(l, w), ...(sector ? domainVars(sector) : {}) };
              const Icon = sector ? DOMAIN_ICON[sector] : null;
              return (
                <span
                  key={`${focus ?? ""}:${l.id}`}
                  className={sector ? "vm__sector" : "vm__label"}
                  data-big={l.big ? "" : undefined}
                  data-side={l.side}
                  style={style}
                >
                  {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
                  <span className="vm__label-text">{l.text}</span>
                  {l.sub && <span className="vm__label-sub">{l.sub}</span>}
                </span>
              );
            })}
          </div>
        )}
        {focus && (
          <div className="vm__map-tools">
            <button type="button" className="vm__map-btn" onClick={() => onFocus(null)}>
              <X size={16} aria-hidden />
              <span>Whole map</span>
            </button>
          </div>
        )}
      </div>
      {layout && layout.omitted > 0 && onShowList && (
        <button type="button" className="vm__more" onClick={onShowList}>
          <List size={16} aria-hidden />
          <span>{layout.omitted === 1 ? "1 more in the list" : `${layout.omitted} more in the list`}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Where a label sits: pinned by the edge nearest its star (its words may run
 * a little longer or shorter than map-model guessed, so the far edge is free),
 * and never wider than the room it was given plus LABEL_SLACK, the slack
 * placeLabels kept clear for it.
 */
function anchorStyle(l: PlacedLabel, mapW: number): CSSProperties {
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

type NodeState = "focus" | "lit" | "dim" | "rest";

interface DrawPlan {
  rings: number[];
  edges: { from: string; to: string; x1: number; y1: number; x2: number; y2: number; lit: boolean; domain: GraphDomain }[];
  state: Map<string, NodeState>;
  hollow: Set<string>;
  labels: PlacedLabel[];
  /** Label ids that are a domain's name, with their domain. */
  sectors: Map<string, GraphDomain>;
}

/** Everything the canvas draws, from the layout: lines, which stars light, which labels fit. */
function drawPlan(
  graph: VaultGraph,
  layout: MapLayout,
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

/* ------------------------------------------------------------------ *
 * The list: the same stars, as rows
 * ------------------------------------------------------------------ */

function MapList({
  graph,
  domains,
  focus,
  marked,
  onFocus,
}: {
  graph: VaultGraph;
  domains: GraphDomain[];
  focus: string | null;
  marked?: ReadonlySet<string>;
  onFocus: (id: string) => void;
}) {
  const groups = useMemo(
    () =>
      domains
        .map((d) => ({ domain: d, nodes: graph.nodes.filter((n) => n.domain === d) }))
        .filter((g) => g.nodes.length > 0),
    [graph, domains],
  );
  return (
    <div className="vm__list">
      {groups.map((g) => {
        const Icon = DOMAIN_ICON[g.domain];
        return (
          <section key={g.domain} className="vm__list-group" style={domainVars(g.domain)} aria-label={DOMAIN_LABEL[g.domain]}>
            <h3 className="vm__list-head">
              <span className="vm__chip-icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2.25} />
              </span>
              {DOMAIN_LABEL[g.domain]}
            </h3>
            <ul className="vm__list-rows">
              {g.nodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="vm__list-row"
                    aria-current={n.id === focus ? "true" : undefined}
                    onClick={() => {
                      onFocus(n.id);
                      scrollToCard();
                    }}
                  >
                    <span
                      className="vm__list-dot"
                      data-hollow={marked && marked.size > 0 && n.domain === "machine" && !marked.has(n.id) ? "" : undefined}
                      aria-hidden="true"
                    />
                    <span className="vm__list-label">{n.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The map's top into view when its top has scrolled away (a star chosen in
 * the card below it), so the reader sees the map re-lay itself. Smooth only
 * when motion is welcome; never throws.
 */
function showMap(section: HTMLElement | null) {
  try {
    const map = section?.querySelector<HTMLElement>(".vm__mapcard");
    const scroller = section?.closest(".wk__scroll");
    if (!map || !scroller || typeof map.scrollIntoView !== "function") return;
    if (map.getBoundingClientRect().top >= scroller.getBoundingClientRect().top) return;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  } catch {
    /* a page that cannot be measured stays where it is */
  }
}

/** After a row in the list is chosen, its card (above the list) comes into view. */
function scrollToCard() {
  try {
    const card = document.querySelector<HTMLElement>(".vm__focus-slot");
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
  } catch {
    /* a page that cannot be measured stays where it is */
  }
}

/* ------------------------------------------------------------------ *
 * The card under the map
 * ------------------------------------------------------------------ */

function FocusCard({
  graph,
  node,
  trail,
  onFocus,
  onBack,
  onClear,
}: {
  graph: VaultGraph;
  node: GraphNode;
  trail: string[];
  onFocus: (id: string) => void;
  onBack: () => void;
  onClear: () => void;
}) {
  const { data, open, peekAt } = useVaultScreen();
  const summary = nodeSummary(node, data);
  const groups = useMemo(() => {
    const c = constellationOf(graph, node.id, CARD_LINKS);
    return c ? groupLinks(c) : [];
  }, [graph, node.id]);
  const Icon = DOMAIN_ICON[node.domain];
  const page = isPageRoute(node.route);
  const previous = trail.length > 0 ? nodeById(graph, trail[trail.length - 1]) : null;
  const noun = DOMAIN_NOUN[node.domain];
  const titleId = useId();

  return (
    <article className="vm__focus" style={domainVars(node.domain)} aria-labelledby={titleId}>
      {previous && (
        <div className="vm__focus-trail">
          <button type="button" className="vm__back" onClick={onBack} aria-label={`Back to ${previous.label}`}>
            <ArrowLeft size={16} aria-hidden />
            <span>{previous.label}</span>
          </button>
        </div>
      )}
      <div className="vm__focus-head" key={node.id}>
        <span className="vm__mark" aria-hidden="true">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <div className="vm__focus-titles">
          <p className="vm__focus-noun">{noun.charAt(0).toUpperCase() + noun.slice(1)}</p>
          <h2 className="vm__focus-title" id={titleId}>
            {node.label}
          </h2>
        </div>
        <button type="button" className="vm__icon-btn" aria-label="Close the card" onClick={onClear}>
          <X size={18} aria-hidden />
        </button>
      </div>
      {summary && (
        <p className="vm__focus-summary">
          <LinkedText text={summary} skip={node.id} maxLinks={4} />
        </p>
      )}
      {page && (
        <div className="vm__focus-actions">
          <button type="button" className="vm__btn vm__btn--go" onClick={() => open(node.route)}>
            <span>Open page</span>
            <ArrowRight size={16} aria-hidden />
          </button>
          <button type="button" className="vm__btn" onClick={() => peekAt(node.route)}>
            <PanelBottomOpen size={16} aria-hidden />
            <span>Peek</span>
          </button>
        </div>
      )}
      {groups.length > 0 && (
        <div className="vm__focus-links">
          {groups.map((g) => (
            <div key={g.key} className="vm__why">
              <h3 className="vm__why-head">{g.heading}</h3>
              <ul className="vm__pills">
                {g.links.map((l) => {
                  const LIcon = DOMAIN_ICON[l.node.domain];
                  return (
                    <li key={l.node.id}>
                      <button type="button" className="vm__pill" style={domainVars(l.node.domain)} onClick={() => onFocus(l.node.id)}>
                        <span className="vm__pill-mark" aria-hidden="true">
                          <LIcon size={14} strokeWidth={2.25} />
                        </span>
                        <span className="vm__pill-label">{l.node.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/** Before anything is chosen: the busiest star of each domain, as a way in. */
function StartWith({
  graph,
  domains,
  onFocus,
  headRef,
}: {
  graph: VaultGraph;
  domains: GraphDomain[];
  onFocus: (id: string) => void;
  /** Where a reader's place goes when the card they were on closes. */
  headRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const nodes = useMemo(() => startNodes(graph, 6, domains), [graph, domains]);
  if (nodes.length === 0) return null;
  return (
    <div className="vm__start">
      <h2 className="vm__start-head" ref={headRef} tabIndex={-1}>
        Start with
      </h2>
      <ul className="vm__pills">
        {nodes.map((n) => {
          const Icon = DOMAIN_ICON[n.domain];
          return (
            <li key={n.id}>
              <button type="button" className="vm__pill" style={domainVars(n.domain)} onClick={() => onFocus(n.id)}>
                <span className="vm__pill-mark" aria-hidden="true">
                  <Icon size={14} strokeWidth={2.25} />
                </span>
                <span className="vm__pill-label">{n.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
