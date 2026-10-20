import { useId, useMemo, useState } from "react";
import { BookOpen, ClipboardList, MessageSquareText } from "lucide-react";
import { MachineFigure } from "../../catalog/MachineFigure";
import { resolveMachineAnatomy } from "../../catalog/anatomy";
import { presetOf, type Preset } from "../../machine-codex/format";
import { useWikiPageGuard } from "../../wiki/page-guard";
import { accentStyle } from "../../wiki/categories";
import { pageFor } from "../../learning-vault/pages";
import { DialTiles } from "../../learning-vault/lesson/DialTiles";
import { shownIds } from "../../learning-vault/map/backlinks";
import { repShapeOf } from "../../learning-vault/rep-phases";
import { hasFloorStatus } from "../../learning-vault/floor-care";
import { constellationOf } from "../../learning-vault/graph";
import { pageKey, routeKey } from "../../learning-vault/routes";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LocalConstellation, categoryNodeStyle } from "../../learning-vault/ui/LocalConstellation";
import { FloorStatus } from "../../learning-vault/ui/FloorStatus";
import { OrphanMarks } from "../../learning-vault/ui/OrphanMarks";
import { RepScrubber } from "../../learning-vault/ui/RepScrubber";
import type { VaultPage, VaultRoute, VaultSection } from "../../learning-vault/types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { useCodex } from "./codex-context";
import { PIECE_WORDS, bentoFacts, machineAccent, machineLayers, readNextOf, type CodexLayer } from "./codex-model";
import { ArticleFoot, Blocks, DeeperDoor, PageHead, TierBar, TodayDoorButton, useLayer, useVersionSlot } from "./CodexBits";
import { CodexFrame, CodexGone, CodexWaiting } from "./CodexFrame";
import "./codex.css";

/**
 * A MACHINE — the Codex's showpiece.
 *
 * Title and its category, the floor's status when there is one (Out of
 * service, Flagged: FloorStatus's banner), then the BENTO: the body with the
 * muscles this machine works (left), the facts a trainer checks and the
 * dials under them (right; the Course's dial tiles, the shared part); side by side from about 700px of page, one over
 * the other below. Then the four depths as one sticky bar (1 Floor glance,
 * set-up first; 2 Script & cues, 3 Adapt & clinical, 4 Deep science), the
 * tier's lines through the vault's body, the door one layer deeper, and
 * only then what the machine connects to. The tier is remembered for the
 * visit.
 *
 * Everything a machine page links to PEEKS (its quick card, its script, a
 * substitute, a cue moment): the machine stays under the reader's thumb,
 * and "Open full page" is one tap in the peek.
 */
export function MachinePage({ route }: { route: Extract<VaultRoute, { kind: "machine" }> }) {
  const { data } = useCodex();
  const page = useMemo(() => pageFor(route, data), [route, data]);
  if (page === "loading") return <CodexWaiting route={route} label="Opening the machine…" />;
  if (page === "gone") return <CodexGone />;
  return <MachineArticle page={page} machineId={route.id} wanted={route.tier ?? null} />;
}

const PIECE_ICON = { card: ClipboardList, script: MessageSquareText, overview: BookOpen } as const;
/**
 * How many links "Connected" shows, after the layers: the strongest reasons
 * first (what stands in when it can't be used, cue moments, clinical flags).
 */
const CONNECTED_MAX = 6;

