import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FileText,
  Gamepad2,
  Library,
  MessageSquareQuote,
  Type,
} from "lucide-react";
import { useWikiPageGuard } from "../../wiki/page-guard";
import { nodeIdForRoute } from "../../learning-vault/graph";
import { LinkedHere } from "../../learning-vault/map/LinkedHere";
import { applyMarkup } from "../../learning-vault/markup";
import { ArticleBlocks } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { useStudioMarkup, useVault } from "../../learning-vault/ui/VaultProvider";
import { VersionToggle } from "../../learning-vault/ui/VersionToggle";
import type { VaultFact, VaultPage, VaultRoute, VaultSection, VaultTarget } from "../../learning-vault/types";
import { todayDoorFor, todayDoorLabel } from "../today-door";
import { useCodex } from "./codex-context";
import { groupReasons, hideReserved, nextLayer, pickLayer, stepKind, versionFitsTrail, type StepKind } from "./codex-model";
import "./codex.css";

/* ------------------------------------------------------------------ *
 * A page's head
 * ------------------------------------------------------------------ */

/**
 * The version switch's place. On an iPad it rides the trail's row (sticky,
 * one tap from any line) when the crumbs and the switch fit there side by
 * side; on a phone, or on a deep trail whose first crumb the row would cut
 * mid-word, it sits under the title instead (versionFitsTrail).
 *
 * `struck` is what the lens on screen shows crossed out (the switch's own
 * Hide button); the PLACE is read from the page's sections without the lens
 * (hideReserved), so tapping "MSF original" never moves the switch out from
 * under the finger (review fix, Oct 19 2026).
 */
export function useVersionSlot(
  struck: number,
  page: { target: VaultTarget; sections: VaultSection[] },
): { actions: ReactNode; inline: ReactNode } {
  const { phone, crumbs } = useCodex();
  const vault = useVault();
  const markup = useStudioMarkup(page.target.key);
  const studioOpen = vault.studio.id !== null;
  const studioStruck = useMemo(
    () => (studioOpen && markup ? applyMarkup(page.sections, markup, { lens: "studio", showCrossed: true }).struck : 0),
    [studioOpen, markup, page.sections],
  );
  const reserve = hideReserved({ studioOpen, canStrike: vault.viewer.canStrike, studioStruck });
  const width = useViewportWidth();
  // Marking off (markup-on.ts): the studio's version and the MSF original
  // read the same, so there is no switch and no room kept for one.
  if (!vault.markup) return { actions: undefined, inline: null };
  const toggle = <VersionToggle struck={struck} />;
  const inRow = !phone && versionFitsTrail({ labels: crumbs.map((c) => c.label), struck: reserve, width });
  return inRow ? { actions: toggle, inline: null } : { actions: undefined, inline: <div className="cdx__version">{toggle}</div> };
}

