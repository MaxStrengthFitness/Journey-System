import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ChevronRight, Gamepad2, Inbox, MessageSquareQuote, Type } from "lucide-react";
import { readingTime } from "../../learning/home";
import { presetLine, presetOf } from "../../machine-codex/format";
import { accentStyle } from "../../wiki/categories";
import { DECKS, DECK_ACCENT, playableDecks } from "../../learning-vault/quiz/decks";
import { PLAYBOOKS_DECK_SHOWN } from "../../learning-vault/playbooks";
import { strikeSignals } from "../../learning-vault/submissions";
import { FloorStatus } from "../../learning-vault/ui/FloorStatus";
import { queueLead } from "../../learning-vault/ui/SubmissionQueue";
import { useAllMarkup, useSubmissions } from "../../learning-vault/ui/VaultProvider";
import type { Track } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import { floorTiles, orderLabel, stepKind, whoLine, type FloorTile } from "./codex-model";
import { KindGlyph } from "./CodexBits";
import "./codex.css";

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/**
 * A role's path as a codex card: who it is for, its name, its first three
 * steps in order, and one door. The lead card (a new Life Transformer's)
 * lays its three steps out side by side, with why each comes where it does.
 * Nothing is kept about who read what.
 */
export function PathCard({ track, lead = false }: { track: Track; lead?: boolean }) {
  const { open } = useCodex();
  const headId = useId();
  const steps = track.steps.slice(0, 3);
  const more = track.steps.length - steps.length;
  // "A head trainer" over "For a head trainer" says it twice.
  const who = lead ? track.who : whoLine(track);
  return (
    <article className={`cdx__path${lead ? " cdx__path--lead" : ""}`} aria-labelledby={headId}>
      {who && <p className="cdx__path-who">{who}</p>}
      <h3 className="cdx__path-title" id={headId}>
        {track.title}
      </h3>
      <ol className="cdx__path-steps">
        {steps.map((s, i) => (
          <li key={`${i}-${s.title}`} className="cdx__path-step">
            <span className="cdx__path-n" aria-hidden="true">
              {i + 1}
            </span>
            <span className="cdx__path-step-words">
              <span className="cdx__path-step-title">{s.title}</span>
              {lead && <span className="cdx__path-step-why">{s.why}</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="cdx__path-foot">
        <button
          type="button"
          className={`cdx__btn ${lead ? "cdx__btn--primary" : "cdx__btn--go"}`}
          onClick={() => open({ kind: "track", id: track.id })}
          aria-label={`Start ${track.title}`}
        >
          Start
          <ArrowRight size={16} aria-hidden />
        </button>
        {more > 0 && <span className="cdx__path-more">then {more} more</span>}
      </div>
    </article>
  );
}

/** The other paths, one 52px row each: the path, and who it is for. */
export function PathRows({ tracks }: { tracks: readonly Track[] }) {
  const { open } = useCodex();
  if (tracks.length === 0) return null;
  return (
    <ul className="cdx__rows cdx__rows--two">
      {tracks.map((t) => {
        // "A head trainer" under "For a head trainer" says it twice.
        const who = whoLine(t);
        return (
          <li key={t.id}>
            <button type="button" className="cdx__row" onClick={() => open({ kind: "track", id: t.id })}>
              <span className="cdx__row-words">
                <span className="cdx__row-title">{t.title}</span>
                {who && <span className="cdx__row-sub">{who}</span>}
              </span>
              <ChevronRight className="cdx__chev" size={16} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * The floor
 * ------------------------------------------------------------------ */

/**
 * The floor's honest states: reading, unreadable, empty, or its machines.
 * `elsewhere` is where the reader goes instead when there is no floor to
 * show (the Catalog lists every MSF machine under it; the Overview has the
 * Academy).
 */
function FloorState({ children, elsewhere }: { children: (tiles: FloorTile[]) => ReactNode; elsewhere: string }) {
  const { data, studioName } = useCodex();
  const tiles = useMemo(() => floorTiles(data.floor), [data.floor]);
  if (data.floor === null) {
    return (
      <p className="cdx__well">
        {data.floorState === "unreadable" ? `Can't read ${studioName}'s floor right now. ${elsewhere}` : `Reading ${studioName}'s floor…`}
      </p>
    );
  }
  if (tiles.length === 0) {
    return <p className="cdx__well">No machines at {studioName} yet. A studio leader adds them on My Studio → Machines.</p>;
  }
  return children(tiles);
}

/**
 * The floor as a tight grid of codex entries: walking order, code, name, the
 * category's band, and "Out of service" / "Flagged" when the floor says so
 * (the reason is the Catalog's row and the machine's page's to give).
 */
export function FloorGrid() {
  const { data, open } = useCodex();
  return (
    <FloorState elsewhere="The Academy still works.">
      {(tiles) => (
        <ol className="cdx__floor">
          {tiles.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="cdx__mtile"
                style={accentStyle(t.accent)}
                onClick={() => open({ kind: "machine", id: t.id })}
              >
                <span className="cdx__mtile-top">
                  <span className="cdx__mtile-n">{orderLabel(t.order)}</span>
                  {t.code && <span className="wk__row-code">{t.code}</span>}
                </span>
                <span className="cdx__mtile-name">{t.name}</span>
                <FloorStatus status={data.care?.[t.id]} variant="chip" why={false} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </FloorState>
  );
}

/**
 * The floor as the Catalog's list: walking order, code, name and its preset,
 * the category; under the name, "Out of service" and "Flagged" and why it is
 * out, as today's Catalog row says them (FloorStatus, read from Relay and the
 * roster; unknown says nothing, never "in service").
 */
export function FloorList() {
  const { data, open } = useCodex();
  return (
    <FloorState elsewhere="Every MSF machine is below.">
      {(tiles) => (
        <ol className="cdx__entries">
          {tiles.map((t) => {
            const def = data.defs[t.id];
            const preset = def ? presetOf(def) : null;
            const line = preset && (preset.state === "set" || preset.state === "partial") ? presetLine(preset) : null;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="cdx__entry"
                  style={accentStyle(t.accent)}
                  onClick={() => open({ kind: "machine", id: t.id })}
                >
                  <span className="cdx__entry-n">{orderLabel(t.order)}</span>
                  <span className="cdx__entry-code">
                    <span className="wk__row-code">{t.code ?? "–"}</span>
                  </span>
                  <span className="cdx__entry-words">
                    <span className="cdx__entry-name">{t.name}</span>
                    {line && <span className="cdx__entry-sub">{line}</span>}
                    <FloorStatus status={data.care?.[t.id]} variant="chip" />
                  </span>
                  {t.category && <span className="cdx__entry-cat">{t.category}</span>}
                  <ChevronRight className="cdx__chev" size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </FloorState>
  );
}

/* ------------------------------------------------------------------ *
 * The method
 * ------------------------------------------------------------------ */

/** The Academy's thirteen modules as chapters: number, title, reading time (and the blurb on the index). */
export function MethodList({ blurbs = false }: { blurbs?: boolean }) {
  const { data, open } = useCodex();
  return (
    <ol
      className={`cdx__chapters${blurbs ? " cdx__chapters--full" : ""}`}
      style={{ "--cdx-rows": Math.ceil(data.index.modules.length / 2) } as CSSProperties}
    >
      {data.index.modules.map((m) => {
        const minutes = m.topics.reduce((sum, t) => sum + t.readingMinutes, 0);
        return (
          <li key={m.id}>
            <button type="button" className="cdx__chapter" onClick={() => open({ kind: "module", moduleId: m.id })}>
              <span className="cdx__chapter-n">{m.n}</span>
              <span className="cdx__chapter-words">
                <span className="cdx__chapter-title">{m.title}</span>
                {blurbs && <span className="cdx__chapter-blurb">{m.blurb}</span>}
              </span>
              <span className="cdx__chapter-time">{readingTime(minutes)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The two reference entries beside the chapters: the glossary and the phrasebook. */
export function ReferencePair() {
  const { open } = useCodex();
  return (
    <ul className="cdx__refs">
      <li>
        <button type="button" className="cdx__ref" onClick={() => open({ kind: "glossary" })}>
          <span className="cdx__ref-icon" aria-hidden="true">
            <Type size={18} />
          </span>
          <span className="cdx__ref-words">
            <span className="cdx__ref-title">Glossary</span>
            <span className="cdx__ref-sub">The exact words the Academy asks trainers to use.</span>
          </span>
          <ChevronRight className="cdx__chev" size={16} aria-hidden />
        </button>
      </li>
      <li>
        <button type="button" className="cdx__ref" onClick={() => open({ kind: "cueing" })}>
          <span className="cdx__ref-icon" aria-hidden="true">
            <MessageSquareQuote size={18} />
          </span>
          <span className="cdx__ref-words">
            <span className="cdx__ref-title">Cueing phrasebook</span>
            <span className="cdx__ref-sub">What to say, moment by moment through a set.</span>
          </span>
          <ChevronRight className="cdx__chev" size={16} aria-hidden />
        </button>
      </li>
    </ul>
  );
}

/** The playbooks on their five shelves. Drafts, said once, quietly, by the caller. */
export function PlaybookShelves() {
  const { data, open } = useCodex();
  return (
    <div className="cdx__shelves">
      {data.pillars.map((p) => {
        const books = data.playbooks.filter((b) => b.pillar === p.id);
        if (books.length === 0) return null;
        return (
          <section key={p.id} className="cdx__shelf" aria-label={p.title}>
            <h3 className="cdx__shelf-title">{p.title}</h3>
            <ul className="cdx__shelf-list">
              {books.map((b) => (
                <li key={b.id}>
                  <button type="button" className="cdx__shelf-row" onClick={() => open({ kind: "playbook", id: b.id })}>
                    <KindGlyph kind={stepKind({ kind: "playbook", id: b.id })} />
                    <span className="cdx__shelf-name">{b.title}</span>
                    <ChevronRight className="cdx__chev" size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Play
 * ------------------------------------------------------------------ */

/**
 * The quiz's door: Quick ten, and every deck by name. Ten questions, the
 * Academy's own words, and nothing kept (no score anyone sees again, no
 * streak, no ranking): the quiz says that itself, once, in its own picker,
 * so the door does not say it again.
 */
export function PlayCard() {
  const { data, open } = useCodex();
  const headId = useId();
  // While the bank is on its way every deck shows, except the playbooks deck
  // while the playbooks wait for head office (it has no questions then).
  const decks = useMemo(
    () =>
      (data.quizBank ? playableDecks(data.quizBank) : DECKS.filter((d) => d.id !== "playbooks" || PLAYBOOKS_DECK_SHOWN)).filter(
        (d) => d.id !== "mixed",
      ),
    [data.quizBank],
  );
  return (
    <section className="cdx__play" aria-labelledby={headId}>
      <div className="cdx__play-head">
        <span className="cdx__play-icon" aria-hidden="true">
          <Gamepad2 size={22} />
        </span>
        <div className="cdx__play-words">
          <h2 className="cdx__play-title" id={headId}>
            Play
          </h2>
          <p className="cdx__play-sub">Ten questions from the method.</p>
        </div>
        <button type="button" className="cdx__btn cdx__btn--primary" onClick={() => open({ kind: "quiz", deck: "mixed" })}>
          Quick ten
        </button>
      </div>
      <ul className="cdx__decks" aria-label="Decks">
        {decks.map((d) => {
          const accent = DECK_ACCENT[d.id];
          return (
            <li key={d.id}>
              <button
                type="button"
                className="cdx__deck"
                style={accent ? accentStyle(accent) : undefined}
                onClick={() => open({ kind: "quiz", deck: d.id })}
              >
                {d.title}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Head office
 * ------------------------------------------------------------------ */

/**
 * Head office's door to its queue: what is waiting, as counts, with the
 * proof one tap away. Its line is the queue's own first line (queueLead,
 * over the same counts), so the door and the page it opens never disagree.
 */
export function HeadOfficeDoor() {
  const { open } = useCodex();
  const subs = useSubmissions();
  const all = useAllMarkup();
  const waiting = subs.filter((s) => s.status === "pending").length;
  const lines = useMemo(() => strikeSignals(all).length, [all]);
  const lead = queueLead(waiting, subs.length - waiting, lines);
  return (
    <button type="button" className="cdx__ho" onClick={() => open({ kind: "queue" })}>
      <span className="cdx__ho-icon" aria-hidden="true">
        <Inbox size={20} />
      </span>
      <span className="cdx__ho-words">
        <span className="cdx__ho-title">Waiting for review</span>
        <span className="cdx__ho-sub">{lead}</span>
      </span>
      <ChevronRight className="cdx__chev" size={18} aria-hidden />
    </button>
  );
}

/** A small door to another section of the masthead ("Catalog", "Academy"). */
export function SectionDoor({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="cdx__more" onClick={onClick}>
      {label}
      <ChevronRight size={15} aria-hidden />
    </button>
  );
}
