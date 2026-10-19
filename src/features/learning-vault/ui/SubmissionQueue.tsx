/**
 * WAITING FOR REVIEW — head office's queue (the Learning vault redesign,
 * Oct 19 2026; in the prototype, Admins → Standard → Waiting for review).
 *
 * Two things reach head office from the floor, and this page shows both:
 *
 *   Lines studios cross out   A studio leader crossed a line out on their
 *                             studio's version, with a reason. When several
 *                             studios cross out the SAME line, that is a
 *                             signal the line may be wrong for everyone.
 *                             The page says how many ("Crossed out at 3
 *                             studios") and keeps the proof one tap away:
 *                             each studio's reason, in their words. A count
 *                             is not a score (CLAUDE.md, Operations), so
 *                             nothing here ranks a studio or a person.
 *   From the floor            A trainer tapped "Tell head office" on a line
 *                             or a page: a dispute ("this is wrong") or an
 *                             addition ("add this"), with their words and,
 *                             if they had one, a proposed wording. Head
 *                             office marks each Taken or Not taken, with an
 *                             optional note back.
 *
 * "Corporate owns the method, so corporate reads it before adopting it":
 * marking something Taken changes no Academy words. It records the
 * decision; the words change when head office edits the standard.
 *
 * Calm on purpose (AJ, Oct 3 2026: "there's just so many words on there"):
 * one line of counts at the top, no captions under headings, an empty part
 * is said in that one line instead of drawing an empty section. Only the
 * people who decide (viewer.isHeadOffice) see Taken / Not taken; anyone
 * else who opens it in the prototype reads the same list, and is told so.
 *
 * Nothing here pings anyone ("Nothing pings anyone"): a decision is kept on
 * the submission, where the studio reads it. The prototype's store is the
 * in-memory sandbox (markup-store.ts); nothing reads or writes Firestore.
 */
import { useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatStudioDate } from "../../../lib/studio-time";
import { useUnsavedChanges } from "../../unsaved-changes";
import { refFromTargetKey } from "../learning-link";
import { routeForTargetRef } from "../routes";
import { queueGroups, signalSentence, strikeSignals, type QueueGroup } from "../submissions";
import type { LearningSubmission, StrikeSignal, VaultRoute, VaultTargetRef } from "../types";
import { useAllMarkup, useSubmissions, useVault } from "./VaultProvider";
import "../../wiki/wiki.css";
import "./queue.css";

/** The most a note back to a studio may say. */
export const DECISION_NOTE_MAX = 300;

/** "Oct 19, 2026": one constant options object (KNOWN-TRAPS: Intl is costly per call). */
const DAY_WORDS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

function dayOf(iso: string): string {
  return formatStudioDate(iso, DAY_WORDS, undefined, "");
}

/** "Solon's", "St. James'": a studio's name as the owner of something (as versionLabel says it). */
export function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/**
 * The one line of counts at the top. Says both parts, including the empty
 * one, so an empty part needs no section of its own; says "All clear" once
 * when there is nothing at all.
 */
export function queueLead(waiting: number, decided: number, lines: number): string {
  if (waiting === 0 && decided === 0 && lines === 0) {
    return "All clear: nothing from the floor, and no studio has crossed out a line.";
  }
  const floor =
    waiting > 0 ? `${waiting} waiting from the floor` : decided > 0 ? "Nothing waiting from the floor" : "Nothing from the floor";
  const crossed = lines > 0 ? `${lines} ${lines === 1 ? "line" : "lines"} crossed out` : "no lines crossed out";
  return `${floor} · ${crossed}`;
}

/** What a submission is, said as its card's first line. */
export function intentLine(sub: Pick<LearningSubmission, "intent" | "quote" | "blockKey">): string {
  const aboutLine = Boolean(sub.quote || sub.blockKey);
  if (sub.intent === "dispute") return aboutLine ? "Disputes this line" : "Disputes this page";
  return aboutLine ? "Adds to this line" : "Adds to this page";
}

export interface SubmissionQueueProps {
  onOpen: (route: VaultRoute) => void;
  /** How many studios there are, for "Crossed out at 3 of 70 studios". */
  totalStudios?: number;
}

