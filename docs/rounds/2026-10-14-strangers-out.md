# Strangers out: Round 0 of the privacy lock (Oct 14 2026)

*Branch `privacy/0-strangers-out`, on master `aa846261`. Rules only, plus one
read-only audit script: no app change, no index, no Cloud Function deploy, no
Mindbody call, no data written, nothing contacts anyone. Ships with
`scripts/ship/ship-privacy-0.ps1` (prepare, golive). There is no Render step:
the app on the iPads doesn't change.*

The design is the privacy lock's (written Oct 12 on master `5a0bf7ea`, read
only; its Round 0 is §A.0, §B.0, §B.5 items 0 and 12, §C, §D and §E). Master
moved after it, so every rule here was re-derived from the current
`firestore.rules`; §6 says where the design no longer matched.

## 1. What AJ said

AJ, Oct 14 2026, when he said yes:

> "I think we should go ahead and do that. ... Let's make sure that
> everything's strict and safe right now. I'm concerned about maybe
> something breaking, but I trust you."

His conditions:

- **"I don't want it to affect our app."** Sign-in is untouched. People sign
  in with Google today; Outlook (Microsoft) sign-in with an
  @maxstrengthfitness.com address waits on the company's IT admin approving
  logins, and keeps working once he does. Nothing changes for anyone who has
  been let in (has a trainer record).
- **"I don't really want Strongsville, Willoughby, and Westlake to share
  everything. I just don't want to be restrictive."** So Round 0 changes no
  access between studios for anyone with a trainer record. It only removes
  reads for a signed-in account that has none.

## 2. What it closes

Anyone can sign in to Journey with a Google account; the access screens then
ask them to request a studio. Until this round that account, never let in,
could still read every client's notes (Health, medication and diagnosis
included), Pulse, sets, routines and bookings, and every studio's tasks,
asks and machine care, straight from Firestore. Three more doors are shut
with it:

