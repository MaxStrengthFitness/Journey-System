import { useMemo, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, Hand, TrendingUp, MessageCircle, Play, ShieldAlert, Type } from "lucide-react";
import { accentForAcademyCategory, accentStyle } from "../../wiki/categories";
import { MACHINE_CATEGORY } from "../../routine-builder/academy";
import { switchesOf } from "../../machine-codex/format";
import { readingTime } from "../../learning/home";
import { pageFor } from "../../learning-vault/pages";
import { PLAYBOOK_DRAFT_LINE } from "../../learning-vault/playbooks";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import type { VaultPage, VaultRoute } from "../../learning-vault/types";
import { OrderDrillCard } from "./CueDrill";
import { lessonsOf, orderDrillOf } from "./drills";
import { CourseShell, GonePage, PageHead, SectionHead, useCourse } from "./shell";
import "./course.css";

/**
 * THE INDEXES — the Catalog (the floor as a field manual), the Academy (the
 * method as courses and drills), and a course's own page (a track's lessons,
 * or a module's topics). The Interactive Course, the Learning vault
 * redesign, Oct 19 2026.
 */

function machineAccent(id: string): CSSProperties {
  return accentStyle(accentForAcademyCategory(MACHINE_CATEGORY[id] ?? null)) as CSSProperties;
}

/* ------------------------------------------------------------------ *
 * The Catalog: the floor first, in walking order
 * ------------------------------------------------------------------ */