export function SubmissionQueue({ onOpen, totalStudios }: SubmissionQueueProps) {
  const { store, viewer, now } = useVault();
  const submissions = useSubmissions();
  const markup = useAllMarkup();

  const signals = useMemo(() => strikeSignals(markup), [markup]);
  const groups = useMemo(() => queueGroups(submissions), [submissions]);
  const waiting = submissions.filter((s) => s.status === "pending").length;
  const decided = submissions.length - waiting;

  const openRef = (ref: VaultTargetRef) => onOpen(routeForTargetRef(ref));

  const decide = (id: string, status: "taken" | "declined", note: string) => {
    const words = note.trim();
    store.decide(id, status, {
      ...(words ? { note: words } : {}),
      byName: viewer.name,
      at: now().toISOString(),
    });
  };

  const linesId = useId();
  const floorId = useId();

  return (
    <div className="vtq">
      <p className="vtq__lead">{queueLead(waiting, decided, signals.length)}</p>
      {!viewer.isHeadOffice && (
        <p className="vtq__quiet">Head office decides these. This is the list they see.</p>
      )}

      {signals.length > 0 && (
        <section className="vtq__part" aria-labelledby={linesId}>
          <h2 className="vtq__h2" id={linesId}>
            Lines studios cross out
          </h2>
          <ul className="vtq__list">
            {signals.map((s) => (
              <SignalCard
                key={`${s.targetKey}|${s.blockKey}`}
                signal={s}
                totalStudios={totalStudios}
                onOpenRef={openRef}
              />
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section className="vtq__part" aria-labelledby={floorId}>
          <h2 className="vtq__h2" id={floorId}>
            From the floor
          </h2>
          {groups.map((g) => (
            <SubmissionGroup
              key={g.targetKey}
              group={g}
              canDecide={viewer.isHeadOffice}
              onOpenRef={openRef}
              onDecide={decide}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The page a card is about: its title, and the door to it
 * ------------------------------------------------------------------ */

function PageDoor({ title, refOf, onOpenRef }: { title: string; refOf: VaultTargetRef | null; onOpenRef: (ref: VaultTargetRef) => void }) {
  if (!refOf) return <span className="vtq__page-title">{title}</span>;
  return (
    <button type="button" className="vtq__open" onClick={() => onOpenRef(refOf)}>
      <span>{title}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * One line crossed out, at one or more studios
 * ------------------------------------------------------------------ */

function SignalCard({
  signal,
  totalStudios,
  onOpenRef,
}: {
  signal: StrikeSignal;
  totalStudios?: number;
  onOpenRef: (ref: VaultTargetRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const reasonsId = useId();
  const ref = refFromTargetKey(signal.targetKey);
  const only = signal.studios.length === 1 ? signal.studios[0] : null;
  const toggle = open
    ? only
      ? `Hide ${possessive(only.studioName)} reason`
      : "Hide the reasons"
    : only
      ? `See ${possessive(only.studioName)} reason`
      : "See each studio's reason";

  return (
    <li className="vtq__card">
      <p className="vtq__page">
        <PageDoor title={signal.targetTitle} refOf={ref} onOpenRef={onOpenRef} />
      </p>
      <blockquote className="vtq__quote">{signal.quote}</blockquote>
      <p className="vtq__count">{signalSentence(signal, totalStudios)}</p>
      <div className="vtq__row">
        <button
          type="button"
          className="vtq__btn"
          aria-expanded={open}
          aria-controls={reasonsId}
          onClick={() => setOpen((v) => !v)}
        >
          {toggle}
        </button>
      </div>
      <ul className="vtq__reasons" id={reasonsId} hidden={!open}>
        {signal.studios.map((st) => {
          const when = dayOf(st.at);
          return (
            <li key={st.studioId} className="vtq__reason">
              <p className="vtq__reason-head">
                <strong className="vtq__studio">{st.studioName}</strong>
                {when && <span className="vtq__when">{when}</span>}
              </p>
              <p className="vtq__reason-text">Why: {st.reason}</p>
              {st.replacement && <p className="vtq__instead">Does instead: {st.replacement}</p>}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * What the floor sent about one page
 * ------------------------------------------------------------------ */

function SubmissionGroup({
  group,
  canDecide,
  onOpenRef,
  onDecide,
}: {
  group: QueueGroup;
  canDecide: boolean;
  onOpenRef: (ref: VaultTargetRef) => void;
  onDecide: (id: string, status: "taken" | "declined", note: string) => void;
}) {
  const headId = useId();
  return (
    <section className="vtq__group" aria-labelledby={headId}>
      <h3 className="vtq__h3" id={headId}>
        <PageDoor title={group.targetTitle} refOf={group.ref} onOpenRef={onOpenRef} />
      </h3>
      <ul className="vtq__list">
        {group.items.map((s) => (
          <SubmissionCard key={s.id} sub={s} canDecide={canDecide} onDecide={onDecide} />
        ))}
      </ul>
    </section>
  );
}

function SubmissionCard({
  sub,
  canDecide,
  onDecide,
}: {
  sub: LearningSubmission;
  canDecide: boolean;
  onDecide: (id: string, status: "taken" | "declined", note: string) => void;
}) {
  const [choice, setChoice] = useState<"taken" | "declined" | null>(null);
  const [note, setNote] = useState("");
  const unsaved = useUnsavedChanges(choice !== null && note.trim() !== "", `the note back to ${sub.studioName}`, {
    onDiscard: () => setNote(""),
  });
  const noteId = useId();
  const when = dayOf(sub.at);

  // Tapping the picked choice again puts it down; a typed note asks first.
  const pick = (next: "taken" | "declined") => {
    if (choice === next) unsaved.guard(() => setChoice(null));
    else setChoice(next);
  };

  const confirm = () => {
    if (!choice) return;
    unsaved.release();
    onDecide(sub.id, choice, note);
  };

  return (
    <li className="vtq__card">
      <p className="vtq__kind">{intentLine(sub)}</p>
      {sub.quote && <blockquote className="vtq__quote">{sub.quote}</blockquote>}
      <p className="vtq__body">{sub.body}</p>
      {sub.proposed && (
        <div className="vtq__proposed">
          <p className="vtq__label">Proposed wording</p>
          <p className="vtq__proposed-text">{sub.proposed}</p>
        </div>
      )}
      <p className="vtq__by">
        {sub.by.name} at {sub.studioName}
        {when ? ` · ${when}` : ""}
      </p>

      {sub.status !== "pending" ? (
        <Decision sub={sub} />
      ) : !canDecide ? (
        <p className="vtq__quiet">Waiting for head office.</p>
      ) : (
        <>
          <div className="vtq__row" role="group" aria-label="Decide">
            <button
              type="button"
              className="vtq__btn vtq__choice"
              aria-pressed={choice === "taken"}
              onClick={() => pick("taken")}
            >
              Taken
            </button>
            <button
              type="button"
              className="vtq__btn vtq__choice"
              aria-pressed={choice === "declined"}
              onClick={() => pick("declined")}
            >
              Not taken
            </button>
          </div>
          {choice && (
            <div className="vtq__panel">
              <label className="vtq__label" htmlFor={noteId}>
                A note back to {sub.studioName}
              </label>
              <textarea
                id={noteId}
                className="vtq__input"
                value={note}
                rows={2}
                maxLength={DECISION_NOTE_MAX}
                placeholder="Optional"
                autoCapitalize="sentences"
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="vtq__row">
                <button type="button" className="vtq__btn vtq__btn--primary" onClick={confirm}>
                  {choice === "taken" ? "Mark taken" : "Mark not taken"}
                </button>
                <button
                  type="button"
                  className="vtq__btn vtq__btn--quiet"
                  onClick={() => unsaved.guard(() => setChoice(null))}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function Decision({ sub }: { sub: LearningSubmission }) {
  const taken = sub.status === "taken";
  const by = sub.decision ? [sub.decision.byName, dayOf(sub.decision.at)].filter(Boolean).join(" · ") : "";
  return (
    <div className="vtq__decision">
      <p className={taken ? "vtq__verdict vtq__verdict--taken" : "vtq__verdict"}>
        {taken ? "Taken" : "Not taken"}
        {by ? <span className="vtq__verdict-by">{` · ${by}`}</span> : null}
      </p>
      {sub.decision?.note && <p className="vtq__note">{sub.decision.note}</p>}
    </div>
  );
}
