import { useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, Compass, Inbox, MessageCircle, Play, Repeat, Shuffle } from "lucide-react";
import { studioTodayKey } from "../../../lib/studio-time";
import { accentForAcademyCategory, accentStyle, type WikiAccent } from "../../wiki/categories";
import { MACHINE_CATEGORY } from "../../routine-builder/academy";
import { pageFor } from "../../learning-vault/pages";
import { strikeSignals } from "../../learning-vault/submissions";
import { useAllMarkup, useSubmissions, useVault } from "../../learning-vault/ui/VaultProvider";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import { RepScrubber } from "../../learning-vault/ui/RepScrubber";
import { deckById } from "../../learning-vault/quiz/decks";
import type { QuizDeckId, Track, VaultPage, VaultRoute } from "../../learning-vault/types";
import { CueDrillCard } from "./CueDrill";
import { cueDrillsIn, dayIndex } from "./drills";
import { CourseShell, SectionHead, useCourse } from "./shell";
import { vaultEntries } from "./vault";
import graphIndexJson from "../../learning-vault/graph-index.json";
import "./course.css";

/**
 * THE OVERVIEW — the Interactive Course's front page (the Learning vault
 * redesign, Oct 19 2026).
 *
 * Learning that teaches by doing, top to bottom: a course to start (Life
 * Transformer 101, its first lessons showing), the other courses, a round
 * to play and a moment to cue, the repetition to scrub, the floor's machines
 * as a field manual, and the glossary as a vault. No progress anywhere:
 * nothing is kept, so nothing is counted (decision 11 of the round).
 */

/** Each course's band, assigned (a colour that moves between visits teaches nothing). */
const COURSE_ACCENT: Record<string, WikiAccent> = {
  "equipment-and-cueing": "push",
  "programming-and-adapting": "legs",
  "consultations-and-packages": "pull",
  "relationships-and-renewals": "hips",
  "head-trainer": "trunk",
  "studio-leader": "posterior",
};

const PLAY_DECKS: QuizDeckId[] = ["cues", "rep", "hutchins"];

const TERM_TOPICS = (graphIndexJson as unknown as { termTopics: Record<string, string[]> }).termTopics;

