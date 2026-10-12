# The Mindbody savings round (Oct 12 2026)

Branch `oct12/mindbody-savings` over master `499fd656`. Three phases, one commit each. Ships with `scripts/ship/ship-mindbody-savings.ps1`.

## The brief

AJ, Oct 12 2026: *"We need to attempt to make our Mindbody costs as low as possible without sacrificing data and information."* He chose all three phases ("Build 1–3 now").

## Why, in numbers

Mindbody bills **$0.002 for every call, from the first one** (`docs/business/running-costs.md`, R29, read from the developer account on Oct 5 2026). The last full invoice cycle (Aug 24 – Sep 23, before the cost plan shipped) was **6,779 calls, $13.56**: Solon 1,191, and site 29068 (Westlake, Strongsville and Willoughby) 5,588. AJ re-sent the Activity by Studio report on Oct 12, and it shows that same cycle. **The first cycle after the cost plan (Sep 24 – Oct 23) is the "before" for this round**, and it is not out yet.

At 70 studios Mindbody becomes the largest line of the bill (about $350–450 a month on the Oct 5 model). After the cost plan, a studio makes about 55–60 calls an open day. About half are the 30-minute background check of today and tomorrow, and about a third are Refresh presses.

## What was built

| # | Phase | What it does | Saves |
| --- | --- | --- | --- |
| 1 | **One read of a site, shared** (`src/lib/mindbody-appointment-cache.ts`, `server.ts`) | The schedule proxy keeps each **whole** Mindbody answer for a site for **two minutes**. Any request whose days lie inside it is answered from it, narrowed to those days. Two requests for the same window at the same moment share one read. | Every Refresh press within two minutes of another pull of the same site, and every sibling studio's pull (with phase 2) |
| 2 | **Every studio on a site pulls at the same slot** (`syncPolicy.ts`: `siteSlotOffsetMs`, `nextSlotDue`) | A healthy background pull is due at the next **slot of its Mindbody site** (the half-hours, shifted by an offset taken from the site id) instead of 30 minutes after its own last pull. Studios on one site land within a minute of each other, so phase 1 answers all of them from one read. Different sites get different minutes, so 70 studios do not all call at :00 and :30. | On site 29068, about 60 of its ~90 background calls a day (three studios become one read per slot) |
| 3 | **Count what the 30-minute check finds** (`features/admin/mindbody/near-checks.ts`) | Each background check of today and tomorrow that Mindbody answered in full adds three numbers to `studios/{s}/sync/near-YYYY-MM-DD`: checks, finds (it changed something) and rows (how many bookings). Operations → Mindbody says the last 14 days in one sentence. | Nothing yet. It is the evidence needed before the 30-minute check could ever be slowed (about half of what is left). That decision stays AJ's |

### Why nothing is lost

- **Only a whole answer is shared.** If any page was missing, the answer is never kept, so it can never stand in for a complete one. This is the Aug 30 rule: a failed read means unknown, never empty.
- **Two minutes is well inside AJ's freshness for today** (about 30 minutes, the cost plan). The webhook still delivers changes in seconds, straight to Firestore.
- **An older answer never undoes a newer write.** The proxy now says when Mindbody was read (`fetchedAt`). The sync does not overwrite or cancel a booking that the webhook or another iPad wrote after that moment (`rowIsNewerThanAnswer`: the webhook's event time, with a minute's margin, or the row's last write). It leaves the booking for the next pull. This also closes a race that existed before this round, between a pull in flight and the webhook writing the same booking.
- **Operations → Mindbody → "Pull the schedule now" always asks Mindbody itself** (`fresh: true`). A person checking Mindbody gets Mindbody.
- **A trainer-filtered read is never shared.**
- **The slots keep a pull at least every interval,** with one exception. Once a day, a pull that landed under five minutes before a slot skips that slot instead of pulling twice in a row, so that one gap can be up to five minutes longer.
- **A failing pull keeps its old backoff** from its own last attempt.

### Not done, and why

- **Slowing the 30-minute check.** It is about half of what is left, and AJ's freshness rule is about 30 minutes. Phase 3 measures whether it still finds anything. A find can also be cosmetic (a client name the pull spells differently), so read the rows count with it.
- **The morning month pull of each studio on a shared site.** Each studio's first pull of the day happens when its first iPad opens, so the three are hours apart. Sharing them would mean serving today's bookings from an answer hours old. Not worth it.
- **Pulling the site from the server instead of the iPads.** The web service has no Firestore key, and an iPad at Westlake may not write Strongsville's bookings (the rules). Phases 1 and 2 get the same saving without either change.
- **Asking Mindbody to filter by location** (`scripts/probe-mindbody-location-filter.ts`). It has never been run. It would shrink a shared site's month pull from about 8 pages to about 3. Run it once; it is read-only and costs two calls.

## What changes where

- **Web service (Render):** `server.ts`. The schedule route shares reads and sends `fetchedAt`. Nothing else on the server changed, and no cron changed.
- **The app:** the background pull's slots, the sync's guard, and the count with its sentence on Operations → Mindbody.
- **Rules:** `studios/{s}/sync/{docId}` also takes `near-YYYY-MM-DD`, with three numbers only, written from an iPad at the studio (`docs/ops/RULES-NOTES.md#studios-studioid-sync-near-day`). This only adds access.
- **No Cloud Function, index, data migration or Mindbody subscription change.** Nothing contacts anyone.

## How to tell it is working (after the deploy)

1. **Render → the web service → Logs, search `staff-appointments`.** A line ending `shared read (40s old, no Mindbody call)` or `joined a read in flight (no Mindbody call)` is a call saved. Around :25 and :55 past the hour, site 29068 should show one `page(s)` line and two shared ones.
2. **Operations → Mindbody**, after a day or two: "Last 14 days: N background checks of today and tomorrow…".
3. **The next Mindbody invoice** (developers.mindbodyonline.com → Reports → Activity by Studio). Compare site 29068's calls a day with Solon's. Before this round, 29068 made about 4.7 times as many calls as Solon.

## Verified

| | |
| --- | --- |
| Typecheck | 2, the baseline (the cloud copy shows 5; the extra three are only the missing `firebase-applet-config.json`, which is not in git) |
| New tests | `mindbody-appointment-cache.test.ts` (26), `syncPolicy.slots.test.ts` (13), `near-checks.test.ts` (15), five new cases in `mindbody-api-sync.test.ts`, one new rules test |
| `src/features/admin` + `src/lib` | 2,818 passing in 196 files |
| Full suite | **14,708 passing (1 skipped) in 884 files**, `TZ=America/New_York npx vitest run src --testTimeout=30000` |
| Build | `vite build` clean; first screen 469.6 KB gzip (budget 480); the server and cron bundles build |
| Rules tests | **not run in the cloud this time**: the proxy refused the emulator's download. The ship script runs `npm run test:rules` on AJ's PC before anything deploys, and that run is the one that counts |

## Changed from the cadence test

`useAutoSync.schedule.render.test.tsx` pinned the old cadence (5, 35, 65, 95 minutes after a claim 25 minutes earlier). That cadence changed on purpose: the pulls now land on site 29068's slots at :25 and :55. The test now starts two minutes after a claim and expects 25, 55, 85 and 115. It still pins that the hook looks every minute, re-renders only on a new verdict, and never pulls while hidden.
