# The trainer lock: an iPad holds its own studios' trainers (Oct 18 2026)

**Branch:** `claude/keen-elbakyan-b06716` (a desktop worktree), over master
`878c7f95` (the Wrap-up round). One commit per phase, each typechecked on its
own. App, rules and indexes; no Cloud Function, cron, Mindbody or Firestore
structure change, and no new field.

*A proposal. Nothing below is built until AJ answers §5.*

## 1. What this is

Every trainer record in the company is open to every iPad today. The app
subscribes to the whole `trainers` collection the moment someone signs in
(`src/hooks/useTrainers.ts`), the boot reads the whole collection a second
time (`useAuthInitialization.ts`), and the database lets any signed-in
account read any trainer document (`firestore.rules`: `allow read: if
isAuthenticated()`). A trainer record is a person: name, email, role, photo,
which studios they work at, and their Kaizen Roster, which names clients
with a reason and a note. The Gemini review of Oct 18 flagged it, AJ
answered **3a** on the Gemini Review Check page, and the ROADMAP had it
parked as "lock the trainer records", first on the next 1-on-1.

After this round an iPad holds only the trainers of the studios the
signed-in person works at or runs, and the database refuses a read of
anyone else. The Kaizen Roster stays what it is: your studio's team can
read yours, as the roster round intended; another studio's team cannot.

## 2. Who sees whom

"Works at" and "runs" are the words the rules already use for clients,
sessions and every studio-scoped read, so nothing new has to be defined.

| Who you are | Whose records your iPad holds |
| --- | --- |
| A Life Transformer | Everyone who works at your home studio, at a studio you also work at, or at one you are a guest at: your colleagues, their leaders, and the franchise owner of those studios. Plus Demo Mode's three practice trainers, as today |
| A head trainer, studio leader or studio owner, or a trainer with the grant | The same, for every studio you run |
| A franchise owner | Your home studio and every studio you own, exactly as its leaders see it (the franchise partition, Oct 10 2026) |
| An administrator, the founder, the overseer | Everyone, as today |
| Someone signed in with no account yet | One thing: a profile made for them in advance, found by their own sign-in email, so they can claim it. Nothing else (the strangers-out round left this one read open on purpose until the trainer lock) |

Two people can read each other's record when they share a studio, in any of
the ways a person is tied to one: home, also works at, a guest, the grant,
or owns. A visiting trainer at Willoughby sees Willoughby's team while they
are on its list, and Willoughby sees them.

## 3. What changes on an iPad

**For a trainer at one studio: nothing they can see.** The Hub, the Active
Session, the Calendar, Relay, My Studio → Team, Openings and the profile
list the same people as before, because those screens already show the
studio's team (`src/lib/who-works-here.ts`).

**Where a screen names a person from outside your studios**, it will say
**"a trainer from another studio"** rather than show nothing or break. The
name Start stamps on a session stays on the session, so a client's history
still reads "with Sam" after Sam moves to Strongsville; only what needs
Sam's record itself (their photo, their initials' colour, their profile)
says it is someone from another studio. Phase 3 walks every screen that
reads the list and records each place in this document.

**Fewer documents on every iPad, and fewer re-sends.** Today each iPad
downloads every trainer record in the company and is sent every change to
any of them (a roster edit at Solon reaches every iPad at Strongsville). At
fifty studios that is hundreds of records per iPad for a team of eight.
After this round it is the team, through five small reads instead of one
big one.

**What does not change:** who may edit whom (the update rules are
untouched), a trainer's counters (`trainers/{id}/stats`, still readable by
anyone let in), the Cloud Functions, the Mindbody sync and the webhook (they
read with the Admin SDK, outside the rules), the server's cron jobs (the
same), Demo Mode, and the sign-in of anyone who already has an account.

## 4. What it costs

Five small listeners per iPad (home, also works at, guest, owns, the grant)
in place of one; each returns a handful of documents. A trainer on two
lists is read twice, which at a team's size is nothing. Five composite
indexes on `trainers`, one per query (the Enterprise edition builds none by
itself). No Mindbody call, no Cloud Function, no new field.

## 5. Three questions for AJ

