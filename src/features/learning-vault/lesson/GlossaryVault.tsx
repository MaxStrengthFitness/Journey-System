import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Search, X } from "lucide-react";
import { termNodeId } from "../graph";
import type { AppliedMarkup } from "../markup";
import { moduleOfTopic } from "../routes";
import type { MarkedBlock, VaultRoute } from "../types";
import { MarkedLine, StruckWords } from "./MarkedLine";
import {
  GLOSSARY_TERM_TOPICS,
  byLetter,
  filterGlossary,
  glossaryEntries,
  glossaryLetterId,
  glossaryTermId,
  letterOf,
  lettersOf,
  type GlossaryEntry,
  type GlossaryFilter,
} from "./glossary-vault";
import "../../wiki/wiki.css";
import "./glossary-vault.css";

/**
 * THE GLOSSARY VAULT — every Academy word a card you can filter, find and
 * jump to by letter. Lifted from the Interactive Course into the shared parts
 * (the Learning vault redesign, Oct 19 2026: AJ picked the mix, the Codex as
 * the base with the Course's glossary vault). Draws with glossary-vault.css
 * (vtw__); a card's whole definition with MarkedLine (lesson.css).
 *
 * The bar: a search field, All · Method · Equipment, and an A–Z of 44px
 * letters; it sticks to the top of Learning's one scroller while the cards
 * scroll (not on a phone, where the search does the finding and the letters
 * are left out). With every word showing the cards are grouped by letter; a
 * filter or a search flows its matches into one grid (a letter over every
 * lone card made a long ragged column), and the letters then jump to the
 * first card of each.
 *
 * A card: the term, its first sentence (struck when the studio crossed the
 * definition out), "Equipment" while every kind shows; "More" opens the whole
 * definition (its terms linked, never the word itself: the card you are on
 * is not a door) and "Where it's taught", rows that call `onPeek` with the
 * topic. `focus` opens on one word, open, scrolled into view.
 *
 * Nothing here acts on a line: the glossary page whole (ArticleBlocks) is
 * where a definition is crossed out, noted or shared. The page around it
 * keeps that switch, its title and its foot.
 */

const FILTERS: { id: GlossaryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "method", label: "Method" },
  { id: "equipment", label: "Equipment" },
];

export interface GlossaryVaultProps {
  /** The glossary file's terms (VaultData.glossary); null while it loads. */
  glossary: { term: string; definition: string }[] | null;
  /** The glossary page's sections with this studio's marks (useAppliedMarkup over pageFor({ kind: "glossary" })). */
  marked: AppliedMarkup["sections"];
  studioLens: boolean;
  /** A word to open on, open and scrolled into view (a link to one term). */
  focus?: string | null;
  /** A topic's title for a "Where it's taught" row. */
  titleOf: (route: VaultRoute) => string;
  /** A "Where it's taught" row: open the topic beside the vault (the peek), keeping the reader's place. */
  onPeek: (route: VaultRoute) => void;
  /** A phone: the bar does not stick and the letters are left out. */
  phone?: boolean;
  /** Where each term is taught; graph-index.json's by default. */
  termTopics?: Record<string, string[]>;
}

