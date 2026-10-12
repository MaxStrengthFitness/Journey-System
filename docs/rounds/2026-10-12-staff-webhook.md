# The staff webhook (Oct 12 2026)

*Branch `oct12/staff-webhook`, on master `5a0bf7ea` (live). Ships with
`scripts/ship/ship-staff-webhook.ps1`. One Cloud Function changes
(`mindbodyWebhook`) and one index is added. The app, the server, the crons and
the rules are unchanged, so there is nothing to press on Render.*

## 1. What AJ said

The Oct 11-12 audit's fix 4 ("Staff webhook: match staff by site; booking
lookup by studio first") needed his OK and a restore point, because it is a
Cloud Functions change. His answer on Oct 12 2026: **"2 and 3 I will trust
your decision please be sure!"** The decision was to fix it now, on its own
branch, with a restore point, and for AJ to deploy it.

## What you will see

- **On the iPads: nothing.** Bookings show their trainers as before.
- **Admins -> Home and Admins -> Machinery -> Limbo**, now and then: a row
  with a **staff** badge. Its title says "Unknown Client" (Limbo names every
  row by its client, and a staff update has none); the sentence under it says
  whose staff number it is, why nothing was written, and what to do. Do that,
  then press **Dismiss**. "Assign studio" doesn't apply to a staff row: it
  stops with "This entry names no client".
- **A trainer who works at studios on both sites** (westlake and Solon, say),
  **or whose studios aren't linked to Mindbody**: their name, email and photo
  from Mindbody stop refreshing, unless Mindbody's update carries the name
  Journey has for them. The read-only check's list 3 names them before you
  press GO.

## 2. What was wrong

Mindbody numbers each site's staff separately. Journey has two sites today:
westlake, Strongsville and Willoughby share site 29068, and Solon is site
5746957. Staff number 100000012 on one site and 100000012 on the other can be
two different people, the same way client numbers collided 43 times on
Sep 23 2026.

The webhook has two places where it turns a Mindbody staff number into a
Journey trainer, and both looked the number up across the whole company:

1. **A staff update** (`staff.updated`, `staff.deactivated` and the rest).
   If exactly one trainer anywhere held the number, the update was written
   onto them: their name, work email and photo from Mindbody, "inactive in
   Mindbody", and the site the update came from. So an update about a Solon
   staff member could land on a westlake trainer with the same number. If two
   trainers held it, the update went to Limbo as "claimed by more than one
   trainer", even when they were on different sites and the right one was
   obvious.
2. **A booking.** The webhook asked for at most three trainers with the
   number company-wide, then kept the ones at the booking's studio. Once
   several trainers on other sites shared a number, the trainer at the
   booking's studio could be left out of those three, and the booking arrived
   with no trainer until the next pull (within 30 minutes) filled it in.

The site written onto the trainer matters beyond the profile: the Hub's
columns, the Calendar, the front door's "today" and Openings use it to decide
whether a booking's staff number is this trainer's at this studio.

**Does it happen today?** We don't know. A read-only check of production was
not allowed to run from Claude's side. Both sites numbered their clients from
the same starting point (that is why 43 client numbers collided on Sep 23),
and staff are probably numbered the same way, so it may well happen. The
change is built to be safe either way, and the ship script runs the read-only
check for AJ before anything goes live (section 6).

## 3. What changes

