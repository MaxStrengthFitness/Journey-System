import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import type { VaultPage, VaultRoute, VaultSection } from "../../learning-vault/types";
import { ArticleBlocks, pageAccent } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import { DidNotLoad, stuckReason, useVaultScreen } from "./shell";
import "./vault-map.css";

/**
 * A PAGE IN THE PEEK — Design 2 (the Learning vault redesign, Oct 19 2026).
 *
 * The page a link points at, under the reader's thumb, without leaving the
 * one they are on. The same lines as the full page (ArticleBlocks, compact),
 * so a studio's marks and the line actions work here too. A glossary term or
 * a cue moment peeks as that one entry, not the whole glossary; a module as
 * its topics; a reading path as its steps. Anything in a peek that is itself
 * a link peeks again, on the same sheet (the trail of crumbs at its top goes
 * back), and "Open full page" hands it to the page underneath.
 */
export function PeekPage({ route }: { route: VaultRoute }) {
  const { data, peekAt } = useVaultScreen();
  const state = useMemo(() => pageFor(route, data), [route, data]);
  const renderText = (t: string) => <LinkedText text={t} />;

  if (route.kind === "track") {
    const track = data.tracks.find((t) => t.id === route.id);
    if (!track) return <p className="vm__quiet">This path has moved.</p>;
    return (
      <div className="vm__peek">
        <p className="vm__peek-lede">{track.who}</p>
        <ol className="vm__rows">
          {track.steps.map((s, i) => (
            <li key={`${i}-${s.title}`}>
              <button type="button" className="vm__row" onClick={() => peekAt(s.route)}>
                <span className="vm__row-n">{i + 1}</span>
                <span className="vm__row-text">
                  <span className="vm__row-title">{s.title}</span>
                  <span className="vm__row-why">{s.why}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="vm__row-go" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (route.kind === "map" && route.focus) {
    if (!data.graph && data.referenceFailed) {
      return (
        <div className="vm__peek">
          <DidNotLoad retry={data.retryReference} onPanel />
        </div>
      );
    }
    return (
      <div className="vm__peek">
        <LocalConstellation graph={data.graph} nodeId={route.focus} onOpen={peekAt} variant="pills" max={12} />
      </div>
    );
  }

  if (state === "loading") {
    // Waiting that will not end on its own is said, with the reader's own Try again.
    const stuck = stuckReason(route, data);
    if (stuck === "floor") {
      return (
        <div className="vm__peek">
          <p className="vm__quiet">Can't read the studio's floor right now, so this machine's page can't open.</p>
        </div>
      );
    }
    if (stuck) {
      const retry =
        stuck === "module" && route.kind === "topic" && data.retryModule
          ? () => data.retryModule?.(route.moduleId)
          : stuck === "reference"
            ? data.retryReference
            : undefined;
      return (
        <div className="vm__peek">
          <DidNotLoad retry={retry} onPanel />
        </div>
      );
    }
    return (
      <div className="vm__peek vm__peek--wait">
        <LoadingMark size="sm" label="Opening…" />
      </div>
    );
  }
  if (state === "gone") {
    return <p className="vm__quiet">This page has moved. Open the Academy to find it.</p>;
  }

  const page = state;
  if (route.kind === "module") {
    return (
      <div className="vm__peek">
        {page.lede && <p className="vm__peek-lede">{page.lede}</p>}
        <ol className="vm__rows">
          {page.related.map((r, i) => (
            <li key={`${i}-${r.title}`}>
              <button type="button" className="vm__row" onClick={() => peekAt(r.route)}>
                <span className="vm__row-n">{i + 1}</span>
                <span className="vm__row-text">
                  <span className="vm__row-title">{r.title}</span>
                  <span className="vm__row-why">{r.why}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="vm__row-go" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const sections = focusedSections(route, page);
  // One term or one moment is part of a page: a mark on another line of it
  // is not a "line that changed" (it is right where it was), so the foot of
  // changed lines is the whole page's alone.
  const whole = sections === page.sections;
  return (
    <div className="vm__peek">
      {page.draft && <p className="vm__draft">{PLAYBOOK_DRAFT_LINE}</p>}
      {page.lede && whole && (
        <p className="vm__peek-lede">
          <LinkedText text={page.lede} />
        </p>
      )}
      {/* Inline: a gutter never pays for itself in a column this narrow. */}
      <ArticleBlocks
        target={page.target}
        sections={sections}
        annotate="inline"
        compact
        headingLevel={3}
        accent={pageAccent(page)}
        showOrphans={whole}
        renderText={renderText}
      />
      {page.nodeId && !whole && (
        <div className="vm__peek-links">
          <LocalConstellation graph={data.graph} nodeId={page.nodeId} onOpen={peekAt} variant="pills" max={8} />
        </div>
      )}
    </div>
  );
}

/**
 * The part of a page a peek shows: one glossary term, or one cue moment,
 * when the route names one; else the whole page. The SAME page object's
 * blocks, so a studio's mark on a term shows on it here too.
 */
export function focusedSections(route: VaultRoute, page: Pick<VaultPage, "sections">): VaultSection[] {
  if (route.kind === "glossary" && route.term) {
    const term = route.term.trim().toLowerCase();
    for (const s of page.sections) {
      const block = s.blocks.find((b) => (b.label ?? "").trim().toLowerCase() === term);
      // The peek's title already says the term: its line drops the label.
      if (block) return [{ id: s.id, title: "", blocks: [{ ...block, label: undefined }] }];
    }
    return page.sections;
  }
  if (route.kind === "cueing" && typeof route.moment === "number") {
    const s = page.sections.find((x) => x.id === `moment-${route.moment}`);
    return s ? [{ ...s, title: "" }] : page.sections;
  }
  return page.sections;
}
