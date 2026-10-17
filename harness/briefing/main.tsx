/**
 * The briefing's list for today (TodayList, the briefing round, Oct 17 2026)
 * on a page of its own: the app's real component, tokens and fonts, made-up
 * machines shaped like a long-standing client's Routine A, no Firestore.
 *
 *   ?theme=dark       the dark theme
 *   &order=1          Lumbar straight into Leg Press, to show an order warning
 *
 * shots.mjs photographs it. It never ships.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import "../../src/features/briefing/briefing.css";
import { TodayList } from "../../src/features/briefing/TodayList";
import type { Machine } from "../../src/types";
import type { MachineHistoryEntry } from "../../src/features/routine-builder/types";

const params = new URLSearchParams(location.search);
document.documentElement.classList.add(params.get("theme") === "dark" ? "dark" : "light");

/* A floor in walking order. */
const FLOOR: Machine[] = [
  ["m-hip-add", "Hip Adduction"],
  ["m-hip-abd", "Hip Abduction"],
  ["m-leg-press", "Leg Press"],
  ["m-ext", "Leg Extension"],
  ["m-leg-curl", "Leg Curl"],
  ["m-compound-row", "Compound Row"],
  ["m-pullover", "Seated Pullover"],
  ["m-pulldown", "Pulldown"],
  ["m-chest-press", "Chest Press"],
  ["m-dip", "Seated Dip"],
  ["m-lateral-raise", "Lateral Raise"],
  ["m-lumbar", "Lumbar"],
  ["m-neck", "Neck Extension"],
].map(([id, name]) => ({ id, name }) as Machine);

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

function Preview() {
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

(window as unknown as { __ready: boolean }).__ready = true;
createRoot(document.getElementById("root")!).render(<Preview />);