**A staff update is matched only to a trainer whose staff number is on the
update's site.** Journey doesn't record which site a trainer's number came
from (both places that link a trainer, Edit Trainer and My Studio's staff
editor, pick from one studio's Mindbody staff list and save only the number).
So Journey works it out from where the trainer works:

- the Mindbody sites of the studios they work at (home, also works at, owns);
- if that is **one** site, that is their staff number's site;
- if it is **none** (no studio linked to Mindbody) or **two or more** (a
  trainer who works at westlake and Solon could have been linked from either
  list), Journey **can't tell**;
- and if the last staff update Journey wrote onto them came from **another
  site** for the same number, Journey can't tell either. That memory is never
  used to match someone, only to hold back.

Then, for an update from site S:

| Who holds the number | What happens |
| --- | --- |
| One trainer on S | Written onto them, with S as their site |
| Two on S, or one on S and one who might be | Limbo: more than one trainer could hold it |
| Nobody known to be on S, one who might be (works at a studio on S, or their last update came from S) | Written onto them only if the update carries the **same name Journey has for them**; otherwise Limbo |
| Only trainers Journey can't place | Limbo: can't tell |
| Only trainers on other sites, or nobody | Limbo: nobody here holds it |
| S is a site no studio is linked to | Limbo, without even looking at the trainers |

Every Limbo row says why in plain words and what to do. For example: "No
trainer whose studio is on Mindbody site 5746957 carries staff id 100000012.
If this person works with us, link their Journey profile in Edit Trainer ->
Mindbody Staff ID; a webhook never creates a trainer account. A trainer at another site has the same number. Each site
numbers its own staff, so Journey can't tell it is the same person, and
nothing was written to them."

**A booking's trainer is looked up at the booking's studio.** The webhook now
asks only for trainers with the number whose home is the booking's studio, or
who also work there, with no limit (one number at one studio is a handful at
most). The decision is the same as before: exactly one trainer at the studio
is the trainer; none or two means no trainer, and the row keeps the trainer
the pull gave it if it is the same staff member. It can no longer miss the
studio's own trainer because of trainers elsewhere.

**Claimed placeholders are no one.** When a trainer claims their placeholder
profile, the old one stays behind, marked as merged, still holding the staff
number and the studios. The rest of the app already ignores it; the webhook
counted it and saw a duplicate. Now it ignores it too.

**One new index** (`trainers`: staff number, then "also works at"), so the
booking's "also works here" question never reads more than it returns. It is
deployed before the function; until it finishes building the question still
answers correctly. The index guard (`firestore-indexes.test.ts`) does not
hold this one in place: it counts a query as served by any index that leads
with one of its equality fields, and the existing (staff number, home studio)
index already does. Only the ship script's check (master's indexes plus
exactly one) holds it for this ship; don't remove it in a later round.

**The event's log is filed by the staff update's own site**, the one it was
matched on, so an update whose site is spelled `SiteId` is filed under its
studio too.

## 4. What is the same

- A webhook still only ever writes the trainer's Mindbody details (name,
  email, photo, active flag, site). Never their role, their studios, their
  access, or anything else. It never creates a trainer. "Deactivated in
  Mindbody" is still shown on their profile and never takes anyone's access
  away.
- An update with **no site on it** works exactly as before. Real Mindbody
  updates always carry one; only a hand-made test event could lack it.
- Bookings: which studio, the times, cancellations, moves, clients, parking
  and the "keep the row's trainer" rule are untouched.
- The pull every 30 minutes, the app, the server, the crons, the rules,
  Mindbody calls: unchanged. No Mindbody call is added; nothing contacts
  anyone.
- The Mindbody staff photos (`staffImage.ts`) already look a trainer's number
  up on their home studio's site. They are not deployed and are not changed.

## 5. What it doesn't fix (known limits)

1. **Journey still doesn't record which site a trainer's number came from.**
   The real cure is saving the site when a trainer is linked (Edit Trainer
   and the staff editor): an app and rules change for its own round.
2. **A trainer who works on both sites** gets their staff updates only when
   the update carries the name Journey has for them (spelling, accents and
   capitals aside). A deactivation carries no name, so it waits in Limbo.
3. **Bookings have no site check.** A trainer at home in westlake who also
   works at Solon can still be named on a Solon booking when a different
   Solon staff member holds the same number. The pull does the same thing
   every 30 minutes; changing only the webhook would be undone by it.
4. **A trainer whose home moved to the other site**, before any update was
   ever written onto them, is placed on the new home's site. An update from
   there with the same number would be written onto them. That was true
   before too.
5. **An update with no site keeps the old company-wide rule** (section 4).
6. **Wrong details written before this fix stay** until Mindbody next sends
   that trainer's own staff update with their name, which the new rule
   writes onto them. Relinking in Edit Trainer changes only the number, not
   the details already shown. The read-only check lists them (list 2).
7. **Rules gap, not part of this fix:** the rules don't stop a trainer
   setting their own Mindbody staff number on their own profile (the app no
   longer offers it, but the rules allow it). A rules round should protect
   `mindbodyStaffId` and `mindbodyLinked` like the other access fields.
