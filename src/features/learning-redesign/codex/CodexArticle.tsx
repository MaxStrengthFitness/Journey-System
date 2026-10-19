import { useId, useMemo, type CSSProperties } from "react";
import { ArrowRight, MessageSquareQuote } from "lucide-react";
import { accentStyle } from "../../wiki/categories";
import { DOMAIN_NOUN, cueNodeId, nodeById, termNodeId } from "../../learning-vault/graph";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { moduleOfTopic, pageKey } from "../../learning-vault/routes";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import { OrphanMarks } from "../../learning-vault/ui/OrphanMarks";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import {
  domainWords,
  isEquipmentTerm,
  machineAccent,
  momentSections,
  termSections,
  topicCueMoments,
  topicLayers,
  wordIndex,
} from "./codex-model";
import { Blocks, DeeperDoor, FactLine, PageHead, ReadNext, TierBar, useLayer, useVersionSlot } from "./CodexBits";
import { CodexFailed, CodexFrame, CodexGone, CodexLoading } from "./CodexFrame";
import "./codex.css";

/* ------------------------------------------------------------------ *
 * A topic, in layers
 * ------------------------------------------------------------------ */

/**
 * An Academy topic, adapted to the Codex honestly: 1 In one minute (its
 * headings and the first line under each), 2 Say it (the phrasebook's
 * moments that use its words; their marks are the phrasebook's), 4 Full
 * text. A tier that would be empty is left out.
 */
