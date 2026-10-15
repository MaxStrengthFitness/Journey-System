# The server

`server.ts` (at the top of the project) is the web server: an Express app on Render that hands the built app to the browser and answers the app's `/api/*` requests. This folder, `server/`, holds the pieces `server.ts` is made of, and the scheduled jobs. The scheduled jobs are the files named `server/cron-*.ts`, and they run on Render as cron jobs, separate from the web server.

## The web server (`server.ts`)

`server.ts` (Express on Render) serves the build and `/api/*`: the Mindbody proxy and the Gemini endpoints.

- **Every `/api/mindbody/*` and `/api/gemini/*` route needs a staff sign-in.** The check is `server/auth.ts`. The web server holds no database key, so that file reads only the single documents it needs, using the caller's own token.
- **Mindbody calls go through `server/mindbody-client.ts`**, the server's one door to Mindbody.
- **The two Gemini OCR routes are registered by `server/gemini-routes.ts`.** A request is checked in this order: first the staff sign-in, then ONE scan request at a time for the whole process (a second one is answered "busy" at once, and the importer waits it out and tries again, `src/services/chart-scan.ts`), then a per-person limit, and only then is the body read.
- **Time limits (speed round, Oct 5 2026).** Every Mindbody attempt has a 30 second limit. Each Gemini attempt has 90 seconds, and a whole request 120 seconds. The sign-in check's reads have 15 seconds. A timeout is "unknown", never an empty answer.
- **A deploy does not cut a running request off.** `server/shutdown.ts` lets running requests finish when Render sends the old instance its SIGTERM. Render starts `node build/server.cjs` itself, so the signal arrives.
- **`server/log-error.ts` is the error-report door's limits.** It is the route `POST /api/log-error`, where the app sends its own error reports and the one small report per cold boot (`src/features/boot-timing/`). It needs no sign-in on purpose, so it has its own per-address limit and its own small body limit.
- **Which files it hands a browser is `server/served-files.ts`.** In `npm run dev`, which is open to the whole Wi-Fi, it serves only what the app uses, and never a key or a log. In production it serves `dist/` only, with the server's own bundle built to `build/server.cjs`. A missing file is a 404 with `no-store`, never the app's page, because edge caching depends on that.

## The scheduled jobs (`server/cron-*.ts`)

The files named `server/cron-*.ts` are Render cron jobs. They are bundled by esbuild (`npm run build:backend`), so they can import pure modules from `src/`. `server/cron-runtime.ts` wraps every entry point so a failed run exits with a failing code and shows up red in Render.

- **The nightly renewals job** is `server/renewals-job.ts`, run by `server/cron-renewals.ts` (06:30 UTC). It contacts nobody and writes nothing to Mindbody.
  - **Step 6 is `server/month-tally-step.ts`** (speed round, Oct 5 2026; its pure half is `src/features/admin/month-tally/`, whose README says why). For each studio it writes `watch/hours-YYYY-MM` and `watch/sessions-YYYY-MM` for this month and the four before it, closed days only. Hours and Insights read those documents with today read live, and they are for leaders only.
- **The weekly machine-trends job** is `server/machine-trends-job.ts`, run by `server/cron-machine-trends.ts` (Sundays, 07:00 UTC) on the Render service that is still named `journey-cron-leaderboards`. `src/features/machine-trends/` is its pure core: read that README first.
  - **Step 8 is `server/openings-step.ts`** (Openings round, Sep 27 2026). It folds each linked studio's last eight weeks of bookings into `studios/{s}/watch/openings`, after the main commit and in its own batch, so a failure there never touches the rest. `scripts/run-machine-trends.ts --only openings` runs it alone, and `scripts/openings-report.ts` is the read-only check. The rules it follows are the Openings core's, `src/features/openings/`.
- **Parked, not running:** `server/worker.ts`, `server/cron-daily-reminders.ts` and `server/cron-weekly-coach-report.ts` are commented out in `render.yaml`. Nothing contacts clients or trainers.

## The other files here

| File | What it is |
| --- | --- |
| `firebase-admin.ts` | The one place every job gets its database handle (the web server does not use it). |
| `job-memory.ts` | Keeps the jobs inside Render's 512 MB: read one studio at a time, ask only for the fields used. |
| `journey-step.ts` | Step 5 of the nightly job: each active client's state, and the Journey summary. |
| `machine-totals-read.ts` | How the jobs read a client's machine totals, by id, with the app's one merge rule. |
| `machine-fit-company.ts`, `machine-fit-rebuild.ts` | The weekly job's machine-fit reading half, and the maintenance rebuild of each studio's index. |
| `webhook-watch.ts` | Once a night, asks Mindbody whether Journey's webhook subscription is still on. |
| `time-zone.ts` | Studio-day helpers for the jobs, because Render runs cron schedules in UTC. |
