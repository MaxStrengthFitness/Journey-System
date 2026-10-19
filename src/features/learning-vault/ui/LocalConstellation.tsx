/**
 * A PAGE'S LOCAL CONSTELLATION — what this page connects to, and why.
 *
 * Round: the Learning vault redesign, Oct 19 2026. Read graph.ts first: it
 * says where every link comes from.
 *
 * TWO WAYS TO DRAW THE SAME LINKS
 * -------------------------------
 *   "pills"  the links grouped by WHY they connect ("Substitutes",
 *            "Comes up in", "Clinical flags"), each a 44px pill with its
 *            domain's mark. The Codex's bento and the Course's lesson foot.
 *   "orbit"  a small drawing: this page in the middle, its links on an
 *            ellipse around it (layout.ts layoutConstellation), then the same
 *            links as the pill list underneath. The drawing is a picture with
 *            shortcuts for a finger; the list is the way in for a keyboard
 *            and a screen reader (decision 12: every map has a list; hover is
 *            never the only way), so the drawing is hidden from both.
 *
 * Every node and every pill is at least 44px to tap. A label is never cut:
 * it wraps, and the orbit grows taller to give a long one its lines.
 * Colours are by domain from Learning's own tokens (graph.ts DOMAIN_COLOUR),
 * and each domain also has its own glyph, so colour is never the only cue.
 *
 * WHAT IT SAYS WHEN IT HAS NOTHING
 * --------------------------------
 * No node id, or a node the graph does not have (a quick card is a page of
 * its machine, not a node): nothing at all, so a page shows no empty box.
 * The graph still loading: the one loading mark. A node with no links: one
 * quiet line in a well, because a constellation slot that simply vanished
 * would look broken.
 */

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  ClipboardList,
  Dumbbell,
  Library,
  Lightbulb,
  MessageSquareQuote,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { DOMAIN_COLOUR, DOMAIN_NOUN, constellationOf, groupLinks, type LinkGroup } from "../graph";
import { layoutConstellation, orbitHeight, orbitRadiusX } from "../layout";
import type { Constellation, GraphDomain, VaultGraph, VaultRoute } from "../types";
import "../../wiki/wiki.css";
import "./graph.css";

/** Each domain's glyph: the shape that says what a node is, beside its colour. */
export const DOMAIN_ICON: Record<GraphDomain, LucideIcon> = {
  machine: Dumbbell,
  method: Lightbulb,
  equipment: Wrench,
  cue: MessageSquareQuote,
  module: Library,
  topic: BookOpen,
  clinical: ShieldAlert,
  playbook: ClipboardList,
};

/** The inline custom properties that colour one node by its domain. */
export function domainStyle(domain: GraphDomain): CSSProperties {
  const c = DOMAIN_COLOUR[domain];
  return { "--vtg-c": c.accent, "--vtg-fill": c.fill, "--vtg-text": c.text } as CSSProperties;
}

/** How many links a constellation shows unless the host says otherwise. */
const DEFAULT_MAX = 12;
/** The orbit's width before it has been measured (and in a test, where nothing has a size). */
const FALLBACK_WIDTH = 360;
/** The 44px tap target centred on a dot is half this either side. */
const HIT = 44;
/** A 12px label line, and the padding a two-line label needs around it. */
const LINE_PX = 15;
const ROW_PAD = 14;
/** About how wide one character of a 12px label is, to guess where it wraps. */
const CHAR_PX = 6.6;
/** And of the centre's 14px bold name. */
const CENTRE_CHAR_PX = 7.8;
/** The centre's padding, glyph and gap, beside its name. */
const CENTRE_CHROME = 52;

export interface LocalConstellationProps {
  graph: VaultGraph | null;
  nodeId: string | null;
  onOpen: (route: VaultRoute) => void;
  variant?: "pills" | "orbit";
  max?: number;
}

export function LocalConstellation({ graph, nodeId, onOpen, variant = "pills", max = DEFAULT_MAX }: LocalConstellationProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const constellation = useMemo(
    () => (graph && nodeId ? constellationOf(graph, nodeId, max) : null),
    [graph, nodeId, max],
  );
  const groups = useMemo(() => (constellation ? groupLinks(constellation) : []), [constellation]);
  const hasOrbit = variant === "orbit" && groups.length > 0;

  // The orbit is laid out for the width it actually has. Measured in a layout
  // effect that cannot throw (KNOWN-TRAPS: a throw here takes the screen down),
  // with ResizeObserver only where it exists.
  useLayoutEffect(() => {
    if (!hasOrbit) return;
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const w = Math.round(el.clientWidth);
        if (w > 0) setWidth((prev) => (prev === w ? prev : w));
      } catch {
        // Keep the last width (or the fallback).
      }
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } catch {
      ro = null;
    }
    return () => ro?.disconnect();
  }, [hasOrbit]);

  if (!nodeId) return null;
  if (!graph) {
    return (
      <div className="vtg vtg--wait">
        <LoadingMark size="sm" label="Finding what connects…" />
      </div>
    );
  }
  if (!constellation) return null;
  const center = constellation.center;
  if (groups.length === 0) {
    return (
      <section className="vtg" aria-label={`What connects to ${center.label}`}>
        <p className="vtg__empty">Nothing else in Learning connects here yet.</p>
      </section>
    );
  }

  return (
    <section className={`vtg${hasOrbit ? " vtg--orbit" : ""}`} aria-label={`What connects to ${center.label}`}>
      {hasOrbit && (
        <div className="vtg__orbit" ref={boxRef} aria-hidden="true">
          <Orbit constellation={constellation} width={width || FALLBACK_WIDTH} onOpen={onOpen} />
        </div>
      )}
      {groups.map((g) => (
        <PillGroup key={g.key} group={g} onOpen={onOpen} />
      ))}
    </section>
  );
}

