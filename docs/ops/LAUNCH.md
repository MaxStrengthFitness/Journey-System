# Launch: westlake, Strongsville, Willoughby

*The plan (AJ, Oct 10 2026): November. The three corporate studios start;
Solon joins before Jan 1 2027; franchises from Jan 1 2027. **The date is head
office's** (AJ, Oct 14 2026, "Q6 = B": wait for their date, then count the
steps below back from it). The facts in the table were read from production on
Oct 10 2026, and the bold ones read again on Oct 14 2026 (the weekly 1-on-1's
audit), unchanged; re-read a line before acting on it if weeks have passed.
AJ's answers of Oct 14 2026 are in `docs/rounds/2026-10-14-weekly-1on1.md`.*

## Where each studio stands (as of Oct 10 2026, the bold lines as of Oct 14)

| | westlake | Strongsville | Willoughby | Solon (later) |
| --- | --- | --- | --- | --- |
| Machine floor in Journey | **none** | 21 machines | **none** | 20 machines |
| Renewals set up (My Studio → Studio → Renewals) | **no**: auto-renew on by default, no package table | yes: auto-renew off, 3 packages, 27 Mindbody names | **no**: as westlake | no |
| Sessions left known | 24 of 291 clients | 87 of 141 | 16 of 266 | 3 of 135 |
| Mindbody contracts synced | 286 of 291 (Oct 4) | 136 of 141 | 262 of 266 | 5 of 135 (not started) |
| A studio leader (Head Trainer or above) | **none** | **none** | **none** | none |
| Life Transformers signed in | 3 | 3 | **0** | 2 |
| Schedule last pulled from Mindbody | Oct 6 | Oct 10 | **Sep 10** | Oct 9 |
| Cutover date | **not set** | **not set** | **not set** | not set |

Mindbody's visit count (the "before Journey" guess trainers confirm) is there
for 291 of 291, 140 of 141 and 264 of 266. The Academy's eleven starting
routines are in (seeded Oct 10). Only the app's default studio settings apply
anywhere (no studio or head-office numbers are set). The test sessions were
wiped on Oct 12 2026 (the reset, run by AJ); five FileMaker trial clients have
been imported since, and stay until the mass import (AJ, Oct 13 2026).

## How the launch works (AJ's answers, Oct 14 2026)

- **FileMaker runs alongside, as the backup** (Q4): *"we want to have our
  FileMaker there as a backup until we are fully transitioned over and have
  all clients on there."* From a studio's cutover date Journey is where
  sessions are logged (an unlogged booking reads "not logged"); FileMaker stays
  open, and a trainer may enter a session in Journey and then in FileMaker
  after *"if it absolutely is necessary"*. What is typed into FileMaker after a
  cutover is a backup and is **never imported**.
- **Each studio's FileMaker history is imported the night before its
  cutover** (Q4 follow-up, A). `scripts/import-filemaker.ts` refuses a client
  who already has Journey sessions of their own, so the history has to be in
  before that studio's first real session. Its production writes are switched
  off today (`PRODUCTION_IMPORT_READY`) except `--trial` (at most five clients
  a run); the switch is AJ's go, once the steps below are done.
- **AJ lets each studio's trainers in at its launch** (Q3 = B): *"We honestly
  don't have an insane amount of trainers, so I don't mind just doing it
  myself. When we start launching the studios."* No studio needs a leader in
  Journey first. Until a studio has one, only administrators see its
  Operations and change its settings.

## Before launch, in order

### Now: the things that take days or other people

