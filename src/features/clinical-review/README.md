# The Kaizen Deep Dive

Client profile → Activity Archive → **Deep Dive** (`ClinicalReviewTab.tsx`). The folder and some names still say `clinical-review`: the screen was "Trends Clinical Review" until the reporting round (Sep 2026). It is built on a tap, never when the tab opens (`useClinicalReport.ts`).

## The files

| File | What it is |
| --- | --- |
| `facts.ts` | One normalised row per completed session (`SessionFact`, `SetFact`), from the three shapes a session's data is stored in |
| `analytics.ts` | Pure functions over the facts |
| `insights.ts` | The numbers as sentences a trainer can say out loud, each behind an evidence gate |
| `pulse-trend.ts`, `effort-trend.ts` | The Pulse areas, first reading against the latest, and the Wrap-up's effort rating, as words |
| `report.ts` | `buildReport`: everything the dashboard draws, worked out once per build. Pure |
| `ClinicalDashboard.tsx`, `panels.tsx`, `charts.tsx` | The screen, a pure function of the report (the render test mounts it with made-up sessions) |

## A client older than Journey (Oct 14 2026)

The round is `docs/rounds/2026-10-14-deep-dive.md` (AJ: "Fix what it says", "Worth asking why", "One line for all stalls").

- **What only Journey records** (time under tension, the Dial, pain) is counted over the sessions Journey recorded, never an import's. A session recorded before Journey is marked on its fact (`beforeJourney`, by client-history's `isLegacySession`).
- **It names the day the rest count from**: one line under the caveat, only when the range reaches back before Journey, says how many sessions are from before Journey (weight and reps only) and the day rep quality, time under tension, the Dial and pain count from.
- The stalls are one finding with each machine named, and a stall or a load that fell ends "Worth asking why"; the Deep Dive never suggests moving the weight.
- `harness/deep-dive` draws the real Deep Dive for a made-up long-standing client, light and dark (`node harness/deep-dive/shots.mjs all 90d`).
