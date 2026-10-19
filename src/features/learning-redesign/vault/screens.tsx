import { useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FileText,
  Gamepad2,
  Hand,
  Inbox,
  Library,
  Lightbulb,
  List,
  MessageCircle,
  MessageSquareQuote,
  Network,
  Route as RouteIcon,
  TrendingUp,
} from "lucide-react";
import { LoadingArea } from "../../../components/LoadingMark";
import { usePhone } from "../../phone/device";
import { readingTime } from "../../learning/home";
import { switchesOf } from "../../machine-codex/format";
import { WikiBadge } from "../../wiki";
import { hasFloorStatus } from "../../learning-vault/floor-care";
import { nodeById, nodeIdForRoute } from "../../learning-vault/graph";
import { pageFor, titleOf } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE, playbooksForPillar } from "../../learning-vault/playbooks";
import { DECKS } from "../../learning-vault/quiz/decks";
import { strikeSignals } from "../../learning-vault/submissions";
import type { GraphDomain, QuizDeckId, VaultGraph, VaultPage, VaultRoute, VaultSection } from "../../learning-vault/types";
import { ArticleBlocks, OrphanMarks, pageAccent, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { FloorStatus } from "../../learning-vault/ui/FloorStatus";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { DOMAIN_ICON } from "../../learning-vault/ui/LocalConstellation";
import { machineAccentStyle } from "../../learning-vault/ui/page-accent";
import { QuizMode } from "../../learning-vault/ui/QuizMode";
import { SubmissionQueue, queueLead } from "../../learning-vault/ui/SubmissionQueue";
import { useAllMarkup, useStudioMarkup, useSubmissions, useVault } from "../../learning-vault/ui/VaultProvider";
import { VersionToggle } from "../../learning-vault/ui/VersionToggle";
import {
  backlinksOf,
  bodySections,
  letterIndex,
  pathDots,
  shownIds,
  studioLineKeys,
  unionKeys,
  whoSaid,
  withoutShown,
  type Backlink,
} from "./map-model";
import { MapExplorer, domainVars } from "./RumorMap";
import { MiniOrbit } from "./MiniOrbit";
import { DidNotLoad, Frame, stuckReason, useVaultScreen } from "./shell";
import "./vault-map.css";

/**
 * THE VAULT'S SCREENS — Design 2 (the Learning vault redesign, Oct 19 2026).
 *
 * Home (the Rumor Map, then where to start and Play), the Catalog (the
 * studio's floor first, the map a lens), the Academy (its modules, the
 * reference pages, the playbooks; the map a lens), and every page: a header
 * with the page's own constellation beside its title, the body with the
 * studio's marks in a gutter, and "Linked here" (what points at this page,
 * and why) at its foot. Every cross-link peeks, so the page under the
 * reader's thumb never goes away until they choose "Open full page".
 */

type Glyph = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;

/** How many links a page's own orbit draws. */
const ORBIT_MAX = 8;
/** "Linked here" shows this many before "Show all". */
const BACKLINKS_FIRST = 8;

/** A route's glyph: its domain's when it is a node on the map, else by what it is. */
function glyphFor(route: VaultRoute, domain?: GraphDomain): Glyph {
  if (domain) return DOMAIN_ICON[domain];
  switch (route.kind) {
    case "machine":
      return Dumbbell;
    case "card":
      return FileText;
    case "script":
      return MessageCircle;
    case "overview":
    case "topic":
      return BookOpen;
    case "module":
      return Library;
    case "glossary":
      return Lightbulb;
    case "cueing":
      return MessageSquareQuote;
    case "playbook":
      return ClipboardList;
    case "track":
      return RouteIcon;
    case "quiz":
      return Gamepad2;
    default:
      return ArrowRight;
  }
}

/** The domain of the map node a route stands for, when it is one. */
function domainOfRoute(route: VaultRoute, graph: VaultGraph | null): GraphDomain | undefined {
  const id = nodeIdForRoute(route);
  return id && graph ? (nodeById(graph, id)?.domain ?? undefined) : undefined;
}

/* ------------------------------------------------------------------ *
 * Waiting and gone
 * ------------------------------------------------------------------ */

export function LoadingScreen({ route }: { route: VaultRoute }) {
  const { data } = useVaultScreen();
  const stuck = stuckReason(route, data);
  return (
    <Frame>
      {stuck === "floor" ? (
        <FloorUnreadable />
      ) : stuck === "module" ? (
        <DidNotLoad retry={data.retryModule && route.kind === "topic" ? () => data.retryModule?.(route.moduleId) : undefined} />
      ) : stuck === "reference" ? (
        <DidNotLoad retry={data.retryReference} />
      ) : (
        <LoadingArea label="Opening the page…" />
      )}
    </Frame>
  );
}

/** One of the studio's own machines, while its floor cannot be read: said, with the way back. */
function FloorUnreadable() {
  const { nav, rootLabel } = useVaultScreen();
  const { studio } = useVault();
  const name = studio.name.trim() || "this studio";
  return (
    <div className="vm__gone" role="status">
      <p className="vm__gone-title">Can't read {floorTitle(name)} right now.</p>
      <p className="vm__gone-body">This machine is one of {name}'s own, so its page waits for the floor. The MSF machines are all in the Catalog.</p>
      <button type="button" className="vm__btn" onClick={() => nav.reset(nav.stack[0])}>
        Back to {rootLabel}
      </button>
    </div>
  );
}

export function GoneScreen() {
  const { nav, rootLabel } = useVaultScreen();
  return (
    <Frame>
      <div className="vm__gone">
        <p className="vm__gone-title">This page has moved.</p>
        <p className="vm__gone-body">The Academy was rebuilt since this link was made. Search Learning finds it by name.</p>
        <button type="button" className="vm__btn" onClick={() => nav.reset(nav.stack[0])}>
          Back to {rootLabel}
        </button>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

export function HomeScreen() {
  const { data, open } = useVaultScreen();
  const { viewer } = useVault();
  return (
    <Frame scrollKey="vault-home">
      <div className="vm__home">
        <MapExplorer stateKey="home" kind="home" chips />

        <section className="vm__section" aria-labelledby="vm-start">
          <h2 className="vm__h2" id="vm-start">
            Reading paths
          </h2>
          <ul className="vm__tracks">
            {data.tracks.map((t) => {
              const dots = pathDots(t.steps.length);
              return (
                <li key={t.id}>
                  <button type="button" className="vm__track" onClick={() => open({ kind: "track", id: t.id })}>
                    <span className="vm__track-title">{t.title}</span>
                    {!whoSaid(t.title, t.who) && <span className="vm__track-who">{t.who}</span>}
                    <span className="vm__track-path" aria-hidden="true">
                      {Array.from({ length: dots }, (_, i) => (
                        <span key={i} className="vm__track-dot" />
                      ))}
                    </span>
                    {t.steps[0] && <span className="vm__track-first">Starts with {t.steps[0].title}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="vm__duo">
          <PlayCard />
          {viewer.isHeadOffice && <QueueCard />}
        </div>
      </div>
    </Frame>
  );
}

const PLAY_DECKS: QuizDeckId[] = ["mixed", "cues", "hutchins"];

function PlayCard() {
  const { open } = useVaultScreen();
  const decks = DECKS.filter((d) => PLAY_DECKS.includes(d.id));
  return (
    <section className="vm__play" aria-labelledby="vm-play">
      <div className="vm__play-head">
        <span className="vm__play-mark" aria-hidden="true">
          <Gamepad2 size={20} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="vm__h3" id="vm-play">
            Play
          </h2>
          {/* "Nothing is kept" is said once, by the quiz's own deck picker. */}
          <p className="vm__play-line">Ten questions from the method: the Academy and Hutchins' definition.</p>
        </div>
      </div>
      <ul className="vm__play-decks">
        {decks.map((d) => (
          <li key={d.id}>
            <button type="button" className="vm__deck" onClick={() => open({ kind: "quiz", deck: d.id })}>
              <span>{d.title}</span>
              <ArrowRight size={16} aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="vm__deck vm__deck--all" onClick={() => open({ kind: "quiz" })}>
            <span>Every deck</span>
            <ArrowRight size={16} aria-hidden />
          </button>
        </li>
      </ul>
    </section>
  );
}

function QueueCard() {
  const { open } = useVaultScreen();
  const subs = useSubmissions();
  const markup = useAllMarkup();
  const lines = useMemo(() => strikeSignals(markup).length, [markup]);
  const waiting = subs.filter((s) => s.status === "pending").length;
  return (
    <section className="vm__play vm__play--queue" aria-labelledby="vm-queue">
      <div className="vm__play-head">
        <span className="vm__play-mark" aria-hidden="true">
          <Inbox size={20} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="vm__h3" id="vm-queue">
            Waiting for review
          </h2>
          <p className="vm__play-line">{queueLead(waiting, subs.length - waiting, lines)}</p>
        </div>
      </div>
      <button type="button" className="vm__deck" onClick={() => open({ kind: "queue" })}>
        <span>Open the list</span>
        <ArrowRight size={16} aria-hidden />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Lens switch (Catalog: Floor | Map; Academy: Modules | Map)
 * ------------------------------------------------------------------ */

function LensSwitch({ lensKey, first }: { lensKey: string; first: { id: string; label: string } }) {
  const { lens, setLens } = useVaultScreen();
  const value = lens(lensKey) || first.id;
  const opts = [
    { id: first.id, label: first.label, Icon: first.id === "floor" ? Dumbbell : Library },
    { id: "map", label: "Map", Icon: Network },
    { id: "list", label: "List", Icon: List },
  ];
  return (
    <div className="vm__seg" role="group" aria-label="Show as">
      {opts.map(({ id, label, Icon }) => (
        <button key={id} type="button" className="vm__seg-opt" aria-pressed={value === id} onClick={() => setLens(lensKey, id)}>
          <Icon size={16} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** The explorer's mode for a lens page, or null when the page shows its own index. */
function lensMode(value: string): "map" | "list" | null {
  return value === "map" ? "map" : value === "list" ? "list" : null;
}

/* ------------------------------------------------------------------ *
 * Catalog: the studio's floor first
 * ------------------------------------------------------------------ */

export function CatalogScreen() {
  const { data, open, lens } = useVaultScreen();
  const { studio } = useVault();
  const name = studio.name;
  const floor = data.floor;
  const mapMode = lensMode(lens("catalog"));
  const floorIds = useMemo(() => new Set((floor ?? []).map((f) => `machine:${f.id}`)), [floor]);
  const elsewhere = useMemo(() => {
    const on = new Set((floor ?? []).map((f) => f.id));
    return data.machines
      .filter((m) => !on.has(m.machineId))
      .map((m) => ({ id: m.machineId, name: m.name, code: m.abbr ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.machines, floor]);

  return (
    <Frame scrollKey="vault-catalog">
      <div className="vm__index">
        <header className="vm__index-head">
          <h1 className="vm__index-title">{floorTitle(name)}</h1>
          <LensSwitch lensKey="catalog" first={{ id: "floor", label: "Floor" }} />
        </header>

        {mapMode ? (
          <MapExplorer stateKey="catalog" kind="lens" chips domains={["machine", "clinical", "cue"]} marked={floorIds} mode={mapMode} />
        ) : (
          <>
            {floor === null ? (
              data.floorState === "unreadable" ? (
                <p className="vm__well">Can't read {name}'s floor right now. Every MSF machine is below.</p>
              ) : (
                <LoadingArea label="Reading the floor…" />
              )
            ) : floor.length === 0 ? (
              <p className="vm__well">{name}'s floor has no machines yet. Every MSF machine is below.</p>
            ) : (
              <ol className="vm__floor">
                {floor.map((m, i) => (
                  <li key={m.id}>
                    <FloorRow n={i + 1} id={m.id} name={m.name} code={m.code} onOpen={() => open({ kind: "machine", id: m.id })} />
                  </li>
                ))}
              </ol>
            )}
            {elsewhere.length > 0 && floor !== undefined && (
              <section className="vm__section" aria-labelledby="vm-elsewhere">
                <h2 className="vm__h2" id="vm-elsewhere">
                  {floor && floor.length > 0 ? `Not on ${name}'s floor` : "Every MSF machine"}
                </h2>
                <ul className="vm__floor vm__floor--quiet">
                  {elsewhere.map((m) => (
                    <li key={m.id}>
                      <FloorRow id={m.id} name={m.name} code={m.code} onOpen={() => open({ kind: "machine", id: m.id })} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Frame>
  );
}

function floorTitle(name: string): string {
  const n = name.trim() || "This studio";
  return /s$/i.test(n) ? `${n}' floor` : `${n}'s floor`;
}

/**
 * One machine on the floor list: what a trainer needs before walking over
 * (judges' fix, Oct 19 2026, in place of how many things it links to, a
 * number with no reader on the floor). Out of service and Flagged first, in
 * the Catalog's own words and plum, said only once the floor's status is
 * known; then how the set begins (a gradual load-up or a handoff) and Never
 * to failure, the first second of the set. A studio's own machine with no
 * MSF definition says only what the floor says.
 */
function FloorRow({ n, id, name, code, onOpen }: { n?: number; id: string; name: string; code: string | null; onOpen: () => void }) {
  const { data } = useVaultScreen();
  const def = data.defs[id];
  const sw = def ? switchesOf(def) : null;
  return (
    <button type="button" className="vm__floor-row" onClick={onOpen}>
      {n !== undefined && <span className="vm__floor-n">{n}</span>}
      {/* The tag in the machine's category colour, as the Catalog draws it. */}
      {code && (
        <span className="vm__code" style={machineAccentStyle(id)}>
          {code}
        </span>
      )}
      <span className="vm__floor-text">
        <span className="vm__floor-name">{name}</span>
        <FloorStatus status={data.care?.[id]} variant="chip" />
        {sw && (
          <span className="vm__floor-tags">
            <WikiBadge tone="neutral">
              {sw.beginsWith === "handoff" ? (
                <Hand size={13} strokeWidth={2.3} aria-hidden />
              ) : (
                <TrendingUp size={13} strokeWidth={2.3} aria-hidden />
              )}
              {sw.beginsWith === "handoff" ? "Handoff" : "Load-up"}
            </WikiBadge>
            {/* The Academy's safety rule, in the crimson the Catalog and My Studio give it. */}
            {sw.neverToFailure && <WikiBadge tone="alert">Never to failure</WikiBadge>}
          </span>
        )}
      </span>
      <ChevronRight size={18} aria-hidden className="vm__floor-go" />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Academy index
 * ------------------------------------------------------------------ */

export function AcademyScreen() {
  const { data, open, lens } = useVaultScreen();
  const mapMode = lensMode(lens("academy"));
  return (
    <Frame scrollKey="vault-academy">
      <div className="vm__index">
        <header className="vm__index-head">
          <h1 className="vm__index-title">Academy</h1>
          <LensSwitch lensKey="academy" first={{ id: "modules", label: "Modules" }} />
        </header>

        {mapMode ? (
          <MapExplorer stateKey="academy" kind="lens" chips domains={["module", "topic", "method", "equipment", "cue"]} mode={mapMode} />
        ) : (
          <>
            <ol className="vm__modules">
              {data.index.modules.map((m) => {
                const minutes = m.topics.reduce((s, t) => s + t.readingMinutes, 0);
                return (
                  <li key={m.id}>
                    <button type="button" className="vm__module" onClick={() => open({ kind: "module", moduleId: m.id })}>
                      <span className="vm__module-n">{m.n}</span>
                      <span className="vm__module-text">
                        <span className="vm__module-title">{m.title}</span>
                        <span className="vm__module-meta">
                          {m.topics.length === 1 ? "1 topic" : `${m.topics.length} topics`} · {readingTime(minutes)}
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden className="vm__floor-go" />
                    </button>
                  </li>
                );
              })}
            </ol>

            <section className="vm__section" aria-labelledby="vm-reference">
              <h2 className="vm__h2" id="vm-reference">
                The words
              </h2>
              <div className="vm__doors">
                <Door
                  icon={Lightbulb}
                  title="Glossary"
                  line="The exact words the Academy asks trainers to use."
                  onClick={() => open({ kind: "glossary" })}
                />
                <Door
                  icon={MessageSquareQuote}
                  title="Cueing phrasebook"
                  line="What to say, moment by moment through a set."
                  onClick={() => open({ kind: "cueing" })}
                />
              </div>
            </section>

            <section className="vm__section" aria-labelledby="vm-playbooks">
              <h2 className="vm__h2" id="vm-playbooks">
                Life Transformer playbooks
              </h2>
              <p className="vm__draft">{PLAYBOOK_DRAFT_LINE}</p>
              <div className="vm__pillars">
                {data.pillars.map((p) => {
                  const pages = playbooksForPillar(p.id);
                  if (pages.length === 0) return null;
                  return (
                    <div key={p.id} className="vm__pillar">
                      <h3 className="vm__pillar-title">{p.title}</h3>
                      <ul className="vm__rows">
                        {pages.map((pb) => (
                          <li key={pb.id}>
                            <button type="button" className="vm__row" onClick={() => open({ kind: "playbook", id: pb.id })}>
                              <span className="vm__row-text">
                                <span className="vm__row-title">{pb.title}</span>
                                <span className="vm__row-why">{pb.lede}</span>
                              </span>
                              <ChevronRight size={16} aria-hidden className="vm__row-go" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="vm__duo">
              <PlayCard />
            </div>
          </>
        )}
      </div>
    </Frame>
  );
}

function Door({ icon: Icon, title, line, onClick }: { icon: Glyph; title: string; line: string; onClick: () => void }) {
  return (
    <button type="button" className="vm__door" onClick={onClick}>
      <span className="vm__door-mark" aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="vm__door-text">
        <span className="vm__door-title">{title}</span>
        <span className="vm__door-line">{line}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="vm__floor-go" />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * A module: its topics
 * ------------------------------------------------------------------ */

export function ModuleScreen({ page }: { page: VaultPage }) {
  const { open } = useVaultScreen();
  return (
    <Frame>
      <article className="vm__article vm__article--plain">
        <header className="vm__head">
          <p className="wk__eyebrow">{page.eyebrow}</p>
          <h1 className="wk__h1">{page.title}</h1>
          {page.lede && <p className="wk__lede">{page.lede}</p>}
        </header>
        <ol className="vm__modules">
          {page.related.map((r, i) => (
            <li key={`${i}-${r.title}`}>
              <button type="button" className="vm__module" onClick={() => open(r.route)}>
                <span className="vm__module-n">{i + 1}</span>
                <span className="vm__module-text">
                  <span className="vm__module-title">{r.title}</span>
                  <span className="vm__module-meta">{r.why}</span>
                </span>
                <ChevronRight size={18} aria-hidden className="vm__floor-go" />
              </button>
            </li>
          ))}
        </ol>
      </article>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * A reading path
 * ------------------------------------------------------------------ */

export function TrackScreen({ id }: { id: string }) {
  const { data, open } = useVaultScreen();
  const track = data.tracks.find((t) => t.id === id);
  if (!track) return <GoneScreen />;
  return (
    <Frame>
      <article className="vm__article vm__article--plain">
        <header className="vm__head">
          <p className="wk__eyebrow">Reading path</p>
          <h1 className="wk__h1">{track.title}</h1>
          {/* Who it is for, unless the title already says so ("For a head trainer"). */}
          {!whoSaid(track.title, track.who) && <p className="wk__lede">For {lowerFirst(track.who)}.</p>}
        </header>
        <ol className="vm__path">
          {track.steps.map((s, i) => {
            const Icon = glyphFor(s.route, domainOfRoute(s.route, data.graph));
            return (
              <li key={`${i}-${s.title}`} className="vm__path-step">
                <span className="vm__path-n" aria-hidden="true">
                  {i + 1}
                </span>
                <button type="button" className="vm__path-card" onClick={() => open(s.route)}>
                  <span className="vm__path-title">
                    <Icon size={16} strokeWidth={2.2} aria-hidden className="vm__path-icon" />
                    {s.title}
                  </span>
                  <span className="vm__path-why">{s.why}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </article>
    </Frame>
  );
}

function lowerFirst(text: string): string {
  const t = text.trim().replace(/\.$/, "");
  // "A new Life Transformer" -> "a new Life Transformer"; an acronym keeps its capitals.
  return /^[A-Z](?![A-Z])/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/* ------------------------------------------------------------------ *
 * The quiz, head office's list, a map of its own
 * ------------------------------------------------------------------ */

export function QuizScreen({ deck }: { deck?: QuizDeckId }) {
  const { data, peekAt, nav } = useVaultScreen();
  // The bank is built from the reference chunks: one that cannot arrive is said, never shuffled forever.
  if (data.quizBank === null && data.referenceFailed) {
    return (
      <Frame>
        <DidNotLoad retry={data.retryReference} />
      </Frame>
    );
  }
  return (
    <Frame>
      <div className="vm__quiz">
        <QuizMode bank={data.quizBank} initialDeck={deck} onOpenSource={peekAt} onExit={nav.canBack ? nav.back : undefined} />
      </div>
    </Frame>
  );
}

export function QueueScreen() {
  const { open } = useVaultScreen();
  return (
    <Frame>
      <div className="vm__index">
        <header className="vm__index-head">
          <h1 className="vm__index-title">Waiting for review</h1>
        </header>
        <SubmissionQueue onOpen={open} />
      </div>
    </Frame>
  );
}

export function MapScreen({ focus }: { focus?: string }) {
  return (
    <Frame>
      <div className="vm__home">
        <MapExplorer stateKey={`map:${focus ?? ""}`} kind="home" chips initialFocus={focus ?? null} />
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Every article
 * ------------------------------------------------------------------ */

export function PageScreen({ route }: { route: VaultRoute }) {
  const { data } = useVaultScreen();
  const state = useMemo(() => pageFor(route, data), [route, data]);
  // LoadingScreen says when waiting will not help (a chunk that failed, an unreadable floor).
  if (state === "loading") return <LoadingScreen route={route} />;
  if (state === "gone") return <GoneScreen />;
  if (route.kind === "module") return <ModuleScreen page={state} />;
  return <ArticleScreen route={route} page={state} />;
}

/** The facts the eyebrow or the page's own links do not already say (say it once). */
function factsToShow(page: VaultPage) {
  const eyebrow = page.eyebrow.toLowerCase();
  return page.facts.filter(
    (f) => f.label !== "In the Academy" && f.label !== "Module" && !eyebrow.includes(f.value.toLowerCase()),
  );
}

/**
 * A glossary term's page puts the term's own line first; a cue moment's
 * page, its moment. The SAME blocks, reordered, so no studio mark is lost
 * or doubled, and the rest of the glossary or phrasebook follows to browse.
 */
export function orderedSections(route: VaultRoute, sections: VaultSection[]): VaultSection[] {
  if (route.kind === "glossary" && route.term) {
    const term = route.term.trim().toLowerCase();
    for (let si = 0; si < sections.length; si += 1) {
      const bi = sections[si].blocks.findIndex((b) => (b.label ?? "").trim().toLowerCase() === term);
      if (bi < 0) continue;
      const block = sections[si].blocks[bi];
      const lead: VaultSection = { id: "this-term", title: "", blocks: [{ ...block, label: undefined }] };
      const rest = sections
        .map((s, i) => (i === si ? { ...s, blocks: s.blocks.filter((_b, j) => j !== bi) } : s))
        .filter((s) => s.blocks.length > 0);
      return [lead, ...rest];
    }
    return sections;
  }
  if (route.kind === "cueing" && typeof route.moment === "number") {
    const at = sections.findIndex((s) => s.id === `moment-${route.moment}`);
    if (at < 0) return sections;
    return [{ ...sections[at], title: "" }, ...sections.filter((_s, i) => i !== at)];
  }
  return sections;
}

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * The lines that tie this page to the studio, kept for the visit: a key
 * seen once stays until the page changes (unionKeys), so a section the body
 * drew never drops out under the reader's finger (recheck fix, Oct 19 2026:
 * putting back the only crossed-out line of a beat dropped its section, and
 * the selection, kept by position, landed on a line under Adapt). Writing
 * the ref while drawing is safe: the answer only ever grows, the same way
 * each time.
 */
function useKeptKeys(scope: string, now: ReadonlySet<string>): ReadonlySet<string> {
  const ref = useRef<{ scope: string; keys: ReadonlySet<string> } | null>(null);
  const before = ref.current !== null && ref.current.scope === scope ? ref.current.keys : NO_KEYS;
  const keys = unionKeys(before, now);
  ref.current = { scope, keys };
  return keys;
}

/**
 * The glossary's row of letters: each a jump to its letter's words, inside
 * Learning's one scroller (smooth only when motion is welcome). Never throws.
 */
function jumpToLetter(body: HTMLElement | null, letter: string) {
  try {
    if (!body) return;
    const head = [...body.querySelectorAll<HTMLElement>("h2, h3")].find((h) => h.textContent?.trim() === letter);
    const target = head?.closest("section") ?? head;
    if (!target) return;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroller = target.closest(".wk__scroll");
    if (scroller instanceof HTMLElement && typeof scroller.scrollTo === "function") {
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
      scroller.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
    } else if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
    }
  } catch {
    /* a page that cannot be measured stays where it is */
  }
}

function ArticleScreen({ route, page }: { route: VaultRoute; page: VaultPage }) {
  const { data, peekAt } = useVaultScreen();
  const { studio } = useVault();
  const phone = usePhone();
  const sections = useMemo(() => orderedSections(route, page.sections), [route, page.sections]);
  const applied = useAppliedMarkup(page.target, sections);
  const toggle = <VersionToggle struck={applied.struck} />;
  const bodyRef = useRef<HTMLDivElement>(null);

  // The body: a machine's spoken script and deep dive are peeks under Read
  // alongside, not eleven more screens. A line this studio crossed out,
  // noted or told head office about keeps its section (so no mark and no
  // answer goes missing), read whichever version is showing and kept for
  // the visit (useKeptKeys), so nothing moves when a mark comes off.
  const markup = useStudioMarkup(page.target.key);
  const submissions = useSubmissions();
  const markedNow = useMemo(
    () => studioLineKeys(markup, submissions, studio.id, page.target.key),
    [markup, submissions, studio.id, page.target.key],
  );
  const marked = useKeptKeys(page.target.key, markedNow);
  const body = useMemo(() => bodySections(route.kind, sections, marked), [route.kind, sections, marked]);
  const partial = body !== sections;
  // The gutter is where this design keeps a studio's marks. On an iPad, a
  // page with a studio's version lines its words up past the gutter in BOTH
  // versions: ArticleBlocks keeps the gutter's column, empty, on the MSF
  // original, so switching versions never moves the line being compared or
  // the Stop well's edge (recheck fix, Oct 19 2026). A phone, where 48px of
  // a 358px column is too much to give (as in the peek), and a viewer with
  // no studio read at the page's edge.
  const gutterPage = !phone && studio.id !== null;
  const annotate = gutterPage ? "gutter" : "inline";
  const letters = route.kind === "glossary" ? letterIndex(body) : [];
  const care = route.kind === "machine" ? data.care?.[route.id] : undefined;

  // A glossary term and a cue moment are pages of their own here: titled by
  // the term or the moment, with its own constellation.
  const focused = sections !== page.sections;
  const heading = !focused
    ? page.title
    : route.kind === "glossary" && route.term
      ? (data.glossary?.find((g) => g.term.trim().toLowerCase() === route.term?.trim().toLowerCase())?.term ?? route.term)
      : titleOf(route, data);
  const eyebrow = focused ? (route.kind === "glossary" ? "Glossary" : "Cueing phrasebook") : page.eyebrow;
  const lede = focused ? undefined : page.lede;

  const orbitMax = phone ? 6 : ORBIT_MAX;
  const shown = useMemo(() => shownIds(data.graph, page.nodeId, orbitMax), [data.graph, page.nodeId, orbitMax]);
  // Say it once: "Linked here" says the rest, never what the orbit at the
  // top already draws; a related page the orbit draws, or "Linked here"
  // lists, is not listed again under Read alongside.
  const backlinks = useMemo(
    () => backlinksOf(data.graph, page.nodeId ?? null).filter((b) => !shown.has(b.node.id)),
    [data.graph, page.nodeId, shown],
  );
  const related = useMemo(() => {
    const said = new Set(shown);
    for (const b of backlinks) said.add(b.node.id);
    return withoutShown(page.related, said);
  }, [page.related, shown, backlinks]);
  // A page whose only fact is how long it takes to read says so in its eyebrow.
  const allFacts = factsToShow(page);
  const readOnly = allFacts.length === 1 && allFacts[0].label === "Read";
  const facts = readOnly ? [] : allFacts;
  const eyebrowLine = readOnly ? `${eyebrow} · ${allFacts[0].value}` : eyebrow;

  return (
    <Frame actions={phone ? undefined : toggle}>
      <article className="vm__article" data-kind={route.kind}>
        <div className="vm__top">
          <header className="vm__head">
            <p className="wk__eyebrow">{eyebrowLine}</p>
            <h1 className="wk__h1">{heading}</h1>
            {lede && (
              <p className="wk__lede">
                <LinkedText text={lede} skip={page.nodeId} />
              </p>
            )}
            {page.draft && <p className="vm__draft">{PLAYBOOK_DRAFT_LINE}</p>}
            {/* Out of service and Flagged, where today's machine page says them: under the title. */}
            {hasFloorStatus(care) && (
              <div className="vm__status">
                <FloorStatus status={care} variant="banner" />
              </div>
            )}
            {facts.length > 0 && (
              <dl className="vm__facts">
                {facts.map((f) => (
                  <div key={f.label} className="vm__fact">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </header>

          {phone && <div className="vm__toggle-row">{toggle}</div>}

          {page.nodeId && data.graph && (
            <div className="vm__orbit">
              <MiniOrbit nodeId={page.nodeId} title={heading} max={orbitMax} />
            </div>
          )}
        </div>

        {/* The glossary's letters span the whole article, above its two
            columns in landscape, so the alphabet is one row there too. */}
        {letters.length > 0 && (
          <nav aria-label="Jump to a letter">
            <ul className="vm__letters">
              {letters.map((l) => (
                <li key={l.letter}>
                  <button
                    type="button"
                    className="vm__letter-btn"
                    aria-label={`Words under ${l.letter}`}
                    onClick={() => jumpToLetter(bodyRef.current, l.letter)}
                  >
                    {l.letter}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="vm__main">
          <div className="vm__body" ref={bodyRef} data-annotate={annotate}>
            <ArticleBlocks
              target={page.target}
              sections={body}
              annotate={annotate}
              accent={pageAccent(page)}
              showOrphans={!partial}
              renderText={(t) => <LinkedText text={t} skip={page.nodeId} />}
            />
            {/* A body that leaves sections out says the page's own changed lines once, over the whole page. */}
            {partial && <OrphanMarks target={page.target} orphans={applied.orphans} />}
            {/* A source a reader would recognise; a topic's file path is not one (its lines name their topic). */}
            {page.source && !page.source.startsWith("docs/") && <p className="vm__source">From {page.source}</p>}
          </div>

          {(related.length > 0 || backlinks.length > 0) && (
            <div className="vm__side">
              {related.length > 0 && (
                <nav className="vm__related" aria-labelledby="vm-alongside">
                  <h2 className="vm__h3" id="vm-alongside">
                    Read alongside
                  </h2>
                  <ul className="vm__rows">
                    {related.map((r, i) => {
                      const Icon = glyphFor(r.route, domainOfRoute(r.route, data.graph));
                      return (
                        <li key={`${i}-${r.title}`}>
                          <button type="button" className="vm__row" onClick={() => peekAt(r.route)}>
                            <span className="vm__row-mark" aria-hidden="true">
                              <Icon size={16} strokeWidth={2.2} />
                            </span>
                            <span className="vm__row-text">
                              <span className="vm__row-title">{r.title}</span>
                              <span className="vm__row-why">{r.why}</span>
                            </span>
                            <ChevronRight size={16} aria-hidden className="vm__row-go" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              )}
              <Backlinks links={backlinks} title={heading} />
            </div>
          )}
        </div>
      </article>
    </Frame>
  );
}

/** Obsidian's backlinks: what points at this page, and why, each a peek. */
function Backlinks({ links, title }: { links: Backlink[]; title: string }) {
  const { peekAt } = useVaultScreen();
  const [all, setAll] = useState(false);
  if (links.length === 0) return null;
  const shown = all ? links : links.slice(0, BACKLINKS_FIRST);
  return (
    <section className="vm__backlinks" aria-labelledby="vm-linked">
      <h2 className="vm__h3" id="vm-linked">
        Linked here
      </h2>
      <ul className="vm__rows">
        {shown.map(({ node, edge }) => {
          const Icon = DOMAIN_ICON[node.domain];
          return (
            <li key={node.id}>
              <button type="button" className="vm__row" style={domainVars(node.domain)} onClick={() => peekAt(node.route)}>
                <span className="vm__row-mark vm__row-mark--domain" aria-hidden="true">
                  <Icon size={15} strokeWidth={2.25} />
                </span>
                <span className="vm__row-text">
                  <span className="vm__row-title">{node.label}</span>
                  <span className="vm__row-why">
                    {edge.label} {title}
                  </span>
                </span>
                <ChevronRight size={16} aria-hidden className="vm__row-go" />
              </button>
            </li>
          );
        })}
      </ul>
      {links.length > BACKLINKS_FIRST && (
        <button type="button" className="vm__more" onClick={() => setAll(!all)} aria-expanded={all}>
          <span>{all ? "Show fewer" : `Show all ${links.length}`}</span>
        </button>
      )}
    </section>
  );
}