export function GlossaryVault({ glossary, marked, studioLens, focus = null, titleOf, onPeek, phone = false, termTopics = GLOSSARY_TERM_TOPICS }: GlossaryVaultProps) {
  const entries = useMemo(() => glossaryEntries(glossary, termTopics), [glossary, termTopics]);
  const byTerm = useMemo(() => {
    const m = new Map<string, MarkedBlock>();
    for (const s of marked) for (const b of s.blocks) if (b.label && !m.has(b.label)) m.set(b.label, b);
    return m;
  }, [marked]);

  const [kind, setKind] = useState<GlossaryFilter>("all");
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus] : []));
  const shown = useMemo(() => filterGlossary(entries, { kind, query }), [entries, kind, query]);
  const searching = query.trim() !== "";
  // Letters head the groups only while every word shows; filtered or found,
  // the matches are one grid.
  const grouped = !searching && kind === "all";
  const groups = useMemo(() => (grouped ? byLetter(shown) : [{ letter: "", entries: shown }]), [grouped, shown]);
  const letters = useMemo(() => lettersOf(shown), [shown]);

  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The letters land under the sticky bar, never behind it.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const root = rootRef.current;
    if (!bar || !root) return;
    const measure = () => {
      try {
        root.style.setProperty("--vtw-bar-h", `${Math.round(bar.getBoundingClientRect().height) + 12}px`);
      } catch {
        /* the CSS fallback holds */
      }
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(measure);
      ro.observe(bar);
    } catch {
      ro = null;
    }
    return () => ro?.disconnect();
  }, []);

  // A link to one term opens on it, open.
  useEffect(() => {
    if (!focus) return;
    try {
      document.getElementById(glossaryTermId(focus))?.scrollIntoView({ block: "center" });
    } catch {
      /* it is on the page to find */
    }
  }, [focus]);

  const toggle = (term: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });

  // A letter's heading when the vault is grouped; its first card when not.
  const toLetter = (letter: string) => {
    try {
      const first = grouped ? null : shown.find((e) => letterOf(e.term) === letter);
      const id = first ? glossaryTermId(first.term) : glossaryLetterId(letter);
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: scrollMotion() });
    } catch {
      /* the letter is still there to scroll to */
    }
  };

  return (
    <div className="vtw" ref={rootRef} data-phone={phone ? "" : undefined}>
      <div className="vtw__bar" ref={barRef}>
        <div className="vtw__row">
          <label className="vtw__find">
            <Search size={18} aria-hidden />
            <input
              className="vtw__find-input"
              type="search"
              value={query}
              placeholder="Find a word"
              aria-label="Find a word in the glossary"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {query && (
              <button type="button" className="vtw__find-clear" aria-label="Clear the search" onClick={() => setQuery("")}>
                <X size={18} aria-hidden />
              </button>
            )}
          </label>
          <div className="vtw__filters" role="group" aria-label="Which words">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="vtw__filter" aria-pressed={kind === f.id} onClick={() => setKind(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {!searching && letters.length > 1 && (
          <nav className="vtw__az" aria-label="Jump to a letter">
            {letters.map((l) => (
              <button key={l} type="button" className="vtw__az-btn" onClick={() => toLetter(l)}>
                {l}
              </button>
            ))}
          </nav>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="vtw__empty">{searching ? `No word in the glossary matches “${query.trim()}”.` : "The glossary is on its way."}</p>
      ) : (
        groups.map((g) => (
          <section
            key={g.letter || "found"}
            className="vtw__group"
            aria-label={g.letter ? `Words under ${g.letter}` : searching ? "Words found" : `${FILTERS.find((f) => f.id === kind)?.label ?? ""} words`.trim()}
          >
            {g.letter && (
              <h2 className="vtw__letter" id={glossaryLetterId(g.letter)}>
                {g.letter}
              </h2>
            )}
            <div className="vtw__grid">
              {g.entries.map((e) => (
                <GlossaryCard
                  key={e.term}
                  entry={e}
                  block={byTerm.get(e.term) ?? null}
                  studioLens={studioLens}
                  open={opened.has(e.term)}
                  onToggle={() => toggle(e.term)}
                  showKind={kind === "all"}
                  titleOf={titleOf}
                  onPeek={onPeek}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function GlossaryCard({
  entry,
  block,
  studioLens,
  open,
  onToggle,
  showKind,
  titleOf,
  onPeek,
}: {
  entry: GlossaryEntry;
  block: MarkedBlock | null;
  studioLens: boolean;
  open: boolean;
  onToggle: () => void;
  /** "Equipment" on a card, only while the vault shows every kind. */
  showKind: boolean;
  titleOf: (route: VaultRoute) => string;
  onPeek: (route: VaultRoute) => void;
}) {
  const struck = studioLens && Boolean(block?.strike);
  const topics = entry.topics
    .map((id): VaultRoute | null => {
      const moduleId = moduleOfTopic(id);
      return moduleId ? { kind: "topic", moduleId, topicId: id } : null;
    })
    .filter((r): r is VaultRoute => r !== null);
  const hasMore = entry.definition.length > entry.summary.length + 2 || topics.length > 0 || struck || (studioLens && (block?.notes.length ?? 0) > 0);
  return (
    <article className="vtw__card" id={glossaryTermId(entry.term)} data-open={open ? "" : undefined} data-kind={entry.kind}>
      <div className="vtw__card-head">
        <h3 className="vtw__term">{entry.term}</h3>
        {showKind && entry.kind === "equipment" && <span className="vtw__kind">Equipment</span>}
      </div>
      {!open ? (
        <p className="vtw__first">{struck ? <StruckWords>{entry.summary}</StruckWords> : entry.summary}</p>
      ) : (
        <div className="vtw__full">
          {block ? (
            <MarkedLine block={{ ...block, label: undefined }} studioLens={studioLens} skip={termNodeId(entry.term)} size="definition" />
          ) : (
            <p className="vtw__first">{entry.definition}</p>
          )}
          {topics.length > 0 && (
            <div className="vtw__taught">
              <h4 className="vtw__taught-title">Where it's taught</h4>
              <ul className="vtw__taught-list">
                {topics.map((r) => (
                  <li key={r.kind === "topic" ? r.topicId : ""}>
                    <button type="button" className="vtw__taught-row" onClick={() => onPeek(r)}>
                      <FileText size={16} aria-hidden />
                      <span>{titleOf(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {hasMore && (
        <button type="button" className="vtw__card-more" aria-expanded={open} onClick={onToggle}>
          {open ? "Less" : "More"}
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      )}
    </article>
  );
}

/** Smoothly, unless the reader asked for less motion (then it jumps, as the house's motion rule says). */
function scrollMotion(): ScrollBehavior {
  try {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    return reduce ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}