**Q1. A profile made in advance, and a Microsoft account with no email.**
When a leader or an administrator makes a profile for someone before they
sign in (Operations' Temporary profiles, or the old Add New), Journey finds
it at their first sign-in by email. A Google account always tells Journey
its email. Some Microsoft accounts don't: the address sits on the account's
provider entry only, and the sign-in itself carries none. The lock can match
"your own email" to a record only when the sign-in carries one.

- **a. (recommended) Keep the lock strict.** Such a person taps Request
  Access, as a new person does; their leader lets them in from My Studio →
  Team (which writes their record at their own sign-in id, no email match
  needed); the profile made in advance is a spare that an administrator
  removes. Nothing is open to strangers. Microsoft sign-in is not switched
  on yet, so nobody is in this position today.
- **b. Leave profiles nobody has claimed yet readable by anyone signed in**,
  so the match by email still works for those accounts. The price: anyone
  with a Google account could list the names, emails and studios of people
  who haven't signed in yet (not their rosters: a profile made in advance
  has none).

**Q2. A leader of a corporate studio: one studio, or the group?** On Oct 14,
for bookings, AJ said head trainers and studio leaders should see every
studio in their own group (westlake, Strongsville and Willoughby for the
corporate studios; a franchise's studios for its leaders). That rule is not
built yet; it was filed under the bookings lock, because "group" is not yet
something the rules can read.

- **a. (recommended) This round: the studios a person runs** (home, the
  grant, owned), as the rules already define it for clients and sessions. A
  westlake head trainer sees westlake's team. The group rule comes with the
  bookings lock, for trainers and bookings together, once a group is one
  thing the rules read.
- **b. Build the group rule now, for the trainer list alone.** A bigger
  round: the rules would read the studio's network on every trainer read,
  and the same rule would be built a second time for bookings later.

**Q3. Ship it in two steps, or one?** This round takes a read away, so the
order is the reverse of the usual one: the app first, the rules last
(`docs/KNOWN-TRAPS.md`, the franchise partition: "a round that takes access
away ships the app first and the rules last"). An iPad still on the old
build asks for every trainer; once the new rules are live that ask is
refused, and the iPad shows a red "Firestore Action Failed" and stale names
until it loads the new build (Journey reloads itself on the Hub after a
deploy, `features/new-version`).

- **a. (recommended) Two steps.** Day one: the indexes, then the push and
  Render (the web service, and Manual Build on both cron jobs so they stay
  on the same commit). Day two, or once Render's boot report shows every
  iPad on the new build: the rules tests, then the rules.
- **b. One sitting:** the app, then the rules straight after, accepting
  that an iPad which hasn't reloaded yet shows the error until its next trip
  to the Hub.

AJ answers in chat ("1a 2a 3a" is enough).

## 6. How it is built (for the record; AJ can skip this)

**The scope** (`src/features/trainer-scope/scope.ts`, pure, with its tests):
the studios whose trainers this person may hold. For anyone below the
company tier, `readableStudioIds` (`src/lib/tenancy.ts`: home, also works
at, guests, and owned for a role that runs its own studios) plus the grant
(`managedStudioIds`) plus `demo-studio` (everyone works there in the
rules), capped at Firestore's 30 (`capStudioIds`). For an administrator,
the founder or the overseer, "all".

**The queries**, one listener each, merged by id and delivered as one list:

| Reads | Query |
| --- | --- |
| People homed at my studios | `where("primaryHomeStudioId", "in", S)` |
| People who also work at one | `where("accessibleStudioIds", "array-contains-any", S)` |
| Guests at one | `where("activeGuestStudioIds", "array-contains-any", S)` |
| The owner of one | `where("ownedStudioIds", "array-contains-any", S)` |
| Someone with the grant at one | `where("managedStudioIds", "array-contains-any", S)` |

Administrators keep the one unfiltered listener. `useTrainers` opens the
set, holds each listener's latest answer, and hands on the merged list once
every listener has answered, with `fromCache` true until every one has the
server's answer, through the same delivery gate as today (first answer, any
change, the moment the server confirms the copy). The boot's own read
(`bootRead("trainers")`) runs the same set, the iPad's copy first; so does
the Operations and Admins "refresh" (`handleManualRefresh`). The
provisional merge's roster repoint (`mergeClient.ts`, which read every
trainer) repoints the rosters the merging person can read, which is every
roster at the studios they run.

**The rule** (`firestore.rules`, `match /trainers/{trainerId}`):

