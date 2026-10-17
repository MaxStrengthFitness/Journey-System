/**
 * The pre-session briefing on a page of its own (the briefing round, Oct 17
 * 2026): the app's real BriefingScreen, tokens and fonts, from a made-up
 * client (sample.ts), with every database call answered by stubs/ instead.
 *
 *   ?theme=dark       the dark theme
 *   &seen=1           the signed-in trainer trained the client since the Heads up
 *   &flags=1          a low-back flag in Before you start
 *   &view=list        today's list alone (TodayList), with:
 *   &order=1          Lumbar straight into Leg Press, to show an order warning
 *
 * shots.mjs photographs it. It never ships.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./preview.css";
import "../../src/features/briefing/briefing.css";
import { ThemeProvider } from "../../src/components/ThemeProvider";
import { UnsavedChangesProvider } from "../../src/features/unsaved-changes";
import { BriefingScreen } from "../../src/features/briefing/BriefingScreen";
import { TodayList } from "../../src/features/briefing/TodayList";
import type { MachineHistoryEntry } from "../../src/features/routine-builder/types";
import { CLIENT, FLOOR, ROUTINES, SESSIONS, TRAINER } from "./sample";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.classList.add(theme);
try {
  localStorage.setItem("briefing-preview-theme", theme);
} catch {
  /* a private window: the class above still sets the theme */
}

const HISTORY: Record<string, MachineHistoryEntry> = {
  "m-hip-add": { lastWeight: 154, lastReps: 8, lastUnit: "reps", lastDate: null },
  "m-hip-abd": { lastWeight: 52, lastReps: 10, lastUnit: "reps", lastDate: null },
  "m-leg-press": { lastWeight: 142, lastReps: 9, lastUnit: "reps", lastDate: null },
  "m-compound-row": { lastWeight: 70, lastReps: 9, lastUnit: "reps", lastDate: null },
  "m-dip": { lastWeight: 60, lastReps: 9, lastUnit: "reps", lastDate: null },
  "m-lumbar": { lastWeight: 44, lastReps: 8, lastUnit: "reps", lastDate: null },
  "m-pullover": { lastWeight: 140, lastReps: 90, lastUnit: "sec", lastDate: null },
};
const START =
  params.get("order") === "1"
    ? ["m-hip-add", "m-hip-abd", "m-lumbar", "m-leg-press", "m-compound-row", "m-dip"]
    : ["m-hip-add", "m-hip-abd", "m-leg-press", "m-compound-row", "m-dip", "m-lumbar"];
const nameOf = (id: string) => FLOOR.find((m) => m.id === id)?.name ?? id;

function ListOnly() {
  const [ids, setIds] = useState<string[]>(START);
  (window as unknown as { __ids: string[] }).__ids = ids;
  return (
    <div className="br">
      <div className="br__page" style={{ paddingBottom: 24 }}>
        <section className="br-card br-routine" aria-label="Today's routine">
          <TodayList
            ids={ids}
            onChange={setIds}
            floor={FLOOR}
            nameOf={nameOf}
            history={HISTORY}
            nextInPlan={null}
            emptyWords="Nothing on today's list yet."
            onRebuild={() => {}}
            footnotes={<p className="br-today__focus">Focus: Delts</p>}
          />
        </section>
      </div>
    </div>
  );
}

function Full() {
  const [started, setStarted] = useState<unknown[] | null>(null);
  (window as unknown as { __started: unknown[] | null }).__started = started;
  return (
    <ThemeProvider defaultTheme={theme} storageKey="briefing-preview-theme">
      <UnsavedChangesProvider>
        <BriefingScreen
          studioName="Practice Studio"
          studioId="s-sample"
          authTrainer={TRAINER}
          client={CLIENT}
          coverage="complete"
          targetRoutine={ROUTINES[0]}
          lastSession={SESSIONS[0]}
          sessions={SESSIONS}
          routinesKnown
          onStart={(...args) => setStarted(args)}
          onClose={() => {}}
          closeWords="Back to the Hub"
          machines={FLOOR}
          routines={ROUTINES}
          trainers={[TRAINER]}
        />
      </UnsavedChangesProvider>
    </ThemeProvider>
  );
}

(window as unknown as { __ready: boolean }).__ready = true;
createRoot(document.getElementById("root")!).render(params.get("view") === "list" ? <ListOnly /> : <Full />);