function PillGroup({ group, onOpen }: { group: LinkGroup; onOpen: (route: VaultRoute) => void }) {
  return (
    <div className="vtg__group">
      <h3 className="vtg__head">{group.heading}</h3>
      <ul className="vtg__pills">
        {group.links.map((link) => {
          const Icon = DOMAIN_ICON[link.node.domain];
          return (
            <li key={link.node.id}>
              <button
                type="button"
                className="vtg__pill"
                style={domainStyle(link.node.domain)}
                aria-label={`${link.node.label}, ${DOMAIN_NOUN[link.node.domain]}`}
                onClick={() => onOpen(link.node.route)}
              >
                <span className="vtg__mark" aria-hidden="true">
                  <Icon size={15} strokeWidth={2.25} />
                </span>
                <span className="vtg__pill-label">{link.node.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lines a label will take at a width, roughly: enough to give the row its height. */
function linesFor(label: string, px: number, charPx = CHAR_PX): number {
  const perLine = Math.max(6, Math.floor(px / charPx));
  let lines = 1;
  let used = 0;
  for (const word of label.split(/\s+/)) {
    const len = word.length;
    if (used === 0) {
      lines += Math.floor(Math.max(0, len - 1) / perLine);
      used = len % perLine || perLine;
    } else if (used + 1 + len <= perLine) {
      used += 1 + len;
    } else {
      lines += 1 + Math.floor(Math.max(0, len - 1) / perLine);
      used = len % perLine || perLine;
    }
  }
  return lines;
}

function Orbit({
  constellation,
  width,
  onOpen,
}: {
  constellation: Constellation;
  width: number;
  onOpen: (route: VaultRoute) => void;
}) {
  const links = constellation.links;
  const rx = orbitRadiusX(width);
  // The room a side label has: from just past its dot's tap target to the edge.
  const labelPx = Math.max(56, width / 2 - rx - HIT / 2 - 12);
  const lines = links.reduce((most, l) => Math.max(most, linesFor(l.node.label, labelPx)), 1);
  const height = orbitHeight(links.length, Math.max(52, lines * LINE_PX + ROW_PAD));
  const { center, points } = layoutConstellation(constellation, { w: width, h: height });
  const CenterIcon = DOMAIN_ICON[center.domain];
  // The centre is the page you are on, already named above the orbit. Its
  // name goes in the middle only when it fits in two lines without breaking a
  // word; a long one ("Upper Turnaround: without an end stop and include a
  // squeeze") would stand in a tall column over its own links, so the middle
  // then shows its glyph alone.
  const centreBox = Math.max(88, 2 * rx - 20);
  const centreText = centreBox - CENTRE_CHROME;
  const perLine = Math.floor(centreText / CENTRE_CHAR_PX);
  const centreNamed =
    center.label.split(/\s+/).every((w) => w.length <= perLine) && linesFor(center.label, centreText, CENTRE_CHAR_PX) <= 2;

  return (
    <div className="vtg__orbit-in" style={{ height }}>
      <svg className="vtg__lines" width={width} height={height} viewBox={`0 0 ${width} ${height}`} focusable="false">
        {points.map((p) => (
          <line key={p.id} className="vtg__line" x1={center.x} y1={center.y} x2={p.x} y2={p.y} />
        ))}
      </svg>
      <span
        className={`vtg__centre${centreNamed ? "" : " vtg__centre--mark"}`}
        style={{ ...domainStyle(center.domain), left: center.x, top: center.y, maxWidth: centreBox }}
      >
        <span className="vtg__mark" aria-hidden="true">
          <CenterIcon size={15} strokeWidth={2.25} />
        </span>
        {centreNamed && <span className="vtg__centre-label">{center.label}</span>}
      </span>
      {points.map((p, i) => {
        const link = links[i];
        const right = p.x >= center.x;
        const room = right ? width - (p.x - HIT / 2) - HIT - 8 : p.x + HIT / 2 - HIT - 8;
        const place: CSSProperties = right
          ? { left: p.x - HIT / 2, top: p.y }
          : { right: width - (p.x + HIT / 2), top: p.y };
        return (
          <button
            key={p.id}
            type="button"
            tabIndex={-1}
            className={`vtg__node ${right ? "vtg__node--right" : "vtg__node--left"}`}
            style={{ ...domainStyle(p.domain), ...place }}
            onClick={() => onOpen(link.node.route)}
          >
            <span className="vtg__node-hit">
              <span className="vtg__dot" />
            </span>
            <span className="vtg__node-label" style={{ maxWidth: Math.max(56, room) }}>
              {p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