1. **The floors at westlake and Willoughby** (AJ: "they are the oldest studios
   so their machines are very different and they have a lot more"). Built from
   FileMaker's machine list by `scripts/build-floors-from-filemaker.ts` (on
   master since Oct 13 2026; `src/features/filemaker-floors/README.md`). It is
   a dry run by default; the write is AJ's:
   `npx tsx scripts/build-floors-from-filemaker.ts --confirm-project gen-lang-client-0731527386 --dials filemaker --commit`
   (AJ, Oct 12 2026: FileMaker's letters, "ill do the dirty work and clean them
   up"). Willoughby's Lumbar setting "Ft" is not confirmed. Until the floors
   are written a session there shows the whole MSF catalog.
2. **The full FileMaker export, per studio**: every client, with the client's
   Mindbody id and the trainer on every line, so each visit is filed under the
   trainer who ran it. Strongsville's trial exports had machine names rotated
   for clients charted before late 2024, and its trial imports wait for the
   full export (AJ, Oct 14 2026).
3. **The settings audit, per studio** (AJ, Oct 13 2026: *"ill have to audit
   all the machine settings before mass import, they are such a mess in
   filemaker"*): one name for each of a machine's settings, before the import
   and before trainers save settings there. A client's settings are kept under
   the dial's name, so renaming a dial afterwards hides what was saved under
   the old one.
4. **Renewals at westlake and Willoughby**: My Studio → Studio → Renewals.
   Auto-renewal **off** (corporate studios don't auto-renew; the app's default
   is on), the package table, then confirm the Mindbody package names it
   suggests. Without it, sessions left can't be worked out for most clients.
5. **Open the Hub at Willoughby once.** Its schedule hasn't been pulled from
   Mindbody since Sep 10; the pull runs from an open iPad or browser, and the
   webhook alone has been keeping it partly fresh.
6. **Mindbody: add the two missing webhook events** (`appointmentBooking.updated`,
   `clientSale.created`). The live subscription was made on Sep 24, before
   they were added, so a changed appointment waits for the next pull and a
   sale never marks a client for the nightly package pull. One command, no new
   secret: `node scripts/mindbody/register-webhook.js --update-events
   6ffaebd1-2086-41ad-a999-d3edf8ab481f --yes-affect-production` (run it once
   without the last flag first to see what it would add).
7. **Limbo**: 16 open items (Admins → Machinery → Limbo). 12 are shared-site
   clients whose event named no studio; 4 at Solon wait for Mindbody staff
   100000020 to be linked to a trainer.
8. **One unused index** costs a little on every task write:
   `taskInstances (status, localDate)`. Delete it in the Firebase console →
   Firestore → the named database → Indexes.
9. **Outlook (Microsoft) sign-in**: Max Strength's IT admin made the app
   registration single-tenant and granted its permissions (Oct 20 2026), and
   the web service has `VITE_MICROSOFT_TENANT_ID` since build 0934c64 (Oct 20,
   9:02 ET). Left: a first sign-in on an iPad with an @maxstrengthfitness.com
   account, and the IT admin's answers on who has no such account (before
   Google sign-in is turned off) and on Conditional Access for the studio
   iPads. Strangers out (privacy Round 0) leaves sign-in untouched.
10. ~~**Strangers out**~~: live since Oct 15 2026 (10:09 ET): an account that
   signs in but was never let in reads nothing
   (`docs/rounds/2026-10-14-strangers-out.md`). Left: the check its log prints,
   as a Life Transformer at a live studio and as a Google account never let in.

### When head office sets the date

- **Set the target and count back.** Each step below is dated from it.

### Two weeks out

- The iPad walk, with one Wi-Fi drop in the middle of a set (AJ, Oct 14 2026:
  one this week anyway, "Q5 = A").
- The last deploy before launch (`docs/ops/DEPLOYS-AND-ROLLBACK.md`).
- Trainers propose their usual week on My Profile; a leader agrees it (this
  can follow launch).

### Five days out

- **Fresh contracts.** The nightly job pulls nothing for a studio until its
  cutover date, so by November the Oct 4 sync is a month old.
  `npx tsx scripts/onboard-studio.ts --studio westlake,strongsville,willoughby --verify`,
  then one `--commit` evening for whoever it lists.
- **The nightly job's Mindbody budgets** on Render (`journey-cron-renewals` →
  Environment): `RENEWALS_MAX_PULLS` and `FIRST_SYNC_MAX`, both 0 as created on
  Oct 5 ("raise it when the first studio goes live - AJ's call", `render.yaml`).
  At 0 the job pulls nothing even after the cutover, so packages go stale.
  About 100 pulls is at most $0.40 a night; the first-booking sync is 5 calls
  ($0.01) a new client. Raise them the day before the cutover.

### Two days out

