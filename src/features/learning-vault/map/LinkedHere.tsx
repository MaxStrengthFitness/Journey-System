import { useId, useMemo, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { DOMAIN_COLOUR, nodeById } from "../graph";
import type { GraphDomain, VaultGraph, VaultRoute } from "../types";
import { DOMAIN_ICON } from "../ui/LocalConstellation";
import { backlinkWhy, linkedHere } from "./backlinks";
import "../../wiki/wiki.css";
import "./linked-here.css";

/**
 * "LINKED HERE" — what points at this page, and why, at its foot
 * (Obsidian's backlinks; lifted out of Design 2, the Living Vault, Oct 19
 * 2026, for the mix AJ picked).
 *
 * One row per page that links here, its strongest reason first ("talks
 * about LEG PRESS", "affects LEG PRESS"), each with its domain's glyph and
 * colour. A tap PEEKS when the host has a peek (`onPeek`: the page under the
 * reader's thumb stays), else opens. The first eight show; "Show all N"
 * brings the rest. Nothing at all when nothing links here, so a page never
 * shows an empty box.
 *
 * Say it once: a page that draws its own constellation passes the nodes it
 * shows as `exclude` (backlinks.ts shownIds), and they are not listed again.
 */

/** "Linked here" shows this many before "Show all". */
export const LINKED_HERE_FIRST = 8;

export interface LinkedHereProps {
  graph: VaultGraph | null;
  /** The page's node on the graph (VaultPage.nodeId, graph.ts nodeIdForRoute). Nothing is drawn without one. */
  nodeId: string | null | undefined;
  /** Open a linking page. Used when there is no `onPeek`. */
  onOpen: (route: VaultRoute) => void;
  /** Peek a linking page, keeping this one. When given, every row peeks. */
  onPeek?: (route: VaultRoute) => void;
  /** The page's title, for each row's why ("talks about LEG PRESS"). The node's own label when absent. */
  title?: string;
  /** Node ids the page already shows (its constellation): not listed again. */
  exclude?: ReadonlySet<string>;
  /** How many rows show before "Show all". */
  first?: number;
  /** The heading's level in the page's outline. */
  headingLevel?: 2 | 3;
}

/** A row's glyph colours, as the custom properties linked-here.css reads. */
function rowVars(domain: GraphDomain): CSSProperties {
  const c = DOMAIN_COLOUR[domain];
  return { "--vtb-fill": c.fill, "--vtb-text": c.text } as CSSProperties;
}

export function LinkedHere({ graph, nodeId, onOpen, onPeek, title, exclude, first = LINKED_HERE_FIRST, headingLevel = 2 }: LinkedHereProps) {
  const [all, setAll] = useState(false);
  const headId = useId();
  const links = useMemo(() => linkedHere(graph, nodeId, exclude), [graph, nodeId, exclude]);
  if (links.length === 0) return null;
  const pageTitle = title ?? (graph && nodeId ? (nodeById(graph, nodeId)?.label ?? "") : "");
  const shown = all ? links : links.slice(0, Math.max(1, first));
  const go = onPeek ?? onOpen;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className="vtb" aria-labelledby={headId}>
      <Heading className="vtb__title" id={headId}>
        Linked here
      </Heading>
      <ul className="vtb__rows">
        {shown.map((link) => {
          const { node } = link;
          const Icon = DOMAIN_ICON[node.domain];
          return (
            <li key={node.id}>
              <button type="button" className="vtb__row" style={rowVars(node.domain)} onClick={() => go(node.route)}>
                <span className="vtb__row-mark" aria-hidden="true">
                  <Icon size={15} strokeWidth={2.25} />
                </span>
                <span className="vtb__row-text">
                  <span className="vtb__row-title">{node.label}</span>
                  <span className="vtb__row-why">{backlinkWhy(link, pageTitle)}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="vtb__row-go" />
              </button>
            </li>
          );
        })}
      </ul>
      {links.length > first && (
        <button type="button" className="vtb__more" onClick={() => setAll(!all)} aria-expanded={all}>
          <span>{all ? "Show fewer" : `Show all ${links.length}`}</span>
        </button>
      )}
    </section>
  );
}
