import { useMemo } from "react";
import { LoadingMark } from "../../../components/LoadingMark";
import { presetLine, presetOf } from "../../machine-codex/format";
import { accentStyle } from "../../wiki/categories";
import { DOMAIN_NOUN, nodeById } from "../../learning-vault/graph";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import type { VaultRoute, VaultSection } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import { domainWords, machineAccent, momentSections, termSections } from "./codex-model";
import { Blocks } from "./CodexBits";
import "./codex.css";

/**
 * A page in the peek: its first layer, compact. A machine shows its floor
 * glance (what you need at the machine) under its code and preset; a word,
 * its one line; a cue moment, its lines; anything else, every line. The
 * peek's own "Open full page" goes to the rest.
 */
export function PeekBody({ route }: { route: VaultRoute }) {
  const { data } = useCodex();
  const page = useMemo(() => (route.kind === "map" ? null : pageFor(route, data)), [route, data]);

  if (route.kind === "map") return <PeekMapEntry focus={route.focus ?? null} />;
  if (page === null || page === "loading") {
    return (
      <div className="cdx__peek-wait">
        <LoadingMark size="sm" label="Opening…" />
      </div>
    );
  }
  if (page === "gone") return <p className="cdx__peek-gone">This page has moved. Open the Academy to find it.</p>;

  let sections: VaultSection[] = page.sections;
  let partial = false;
  let line: string | null = null;
  if (route.kind === "machine") {
    sections = page.tiers?.[0]?.sections ?? page.sections;
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

  const style = route.kind === "machine" ? accentStyle(machineAccent(route.id)) : undefined;
  return (
    <div className="cdx__peekbody" style={style}>
      <p className="cdx__peek-eyebrow">{page.eyebrow}</p>
      {page.draft && <p className="cdx__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      {line && <p className="cdx__peek-preset">{line}</p>}
      {page.lede && route.kind !== "machine" && (
        <p className="cdx__peek-lede">
          <LinkedText text={page.lede} />
        </p>
      )}
      <Blocks target={page.target} sections={sections} partial={partial} compact skip={page.nodeId} />
    </div>
  );
}

function PeekMapEntry({ focus }: { focus: string | null }) {
  const { data, peek } = useCodex();
  if (!focus) return <p className="cdx__peek-gone">Nothing to show here.</p>;
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
      <LocalConstellation graph={data.graph} nodeId={focus} onOpen={peek} variant="pills" max={12} />
    </div>
  );
}