/** The screen's width, kept current on a turn of the iPad; an iPad held upright where there is no window. */
function useViewportWidth(): number {
  const read = () => {
    try {
      return typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 820;
    } catch {
      return 820;
    }
  };
  const [width, setWidth] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWidth(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/**
 * The door to today's Learning for the studio's tools this page does not
 * have yet (today-door.ts): one quiet door under the title, named for what
 * is behind it. Nothing on a page with no counterpart, or with no door given.
 */
export function TodayDoorButton({ route }: { route: VaultRoute }) {
  const { openToday, data } = useCodex();
  const door = todayDoorFor(route);
  const label = door ? todayDoorLabel(door) : null;
  if (!openToday || !door || !label) return null;
  // A machine's door only for a machine on this floor (review, Oct 20 2026):
  // today's Catalog opens any other on All MSF machines, where none of the
  // studio's tools are, so the door's words would be wrong. A floor still
  // loading, or unreadable, draws none.
  if (door.kind === "machine" && !data.floor?.some((m) => m.id === door.id)) return null;
  return (
    <p className="cdx__today">
      <button type="button" className="cdx__more" onClick={() => openToday(door)}>
        {label}
        <ChevronRight size={15} aria-hidden />
      </button>
    </p>
  );
}

export function PageHead({
  eyebrow,
  kicker,
  title,
  lede,
  style,
  children,
}: {
  eyebrow?: string;
  /** A richer eyebrow (a machine's code chip and category), in its place. */
  kicker?: ReactNode;
  title: string;
  lede?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <header className="cdx__head" style={style}>
      {kicker ?? (eyebrow && <p className="cdx__eyebrow">{eyebrow}</p>)}
      <h1 className="cdx__title">{title}</h1>
      {lede && (
        <p className="cdx__lede">
          <LinkedText text={lede} />
        </p>
      )}
      {children}
    </header>
  );
}

/** A page's few facts as one quiet line of pairs ("Module 4 · Exercise Performance", "Read 3 min"). */
export function FactLine({ facts }: { facts: readonly VaultFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="cdx__factline">
      {facts.map((f) => (
        <div key={f.label} className="cdx__factline-item">
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A section head on an index: Geist 22/800, with one door beside it when there is one. */
export function BandHead({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <header className="cdx__band-head">
      <h2 className="cdx__h2" id={id}>
        {title}
      </h2>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * The body
 * ------------------------------------------------------------------ */


/**
 * The page's lines, through the vault's one body (ArticleBlocks): studio
 * markup inline under each line, the line actions, the forms in place.
 * A partial body (one tier of a page) leaves "lines that changed" to the
 * page (showOrphans off), which lists them once, counted over every tier
 * (CodexMachine, CodexArticle). The one "Tap a line to …" is the body's,
 * placed as in the other two designs: never in the Stop well, never between
 * a label and its lines (line-actions' hintSpot).
 */
export function Blocks({
  target,
  sections,
  partial = false,
  compact = false,
  skip,
  accent,
}: {
  target: VaultTarget;
  sections: VaultSection[];
  partial?: boolean;
  compact?: boolean;
  /** The page's own entity: a page never links its own name back to itself. */
  skip?: string;
  /** A machine's quick card, script or deep dive: its machine's category (pageAccent), for the spoken lines. */
  accent?: CSSProperties;
}) {
  const linked = useCallback((text: string) => <LinkedText text={text} skip={skip} />, [skip]);
  return (
    <div className="cdx__blocks">
      <ArticleBlocks
        target={target}
        sections={sections}
        annotate="inline"
        renderText={linked}
        compact={compact}
        headingLevel={2}
        showOrphans={!partial}
        accent={accent}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The tier bar
 * ------------------------------------------------------------------ */

/**
 * The tier a page shows, remembered for the visit. The page holds it; the
 * bar and the door that change it ask first (they sit inside the page's
 * leave scope, which the page itself does not: it draws the shell).
 */
export function useLayer(pageKey: string, layers: readonly { id: string }[], wanted?: string | null) {
  const { tierFor, rememberTier } = useCodex();
  const [chosen, setChosen] = useState<string | null>(() => tierFor(pageKey) ?? wanted ?? null);
  const active = pickLayer(layers, chosen);
  const pick = (id: string) => {
    if (id === active) return;
    setChosen(id);
    rememberTier(pageKey, id);
  };
  return { active, pick };
}

/**
 * A tier switch takes the tier on screen away, with any form open in it, so
 * it asks the page's leave scope first and changes only inside the answer.
 */
function useGuardedPick(onPick: (id: string) => void, active: string | null) {
  const guard = useWikiPageGuard();
  return (id: string) => {
    if (id === active) return;
    guard(() => onPick(id));
  };
}

/**
 * The four depths of a page as one segmented bar, sticky under the trail.
 * Tabs (a list of them, arrows between), each 44px and more: the depth's
 * number in the display face, then its name. A switch while the reader is
 * further down the page brings the bar back to the top, so the new tier
 * starts where its first line is.
 */
export function TierBar({
  layers,
  active,
  onPick,
  label,
  panelId,
}: {
  layers: readonly { id: string; n: number; title: string }[];
  active: string | null;
  onPick: (id: string) => void;
  label: string;
  panelId: string;
}) {
  const base = useId();
  const choose = useGuardedPick(onPick, active);
  const markRef = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mark = markRef.current;
    if (!mark) return;
    try {
      const scroller = mark.closest(".wk__scroll");
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      if (mark.getBoundingClientRect().top < top && typeof mark.scrollIntoView === "function") {
        mark.scrollIntoView({ block: "start" });
      }
    } catch {
      /* a layout that cannot be measured stays where it is */
    }
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? layers.length - 1 : step ? i + step : -1;
    if (to < 0 || to >= layers.length) return;
    e.preventDefault();
    const next = layers[to];
    choose(next.id);
    tabs.current.get(next.id)?.focus();
  };

  return (
    <>
      <div className="cdx__tiermark" ref={markRef} aria-hidden="true" />
      <div className="cdx__tierbar">
        <div className="cdx__tiers" role="tablist" aria-label={label} data-count={layers.length}>
          {layers.map((l, i) => {
            const on = l.id === active;
            return (
              <button
                key={l.id}
                ref={(el) => {
                  if (el) tabs.current.set(l.id, el);
                  else tabs.current.delete(l.id);
                }}
                type="button"
                role="tab"
                id={`${base}-${l.id}`}
                className="cdx__tier"
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(l.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className="cdx__tier-n" aria-hidden="true">
                  {l.n}
                </span>
                <span className="cdx__tier-name">{l.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** "Next: 3 Adapt & clinical", the door at the foot of a tier into the one under it. */
export function DeeperDoor({
  layers,
  active,
  onPick,
}: {
  layers: readonly { id: string; n: number; title: string }[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  const choose = useGuardedPick(onPick, active);
  const next = nextLayer(layers, active);
  if (!next) return null;
  return (
    <button type="button" className="cdx__deeper" onClick={() => choose(next.id)}>
      <span className="cdx__deeper-n" aria-hidden="true">
        {next.n}
      </span>
      <span className="cdx__deeper-words">
        <span className="cdx__deeper-kicker">One layer deeper</span>
        <span className="cdx__deeper-title">{next.title}</span>
      </span>
      <ChevronRight size={18} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

const STEP_GLYPH: Record<StepKind, typeof BookOpen> = {
  machine: Dumbbell,
  topic: BookOpen,
  playbook: ClipboardList,
  words: Type,
  cues: MessageSquareQuote,
  quiz: Gamepad2,
  module: Library,
  page: FileText,
};

export function KindGlyph({ kind, size = 16 }: { kind: StepKind; size?: number }) {
  const Icon = STEP_GLYPH[kind];
  return (
    <span className="cdx__glyph" data-kind={kind} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

/**
 * The foot of an article: "Read next", then "Linked here" (what points at
 * this page, and why; the Vault's backlinks, Oct 19 2026). Say it once: a
 * page that Read next already lists, or that draws its own constellation
 * (`also`: the node ids it shows), is not listed again under Linked here,
 * and Linked here draws nothing at all when nothing is left to list. Its
 * rows peek, so the page stays under the reader's thumb.
 */
export function ArticleFoot({
  items,
  mode,
  nodeId,
  title,
  also,
}: {
  items: VaultPage["related"];
  mode: "peek" | "open";
  nodeId: string | null | undefined;
  /** The page's title, for each row's reason ("talks about LEG PRESS"); the node's own label when absent. */
  title?: string;
  /** Node ids the page already draws elsewhere (a constellation), so Linked here does not repeat them. */
  also?: ReadonlySet<string>;
}) {
  const { data, open, peek } = useCodex();
  const exclude = useMemo(() => {
    const ids = new Set<string>(also ?? []);
    for (const r of items) {
      const id = nodeIdForRoute(r.route);
      if (id) ids.add(id);
    }
    return ids;
  }, [items, also]);
  return (
    <>
      <ReadNext items={items} mode={mode} />
      <LinkedHere graph={data.graph} nodeId={nodeId} onOpen={open} onPeek={peek} title={title} exclude={exclude} />
    </>
  );
}

/**
 * A lens switch: two or three ways to look at one index, as one segmented
 * control (Floor · Map on the Catalog, Chapters · Map on the Academy, Read ·
 * Drill these on the phrasebook). Each option is 44px. A switch replaces
 * what is on the page, so it asks the page's leave scope first and changes
 * only inside the answer, like the tier bar.
 */
export function LensSwitch({
  options,
  active,
  onPick,
  label,
}: {
  options: readonly { id: string; label: string }[];
  active: string;
  onPick: (id: string) => void;
  label: string;
}) {
  const guard = useWikiPageGuard();
  return (
    <div className="cdx__lens" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="cdx__lens-opt"
          aria-pressed={o.id === active}
          onClick={() => {
            if (o.id !== active) guard(() => onPick(o.id));
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Read next": the page's related pages as 44px link cards. From a machine
 * they peek (the machine stays under the reader's thumb); from a topic they
 * open, because reading on is the point. Links that give the same reason
 * (the Leg Press's three substitutes) share it, said once over their cards
 * (groupReasons); every other card keeps its own.
 */
export function ReadNext({ items, mode }: { items: VaultPage["related"]; mode: "peek" | "open" }) {
  const { open, peek } = useCodex();
  const headId = useId();
  const groups = useMemo(() => groupReasons(items), [items]);
  if (items.length === 0) return null;
  const go = mode === "peek" ? peek : open;
  return (
    <section className="cdx__next" aria-labelledby={headId}>
      <h2 className="cdx__h3" id={headId}>
        Read next
      </h2>
      {groups.map((g, gi) => (
        <div key={gi} className="cdx__next-group">
          {g.why && <p className="cdx__next-why">{g.why}</p>}
          <ul className="cdx__next-grid">
            {g.items.map((r, i) => (
              <li key={`${i}-${r.title}`}>
                <button type="button" className="cdx__link" onClick={() => go(r.route)}>
                  <KindGlyph kind={stepKind(r.route)} />
                  <span className="cdx__link-words">
                    <span className="cdx__link-title">{r.title}</span>
                    {!g.why && r.why && <span className="cdx__link-why">{r.why}</span>}
                  </span>
                  <ChevronRight className="cdx__chev" size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
