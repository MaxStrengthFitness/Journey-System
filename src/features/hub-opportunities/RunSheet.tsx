/**
 * THE RUN-SHEET — the Hub's Opportunities layer (Sep 27 2026).
 *
 * Research-hub §6.5, Direction O1: one row per client booked on the day on
 * screen, a sort that reads as a sentence in ONE fixed column (Time · Last
 * seen · Sessions · Left · Birthday), the families as filter chips with
 * counts (zeros hidden), at most three chips per row that never repeat the
 * sorted fact, and a tap that opens the row in place into three slots —
 * Where she is · Something to say · Watch — with Open profile and Start
 * session. "Can't tell yet" is gathered at the bottom, folded, never
 * scattered through the list (§7).
 *
 * The engine is moments-today.ts; this file only draws it. Reads: none of
 * its own beyond the studio's package table (the one document the profile
 * and the directory read, so "left" says their number). The bookings, the
 * roster, the sessions, the Critical notes and the FORD details are the
 * Hub's.
 *
 * Get to know (wave 2 hub, Sep 28 2026): the ✎ "Ask about" is a chip ("Ask:
 * the recital · Sat"), a filter, and a sentence under "Something to say".
 * When the Hub's FORD read couldn't answer for a client, the line under the
 * chips says so once, and her opened row says so rather than "Nothing
 * special today."
 *
 * All stars (wave 2 hub): a section after Regulars on the Sessions sort
 * ("#264 · in 25 of the last 26 weeks"), and "All star: in 25 of the last 26
 * weeks, about twice a week." under "Where she is" — only for a client the
 * nightly marks name.
 *
 * Out of scope: surgery or away from dated notes, "Show on schedule".
 */
import { mineDefinition, myLabel } from "../../lib/mine";
import { IMPORTANCE_META } from "../../types/journal";
import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Award, Cake, ChevronDown, ChevronRight, FileSignature, MessageCircle, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";
import { rowChips, runSections, type FilterId, type Moment, type MomentKind, type RunSheetEntry } from "./moments-today";
import { ASK_UNREAD_LINE } from "./get-to-know";
import { LENSES, LENS_DEFAULTS, lensRows, nextBookings, type LensId, type LensRow, type LensThresholds } from "./lenses";
import type { DirectoryRow } from "../client-directory/row";
import "./run-sheet.css";

export interface RunSheetProps {
  /** The day on screen (the Hub's selected day), `yyyy-mm-dd`. */
  day: string;
  /**
   * Every client booked on that day, from the Hub's one engine
   * (use-day-moments): the Schedule layer's cards read the same entries, so
   * the grid and the list can never disagree.
   */
  entries: ReadonlyArray<RunSheetEntry>;
  /** The Hub's strip, `yyyy-mm-dd`: "the next 7 days" the lenses look across (Oct 21 2026). */
  weekDays: ReadonlyArray<string>;
  /** Any day's entries from the Hub's one engine, for the week. */
  entriesOn: (day: string) => ReadonlyArray<RunSheetEntry>;
  /** The directory's rows the engine was built on: sessions left, the package's end, birthdays. */
  rowsById: ReadonlyMap<string, DirectoryRow>;
  /** The real studio day. */
  today: string;
  /** The studio's numbers for "ending soon" (studio settings). */
  thresholds?: LensThresholds;
  onOpenProfile: (clientId: string) => void;
  onStartSession: (clientId: string) => void;
  /**
   * Open on this family, for the whole studio: the Schedule's spotlight
   * "See them as a list" (calm Hub round). A new nonce applies it again.
   */
  request?: { filter: FilterId; nonce: number } | null;
  /**
   * One trainer's bookings for the day (hub fixes, Oct 1 2026, AJ approved:
   * a tap on a trainer's column head). The same entries, narrowed — never a
   * second engine. A bar says whose they are, with Show everyone.
   */
  trainer?: { name: string; includes: (entry: RunSheetEntry) => boolean } | null;
  onClearTrainer?: () => void;
}

type Scope = "studio" | "mine";