1. **Strangers out.** 24 reads go from "any signed-in account"
   (`isAuthenticated()`) to "anyone let in" (`isLetIn()`: a trainer record at
   `trainers/{your sign-in uid}`, or an administrator's role claim). One
   document a request, the one every write rule already reads; no query
   changes, so no screen changes.
2. **The dead and write-open collections**, which nothing in the app reads or
   writes, are closed (table in §3).
3. **Honest sessions.** A session is readable by whoever works at its host
   and whoever can read its client, and until now anyone who could update a
   session could rewrite both: re-hosting one at `demo-studio`, where every
   trainer works, handed it to every trainer in the company. Now the host and
   client stay put (§4).
4. **No real client approved at Demo Mode**, and **no `studioId` token
   claim**. An approval of `demo-studio` would hand a real client to every
   trainer; it is never added, by anyone. And the rules honoured a `studioId`
   token claim as studio-leader access with no role check and no record.
   Nothing ever set one (`functions/src/claims-logic.ts` mirrors `role` only
   and strips a stray `studioId`); the two clauses are gone.

## 3. The collections

**Locked to anyone let in** (was any signed-in account):

| What | Where it is read |
| --- | --- |
| `clientMachineSettings` | the session, the profile, Setup |
| `machines/{m}/settingHistory` | the machine menu's change history |
| `machineSettingChanges` | legacy, read by the merge |
| `routines`, `routines/{id}/planChanges` | Programming, the plan, the briefing |
| `routineAdjustments` | the profile's Changes |
| `exerciseLogs` | every set |
| `schedules` | the Hub, the Calendar, Openings, renewals |
| `sessionNotes`, `trainerFocuses`, `focusRecords`, `clinicalIncidents` | the journal's legacy listeners, Operations |
| `progressReports` | Pulse and progress reports |
| `journalEntries` | notes, Health, Critical |
| `clientFocuses` | the 4 P's |
| `trainers/{id}/stats` | My Profile's counters |
| `studios/{s}/sync` (the lease and `near-YYYY-MM-DD`) | the 30-minute pull, Operations → Mindbody |
| `studios/{s}/machineCare`, `upkeepLog` | Relay's care sheet, Operations |
| `studios/{s}/taskTemplates`, `taskInstances`, `taskRequests` and their `replies`, `taskCategories` | Relay's Board and Tracker |

`machineTrends` (added since the design wrote its list): one machine's
document for anyone let in (every reader is a `getDoc`,
`equipment/useMachineTrend.ts:31`), the whole list for administrators.

**Left open until Round 4a**, because the access screens, or what a stranger
mounts, read them before anyone is let in: `trainers` (your own record and
the email lookup a claim needs), `studios` (the request names one), and
`machines`, `machines/*/changes`, `machineModels`, `routinePresets`,
`system/*`, `hub_announcements`, `networks`, and the shared lists of the
catalog family (`{path=**}/roster`, `playbook`, `wiki`, `floorNotes` where
`shared == true`), which are shared with every MSF studio by an
administrator's decision and never carry a client.

**One of those does carry clients (the branch review): `trainers`.** Each
trainer record holds its Kaizen Roster (`kaizenRoster`: a client's id and
name, a reason and a note of up to 240 characters, `types.ts`), and until
Round 4a any signed-in account can list every trainer record. Round 0 can't
close it alone: the sign-in's own lookup reads `trainers` by email before
anyone is let in, so the read has to become "your own record, your email's
record, or anyone let in", which is Round 4a's first rule and wants the
Microsoft answer (§7) first. It is the first question for AJ (the report).

Checked and already closed to strangers (each needs a record or the
caller's own uid): `sessions`, `clients` and their `inbodyScans`,
`sharedNotes` and `machineTotals`, FORD, every studio-scoped path
(`writesForStudio`, `wave2WorksHere`, `renewalsReadable`; with the claim door
gone none of them answers without a record), `bookingMarks`, `cases`,
`inactiveMarks`, `floorPlans`, `scheduleCoverage`, `openingsMarks`,
`sessions/{id}/finish/once`, `dayLogs`, notifications, `access_requests`.

**The dead and write-open collections** (no reader or writer in `src/`,
`server/` or `functions/src` but where said):

| Collection | Was | Now |
| --- | --- | --- |
| `clients/{id}/crossTrainAccess` | read by any account; written by a studio's leaders | administrators only (the Admin SDK scripts that sweep it are unaffected) |
| `crossTrainRequests` | created and read by any account | administrators only |
| `aggregations`, `leaderboards` | read by any account | administrators only (`leaderboards` may key by client id; only the reset script, Admin SDK, touches it) |
| `auditLogs` | created by any account | no app write (administrators read, update and delete) |
| `notificationQueue` | created by any account | no app write (the server's crons write it through the Admin SDK) |
| `clinicalIncidents` writes | any trainer, any document | administrators only (no writer exists; the merge's repoint finds none) |

**Not changed, noted for later rounds** (each is a write, not a read, and the
design puts it later): a stranger can still create a `mindbodyLimbo` row
(Round 3 gives it the pull-sync's shape), a day log at any studio's path
(Round 3), an "I've read it" on a notice (`hub_announcements/{id}/acks`,
Round 4 with the notices), a bug report (on purpose: the error door), and
their own `users/{uid}`.

## 4. Honest sessions: every write the app makes to a session

`sessionTenancyKept`, on every session update. One diff when neither field
moves; otherwise:

- **The host** stays. A session with none (`null` or `''`) may be given one
  once: its own client's home, which is what Finish writes
  (`hostedAtStudioId: currentSession.hostedAtStudioId || homeStudioId`) and
  adds no reader the client didn't already have, and nothing else.
- **The client** stays, or changes to a client on record that the caller can
  read, never across the Demo Mode line (a real session never names a Demo
  client, a Demo session never names a real one): named once on an open
  session (before the write `isUnassigned` and no client), or moved by the
  provisional merge from a client the caller can also read.

The delete rule is unchanged: it decides from the stored document, which the
update rule now keeps honest.

Every app write to `sessions/{id}` on master `aa846261`, with the rules test
that holds it (`tests/firestore.rules.test.ts`, "privacy Round 0: honest
sessions" unless named otherwise):

| Write | Where | Moves host or client? | Test |
| --- | --- | --- | --- |
| Start (create, with its seeds) | `components/WorkoutTrackerView.tsx:2531`, `:2642` | create (rule unchanged) | "Start, Open session and Log past session create as before"; "speed round (live session)" |
| Open session (create) | `hooks/useClientMutations.ts:146`, `:168` | create | same |
| Log past session (create) | `features/client-history/LogPastSessionDialog.tsx:276` | create | same |
| Paper chart import (create) | `features/admin/import/LegacyChartImporter.tsx:405` | create | (create rule unchanged) |
| Pause and resume | `WorkoutTrackerView.tsx:776` | no | "pause and resume" |
| Resume a left-open session (a colleague's: a take-over) | `WorkoutTrackerView.tsx:950` | no (trainer only) | "resume a colleague's left-open session, and take over a watched one" |
| Take over a watched session | `WorkoutTrackerView.tsx:999` | no | same |
| Continue on this iPad | `WorkoutTrackerView.tsx:1039` | no | "continue on this iPad, the heartbeat, and the session's own list" |
| The session's machine list | `WorkoutTrackerView.tsx:1540` | no | same |
| Resume a left-open open session | `WorkoutTrackerView.tsx:1760` | no | "resume a colleague's left-open OPEN session, and keep a set-up on it" |
| Start's follow-up (routine, list) | `WorkoutTrackerView.tsx:2868` | no | "Start's follow-up" |
| Who's this? (assign, held set-up cleared) | `WorkoutTrackerView.tsx:3077` (`open-session/assign.ts` `assignSessionPatch`) | client named once | "Who's this? ... a visitor approved here included"; "open session: Who's this? ..." (all twelve, the twenty-set batch) |
| Keep a held set-up | `features/open-session/held-store.ts:37` | no | "open session: ... keep a set-up" |
| At End Session / back | `WorkoutTrackerView.tsx:3386`, `:3404` | no | "At End Session and back again" |
| Heartbeat | `WorkoutTrackerView.tsx:4424` | no | "continue on this iPad, the heartbeat ..." |
| Finish (the session batch, the marker) | `lib/sync-utils.ts:339`, `:383`/`:388`, from `WorkoutTrackerView.tsx:3579` | no, or the host filled with the client's home; the client named on an open session | "Finish, then the Wrap-up's effort Dial"; "Finish of a session with no host ..."; "a finish is counted once" B1, B2; "a cross-train visitor's session" |
| Finish after a refused Who's this? | `lib/sync-utils.ts` (`isUnassigned = false`) | client named once | "a Finish that lands after a refused Who's this?" |
| Finish it as it was | `WorkoutTrackerView.tsx:1196` | no (its own trainer) | "Finish it as it was" |
| Wrap-up effort Dial | `WorkoutTrackerView.tsx:3844` | no | "Finish, then the Wrap-up's effort Dial" |
| Discard (in session) | `WorkoutTrackerView.tsx:3285` | delete | "Discard" |
| Discard a left-open session ("Anyone can clear a session", Oct 12) | `features/session-record/discard.ts:211`, from `components/ClientProfileView.tsx:448` | delete | "Discard"; the sessions round's #24 |
| History edit | `features/client-history/SessionDetailDialog.tsx:437` | no | "History: edit ... and delete one"; "the sessions update asks the same people, resolved once" |
| History delete | `SessionDetailDialog.tsx:481` | delete | same |
| The provisional merge | `features/admin/provisional/mergeClient.ts:68` (`repointField`), from `ReconcileDialog.tsx:87` | client moved | "the provisional merge" (30 sessions in one batch); "an administrator merges across studios" |
| Demo Mode's set-up and reset | `features/demo-mode/seed-write.ts:122` (`batch.set`, an update on a reset) | no | "Demo Mode's reset writes its own sessions over again" |

Through the Admin SDK, outside the rules: `functions/src/trainerRollups.ts:231`
(`rollupCounted`, `rollupTrainerId`), and the scripts that import, repoint,
merge or reset sessions (`import-filemaker`, `merge-duplicate-client-records`,
`migrate-canonical-client-ids`, `migrate-machine-id`, `reset-test-data`).

**Refused now** (each a test): re-hosting a session at Demo Mode or another
studio by an update (an administrator too); giving a host-less session any
studio but its client's home; naming a client the caller can't read on an
open session; a Demo client on a real session, a real client on a Demo one;
re-pointing a session at an unreadable or Demo client; taking a session's
client off it.

**Not closed here (the branch review): a delete, then a create.** The create
rule is unchanged, and it accepts any host the caller works at, Demo Mode
included, naming any client. So someone who may delete a session can write
it again under the same id hosted at `demo-studio`, and every trainer then
reads what it says (what that person could already read and copy). The
create is Round 2's, because pinning Demo Mode on create needs the Demo
seeder to write its clients before their sessions first (design §B.2 row
22; today the clients come after, in later batches).

**A merge that reaches `clinicalIncidents`** (the branch review): the
provisional merge also repoints legacy incidents, whose writes are now
administrators' only, so a leader's merge would stop at that step if a
legacy incident named the temporary client. Nothing has written one since
the journal replaced them, and the merge already stops a step earlier, at
`exerciseLogs` (its update never lets a set's client change), for any
temporary client with sets; Round 1 rebuilds the merge with its precheck.

**The budget.** The new clause, added to the old "who may update" test, took
a History edit by a trainer at the client's home, on a session hosted at
another studio, past the 1,000-expression limit when the token carries no
role claim (the emulator's worst case; production trainers carry one). The
update's "who" test now asks `sessionIsReadable(resource.data, getRole(),
callerTrainer())`, the read rule's resolve-once helper: the same people
(administrators; the session's trainer; anyone working at or leading its
host; anyone who can read its client), at about two thirds of the cost.
Measured with the emulator's coverage report, per request: that History edit
1,656 on master and 1,108 now; a heartbeat 1,111 and 925; a guest's take-over
1,370 and 957; Who's this? 1,111 and 1,155; the merge 1,262 and 1,268. Two
edits on the client branch (a trainer at an approved studio editing the
client's session hosted at her home) ran out on master with no role claim and
pass with one; they now pass either way, which the sessions round's test #24
records. That is the rule as written and as production already answers it,
not new access.

**The trainer is not pinned here.** A finished session's trainer was pinned
on Oct 12 (`finishedHolderKept`), and a running one changes hands by a
take-over. Pinning a running session's trainer to "unchanged or the caller"
would also catch the emergency administrator view and is left for Round 2,
with the sessions create.

## 5. What a stranger's screens read

Signed in with no trainer record, the app mounts only the front door
(`App.tsx`, `AppContent.tsx` up to its early returns at `:1227`, `:1242`,
`:1245`, `:1256`): `LoginScreen`, `CheckingIn`, `CantCheck` and
`AccessRequestView`, inside `ToastProvider`, `ActiveStudioProvider` and
`UnsavedChangesProvider` (none of which reads Firestore). Every data hook
`AppContent` mounts before those returns is gated on `isDataReady =
!!authTrainer` (`AppContent.tsx:623`: `useTrainers`, `useStudios`,
`useNetworks`, `useMachines`, `useLiveSchedule`, `useStudioRoster`,
`useSessions`, `useAutoSync` and its lease); `useMachineTotals` waits for a
client, and the Studio picker (`StudioSelectionView`, with `useTodayGlance`'s
schedules read) is reached only with a record. Its reads, all still open:

| Read | Where |
| --- | --- |
| `trainers/{uid}` (cache, then server) | `hooks/useAuthInitialization.ts:353`, `:382` |
| `trainers where email ==` (the claim) | `useAuthInitialization.ts:389-394` |
| `studios` (the request names one) | `useAuthInitialization.ts:539` (`bootRead`) |
| `access_requests/{uid}` (read and send) | `features/front-door/my-request.ts:56`, `:75` |
| `trainers/{uid}` and the placeholder (a claim's two writes) | `useAuthInitialization.ts:434`, `:447` |

A rules test ("leaves the stranger every read the access screens make")
holds the four reads.

## 6. Where the design no longer matched master

- **Line numbers**: every one in the design is stale; the list was taken
  again from the current file.
- **New since the design**: `studios/{s}/sync/near-*` (the Mindbody savings
  round) is inside `sync`, locked with it; `floorPlans`, `bookingMarks`,
  `sessions/{id}/finish/once` were already scoped; `machineTrends` was the
  design's too.
- **The host fill** is the client's home only: the design also let a caller
  give a host-less session their own studio, which no app path does and
  which the branch review found would hand a guest's session to the guest's
  home team. Who's this? hands `assignSessionPatch` the session's host or
  the iPad's studio (`WorkoutTrackerView.tsx` ~2961), but only to work out
  `isCrossTrain`: the patch never writes the host. Open session always
  writes the iPad's studio (it refuses without one, `useClientMutations.ts`
  :140), and Start's host is the iPad's studio or the trainer's home, which
  every trainer record has. `src/features/privacy/session-writes.test.ts`
  holds the first two, and a rules test runs Who's this? and Finish on a
  host-less open session naming a visitor homed elsewhere: both pass, the
  host untouched and then filled with the client's home.
- **The trainer clause** of the design's `sessionTenancyKept` is redundant
  since `finishedHolderKept` (Oct 12), and is left out (§4).
- **The merge** is "the caller can read both clients", not the design's
  "leads both homes": a leader merging a temporary client into a visitor
  approved at their studio (the survivor list is the studio's roster) passes
  today, and AJ's condition is that nothing changes for anyone let in. Round
  1 narrows it with the merge's own precheck in the app.
- **Naming a client** on an open session needs a client the caller can read
  (the design's), with the Demo line both ways (the design checked only a
  Demo host).
- **The budget**: the design's clause on the old update test didn't fit; the
  update rule resolves the caller once (§4).
- **Approvals at Demo Mode** check only what is added, so a client who
  already holds one (audit item 12 says none) can still have it removed.
- **`isLetIn()`** is `hasAnyTrainerProfile() || isSuperAdmin()`, so an
  administrator's claim with no record still reads (the design had the
  record alone).

## 7. Microsoft sign-in

Round 0 makes the trainer record the door, and a stranger's one way to a
record is claiming a placeholder whose email matches theirs
(`selfCreateIsAClaim`), which trusts the token's email without
`email_verified` (on purpose: Microsoft accounts often come without it, and
requiring it would block the Outlook sign-in AJ is waiting on; nothing here
adds it). That is safe while only company accounts can sign in with
Microsoft. The app's own comment says so (`AppContent.tsx:1199-1201`: "The
single-tenant Azure app already blocks outsiders"), and the app also checks
the address (`isCompanyMicrosoftEmail`), but that check runs in the browser.
`render.yaml` notes the web service sets no `VITE_MICROSOFT_TENANT_ID`, so
the browser asks Microsoft's `/common` endpoint; whether an outsider gets
through then depends on the Azure registration's "supported account types".
**The ship script's prepare asks AJ to type YES** that the registration is
single-tenant, or that Microsoft sign-in isn't switched on yet.

## 8. The audit (phase 0)

`scripts/privacy-audit.ts` (read only, the service account, field masks; the
pure half is `src/features/privacy/audit.ts`, with its tests) counts:

- **Item 0**: every Firebase sign-in account (`listUsers`), followed the
  way `useAuthInitialization` signs a person in: no email at all (its own or
  a provider's) is the access request; `trainers/{uid}` first; else the
  records whose stored email equals the email in lower case, superseded ones
  dropped, the first by id; a placeholder is claimed only when the token's
  own email matches (the rules' claim), else the app opens on the
  placeholder; a switched-off record is refused at the door. An account the
  app would open on a record not at `trainers/{uid}` is STRANDED, and must
  be 0. That catches a Microsoft account whose email is only on its
  provider, a second account for one email, and a refused claim (the branch
  review's finding on the first version, which matched records by the
  account's own email only). Records no sign-in lands on yet (not
  placeholders) are listed apart, not a stop: nobody uses them today; a
  first sign-in with one of those emails would be refused every write today
  and every client read after Round 0, so the list says to switch off anyone
  who left and ask Claude about the rest.
- **Item 12**: real clients tied to Demo Mode: a session hosted at
  `demo-studio` naming a real client, a Demo client's session hosted at a
  real studio, a real client approved at `demo-studio`. Must be 0.

It prints counts and the ids and emails of what needs a person, ends with
`GATE item0=N item12=N`, and exits 0 (pass), 3 (stop) or 1 (couldn't run).
It never writes.

## 9. Gates (on the final commit)

| Gate | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **2** (the baseline: `clinical-review/charts.tsx`, `EditTrainerModal.tsx`) |
| The suite (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`) | **14,647** pass in 888 files (14,629 in 886 on master, plus the round's 18 in two files) |
| Rules tests (the emulator, Java 26, on a spare port) | **587** pass (490 on master `aa846261`) |
| The rules lint and the comment proof (`tests/firestore.rules.lint.test.ts`, `tests/rules-source.test.ts`) | 26 pass |
| `firestore.rules` | **178,098** bytes as written (176,387 on master), **135,372** of code (134,780; the lint's limit 150,000) |

## 10. How it ships

`scripts/ship/ship-privacy-0.ps1`. The script lives on the branch, so run it
from the branch's own folder, `.claude\worktrees\privacy-0`, while that
folder is there; otherwise, in the project folder, `git switch
privacy/0-strangers-out` first (prepare also switches the project folder
itself when the branch isn't open anywhere else, and stops naming the folder
when it is):

- **prepare** changes nothing in production: GitHub master must still be
  `aa846261` (or the branch must fast-forward it), the branch exactly the
  round Claude built, a clean tree, no Windows line ends, the typecheck
  count 2, the round's tests, the rules lint, `npm run test:rules`; then the
  audit, read only, with the service account, which must say item 0 = 0 and
  item 12 = 0; then AJ types YES for the Microsoft question (§7).
- **golive** refuses unless prepare passed on exactly this branch and
  master; checks the LIVE rules are master's (`scripts/check-live-rules.ts`,
  read only); makes the restore tag `restore/2026-10-14-before-privacy-0`;
  asks for GO; deploys `firestore:rules` to prod; checks them live; pushes
  the branch to master, fast-forward only.

No Render step: the app doesn't change. The rules can go any day: an iPad on
any build reads and writes exactly as before.

**The check afterwards**, because every rule passes an administrator first,
so AJ's own walk can't see it: signed in as a **Life Transformer at a live
studio**, open a client's Notes and Pulse, a session's sets, Relay's Board
and Operations → Today (a leader); and signed in with a **Google account
that was never let in**: the access screen, with no red "Firestore Action
Failed" toast.

**The undo**: the rules from the restore tag first (`docs/ops/DEPLOYS-AND-
ROLLBACK.md`, "The rules"), then a revert on master if wanted. Nothing else
changed, so nothing else needs undoing.
