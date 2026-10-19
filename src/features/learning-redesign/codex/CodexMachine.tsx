import { useId, useMemo, useState } from "react";
import { BookOpen, ClipboardList, MessageSquareText } from "lucide-react";
import { MachineFigure } from "../../catalog/MachineFigure";
import { resolveMachineAnatomy } from "../../catalog/anatomy";
import { presetOf, type Preset } from "../../machine-codex/format";
import { accentStyle } from "../../wiki/categories";
import { pageFor } from "../../learning-vault/pages";
import { repShapeOf } from "../../learning-vault/rep-phases";
import { constellationOf } from "../../learning-vault/graph";
import { pageKey, routeKey } from "../../learning-vault/routes";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LocalConstellation } from "../../learning-vault/ui/LocalConstellation";
import { OrphanMarks } from "../../learning-vault/ui/OrphanMarks";
import { RepScrubber } from "../../learning-vault/ui/RepScrubber";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { useCodex } from "./codex-context";
import { bentoFacts, machineAccent, readNextOf, type CodexLayer } from "./codex-model";
import { Blocks, DeeperDoor, PageHead, ReadNext, TierBar, useLayer, useVersionSlot } from "./CodexBits";
import { CodexFrame, CodexGone, CodexLoading } from "./CodexFrame";
import "./codex.css";

/**
 * A MACHINE — the Codex's showpiece.
 *
 * Title and its category, then the BENTO: the body with the muscles this
 * machine works and its dials under it (left), the facts a trainer checks
 * and what the machine connects to (right); two tiles side by side from
 * about 700px of page, one over the other below. Then the four depths as
 * one sticky bar (1 Floor glance, 2 Script & cues, 3 Adapt & clinical,
 * 4 Deep science), the tier's lines through the vault's body, and the door
 * one layer deeper. The tier is remembered for the visit.
 *
 * Everything a machine page links to PEEKS (its quick card, its script, a
 * substitute, a cue moment): the machine stays under the reader's thumb,
 * and "Open full page" is one tap in the peek.
 */