interface Remembered {
  lens: LensId;
  scope: Scope;
}

const MEMORY_KEY = "journey.hub.opportunities";
const DEFAULTS: Remembered = { lens: "coming", scope: "studio" };

/** The list view remembers its lens and scope on this iPad (a sign-out clears it). */
function readMemory(): Remembered {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(MEMORY_KEY) : null;
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Remembered>;
    return {
      lens: LENSES.some((l) => l.id === v.lens) ? (v.lens as LensId) : DEFAULTS.lens,
      scope: v.scope === "mine" ? "mine" : "studio",
    };
  } catch {
    return DEFAULTS;
  }
}

function writeMemory(m: Remembered) {
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    // Storage refused: it still applies for this visit.
  }
}

const ICON: Record<MomentKind, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  critical: AlertTriangle,
  waiver: FileSignature,
  pulse: Activity,
  consult: Sparkles,
  "early-session": Sparkles,
  "first-with-trainer": Sparkles,
  back: Undo2,
  milestone: Award,
  birthday: Cake,
  renew: RefreshCw,
  "ask-about": MessageCircle,
};

function Chip({ m }: { m: Moment }) {
  const Icon = ICON[m.kind];
  return (
    <span className="ho-chip" data-family={m.family}>
      <Icon size={14} aria-hidden />
      {m.chip}
    </span>
  );
}

