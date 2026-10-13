/**
 * One sample report as the printed sheet (?f=FULL, EVERYDAY, BODY, NEW_CLIENT
 * or OVERFULL), the app's own fonts and tokens, nothing else on the page.
 * After the sheet has measured itself it says so on window.__sheet, which
 * check.mjs reads before it prints the page to PDF.
 *
 * &view=screen draws the client view on screen instead (ReportScreen, on the
 * app's page ground), &theme=dark in the dark theme: shots.mjs photographs it.
 *
 * &app=1 puts the report inside the app's own shell as AppContent draws it
 * (the status band, the 56px header, main with its padding, the bottom bar)
 * with the body classes the view sets before it prints, so check.mjs proves
 * the sheet still prints on one page from inside the app, not only alone.
 */
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { ReportSheet, type SheetMeasure } from "../../src/features/progress-report/ReportSheet";
import { ReportScreen } from "../../src/features/progress-report/ReportScreen";
import { planSheet } from "../../src/features/progress-report/sheet-from-report";
import * as fixtures from "../../src/features/progress-report/sheet-fixtures";

declare global {
  interface Window {
    __sheet?: { estimate: string; over: number; measured: SheetMeasure | null; ready: boolean };
  }
}

const name = new URLSearchParams(location.search).get("f") ?? "FULL";
const measured = (m: SheetMeasure) => {
  window.__sheet = { ...window.__sheet!, measured: m, ready: true };
};
const inputs = (fixtures as unknown as Record<string, Parameters<typeof planSheet>[0]>)[name];
const plan = planSheet(inputs);
window.__sheet = { estimate: plan.fit.density ?? "over", over: plan.fit.over, measured: null, ready: false };

const params = new URLSearchParams(location.search);
document.documentElement.classList.add(params.get("theme") === "dark" ? "dark" : "light");

if (params.get("app") === "1") document.body.classList.add("printing-report", "printing-sheet");

createRoot(document.getElementById("root")!).render(
  params.get("app") === "1" ? (
    <div className="app-shell flex flex-col overflow-hidden bg-background text-foreground font-sans overflow-x-hidden w-full max-w-full">
      <div className="status-band" style={{ height: 24 }} />
      <header className="h-14 shrink-0 flex items-center px-4">The app header</header>
      <main className="w-full max-w-full mx-auto relative flex-1 min-h-0 p-3 sm:p-6 overflow-y-auto overscroll-contain bg-background">
        <div data-print-root className="rsc-page">
          <div className="rs-print-only" aria-hidden="true">
            <ReportSheet model={plan.model} onMeasured={measured} />
          </div>
          <div className="rsc-shell">
            <ReportScreen plan={plan} clientFirstName={inputs.client.firstName} />
          </div>
        </div>
      </main>
      <nav className="h-16 shrink-0">The bottom bar</nav>
    </div>
  ) : params.get("view") === "screen" ? (
    <div className="rsc-page">
      <div className="rsc-shell">
        <ReportScreen plan={plan} clientFirstName={inputs.client.firstName} />
      </div>
    </div>
  ) : (
  <ReportSheet
    model={plan.model}
    selfFit={new URLSearchParams(location.search).get("raw") !== "1"}
    onMeasured={measured}
  />
  ),
);
