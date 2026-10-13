/**
 * The editor's last step: what goes on the page (Oct 13 2026; AJ: the
 * trainer ticks, from smart defaults). Every module in the focus's order;
 * the ones with nothing to say are listed with the reason and can't be
 * ticked; the page itself is drawn beside the list, and what it says about
 * fitting comes from the drawn sheet, not a guess.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { FOCUS_LABELS, MODULE_LABELS, fitLine, pageOrder, type ModuleId } from "./report-page";
import { ReportSheet, type SheetMeasure } from "./ReportSheet";
import type { SheetPlan } from "./sheet-from-report";

const SHEET_W = 739;
const SHEET_H = 979;

export function ReportPageStep({ plan, onChange }: { plan: SheetPlan; onChange: (ticked: ModuleId[]) => void }) {
  const [measure, setMeasure] = useState<SheetMeasure | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // The preview is the real sheet at its real size, drawn smaller to fit the column.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / SHEET_W));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticked = new Set(plan.ticked);
  const toggle = (m: ModuleId) => {
    const next = ticked.has(m) ? plan.ticked.filter((x) => x !== m) : [...plan.ticked, m];
    onChange(pageOrder(plan.focus.kind).filter((x) => next.includes(x)));
  };
  const line = measure
    ? fitLine({ density: measure.flows ? null : measure.density, scale: measure.scale, over: measure.flows ? Math.max(plan.fit.over, 18) : 0 })
    : fitLine(plan.fit);
  const runsOn = measure ? measure.flows : plan.fit.density === null;

  return (
    <div className="pr-page">
      <div className="pr-page__list">
        <p className="pr-page__focus">
          Led by the focus: <b>{FOCUS_LABELS[plan.focus.kind]}</b>
        </p>
        <p className="pr-page__fit" data-runs-on={runsOn || undefined} role="status">
          {line}
        </p>
        <ul className="pr-page__modules">
          {pageOrder(plan.focus.kind).map((m) => {
            const a = plan.avail[m];
            return (
              <li key={m}>
                {a.has ? (
                  <button type="button" className="pr-page__module" aria-pressed={ticked.has(m)} onClick={() => toggle(m)}>
                    <span className="pr-page__box" aria-hidden="true" />
                    <span>{MODULE_LABELS[m]}</span>
                  </button>
                ) : (
                  <div className="pr-page__module pr-page__module--none">
                    <span className="pr-page__box" aria-hidden="true" />
                    <span>
                      {MODULE_LABELS[m]}
                      <span className="pr-page__why">{a.why}</span>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pr-page__preview" ref={frameRef} aria-label="The printed page" style={{ height: Math.round(SHEET_H * scale) }}>
        <div style={{ width: SHEET_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <ReportSheet model={plan.model} onMeasured={setMeasure} />
        </div>
      </div>
    </div>
  );
}
