import { Fragment, useMemo, useRef, useState, type CSSProperties } from "react";
import { EyeOff, Hand, MapPin, OctagonAlert, Repeat, ShieldAlert, TrendingUp } from "lucide-react";
import { BodyModel } from "../../../components/anatomy";
import { resolveMachineAnatomy } from "../../catalog/anatomy";
import { accentForAcademyCategory, accentStyle } from "../../wiki/categories";
import { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } from "../../routine-builder/academy";
import { presetOf, switchesOf } from "../../machine-codex/format";
import { repShapeOf, SHAPE_LABEL } from "../../learning-vault/rep-phases";
import { substituteLine, TIER_TITLES } from "../../learning-vault/codex-reader";
import { floorUnreadableFor, pageFor } from "../../learning-vault/pages";
import { ArticleBlocks, OrphanMarks, useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { LinkedText } from "../../learning-vault/ui/LinkedText";
import { machineAccentStyle } from "../../learning-vault/ui/page-accent";
import { RepScrubber } from "../../learning-vault/ui/RepScrubber";
import { useWikiPageGuard } from "../../wiki/page-guard";
import type { CodexTierId, VaultPage, VaultRoute } from "../../learning-vault/types";
import { CueDrillCard } from "./CueDrill";
import { CourseBar } from "./LessonPage";
import { StepDeck } from "./StepDeck";
import { courseContextOf, cueDrillsIn } from "./drills";
import {
  CourseShell,
  FailedPage,
  FloorUnreadablePage,
  GonePage,
  LoadingPage,
  MarkedLine,
  PageHead,
  ReadNext,
  SectionHead,
  hiddenWords,
  runLabels,
  scrollMotion,
  useCourse,
  useVersionPlacement,
} from "./shell";
import { cardNaming, chunkSteps } from "./steps";
import "./course.css";

/**
 * THE FIELD MANUAL — a machine, the Interactive Course's way (the Learning
 * vault redesign, Oct 19 2026).
 *
 * Read standing at the machine, top to bottom:
 *   the blueprint   the body it works and the unit's dials as pins
 *                   (LegendKeeper's pins on Inkling's blueprint): each dial's
 *                   number on this unit, or "Not set". A pin whose dial a
 *                   set-up line names is a button (raised, its blue go mark)
 *                   that turns the deck to that card; the rest are wells.
 *   Stop            the lines a trainer must not miss, never folded, plum
 *   the set-up deck the floor glance (Set up, Get set, Begin) as step cards;
 *                   the cards' own titles name it, so no heading over it
 *   the repetition  the scrubber, in this machine's shape, with no lines to
 *                   say: the drills under it are where the lines are asked
 *   At each moment  this machine's moments, the lines behind a tap
 *   The full manual one tier at a time, through ArticleBlocks, opening on
 *                   Adapt & clinical: the first tier the page has not already
 *                   drawn above (Floor glance is the Stop panel and the deck;
 *                   Script & cues holds the drills' answers). Each other tier
 *                   is one tap away, for crossing out or noting its lines.
 *                   The page's lines that changed are listed once, under it.
 *
 * Nothing on the page suggests a weight (the house's rule for the machine
 * card): the pins are the unit's own numbers, never a starting load. A
 * studio's own machine, which nobody has described, gets no rep shape and no
 * "begins with" (a confident wrong fact is worse than none).
 */
export function MachinePage({ route }: { route: Extract<VaultRoute, { kind: "machine" }> }) {
  const { data } = useCourse();
  const state = pageFor(route, data);
  if (state === "loading") {
    // Two waits that would never end: a studio's own machine on a floor that
    // cannot be read, and an Academy chunk that failed to arrive.
    if (floorUnreadableFor(route, data)) return <FloorUnreadablePage />;
    if (data.referenceFailed) return <FailedPage onRetry={data.retryReference} />;
    return <LoadingPage label="Opening the field manual…" />;
  }
  if (state === "gone") return <GonePage />;
  return <MachineBody key={state.target.key} page={state} machineId={route.id} />;
}

const TIERS: CodexTierId[] = ["glance", "script", "adapt", "science"];
/** The tier the full manual opens on: the first the page has not drawn above it. */
export const FIRST_MANUAL_TIER: CodexTierId = "adapt";

/** The machines that can stand in for this one: said once, in the manual's "Can be replaced by". */
function substituteIds(machineId: string): Set<string> {
  return new Set((EXERCISE_SUBSTITUTES[machineId] ?? []).flatMap((set) => set.machineIds));
}

/**
 * Each substitute line of the manual ("Together: LEG EXTENSION + LUMBAR"),
 * by its words, to the machines it names: the line is drawn with each
 * machine a 44px chip that peeks it (some names, LUMBAR alone among them,
 * are no linked word), and the line itself still takes the studio's marks.
 */
function substituteSetsByLine(machineId: string, names: (id: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const set of EXERCISE_SUBSTITUTES[machineId] ?? []) {
    const line = substituteLine(set.machineIds.map((id) => names(id)));
    if (line && !out.has(line)) out.set(line, set.machineIds);
  }
  return out;
}

/** A substitute set as chips: "Together:" then each machine, joined by "+". */
function SubstituteChips({ ids, names, onPeek }: { ids: string[]; names: (id: string) => string; onPeek: (r: VaultRoute) => void }) {
  return (
    <span className="crs__subs">
      {ids.length > 1 && <span className="crs__subs-lead">Together:</span>}
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="crs__subs-plus">+</span>}
          <button type="button" className="crs__sub" style={machineAccentStyle(id)} onClick={() => onPeek({ kind: "machine", id })}>
            {names(id)}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

function MachineBody({ page, machineId }: { page: VaultPage; machineId: string }) {
  const { data, nav, peekAt } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const { actions, inPage } = useVersionPlacement(applied.struck);
  const def = data.defs[machineId];
  const course = courseContextOf(nav.stack, data);
  const category = MACHINE_CATEGORY[machineId];
  const accent = accentStyle(accentForAcademyCategory(category ?? null));
  const sw = switchesOf(def);
  const shape = repShapeOf(def);
  const name = page.title;

  // Section indexes by role, read from the page's own sections.
  const idx = useMemo(() => {
    const at = (id: string) => page.sections.findIndex((s) => s.id === id);
    const tierOf = (tier: CodexTierId) => {
      const t = page.tiers?.find((x) => x.id === tier);
      if (!t) return [] as number[];
      return t.sections.map((s) => page.sections.indexOf(s)).filter((i) => i >= 0);
    };
    return { stop: at("leaf-stop"), glance: tierOf("glance"), script: tierOf("script"), tiers: Object.fromEntries(TIERS.map((t) => [t, tierOf(t)])) as Record<CodexTierId, number[]>, target: at("card-target") };
  }, [page]);

  // The deck: the floor glance without Stop (Stop is never folded into a card).
  const deckIdx = useMemo(() => idx.glance.filter((i) => i !== idx.stop), [idx]);
  const deckSections = useMemo(() => deckIdx.map((i) => page.sections[i]), [deckIdx, page.sections]);
  const deckMarked = deckIdx.map((i) => applied.sections[i]);
  const cards = useMemo(() => chunkSteps(deckSections, { min: 40, max: 110 }), [deckSections]);
  const [at, setAt] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);

  const preset = presetOf(def);
  const pins = preset.dials.map((d) => ({ ...d, card: cardNaming(cards, deckSections, d.label) }));

  const drills = useMemo(() => {
    const scriptSections = idx.script.map((i) => page.sections[i]);
    return cueDrillsIn(scriptSections).map((d) => ({ ...d, section: idx.script[d.section] }));
  }, [idx.script, page.sections]);

  const anatomy = useMemo(() => resolveMachineAnatomy(machineId), [machineId]);
  const targets = idx.target >= 0 ? page.sections[idx.target].blocks.map((b) => b.text) : [];

  const stop = idx.stop >= 0 ? applied.sections[idx.stop] : null;
  const stopLabels = stop ? runLabels(stop.blocks, stop.title) : [];
  const stopHidden = stop ? stop.blocks.filter((b) => b.hidden).length : 0;

  // Read next without the substitutes: the manual's "Can be replaced by"
  // says each set once, each machine a chip that peeks it; five cards each
  // restating a set said it five times.
  const related = useMemo(() => {
    const subs = substituteIds(machineId);
    return page.related.filter((r) => !(r.route.kind === "machine" && subs.has(r.route.id)));
  }, [page.related, machineId]);
  const subSets = useMemo(() => substituteSetsByLine(machineId, data.names), [machineId, data.names]);

  /*
   * The full manual, one tier at a time. ArticleBlocks draws only the tier
   * picked, with its own "lines that changed" off (showOrphans), so a mark
   * on a line in another tier is never mistaken for one whose line left the
   * page; the page's own are listed once under it, counted over every tier
   * (applied, above). A switch takes the tier on screen away, with any form
   * open in it, so it asks the page first and moves only inside the answer.
   */
  const [tier, setTier] = useState<CodexTierId>(FIRST_MANUAL_TIER);
  const guard = useWikiPageGuard();
  const tierSections = useMemo(() => (idx.tiers[tier] ?? []).map((i) => page.sections[i]), [idx, tier, page.sections]);
  const pickTier = (next: CodexTierId) => {
    if (next === tier) return;
    guard(() => setTier(next));
  };

  const turnTo = (card: number) => {
    setAt(card);
    try {
      deckRef.current?.scrollIntoView({ block: "start", behavior: scrollMotion() });
    } catch {
      /* no smooth scroll here: the deck is still turned */
    }
  };

  const works =
    targets.length > 0 ? (
      <ul className="crs__bp-works" aria-label="What it works">
        {targets.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    ) : null;

  return (
    <CourseShell actions={actions} accent={accent as CSSProperties}>
      {course && <CourseBar course={course} />}
      <PageHead eyebrow={page.eyebrow} title={name} lede={page.lede} accent={accent as CSSProperties} />
      {inPage}

      <section className="crs__blueprint" style={accent as CSSProperties} aria-label={`${name}: the body it works and its dials`}>
        <div className="crs__bp-figure">
          {anatomy.primary.length > 0 ? (
            <div className="crs__bp-body">
              <BodyModel
                primary={anatomy.primary}
                secondary={anatomy.secondary}
                gender="male"
                view={anatomy.preferredView}
                colors={["var(--wk-muscle-primary)", "var(--wk-muscle-secondary)"]}
                baseFill="var(--wk-muscle-base)"
              />
            </div>
          ) : (
            <div className="crs__bp-body crs__bp-body--none" aria-hidden />
          )}
        </div>
        <div className="crs__bp-side">
          {pins.length > 0 ? (
            <ol className="crs__pins" aria-label="The dials on this unit">
              {pins.map((p) => {
                // The head is the dial's own letter, as the unit prints it;
                // a dial with no recorded letter has none (a number here
                // would point at nothing on the figure beside it).
                const body = (
                  <>
                    {p.letter && <span className="crs__pin-head">{p.letter}</span>}
                    <span className="crs__pin-words">
                      <span className="crs__pin-label">{p.label}</span>
                      <span className="crs__pin-value" data-unset={p.number ? undefined : ""}>
                        {p.number ?? "Not set"}
                      </span>
                    </span>
                    {p.card >= 0 && <MapPin size={18} aria-hidden className="crs__pin-go" />}
                  </>
                );
                return (
                  <li key={p.key}>
                    {p.card >= 0 ? (
                      <button
                        type="button"
                        className="crs__pin"
                        aria-label={`${p.letter ? `${p.letter}, ` : ""}${p.label}: ${p.number ?? "not set"}. Show how it is set`}
                        onClick={() => turnTo(p.card)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="crs__pin">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="crs__empty">No dials recorded for this unit.</p>
          )}
          {def && (
            <ul className="crs__facts" aria-label="At the machine">
              <li>
                {sw.beginsWith === "handoff" ? <Hand size={16} aria-hidden /> : <TrendingUp size={16} aria-hidden />}
                {sw.beginsWith === "handoff" ? "Begins with a handoff" : "Begins with a gradual load-up"}
              </li>
              <li>
                <Repeat size={16} aria-hidden />
                {shape === "endStop" ? "Touch and go at the end stop" : shape === "squeeze" ? "A squeeze at the top" : `${SHAPE_LABEL[shape]}, then the lowering`}
              </li>
              {sw.neverToFailure && (
                <li data-tone="warn">
                  <ShieldAlert size={16} aria-hidden />
                  Never to failure
                </li>
              )}
            </ul>
          )}
          {works}
        </div>
      </section>

      {stop && stop.blocks.some((b) => !b.hidden) && (
        <section className="crs__stop" aria-labelledby="crs-stop-title">
          <h2 className="crs__stop-title" id="crs-stop-title">
            <OctagonAlert size={18} aria-hidden />
            Stop
          </h2>
          <div className="crs__stop-lines">
            {stop.blocks.map((b, i) =>
              b.hidden ? null : <MarkedLine key={`${b.key}-${i}`} block={b} studioLens={applied.studioLens} showLabel={stopLabels[i]} />,
            )}
          </div>
          {stopHidden > 0 && (
            <p className="crs__hidden">
              <EyeOff size={14} aria-hidden />
              {hiddenWords(stopHidden)}
            </p>
          )}
        </section>
      )}

      {/* The set-up deck: its cards' own titles (Set up, Get set, Begin) name it. */}
      <div className="crs__sec crs__setup">
        <div ref={deckRef} className="crs__anchor">
          <StepDeck
            sections={deckSections}
            marked={deckMarked}
            studioLens={applied.studioLens}
            cards={cards}
            at={at}
            onAt={setAt}
            label={`Set up ${name}`}
          />
        </div>
      </div>

      {def && (
        <section className="crs__sec">
          <RepScrubber shape={shape} machineName={name} onOpenSource={peekAt} />
        </section>
      )}

      {drills.length > 0 && (
        <section className="crs__sec" aria-labelledby="crs-cue">
          <SectionHead title="At each moment" id="crs-cue" />
          <div className="crs__drills">
            {drills.map((d) => (
              <CueDrillCard
                key={d.section}
                drill={d}
                marked={applied.sections}
                studioLens={applied.studioLens}
                onAll={d.moment !== null ? () => peekAt({ kind: "cueing", moment: d.moment ?? undefined }) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <section className="crs__sec crs__manual" aria-labelledby="crs-manual">
        <SectionHead title="The full manual" id="crs-manual" />
        <div className="crs__tiers" role="group" aria-label="Which part of the manual">
          {TIERS.map((t, n) => (
            <button key={t} type="button" className="crs__tier" aria-pressed={tier === t} onClick={() => pickTier(t)}>
              <span className="crs__tier-n" aria-hidden>
                {n + 1}
              </span>
              <span>{TIER_TITLES[t]}</span>
            </button>
          ))}
        </div>
        <div className="crs__whole">
          <ArticleBlocks
            key={tier}
            target={page.target}
            sections={tierSections}
            annotate="inline"
            renderText={(t, b) => {
              const ids = subSets.get(b.text);
              return ids ? <SubstituteChips ids={ids} names={data.names} onPeek={peekAt} /> : <LinkedText text={t} />;
            }}
            showOrphans={false}
          />
          <OrphanMarks target={page.target} orphans={applied.orphans} />
        </div>
      </section>

      <ReadNext related={related} />
    </CourseShell>
  );
}
