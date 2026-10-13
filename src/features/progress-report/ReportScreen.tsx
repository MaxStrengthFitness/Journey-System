/**
 * THE CLIENT VIEW ON SCREEN — a finalized report, as the client and the
 * trainer read it together on the iPad (Oct 13 2026; AJ: "nail the look of
 * the client progress report Client view ... currently you cant read all the
 * text, we could enhance the look to feel more like our app", and "A richer
 * screen version").
 *
 * The same modules as the printed page, in the same order (the client's
 * focus decides it, report-page.ts), drawn in the app's own look: panels on
 * the page ground, light and dark, words at 14px and up. It is richer than
 * the paper where the paper ran out of room: every ticked machine, every step
 * of the plan, the coaching focus history and the trainer's highlights saved
 * with the report, the scans' days, and the whole Pulse in its client copy.
 *
 * It draws a SheetPlan (sheet-from-report.ts) and nothing else, so the
 * screen and the page can never disagree about what the report says. A
 * module with nothing to say is not drawn; nothing here writes a sentence the
 * trainer didn't (the old view's "Incredible work ... clinical protocol" and
 * "peak clinical efficiency" defaults are gone).
 */
import { Compass, Flag } from "lucide-react";
import type { ReactNode } from "react";
import { SubjectiveClientCopy } from "../subjective-report/SubjectiveDashboard";
import { MACHINE_ROWS, type ModuleId } from "./report-page";
import type { SheetPlan } from "./sheet-from-report";
import { modelHas } from "./sheet-model";
import "./report-screen.css";

export interface ReportScreenProps {
  plan: SheetPlan;
  clientFirstName: string;
  /** For the Pulse's machine names. */
  machines?: { id?: string; name: string }[];
}

/**
 * The page's rows, for a screen: the same order, and the same pairs, except
 * that a machines table longer than the page's roomy six takes a row of its
 * own (beside a short module it leaves a hole the height of the table).
 */
export function screenRows(plan: SheetPlan): ModuleId[][] {
  const { model, screen } = plan;
  const long = screen.machines.length > MACHINE_ROWS.roomy;
  const out: ModuleId[][] = [];
  for (const row of model.rows) {
    const shown = row.filter((m) => modelHas(model, m));
    if (shown.length === 2 && long && shown.includes("machines")) out.push([shown[0]], [shown[1]]);
    else if (shown.length > 0) out.push(shown);
  }
  return out;
}

export function ReportScreen({ plan, clientFirstName, machines }: ReportScreenProps) {
  const { model } = plan;
  const rows = screenRows(plan);

  return (
    <article className="rsc" aria-label={`Progress report for ${model.clientName}`}>
      <header className="rsc-panel rsc-head">
        <div className="rsc-brand">
          <span className="rsc-logo" aria-hidden="true">
            <span className="rsc-logo__m">M</span>
            <span className="rsc-logo__a">
              <svg width="10" height="9" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
                <path d="M1.5 9 L6 1.5 L10.5 9" />
              </svg>
            </span>
            <span className="rsc-logo__x">X</span>
          </span>
          <span>{model.studioName}</span>
          <span className="rsc-brand__date">Progress report, {model.dateLabel}</span>
        </div>
        <div className="rsc-head__who">
          <h1 className="rsc-name">{model.clientName}</h1>
          {model.subline && <p className="rsc-sub">{model.subline}</p>}
        </div>
        <div className="rsc-head__meta">
          {model.focusLine && (
            <p className="rsc-focus">
              <Compass size={16} aria-hidden="true" />
              <span>
                <span className="rsc-focus__key">Training for</span> {model.focusLine}
              </span>
            </p>
          )}
          <p className="rsc-coach">
            <span className="rsc-coach__key">Your coach</span> {model.coachName}
            {model.coachRole ? `, ${model.coachRole}` : ""}
          </p>
        </div>
      </header>

      {rows.map((row) => (
        <div key={row.join("+")} className="rsc-row" data-two={row.length === 2 ? "" : undefined} data-row={row.join("+")}>
          {row.map((m) => (
            <ScreenModule key={m} id={m} plan={plan} clientFirstName={clientFirstName} machines={machines} />
          ))}
        </div>
      ))}

      <footer className="rsc-foot">
        <span>
          Max Strength Fitness {model.studioName} · Prepared by {model.coachName}
        </span>
        <span>Report {model.reportRef}</span>
      </footer>
    </article>
  );
}