export function MachinePage({ route }: { route: Extract<VaultRoute, { kind: "machine" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor(route, data), [route, data]);
  if (page === "loading") return <CodexLoading label="Opening the machine…" />;
  if (page === "gone") return <CodexGone />;
  return <MachineArticle page={page} machineId={route.id} wanted={route.tier ?? null} />;
}

const PIECE_ICON = { card: ClipboardList, script: MessageSquareText, overview: BookOpen } as const;
const PIECE_WORDS = { card: "Quick card", script: "Script", overview: "Deep dive" } as const;
/**
 * How many links the bento's constellation shows: the strongest reasons first
 * (what can replace it, cue moments, clinical flags), few enough that the four layers
 * are on the first screen of a portrait iPad.
 */
const CONNECTED_MAX = 6;

function MachineArticle({ page, machineId, wanted }: { page: VaultPage; machineId: string; wanted: string | null }) {
  const { data, peek } = useCodex();
  const def = data.defs[machineId];
  const accent = machineAccent(machineId);
  const style = accentStyle(accent);

  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck);

  const layers = useMemo<CodexLayer[]>(
    () => (page.tiers ?? []).map((t) => ({ id: t.id, n: t.n, title: t.title, sections: t.sections, partial: true })),
    [page.tiers],
  );
  const { active, pick } = useLayer(pageKey(page.route), layers, wanted);
  const layer = layers.find((l) => l.id === active) ?? null;
  const panelId = useId();

  const preset = useMemo<Preset | null>(() => (def ? presetOf(def) : null), [def]);
  const hasDials = Boolean(preset && preset.state !== "no-dials");
  const facts = bentoFacts(page.facts, { dials: hasDials });
  // The code as its jersey tag, beside the category: the eyebrow, shown.
  const code = page.facts.find((f) => f.label === "Code")?.value;
  const category = page.facts.find((f) => f.label === "Category")?.value;
  const kicker = code ? (
    <p className="cdx__eyebrow cdx__eyebrow--machine">
      <span className="wk__row-code">{code}</span>
      {category && <span>{category}</span>}
    </p>
  ) : undefined;
  // What the bento's constellation already lists is not said again under "Read next".
  const shown = useMemo(() => {
    const c = data.graph && page.nodeId ? constellationOf(data.graph, page.nodeId, CONNECTED_MAX) : null;
    return new Set((c?.links ?? []).map((l) => routeKey(l.node.route)));
  }, [data.graph, page.nodeId]);
  const pieces = page.related.filter(
    (r): r is VaultPage["related"][number] & { route: Extract<VaultRoute, { kind: "card" | "script" | "overview" }> } =>
      r.route.kind === "card" || r.route.kind === "script" || r.route.kind === "overview",
  );

  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article cdx__article--machine">
        <PageHead eyebrow={page.eyebrow} kicker={kicker} title={page.title} lede={page.lede} style={style}>
          {inline}
        </PageHead>

        <div className="cdx__bento" style={style} data-figure={def ? "yes" : "no"}>
          {def && (
            <section className="cdx__tile cdx__tile--body" aria-label="Muscles worked">
              <Figure machineId={machineId} def={def} />
            </section>
          )}

          <section className="cdx__tile cdx__tile--facts" aria-label="Facts">
            <dl className="cdx__facts">
              {facts.map((f) => (
                <div key={f.label} className="cdx__fact" data-fact={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            {pieces.length > 0 && (
              <ul className="cdx__pieces" aria-label="In the Academy">
                {pieces.map((r) => {
                  const kind = r.route.kind;
                  const Icon = PIECE_ICON[kind];
                  return (
                    <li key={kind}>
                      <button type="button" className="cdx__piece" onClick={() => peek(r.route)}>
                        <Icon size={16} aria-hidden />
                        {PIECE_WORDS[kind]}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="cdx__tile cdx__tile--dials" aria-label="Dials">
            <DialStrip preset={preset} />
          </section>

          {page.nodeId && (
            <section className="cdx__tile cdx__tile--links" aria-label="Connected">
              <LocalConstellation
                graph={data.graph}
                nodeId={page.nodeId}
                onOpen={peek}
                variant="pills"
                layout="columns"
                max={CONNECTED_MAX}
              />
            </section>
          )}
        </div>

        <div className="cdx__layers">
          {layers.length > 0 && (
            <>
              <TierBar
                layers={layers}
                active={active}
                onPick={pick}
                label={`${page.title}, layer by layer`}
                panelId={panelId}
              />
              <div className="cdx__tierpanel" role="tabpanel" id={panelId} aria-label={layer?.title}>
                {active === "script" && def && (
                  <div className="cdx__rep">
                    <RepScrubber shape={repShapeOf(def)} cues={data.cues} machineName={page.title} onOpenSource={peek} />
                  </div>
                )}
                {layer && <Blocks key={layer.id} target={page.target} sections={layer.sections} partial skip={page.nodeId} />}
                <DeeperDoor layers={layers} active={active} onPick={pick} />
              </div>
            </>
          )}

          {applied.studioLens && applied.orphans.length > 0 && (
            <div className="cdx__orphans">
              <OrphanMarks target={page.target} orphans={applied.orphans} headingLevel={2} />
            </div>
          )}

          <ReadNext items={readNextOf(page, { skipAcademyPieces: true, shown })} mode="peek" />
        </div>
      </article>
    </CodexFrame>
  );
}

/** The body with this machine's muscles lit, on the side that shows them. */
function Figure({ machineId, def }: { machineId: string; def: MachineCatalogEntry }) {
  const anatomy = useMemo(() => resolveMachineAnatomy(machineId, def), [machineId, def]);
  const [view, setView] = useState<"front" | "back">(anatomy.preferredView);
  const [gender, setGender] = useState<"male" | "female">("male");
  return (
    <div className="cdx__figure">
      <MachineFigure
        className="cdx__figure-in"
        anatomy={anatomy}
        view={view}
        gender={gender}
        onViewChange={setView}
        onGenderChange={setGender}
      />
    </div>
  );
}

/**
 * The dials, in the unit's own order: each with its preset number, or "not
 * set" (never a guess, and never a letter nobody recorded). A dial with a
 * rule written for it opens it underneath.
 */
function DialStrip({ preset }: { preset: Preset | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!preset || preset.state === "no-dials") {
    return <p className="cdx__dials-none">No dials recorded for this unit.</p>;
  }
  if (preset.state === "none" && !preset.dials.some((d) => d.rule || d.firstSetup)) {
    // Nothing set and nothing written: the dials by name, and that honestly.
    return (
      <div className="cdx__dials cdx__dials--bare">
        <ul className="cdx__dial-names">
          {preset.dials.map((d) => (
            <li key={d.key} className="cdx__dial-name">
              {d.letter && <span className="cdx__dial-letter">{d.letter}</span>}
              {d.label}
            </li>
          ))}
        </ul>
        <p className="cdx__dials-note">No numbers set for this unit yet.</p>
      </div>
    );
  }
  const shown = preset.dials.find((d) => d.key === open) ?? null;
  return (
    <div className="cdx__dials">
      <ul className="cdx__dial-row">
        {preset.dials.map((d) => {
          const body = (
            <>
              <span className="cdx__dial-label">
                {d.letter && <span className="cdx__dial-letter">{d.letter}</span>}
                {d.label}
              </span>
              {d.number ? (
                <span className="cdx__dial-n">{d.number}</span>
              ) : (
                <span className="cdx__dial-unset">not set</span>
              )}
            </>
          );
          const ruled = Boolean(d.rule || d.firstSetup);
          return (
            <li key={d.key}>
              {ruled ? (
                <button
                  type="button"
                  className="cdx__dial"
                  aria-expanded={open === d.key}
                  onClick={() => setOpen((o) => (o === d.key ? null : d.key))}
                >
                  {body}
                </button>
              ) : (
                <div className="cdx__dial cdx__dial--still">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {shown && (
        <div className="cdx__dial-rule">
          <p className="cdx__dial-rule-head">{shown.label}</p>
          {shown.rule && <p>{shown.rule}</p>}
          {shown.firstSetup && <p className="cdx__dial-first">First set-up: {shown.firstSetup}</p>}
        </div>
      )}
    </div>
  );
}
