import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { presetLine, presetOf } from "../../machine-codex/format";
import { accentStyle } from "../../wiki/categories";
import { hasFloorStatus } from "../../learning-vault/floor-care";
import { DOMAIN_NOUN, nodeById } from "../../learning-vault/graph";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { pageAccent } from "../../learning-vault/ui/ArticleBlocks";
import { FloorStatus } from "../../learning-vault/ui/FloorStatus";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { LocalConstellation, categoryNodeStyle } from "../../learning-vault/ui/LocalConstellation";
import type { VaultRoute, VaultSection } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import {
  domainWords,
  floorGlanceOrder,
  isPiece,
  machineAccent,
  momentSections,
  pieceMachineId,
  termSections,
  waitState,
} from "./codex-model";
import { Blocks } from "./CodexBits";
import "./codex.css";

/**
 * A page in the peek: its first layer, compact. A machine shows its floor
 * glance (what you need at the machine, Stop first, as on its page) under
 * the floor's status (Out of service, Flagged) and its preset; a word,
 * its one line; a cue moment, its lines; anything else, every line. The
 * peek's own "Open full page" goes to the rest.
 */
export function PeekBody({ route }: { route: VaultRoute }) {
  const { data } = useCodex();
  const page = useMemo(() => (route.kind === "map" ? null : pageFor(route, data)), [route, data]);

  if (route.kind === "map") return <PeekMapEntry focus={route.focus ?? null} />;
  if (page === null || page === "loading") return <PeekWaiting route={route} />;
  if (page === "gone") return <p className="cdx__peek-gone">This page has moved. Open the Academy to find it.</p>;

  let sections: VaultSection[] = page.sections;
  let partial = false;
  let line: string | null = null;
  if (route.kind === "machine") {
    const glance = page.tiers?.[0];
    sections = glance ? (glance.id === "glance" ? floorGlanceOrder(glance.sections) : glance.sections) : page.sections;
    partial = true;
    const def = data.defs[route.id];
    if (def) line = presetLine(presetOf(def));
  } else if (route.kind === "glossary" && route.term) {
    const one = termSections(page, route.term);
    if (one.length > 0) {
      sections = one;
      partial = true;
    }
  } else if (route.kind === "cueing" && typeof route.moment === "number") {
    const one = momentSections(page, [route.moment]);
    if (one.length > 0) {
      sections = one;
      partial = true;
    }
  }

  // A machine's quick card, script or deep dive: the peek's head already
  // says which piece of which machine ("Quick card · LEG PRESS"), so the
  // eyebrow would only say it again; its spoken lines take the machine's
  // category, as on the machine's own page.
  const piece = isPiece(route) && pieceMachineId(route, data.machines) !== null;
  const style = route.kind === "machine" ? accentStyle(machineAccent(route.id)) : undefined;
  // A substitute peeked from a machine may be the one that is out of service.
  const care = route.kind === "machine" ? data.care?.[route.id] : undefined;
  return (
    <div className="cdx__peekbody" style={style}>
      {!piece && <p className="cdx__peek-eyebrow">{page.eyebrow}</p>}
      {hasFloorStatus(care) && <FloorStatus status={care} variant="banner" />}
      {page.draft && <p className="cdx__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      {line && <p className="cdx__peek-preset">{line}</p>}
      {page.lede && route.kind !== "machine" && (
        <p className="cdx__peek-lede">
          <LinkedText text={page.lede} />
        </p>
      )}
      <Blocks
        target={page.target}
        sections={sections}
        partial={partial}
        compact
        skip={page.nodeId}
        accent={piece ? pageAccent(page) : undefined}
      />
    </div>
  );
}

/**
 * A page in the peek that answered "loading": the small spinner only while
 * it is on its way. A part of the Academy that failed says so in one quiet
 * line, with Try again (the reader's tap, never a timer); a studio's own
 * machine on a floor that could not be read says that.
 */
function PeekWaiting({ route }: { route: VaultRoute }) {
  const { data, studioName } = useCodex();
  const state = waitState(route, data);
  if (state.kind === "loading") {
    return (
      <div className="cdx__peek-wait">
        <LoadingMark size="sm" label="Opening…" />
      </div>
    );
  }
  if (state.kind === "floor") return <p className="cdx__peek-gone">Can't read {studioName}'s floor right now.</p>;
  const retry =
    state.kind === "module"
      ? data.retryModule
        ? () => data.retryModule?.(state.moduleId)
        : undefined
      : data.retryReference;
  return (
    <div className="cdx__peek-failed">
      <p className="cdx__peek-gone">This part of the Academy didn't load.</p>
      {retry && (
        <button type="button" className="cdx__btn" onClick={retry}>
          <RotateCcw size={16} aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

function PeekMapEntry({ focus }: { focus: string | null }) {
  const { data, peek } = useCodex();
  if (!focus) return <p className="cdx__peek-gone">Nothing to show here.</p>;
  // The links come with the graph (every reference chunk); its words with the glossary.
  if (!data.graph && !data.entities) return <PeekWaiting route={{ kind: "map", focus }} />;
  const node = data.graph ? nodeById(data.graph, focus) : null;
  const entity = data.entities?.byId.get(focus) ?? null;
  return (
    <div className="cdx__peekbody">
      {node && <p className="cdx__peek-eyebrow">{domainWords(DOMAIN_NOUN[node.domain])}</p>}
      {entity?.summary && (
        <p className="cdx__peek-lede">
          <LinkedText text={entity.summary} />
        </p>
      )}
      <LocalConstellation graph={data.graph} nodeId={focus} onOpen={peek} variant="pills" max={12} nodeStyle={categoryNodeStyle} />
    </div>
  );
}