export function HomePage() {
  const { data, peekAt } = useCourse();
  const { viewer } = useVault();
  const [first, ...rest] = data.tracks;

  return (
    <CourseShell>
      {first && <FeaturedCourse track={first} />}

      {rest.length > 0 && (
        <section className="crs__sec" aria-labelledby="crs-courses">
          <SectionHead title="More courses" id="crs-courses" />
          <div className="crs__courses">
            {rest.map((t) => (
              <CourseCard key={t.id} track={t} />
            ))}
          </div>
        </section>
      )}

      <section className="crs__sec crs__duo" aria-label="Practice">
        <PlayCard />
        <DailyDrill />
      </section>

      <section className="crs__sec">
        <RepScrubber cues={data.cues} onOpenSource={peekAt} className="crs__scrubber" />
      </section>

      <FloorTeaser />
      <VaultTeaser />
      {viewer.isHeadOffice && <QueueDoor />}
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

function FeaturedCourse({ track }: { track: Track }) {
  const { open, openLesson } = useCourse();
  const course: VaultRoute = { kind: "track", id: track.id };
  const firstSteps = track.steps.slice(0, 3);
  return (
    <article className="crs__hero" aria-labelledby="crs-hero-title">
      <div className="crs__hero-intro">
        <p className="crs__eyebrow crs__eyebrow--hero">Start here · {track.who}</p>
        <h1 className="crs__title" id="crs-hero-title">
          {track.title}
        </h1>
        <p className="crs__lede">{track.steps.length} lessons, one card at a time. Nothing is kept or scored.</p>
      </div>
      <ol className="crs__hero-steps">
        {firstSteps.map((s, i) => (
          <li key={`${i}-${s.title}`}>
            <button type="button" className="crs__lesson" onClick={() => openLesson(course, s.route)}>
              <span className="crs__lesson-n" aria-hidden>
                {i + 1}
              </span>
              <span className="crs__lesson-words">
                <span className="crs__lesson-title">{s.title}</span>
                <span className="crs__lesson-why">{s.why}</span>
              </span>
              <ChevronRight size={18} aria-hidden className="crs__lesson-go" />
            </button>
          </li>
        ))}
      </ol>
      <div className="crs__hero-doors">
        <button
          type="button"
          className="crs__btn crs__btn--primary crs__btn--big"
          onClick={() => track.steps[0] && openLesson(course, track.steps[0].route)}
        >
          <Play size={18} aria-hidden />
          Start the course
        </button>
        <button type="button" className="crs__btn crs__btn--big" onClick={() => open(course)}>
          All {track.steps.length} lessons
        </button>
      </div>
    </article>
  );
}

/** True when a course's title already says who it is for ("For a head trainer"). */
function saysWho(track: Track): boolean {
  const who = track.who.toLowerCase().replace(/^(a|an|anyone)\s+/, "").trim();
  return who !== "" && track.title.toLowerCase().includes(who);
}

function CourseCard({ track }: { track: Track }) {
  const { open } = useCourse();
  const accent = accentStyle(COURSE_ACCENT[track.id] ?? "other") as CSSProperties;
  return (
    <button type="button" className="crs__course" style={accent} onClick={() => open({ kind: "track", id: track.id })}>
      <span className="crs__course-title">{track.title}</span>
      {!saysWho(track) && <span className="crs__course-who">{track.who}</span>}
      <span className="crs__course-meta">
        {track.steps.length} lessons
        {track.steps[0] && (
          <>
            {" · starts with "}
            <span className="crs__course-first">{track.steps[0].title}</span>
          </>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Play, and the drill of the day
 * ------------------------------------------------------------------ */

function PlayCard() {
  const { open } = useCourse();
  return (
    <article className="crs__play" aria-labelledby="crs-play-title">
      <div className="crs__play-fan" aria-hidden>
        <span className="crs__fan-card crs__fan-card--1">
          <MessageCircle size={22} />
        </span>
        <span className="crs__fan-card crs__fan-card--2">
          <Repeat size={22} />
        </span>
        <span className="crs__fan-card crs__fan-card--3">
          <Shuffle size={26} />
        </span>
      </div>
      <h2 className="crs__play-title" id="crs-play-title">
        Play a round
      </h2>
      <p className="crs__play-words">Ten cards from the Academy and the floor. Nothing is kept.</p>
      <button type="button" className="crs__btn crs__btn--primary crs__btn--big" onClick={() => open({ kind: "quiz", deck: "mixed" })}>
        <Play size={18} aria-hidden />
        Quick ten
      </button>
      <ul className="crs__play-decks" aria-label="Or a deck">
        {PLAY_DECKS.map((d) => (
          <li key={d}>
            <button type="button" className="crs__deckrow" onClick={() => open({ kind: "quiz", deck: d })}>
              {d === "hutchins" ? <Compass size={18} aria-hidden /> : d === "rep" ? <Repeat size={18} aria-hidden /> : <MessageCircle size={18} aria-hidden />}
              <span className="crs__deckrow-title">{deckById(d).title}</span>
              <ChevronRight size={18} aria-hidden className="crs__deckrow-go" />
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function DailyDrill() {
  const { data } = useCourse();
  const state = pageFor({ kind: "cueing" }, data);
  if (state === "loading" || state === "gone") {
    return <div className="crs__drill crs__drill--wait" aria-hidden />;
  }
  return <DailyDrillBody page={state} />;
}

function DailyDrillBody({ page }: { page: VaultPage }) {
  const { peekAt } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const drills = useMemo(() => cueDrillsIn(page.sections, { min: 3 }), [page.sections]);
  const today = useMemo(() => dayIndex(studioTodayKey(), drills.length), [drills.length]);
  const [step, setStep] = useState(0);
  if (drills.length === 0) return null;
  const drill = drills[(today + step) % drills.length];
  return (
    <CueDrillCard
      key={drill.section}
      drill={drill}
      marked={applied.sections}
      studioLens={applied.studioLens}
      size="large"
      onAll={drill.moment !== null ? () => peekAt({ kind: "cueing", moment: drill.moment ?? undefined }) : undefined}
      another={() => setStep((s) => s + 1)}
      startOpen={step > 0}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The floor, the vault, head office
 * ------------------------------------------------------------------ */

function FloorTeaser() {
  const { data, open, onSection, studioName } = useCourse();
  const floor = data.floor;
  return (
    <section className="crs__sec" aria-labelledby="crs-floor">
      <SectionHead
        title="Field manual"
        id="crs-floor"
        door={
          <button type="button" className="crs__more" onClick={() => onSection("machine-anatomy")}>
            The floor
            <ArrowRight size={16} aria-hidden />
          </button>
        }
      />
      {floor === null ? (
        <p className="crs__empty">
          {data.floorState === "unreadable" ? `Can't read ${studioName}'s floor right now.` : `Reading ${studioName}'s floor…`}
        </p>
      ) : floor.length === 0 ? (
        <p className="crs__empty">No machines on {studioName}'s floor yet. A studio leader adds them on My Studio → Machines.</p>
      ) : (
        <ol className="crs__tiles">
          {floor.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                className="crs__tile"
                style={accentStyle(accentForAcademyCategory(MACHINE_CATEGORY[m.id] ?? null)) as CSSProperties}
                onClick={() => open({ kind: "machine", id: m.id })}
              >
                <span className="crs__tile-n" aria-hidden>
                  {i + 1}
                </span>
                <span className="crs__tile-name">{m.name}</span>
                {m.code && <span className="crs__code">{m.code}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function VaultTeaser() {
  const { data, open } = useCourse();
  const entries = useMemo(() => vaultEntries(data.glossary, TERM_TOPICS), [data.glossary]);
  const today = useMemo(() => dayIndex(studioTodayKey(), Math.max(1, entries.length)), [entries.length]);
  if (entries.length === 0) return null;
  const picks = [0, 1, 2].map((n) => entries[(today + n * 17) % entries.length]);
  return (
    <section className="crs__sec" aria-labelledby="crs-vault">
      <SectionHead
        title="Glossary vault"
        id="crs-vault"
        door={
          <button type="button" className="crs__more" onClick={() => open({ kind: "glossary" })}>
            All {entries.length} words
            <ArrowRight size={16} aria-hidden />
          </button>
        }
      />
      <div className="crs__vault-peek">
        {picks.map((e) => (
          <button key={e.term} type="button" className="crs__term" onClick={() => open({ kind: "glossary", term: e.term })}>
            <span className="crs__term-word">{e.term}</span>
            <span className="crs__term-first">{e.summary}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QueueDoor() {
  const { open } = useCourse();
  const subs = useSubmissions();
  const markup = useAllMarkup();
  const waiting = subs.filter((s) => s.status === "pending").length;
  const lines = useMemo(() => strikeSignals(markup).length, [markup]);
  return (
    <section className="crs__sec">
      <button type="button" className="crs__queue" onClick={() => open({ kind: "queue" })}>
        <Inbox size={22} aria-hidden className="crs__queue-icon" />
        <span className="crs__queue-words">
          <span className="crs__queue-title">Waiting for head office</span>
          <span className="crs__queue-meta">
            {waiting} from the floor · {lines} {lines === 1 ? "line" : "lines"} studios cross out
          </span>
        </span>
        <ChevronRight size={20} aria-hidden />
      </button>
    </section>
  );
}

