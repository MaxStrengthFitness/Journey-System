/**
 * The one-page sheet: the client copy on paper (Oct 13 2026; AJ: "White
 * page, navy band", one page, modular by the client's focus).
 *
 * Draws a SheetModel (sheet-model.ts) and nothing else: which modules, in
 * which rows and at which density was decided by report-page.ts. A module
 * the model has no values for is not drawn, so nothing empty ever prints.
 *
 * The estimate decides the density; the sheet checks itself once it is
 * laid out. A sheet that still runs past its page (a long note the
 * estimate under-counted) steps down to condensed, and a condensed one that
 * still overflows prints a little smaller, down to 88%, rather than ever
 * spilling onto a second page. `onMeasured` tells the editor which.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { MIN_SCALE, type Density, type ModuleId } from "./report-page";
import { modelHas, type SheetModel } from "./sheet-model";
import "./report-sheet.css";

export interface SheetMeasure {
  density: Density;
  /** 1, or the shrink applied so the page still fits. */
  scale: number;
  /** Pixels still past the page at that density and scale: 0 when it fits on one page. */
  overflow: number;
  /** Too much even at the smallest print: the sheet runs onto a second page rather than lose its end. */
  flows: boolean;
}

export function ReportSheet({
  model,
  onMeasured,
  selfFit = true,
}: {
  model: SheetModel;
  onMeasured?: (m: SheetMeasure) => void;
  /** Off only in the print check, to measure the estimate's density as drawn. */
  selfFit?: boolean;
}) {
  const [density, setDensity] = useState<Density>(model.density);
  const [scale, setScale] = useState(1);
  const [flows, setFlows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A new model (or new words in it) starts again from its own density.
  const key = JSON.stringify(model);
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    if (density !== model.density) setDensity(model.density);
    if (scale !== 1) setScale(1);
    if (flows) setFlows(false);
  }

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const over = flows ? 0 : el.scrollHeight - el.clientHeight;
    if (selfFit && over > 1 && el.clientHeight > 0) {
      if (density === "roomy") {
        setDensity("condensed");
        return;
      }
      if (scale === 1) {
        setScale(Math.max(MIN_SCALE, el.clientHeight / el.scrollHeight));
        return;
      }
      // Still too long at the smallest print: two pages, never a page that loses its end.
      setScale(1);
      setFlows(true);
      return;
    }
    onMeasured?.({ density, scale, overflow: Math.max(0, Math.round(over)), flows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density, scale, flows, key]);

  const rows = model.rows.map((row) => row.filter((m) => modelHas(model, m))).filter((row) => row.length > 0);

  return (
    <article
      className={flows ? "rs-sheet rs-sheet--flow" : "rs-sheet"}
      data-density={density}
      aria-label={`Progress report for ${model.clientName}`}
    >
      <header className="rs-band">
        <div className="rs-band__left">
          <div className="rs-logo" aria-hidden="true">
            <span className="rs-logo__m">M</span>
            <span className="rs-logo__a">
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
                <path d="M1.5 9 L6 1.5 L10.5 9" />
              </svg>
            </span>
            <span className="rs-logo__x">X</span>
          </div>
          <span className="rs-studio">{model.studioName}</span>
        </div>
        <div className="rs-band__right">
          <span className="rs-band__title">Progress report</span>
          <span className="rs-band__date">{model.dateLabel}</span>
        </div>
      </header>

      <div className="rs-body" ref={bodyRef} style={scale < 1 ? { zoom: scale } : undefined}>
        <div className="rs-head">
          <div className="rs-head__who">
            <h1 className="rs-name">{model.clientName}</h1>
            {model.subline && <p className="rs-sub">{model.subline}</p>}
          </div>
          <div className="rs-coach">
            <p className="rs-coach__name">
              <span className="rs-label">Your coach </span>
              {model.coachName}
              {model.coachRole ? `, ${model.coachRole}` : ""}
            </p>
            {model.focusLine && <p className="rs-focus">Your focus: {model.focusLine}</p>}
          </div>
        </div>

        {rows.map((row) => (
          <div key={row.join("+")} className={row.length === 2 ? "rs-row rs-row--two" : "rs-row"} data-row={row.join("+")}>
            {row.map((m) => (
              <SheetModule key={m} id={m} model={model} density={density} alone={row.length === 1} />
            ))}
          </div>
        ))}

        <footer className="rs-foot">
          <span>
            Max Strength Fitness {model.studioName} · Prepared by {model.coachName}
          </span>
          <span>Report {model.reportRef}</span>
        </footer>
      </div>
    </article>
  );
}