export function TopicPage({ route }: { route: Extract<VaultRoute, { kind: "topic" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor(route, data), [route, data]);
  if (page === "loading") {
    const mod = moduleOfTopic(route.topicId) ?? route.moduleId;
    if (mod && data.moduleFailed(mod)) return <CodexFailed moduleId={mod} />;
    return <CodexLoading label="Opening the Academy…" />;
  }
  if (page === "gone") return <CodexGone />;
  return <TopicArticle page={page} topicId={route.topicId} />;
}

function TopicArticle({ page, topicId }: { page: VaultPage; topicId: string }) {
  const { data, peek } = useCodex();
  const cueing = useMemo(() => {
    const p = pageFor({ kind: "cueing" }, data);
    return typeof p === "string" ? null : p;
  }, [data]);
  const moments = useMemo(() => topicCueMoments(data.graph, topicId), [data.graph, topicId]);
  const say = useMemo(() => momentSections(cueing, moments), [cueing, moments]);
  const layers = useMemo(() => topicLayers(page.sections, say), [page.sections, say]);

  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck);
  const { active, pick } = useLayer(pageKey(page.route), layers);
  const layer = layers.find((l) => l.id === active) ?? layers[layers.length - 1];
  const panelId = useId();
  const read = page.facts.filter((f) => f.label === "Read");

  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
          <FactLine facts={read} />
          {inline}
        </PageHead>

        {layers.length > 1 && (
          <TierBar layers={layers} active={layer.id} onPick={pick} label={`${page.title}, layer by layer`} panelId={panelId} />
        )}
        <div className="cdx__tierpanel" role={layers.length > 1 ? "tabpanel" : undefined} id={panelId} aria-label={layer.title}>
          {layer.home === "cueing" && cueing ? (
            <>
              <button type="button" className="cdx__from" onClick={() => peek({ kind: "cueing" })}>
                <MessageSquareQuote size={16} aria-hidden />
                From the cueing phrasebook
                <ArrowRight size={14} aria-hidden />
              </button>
              <Blocks key={layer.id} target={cueing.target} sections={layer.sections} partial />
            </>
          ) : (
            <Blocks key={layer.id} target={page.target} sections={layer.sections} partial={layer.partial} skip={page.nodeId} />
          )}
          {layers.length > 1 && <DeeperDoor layers={layers} active={layer.id} onPick={pick} />}
        </div>

        {layer.partial && applied.studioLens && applied.orphans.length > 0 && (
          <div className="cdx__orphans">
            <OrphanMarks target={page.target} orphans={applied.orphans} headingLevel={2} />
          </div>
        )}

        <ReadNext items={page.related} mode="open" />
      </article>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * A quick card, a script, a deep dive, a playbook
 * ------------------------------------------------------------------ */

export function ArticlePage({ route }: { route: Extract<VaultRoute, { kind: "card" | "script" | "overview" | "playbook" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor(route, data), [route, data]);
  if (page === "loading") return <CodexLoading label="Opening the page…" />;
  if (page === "gone") return <CodexGone />;
  return <PlainArticle page={page} />;
}

/** The machine a card, script or deep dive belongs to: its first related link. */
function machineOf(page: VaultPage): string | null {
  const m = page.related.find((r) => r.route.kind === "machine");
  return m && m.route.kind === "machine" ? m.route.id : null;
}

function PlainArticle({ page }: { page: VaultPage }) {
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck);
  const machine = page.route.kind === "playbook" ? null : machineOf(page);
  const style = machine ? accentStyle(machineAccent(machine)) : undefined;
  const facts = page.facts.filter((f) => f.label !== "Category");

  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede} style={style}>
          {page.draft && <p className="cdx__draft">{PLAYBOOK_DRAFT_LINE}</p>}
          <FactLine facts={facts} />
          {inline}
        </PageHead>
        <div className="cdx__tierpanel">
          <Blocks target={page.target} sections={page.sections} skip={page.nodeId} />
        </div>
        <ReadNext items={page.related} mode="open" />
      </article>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * The glossary: a codex list, and each word its own entry
 * ------------------------------------------------------------------ */

export function GlossaryPage({ route }: { route: Extract<VaultRoute, { kind: "glossary" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor({ kind: "glossary" }, data), [data]);
  if (page === "loading") return <CodexLoading label="Opening the glossary…" />;
  if (page === "gone") return <CodexGone />;
  const entry = route.term ? termSections(page, route.term) : [];
  return entry.length > 0 ? <TermEntry page={page} sections={entry} /> : <GlossaryList page={page} />;
}

function TermEntry({ page, sections }: { page: VaultPage; sections: VaultPage["sections"] }) {
  const { data, peek, open } = useCodex();
  const block = sections[0].blocks[0];
  const term = (block.label ?? "").trim();
  // The term is the page's title, so its line shows the definition alone.
  const shown = useMemo(() => [{ ...sections[0], blocks: [{ ...block, label: undefined }] }], [sections, block]);
  const applied = useAppliedMarkup(page.target, shown);
  const { actions, inline } = useVersionSlot(applied.struck);
  const equipment = isEquipmentTerm(sections);

  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow={equipment ? "Glossary · Equipment" : "Glossary · The method"} title={term}>
          {inline}
        </PageHead>
        <div className="cdx__tierpanel">
          <Blocks target={page.target} sections={shown} partial skip={termNodeId(term)} />
        </div>
        <section className="cdx__entry-links" aria-label={`What connects to ${term}`}>
          <LocalConstellation graph={data.graph} nodeId={termNodeId(term)} onOpen={peek} variant="pills" max={10} />
        </section>
        <button type="button" className="cdx__wide-door" onClick={() => open({ kind: "glossary" })}>
          Every word in the glossary
          <ArrowRight size={16} aria-hidden />
        </button>
      </article>
    </CodexFrame>
  );
}

/**
 * The glossary as a codex: every word by its letter, each a door to its own
 * entry (the definition, what it connects to). Under the index, every
 * definition in one list, for reading straight through and for marking.
 */
function GlossaryList({ page }: { page: VaultPage }) {
  const { open } = useCodex();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck);
  const index = useMemo(() => wordIndex(page), [page]);
  const allId = useId();
  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
          {inline}
        </PageHead>
        <div className="cdx__words">
          {index.map((g) => (
            <section key={g.letter} className="cdx__letter" aria-label={g.letter}>
              <h2 className="cdx__letter-head">{g.letter}</h2>
              <ul className="cdx__word-list">
                {g.words.map((w) => (
                  <li key={w.term}>
                    <button type="button" className="cdx__word" onClick={() => open({ kind: "glossary", term: w.term })}>
                      <span className="cdx__word-name">{w.term}</span>
                      {w.equipment && <span className="cdx__word-tag">Equipment</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="cdx__all" aria-labelledby={allId}>
          <h2 className="cdx__h2" id={allId}>
            Every definition
          </h2>
          <div className="cdx__tierpanel">
            <Blocks target={page.target} sections={page.sections} />
          </div>
        </section>
        <ReadNext items={page.related} mode="open" />
      </article>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * The cueing phrasebook: moments, and each moment its own entry
 * ------------------------------------------------------------------ */

export function CueingPage({ route }: { route: Extract<VaultRoute, { kind: "cueing" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor({ kind: "cueing" }, data), [data]);
  if (page === "loading") return <CodexLoading label="Opening the phrasebook…" />;
  if (page === "gone") return <CodexGone />;
  const entry = typeof route.moment === "number" ? momentSections(page, [route.moment]) : [];
  return entry.length > 0 && typeof route.moment === "number" ? (
    <MomentEntry page={page} sections={entry} moment={route.moment} />
  ) : (
    <PhrasebookList page={page} />
  );
}

function MomentEntry({ page, sections, moment }: { page: VaultPage; sections: VaultPage["sections"]; moment: number }) {
  const { data, peek, open } = useCodex();
  const section = sections[0];
  // The moment's name is the page's title; its full words stay as the note.
  const shown = useMemo(() => [{ ...section, title: "" }], [section]);
  const applied = useAppliedMarkup(page.target, shown);
  const { actions, inline } = useVersionSlot(applied.struck);
  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow="Cueing phrasebook" title={section.title}>
          {inline}
        </PageHead>
        <div className="cdx__tierpanel">
          <Blocks target={page.target} sections={shown} partial skip={cueNodeId(moment)} />
        </div>
        <section className="cdx__entry-links" aria-label={`What connects to ${section.title}`}>
          <LocalConstellation graph={data.graph} nodeId={cueNodeId(moment)} onOpen={peek} variant="pills" max={10} />
        </section>
        <button type="button" className="cdx__wide-door" onClick={() => open({ kind: "cueing" })}>
          Every moment in the phrasebook
          <ArrowRight size={16} aria-hidden />
        </button>
      </article>
    </CodexFrame>
  );
}

/**
 * The phrasebook as a codex: the moments of a set in order, each a door to
 * its own entry (its lines, the machines cued there, the words it uses),
 * then every phrase in one list, for reading through and for marking.
 */
function PhrasebookList({ page }: { page: VaultPage }) {
  const { open } = useCodex();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck);
  const allId = useId();
  const rows = Math.ceil(page.sections.length / 2);
  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article">
        <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
          {inline}
        </PageHead>
        <ol className="cdx__chapters cdx__chapters--moments" style={{ "--cdx-rows": rows } as CSSProperties}>
          {page.sections.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="cdx__chapter"
                onClick={() => open({ kind: "cueing", moment: momentIndex(s.id, i) })}
              >
                <span className="cdx__chapter-n">{i + 1}</span>
                <span className="cdx__chapter-words">
                  <span className="cdx__chapter-title">{s.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <section className="cdx__all" aria-labelledby={allId}>
          <h2 className="cdx__h2" id={allId}>
            Every phrase
          </h2>
          <div className="cdx__tierpanel">
            <Blocks target={page.target} sections={page.sections} />
          </div>
        </section>
        <ReadNext items={page.related} mode="open" />
      </article>
    </CodexFrame>
  );
}

/** A phrasebook section's moment number ("moment-3"), else its place. */
function momentIndex(sectionId: string, fallback: number): number {
  const m = /^moment-(\d+)$/.exec(sectionId);
  return m ? Number(m[1]) : fallback;
}

/* ------------------------------------------------------------------ *
 * A map entry: a clinical flag and what it touches
 * ------------------------------------------------------------------ */

export function MapEntryPage({ route }: { route: Extract<VaultRoute, { kind: "map" }> }) {
  const { data } = useCodex();
  const focus = route.focus ?? null;
  if (!focus) return <CodexGone />;
  if (!data.graph && !data.entities) return <CodexLoading label="Finding what connects…" />;
  const node = data.graph ? nodeById(data.graph, focus) : null;
  const entity = data.entities?.byId.get(focus) ?? null;
  if (!node && !entity) return <CodexGone />;
  return <MapEntry focus={focus} label={node?.label ?? entity?.label ?? ""} noun={node ? DOMAIN_NOUN[node.domain] : ""} summary={entity?.summary ?? ""} />;
}

function MapEntry({ focus, label, noun, summary }: { focus: string; label: string; noun: string; summary: string }) {
  const { data, open } = useCodex();
  return (
    <CodexFrame>
      <article className="cdx__article">
        <PageHead eyebrow={domainWords(noun) || undefined} title={label}>
          {summary && (
            <p className="cdx__lede">
              <LinkedText text={summary} />
            </p>
          )}
        </PageHead>
        <section className="cdx__entry-links" aria-label={`What connects to ${label}`}>
          <LocalConstellation graph={data.graph} nodeId={focus} onOpen={open} variant="pills" max={12} />
        </section>
      </article>
    </CodexFrame>
  );
}