```text
allow read: if trainerRecordReadable(trainerId, resource.data);

readable when  request.auth.uid == trainerId
            or the caller is an administrator (roleIsSuper)
            or the record's email equals the token's email, lower-cased, and is not empty
            or the caller has a record and the two records share a studio:
                 the record's home is in the caller's studios,
                 or its also-works-at / guest / owned / grant list has any of them
```

The caller's studios are built once (`let`) from their own record, the
rules' `trainerWorksAt` and `trainerLeads` ties plus `demo-studio`. One
`getRole()`, one `callerTrainer()`: within the 1,000-expression budget by a
wide margin. Proved on the emulator before this proposal was written: the
rules engine proves an `in` filter against the `in` test and an
`array-contains-any` filter against `hasAny`, accepts the email lookup from
a token that carries the email in any case, refuses the lookup from a token
with none, and refuses the unfiltered list and another studio's.

**The indexes** (`firestore.indexes.json`): five composites on `trainers`,
each leading with the query's field (`primaryHomeStudioId` ascending; the
four lists `arrayConfig: CONTAINS`) with `fullName` as the second field a
composite needs. `src/lib/firestore-indexes.test.ts` holds them.

**The rules tests** (`tests/firestore.rules.test.ts`, a new block): a
trainer reads their studio's five queries and a colleague's record, and is
refused the unfiltered list, another studio's query and another studio's
record; a leader, a guest, the grant and a franchise owner each read what §2
says and no more; the owner is readable by the studio's people; an
administrator lists everyone; a stranger reads a profile by their own
email, not by another's, and not the list; Demo Mode's trainers are
readable by anyone let in; the existing "allows regular Trainer to read
trainers collection" test flips to the scoped reads.

**Not changed, on purpose:** `trainers/{id}/stats` (any reader let in; not
in scope), the update and create rules, the Cloud Functions' claim mirror,
and nothing adds a `studioIds` field to the record. A denormalised list of
every studio a person is tied to would make this one query and one index
instead of five, at the price of a new field every writer (the app, the
staff webhook, the seeder, four scripts) must keep, and a backfill. Worth
it only if the five listeners ever show up in the boot report.

## 7. The phases

1. **Scoped reads and their indexes.** `trainer-scope/` (pure, tested),
   `useTrainers`, the boot read, the refresh, the merge's repoint; the five
   indexes. The app under the OLD rules behaves exactly as today (every
   query is narrower), so this phase can ride ahead of the rules.
2. **The rules and their tests.** The read rule above and the block of
   rules tests; the rules lint and comment proof.
3. **Every screen that reads the list.** Walk each consumer of the
   `trainers` prop from `AppContent.tsx` (the picker, the Hub, the Active
   Session, the profile, the Calendar, Relay, My Studio, Operations, the
   Admins dashboard, the importer, the bell) and the hooks beneath them;
   "a trainer from another studio" where a record outside the scope is
   named.
4. **The written record.** `docs/business/roles-and-permissions.md` (a row
   for the trainer record), the ROADMAP (the parked item goes), one
   decision in `CLAUDE.md` and its entry in `docs/DECISIONS.md`, the
   feature's README, `docs/KNOWN-TRAPS.md` if anything bit.

Then the gates: typecheck at 0, the suite with `--dir src`, the rules tests
on the emulator, `firestore-indexes.test.ts`, the bundle budget.

## 8. How it ships (if 3a)

**Day one.** `firebase deploy --only firestore:indexes --non-interactive`
(the five indexes; the note about two field overrides not present is the
TTL policies and is expected). `git push origin master`. On Render: Manual
Deploy on the web service, Manual Build on both cron jobs. The app under
the old rules reads exactly what it read before.

**Day two**, once the iPads have the build (Render's boot report, or a trip
to the Hub on each): `npm run test:rules` on AJ's PC (the run that counts),
then `firebase deploy --only firestore:rules`.

**The undo**: the rules back first (`docs/ops/DEPLOYS-AND-ROLLBACK.md`,
"The rules"), then the app if wanted. The indexes can stay.

**The check afterwards**, because every rule passes an administrator first,
so AJ's own walk can't see it: signed in as a **Life Transformer at a live
studio**, the Hub's cards show their trainers, My Studio → Team lists the
team, a client's history names its coaches; and nothing red.

## 9. AJ's answers

*(recorded here when he answers)*

## 10. Gates

*(filled in on the final commit)*
