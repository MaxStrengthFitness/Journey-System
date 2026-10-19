import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, List, Network, PanelBottomOpen, X } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { usePhone } from "../../phone/device";
import { DOMAIN_COLOUR, DOMAIN_LABEL, DOMAIN_NOUN, DOMAIN_ORDER, constellationOf, groupLinks, nodeById } from "../graph";
import { layoutMap, type MapLayout } from "../layout";
import { isPageRoute } from "../routes";
import type { GraphDomain, GraphNode, VaultGraph, VaultRoute } from "../types";
import type { VaultData } from "../useVaultData";
import { DOMAIN_ICON } from "../ui/LocalConstellation";
import { LinkedText } from "../ui/LinkedText";
import {
  CARD_LINKS,
  CHIP_LABEL,
  NO_MAP_STATE,
  anchorStyle,
  backState,
  drawPlan,
  focusState,
  mapHeight,
  nodeSummary,
  scrollerRoom,
  shownDomains,
  startNodes,
  startState,
  toggleDomainState,
  type MapSize,
  type MapState,
} from "./map-model";
import "../../wiki/wiki.css";
import "./map.css";

/**
 * THE MAP OF LEARNING — the explorer any design can mount (lifted out of
 * Design 2, the Living Vault's Rumor Map, Oct 19 2026, for the mix AJ
 * picked: "the Vault's map as a lens").
 *
 * Everything in Learning as one sky: machines, the method's words, equipment
 * words, cue moments, the Academy's modules and topics, clinical flags and
 * the Life Transformer playbooks, each domain its own constellation
 * (../layout.ts lays them out, the same every time). Tap a star and it comes
 * to the middle: its neighbours light, the lines to them say why they
 * connect, everything else falls back. The card under the map says what it
 * is in the source's own words, lists its links grouped by why, and offers
 * Open page (`onOpen`) and Peek (`onPeek`, when the host has a peek). A tap
 * on any of its links moves the focus there: you wander, Outer Wilds' ship
 * log style, and the trail of where you have been is one tap back.
 *
 * A LENS, NOT A FRONT DOOR. A host chooses what the map shows (`domains`: a
 * Catalog lens its machines and what connects to them, an Academy lens its
 * modules, topics, words and cue moments), where it starts (`initialFocus`),
 * Map or List (`mode`, when the host's own switch decides), and whether the
 * studio's floor is marked (`marked`: those machines solid, the rest
 * hollow). It may hold the state itself (`state` + `onStateChange`, so a
 * reader coming Back finds the map as they left it) or leave it here.
 *
 * NEVER THE ONLY WAY IN. The drawing is a picture with shortcuts for a
 * finger (every star a 44px target), hidden from a screen reader; the List
 * shows the same stars as rows, grouped by domain (decision 12 of the round:
 * every map has a list, and hover is never the only way). No pinch, no pan:
 * the map is a fixed canvas you tap, so it never fights the page's scroll.
 *
 * A label is drawn only where it fits without touching another
 * (map-model's placeLabels); a star with no room for its name is still a
 * target, and is named in the list and in the card.
 */

/** What the map reads from the shared data (useVaultData): the graph, and the words its card says. */
export type MapData = Pick<VaultData, "graph" | "entities" | "index" | "cues" | "referenceFailed" | "retryReference">;

export interface MapExplorerProps {
  /** The shared data (useVaultData's), or any object with these parts. */
  data: MapData;
  /** Open a node's page (the card's "Open page"). */
  onOpen: (route: VaultRoute) => void;
  /** Peek a node's page, keeping this one (the card's "Peek"). No Peek button without it. */
  onPeek?: (route: VaultRoute) => void;
  /** "page" when the map is the page, "lens" (the default) when it is one view of an index: a little shorter. */
  size?: MapSize;
  /** The domains this map may show; the chips choose among them. All, when absent. */
  domains?: GraphDomain[];
  /** Show the domain chips. */
  chips?: boolean;
  /** Node ids drawn solid; every other machine is drawn hollow (the studio's floor). */
  marked?: ReadonlySet<string>;
  /** Where the map starts when nothing has been chosen yet (a node id, "machine:m-leg-press"). */
  initialFocus?: string | null;
  /** Map or list, when the host's own switch decides; its own switch and the "more in the list" door are then not drawn. */
  mode?: MapState["mode"];
  /** The explorer's state, when the host keeps it (so Back lands on the map as it was left). Uncontrolled when absent. */
  state?: MapState;
  onStateChange?: (next: MapState) => void;
  /** From 1024px wide, the card in a column beside the map (a map that is the page, with nothing docked beside it). */
  cardBeside?: boolean;
  /** The region's name for a screen reader. */
  label?: string;
}

