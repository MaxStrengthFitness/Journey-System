import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Search, X } from "lucide-react";
import { pageFor } from "../../learning-vault/pages";
import { moduleOfTopic } from "../../learning-vault/routes";
import { ArticleBlocks, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import graphIndexJson from "../../learning-vault/graph-index.json";
import type { MarkedBlock, VaultPage, VaultRoute } from "../../learning-vault/types";
import { CueDrillCard } from "./CueDrill";
import { CourseBar, ModeSwitch } from "./LessonPage";
import { courseContextOf, cueDrillsIn } from "./drills";
import { CourseShell, GonePage, LoadingPage, MarkedLine, PageHead, ReadNext, useCourse, useVersionPlacement, type LessonMode } from "./shell";
import { byLetter, filterVault, lettersOf, vaultEntries, type VaultEntry, type VaultFilter } from "./vault";
import "./course.css";

/**
 * THE GLOSSARY VAULT AND THE CUE DRILLS — the two Academy references the
 * Interactive Course turns into something you do (the Learning vault
 * redesign, Oct 19 2026).
 *
 * The vault: every term a card, filtered (All · Method · Equipment), found by
 * a search, jumped to by letter; "More" opens the whole definition (its
 * terms linked) and the Academy topics that teach it, each a row that peeks
 * the topic. The drills: every moment of a set as "What would you cue?".
 * Both keep "Read it all", the page whole through ArticleBlocks, where a
 * line is crossed out, noted, disputed or shared.
 */

const TERM_TOPICS = (graphIndexJson as unknown as { termTopics: Record<string, string[]> }).termTopics;

const FILTERS: { id: VaultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "method", label: "Method" },
  { id: "equipment", label: "Equipment" },
];

