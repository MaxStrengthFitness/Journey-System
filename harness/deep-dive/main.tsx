/**
 * The Kaizen Deep Dive as a trainer sees it, for a made-up long-standing
 * client shaped like the FileMaker import (sample.ts), on a page of its own:
 * the app's real buildReport and ClinicalDashboard, the app's fonts and
 * tokens, no Firestore.
 *
 *   ?range=all|12m|6m|90d|30d   the range the trainer picked (default all)
 *   &theme=dark                 the dark theme
 *   &journey=1                  only the sessions recorded in Journey
 *
 * shots.mjs photographs it. It never ships.
 */
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import "../../src/features/journey-grid/journey-grid.tokens.css";
import { buildReport, rangeForPreset } from "../../src/features/clinical-review/report";
import { ClinicalDashboard } from "../../src/features/clinical-review/ClinicalDashboard";
import { rangePresets } from "../../src/features/clinical-review/ClinicalReviewTab";
import "../../src/features/clinical-review/clinical-review.css";
import type { Client } from "../../src/types";
import type { RangePreset } from "../../src/features/clinical-review/types";
import { MACHINES, sample } from "./sample";

const params = new URLSearchParams(location.search);
document.documentElement.classList.add(params.get("theme") === "dark" ? "dark" : "light");

const data = sample({ journeyOnly: params.get("journey") === "1" });
const preset = (params.get("range") ?? "all") as RangePreset;
const client = { id: "sample", firstName: "Dana", lastName: "Sample" } as Client;
const report = buildReport({
  client,
  machines: MACHINES,
  trainers: [],
  sessions: data.sessions,
  logs: data.logs,
  incidents: [],
  pulseHistory: undefined,
  range: rangeForPreset(preset, data.today),
  timeZone: "America/New_York",
});
(window as unknown as { __ready: boolean }).__ready = true;

createRoot(document.getElementById("root")!).render(
  <div className="bg-background" style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
    <ClinicalDashboard
      report={report}
      clientName="Dana Sample"
      presets={rangePresets("complete")}
      onPreset={() => {}}
      onRegenerate={() => {}}
      coverage="complete"
    />
  </div>,
);
