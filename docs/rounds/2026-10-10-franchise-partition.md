# The franchise partition (Oct 10 2026)

*Branch `oct10/franchise-partition`, on master `609c2977`. ROADMAP Gate B.
Ships with `scripts/ship/ship-partition.ps1` in three stages (prepare,
golive, rules): the app goes live first and the rules last (§7). Nothing
changes for anyone live but the one Studio Leader (§5).*

## 1. What AJ asked

The proposal page of Oct 10 2026, "Learning and the Studio Map"
(https://claude.ai/artifact/JQRbrwv64Q1o7pxEgoRsgt), asked three questions
and recommended an answer to each. AJ, Oct 10 2026: **"take it away i like
your ideas"**, recorded on the page as **1a 2a 3a**:

- **3a: the franchise partition comes first**, before the studio map and
  Learning's memory. This round.
- 1a (only the trainer sees what they have read in Learning) and 2a (a
  machine's size on its model and on the unit) are for those later rounds;
  nothing of them is built here.

The partition was already on the record as the one Gate B security item:
ARCHITECTURE §1.8 (Sep 12 2026, "securely partition data between franchise
owners so each sees only their own studios' data"), invariant 10 ("A
franchise owner sees only their own studios", until now *not yet enforced*),
and the ROADMAP's "Needed before the first franchise, Jan 1 2027, not for the
corporate launch" (AJ, Oct 10 2026). Until this round a franchise owner was a
company-wide role in the rules: `isFranchiseOwnerOnly()` granted every
studio's clients, sessions, renewals, floor, trainers and studio documents.

## 2. The model

1. **One source of ownership: `trainers/{uid}.ownedStudioIds`.** Only an
   administrator writes it, on anyone, themselves included. There is no
   `networkIds` field.
2. **A franchise owner (`FranchiseOwner`, or the legacy `Owner`) leads their
   home studio and every studio in `ownedStudioIds`, exactly as a studio
   leader leads theirs, and gets nothing anywhere else.** One rules helper,
   `roleRunsOwnStudios(r)`, puts the two franchise roles beside the three
   leader roles in `isStudioOwnerOrHeadTrainerOnly` and `trainerLeads`. Every
   company-wide franchise branch is gone. The few rules only an administrator
   or a franchise owner could pass, with no studio in hand, now ask the
   client's home studio (`franchiseRunsClient`) or the document's own
   `studioId` (`franchiseRunsStudio`).
3. **Only administrators create studios and networks, and only they write
   identity**: a studio's `networkId`, `ownerId`, `mindbodySiteId`,
   `mindbodyLocationId` and `isDemo`; a network's `studioIds` and `ownerIds`;
   anyone's `ownedStudioIds`. A franchise owner sets a network's quarterly
   focus (`relayFocus`, and only that field, signed as themselves and within
   its limits) on a network that holds one of their own studios. Demo Mode's
   studio is laid down by anyone (its seeder) but never with a Mindbody site,
   location or network and never out of offline, except by an administrator.
   A studio's schedule-sync lease is stamped only by the people who work there.
4. **Nobody but an administrator changes their own access fields.** Someone
   else changes another person's studio lists only within studios the caller
   runs (`othersDocChangeAllowed`). A non-administrator never touches anyone's
   `ownedStudioIds`, never switches an account off or on (AJ, Oct 2 2026: "An
   administrator switches a former trainer's account off"), never opens a
   claimable placeholder, and changes a role or email only for someone within
   reach. A trainer document a non-administrator makes is a placeholder at an
   auto-id or the approval of that uid's own pending sign-up.
5. **On a write that hands out authority** (a trainer document, a studio's
   create and identity, a network, a notice) **the caller's role is the one on
   their own trainer document, not the token's claim** (`authorityRole`): a
   claim outlives a demotion by up to an hour.
6. **Announcements and access requests are per studio.** An owner posts to a
   studio they run, or to a network only when they run every studio in it;
   "everyone" is administrators'. After posting, a non-administrator only
   takes a notice down; words and deletes are administrators'. A leader or
   owner reads and approves only the requests that name a studio they run,
   through queries that name those studios.

The app mirrors the rules so no screen offers what they refuse: one answer for
"which studios does this person run" (`ownStudioIds`, `ledStudioIds` in
`renewals/permissions.ts`, and `LEADS_OWN_STUDIO_ROLES` in
`lib/staff-access.ts`), Operations' "All my studios", the studio picker, the
staff editor's limits (`admin/staff/edit-limits.ts`), the announcement reach,
the network focus, and Admins → a studio's Team → Studios → **Owns {studio}**,
the one control that writes ownership.

## 3. Where this departs from the written record, and why

| The record says | This round | Why |
| --- | --- | --- |
| ROADMAP Gate B and ARCHITECTURE §1.8: cache "`networkIds` and `ownedStudioIds`" on the trainer | `ownedStudioIds` only; network actions check the network's own `studioIds` against the caller's studios, one read on that one write | One source is one thing to keep true. A cached `networkIds` would need a Cloud Function (AJ's OK) or every network edit writing trainers too, and it goes stale when an administrator re-links a studio. Production has neither field on any trainer, so nothing to migrate |
| roles-and-permissions: the owner tier sees "the studios they own **or whose network they own**"; the app also counted `studio.ownerId` and network `ownerIds` | A studio is owned only when an administrator marks it "Owns this studio". Owning a network grants nothing by itself | `studio.ownerId` is the administrator who created the studio, not its owner, and network `ownerIds` has no screen that edits it. Three sources with no authority is the bug. Question 1 (§6) |
| AJ, Sep 27 2026: an owner sets the focus of "every network that holds a studio in their scope" | Kept: `relayFocus` alone, on networks holding one of their own studios (home or owned, never the grant) | That is the decision; only the field is narrowed, and the focus is now signed by its real writer. Question 5 (§6) |
| The rules: any franchise owner writes any studio and any network | Studio create, and every network write but `relayFocus`, are administrators' | roles-and-permissions: "an admin sets up a brand-new studio (the Mindbody id and the machines) before handing it to its leader" |
| My Studio → Studio let a studio's leaders edit the **Mindbody Site ID and location** | Administrators only; My Studio shows them locked: "Head office sets the Mindbody link (Admins → Studios)" | The Mindbody proxy now scopes an owner or leader to the sites of the studios they run, so whoever could repoint a site could reach any site. Question 2 (§6) |
| A rules test said a studio's leader may add another studio to a trainer's "also works at" | Refused. A leader changes studio lists only within studios they run | AJ, Oct 1 2026: a second studio is added on Admins → a studio's Team → Studios, administrators only; no leader screen sends it |
| CONVERSATION-BRIEF (open): may franchise owners edit a studio's floor? ("the screens offer it; the database refuses") | Yes, at the studios they run, with its client records and sessions, as its leaders do | Model point 2; it closes the mismatch the way the app already behaves. Question 3 (§6) |
| Relay notes: "All MSF studios" offered to franchise owners | Offered to the company tier only | An owner no longer writes other studios' `noteShares` |
| The rules: a leader of a person's home studio may switch their account off | Administrators only | AJ, Oct 2 2026 (`sign-out/account-off.ts`): Admins → Change role is the only writer, and a home-studio leader would reach a studio they don't run |
| `getRole()` reads the token claim first, everywhere | On authority writes only, the trainer document's role wins (`authorityRole`) | Closes the up-to-an-hour window after a demotion where it hands out authority, at no read cost; elsewhere the claim-first order stays (it would add a read to every rule) |

## 4. What was built

On `oct10/franchise-partition`, one commit per piece:

{COMMITS}

- **The rules** (`firestore.rules`): `roleRunsOwnStudios`, `ownStudiosOf`,
  `ledStudios`, `franchiseRunsStudio`, `franchiseRunsClient`,
  `recordRoleOf` / `authorityRole` / `superOnRecord`,
  `othersDocChangeAllowed` (replacing `grantChangeAllowed`), `opensAClaim`,
  `approverCreateAllowed` with `madeAsPlaceholder`, `approvesAPendingSignUp`
  and `newTrainerStaysHome`, `demoStudioStaysDemo`, `networkFocusByOwner`
  with `relayFocusValid`, `networkNoticeOfMine`, `clientCreateHonest`, and the
  access-request block keyed on the studio it names (a studio-access request
  now sits at `sa_{uid}_{studioId}`). Deleted: `isFranchiseOwnerOnly`,
  `isFranchiseOwner`, `leadsAnyStudio`, `grantChangeAllowed` and four dead
  helpers. Five deletes keyed on a `clientId` any trainer can rewrite
  (routines, sessionNotes, trainerFocuses, progressReports, focusRecords) are
  administrators' until the privacy round pins it (§8).
- **The rules tests**: the existing franchise fixtures now own the studio each
  test is about, and one new block, "the franchise partition: an owner runs
  their own studios and no other", 28 cases each with a success beside its
  refusal. **{RULES_TEST_COUNT}** rules tests (356 before).
- **The app**: the one answer for "which studios does this person run"; the
  studio picker and Operations' scope from owned studios only; the staff
  roster's two `in` queries naming the studios a leader runs (one new index,
  `access_requests (status, studioId)`); the staff editor locking what the
  rules refuse, with one line saying why; the Mindbody link locked on My
  Studio; the announcement reach and the network focus per owned studio; the
  trainer profile's Edit button matching the rules (what a leader sees is
  unchanged); Recently coached on a colleague's profile from what the iPad
  holds, without the query the rules refuse; the Owns control on Admins, and
  Change role clearing what a demoted owner owned.
- **The server**: the Mindbody proxy's gate (`src/lib/staff-access.ts`,
  `server/auth.ts`, `server.ts`'s dispatcher) reads the role from the trainer
  document, scopes a franchise owner to their studios' sites (it was every
  site), never counts Demo Mode, and allows the cross-train client lookup only
  on the three routes that look up one client. **This is the proxy's
  permission gate, not the Mindbody integration**: no route, call, credential
  or cadence changes, and with no franchise-tier user live it changes nothing
  anyone does today. CLAUDE.md asks for AJ's OK on Mindbody changes; these are
  the only lines that touch the area, and he is told here.
- **No Cloud Function and no Firestore structure change.** `ownedStudioIds`
  was already on the `Trainer` type and read by the rules; only administrators
  now write it.

**Measured** (`TZ=America/New_York npx vitest run --dir src
--testTimeout=30000`, the worktree on AJ's PC, its files in LF):
**{SUITE_COUNT}** tests in {SUITE_FILES} files (13,456 in 814 on master);
typecheck **2**; rules tests **{RULES_TEST_COUNT}**; functions unchanged; the
first screen {FIRST_SCREEN_KB} KB gzip of 480.

**The expression budget**, read off the emulator's rule-coverage report before
and after ONE request (KNOWN-TRAPS, "`writesForStudio` is itself most of the
budget"; the ceiling is about 2,100 on that scale), every case with no role
claim on the token unless it says so:

| Rule | The worst case | Before | After |
| --- | --- | --- | --- |
| `trainers` update | a franchise owner of A and B moves a trainer's home to B with every list, role and email in one write | blew it Sep 20 before the resolve-once fix | {BUDGET_TRAINER_UPDATE} |
| `trainers` create | an owner approving a hire at A with every list, through its pending request | — | {BUDGET_TRAINER_CREATE} |
| `networks` update | an owner's full focus write, three lines at their limits | — | {BUDGET_NETWORK_FOCUS} |
| `scheduleCoverage` | a full month for every writer, an owner of A included | 907 | {BUDGET_COVERAGE} |
| `hub_announcements` | an owner's network notice to two owned studios, create then take down | blew it before | {BUDGET_ANNOUNCEMENTS} |
| `sessions` read | an owner reading by `clientId` where a session is hosted elsewhere | blew it Sep 9 | {BUDGET_SESSIONS} |
| `access_requests` list | an owner of two studios, `status ==` and `requestedStudioId in` | — | {BUDGET_ACCESS_REQUESTS} |
| `studios/{s}` update | an owner's name change at A | — | {BUDGET_STUDIO} |
| `standingWeeks` update | the fullest week, six away ranges, by an owner of A | ran out at ten ranges | {BUDGET_STANDING_WEEK} |

## 5. Who it changes, live

Production on Oct 10 2026 (read only): 40 trainer documents, 4 Admins, 1
Founder, **1 Studio Leader**, the rest Life Transformers (24 with no role
field, which reads as one). **0 franchise-tier trainers**, and 0 trainers with
`ownedStudioIds`, `managedStudioIds` or `networkIds`. Five studios, two
networks. So the franchise half changes nothing for anyone live.

**The one live user it touches is the Studio Leader:**

1. My Studio → Team and Operations → Setup → People & access list only the
   access requests that name their studio. A request naming no studio, or
   another studio, is now administrators'.
2. They can't change their own role or studio lists. My Studio → Team offered
   both on their own row (the role select and "helps run the studio"); the
   staff editor now locks them, before the rules change, with "Your own role
   and studios are set by head office."
3. They can't change the role or email of a colleague they could not have
   appointed (an administrator or a studio owner based at their studio), the
   email of a colleague who also works at another studio, or switch anyone
   off. The editor locks the first two with one line saying why; a colleague
   based at another studio opens read only.
4. A colleague's profile shows what it showed before; the Edit button shows
   only for people based at their studio. Recently coached comes from what the
   iPad already holds, so the toast that query raised is gone.
5. The studio's Mindbody Site ID and location show locked: "Head office sets
   the Mindbody link".
6. Their notices go to their studio, under their own name; afterwards they can
   take one down, never reword or delete it (the app never did either).

**Every trainer:** an iPad stamps only its own studio's sync lease (it never
stamped another's). Request Access on the studio picker writes the new id; an
iPad still on the old version after the rules ship is told "The request didn't
send" until it reloads. Inside Demo Mode the practice studio's Mindbody mode
is locked at offline.

**Administrators and the Founder:** unchanged, but for the staff editor
locking the role of a person who owns a studio (Change role does it, and takes
the ownership off with it). **Before launch an administrator should look at
the pending requests on Operations → Setup → People & access**: an older
request with no studio now reaches only administrators.

**When the first franchisee arrives:** Admins → Studios → their studio → Team
→ their row → Studios → **Owns {studio}**, and Save. An owner account made
before that runs only its home studio (it fails closed); the Team row says so.

## 6. Questions for AJ

Each is built with its default, so it can be answered after he has seen it.
(The brief for this round named four; the second red team added the fifth.)

1. **Does owning a franchise network mean owning every studio in it,
   including ones added later?** *Default: no.* An administrator marks each
   studio. *If yes:* ownership is derived from `networks.ownerIds`, either at
   one read per studio in every rule (All my studios over nine studios hits the
   ten-read cap) or through a Cloud Function keeping a `networkIds` cache (the
   ROADMAP's original design; a function deploy, his OK).
2. **May a studio's own leaders still change its Mindbody Site ID and
   location?** *Default: no, administrators only.* *If yes:* the proxy must stop
   trusting the studio's site, which needs a separate administrator-set field
   for the server to read instead.
3. **Should a franchise owner edit the floor, machine set-up and client
   records of their own studios, like those studios' leaders?** *Default: yes,
   at their own studios only* ("run alike but stay individual studios";
   "studios ... are trusted"). *If no:* the roster, machine settings and client
   writes refuse the franchise roles, and those buttons hide for the owner
   tier.
4. **Will a franchise studio ever share a Mindbody site with a studio its
   owner doesn't own?** *Default: assume not* (franchise studios get their own
   site, as Solon has). The proxy scopes by site, not location, and
   westlake, Strongsville and Willoughby share site 29068. *If yes:* the proxy
   checks the location too on every route that names a client or a booking, a
   change to which Mindbody calls are allowed, so his OK and its own round.
5. **Should an owner's quarterly focus reach a network that also holds
   studios they don't own?** *Default: yes, as AJ decided on Sep 27.* The
   Corporate network holds three studios, so an owner marked at one would set
   the focus on all three Floors. *If no:* one line in the rule and one in
   `focusableNetworks`.

**Risks, written down:** the expression budget (§4's table is the gate; the
fix is always resolve-once, never dropping a check); the two `in` queries on
`access_requests` were proved on the standard-edition emulator and AJ's
`npm run test:rules` is the gate for Enterprise (the fallback is two read
rules keyed on the request's type); owners now write client records, sessions
and the floor at the studios they run (new, bounded, matching leaders); for up
to an hour after a demotion every rule but the authority writes still reads
the old claim (switch the account off when someone leaves; §8); and
`functions/src/mindbody/staffImage.ts` still lets franchise roles refresh any
trainer's staff photo (a Cloud Function, low harm, next round).

## 7. How to ship, and why the order is reversed

**This round takes access away, so the new app goes live before the narrowed
rules**, the reverse of the usual order (`docs/ops/DEPLOYS-AND-ROLLBACK.md`).
The old app under the new rules would be refused: the leader's status-only
access-request listener, an old bundle's Mindbody Site edit, and every query a
franchise owner's old bundle makes. The new app under the old rules is safe,
because every new query is narrower and the old rules allow all of it.

`scripts/ship/ship-partition.ps1`, from `.claude\worktrees\partition`:

1. `-Stage prepare` changes nothing in production or git: the branch, a clean
   tree, master on GitHub at `609c2977` (or already the branch's head), that
   `functions\` and `render.yaml` did NOT change while the rules, the indexes
   and the server's three files DID, the Firebase login, the restore tag, the
   live rules, the lock, line ends and case, the typecheck count (2), the suite,
   the functions' typecheck and tests, the builds, the size budget, the perf
   lab's markers, the rules lint test and the rules tests. Ends PREPARE PASSED.
2. `-Stage golive` (type GO): the index (`access_requests (status,
   studioId)`; an unindexed query scans meanwhile, nothing breaks), the restore
   tag `restore/2026-10-10-before-partition` at `609c2977`, then the push. **It
   does not deploy the rules.**
3. In the project folder: `git pull --ff-only`.
4. **Render, by AJ:** Manual Deploy on the web service; `curl.exe -s
   https://maxstrength-app-beta.onrender.com/version.json` names the pushed
   commit; Manual Build on `journey-cron-renewals` and
   `journey-cron-leaderboards`. The server's change rides on the web deploy.
5. **Once the Studio Leader's iPad has loaded the new build** (`version.json`
   proves Render serves it, not that the iPad loaded it; an iPad loads a new
   version by itself only on the Hub): their next cold open's boot report in
   Render's logs names it, or ask them to open the Hub once. Then
   `-Stage rules`: it checks `version.json`, asks for LOADED, then GO, runs the
   rules tests again, deploys the rules and checks them live. If the evening
   can't wait, ship the rules anyway: until that iPad reloads, opening Team or
   People raises "Firestore Action Failed: get on access_requests". Nothing is
   lost.

**To undo, the reverse of the way in.** Once the rules are live, put the
rules from `restore/2026-10-10-before-partition` back FIRST
(`docs/ops/DEPLOYS-AND-ROLLBACK.md`, "The rules"), because the old app is
refused under the new rules; then `git push --force origin
restore/2026-10-10-before-partition:master` and Render's three presses.
Before the rules stage, the push and Render alone. The index can stay. An
administrator who deletes a notice by hand (console or script) deletes its
`acks` with it: the acks outlive the notice.

## 8. The next round: the privacy lock

AJ's answer of Oct 2 2026 (`docs/rounds/2026-10-02-atlas-answers.md`): the
Pulse and notes privacy lock lands "Before franchises, Jan 1".

1. Scope every read still open to any signed-in account or any trainer to the
   client's studio, through each document's `clientId` or `studioId`, after
   every app query names its client or studio: `journalEntries`,
   `progressReports`, `sessionNotes`, `clinicalIncidents`, `exerciseLogs`,
   `routines` and their `planChanges`, `routineAdjustments`, `clientFocuses`,
   `focusRecords`, `trainerFocuses`, `clientMachineSettings`,
   `machineSettingChanges`, `schedules`, `taskInstances`, `taskRequests` and
   their replies, `machineCare`, `upkeepLog`.
2. Close the matching any-trainer writes and deletes: the same list, the
   cross-studio task writes, a day log at any studio's path, a notification
   into anyone's bell.
3. Decide what a signed-in stranger and another franchise may see of
   `trainers`, `studios`, `networks`, `hub_announcements` and `taskRequests`
   (probably a public-fields split into their own documents).
4. Remove the never-set `studioId` token-claim door; scope
   `refreshMindbodyStaffImage` by studio (a Cloud Function, his OK).
5. The Mindbody proxy by location as well as site, if Question 4 is yes.
6. The stale claim on the record rules: a Cloud Function that revokes and
   refreshes on a role change (his OK), or a measured decision to read the
   document's role on the leader paths.
7. Records whose tenancy can still be set dishonestly (older than this round):
   the webhook trusting a client document Journey's sync did not create, a
   session hosted at `demo-studio` for a real client, FORD's create checking
   the payload's studio rather than the client's, and `getStudios` and the
   renewals job skipping `isDemo` studios.
8. `crossTrainAccess` administrators' only and `crossTrainRequests` narrowed
   (both grant nothing today and must never be read as access).
9. Pin `clientId` on routines, sessionNotes, trainerFocuses, progressReports
   and focusRecords (the provisional merge as an administrators' allowance),
   then give their deletes back to an owner through `franchiseRunsClient`, and
   let an author discard their own Pulse draft.

Ship it the same way: the app first, the rules last, each newly scoped read
measured against the budget and each query with its index.