/** The token colours of a domain, as the custom properties map.css reads. */
export function mapDomainVars(domain: GraphDomain): CSSProperties {
  const c = DOMAIN_COLOUR[domain];
  return { "--vtm-c": c.accent, "--vtm-fill": c.fill, "--vtm-text": c.text } as CSSProperties;
}

/** The pressed control went with what it was in: the focus fell to <body>, or nowhere. */
function focusWasLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

export function MapExplorer({
  data,
  onOpen,
  onPeek,
  size = "lens",
  domains: allowed,
  chips = false,
  marked,
  initialFocus = null,
  mode: fixedMode,
  state,
  onStateChange,
  cardBeside = false,
  label = "The map of Learning",
}: MapExplorerProps) {
  const phone = usePhone();
  const graph = data.graph;
  const [own, setOwn] = useState<MapState>(NO_MAP_STATE);
  const remembered = state ?? own;
  const base: MapState = startState(remembered, { initialFocus, phone });
  const st: MapState = fixedMode ? { ...base, mode: fixedMode } : base;
  const set = (next: MapState) => {
    if (next === st) return;
    if (state === undefined) setOwn(next);
    onStateChange?.(next);
  };

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

  const domainsKey = shownDomains(allowed, st, chips).join(",");
  // One array per choice of domains, so the map is laid out again only when the choice changes.
  const shown = useMemo(() => domainsKey.split(",") as GraphDomain[], [domainsKey]);
  const chipDomains = allowed && allowed.length > 0 ? allowed : DOMAIN_ORDER;

  const focusNode = graph && st.focus ? nodeById(graph, st.focus) : null;

  const focusOn = (id: string | null) => {
    if (id === null && st.focus !== null) cleared.current = true;
    set(focusState(st, id));
  };
  /** A focus chosen in the card: bring the map up, so the reader sees it move there. */
  const wander = (id: string | null) => {
    focusOn(id);
    if (st.mode === "map") showMap(sectionRef.current);
  };
  const setMode = (mode: MapState["mode"]) => {
    if (mode !== st.mode) set({ ...st, mode });
  };

  if (!graph) {
    // The map is drawn from the reference chunks: one that cannot arrive is
    // said, with the reader's Try again, never a spinner that never ends.
    return (
      <section className="vtm" data-size={size} aria-label={label}>
        <div className="vtm__mapcard vtm__mapcard--wait">
          {data.referenceFailed ? (
            <div className="vtm__gone" role="status">
              <p className="vtm__gone-title">This part of the Academy didn't load.</p>
              <p className="vtm__gone-body">The connection may have dropped. Nothing you marked is lost.</p>
              {data.retryReference && (
                <button type="button" className="vtm__btn vtm__btn--go" onClick={data.retryReference}>
                  Try again
                </button>
              )}
            </div>
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
      data={data}
      node={focusNode}
      trail={st.trail}
      onFocus={wander}
      onBack={() => {
        set(backState(st));
        if (st.mode === "map") showMap(sectionRef.current);
      }}
      onClear={() => focusOn(null)}
      onOpen={onOpen}
      onPeek={onPeek}
    />
  ) : (
    <StartWith graph={graph} domains={shown} onFocus={wander} headRef={startHeadRef} />
  );

  return (
    <section
      className="vtm"
      ref={sectionRef}
      data-size={size}
      data-mode={st.mode}
      data-beside={cardBeside ? "" : undefined}
      aria-label={label}
    >
      {(chips || !fixedMode) && (
        <div className="vtm__tools">
          {chips && (
            <div className="vtm__chips" role="group" aria-label="Which parts of Learning to show">
              <button type="button" className="vtm__chip" aria-pressed={st.domains.length === 0} onClick={() => set(toggleDomainState(st, null))}>
                <span>All</span>
              </button>
              {chipDomains.map((d) => {
                const Icon = DOMAIN_ICON[d];
                return (
                  <button
                    key={d}
                    type="button"
                    className="vtm__chip"
                    style={mapDomainVars(d)}
                    aria-pressed={st.domains.includes(d)}
                    aria-label={DOMAIN_LABEL[d]}
                    onClick={() => set(toggleDomainState(st, d))}
                  >
                    <span className="vtm__chip-icon" aria-hidden="true">
                      <Icon size={14} strokeWidth={2.25} />
                    </span>
                    <span className="vtm__chip-text">{CHIP_LABEL[d]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!fixedMode && (
            <div className="vtm__seg" role="group" aria-label="Show as">
              <button type="button" className="vtm__seg-opt" aria-pressed={st.mode === "map"} onClick={() => setMode("map")}>
                <Network size={16} aria-hidden />
                <span>Map</span>
              </button>
              <button type="button" className="vtm__seg-opt" aria-pressed={st.mode === "list"} onClick={() => setMode("list")}>
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
            size={size}
            domains={shown}
            focus={focusNode?.id ?? null}
            marked={marked}
            onFocus={focusOn}
            onShowList={fixedMode ? undefined : () => setMode("list")}
          />
          <div className="vtm__focus-slot">{card}</div>
        </>
      ) : (
        <>
          <div className="vtm__focus-slot">{card}</div>
          <MapList
            graph={graph}
            domains={shown}
            focus={focusNode?.id ?? null}
            marked={marked}
            onFocus={(id) => {
              focusOn(id);
              scrollToCard(sectionRef.current);
            }}
          />
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
  size,
  domains,
  focus,
  marked,
  onFocus,
  onShowList,
}: {
  graph: VaultGraph;
  size: MapSize;
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
  const h = room ? mapHeight(room.w, room.vh, size, room.below) : 0;
  const layout = useMemo<MapLayout | null>(
    () => (w > 0 ? layoutMap(graph, { width: w, height: h, focus, domains }) : null),
    [graph, w, h, focus, domains],
  );

  const picture = useMemo(() => (layout ? drawPlan(graph, layout, { w, h }, focus, marked) : null), [graph, layout, w, h, focus, marked]);

  return (
    <div className="vtm__mapcard">
      <div className="vtm__map" ref={boxRef} style={h ? { height: h } : undefined} data-focused={focus ? "" : undefined}>
        {picture && layout && (
          <div className="vtm__map-canvas" aria-hidden="true">
            <svg className="vtm__map-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} focusable="false">
              {picture.rings.map((r) => (
                <circle key={r} className="vtm__ring" cx={w / 2} cy={h / 2} r={r} />
              ))}
              <g key={`edges:${focus ?? ""}`} className="vtm__edges">
                {picture.edges.map((e) => (
                  <line
                    key={`${e.from}|${e.to}`}
                    className="vtm__edge"
                    data-lit={e.lit ? "" : undefined}
                    style={e.lit ? mapDomainVars(e.domain) : undefined}
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
                className="vtm__node"
                data-state={picture.state.get(n.id) ?? "rest"}
                data-hollow={picture.hollow.has(n.id) ? "" : undefined}
                style={{ ...mapDomainVars(n.domain), transform: `translate(${n.x - HIT}px, ${n.y - HIT}px)` }}
                onClick={() => onFocus(n.id)}
              >
                <span className="vtm__dot" style={{ width: 2 * n.r, height: 2 * n.r }} />
              </button>
            ))}
            {picture.labels.map((l) => {
              const sector = picture.sectors.get(l.id);
              const style: CSSProperties = { ...anchorStyle(l, w), ...(sector ? mapDomainVars(sector) : {}) };
              const Icon = sector ? DOMAIN_ICON[sector] : null;
              return (
                <span
                  key={`${focus ?? ""}:${l.id}`}
                  className={sector ? "vtm__sector" : "vtm__label"}
                  data-big={l.big ? "" : undefined}
                  data-side={l.side}
                  style={style}
                >
                  {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
                  <span className="vtm__label-text">{l.text}</span>
                  {l.sub && <span className="vtm__label-sub">{l.sub}</span>}
                </span>
              );
            })}
          </div>
        )}
        {focus && (
          <div className="vtm__map-tools">
            <button type="button" className="vtm__map-btn" onClick={() => onFocus(null)}>
              <X size={16} aria-hidden />
              <span>Whole map</span>
            </button>
          </div>
        )}
      </div>
      {layout && layout.omitted > 0 && onShowList && (
        <button type="button" className="vtm__more" onClick={onShowList}>
          <List size={16} aria-hidden />
          <span>{layout.omitted === 1 ? "1 more in the list" : `${layout.omitted} more in the list`}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
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
    <div className="vtm__list">
      {groups.map((g) => {
        const Icon = DOMAIN_ICON[g.domain];
        return (
          <section key={g.domain} className="vtm__list-group" style={mapDomainVars(g.domain)} aria-label={DOMAIN_LABEL[g.domain]}>
            <h3 className="vtm__list-head">
              <span className="vtm__chip-icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2.25} />
              </span>
              {DOMAIN_LABEL[g.domain]}
            </h3>
            <ul className="vtm__list-rows">
              {g.nodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="vtm__list-row"
                    aria-current={n.id === focus ? "true" : undefined}
                    onClick={() => onFocus(n.id)}
                  >
                    <span
                      className="vtm__list-dot"
                      data-hollow={marked && marked.size > 0 && n.domain === "machine" && !marked.has(n.id) ? "" : undefined}
                      aria-hidden="true"
                    />
                    <span className="vtm__list-label">{n.label}</span>
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

/** Smooth only when motion is welcome. */
function stillMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The map's top into view when its top has scrolled away (a star chosen in
 * the card below it), so the reader sees the map re-lay itself. Inside
 * Learning's one scroller; never throws.
 */
function showMap(section: HTMLElement | null) {
  try {
    const map = section?.querySelector<HTMLElement>(".vtm__mapcard");
    const scroller = section?.closest(".wk__scroll");
    if (!map || !scroller || typeof map.scrollIntoView !== "function") return;
    if (map.getBoundingClientRect().top >= scroller.getBoundingClientRect().top) return;
    map.scrollIntoView({ block: "start", behavior: stillMotion() ? "auto" : "smooth" });
  } catch {
    /* a page that cannot be measured stays where it is */
  }
}

/** After a row in the list is chosen, this explorer's card (above the list) comes into view. */
function scrollToCard(section: HTMLElement | null) {
  try {
    const card = section?.querySelector<HTMLElement>(".vtm__focus-slot");
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
  data,
  node,
  trail,
  onFocus,
  onBack,
  onClear,
  onOpen,
  onPeek,
}: {
  graph: VaultGraph;
  data: MapData;
  node: GraphNode;
  trail: string[];
  onFocus: (id: string) => void;
  onBack: () => void;
  onClear: () => void;
  onOpen: (route: VaultRoute) => void;
  onPeek?: (route: VaultRoute) => void;
}) {
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
    <article className="vtm__focus" style={mapDomainVars(node.domain)} aria-labelledby={titleId}>
      {previous && (
        <div className="vtm__focus-trail">
          <button type="button" className="vtm__back" onClick={onBack} aria-label={`Back to ${previous.label}`}>
            <ArrowLeft size={16} aria-hidden />
            <span>{previous.label}</span>
          </button>
        </div>
      )}
      <div className="vtm__focus-head" key={node.id}>
        <span className="vtm__mark" aria-hidden="true">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <div className="vtm__focus-titles">
          <p className="vtm__focus-noun">{noun.charAt(0).toUpperCase() + noun.slice(1)}</p>
          <h2 className="vtm__focus-title" id={titleId}>
            {node.label}
          </h2>
        </div>
        <button type="button" className="vtm__icon-btn" aria-label="Close the card" onClick={onClear}>
          <X size={18} aria-hidden />
        </button>
      </div>
      {summary && (
        <p className="vtm__focus-summary">
          <LinkedText text={summary} skip={node.id} maxLinks={4} />
        </p>
      )}
      {page && (
        <div className="vtm__focus-actions">
          <button type="button" className="vtm__btn vtm__btn--go" onClick={() => onOpen(node.route)}>
            <span>Open page</span>
            <ArrowRight size={16} aria-hidden />
          </button>
          {onPeek && (
            <button type="button" className="vtm__btn" onClick={() => onPeek(node.route)}>
              <PanelBottomOpen size={16} aria-hidden />
              <span>Peek</span>
            </button>
          )}
        </div>
      )}
      {groups.length > 0 && (
        <div className="vtm__focus-links">
          {groups.map((g) => (
            <div key={g.key} className="vtm__why">
              <h3 className="vtm__why-head">{g.heading}</h3>
              <ul className="vtm__pills">
                {g.links.map((l) => {
                  const LIcon = DOMAIN_ICON[l.node.domain];
                  return (
                    <li key={l.node.id}>
                      <button type="button" className="vtm__pill" style={mapDomainVars(l.node.domain)} onClick={() => onFocus(l.node.id)}>
                        <span className="vtm__pill-mark" aria-hidden="true">
                          <LIcon size={14} strokeWidth={2.25} />
                        </span>
                        <span className="vtm__pill-label">{l.node.label}</span>
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
    <div className="vtm__start">
      <h2 className="vtm__start-head" ref={headRef} tabIndex={-1}>
        Start with
      </h2>
      <ul className="vtm__pills">
        {nodes.map((n) => {
          const Icon = DOMAIN_ICON[n.domain];
          return (
            <li key={n.id}>
              <button type="button" className="vtm__pill" style={mapDomainVars(n.domain)} onClick={() => onFocus(n.id)}>
                <span className="vtm__pill-mark" aria-hidden="true">
                  <Icon size={14} strokeWidth={2.25} />
                </span>
                <span className="vtm__pill-label">{n.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