function Panel({ id, title, aside, children }: { id: ModuleId; title?: string; aside?: string | null; children: ReactNode }) {
  return (
    <section className="rsc-panel" data-module={id} aria-label={title}>
      {title && (
        <div className="rsc-title">
          <h2>{title}</h2>
          {aside && <span className="rsc-title__aside">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function ScreenModule({ id, plan, clientFirstName, machines }: { id: ModuleId; plan: SheetPlan; clientFirstName: string; machines?: { id?: string; name: string }[] }) {
  const { model, screen } = plan;
  switch (id) {
    case "thanks": {
      const t = model.thanks!;
      return (
        <Panel id={id} title={t.sessions !== null ? "Your sessions" : "Thank you"}>
          <div className="rsc-thanks" data-quote={t.quote && t.sessions !== null ? "" : undefined}>
            {t.sessions !== null && (
              <div className="rsc-well rsc-sessions">
                <span className="rsc-big">{t.sessions}</span>
                <span className="rsc-sessions__word">{t.sessionsWord}</span>
                {t.sessionsSub && <span className="rsc-sessions__sub">{t.sessionsSub}</span>}
              </div>
            )}
            {t.quote && (
              <figure className="rsc-quote">
                <blockquote className="rsc-quote__text">“{t.quote}”</blockquote>
                <figcaption className="rsc-label">{t.signedBy}</figcaption>
              </figure>
            )}
          </div>
        </Panel>
      );
    }
    case "stats":
      return (
        <Panel id={id} title="The numbers">
          <div className="rsc-stats">
            {model.stats!.map((s) => (
              <div key={s.label} className="rsc-well rsc-stat">
                <p className="rsc-label">{s.label}</p>
                <p className="rsc-stat__value">
                  <span className="rsc-big" data-tone={s.tone ?? "plain"}>
                    {s.value}
                  </span>
                  {s.unit && <span className="rsc-stat__unit"> {s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      );
    case "accolades":
      return (
        <Panel id={id} title="Your accolades">
          <div className="rsc-accolades">
            {model.accolades!.map((a, i) => (
              <div key={i} className="rsc-well rsc-accolade">
                <p className="rsc-label">{a.label}</p>
                <p className="rsc-accolade__hero" data-tone={a.tone}>
                  {a.hero}
                </p>
                {a.context && <p className="rsc-text-2">{a.context}</p>}
              </div>
            ))}
          </div>
        </Panel>
      );
    case "machines": {
      const mc = model.machines!;
      const rows = screen.machines;
      return (
        <Panel id={id} title={mc.title} aside={`${rows.length} machine${rows.length === 1 ? "" : "s"}`}>
          <table className="rsc-table">
            <thead>
              <tr>
                <th scope="col">Machine</th>
                <th scope="col">Start</th>
                <th scope="col">Now</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="rsc-table__num rsc-text-2">{r.start}</td>
                  <td className="rsc-table__num rsc-table__now">{r.now}</td>
                  <td className="rsc-table__num">
                    <span className="rsc-change" data-tone={r.tone}>
                      {r.change}
                    </span>
                    <span className="rsc-change__pct">{r.pct}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mc.narrative && (
            <div className="rsc-well">
              <p className="rsc-label">What it means</p>
              <p className="rsc-text">{mc.narrative}</p>
            </div>
          )}
        </Panel>
      );
    }
    case "fourps":
      return (
        <Panel id={id} title="The 4 P's">
          <div className="rsc-ps">
            {model.fourps!.map((p) => (
              <div key={p.title} className="rsc-p" data-tone={p.tone}>
                <div className="rsc-p__top">
                  <span className="rsc-p__name">{p.title}</span>
                  <span className="rsc-p__word" data-tone={p.tone}>
                    {p.word}
                  </span>
                  <span className="rsc-p__bar" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span key={step} data-on={p.rank !== null && step <= p.rank ? "" : undefined} />
                    ))}
                  </span>
                </div>
                {p.note && <p className="rsc-text-2">“{p.note}”</p>}
              </div>
            ))}
          </div>
          {screen.focusLines.length > 0 && (
            <div className="rsc-well">
              <p className="rsc-label">Coaching focus</p>
              <ul className="rsc-list">
                {screen.focusLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {screen.highlights.length > 0 && (
            <div className="rsc-well">
              <p className="rsc-label">From your sessions</p>
              <ul className="rsc-list">
                {screen.highlights.map((note, i) => (
                  <li key={i}>“{note}”</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      );
    case "body": {
      const b = model.body!;
      const days = screen.bodyDays;
      const hasFrom = b.cells.some((c) => c.from);
      return (
        <Panel id={id} title={b.title} aside={[b.sub, days?.latest ? `latest ${days.latest}` : null].filter(Boolean).join(" · ")}>
          <table className="rsc-table">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {hasFrom && <th scope="col">{days?.first ? `First, ${days.first}` : "First scan"}</th>}
                <th scope="col">Now</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {b.cells.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{c.label}</th>
                  {hasFrom && <td className="rsc-table__num rsc-text-2">{c.from ?? ""}</td>}
                  <td className="rsc-table__num rsc-table__now">{c.now}</td>
                  <td className="rsc-table__num">
                    <span className="rsc-change" data-tone={c.tone}>
                      {c.change}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      );
    }
    case "pulse": {
      const p = model.pulse!;
      const whole = screen.pulse;
      return (
        <Panel id={id} title={p.title} aside={p.sub ? `as of ${p.sub}` : null}>
          {whole ? (
            <div className="rsc-pulse">
              <SubjectiveClientCopy assessment={whole.assessment} previous={whole.previous} clientFirstName={clientFirstName} machines={machines} />
            </div>
          ) : (
            p.lines.map((l, i) => (
              <div key={i} className="rsc-well">
                {l.label && <p className="rsc-label">{l.label}</p>}
                <p className="rsc-text">{l.text}</p>
              </div>
            ))
          )}
        </Panel>
      );
    }
    case "goals": {
      const g = model.goals!;
      return (
        <Panel id={id} title="Your goals">
          <div className="rsc-goals">
            {g.why && (
              <div className="rsc-well">
                <p className="rsc-label">Why you started</p>
                <p className="rsc-text">“{g.why}”</p>
              </div>
            )}
            {g.last && (
              <div className="rsc-well">
                <div className="rsc-goal__head">
                  <p className="rsc-label">Last time's goal</p>
                  {g.last.outcome && (
                    <span className="rsc-outcome" data-tone={g.last.outcomeTone}>
                      {g.last.outcome}
                    </span>
                  )}
                </div>
                <p className="rsc-text rsc-text--strong">{g.last.goal}</p>
                {g.last.note && <p className="rsc-text-2">“{g.last.note}”</p>}
              </div>
            )}
            {g.next && (
              <div className="rsc-well">
                <p className="rsc-label rsc-goal__next-label">
                  <Flag size={14} aria-hidden="true" />
                  The next 90 days
                </p>
                <p className="rsc-goal__next">{g.next.goal}</p>
                {g.next.by && <p className="rsc-text-2">{g.next.by}</p>}
                {g.next.checkIn && <p className="rsc-text-2">{g.next.checkIn}</p>}
              </div>
            )}
          </div>
        </Panel>
      );
    }
    case "plan": {
      const pl = model.plan!;
      return (
        <Panel id={id} title={pl.title} aside={pl.checkIn}>
          {screen.plan.length > 0 && (
            <ol className="rsc-plan">
              {screen.plan.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          )}
        </Panel>
      );
    }
    case "coach": {
      const c = model.coach!;
      return (
        <Panel id={id} title={c.title}>
          <p className="rsc-text">{c.text}</p>
          <p className="rsc-label">{model.coachName}</p>
        </Panel>
      );
    }
  }
}