function termId(term: string): string {
  return `crs-term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/* ------------------------------------------------------------------ *
 * The glossary vault
 * ------------------------------------------------------------------ */

export function GlossaryPage({ route }: { route: Extract<VaultRoute, { kind: "glossary" }> }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") return <LoadingPage label="Opening the vault…" />;
  if (state === "gone") return <GonePage />;
  return <GlossaryBody page={state} focus={route.term ?? null} />;
}

function GlossaryBody({ page, focus }: { page: VaultPage; focus: string | null }) {
  const { data, nav, phone } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  const course = courseContextOf(nav.stack, data);
  const entries = useMemo(() => vaultEntries(data.glossary, TERM_TOPICS), [data.glossary]);
  const marked = useMemo(() => {
    const m = new Map<string, MarkedBlock>();
    for (const s of applied.sections) for (const b of s.blocks) if (b.label && !m.has(b.label)) m.set(b.label, b);
    return m;
  }, [applied.sections]);

  const [mode, setMode] = useState<LessonMode>("cards");
  const [kind, setKind] = useState<VaultFilter>("all");
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus] : []));
  const shown = useMemo(() => filterVault(entries, { kind, query }), [entries, kind, query]);
  const searching = query.trim() !== "";
  const groups = useMemo(() => (searching ? [{ letter: "", entries: shown }] : byLetter(shown)), [searching, shown]);
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
        root.style.setProperty("--crs-bar-h", `${Math.round(bar.getBoundingClientRect().height) + 12}px`);
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
  }, [mode]);

  // A link to one term opens on it, open.
  useEffect(() => {
    if (!focus) return;
    try {
      document.getElementById(termId(focus))?.scrollIntoView({ block: "center" });
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

  const toLetter = (letter: string) => {
    try {
      document.getElementById(`crs-letter-${letter}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch {
      /* the letter is still there to scroll to */
    }
  };

  return (
    <CourseShell actions={actions}>
      {course && <CourseBar course={course} />}
      <PageHead eyebrow="Academy" title="Glossary vault" lede={page.lede} />
      {inPage}
      <ModeSwitch mode={mode} onMode={setMode} cardsLabel="Vault" />

      {mode === "all" ? (
        <div className="crs__whole">
          <ArticleBlocks target={page.target} sections={page.sections} annotate="inline" renderText={(t) => <LinkedText text={t} />} />
        </div>
      ) : (
        <div className="crs__vault" ref={rootRef} data-phone={phone ? "" : undefined}>
          <div className="crs__vault-bar" ref={barRef}>
            <div className="crs__vault-row">
              <label className="crs__find">
                <Search size={18} aria-hidden />
                <input
                  className="crs__find-input"
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
                  <button type="button" className="crs__find-clear" aria-label="Clear the search" onClick={() => setQuery("")}>
                    <X size={18} aria-hidden />
                  </button>
                )}
              </label>
              <div className="crs__filters" role="group" aria-label="Which words">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" className="crs__filter" aria-pressed={kind === f.id} onClick={() => setKind(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {!searching && letters.length > 1 && (
              <nav className="crs__az" aria-label="Jump to a letter">
                {letters.map((l) => (
                  <button key={l} type="button" className="crs__az-btn" onClick={() => toLetter(l)}>
                    {l}
                  </button>
                ))}
              </nav>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="crs__empty">No word in the glossary matches “{query.trim()}”.</p>
          ) : (
            groups.map((g) => (
              <section key={g.letter || "found"} className="crs__vault-group" aria-label={g.letter ? `Words under ${g.letter}` : "Words found"}>
                {g.letter && (
                  <h2 className="crs__vault-letter" id={`crs-letter-${g.letter}`}>
                    {g.letter}
                  </h2>
                )}
                <div className="crs__vault-grid">
                  {g.entries.map((e) => (
                    <VaultCard
                      key={e.term}
                      entry={e}
                      block={marked.get(e.term) ?? null}
                      studioLens={applied.studioLens}
                      open={opened.has(e.term)}
                      onToggle={() => toggle(e.term)}
                      showKind={kind === "all"}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      <ReadNext related={page.related} />
    </CourseShell>
  );
}

function VaultCard({
  entry,
  block,
  studioLens,
  open,
  onToggle,
  showKind,
}: {
  entry: VaultEntry;
  block: MarkedBlock | null;
  studioLens: boolean;
  open: boolean;
  onToggle: () => void;
  /** "Equipment" on a card, only while the vault shows every kind. */
  showKind: boolean;
}) {
  const { peekAt, titleOf } = useCourse();
  const struck = studioLens && Boolean(block?.strike);
  const topics = entry.topics
    .map((id): VaultRoute | null => {
      const moduleId = moduleOfTopic(id);
      return moduleId ? { kind: "topic", moduleId, topicId: id } : null;
    })
    .filter((r): r is VaultRoute => r !== null);
  const hasMore = entry.definition.length > entry.summary.length + 2 || topics.length > 0 || struck || (studioLens && (block?.notes.length ?? 0) > 0);
  return (
    <article className="crs__vcard" id={termId(entry.term)} data-open={open ? "" : undefined} data-kind={entry.kind}>
      <div className="crs__vcard-head">
        <h3 className="crs__vcard-term">{entry.term}</h3>
        {showKind && entry.kind === "equipment" && <span className="crs__vcard-kind">Equipment</span>}
      </div>
      {!open ? (
        <p className="crs__vcard-first">{struck ? <s className="crs__struck">{entry.summary}</s> : entry.summary}</p>
      ) : (
        <div className="crs__vcard-full">
          {block ? <MarkedLine block={{ ...block, label: undefined }} studioLens={studioLens} /> : <p className="crs__vcard-first">{entry.definition}</p>}
          {topics.length > 0 && (
            <div className="crs__taught">
              <h4 className="crs__taught-title">Where it's taught</h4>
              <ul className="crs__taught-list">
                {topics.map((r) => (
                  <li key={r.kind === "topic" ? r.topicId : ""}>
                    <button type="button" className="crs__taught-row" onClick={() => peekAt(r)}>
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
        <button type="button" className="crs__vcard-more" aria-expanded={open} onClick={onToggle}>
          {open ? "Less" : "More"}
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * The cueing phrasebook, as drills
 * ------------------------------------------------------------------ */

export function CueingPage({ route }: { route: Extract<VaultRoute, { kind: "cueing" }> }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") return <LoadingPage label="Opening the phrasebook…" />;
  if (state === "gone") return <GonePage />;
  return <CueingBody page={state} focus={route.moment ?? null} />;
}

function CueingBody({ page, focus }: { page: VaultPage; focus: number | null }) {
  const { data, nav } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  const course = courseContextOf(nav.stack, data);
  const drills = useMemo(() => cueDrillsIn(page.sections, { min: 1 }), [page.sections]);
  const [mode, setMode] = useState<LessonMode>("cards");

  useEffect(() => {
    if (focus === null) return;
    try {
      document.getElementById(`crs-moment-${focus}`)?.scrollIntoView({ block: "start" });
    } catch {
      /* the moment is on the page to find */
    }
  }, [focus]);

  return (
    <CourseShell actions={actions}>
      {course && <CourseBar course={course} />}
      <PageHead eyebrow="Academy" title="What would you cue?" lede="Every moment of a set. Say it first, then see the Academy's lines." />
      {inPage}
      <ModeSwitch mode={mode} onMode={setMode} cardsLabel="Drills" />
      {mode === "all" ? (
        <div className="crs__whole">
          <ArticleBlocks target={page.target} sections={page.sections} annotate="inline" renderText={(t) => <LinkedText text={t} />} />
          {page.source && <p className="crs__source">{page.source}</p>}
        </div>
      ) : (
        <div className="crs__drills crs__drills--page">
          {drills.map((d) => (
            <div key={d.section} id={d.moment !== null ? `crs-moment-${d.moment}` : undefined} className="crs__anchor">
              <CueDrillCard
                drill={d}
                marked={applied.sections}
                studioLens={applied.studioLens}
                startOpen={d.moment !== null && d.moment === focus}
                cap={Number.POSITIVE_INFINITY}
              />
            </div>
          ))}
        </div>
      )}
      <ReadNext related={page.related} />
    </CourseShell>
  );
}