8. **A trainer whose updates wait in Limbo** never gets their Mindbody site
   written, so the Hub and Openings can't use their staff number to place a
   booking that has no trainer on it. Bookings that carry a trainer, which is
   nearly all of them, are not affected.

## 6. The read-only check

`scripts/check-staff-sites.ts` reads the studios and the trainers once,
writes nothing and asks Mindbody nothing. It lists:

1. staff numbers more than one trainer holds, with the site Journey works out
   for each (holders on different sites are the case the old rule mixed up);
2. trainers whose Mindbody details came from another staff number or another
   site (possibly someone else's name or photo, written by the old rule);
3. trainers whose number's site Journey can't tell: from now on their staff
   updates wait in Limbo instead of being written.

`-Stage golive` runs it before asking for GO when it finds a service-account
key. Nothing on list 3 is a reason to stop: those trainers' details simply
stop refreshing until they have a home studio linked to Mindbody (Edit
Trainer). Any time:

```
npx tsx scripts/check-staff-sites.ts --key <path to service-account.json> --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
```

## 7. Tests and counts

- Functions tests: **323 passing, 1 skipped** (263 before). New:
  `staffSite.test.ts` (the rule, every Limbo sentence), the resolver's new
  lookups, and thirteen webhook cases (the same number on two sites, another
  site's deactivation, no site, a site no studio has, no studio, two on a
  site, a trainer on both sites with and without their name, linked from the
  other site's list, a moved home, no home studio but every studio on one
  site, a number stored as a number, the site
  field spellings, a claimed placeholder) plus five booking cases (four
  trainers sharing a number, the number stored as a number, a trainer who
  also works here, two at the studio, a claimed placeholder).
- Two existing staff tests now give their trainer a home studio. That is the
  change itself: a trainer with no studio linked to Mindbody is now "can't
  tell" instead of written.
- Functions typecheck clean; the app's typecheck still 2; the index guard
  passes with the new index.

## 8. Shipping, checking, rolling back

From the branch's folder, `.claude\worktrees\staff-webhook`:

```
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-staff-webhook.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-staff-webhook.ps1 -Stage golive
```

`prepare` changes nothing: the branch, a clean tree, that master's Cloud
Functions are the live ones, what the branch changes, line ends, the case
check, the indexes file, the functions typecheck and tests, the index guard
and the app's typecheck count. `golive` runs the read-only check, asks for
GO, then: the restore tag `restore/before-staff-webhook-<date>` on master as
it is, pushed; the new index; the push to master; and the one function,
`npx firebase deploy --only functions:mindbodyWebhook --project prod`. Never a
plain `--only functions`: that would also deploy the staff-photo functions,
which are not live.

**No Render step:** the app is unchanged, so the push carries nothing the
iPads run.

**After it is live (ten minutes):**
- Firebase console -> Functions -> `mindbodyWebhook` -> Logs: no errors on
  the next bookings.
- Admins -> Machinery -> Limbo: any new staff rows (titled "Unknown Client",
  with a staff badge) read as the sentences in section 3. Dismiss them once
  handled.
- Admins -> Machinery -> Mindbody sync: every studio healthy.
- The next booking the front desk makes or moves for a linked trainer shows
  their name on the Hub within a minute. Don't make a booking just to test:
  Mindbody may email the client.

**To roll back the function** (the index needs no undo, the data needs
none: nothing about what is stored changed), in PowerShell from the project
folder. The exact lines, with the date filled in, are printed at the end of
golive and kept in `logs\ship-staff-webhook.log` in the branch's folder; copy
them from there.

```
git fetch origin --tags
git worktree add ..\journey-restore-staff-webhook restore/before-staff-webhook-<date>
cmd /c mklink /J ..\journey-restore-staff-webhook\node_modules node_modules
cmd /c mklink /J ..\journey-restore-staff-webhook\functions\node_modules functions\node_modules
cd ..\journey-restore-staff-webhook
npx firebase deploy --only functions:mindbodyWebhook --project prod
```

(`npm ci` and `npm ci --prefix functions` in that folder do the same as the
two links, more slowly.) Limbo rows written meanwhile stay; dismiss them in
Admins -> Machinery -> Limbo. After a rollback, tell Claude: master still has
the fix, and the next functions deploy would put it back.