function Title({ title, aside }: { title: string; aside?: string | null }) {
  return (
    <div className="rs-title">
      <h2>{title}</h2>
      <span className="rs-title__rule" />
      <span className="rs-title__line" />
      {aside && <span className="rs-title__aside">{aside}</span>}
    </div>
  );
}

function SheetModule({ id, model, density, alone }: { id: ModuleId; model: SheetModel; density: Density; alone: boolean }) {
  switch (id) {
    case "thanks": {
      const t = model.thanks!;
      return (
        <section className="rs-mod" data-module="thanks">
          <div className="rs-thanks">
            <div className="rs-sessions">
              <span className="rs-sessions__n">{t.sessions}</span>
              <span className="rs-sessions__word">{t.sessionsWord}</span>
              {t.sessionsSub && <span className="rs-sessions__sub">{t.sessionsSub}</span>}
            </div>
            {t.quote && (
              <div className="rs-card rs-quote">
                <p className="rs-quote__text">“{t.quote}”</p>
                <p className="rs-label">{t.signedBy}</p>
              </div>
            )}
          </div>
        </section>
      );
    }
    case "stats":
      return (
        <section className="rs-mod" data-module="stats" aria-label="The numbers">
          <div className="rs-stats">
            {model.stats!.map((s) => (
              <div key={s.label} className="rs-card rs-stat">
                <p className="rs-label">{s.label}</p>
                <p className="rs-stat__value">
                  <span className="rs-big" data-tone={s.tone ?? "plain"}>
                    {s.value}
                  </span>
                  {s.unit && <span className="rs-stat__unit"> {s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        </section>
      );
    case "accolades":
      return (
        <section className="rs-mod" data-module="accolades">
          <Title title="Your accolades" />
          <div className="rs-accolades">
            {model.accolades!.map((a, i) => (
              <div key={i} className="rs-card rs-accolade">
                <p className="rs-label">{a.label}</p>
                <p className="rs-big rs-accolade__hero" data-tone={a.tone}>
                  {a.hero}
                </p>
                {a.context && <p className="rs-accolade__context">{a.context}</p>}
              </div>
            ))}
          </div>
        </section>
      );
    case "machines": {
      const mc = model.machines!;
      const story = alone && density === "roomy" && !!mc.narrative;
      return (
        <section className="rs-mod" data-module="machines">
          <Title title={mc.title} />
          <div className={story ? "rs-machines rs-machines--story" : "rs-machines"}>
            <div>
              <table className="rs-table">
                <thead>
                  <tr>
                    <th scope="col">Machine</th>
                    <th scope="col">Start</th>
                    <th scope="col">Now</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {mc.rows.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="rs-table__start">{r.start}</td>
                      <td className="rs-table__now">{r.now}</td>
                      <td className="rs-table__change" data-tone={r.tone}>
                        {r.change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mc.note && <p className="rs-note">{mc.note}</p>}
            </div>
            {story && (
              <div className="rs-card rs-story">
                <p className="rs-label">What it means</p>
                <p className="rs-coachnote__text">{mc.narrative}</p>
              </div>
            )}
          </div>
        </section>
      );
    }
    case "fourps":
      return (
        <section className="rs-mod" data-module="fourps">
          <Title title="The 4 P's" />
          <div className="rs-card rs-ps">
            {model.fourps!.map((p) => (
              <div key={p.title} className="rs-p" data-tone={p.tone}>
                <div className="rs-p__top">
                  <span className="rs-p__name">{p.title}</span>
                  <span className="rs-p__word" data-tone={p.tone}>
                    {p.word}
                  </span>
                  <span className="rs-p__bar" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span key={step} data-on={p.rank !== null && step <= p.rank} />
                    ))}
                  </span>
                </div>
                {p.note && <p className="rs-p__note">{p.note}</p>}
              </div>
            ))}
          </div>
        </section>
      );
    case "body": {
      const b = model.body!;
      if (density === "roomy") {
        return (
          <section className="rs-mod" data-module="body">
            <Title title={b.title} aside={b.sub} />
            <div className="rs-bodytiles">
              {b.cells.map((c, i) => (
                <div key={c.label} className={i === 0 ? "rs-card rs-bodytile rs-bodytile--lead" : "rs-card rs-bodytile"}>
                  <p className="rs-label">{c.label}</p>
                  <p className="rs-big rs-bodytile__change" data-tone={i === 0 ? undefined : c.tone}>
                    {c.change}
                  </p>
                  <p className="rs-bodytile__from">{c.from ? `${c.from} → ${c.now}` : c.now}</p>
                </div>
              ))}
            </div>
          </section>
        );
      }
      return (
        <section className="rs-mod" data-module="body">
          <div className="rs-card rs-bodyline">
            <p className="rs-label">{alone ? `${b.title} · ${b.sub}` : b.short}</p>
            {alone ? (
              <div className="rs-bodyline__cells">
                {b.cells.map((c) => (
                  <div key={c.label}>
                    <p className="rs-bodyline__label">{c.label}</p>
                    <p className="rs-bodyline__value">{c.now}</p>
                    <p className="rs-bodyline__change" data-tone={c.tone}>
                      {c.change}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <table className="rs-bodytable">
                <tbody>
                  {b.cells.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td className="rs-bodytable__now">{c.now}</td>
                      <td className="rs-bodytable__change" data-tone={c.tone}>
                        {c.change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      );
    }
    case "pulse": {
      const p = model.pulse!;
      if (density === "roomy") {
        return (
          <section className="rs-mod" data-module="pulse">
            <Title title={p.title} aside={p.sub} />
            <div className="rs-pulse">
              {p.lines.map((l, i) => (
                <div key={i} className="rs-card">
                  {l.label && <p className="rs-label">{l.label}</p>}
                  <p className="rs-pulse__text">{l.text}</p>
                </div>
              ))}
            </div>
          </section>
        );
      }
      return (
        <section className="rs-mod" data-module="pulse">
          <div className="rs-card rs-pulseline">
            <p className="rs-label">
              {p.title}
              {p.sub ? ` · ${p.sub}` : ""}
            </p>
            {p.lines.map((l, i) => (
              <p key={i} className="rs-pulseline__text">
                {l.label ? `${l.label}: ` : ""}
                {l.text}
              </p>
            ))}
          </div>
        </section>
      );
    }
    case "goals": {
      const g = model.goals!;
      return (
        <section className="rs-mod" data-module="goals">
          <div className="rs-goals">
            {g.why && (
              <div className="rs-card rs-goal">
                <p className="rs-label">Why you started</p>
                <p className="rs-goal__why">“{g.why}”</p>
              </div>
            )}
            {g.last && (
              <div className="rs-card rs-goal">
                <div className="rs-goal__head">
                  <p className="rs-label">Last time's goal</p>
                  {g.last.outcome && (
                    <span className="rs-goal__outcome" data-tone={g.last.outcomeTone}>
                      {g.last.outcome}
                    </span>
                  )}
                </div>
                <p className="rs-goal__last">{g.last.goal}</p>
                {g.last.note && <p className="rs-goal__note">{g.last.note}</p>}
              </div>
            )}
            {g.next && (
              <div className="rs-card rs-goal rs-goal--next">
                <p className="rs-label">The next 90 days</p>
                <p className="rs-big rs-goal__next">{g.next.goal}</p>
                {g.next.by && <p className="rs-goal__by">{g.next.by}</p>}
              </div>
            )}
          </div>
        </section>
      );
    }
    case "plan": {
      const pl = model.plan!;
      return (
        <section className="rs-mod" data-module="plan">
          <div className="rs-box rs-plan">
            <div className="rs-plan__head">
              <p className="rs-label">{pl.title}</p>
              {pl.checkIn && <p className="rs-plan__checkin">{pl.checkIn}</p>}
            </div>
            <ol>
              {pl.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ol>
          </div>
        </section>
      );
    }
    case "coach": {
      const c = model.coach!;
      return (
        <section className="rs-mod" data-module="coach">
          <div className="rs-box rs-coachnote">
            <p className="rs-label">{c.title}</p>
            <p className="rs-coachnote__text">{c.text}</p>
          </div>
        </section>
      );
    }
  }
}
