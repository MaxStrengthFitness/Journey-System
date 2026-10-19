import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Network } from "lucide-react";
import { DOMAIN_NOUN, constellationOf, linkHeading } from "../../learning-vault/graph";
import { layoutConstellation, orbitHeight, orbitRadiusX } from "../../learning-vault/layout";
import { domainVars } from "./RumorMap";
import { wrapLabel } from "./map-model";
import { useVaultScreen } from "./shell";
import "./vault-map.css";

/**
 * A PAGE'S OWN CONSTELLATION, AT ITS HEAD — Design 2 (the Learning vault
 * redesign, Oct 19 2026).
 *
 * The page in the middle and what it connects to around it, each link
 * saying why ("In sets that replace it", "Cue moments", "Comes up in"), drawn on the
 * shared orbit geometry (learning-vault/layout.ts layoutConstellation) as a
 * short band under the title, so the body still starts on the first
 * screen. Every link is a real button (44px, named for a screen reader with
 * its why) that PEEKS: the page you are reading stays. The middle is the
 * door to the whole map, focused here.
 *
 * Why not the shared LocalConstellation: its orbit always carries its pill
 * list underneath, which at the head of a page pushes the body below the
 * fold on an upright iPad. Here the drawing's own buttons are the list, and
 * "Linked here" at the page's foot says the rest in sentences. (The shared
 * change that would let this use LocalConstellation is in the README.)
 */

const FALLBACK_W = 720;
/** A label line, and the room a row needs around its lines. */
const LINE_PX = 15;
const ROW_PAD = 14;
const CHAR_PX = 7;
const HIT = 44;

export function MiniOrbit({ nodeId, title, max }: { nodeId: string; title: string; max: number }) {
  const { data, peekAt, open } = useVaultScreen();
  const graph = data.graph;
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const c = useMemo(() => (graph ? constellationOf(graph, nodeId, max) : null), [graph, nodeId, max]);
  const has = Boolean(c && c.links.length > 0);

  // Measured where it cannot throw, again whenever the drawing first appears
  // (the graph lands after the page does).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const w = Math.round(el.clientWidth) || FALLBACK_W;
        setWidth((prev) => (prev === w ? prev : w));
      } catch {
        setWidth((prev) => prev || FALLBACK_W);
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
  }, [has]);

  const plan = useMemo(() => {
    if (!c || c.links.length === 0 || width === 0) return null;
    const rx = orbitRadiusX(width);
    const room = Math.max(64, width / 2 - rx - HIT / 2 - 10);
    const lines = c.links.reduce((most, l) => {
      const name = wrapLabel(l.node.label, room, CHAR_PX).lines;
      const why = wrapLabel(linkHeading(l), room, 6.3).lines;
      return Math.max(most, name + why);
    }, 2);
    const height = orbitHeight(c.links.length, lines * LINE_PX + ROW_PAD);
    return { ...layoutConstellation(c, { w: width, h: height }), height, room };
  }, [c, width]);

  if (!c || !has) return null;

  return (
    <nav className="vm__mini" aria-label={`What ${title} connects to`}>
      <div className="vm__mini-in" ref={boxRef} style={plan ? { height: plan.height } : undefined}>
        {plan && (
          <>
            <svg className="vm__mini-svg" width={width} height={plan.height} viewBox={`0 0 ${width} ${plan.height}`} aria-hidden="true" focusable="false">
              {plan.points.map((p) => (
                <line
                  key={p.id}
                  className="vm__mini-line"
                  style={domainVars(p.domain)}
                  x1={plan.center.x}
                  y1={plan.center.y}
                  x2={p.x}
                  y2={p.y}
                />
              ))}
            </svg>
            {/* The one door on the band, the same on every page: blue words,
                like Open page, never the page's domain colour. */}
            <button
              type="button"
              className="vm__mini-centre"
              style={{ left: plan.center.x, top: plan.center.y }}
              aria-label={`Show ${title} on the map`}
              onClick={() => open({ kind: "map", focus: nodeId })}
            >
              <Network size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>Map</span>
            </button>
            {plan.points.map((p, i) => {
              const link = c.links[i];
              const right = p.x >= plan.center.x;
              const why = linkHeading(link);
              const place: CSSProperties = right
                ? { left: p.x - HIT / 2, top: p.y }
                : { right: width - (p.x + HIT / 2), top: p.y };
              return (
                <button
                  key={p.id}
                  type="button"
                  className="vm__mini-node"
                  data-side={right ? "right" : "left"}
                  style={{ ...domainVars(p.domain), ...place }}
                  aria-label={`${link.node.label}, ${DOMAIN_NOUN[link.node.domain]}. ${why}.`}
                  onClick={() => peekAt(link.node.route)}
                >
                  <span className="vm__mini-hit" aria-hidden="true">
                    <span className="vm__mini-dot" />
                  </span>
                  <span className="vm__mini-label" style={{ maxWidth: plan.room }} aria-hidden="true">
                    <span className="vm__mini-name">{link.node.label}</span>
                    <span className="vm__mini-why">{why}</span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </nav>
  );
}
