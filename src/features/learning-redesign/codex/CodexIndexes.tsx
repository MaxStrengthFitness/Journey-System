import { useMemo } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { accentStyle } from "../../wiki/categories";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import type { VaultRoute } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import { chapterNumber, machineAccent, machineCategory, otherMachines, stepKind } from "./codex-model";
import { BandHead, FactLine, KindGlyph, PageHead } from "./CodexBits";
import { CodexFrame, CodexGone, CodexLoading } from "./CodexFrame";
import { FloorList, MethodList, PathRows, PlayCard, PlaybookShelves, ReferencePair } from "./CodexShelves";
import "./codex.css";

/* ------------------------------------------------------------------ *
 * The Catalog: the floor first
 * ------------------------------------------------------------------ */

/**
 * The Catalog is the floor first (a recorded decision): the studio's own
 * machines in the order a trainer walks them, each with its code, its
 * category and its preset when one is set. Under them, the MSF machines this
 * floor does not have, so nothing in the Academy is out of reach; when the
 * floor could not be read, or has nothing on it, every MSF machine.
 */
export function CatalogIndex() {
  const { data, studioName, open } = useCodex();
  const others = useMemo(
    () => otherMachines(data.machines, data.floor, data.floorState),
    [data.machines, data.floor, data.floorState],
  );
  return (
    <CodexFrame>
      <div className="cdx__index">
        <PageHead title={`${studioName}'s floor`} />
        <FloorList />
        {others.machines.length > 0 && (
          <section className="cdx__band" aria-labelledby="cdx-others">
            <BandHead id="cdx-others" title={others.every ? "Every MSF machine" : `Not on ${studioName}'s floor`} />
            <ul className="cdx__entries cdx__entries--quiet">
              {others.machines.map((m) => {
                const category = machineCategory(m.machineId);
                return (
                  <li key={m.machineId}>
                    <button
                      type="button"
                      className="cdx__entry"
                      style={accentStyle(machineAccent(m.machineId))}
                      onClick={() => open({ kind: "machine", id: m.machineId })}
                    >
                      <span className="cdx__entry-code">
                        <span className="wk__row-code">{m.abbr || "–"}</span>
                      </span>
                      <span className="cdx__entry-words">
                        <span className="cdx__entry-name">{m.name}</span>
                      </span>
                      {category && <span className="cdx__entry-cat">{category}</span>}
                      <ChevronRight className="cdx__chev" size={16} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * The Academy's index
 * ------------------------------------------------------------------ */

/**
 * The Academy as a codex's contents: the thirteen chapters, the two
 * reference books, the playbooks on their shelves (drafts, said once), every
 * path, and the quiz.
 */
export function AcademyIndex() {
  const { data } = useCodex();
  return (
    <CodexFrame>
      <div className="cdx__index">
        <PageHead eyebrow="MSF Academy" title="The method" />
        <MethodList blurbs />

        <section className="cdx__band" aria-labelledby="cdx-reference">
          <BandHead id="cdx-reference" title="Reference" />
          <ReferencePair />
        </section>

        <section className="cdx__band" aria-labelledby="cdx-playbooks">
          <BandHead id="cdx-playbooks" title="Playbooks" />
          <p className="cdx__draft">{PLAYBOOK_DRAFT_LINE}</p>
          <PlaybookShelves />
        </section>

        <section className="cdx__band" aria-labelledby="cdx-all-paths">
          <BandHead id="cdx-all-paths" title="Paths" />
          <PathRows tracks={data.tracks} />
        </section>

        <div className="cdx__band">
          <PlayCard />
        </div>
      </div>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * A module: its topics as numbered chapters
 * ------------------------------------------------------------------ */

export function ModulePage({ route }: { route: Extract<VaultRoute, { kind: "module" }> }) {
  const { data, open } = useCodex();
  const page = useMemo(() => pageFor(route, data), [route, data]);
  if (page === "loading") return <CodexLoading label="Opening the Academy…" />;
  if (page === "gone") return <CodexGone />;
  const mod = data.index.modules.find((m) => m.id === route.moduleId);
  const at = data.index.modules.findIndex((m) => m.id === route.moduleId);
  const next = at >= 0 ? data.index.modules[at + 1] : undefined;
  return (
    <CodexFrame>
      <article className="cdx__article">
        <PageHead eyebrow={page.eyebrow} title={page.title} lede={page.lede}>
          <FactLine facts={page.facts} />
        </PageHead>
        <ol className="cdx__chapters cdx__chapters--topics">
          {page.related.map((r, i) => (
            <li key={`${i}-${r.title}`}>
              <button type="button" className="cdx__chapter" onClick={() => open(r.route)}>
                <span className="cdx__chapter-n cdx__chapter-n--topic">{chapterNumber(mod?.n ?? 0, i)}</span>
                <span className="cdx__chapter-words">
                  <span className="cdx__chapter-title">{r.title}</span>
                </span>
                <span className="cdx__chapter-time">{r.why}</span>
              </button>
            </li>
          ))}
        </ol>
        {next && (
          <button type="button" className="cdx__deeper" onClick={() => open({ kind: "module", moduleId: next.id })}>
            <span className="cdx__deeper-n" aria-hidden="true">
              {next.n}
            </span>
            <span className="cdx__deeper-words">
              <span className="cdx__deeper-kicker">Next chapter</span>
              <span className="cdx__deeper-title">{next.title}</span>
            </span>
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </article>
    </CodexFrame>
  );
}

/* ------------------------------------------------------------------ *
 * A path: its steps, numbered, each with why it comes there
 * ------------------------------------------------------------------ */

export function TrackPage({ route }: { route: Extract<VaultRoute, { kind: "track" }> }) {
  const { data, open } = useCodex();
  const track = data.tracks.find((t) => t.id === route.id);
  if (!track) return <CodexGone />;
  return (
    <CodexFrame>
      <article className="cdx__article">
        <PageHead eyebrow={`Path for ${track.who.charAt(0).toLowerCase()}${track.who.slice(1)}`} title={track.title} />
        <ol className="cdx__steps">
          {track.steps.map((s, i) => (
            <li key={`${i}-${s.title}`}>
              <button type="button" className="cdx__step" onClick={() => open(s.route)}>
                <span className="cdx__step-n">{i + 1}</span>
                <span className="cdx__step-words">
                  <span className="cdx__step-title">{s.title}</span>
                  <span className="cdx__step-why">{s.why}</span>
                </span>
                <KindGlyph kind={stepKind(s.route)} />
                <ChevronRight className="cdx__chev" size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </article>
    </CodexFrame>
  );
}