function MachineArticle({ page, machineId, wanted }: { page: VaultPage; machineId: string; wanted: string | null }) {
  const { data, peek } = useCodex();
  const def = data.defs[machineId];
  const accent = machineAccent(machineId);
  const style = accentStyle(accent);

  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inline } = useVersionSlot(applied.struck, page);

  // The tiers as the bar draws them (machineLayers): the floor glance Stop first, then the set-up.
  const layers = useMemo<CodexLayer[]>(() => machineLayers(page.tiers), [page.tiers]);
  const { active, pick } = useLayer(pageKey(page.route), layers, wanted);
  const layer = layers.find((l) => l.id === active) ?? null;
  const panelId = useId();
  // The lines that set the dials: the floor glance's, less the Stop well. A
  // dial tile a line names turns to them (the Course's tiles, shared).
  const setupLines = useMemo(
    () => (layers.find((l) => l.id === "glance")?.sections ?? []).filter((x) => x.id !== "leaf-stop"),
    [layers],
  );

  const preset = useMemo<Preset | null>(() => (def ? presetOf(def) : null), [def]);
  const hasDials = Boolean(preset && preset.state !== "no-dials");
  // The code as its jersey tag, beside the category: the eyebrow, shown.
  const code = page.facts.find((f) => f.label === "Code")?.value;
  const category = page.facts.find((f) => f.label === "Category")?.value;
  // The category is in the eyebrow (the kicker, or the page's own eyebrow), so a workout it already says goes.
  const facts = bentoFacts(page.facts, { dials: hasDials, category });
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
  // What the constellation draws is not listed again under Linked here.
  const constellationIds = useMemo(() => shownIds(data.graph, page.nodeId, CONNECTED_MAX), [data.graph, page.nodeId]);
  const pieces = page.related.filter(
    (r): r is VaultPage["related"][number] & { route: Extract<VaultRoute, { kind: "card" | "script" | "overview" }> } =>
      r.route.kind === "card" || r.route.kind === "script" || r.route.kind === "overview",
  );

  // What the machine connects to, after the layers on every screen (the
  // floor judge, Oct 19 2026): at the bento's foot its six groups took the
  // first portrait screen from the dials and the set-up lines.
  const connected = page.nodeId ? (
    <section className="cdx__tile cdx__tile--links" aria-label="Connected" style={style}>
      <LocalConstellation
        graph={data.graph}
        nodeId={page.nodeId}
        onOpen={peek}
        variant="pills"
        layout="columns"
        max={CONNECTED_MAX}
        nodeStyle={categoryNodeStyle}
      />
    </section>
  ) : null;

  // Out of service and Flagged, as today's Catalog says them, under the
  // title: the one thing on the page that changes where a trainer walks.
  const care = data.care?.[machineId];

  return (
    <CodexFrame actions={actions}>
      <article className="cdx__article cdx__article--machine">
        <PageHead eyebrow={page.eyebrow} kicker={kicker} title={page.title} lede={page.lede} style={style}>
          {hasFloorStatus(care) && (
            <div className="cdx__status">
              <FloorStatus status={care} variant="banner" />
            </div>
          )}
          <TodayDoorButton route={page.route} />
          {inline}
        </PageHead>

        <div className="cdx__bento" style={style} data-figure={def ? "yes" : "no"}>
          {def && (
            <section className="cdx__tile cdx__tile--body" aria-label="Muscles worked">
              <Figure machineId={machineId} def={def} />
            </section>
          )}

          <section className="cdx__tile cdx__tile--facts" aria-label="Facts">
            {facts.length > 0 && (
              <dl className="cdx__facts">
                {facts.map((f) => (
                  <div key={f.label} className="cdx__fact" data-fact={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
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
            <SetupDials
              preset={preset}
              lines={setupLines}
              onSetup={() => {
                if (active !== "glance") pick("glance");
                try {
                  requestAnimationFrame(() => document.getElementById(panelId)?.scrollIntoView?.({ block: "start" }));
                } catch {
                  /* the set-up is a tap below */
                }
              }}
              onGlance={active === "glance"}
            />
          </section>
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

          {connected && <div className="cdx__connected-after">{connected}</div>}

          <ArticleFoot
            items={readNextOf(page, { skipAcademyPieces: true, shown })}
            mode="peek"
            nodeId={page.nodeId}
            title={page.title}
            also={constellationIds}
          />
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
 * The dials, in the unit's own order, as the shared dial tiles: each its
 * name and this unit's number, or "Not set" (never a guess, and never a
 * letter nobody recorded). A tile whose dial a set-up line names is a button
 * that turns the page to the set-up (the guard asks first when a form is
 * open in the tier it leaves); the rest are quiet wells.
 */
function SetupDials({
  preset,
  lines,
  onSetup,
  onGlance,
}: {
  preset: Preset | null;
  lines: VaultSection[];
  onSetup: () => void;
  onGlance: boolean;
}) {
  const guard = useWikiPageGuard();
  const dials = preset && preset.state !== "no-dials" ? preset.dials : [];
  const jump = () => (onGlance ? onSetup() : guard(onSetup));
  return <DialTiles dials={dials} lines={lines} onJump={lines.length > 0 ? jump : undefined} />;
}