function Slot({ title, lines, empty }: { title: string; lines: Array<{ key: string; text: string; muted?: boolean; note?: boolean }>; empty: string }) {
  return (
    <div className="ho-slot">
      <h4 className="ho-slot-title">{title}</h4>
      <ul className="ho-slot-list">
        {lines.length === 0 ? (
          <li className="ho-slot-empty">{empty}</li>
        ) : (
          lines.map((l) => (
            <li key={l.key} className={l.muted ? "ho-slot-empty" : l.note ? "ho-slot-note" : undefined}>
              {l.note && <span className="ho-loud">{IMPORTANCE_META.standard.short}</span>}
              {l.text}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function OpenedRow({ entry, onOpenProfile, onStartSession }: { entry: RunSheetEntry; onOpenProfile: (id: string) => void; onStartSession: (id: string) => void }) {
  const f = entry.facts;
  const where = [
    { key: "sessions", text: f.sessions.sentence, muted: f.sessions.unknown },
    // All stars (wave 2 hub): the nightly marks' word, only for a client they name.
    ...(entry.allStar ? [{ key: "star", text: entry.allStar.words, muted: false }] : []),
    { key: "last", text: f.lastSeen.sentence, muted: f.lastSeen.unknown },
    { key: "left", text: f.left.sentence, muted: f.left.unknown },
  ];
  type Line = { key: string; text: string; muted?: boolean; note?: boolean };
  const say: Line[] = entry.moments
    .filter((m) => m.family === "welcome" || m.family === "celebrate" || m.family === "renew" || m.family === "get-to-know")
    // Get to know is offered at Note loudness: a small line (Oct 2 2026).
    .map((m) => ({ key: m.kind, text: m.sentence, note: m.loudness === "standard" }));
  // Her FORD couldn't be checked: never "Nothing special today" on a guess.
  if (entry.askUnknown) {
    say.push({ key: "ford-unread", text: ASK_UNREAD_LINE, muted: true });
  }
  const watch: Line[] = entry.moments.filter((m) => m.family === "read-first" || m.family === "watch").map((m) => ({ key: m.kind, text: m.sentence }));
  if (entry.criticalUnknown) {
    watch.push({ key: "unread", text: "Couldn\u2019t check the critical notes \u2014 the briefing shows them." });
  }
  // Standing context, said quietly: the amber dot left the Hub card (calm Hub round).
  if (entry.clinicalOnFile) {
    watch.push({ key: "clinical", text: "Clinical history on file \u2014 the briefing has it.", muted: true });
  }
  return (
    <div className="ho-open">
      <div className="ho-slots">
        <Slot title="Where things stand" lines={where} empty="" />
        <Slot title="Something to say" lines={say} empty="Nothing special today." />
        <Slot title="Watch" lines={watch} empty="Nothing to watch." />
      </div>
      <div className="ho-actions">
        {entry.clientId && entry.client ? (
          <>
            <button type="button" className="ho-action" onClick={() => onOpenProfile(entry.clientId as string)}>
              Open profile
            </button>
            <button type="button" className="ho-action" data-primary="true" onClick={() => onStartSession(entry.clientId as string)}>
              Start session
            </button>
          </>
        ) : (
          <span className="ho-slot-empty">{"Not linked to a client yet \u2014 the next sync links it."}</span>
        )}
      </div>
    </div>
  );
}

export function RunSheet({
  day,
  entries,
  weekDays,
  entriesOn,
  rowsById,
  today,
  thresholds = LENS_DEFAULTS,
  onOpenProfile,
  onStartSession,
  trainer = null,
  onClearTrainer,
}: RunSheetProps) {
  const [memory, setMemory] = useState<Remembered>(readMemory);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The sections the trainer has flipped from how they start (folded or open).
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  useEffect(() => writeMemory(memory), [memory]);
  // A new day or a new lens starts with every row closed.
  useEffect(() => setOpenKey(null), [day, memory.lens]);

  // One trainer's bookings (a tap on their column head) narrows the same entries, whatever the scope.
  const inScope = (e: RunSheetEntry) => (trainer ? trainer.includes(e) : memory.scope === "mine" ? e.mine : true);
  const scoped = useMemo(() => entries.filter(inScope), [entries, memory.scope, trainer]);
  const mineCount = useMemo(() => entries.filter((e) => e.mine).length, [entries]);

  // The lenses look across the strip (the next 7 days); Coming in and Critical are the day on screen's.
  const week = useMemo(() => nextBookings(weekDays, entriesOn).filter(inScope), [weekDays, entriesOn, memory.scope, trainer]);
  const lensList = useMemo(() => {
    const out = {} as Record<Exclude<LensId, "coming">, LensRow[]>;
    for (const id of ["sessions", "package", "birthday", "critical"] as const) out[id] = lensRows(id, week, scoped, rowsById, today, thresholds);
    return out;
  }, [week, scoped, rowsById, today, thresholds]);
  const countOf = (id: LensId) => (id === "coming" ? scoped.length : lensList[id].length);
  const lens: LensId = memory.lens;
  const sections = useMemo(() => (lens === "coming" ? runSections(scoped, "time") : []), [lens, scoped]);
  const lensMeta = LENSES.find((l) => l.id === lens)!;
  const rows: LensRow[] = lens === "coming" ? [] : lensList[lens];
  // After the last booking "Earlier today" is all there is: it starts open, not a closed header over a blank screen (Oct 20 2026).
  const onlyFolded = sections.length > 0 && sections.every((s) => s.folded);
  const unreadCritical = scoped.filter((e) => e.criticalUnknown).length;
  const unreadFord = scoped.filter((e) => e.askUnknown).length;

  const renderRow = (entry: RunSheetEntry, sentence: string, when: string) => {
    const open = openKey === entry.key;
    return (
      <div key={entry.key} className="ho-row" data-client-id={entry.clientId ?? ""}>
        <button type="button" className="ho-rowbtn" aria-expanded={open} onClick={() => setOpenKey(open ? null : entry.key)}>
          <span className="ho-name">{entry.name}</span>
          <span className="ho-when">{when}</span>
          <span className="ho-sentence" data-unknown="false">
            {sentence}
          </span>
          <span className="ho-chips">
            {rowChips(entry, "time").map((m) => (
              <Chip key={m.kind} m={m} />
            ))}
          </span>
        </button>
        {open && <OpenedRow entry={entry} onOpenProfile={onOpenProfile} onStartSession={onStartSession} />}
      </div>
    );
  };

  const lensLine = [
    lens === "sessions" ? `Booked in the next 7 days with ${thresholds.sessionsLeft} sessions left or fewer, fewest first.` : "",
    lens === "package" ? `Booked in the next 7 days, package up for renewal within ${thresholds.packageDays} days, soonest first.` : "",
    lens === "birthday" ? `Booked in the next 7 days, birthday within ${thresholds.birthdayDays} days, soonest first.` : "",
    lens === "critical" ? "Booked on this day, with a Critical note that matters today." : "",
    memory.scope === "mine" ? mineDefinition("clients") : "",
    unreadCritical > 0 ? `Couldn’t check ${unreadCritical === 1 ? "one client’s" : `${unreadCritical} clients’`} critical notes — their briefings show them.` : "",
    unreadFord > 0 ? `Couldn’t check FORD for ${unreadFord === 1 ? "one client" : `${unreadFord} clients`}, so something to ask about may be missing.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ho" data-lens={lens}>
      {trainer && (
        <div className="ho-trainer" role="status">
          <span className="ho-trainer-words">{`${trainer.name} · ${scoped.length} ${scoped.length === 1 ? "booking" : "bookings"}`}</span>
          {onClearTrainer && (
            <button type="button" className="ho-trainer-btn" onClick={onClearTrainer}>
              Show everyone
            </button>
          )}
        </div>
      )}
      <div className="ho-controls">
        <div className="ho-lenses" role="group" aria-label="What to look at">
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              className="ho-lens"
              aria-pressed={lens === l.id}
              data-empty={countOf(l.id) === 0 ? "true" : undefined}
              onClick={() => setMemory((m) => ({ ...m, lens: l.id }))}
            >
              {l.label}
              <span className="ho-lens-n">{countOf(l.id)}</span>
            </button>
          ))}
        </div>
        <div className="ho-seg" role="group" aria-label="Whose clients">
          <button type="button" className="ho-seg-btn" aria-pressed={memory.scope === "studio"} onClick={() => setMemory((m) => ({ ...m, scope: "studio" }))}>
            Studio
          </button>
          <button type="button" className="ho-seg-btn" aria-pressed={memory.scope === "mine"} onClick={() => setMemory((m) => ({ ...m, scope: "mine" }))}>
            {`${myLabel("clients")} ${mineCount}`}
          </button>
        </div>
      </div>

      {lensLine && <p className="ho-line">{lensLine}</p>}

      <div className="ho-scroll" role="region" aria-label={lens === "coming" ? "Clients booked on this day" : lensMeta.label}>
        {lens !== "coming" ? (
          rows.length === 0 ? (
            <p className="ho-empty">{lensMeta.empty}</p>
          ) : (
            rows.map((r) =>
              renderRow(
                r.entry,
                r.stat,
                [lens === "critical" ? null : formatStudioDate(r.entry.start, { weekday: "short", month: "short", day: "numeric" }), formatStudioTime(new Date(r.entry.start)), r.entry.withText]
                  .filter(Boolean)
                  .join(" · "),
              ),
            )
          )
        ) : sections.length === 0 ? (
          <p className="ho-empty">{memory.scope === "mine" ? "Nobody of yours is booked on this day." : "Nobody is booked on this day."}</p>
        ) : (
          sections.map((section) => {
            const startsFolded = section.folded && !(onlyFolded && section.id === "earlier");
            const folded = startsFolded !== flipped.has(section.id);
            return (
              <section key={section.id} aria-label={`${section.label}, ${section.entries.length}`}>
                {section.folded ? (
                  <button
                    type="button"
                    className="ho-sechead"
                    aria-expanded={!folded}
                    onClick={() =>
                      setFlipped((prev) => {
                        const next = new Set(prev);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      })
                    }
                  >
                    {folded ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                    {`${section.label} (${section.entries.length})`}
                  </button>
                ) : (
                  <div className="ho-sechead">{`${section.label} (${section.entries.length})`}</div>
                )}
                {!folded &&
                  section.entries.map((entry) =>
                    renderRow(entry, [entry.timeText, entry.stateText].filter(Boolean).join(" · "), [formatStudioTime(new Date(entry.start)), entry.withText].filter(Boolean).join(" · ")),
                  )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export default RunSheet;