- **The reset**: `docs/ops/RESET-BEFORE-LAUNCH.md`. It ran once already, on
  Oct 12 2026; run it again here for every session typed since. It keeps
  sessions imported from FileMaker unless told `--also imported-history` (AJ,
  Oct 13 2026, of the trial clients: *"its fine if we clear everything before
  the mass import"*), and it must run **before** the import, never after: after
  an import it would zero the imported clients' counts. Every iPad online,
  synced, no session open; dry run, then commit, then the three follow-up jobs;
  sign every iPad out after. From here on, practise only in Demo Mode. It backs
  up everything first, can put it all back, commits only with `--expect` set to
  its dry run's count, and refuses once a cutover date is set (unless told
  `--after-cutover`).

### The day before (and that night)

- **Set each studio's cutover date to launch day** (My Studio → Studio →
  Details). From that day every session must be logged in Journey (an unlogged
  booking shows as "not logged"), and the nightly job starts refreshing that
  studio's packages from Mindbody.
- **That night, the studio's FileMaker import** (AJ's go switches it on):
  `scripts/import-filemaker.ts`, a dry run, then `--commit --expect N`, with
  the full export and the studio's finished machine table
  (`src/features/filemaker-import/README.md`). With the cutover date set, it
  imports through the day before it; those days after are Journey's.
- **AJ lets the studio's trainers in**: each signs in once and asks for the
  studio, then AJ approves the "Waiting for approval" rows on My Studio → Team
  (with that studio picked) or Operations → Setup → People & access.

### Launch day

- Trainers: `docs/ops/TRAINER-QUICK-START.md`.
- FileMaker stays open as the backup; nothing typed there from today is
  imported.

## Before Jan 1 2027

- **Solon**: its contracts sync (about a week of nightly runs), its renewals
  setup, its full export and settings audit, then its own five-days-out to the
  night before.
- ~~**The franchise partition** in the rules~~: built Oct 10 2026, live (the
  app Oct 11, the rules with the Oct 12 release). When the first franchisee
  joins, an administrator marks the studios they own: Admins → Studios → the
  studio → Team → their row → Studios → **Owns {studio}**. Before then, ask
  head office whether each franchise has its own Mindbody account (Q17,
  `docs/rounds/2026-10-14-weekly-1on1.md`).
- **The rest of the privacy lock** (Rounds 1 to 4, after strangers out), each
  checked against AJ's *"I just don't want to be restrictive"*.
- **CI as a required check** on `master` (needs the repo owner). The repo is
  still public; it can go private only together with installing Render's
  GitHub app, or deploys stop.

## Settled on Oct 10 2026

- **Mindbody's webhook secret is not exposed.** The secret readable in the
  public repo's history belongs to the August subscriptions, all deactivated;
  the live one (made Sep 24) has its own, which only Firebase holds, and every
  delivery since has verified. The API key and login in use differ from the
  history's too.
- **No tax in the corporate studios' charges** ($432 = 8 × $54), so the rate
  reads right; Solon's one synced contract looks like $4,560 plus 8%, to check
  when Solon syncs.
- **"w/ Roll Over" options hold the whole package up front** (48, 96 or 144),
  with a companion "…Payments" option holding 0; the renewals engine already
  counts that.
- **Microsoft sign-in is held to @maxstrengthfitness.com** by the app; Google
  sign-ins wait for a person to let them in.

## Answered on Oct 14 2026

1. ~~**On launch day, does FileMaker stop, or run alongside for a while?**~~
   Alongside, as the backup, with each studio's history imported the night
   before its cutover (above).
2. ~~**Who leads each studio in Journey?**~~ Nobody needed first: AJ lets the
   trainers in at each launch.
3. ~~**A target launch week?**~~ Head office's date; the steps count back from
   it.

## Still yours to answer

1. **The reset: keep or wipe what was typed on real clients while testing?**
   On Oct 10: 44 routines (and 20 adjustments), the weights on 79 machine
   set-ups, 23 Pulse reports. The Oct 12 run took the set-ups and the setting
   history too (`--also settings-all,setting-history`) and kept routines and
   Pulse. Each is its own choice at run time (`--also routines,settings,pulse`);
   by default all of it stays and only the sessions and what was counted from
   them go.