export function CatalogPage() {
  const { data, open, studioName } = useCourse();
  const floor = data.floor;
  const onFloor = new Set((floor ?? []).map((m) => m.id));
  const rest = data.machines.filter((m) => !onFloor.has(m.machineId));

  return (
    <CourseShell>
      <PageHead title={`${studioName}'s floor`} />
      {floor === null ? (
        <p className="crs__empty">
          {data.floorState === "unreadable"
            ? `Can't read ${studioName}'s floor right now. Every MSF machine is still below.`
            : `Reading ${studioName}'s floor…`}
        </p>
      ) : floor.length === 0 ? (
        <p className="crs__empty">No machines on {studioName}'s floor yet. A studio leader adds them on My Studio → Machines.</p>
      ) : (
        <ol className="crs__route" aria-label={`${studioName}'s floor, in walking order`}>
          {floor.map((m, i) => {
            const sw = switchesOf(data.defs[m.id]);
            return (
              <li key={m.id} className="crs__stop-row">
                <button type="button" className="crs__station" style={machineAccent(m.id)} onClick={() => open({ kind: "machine", id: m.id })}>
                  <span className="crs__station-n" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="crs__station-card">
                    <span className="crs__station-words">
                    <span className="crs__station-name">{m.name}</span>
                    <span className="crs__station-tags">
                      {data.defs[m.id] && (
                        <span className="crs__tag">
                          {sw.beginsWith === "handoff" ? <Hand size={14} aria-hidden /> : <TrendingUp size={14} aria-hidden />}
                          {sw.beginsWith === "handoff" ? "Handoff" : "Load-up"}
                        </span>
                      )}
                      {sw.neverToFailure && (
                        <span className="crs__tag" data-tone="warn">
                          <ShieldAlert size={14} aria-hidden />
                          Never to failure
                        </span>
                      )}
                    </span>
                  </span>
                    {m.code && <span className="crs__code">{m.code}</span>}
                    <ChevronRight size={18} aria-hidden className="crs__station-go" />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {rest.length > 0 && (
        <section className="crs__sec" aria-labelledby="crs-all-msf">
          <SectionHead title={floor && floor.length > 0 ? "Every other MSF machine" : "Every MSF machine"} id="crs-all-msf" />
          <ul className="crs__others">
            {rest.map((m) => (
              <li key={m.machineId}>
                <button type="button" className="crs__other" style={machineAccent(m.machineId)} onClick={() => open({ kind: "machine", id: m.machineId })}>
                  {m.abbr && <span className="crs__code">{m.abbr}</span>}
                  <span className="crs__other-name">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </CourseShell>
  );
}

/* ------------------------------------------------------------------ *
 * The Academy: practise, then the method module by module
 * ------------------------------------------------------------------ */

export function AcademyPage() {
  const { data, open } = useCourse();
  const packages = pageFor({ kind: "playbook", id: "packages" }, data);
  const minutes = data.index.modules.reduce((n, m) => n + m.topics.reduce((t, x) => t + x.readingMinutes, 0), 0);

  return (
    <CourseShell>
      <PageHead title="The Academy" meta={<span>{data.index.modules.length} modules · {readingTime(minutes)}</span>} />

      <section className="crs__sec" aria-labelledby="crs-practice">
        <SectionHead title="Practice" id="crs-practice" />
        <div className="crs__doors">
          <button type="button" className="crs__door" onClick={() => open({ kind: "cueing" })}>
            <MessageCircle size={22} aria-hidden className="crs__door-icon" />
            <span className="crs__door-title">What would you cue?</span>
            <span className="crs__door-words">Every moment of a set, the Academy's lines behind a tap.</span>
          </button>
          <button type="button" className="crs__door" onClick={() => open({ kind: "quiz" })}>
            <Play size={22} aria-hidden className="crs__door-icon" />
            <span className="crs__door-title">Play a round</span>
            <span className="crs__door-words">Ten cards from a deck you pick.</span>
          </button>
          <button type="button" className="crs__door" onClick={() => open({ kind: "glossary" })}>
            <Type size={22} aria-hidden className="crs__door-icon" />
            <span className="crs__door-title">Glossary vault</span>
            <span className="crs__door-words">The exact words the Academy asks trainers to use.</span>
          </button>
        </div>
        {packages !== "loading" && packages !== "gone" && <PackagesDrill page={packages} />}
      </section>

      <section className="crs__sec" aria-labelledby="crs-modules">
        <SectionHead title="The method" id="crs-modules" />
        <ol className="crs__modules">
          {data.index.modules.map((m) => {
            const mins = m.topics.reduce((t, x) => t + x.readingMinutes, 0);
            return (
              <li key={m.id}>
                <button type="button" className="crs__module" onClick={() => open({ kind: "module", moduleId: m.id })}>
                  <span className="crs__module-n" aria-hidden>
                    {m.n}
                  </span>
                  <span className="crs__module-words">
                    <span className="crs__module-title">{m.title}</span>
                    <span className="crs__module-meta">
                      {m.topics.length} {m.topics.length === 1 ? "lesson" : "lessons"} · {readingTime(mins)}
                    </span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="crs__module-go" />
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="crs__sec" aria-labelledby="crs-playbooks">
        <SectionHead title="Life Transformer playbooks" id="crs-playbooks" />
        <p className="crs__draft">{PLAYBOOK_DRAFT_LINE}</p>
        <div className="crs__pillars">
          {data.pillars.map((p) => {
            const books = data.playbooks.filter((b) => b.pillar === p.id);
            if (books.length === 0) return null;
            return (
              <div key={p.id} className="crs__pillar">
                <h3 className="crs__pillar-title">{p.title}</h3>
                <ul className="crs__pillar-list">
                  {books.map((b) => (
                    <li key={b.id}>
                      <button type="button" className="crs__row" onClick={() => open({ kind: "playbook", id: b.id })}>
                        <span className="crs__row-title">{b.title}</span>
                        <ChevronRight size={18} aria-hidden className="crs__row-go" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

    </CourseShell>
  );
}

function PackagesDrill({ page }: { page: VaultPage }) {
  const { open } = useCourse();
  const applied = useAppliedMarkup(page.target, page.sections);
  const drill = useMemo(() => orderDrillOf(page, "money"), [page]);
  if (!drill) return null;
  return (
    <OrderDrillCard
      drill={drill}
      marked={applied.sections}
      studioLens={applied.studioLens}
      title="Talking about packages"
      draftLine={PLAYBOOK_DRAFT_LINE}
      foot={
        <button type="button" className="crs__btn crs__btn--quiet" onClick={() => open(page.route)}>
          The whole playbook
          <ArrowRight size={16} aria-hidden />
        </button>
      }
    />
  );
}

/* ------------------------------------------------------------------ *
 * A course: a track's lessons, or a module's topics
 * ------------------------------------------------------------------ */

export function CoursePage({ route }: { route: Extract<VaultRoute, { kind: "track" } | { kind: "module" }> }) {
  const { data, openLesson } = useCourse();
  const found = lessonsOf(route, data);
  if (!found) return <GonePage />;
  const track = route.kind === "track" ? data.tracks.find((t) => t.id === route.id) : null;
  const mod = route.kind === "module" ? data.index.modules.find((m) => m.id === route.moduleId) : null;
  // Asking for the module's prose now means the first lesson opens at once.
  if (mod && !data.modules[mod.id]) data.loadModule(mod.id);
  const minutes = mod ? mod.topics.reduce((n, t) => n + t.readingMinutes, 0) : 0;
  const eyebrow = track ? `Course · ${track.who}` : mod ? `Academy module ${mod.n}` : undefined;
  const lede = mod?.blurb?.trim() || undefined;

  return (
    <CourseShell>
      <PageHead
        eyebrow={eyebrow}
        title={found.title}
        lede={lede}
        meta={<span>{found.lessons.length} lessons{mod ? ` · ${readingTime(minutes)}` : ""}</span>}
      >
        {found.lessons[0] && (
          <div className="crs__head-doors">
            <button type="button" className="crs__btn crs__btn--primary crs__btn--big" onClick={() => openLesson(route, found.lessons[0].route)}>
              <Play size={18} aria-hidden />
              Start with lesson 1
            </button>
          </div>
        )}
      </PageHead>
      <ol className="crs__lessons">
        {found.lessons.map((l, i) => (
          <li key={`${i}-${l.title}`}>
            <button type="button" className="crs__lesson crs__lesson--row" onClick={() => openLesson(route, l.route)}>
              <span className="crs__lesson-n" aria-hidden>
                {i + 1}
              </span>
              <span className="crs__lesson-words">
                <span className="crs__lesson-title">{l.title}</span>
                {l.why && <span className="crs__lesson-why">{l.why}</span>}
                {!l.why && mod && (
                  <span className="crs__lesson-why">{readingTime(mod.topics.find((t) => l.route.kind === "topic" && t.id === l.route.topicId)?.readingMinutes ?? 0)}</span>
                )}
              </span>
              <span className="crs__lesson-kind">{kindWord(l.route)}</span>
              <ChevronRight size={18} aria-hidden className="crs__lesson-go" />
            </button>
          </li>
        ))}
      </ol>
    </CourseShell>
  );
}

/** What a lesson is, in a word, when it is not a reading (a machine, the quiz). */
function kindWord(r: VaultRoute): string {
  switch (r.kind) {
    case "machine":
      return "Machine";
    case "quiz":
      return "Play";
    case "glossary":
      return "Vault";
    case "cueing":
      return "Drill";
    case "playbook":
      return "Playbook";
    default:
      return "";
  }
}
