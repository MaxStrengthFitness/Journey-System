# Notes on `firestore.rules`

The long comments that used to sit in `firestore.rules`, moved here word for word in the studio map round's phase 0 (Oct 10 2026). The rules file was 255,229 bytes and Firebase refuses a rules source over 262,144 bytes (256 KiB), so every comment block of 8 or more lines came here and left a one-line pointer in its place: `// Why: docs/ops/RULES-NOTES.md#<anchor>`. Only comments moved; the rules' code did not change by a byte (the proof is `rulesCodeOf` in `tests/rules-source.ts`, and its output is in the commit message).

Each note is headed by the function or match path it sat above, written as in the rules file (or, for a note inside a condition, the rule it sat in). A note that opens a whole section of the rules (Demo Mode, the expression-budget helpers, Renewals, InBody scans, the unified coaching journal) is headed by its section first and its first function or match path second. The text is the comment as it was written, its `//` and `*` markers taken off. Short comments that explain a single line stay in the rules file.

**Adding a rule:** keep a comment in the rules file under 8 lines. A longer one goes here, under a heading named after the function or match path it explains, with an `<a id="…">` anchor, and the rules file keeps `// Why: docs/ops/RULES-NOTES.md#<anchor>` in its place. `tests/firestore.rules.lint.test.ts` fails when the rules file passes 240 KiB, when its code passes 150,000 bytes, or when a pointer names a note that isn't here.

<a id="isdemostudioid"></a>
### Demo Mode (the section that opens with `function isDemoStudioId`)

```text
===============================================================
DEMO MODE (Sep 20 2026)
===============================================================

`demo-studio` is a real studio document full of people who do not
exist. Every signed-in trainer has the run of it, at every level, so a
trainer can rehearse the half of the app their own role keeps shut
without a single real record in reach. The app mirrors these two
answers in src/features/demo-mode/access.ts.

The boundary is NOT a wall around this data -- it is that the studio id
is a literal here, and that the app never shows a demo record and a
real one in the same list (features/demo-mode/is-demo.ts). Deriving
access from the id rather than from a field on each trainer is what
makes it impossible to grant by mistake and impossible to lose.

A literal, not a lookup: naming the id costs nothing, where checking a
flag on the studio document would spend a read on every rule that asks.
```

<a id="isdemotrainerpayload"></a>
### `function isDemoTrainerPayload`

```text
A trainer document the seeder lays down for the demo studio.

Pinned hard: the id, the flag, the one studio it belongs to, no grant,
nothing owned, and a role that cannot be an elevated one. A document
that satisfies all of this is inert outside Demo Mode -- it names no
real studio, and it is not the caller's own uid document, so it can
never answer getRole() for anybody.
```

<a id="clientcreatehonest"></a>
### `function clientCreateHonest`

```text
A CLIENT RECORD MADE FROM AN IPAD (the franchise partition, second
review): never pre-approved for another studio, and never a
Mindbody-numbered record in the practice studio. A Mindbody record's
id is digits, or {site}-{digits} (lib/mindbody-site.ts). Otherwise a
trainer could file a real person at demo-studio, where everyone reads
them, before the webhook first sees them (it merges into the existing
document and, on site 29068, leaves homeStudioId alone), or hand a new
record a cross-train list the webhook never clears.
```

<a id="roleissuper"></a>
### Expression-budget helpers (the section that opens with `function roleIsSuper`)

```text
====================================================================
EXPRESSION-BUDGET HELPERS  (Sep 9 2026)

Firestore caps a single rule evaluation at 1000 EXPRESSIONS. That is a
different budget from the 10-document-read limit, and it is the one the
sessions read rule was blowing: `npm run test:rules` failed with
"maximum of 1000 expressions to evaluate has been reached" on the
cross-studio branch -- the exact case the tenancy work exists to serve.

WHY THE OLD CHAIN WAS SO EXPENSIVE
Arguments are evaluated EAGERLY and nothing is memoised, so each helper
re-derives what the last one just computed:
  getRole()                      -> up to 3 getTrainerData() call sites
  isSuperAdmin()                 -> up to 3 getRole()  = ~9 more
  isFranchiseOwnerOnly()         -> (removed, the franchise partition)
  isTrainerOfStudio(studioId)    -> ~15 (two helpers, each re-reading)
  namedClientIsReadable(...)     -> all of the above AGAIN, per client
The document reads were cached; the expression count was not.

THE FIX: resolve the caller ONCE at the rule, then pass the role string
and the trainer map down into predicates that only do map lookups. No
function below reads a document except sessionClientIsReadable, which
reads exactly one client.

These are ADDITIVE. The originals above are untouched and every other
rule still uses them, so this round can only affect the sessions read
it was written for.
====================================================================
```

<a id="authorityrole"></a>
### `function authorityRole`

```text
THE CALLER'S ROLE ON A WRITE THAT HANDS OUT AUTHORITY (the franchise
partition, Oct 2026; review fix). getRole() trusts the token's role
claim first, and a claim outlives a demotion until the ID token
refreshes (up to an hour; syncTrainerClaims only changes the next
token). On the writes that decide who may do what -- a trainer
document, a studio's create and identity, a network, a notice -- the
caller's own trainer document, already read here as `t`, wins. With
no document at trainers/{uid} (an account keyed elsewhere) the claim
still answers, as getRole() would. Everywhere else getRole()'s
claim-first order is unchanged: reading the document there would add
a read the cost round (Sep 2026) took away.
```

<a id="clientisreadableby"></a>
### `function clientIsReadableBy`

```text
Can this caller read this ALREADY-READ client document?

The three cross-train checks come FIRST and are pure array work. The old
order put the studio check first, so the cross-train case -- a client
visiting from another location, which is precisely the case that failed
-- paid for the whole expensive branch before reaching the cheap one
that was going to say yes.
```

<a id="crosstrainsessiontotals"></a>
### `function crossTrainSessionTotals`

```text
A cross-train visitor's session moving the client's totals (Sep 24
2026). The caller works at a studio the client is approved to train at
(the three list checks of clientIsReadableBy, which let them READ the
client), and the write touches only what a session moves:
  Finish      completedSessions, sessionCount, lastSessionDate,
              updatedAt, lifetimeReps, lifetimeWeight,
              currentMachineMetrics, consultationCompleted,
              trainerTally, trainerTallyUpdatedAt, topTrainerId,
              topTrainerName, topTrainerSessions, machineStats
  Start       isRoutineBActive, firstSessionDate
  History     the same counters, given back on a delete or an edit
  Pulse       subjectiveSnapshot (finalizeCheckIn: the summary of the
              Pulse the visitor may already write to progressReports)
Pure map work on the already-read trainer: no document read.
```

<a id="renewalsreadable"></a>
### Renewals (the section that opens with `function renewalsReadable`)

```text
====================================================================
RENEWALS (Renewals round, Sep 2026)

Same shape as the helpers above: the caller is resolved ONCE at the
rule and the role string and trainer map are passed in, so these cost
map lookups, not document reads.

  readable   - works at or runs this studio, or an administrator
  manageable - runs this studio (a studio leader of it, its franchise
               owner included), or an administrator. Per-trainer
               renewal rates, the pipeline's stage / lead / outcome
               and the studio's renewal settings are for leaders only
               (AJ, Sep 10 2026). The franchise partition (Oct 2026):
               a franchise owner no longer reaches every studio.
====================================================================
```

<a id="wave2leads"></a>
### `function wave2Leads`

```text
WAVE 2 OPERATIONS: who may, with the caller resolved ONCE (Sep 28
2026). getRole() and callerTrainer() each read the trainer document;
asked once here, everything below them is a map lookup, so the wave's
rules stay far inside the 1,000-expression budget. The same answers as
the renewals' (renewalsManageable: the studio's leaders, the grant
and its franchise owner included, and administrators;
renewalsReadable: also everyone who works there), which the app
mirrors with canManageRenewals / canTakePartInRenewals.
```

<a id="franchiserunsclient"></a>
### `function franchiseRunsClient`

```text
...and OF THIS CLIENT'S HOME STUDIO, for the deletes on collections
keyed by client whose clientId nobody can rewrite: journalEntries
(its update pins clientId) and clientFocuses (its update needs the
author, an administrator or this same test on the stored client).
NEVER on a collection whose update lets any trainer change clientId
(routines, sessionNotes, trainerFocuses, progressReports,
focusRecords): there the stored clientId is whatever the last writer
said, so a B client's document could be re-pointed at an A client and
deleted by A's owner (second review). Those deletes are
administrators' until the privacy round pins clientId. One read (the
client), on a single-document write. A document with no clientId, or
a client that is gone, is refused.
```

<a id="startingchoicevalid"></a>
### `function startingChoiceValid`

```text
A STUDIO'S STARTING ROUTINES (Oct 8 2026, AJ: "studios will chose
their own, admins will create the routines to pick from in the app
during beta"; src/features/routine-plan/starting-store.ts).
studios/{s}/config/startingRoutines: which of head office's starting
routines this studio's trainers see (`use`: null is all of them, a list
is exactly the ones ticked, at most 80, STARTING_CHOICE_MAX) and the
studio's default (`defaultId`), signed with the Auth uid and the
server's time. The routines themselves are routinePresets with a
`start` part, on that collection's rules, unchanged.
```

<a id="renewalsettingsvalid"></a>
### `function renewalSettingsValid`

```text
studios/{s}/config/renewals. The app cleans every value again when it
reads them (features/renewals/settings.ts), so this only has to keep
out shapes that could never be right.

packagesRenewAutomatically (Sep 25 2026): whether the studio's packages
renew by themselves - on at the franchise studios, off at the corporate
ones, on by default. Absent means not answered, which the app reads as
on. The whole merged document is checked, so an app that writes this
key needs this rule deployed first.
```

<a id="inbodynumber"></a>
### InBody scans (the section that opens with `function inbodyNumber`)

```text
====================================================================
INBODY SCANS (Renewals round, Sep 2026)

clients/{clientId}/inbodyScans/{scanId}: the numbers from one InBody
printout. Body composition is health data, so a scan reads like a
session -- only people who can open the client -- never like the open
progressReports collection.

Writes mirror the clients/{id} UPDATE rule on purpose: every scan
write is a batch that also rewrites clients/{id}.inbodySummary, and the
two halves must never disagree about who may make them.

The ranges here are wider than the app's (features/inbody/scans.ts):
the app catches typos; these only keep out shapes that are never right.
====================================================================
```

<a id="selfcreatedroleisallowed"></a>
### `function selfCreatedRoleIsAllowed`

```text
A trainer document someone is creating FOR THEMSELVES may not hand
itself a privileged role.

The bootstrap clause on `allow create` exists so a signed-in person can
own trainers/{their uid} — the claim at first sign-in depends on it, and
so does the very first account on a new project. But isValidTrainer
places no constraint on `role`, so until now any signed-in Google
account could create trainers/{its own uid} with role "Admin" and become
a system administrator. The UPDATE rule has always refused exactly that
escalation; create simply never did, and phase 8 makes the gap matter
more, because approval is now the only intended way to get an account.

The ceiling is deliberately the SAME three roles update refuses, no
more. Owner and StudioOwner stay allowed because placeholder profiles
created by the old Franchise "Add New" path carry them, and those
profiles still have to be claimable by the people they belong to.

The owner's own bootstrap is exempted by email, mirroring the hard-coded
bootstrap in src/hooks/useAuthInitialization.ts. It is not new surface —
that address already boots itself an admin profile in app code.

Recovery if this ever blocks someone who should be an admin: an existing
super admin sets the role, which the update rule permits.
```

<a id="isownerbootstrap"></a>
### `function isOwnerBootstrap`

```text
WHO A SELF-MADE TRAINER DOCUMENT MAY BE (Oct 3 2026).

selfCreatedRoleIsAllowed() caps the ROLE; it never looked at the
STUDIOS. isValidTrainer constrains none of primaryHomeStudioId,
accessibleStudioIds, activeGuestStudioIds, managedStudioIds or
ownedStudioIds, so any signed-in Google account could create
trainers/{its own uid} as a LifeTransformer -- or a StudioOwner -- at
any real studio, and walk past the leader's approval on
My Studio -> Team. The app never sends that write; a crafted request
could.

The app writes trainers/{uid} for itself in exactly two places, and a
self-create must now be one of them:

  1. The owner's bootstrap (useAuthInitialization.ts), by email.
  2. The claim at first sign-in (features/trainer-identity/claim.ts):
     a placeholder a leader or owner set up is copied onto the uid.
     claimedProfile() names the placeholder in `claimedFromId`, and the
     new document must be THAT placeholder -- still waiting
     (pendingClaim), not yet claimed, carrying the signed-in email --
     with nothing changed but the claim's own bookkeeping. The studios
     and the role therefore come from whoever set the placeholder up,
     never from the claimant.

"No studios at all" is deliberately NOT a third door: any trainers/{uid}
makes isAnyAuthenticatedTrainer() true (session writes, notifications,
the run of Demo Mode), and no screen writes one.

email_verified is not required, for the reason ownsTrainerDoc gives.
Approval is untouched: an approver writes the new person's document
under their OWN clause of `allow create`, not this one.

If claimedProfile() ever writes a new field, add it to the list in
claimMatchesPlaceholder or every claim is refused.
Round: docs/rounds/2026-10-03-trainer-self-create.md.
```

<a id="approvercreateallowed"></a>
### `function approverCreateAllowed`

```text
AN APPROVAL (My Studio -> Team, Operations -> Setup -> People &
access): an administrator anywhere, or someone who runs the studio
the new person joins -- a studio's leaders, the grant, or (the
franchise partition, Oct 2026) its franchise owner. The role comes
from the approver's own document (authorityRole). What it may hand
out follows the approver (mayHandOut, My Studio round, Sep 2026: a
leader the studio tier, a franchise owner the owner tier too, never
an administrator), and the new person belongs to that studio and no
other (newTrainerStaysHome).
Demo Mode (Sep 20 2026): demo-studio is NOT a door here.
hasRunOfDemo() makes trainerLeads true for EVERYBODY inside
demo-studio, and an approval never constrained accessibleStudioIds or
ownedStudioIds -- so without this guard any signed-in trainer could
mint a trainer document claiming access to a REAL studio, at any id,
including a colleague's uid before they first sign in. Demo trainers
are created by the isDemoTrainerPayload clause of the create rule and
nowhere else.
```

<a id="madeasplaceholder"></a>
### `function madeAsPlaceholder`

```text
WHERE A NON-ADMINISTRATOR'S NEW TRAINER DOCUMENT MAY SIT (the
franchise partition, second review). authorityRole reads the caller's
document when there is one, so a document planted at someone's uid
decides their authority: a leader who wrote trainers/{an
administrator's uid} with role LifeTransformer would switch that
administrator's studio and network writes off. So a non-administrator
makes exactly the two documents the app makes:
  - a placeholder (ProvisionalPanel, provisional.ts, addDoc): an
    auto-id (20 characters; a Firebase Auth uid is 28), pendingClaim
    true, no authUid -- it is never anyone's uid, and it becomes a
    person only through the claim, which writes the claimer's OWN uid;
  - an approval (StaffEditor approve, setDoc at req.userId): the uid
    of a Pending sign-up that the person sent themselves (Type 1 sits
    at their own uid, with userId their own uid), naming a studio the
    caller runs, and authUid, if written, that same uid. An approval
    writes the trainer document BEFORE it marks the request Approved
    (StaffEditor.tsx), so the request is still Pending here.
```

<a id="logtakesitssessionsclient"></a>
### `function logTakesItsSessionsClient`

```text
WHO'S THIS? (the open session round, Oct 9 2026). An open session is
started before its client is chosen, so its sets carry no client; the
trainer names the client later, mid-session or at Finish, in ONE batch
that gives the session its client and every set the same one
(src/features/open-session/assign.ts). A set's client never changes
otherwise. This is the one way it may: a set with NO client takes the
client its own session is given in the same write, and only while that
session is still open (unassigned before the write). A set that has a
client keeps it; a set cannot take a client its session doesn't get;
and once the session has a client, a set on its own cannot follow.
The write that gives it must also CLOSE the session (isUnassigned
false after it; the whole-branch review, Oct 9 2026): a session left
open with a client on it would let any set of it take that client on
its own, outside an assign. Finish closes it too
(src/lib/sync-utils.ts), so a Finish that lands after a refused
Who's this? is that write.
```

<a id="logleavesitsopensessionsclient"></a>
### `function logLeavesItsOpenSessionsClient`

```text
...and back (the whole-branch review, Oct 9 2026). Once Who's this? is
chosen, the sets typed next carry the client before the assign's batch
has been answered; a set that didn't exist yet is a create, so it lands
even when that batch is refused. A refused assign leaves the session
open, and those sets may then let go of the client (the tracker sends
them again without it), so a different client can be chosen next:
otherwise Finish, which names the session's client on every set, was
refused for them every time. Only while the session is still open with
no client on it.
```

<a id="opensessionwriteok"></a>
### `function openSessionWriteOk`

```text
THE OPEN SESSION'S OWN FIELDS (the whole-branch review, Oct 9 2026).
`heldSetup` (settings kept on an open session until its client is
chosen, src/features/open-session/held-setup.ts) changes only while the
session is open: the assign's batch deletes it in the write that
closes it, and on a client's session nothing would ever read or move
it. And an open session is given only a client on record once the
write lands: New client issues the client's own write first, and when
that is refused the assign must be refused with it, or the session and
its sets would name a client that doesn't exist.
```

<a id="studionoticeofmine"></a>
### `function studioNoticeOfMine`

```text
The update rule for hub_announcements, extracted so the role is
resolved once (via let) instead of 7+ times through the old
canPostAnnouncements / isSuperAdmin / isFranchiseOwnerOnly -- each of
those called getRole(), and stacking them blew Firestore's
1000-expression budget.
let statements are valid inside function bodies but not in allow conditions.

A studio's own notice (My Studio round, Sep 2026): scoped to one studio,
and the caller runs that studio (trainerLeads -- a role there, its
franchise owner, or the grant). Never "all", never a network.
```

<a id="hubannouncementupdateallowed-body"></a>
### `function hubAnnouncementUpdateAllowed` (inside its body)

```text
Everyone else TAKES A NOTICE DOWN and does nothing else (the
franchise partition, second review: the app never edits a
notice's words -- AnnouncementComposer's only update is
{ isActive: false } -- and an edit by someone who is not the
author left the author's name on words they never wrote). The
author always may, whatever has happened to the network since
(an administrator adding a studio they don't own); otherwise the
notice must be one the caller could send: their studio's, or a
network's whose every studio they run.
```

<a id="hubannouncementcreateallowed"></a>
### `function hubAnnouncementCreateAllowed`

```text
The hub_announcements create rule, in a function for the same reason as
the update rule above: canPostAnnouncements() and the second
isSuperAdmin()/isFranchiseOwnerOnly() pair called getRole() about eleven
times between them, and every getRole() re-reads the trainer document,
which exhausted Firestore's 1000-expression evaluation budget.

Oct 2026: franchise owners as their studios' and networks' (no
company-wide branch; the franchise partition).
```

<a id="hubannouncementcreateallowed-body"></a>
### `function hubAnnouncementCreateAllowed` (inside its body)

```text
StudioOwner is NOT here on its own. It used to be, from when it was
a company-tier role; the My Studio round (Sep 18 2026) made it a
STUDIO-tier role -- one studio -- and this line kept the old blanket,
so an owner at studio A could post a notice into studio B. They reach
their own studio through studioNoticeOfMine, which is what a studio's
leaders use: My Studio -> Studio -> Announcements.
Posted as yourself (review fix: the author was free text), and
under your own name unless you are head office (second review: a
leader could sign a notice "Max Strength Head Office"; the bell and
StudioSection show authorName). Cheap shape first. Everyone
("universal", studioId 'all') is administrators' alone: neither of
the other two can reach it.
```

<a id="writesderivedtrainerfields"></a>
### `function writesDerivedTrainerFields`

```text
TRAINERS: Directory search, auth checks, and creation permissions

Sep 2026 (Trainer Dossier round) added three guards below the existing
role rules, because the trainer document now carries data a tablet has
no business writing:

  rollups        session counters, maintained by Cloud Functions. A
                 client that could set these could invent a career.
  mindbody       the staff snapshot the sync owns. Client writes here
                 would let a compromised session forge "Mindbody says".
  kaizenRoster   a trainer's own tracked-client list. Readable by the
                 whole studio team (that is the point), but curated by
                 its owner alone -- leadership can change someone's role
                 and studio access without editing who they watch.

Written as a helper rather than inline so the existing update rule stays
legible; `diff().affectedKeys()` is the only way rules can express
"you may write this document but not that field".
```

<a id="othersdocchangeallowed"></a>
### `function othersDocChangeAllowed`

```text
SOMEONE ELSE'S DOCUMENT, changed by someone who is not an
administrator (the franchise partition, Oct 2026; generalises the
grant's rule of the My Studio round; tightened after review).
  - ownedStudioIds, and switching an account off or on (isActive,
    switchedOffAt, switchedOffBy): administrators only. AJ, Oct 2
    2026: an administrator switches a former trainer's account off.
  - role and email: only for a person within the caller's reach --
    their CURRENT role is one the caller could hand out (a leader
    never demotes an administrator, an owner or a studio owner), and
    they own no studio (so a leftover ownedStudioIds can never be
    brought back to life by a promotion, and an owner's role is head
    office's). The new role is one the caller may hand out
    (roleChangeAllowed). An email is who signs in as the document
    (ownsTrainerDoc, the claim), so it changes only for someone who
    works nowhere the caller doesn't run.
  - the studio lists: only studios the caller runs (ledStudios: their
    home and owned studios for a role that runs its own, and their
    grants) may enter or leave accessibleStudioIds,
    activeGuestStudioIds or managedStudioIds, or become the home. (A
    second studio is an administrator's act: AJ, Oct 1 2026, Admins
    -> a studio's Team -> Studios.)
Only what this write changes is checked, so an ordinary edit (the
calendar switch, initials) pays for almost none of it.
```

<a id="ownstrainerdoc"></a>
### `function ownsTrainerDoc`

```text
---------------------------------------------------------------
OWNING YOUR OWN TRAINER DOCUMENT (round: trainer identity, Sep 2026)

Every rule here used to answer "is this your document?" with
request.auth.uid == trainerId. That is only true when the document id
IS the auth uid -- and two admin creation paths used addDoc, which
assigns a random one. Sign-in then matches those people BY EMAIL
(useAuthInitialization), so they arrive holding a document id that no
rule will accept, and every write to their own profile is denied. The
Kaizen Roster was simply the first place that produced a visible
symptom.

So ownership is asked properly: the uid, OR the email on the document
matching the email in the token. It is the same match the app already
performs to hand them the profile in the first place, so this grants no
access they were not already being shown.

Only valid where `resource` exists -- update and delete, never create.

email_verified is deliberately NOT required. Both sign-in paths are
OAuth (Google and Microsoft), where the provider has already verified
the address, and Microsoft tokens do not reliably carry the claim.
REVISIT THIS if password sign-up is ever added: an unverified address
would then be self-asserted, and this rule would trust it.
---------------------------------------------------------------
```

<a id="trainerupdateallowed"></a>
### `function trainerUpdateAllowed`

```text
THE TRAINER UPDATE RULE, RESOLVED ONCE (Sep 20 2026).

This rule blew Firestore's 1000-expression budget, which surfaces as
PERMISSION_DENIED and so reads like a rule saying no: a trainer could
not edit their own bio. The cause is the documented one. isSuperAdmin(),
isFranchiseOwner(), isStudioOwnerOrHeadTrainer(), roleChangeAllowed()
and grantChangeAllowed() each re-derived getRole(), and getRole() reads
the trainer document TWICE on its document-backed path -- about ten
expansions of it in one condition. Demo Mode's extra clause, and its
widening of isStudioOwnerOrHeadTrainerOnly, tipped it over.

The fix is this file's house pattern: the caller passes getRole() and
callerTrainer() in ONCE, and everything below is a pure map lookup
against the document already read. trainerLeads() is the sanctioned
stand-in for isStudioOwnerOrHeadTrainer() -- it mirrors that helper's
DB branch exactly, including the demo studio and the grant. `let` is
legal in a function body and not in an `allow` condition, which is why
this is a function. See docs/KNOWN-TRAPS.md.

Oct 2026 (the franchise partition): the role comes from the caller's
own document (authorityRole); grantChangeAllowed became
othersDocChangeAllowed, asked only on the someone-else branch; the
self branch never reaches it.
```

<a id="teamjobleaderallowed"></a>
### `function teamJobLeaderAllowed`

```text
WHO MAY POST, EDIT OR CALL OFF A TEAM JOB.
Extracted for the same reason as the hub_announcement rules above, and
it is the same failure: the inline version asked isSuperAdmin(), then
isFranchiseOwnerOnly(), then isStudioOwnerOrHeadTrainer(studioId), and
every one of those calls getRole() -- which reads the trainer document
TWICE on the document-backed path -- while isStudioOwnerOrHeadTrainerOnly
calls getRole() three more times and getTrainerData() five. One update
evaluated its way through Firestore's 1000-expression budget and came
back "Unable to evaluate the expression as the maximum of 1000
expressions to evaluate has been reached", which reads as a permission
error and is not one. Resolving the role and the trainer document once
is the whole fix.

trainerLeads() is also the RIGHT question: it is the one app-side answer
to "runs this studio" (features/relay/leads.ts mirrors it), and it counts
Trainer.managedStudioIds -- the grant the My Studio round added -- and,
since the franchise partition (Oct 2026), the studio's franchise owner
at the studios they run, who no longer pass by role alone.
```

<a id="standingweekshapevalid"></a>
### `function standingWeekShapeValid`

```text
THE STANDING WEEK (voice-review round, Sep 27 2026) -- a trainer's
usual week at a studio: when they take clients (`hours`, the blocks)
and their regulars. The trainer PROPOSES it on My Profile, a leader
AGREES it on My Studio -> Team, and the app checks the coming week's
bookings against the agreed week. Nothing about it is ever written to
Mindbody.
Shape only; limits match src/features/standing-week/week.ts, and who
may write what is in the match block. The rows of the two lists are
not checked one by one (a rule cannot loop): the app normalizes every
week it reads, leaving a malformed row out rather than guessing.
`hours` holds the BLOCKS of when the trainer takes clients: three a
day, 21 a week (Openings round, Sep 27 2026; was 14, two a day). Only
the list's length is checked, so raising it costs no expressions from
the 1,000 a request may evaluate (the budget test in "the standing
week" writes 21 for every leader it measures).
```

<a id="standingweekawayrangevalid"></a>
### `function standingWeekAwayRangeValid`

```text
AWAY (voice review follow-up, Sep 27 2026) -- the days a trainer is
away, beside the week: [{ id, from, to, note }], studio days as
"YYYY-MM-DD", both ends included. It needs no agreement, so the
trainer writes it as well as the leaders. Limits match
src/features/standing-week/week.ts (MAX_AWAY, MAX_AWAY_NOTE). A rule
cannot loop, so the six places are checked one by one; a range past
the list's end is not there to check. Six, not more, and each check
lean, because a request may evaluate at most 1,000 expressions: at
ten ranges a leader's write already ran out (measured in the
emulator, Sep 27 2026). A check that errors (keys() of a non-map,
matches() of a non-string) refuses the write just as `false` does.
Six ranges still to come is plenty: past ones drop off as it saves.
```

<a id="coveragewriterallowed"></a>
### `function coverageWriterAllowed`

```text
THE WHOLE-READ RECORD (Sep 27 2026) -- which studio days a pull that
Mindbody answered in full read, one document per month:
{ days: ["2026-10-01", ...] }. Limits match
src/features/openings/coverage.ts. A rule cannot loop, so each day is
held to the month by naming the month's 31 possible days and asking
the list to hold only those (a "2026-10-31" in September, or anything
that isn't a day, refuses the write), with no day twice.

Who may add to it: the same people as writesForStudio (administrators,
the studio's leaders with the grant -- a franchise owner of the studio
counts (the franchise partition, Oct 2026) -- and everyone who works
there), with the role and the trainer document resolved
ONCE and passed down, as teamJobLeaderAllowed does. writesForStudio
itself asks getRole() up to eight times: with it, a guest trainer's
write ran out of the 1,000-expression budget in the emulator, and
came back PERMISSION_DENIED (Sep 27 2026). Measured with the
emulator's rule-coverage report, the guest's write stopped at 2,107
evaluations and a home trainer's full month took 2,069, just under;
resolved once, the costliest write (a trainer with the grant adding a
month's 31st day) takes 907, and a full month by a guest 831. The
tests hold a full month, and two in one batch, for every writer.
```

<a id="sharedecisionok"></a>
### `function shareDecisionOk`

```text
SHARING WAITS FOR AN ADMINISTRATOR (AJ, Sep 28 2026: sharing with all
MSF studios "should submit to admins first for review, we can review
in admin dashboard"). A studio OFFERS -- shareStatus 'pending' -- and
only an administrator publishes (`shared` true) or decides the offer
('approved' / 'declined', with who and when). Anyone who may edit the
thing may still take it back: `shared` false, the offer withdrawn.
Something already shared may stay shared through a write that doesn't
publish it anew; the app sends the studio's own edits of a shared note
or tip back for review.

Cheapest first: the field checks cost nothing and pass for every write
that doesn't publish or decide, so isSuperAdmin() (document reads)
runs only for those. The other way round, a tip or note write ran out
of Firestore's 1000-expression budget (the rules tests, Sep 28 2026).
```

<a id="removedsafetyvalid"></a>
### `function removedSafetyValid`

```text
WAVE 2 CODEX: the removal records on a copy's overrides, checked one
place at a time (a rule cannot loop). OCT 2 2026 (AJ: "Im not sure if
there needs to be a limit here"): no count limit. The rules check the
reasons in the first 10 places (RULES_CHECKED_REMOVALS in
lib/machine-template.ts; change them together), which no catalog
machine's safety lists come near today (the most is 11 lines in all),
and the app's write gate (scopeOverrides) refuses any removal, at any
place, without a reason. An empty list costs one check per place and
reads nothing.
```

<a id="rosteroutofserviceok"></a>
### `function rosterOutOfServiceOk`

```text
WAVE 2 CATALOG: a reason on Out of service (AJ, Sep 28 2026, "all yes":
"a short note and who set it, on the studio's machine entry, so the row
can say why"). `outOfService` is { reason, by: { uid, name }, at },
written with status 'maintenance' by the floor editor
(features/catalog/out-of-service.ts; OUT_OF_SERVICE_REASON_MAX there
is the 140 below, and its test reads this file). A write that leaves
it as it was, or takes it off (back in service), passes on that alone;
a write that sets it is signed by the person writing, at the write's
own time, with a reason of 1 to 140 characters. Field checks only, no
get(): the roster rule asks it first, before its role checks.
```

<a id="trainers-trainerid-tasktemplates-templateid"></a>
### `match /trainers/{trainerId}/taskTemplates/{templateId}`

```text
PERSONAL TASKS — a trainer's own to-do list (Sep 2026).

Deliberately a separate PATH rather than a `scope` field on the shared
studios/{id}/task* collections. Rules cannot enforce "only your own
rows" on a LIST query unless every query carries a matching
constraint, so privacy would rest on every future query being written
correctly, and one unconstrained read added later would leak every
trainer's private list at once. Here it is structural: the uid in the
path IS the tenancy.

trainerId is the Firebase Auth uid, which is why this compares against
request.auth.uid directly and costs no document read. Not even a
studio owner can read these: a private list is private, and the
shared list is where anything a manager needs to see belongs.
```

<a id="trainers-trainerid-notifications-notificationid"></a>
### `match /trainers/{trainerId}/notifications/{notificationId}`

```text
IN-APP NOTIFICATIONS (round: Settings tiers & Task Board, Sep 2026).

The one place in this file where a signed-in user writes into ANOTHER
user's document tree, so it is worth being explicit about why and
about what that does and does not allow.

Why: notifications are written client-side, by the device of whoever
completed the task or replied to the request. That keeps the feature
free of Cloud Functions like the rest of studio-tasks — no deploy
step, no cold start, nothing riding on the Cloud Run pipeline.

What it allows: CREATE only. A caller cannot read, update or delete
anyone else's notifications, cannot attribute one to a colleague
(actor.id is pinned to request.auth.uid), and cannot create one that
is already marked read — so nobody can slip a notification past a
recipient's badge. The worst a bad actor can do is put a truthfully
attributed line in a colleague's bell, which is the feature.

Reading, marking read and deleting are the owner's alone, by uid in
the path, exactly like the private task lists above.
```

<a id="trainers-trainerid-notes-noteid"></a>
### `match /trainers/{trainerId}/notes/{noteId}`

```text
WAVE 2 RELAY: the Journal's notes. trainers/{trainerId}/notes/{noteId}
may carry the Journal's three optional fields: `noteType` (one of six),
`fields` (a typed note's three template answers) and `hunch` (a Trend
note: its claim, how it will show, the sample, the evidence so far,
when it was retired). Everything else is trainerNoteValid's, word for
word: this block only lets those three keys in beside it, so a note
written before reads and saves exactly as it did. Private by path,
as every note is. features/relay/notes/journal.ts.
```

<a id="clients-clientid"></a>
### `match /clients/{clientId}`

```text
CLIENTS — scoped to the reader's studios (tenancy pass, Sep 2026)

This rule used to be `allow read: if isAuthenticated()`. Any trainer at
any studio could read every client record in the platform — name, date
of birth, phone, email, clinical notes — for every other franchise.

The machinery to prevent that was already in this file and had never
been wired to this collection. `isTrainerOfClientData` encodes exactly
the policy lib/permissions.ts implements: your own studios, plus a
client who has explicitly approved cross-training at one of them.

READ IS WIDER THAN WRITE, DELIBERATELY. A cross-train client's record
has to be readable at the studio they are visiting — that is what makes
them trainable there — but editing them stays with the studio that owns
the relationship. A visiting trainer correcting a phone number on
someone else's client is how two studios end up disagreeing about who a
person is.

NOTE ON QUERIES: Firestore evaluates this per document and rejects a
whole query if any document it would return fails. So every list query
against this collection must be constrained to the reader's studios.
The unscoped ones were fixed alongside this rule — see the tenancy
section of ADMIN-OVERHAUL-ROUND2.md.
```

<a id="clients-clientid-allow-update"></a>
### `match /clients/{clientId}`, allow update

```text
`resource.data` is the EXISTING document: a trainer may only edit a
client their own studio holds, whatever the incoming payload claims.

The one exception is a CROSS-TRAIN VISITOR's session (Sep 24 2026).
A trainer at a studio the client is approved to train at
(approvedCrossTrainStudioIds, the same list that lets them read the
client) may move exactly the totals a session moves, and the summary
of a Pulse they finish, and nothing else: not the name, the home
studio, the approval list, the notes or the medical history.
Without it a visitor's Finish was refused in
full and the session never ended (docs/KNOWN-TRAPS.md, cross-train).
Checked before the home-studio test so the visitor's path stays cheap
inside a finish batch of eight machines.
The machine totals' backfill marker is never SET on the client any
more (the iPad round's review, Oct 6 2026): it lives on
clients/{id}/machineTotals/current. An iPad still on the old version
backfills by writing a whole-history machineStats with the marker
onto the client, and the reader SUMS that with the totals document's
counts, doubling every times-performed. Refusing the marker refuses
that one write whole; deleting it (the new app's replace) and every
other client write are unaffected. Scripts use the admin SDK.

THE HOME STUDIO IS AN ADMINISTRATOR'S TO MOVE (the franchise
partition's attack review, Oct 10 2026). This rule asks about the
home already STORED, so a trainer at A could create a record homed at
A, then re-home it to B with A on its cross-train list and keep
reading it. The record then vouched, with B's home, for B's Mindbody
site in the proxy's cross-train check (server/auth.ts,
readableClientSite): one B client's contact details and contracts per
planted record. No screen moves a client's home; only Limbo's release
(Admins, an administrator) and the sync's create set one. Compared as
getStudioIdFromData reads it, so neither field can stand in for the
other. The visitor's totals path above already excludes both.
```

<a id="clients-clientid-sharednotes-noteid"></a>
### `match /clients/{clientId}/sharedNotes/{noteId}`

```text
SHARED NOTES (Learning + Planner round, Sep 2026) -- a note a trainer
shared from their Planner, copied onto the client's record. Shown in
the profile under Goals -> Plans from the team.

Read like InBody scans: whoever can open the client. Written like one
too (inbodyWritable): putting something on a client's record is for
the studio that holds them. Only the author rewrites a copy -- the
app overwrites it whole on every save, so the full shape is checked.

Delete: the author, always (it is theirs to take back, even after
moving studio); the studio's leaders and administrators (someone has
to be able to take a note off a record). `resource == null` lets the
author's Planner delete a copy a leader already removed, in the same
batch as the note itself, without the whole batch being refused.
```

<a id="machinetotalsclient"></a>
### `function machineTotalsClient`

```text
A CLIENT'S MACHINE TOTALS (the iPad round, Oct 6 2026;
src/features/machine-totals). currentMachineMetrics, machineStats and
the backfill's marker moved off clients/{id} into this one document, so
the studio roster every iPad streams on every open no longer carries
them (they were 73% of a client document).

EXACTLY the client document's access for these fields, nothing more:
  read    whoever can read the client (match /clients/{clientId})
  write   whoever can update the client: an administrator, a trainer
          of the client's studio, or an approved cross-train visitor,
          who on the client may move currentMachineMetrics and
          machineStats but not the backfill's marker (the same list as
          crossTrainSessionTotals)
  delete  administrators only, as the client
Only the one document id, only these fields (and Demo Mode's isDemo
flag, which its seed puts on every document it writes), and never for
a client that does not exist.
```

<a id="clientmachinesettings-settingid"></a>
### `match /clientMachineSettings/{settingId}`

```text
DISK SETTINGS: Machine settings assigned to specific athletes

Delete was `isSuperAdmin() || isFranchiseOwner() || isAuthenticated()`
until Sep 20 2026. The trailing clause made the first two decorative:
ANY signed-in Google account could delete any client's machine settings
— including someone sitting in AccessRequestView with no trainer profile
at all, who could enumerate them first through the open read above.
It now matches create and update: a trainer, and nothing less.
```

<a id="machines-machineid"></a>
### `match /machines/{machineId}`

```text
GLOBAL MACHINE CATALOG — the default set every studio picks from
(round: Machine Creator & Studio Roster, Sep 2026).

Writes are "admins and above" only. Franchise owners are deliberately
NOT included: a studio inherits every catalog field it has not
explicitly overridden, so an edit here still reaches most trainers at
most locations. Studio-level customization belongs in the studio's own
roster below, where it affects exactly one location.

Deletes are denied outright. A retired machine keeps its document
(status: 'retired') because studios may still physically own it and
every exerciseLog ever written references its id.
```

<a id="machines-machineid-settinghistory-historyid"></a>
### `match /machines/{machineId}/settingHistory/{historyId}`

```text
The audit trail for a machine's settings: who changed what, when and
why (features/equipment/mutations.ts writeHistory, machine-fit
setup-save.ts). It is written with addDoc and never updated or
deleted by any code in the app, so the rule now says exactly that.

Until Sep 20 2026 this was `allow read, write: if isAuthenticated()`
— any signed-in account could rewrite or erase the trail. An audit
trail anyone can edit is not an audit trail.
```

<a id="machinechangevalid"></a>
### `function machineChangeValid` (in `match /machines/{machineId}`)

```text
CATALOG WAVE 3: the standard's change log (Sep 29 2026; the Codex's
question 1). One document per save of the catalog editor - who, when
and which DEFINITION FIELDS, never the values (they are on the
machine). Written only by recordMachineChange
(features/machine-codex/change-log-store.ts), signed with the Auth
uid and the server's time; read on the machine's Catalog page by
anyone signed in. Append-only: an audit trail anyone can edit is not
an audit trail. Administrators write it because only they can write
the machine it records.
```

<a id="planchangeok"></a>
### `function planChangeOk` (in `match /routines/{routineId}`)

```text
A ROUTINE'S PLAN'S CHANGES (Oct 7 2026, src/features/routine-plan).
The plan itself is `plan` on the routine, written by the update rule
above. Each change to it is appended here in the same batch, by any
trainer (AJ: "anyone can go ahead and change a plan"), signed by the
signed-in person with the server's time, and never edited or
removed, so the next trainer reads who changed it and why.
Oct 8 2026 (the first-session screens, AJ's "1a"): four more kinds,
cantdo and cando (a machine the client can't do, and reopened),
replan (the road started again, kept in the history) and column
(the Academy weight sheet's column picked); nothing else moved.
```

<a id="presettier"></a>
### `function presetTier`

```text
ROUTINE PRESETS — two tiers: built-in "global" presets ship in app
code (data/routine-presets.ts, never written here), studio presets
are docs with studioId == the trainer's studio. Same posture as the
routines/routineAdjustments blocks above (isolation is client-side
pending the pre-launch security hardening pass).
ROUTINE TEMPLATES / PRESETS — three tiers sharing one collection
(round: Routine Template Builder, Sep 2026).

  company  admin-authored, every studio sees it -> isSuperAdmin()
  studio   one location's own template          -> that studio's owner
                                                   or leader, or admin
  trainer  ad-hoc, saved from the routine drawer-> any trainer

`tier` is ABSENT on every document written before Sep 2026, so it is
always read through .get('tier', 'trainer'): those documents keep
exactly the permissions they had, and nothing needs backfilling
before this deploys.

Update deliberately checks BOTH the stored document and the incoming
one. Checking only the incoming would let a trainer relabel their own
preset as a company standard; checking only the stored one would let
an admin's template be downgraded and then edited by anyone. The write
has to be legal at the tier it comes from AND the tier it lands on.

A STARTING ROUTINE (Oct 8 2026) is a company or studio preset with an
optional `start` part (src/features/routine-plan/starting-routines.ts):
it rides on these rules as they are, so only administrators write head
office's, and a studio's leaders their studio's own.
```

<a id="studiomachinesettings-settingid"></a>
### `match /studioMachineSettings/{settingId}`

```text
STUDIO MACHINE SETTINGS — SUPERSEDED by studios/{id}/roster/{machineId}
above. Kept live until the backfill runs and call sites move over
(phase 4, Machine Creator & Studio Roster). Do not build anything new
on this collection.

Original note: per-studio overrides (which equipment a
studio owns, its custom display order, its own setting-card options)
layered on top of the shared global machines/{id} catalog doc, which
stays untouched. Doc id convention: {studioId}_{machineId}.

Hardened Sep 28 2026 (AJ's voice review: studio-local machine
knowledge stays with the studio). Until then any signed-in account
could read every studio's set-up and any trainer anywhere could
create, change or delete it. Now the studio's own people read it
(the app reads it by `where studioId ==`, which this rule can judge),
and its leaders write it -- the Catalog's set-up card already offered
Save only to them (StudioSetupCard canEdit={canLead}). A document names
its studio and machine, as its id says, and keeps them.
```

<a id="sessions-sessionid"></a>
### `match /sessions/{sessionId}`

```text
TRAINING SESSIONS — scoped three ways (tenancy pass, Sep 2026)

This was `allow read: if isAuthenticated()`, so every trainer could read
every session ever recorded anywhere: which client, which trainer, what
weight, what notes.

WHY THREE BRANCHES RATHER THAN A STUDIO CHECK
---------------------------------------------
The obvious rule — "the session's studio is one of mine" — is wrong here
for two reasons the code makes plain.

First, eighteen read paths query sessions by `clientId`, not by studio:
a client's history, their charts, their progress report, their machine
stats. Scoping those by studio would silently truncate the history of
any client who has ever trained at a second location — and cross-training
is a feature of this product, not an edge case.

Second, sessions written before `hostedAtStudioId` was enforced carry
"", "unknown", "legacy" or nothing at all. A studio-only rule would make
those documents unreadable by every single user, including the owner,
and would poison any query that could return one.

So the question the rule asks is the one the app actually asks: can this
trainer read the CLIENT? That is `isTrainerOfClient`, the same predicate
guarding the client record itself, so a session can never be more
visible than the person it is about. The studio branch covers a session
at my location whose client record is gone; the trainer branch covers my
own history after I move studios.

COST: for a `clientId`-pinned query every document resolves the same
client path, which Firestore caches within one evaluation — two document
reads for the whole query, against a limit of ten.
```

<a id="journalentries-entryid"></a>
### The unified coaching journal (the section that opens with `match /journalEntries/{entryId}`)

```text
================================================================
UNIFIED COACHING JOURNAL (Sep 2026)

One collection for every note a coach writes about a client, whatever
part of the app produced it. Replaces the hand-merge of focusRecords +
sessionNotes + clinicalIncidents in the Journal tab.

Write posture matches the surrounding clinical collections: any
authenticated trainer may create and update. Two things are tightened:

  1. An entry's author cannot be forged on create — authorId must be the
     caller's own uid. Journal entries are the record of who said what
     about a client, so authorship is the one field worth pinning.
  2. Hard delete is reserved for admins. Trainers archive instead
     (isArchived: true), so a note can never quietly vanish from a
     client's history.

Narrow reads to isTrainerOfClient(clientId) in the pre-launch hardening
pass tracked in ROADMAP.md.
================================================================
```

<a id="notedismissals-uid"></a>
### `match /noteDismissals/{uid}`

```text
NOTE DISMISSALS — "no need to remind me", one document per trainer.

Notes round, Sep 2026. A dismissal says what one trainer already knows
about one note thread. It is PRIVATE: nobody sees who dismissed what,
and there is nothing to gain by showing it. Rules apply to whole
documents, so privacy here means a document of its own, keyed by the
caller's own uid — which is also why the app must use the Auth uid and
not `authTrainer.id`, the two differing on older accounts.

Nothing else reads this collection. A dismissal never changes the note
underneath it, so there is no role that needs to see another person's.
```

<a id="path-ford-fordid"></a>
### `match /{path=**}/ford/{fordId}`

```text
FORD — Family, Occupation, Recreation, Dreams.

One document per personal detail, living at clients/{clientId}/ford/{id}.

WHY IT IS NOT IN journalEntries: that collection is readable by every
signed-in user. A client's home life is not company-wide reading. Under
the client, a detail inherits the tightest boundary the app has — the
studio the client belongs to.

WHY THE RECURSIVE WILDCARD: the Delight queue is a collectionGroup query
across every client's subcollection at one studio, and a collection group
read is only legal against a {path=**} match. It also covers direct reads
of a single client's details, so there is exactly one rule here to reason
about rather than two that can drift apart.

The studio filter is load-bearing on read. Because the condition tests
resource.data.studioId, Firestore refuses any query that is not already
constrained to a studio the caller trains at — which is precisely the
guarantee we want, rather than one enforced only in app code.
```

<a id="studios-studioid-allow-create"></a>
### `match /studios/{studioId}`, allow create

```text
My Studio round (Sep 2026) closes the hole CLAUDE.md carried as
"any trainer can edit any studios/{id} document": a studio is written
by administrators and ITS OWN leaders: head trainer, studio leader,
studio owner, the grant, or its franchise owner -- AJ, Sep 18; the
franchise partition, Oct 2026. The one
thing every iPad still writes is the schedule sync's lease
(features/admin/useAutoSync: lastScheduleSyncAt, scheduleSyncFailures,
and since the lean sync of Sep 25 2026 lastDeepScheduleSyncAt, when
the last whole-month pull succeeded), so any trainer may touch those
three fields and nothing else.
Demo Mode (Sep 20 2026): `demo-studio` is laid down by the seeder from
inside the app, so anybody signed in may bring it into existence. The
id is a literal, so this creates exactly one studio and no other, and
update is already covered -- isStudioOwnerOrHeadTrainer is true there
for everyone.
How often a studio asks Mindbody (autoSyncEnabled,
syncIntervalMinutes) is administrators' alone since Sep 28 2026 (AJ:
"yes" to administrators only): it is a cost lever, and it had no
editor on My Studio -> Studio, so Operations -> Mindbody was a second
editor of the studio's own record.
Only administrators create a studio, and only they change what a
studio IS (the franchise partition, Oct 2026): its network, its
owner record, its Mindbody site and location -- the Mindbody proxy
scopes a leader or an owner to the sites of the studios they run,
and the webhook files a client by the studio that claims its site,
so whoever could repoint a site could reach any site -- and the
practice flag. Demo Mode: anyone may lay demo-studio down and change
it (its seeder writes ownerId and the rest on every reset, by
whoever presses it), but never with a Mindbody link or a network,
never as a real studio, never out of offline (demoStudioStaysDemo;
second review: the old exemption let any trainer give demo-studio
Solon's site, which parks Solon's location-less webhook events as
ambiguous and can file new real clients at demo-studio).
superOnRecord: the administrator's role from their own document, so
a stale claim neither makes a studio nor repoints one.
The old lease fields: only the people who work at the studio
(writesForStudio; second review -- any trainer could park any
studio's schedule sync by stamping a far-future time).
```

<a id="demostudiostaysdemo"></a>
### `function demoStudioStaysDemo` (in `match /studios/{studioId}`)

```text
THE PRACTICE STUDIO STAYS A PRACTICE STUDIO (the franchise
partition, second review). What the seeder writes
(demo-mode/seed-core.ts buildStudio, a whole-document set): name,
address, timezone, mindbodyMode "offline", locationType,
journeyCutoverDate, sessionMinutes, ownerId, isDemo true,
demoSeedVersion, demoSeededAt, demoSeededBy, createdAt -- and never
a Mindbody site, location or network. Checked on the whole document
after the write, so an update can't add them either.
```

<a id="studios-studioid-sync-docid"></a>
### `match /studios/{studioId}/sync/{docId}`

```text
THE SCHEDULE SYNC'S LEASE (the cost plan, Sep 26 2026, D3b).
The three fields above moved to their own document,
studios/{id}/sync/lease (features/admin/sync-lease.ts): every iPad
in the company watches every studio document, so each stamp on the
studio was read by all of them; a subcollection is outside that
listener, so a stamp here reaches only that studio's iPads. Any
trainer's iPad AT THAT STUDIO claims it (writesForStudio; the
franchise partition, second review: any trainer could stamp a
far-future time on another studio's lease and park its sync), and it
holds those three numbers and nothing else. The old-field allowance
above stays until every iPad has reloaded onto this build.
```

<a id="studios-studioid-schedulecoverage-month"></a>
### `match /studios/{studioId}/scheduleCoverage/{month}`

```text
WHICH DAYS JOURNEY READ IN FULL (the whole-read record, Sep 27 2026;
docs/rounds/2026-09-27-coverage-record.md). One document per month,
scheduleCoverage/{yyyy-mm}: the studio days a pull that Mindbody
answered in full read on the day before, the day, or after. The iPad
that pulled adds them (features/openings/coverage-record.ts) with an
add-to-list merge, so two iPads never overwrite each other; anyone
who works at the studio may, its leaders (its franchise owner
included) and administrators too (a back-read from Operations ->
Mindbody). ADD-ONLY: an update
keeps every day already there, and the app never deletes a month
(a wrong record is mended by hand, never from an iPad). Read by the
studio's people, as the standing weeks are; its readers to come are
the Sunday job (Admin SDK) and Openings.
```

<a id="studios-studioid-openingsmarks-markkey"></a>
### `match /studios/{studioId}/openingsMarks/{markKey}`

```text
MARKS ON A TIME (Openings round, Sep 27 2026;
docs/rounds/2026-09-27-openings.md, "Marks: how a person disagrees"
and the data, part 3). One document per half-hour of the week,
openingsMarks/{weekday-HHMM} ("1-0800" is Monday 8:00): a person's
word on that time, "full" (Always full) or "room" (Usually has room),
with an optional note of up to 200 characters. A mark sits beside the
numbers on Openings and never replaces them; it comes up for review
after 60 days, and nothing drops on its own.

Anyone who works at the studio (and franchise owners and
administrators) reads the marks, and sets, changes, keeps or removes
one, as the notes rule has it: any trainer may close a thread and any
trainer may reopen it. Always AS THEMSELVES: `by.id` must be the
caller's Auth uid and `at` this write's time, so a mark can be neither
put under someone else's id nor backdated. `by.name` is the app's copy
of the signer's name, checked only for length, as the standing week's
stamps are (pinning it would cost budget here and refuse the admins
who have no trainer document). A change, and a Keep at the review,
sign the mark again as the person making them. The id is
the weekday and the time the document holds, so one time has one mark.
Limits match src/features/openings/marks.ts (`markForWrite`, written
by openings/ui/marks-store.ts).

Who may write asks coverageWriterAllowed: the same people as
writesForStudio, with the caller resolved once (the whole-read
record's function; its answer is "works here, or runs it, or above").
```

<a id="studios-studioid-config-configid"></a>
### `match /studios/{studioId}/config/{configId}`

```text
RENEWAL SETTINGS (Renewals round, Sep 2026).

  config/renewals      the studio's thresholds and package table.
                       Its leaders write it; everyone who works there
                       reads it (the trainer-side screens measure
                       against it).
  config/renewalsSeen  names the nightly job met in this studio's
                       Mindbody. Written by the job through the Admin
                       SDK, which these rules do not govern; nobody
                       writes it from the app.

Reads are scoped to the studio, unlike roster/machineNotes: prices are
commercial, and this round's rule is that new collections do not copy
the open-read posture.
The studio's own settings (config/settings, Sep 28 2026) are read by
the same people as its renewal settings and written by the same
leaders; the company's defaults are system/studioDefaults. So is its
choice of starting routines (config/startingRoutines, Oct 8 2026):
"the studio's leaders change it; everyone who works there reads it".
```

<a id="studios-studioid-renewals-cyclekey"></a>
### `match /studios/{studioId}/renewals/{cycleKey}`

```text
RENEWAL CYCLES AND CONVERSATIONS (Renewals round, Sep 2026).

  renewals/{cycleKey}            one package term: the latest
                                 conversation, and the leaders'
                                 stage / lead / outcome
  renewals/{cycleKey}/touches    one document per conversation

Everyone who works at the studio reads them and may log a
conversation; a trainer's write can touch only the conversation
fields (renewalTrainerKeys). Stage, lead and outcome are for the
studio's leaders. Per-trainer renewal RATES are computed from these in
the Operations dashboard, which only leaders can open (AJ, Sep 10).

A conversation is never edited — an accountability log that can be
rewritten is not one — but a leader can delete a mistake. Cycles are
history and are never deleted. The nightly job writes outcomes
through the Admin SDK, which these rules do not govern.
```

<a id="studios-studioid-roster-machineid"></a>
### `match /studios/{studioId}/roster/{machineId}`

```text
STUDIO MACHINE ROSTER — what THIS location actually has
(round: Machine Creator & Studio Roster, Sep 2026).

Tenancy is enforced by the path itself, so no get() lookup is spent
on it — which matters at 100+ studios, where every get() in a rule
counts against the per-request document budget.

Writes: studio owners / leaders OF THIS STUDIO, or admins and above.
isStudioOwnerOrHeadTrainer() already accepts StudioOwner, HeadTrainer
and StudioLeader scoped by primaryHomeStudioId or ownedStudioIds.
A trainer at studio A cannot touch studio B's roster.

Reads: the people who work at or run this studio, franchise owners
and administrators (writesForStudio). Until Sep 28 2026 any signed-in
account could read any studio's roster, custom definitions and
overrides included; AJ's voice review: "Studio-local machine notes
stay with that studio. Only the official standard flows
company-wide." A machine an administrator has shared with every
studio stays readable to all through {path=**}/roster below, which
also covers a direct read of that one document.
```

<a id="studios-studioid-machinenotes-machineid"></a>
### `match /studios/{studioId}/machineNotes/{machineId}`

```text
STUDIO MACHINE NOTES — the floor's own notes about its equipment
(round: Catalog Redesign, Sep 2026).

Separate from roster/{machineId} on purpose. A roster entry carries
`overrides`, which can rewrite clinicalWarnings, contraindicatedFor
and settingFields — so it is deliberately manager-write only. These
notes carry no safety content and no override power ("the left thigh
pad sticks", "use the footstool on this one"), and the trainer on the
floor is exactly who should be writing them.

Tenancy is enforced by the path, same as the roster, so no get() is
spent on the check. A trainer at studio A cannot write studio B.
Nor read it, since Sep 28 2026: the Studio notes card promises "It
does not follow you to other locations", and until then any
signed-in account could read every studio's notes by path.
```

<a id="studios-studioid-floornotes-noteid"></a>
### `match /studios/{studioId}/floorNotes/{noteId}`

```text
THE FLOOR'S NOTES ON A MACHINE (notes round, Oct 3 2026; AJ's answer
2A: the studio's notes on a machine merged into "one list per
machine, with dates and a history"). One document per note, threaded
by `threadId` like a client's notes: a studio's own knowledge of the
unit in its building. Read by the people who work there ("Studio-
local machine notes stay with that studio", AJ Sep 28); written by
them, signed by the Auth uid; the words changed only by their author
or a leader; closed and reopened by anyone there; archived, never
deleted. A note may be OFFERED to every MSF studio, and only an
administrator shares it (sharedFieldsValid, shareDecisionOk); other
studios read only a shared one, through {path=**}/floorNotes below.
It never names a client. features/floor-notes.
```

<a id="studios-studioid-vault-entryid"></a>
### `match /studios/{studioId}/vault/{entryId}`

```text
EQUIPMENT UPKEEP LOG — "I deep-cleaned the leg press just now"
(round: Admin Overhaul, Sep 2026).

Cleaning and servicing that was SCHEDULED already lands in
taskInstances. This is for the work that was not: a spilled shake, an
engineer replacing a seat pad on a Tuesday. Both feed one merged
timeline — see features/admin/upkeep/upkeepLog.ts.

Any trainer may write, for the same reason as machineNotes: the
person who cleans the machine is the person on the floor, and an
upkeep entry carries no override power over safety content. Tenancy
comes from the path, so no get() is spent checking it.

Entries are not editable after the fact — an accountability log that
can be rewritten is not one — but a manager can delete a mistake.

THE VAULT (Relay, Sep 2026) -- leadership notes: incidents and
partners. Its own collection because rules apply to whole
documents: nothing the floor may read sits beside these. Read and
written by the studio's leaders (its franchise owner included, the
franchise partition, Oct 2026) and administrators.
```

<a id="studios-studioid-standingweeks-traineruid"></a>
### `match /studios/{studioId}/standingWeeks/{trainerUid}`

```text
THE STANDING WEEK (voice-review round, Sep 27 2026) -- one document
per trainer at this studio, keyed by their Auth uid: when they take
clients (`hours`, the blocks) and their regulars. Read by the
studio's people, because the point is that a team knows when each of
them takes clients. The trainer PROPOSES their own week -- the
proposal fields only, never the agreed week -- and sets the days they
are away (`away`, no agreement needed). The studio's leaders (the
grant counts), franchise owners and administrators AGREE it, change
it, set the days away, or remove it. Journey checks the coming week's
bookings against it and writes nothing to Mindbody.
```

<a id="studios-studioid-machinefit-machineid"></a>
### `match /studios/{studioId}/machineFit/{machineId}`

```text
MACHINE FIT (Sep 2026) -- one document per machine: which of this
studio's clients is set to what (rows keyed by client id). It is the
index behind set-up suggestions and the set-up check; the client's
own clientMachineSettings stay the record, and
scripts/rebuild-machine-fit.ts can rebuild this from them.

Read: the people who work at the studio -- the same people who can
already open these clients. NOT every signed-in trainer: a row is a
client id beside her settings.
Write: the same people, ONE ROW PER WRITE. The app only ever touches
the row of the client whose settings it just saved, and holding it to
that means a bad client cannot rewrite a studio's evidence in one go.
It holds no body data (no height, nothing from InBody): rows are
joined to the client record when they are read.
```

<a id="studios-studioid-watch-watchid"></a>
### `match /studios/{studioId}/watch/{watchId}`

```text
THE WATCH (Operations round, Sep 2026) -- what the weekly job noticed
for this studio's Monday page: watch/performance is the clients whose
reps fell at the same weight (client id, machine id, the numbers, the
day -- no name, no body data; features/admin/monday/performance.ts).
Written only by the job (Admin SDK); read by the studio's people, as
the machineFit index is. Nothing in the app writes here.
```

<a id="studios-studioid-watch-journey"></a>
### `match /studios/{studioId}/watch/journey`

```text
WAVE 2 OPERATIONS: the night's Journey summary (Sep 28 2026; AJ: "all
yes"). watch/journey holds the counts by client state and the day and
lines they were worked out with; the nightly renewals job writes it
(server/journey-step.ts, Admin SDK). Client states are on leader
screens only, so only the studio's leaders read it. (watch/hubMarks,
the Hub's All stars, keeps the block above: everyone who works here.)
```

<a id="studios-studioid-watchlist-clientid"></a>
### `match /studios/{studioId}/watchlist/{clientId}`

```text
THE WATCHLIST (Operations overhaul, Sep 2026) -- one document per
client, keyed by client id: a leader's disposition of an attendance
anomaly. Snooze ("remind me again on this date") or dismiss ("I know
why they are out"). AJ, Sep 19: leaders clear people off the list.
Read by the studio's people; written by whoever runs the studio, a
franchise owner or an administrator. Deleting it puts the client
back on normal watch -- that is what "Got it" on a back-again row
does. features/admin/attention.
```

<a id="studios-studioid-acknowledgements-ackid"></a>
### `match /studios/{studioId}/acknowledgements/{ackId}`

```text
ACKNOWLEDGEMENTS (Operations overhaul, Sep 2026) -- one document per
thing acknowledged on the Overview (an incident, a critical note, a
pain report on the Dial), keyed by its source. Who saw it, and when
-- beside the studio rather than on the trainer's note, so
acknowledging never rewrites what was written. Anyone who works here
may acknowledge (AJ: pain is visible to anyone who can open the
Overview, not leadership only), and only as themselves. Nothing is
ever deleted.
```

<a id="studios-studioid-bookingmarks-bookingid"></a>
### `match /studios/{studioId}/bookingMarks/{bookingId}`

```text
WAVE 2 OPERATIONS: a leader's "didn't come" (Sep 28 2026; AJ: "all
yes"). One document per booking, keyed by the booking's own id: a
leader who chased a session nobody logged and learned she didn't
come marks it on Operations → Today, and lib/booking-state.ts reads
it as a no-show from then on (the Week pages, Team, and the nightly
renewals job, which reads it through the Admin SDK). Read by the
people who work at the studio; written, and taken back (deleted), by
its leaders. Signed with the Auth uid and the server's time. The
cheap field checks come before the one that reads the trainer.
```

<a id="studios-studioid-bookingmarks-bookingid-allow-read"></a>
### `match /studios/{studioId}/bookingMarks/{bookingId}`, allow read

```text
LATE CANCEL · SESSION TAKEN (Atlas answers, Oct 2 2026). AJ: "it
needs to be easy to mark a late cancel in the app", and anyone at
the studio may mark one; "at the end of the day it is up to the
studio and its leaders to make the final call." So: anyone who
works here CREATES a mark (signed as themselves, now); only a
leader CHANGES one; a leader, or the person who made it (a slip of
the finger), takes it back. The document's shape is unchanged
(`noShow: true`), so every mark made before reads the same.
```

<a id="studios-studioid-cases-clientid"></a>
### `match /studios/{studioId}/cases/{clientId}`

```text
WAVE 2 OPERATIONS: a client's case (Sep 28 2026; AJ: "all yes"). One
document per client (features/admin/journey/case-store.ts): who
owns catching her (owner.id is the owner's SIGN-IN uid), the next
step, the due day, the outcome and its reason. The studio's leaders
read and write every case; the case's owner reads theirs (Relay asks
where('owner.id', '==', uid), the cases index) and may change its
next step, due day, outcome and reason, never the owner, the name or
when it opened. Every write is signed with the Auth uid and the
server's time; openedAt is set now on a create, and on an update is
kept or set now (a leader reopening it). Cases are history: nothing
deletes one. The cheap field checks come before anything that reads
the trainer.
```

<a id="studios-studioid-inactivemarks-clientid"></a>
### `match /studios/{studioId}/inactiveMarks/{clientId}`

```text
THE INACTIVE ROUND: a leader's inactive mark (Oct 1 2026; AJ:
"manually set clients inactive", by studio leaders). One document per
client (features/admin/journey/inactive-store.ts): the reason from
the pick list, an optional note, the studio day it was marked, and
who marked it (the Auth uid) at the server's time. Its own
collection: never a whole-client write, and never the nightly job's
clientStates (the job reads these through the Admin SDK). Read by
everyone who works at the studio (the Client Directory leaves an
inactive client out of All; her profile says so); marked, changed and
taken back (deleted: Mark active again) by its leaders, franchise
owners and administrators. The cheap field checks come before the
one that reads the trainer.
```

<a id="studios-studioid-tasktemplates-templateid"></a>
### `match /studios/{studioId}/taskTemplates/{templateId}`

```text
STUDIO TASKS — cleaning, maintenance and floor operations
(round: Studio To-Do, Sep 2026).

Split by AUTHORITY, the same way machineNotes is split from roster.

taskTemplates say what should happen and how often. That is a
management decision — it sets the standard the floor is held to — so
only studio leaders and above may write them.

taskInstances are one day's occurrences. Checking one off is the whole
job of a trainer on the floor, so any authenticated trainer may create
and update them. Create is open because materialization is CLIENT-SIDE:
the first trainer to open the list writes the day. The ids are derived
deterministically from (template, date, shift, machine), so this cannot
be used to invent unbounded documents that the day's plan would render.

Deleting history stays with management. A trainer who ticked the wrong
box re-opens it, which keeps the audit trail rather than erasing it.
```

<a id="studios-studioid-taskinstances-instanceid"></a>
### `match /studios/{studioId}/taskInstances/{instanceId}`

```text
TASK INSTANCES — one day's occurrences.

Checking one off is the whole job of a trainer on the floor, so any
authenticated trainer may create and update them. Create is open
because materialization is CLIENT-SIDE and the ids are derived
deterministically from (template, date, shift, machine), so this
cannot be used to invent unbounded documents.

THE ASSIGNMENT FIELDS ARE THE EXCEPTION (round: Task assignment,
Sep 2026). Putting someone else's name on work is a head trainer's
act; closing the work is not. So `assignedTo` / `assignedBy` /
`assignedAt` are gated to studio leaders and head trainers while
every other field of the same document stays open to the floor.

ORDERED CHEAPEST-FIRST, and here it genuinely matters: a studio does
30-40 completions a day and perhaps one assignment. `affectedKeys()`
is field math and costs nothing; isStudioOwnerOrHeadTrainer() resolves
the caller through document reads. Written this way, the expensive
branch never evaluates on an ordinary tick. Getting this backwards is
what blew the 1000-expression budget on the sessions rule in Sep 2026.

NOT A LOCK, and the rule cannot make it one: an assigned task is still
completable by anyone, because `status` is untouched by this gate.
That is deliberate — a trainer assigned the bins who gets pulled into
a consultation must not leave the bin full because the app said it was
handled.

Deleting history stays with management. A trainer who ticked the wrong
box re-opens it, which keeps the audit trail rather than erasing it.
```

<a id="studios-studioid-playbook-entryid"></a>
### `match /studios/{studioId}/playbook/{entryId}`

```text
FLOATING REQUESTS — ad-hoc asks and low-priority studio comms
(round: Settings tiers & Task Board, Sep 2026).

A separate collection from tasks because it has a different
lifecycle: a checklist resets nightly, a shift-cover ask never does.
See src/features/studio-tasks/requests.ts.

Any trainer may post one and any trainer may claim, reply to or
resolve one — that IS the feature. The one thing pinned down is
authorship: createdBy.id must be the caller, so a request cannot be
posted in a colleague's name, and createdBy cannot be rewritten
afterwards to reassign an awkward one.

Delete stays with management and the author. resolveRequest is the
normal path and keeps the thread; deleting is for a post made in
error, and Firestore does not cascade to the replies subcollection.

THE PLAYBOOK — the studio's accumulated coaching knowledge.

PATTERN-ONLY, ENFORCED HERE AND NOT JUST IN THE TYPE.
`!('clientId' in request.resource.data)` is the load-bearing line. A
playbook entry describes a physical complaint and a workaround, it is
readable by every trainer at the studio, and it is built to LAST.
Attach a name to that and you have a searchable health record about
identifiable clients that anyone on the floor can browse -- a
different thing from a session note, which is attached to care being
delivered and read by the person delivering it.

Putting the guard in the rule rather than only in TypeScript means a
future well-meaning change cannot quietly reintroduce client links:
the write would simply be refused. Same reasoning as the personal-task
path split -- structural, not remembered.

WRITES: the author edits their own; anyone may confirm. The
confirmation branch uses affectedKeys().hasOnly(...) so a trainer
saying "worked for me too" cannot also rewrite the answer. Ordered
cheapest-first -- the two field checks cost nothing, and the
expensive leader check only runs if both fail.

DELETE is manager-only, and the app retires instead: a resolved
request may point at an entry and the Catalog may be showing it
against a machine, so deleting orphans both.
```

<a id="studios-studioid-wiki-docid"></a>
### `match /studios/{studioId}/wiki/{docId}`

```text
THE STUDIO'S OWN WIKI CONTENT.
(round: Wiki Redesign Phase 4, Sep 2026 — see src/features/wiki/studio-wiki.ts)

ONE COLLECTION, TWO AUTHORITIES, DISCRIMINATED BY `kind`.

  kind == 'overlay'   a note ON something the app already ships: a
                      machine, an Academy topic, a quick card. ANY
                      trainer may write one. Same posture as
                      machineNotes and for the same reason -- an
                      overlay carries no override power over safety
                      content, and the person who discovers that the
                      left pad sticks is the person on the floor.

  kind == 'page'      a whole page this studio authored. Studio
                      leaders and above, because a new page is a claim
                      about how the location operates.

`kind` IS PINNED ON UPDATE. That single line is what stops an overlay
-- which anyone can write -- from being promoted into a page and
escaping the leader check. Without it the split above is decorative.

ORDERED CHEAPEST-FIRST, deliberately. The `kind` comparison is a field
read and costs nothing; isStudioOwnerOrHeadTrainer() resolves the
caller through document reads. The overlay case is the common one and
short-circuits before the expensive branch ever evaluates. The sessions
rule blew Firestore's 1000-expression budget by getting this backwards
-- see the Sep 9 round.

TENANCY comes from the path, same as roster and machineNotes, so no
get() is spent checking it. A trainer at studio A cannot write studio B.

NO CLIENT IDS, enforced here and not only in TypeScript. This content
is readable by every trainer at the studio and is built to LAST;
attaching a client to it would quietly build a searchable health
record anyone on the floor can browse. Same argument as the playbook
above, same structural guard rather than a remembered convention.

DELETE is manager-only. The app RETIRES instead: a machine article may
be linking to a page and the Academy index may be listing it, and
Firestore does not cascade.
```

<a id="studios-studioid-taskrequests-requestid-submissions-trainerid"></a>
### `match /studios/{studioId}/taskRequests/{requestId}/submissions/{trainerId}`

```text
INITIATIVE SUBMISSIONS — what each trainer logged against a
manager's ask ("five progress reports each, by Friday").

THE DOCUMENT ID IS THE TRAINER ID, and that is the whole
authorisation story: `request.auth.uid == trainerId` needs no
document read, no query constraint for a future caller to
remember, and no way for one trainer to overwrite another's.

That last point is why this is a subcollection rather than an array
on the request. The Kaizen Roster is an array and is correct there
because a roster has ONE writer. An initiative has nine writers on
nine iPads at once, and whole-array writes would silently erase
each other.

Reads stay open to the studio: the point of an initiative is that
everyone can see where the floor has got to.
```

<a id="studios-studioid-teamjobs-jobid"></a>
### `match /studios/{studioId}/teamJobs/{jobId}`

```text
TEAM JOBS (Planner rework, Sep 2026) -- one piece of work several
people share: a deep clean, the birthday cards, calls to clients who
have gone quiet. See src/features/planner/jobs/types.ts.

Read: the studio's own people (the path is the tenancy, checked on
read like comments). A client job carries client names.

Posting and editing the job itself is a leader's act. The FLOOR may
touch exactly the fields that doing the work needs -- ticking parts
(one map key at a time), joining or leaving (which stamps or removes
the joiner's own `claims.{uid}`: when it was taken, Relay's third
wave, Sep 29 2026), closing and reopening --
and may not cancel a job or touch one a leader has called off. Nothing here locks the work to the people named
on it, on purpose: anyone at the studio can finish it.

Ordered cheapest-first: affectedKeys() is field math; the leader
check resolves the caller through document reads.
```

<a id="studios-studioid-noteshares-noteid"></a>
### `match /studios/{studioId}/noteShares/{noteId}`

```text
NOTES SHARED WITH COLLEAGUES (Planner rework, Sep 2026) -- a COPY of
a trainer's private note, for a handoff, a cover, or the whole team.
See src/features/planner/notes/team-share.ts.

Read: the people it names (their uid is in audienceIds -- what the
app's `array-contains` query proves), or, for a team share, anyone
who works at the studio; and always its author.
Write: its author only, as themselves, at a studio they work at, the
whole document checked every time (the app overwrites it).
Delete: its author (even when already gone, so a batch never fails),
the studio's leaders, administrators.

NOT ENFORCED HERE: `expiresOn`. A list query cannot be checked against
the clock; the app hides an expired copy and its author's Planner
deletes it. Ending a share by hand removes the copy immediately.
```

<a id="studios-studioid-comments-commentid"></a>
### `match /studios/{studioId}/comments/{commentId}`

```text
COMMENTS ON LEARNING PAGES (Learning + Planner round, Sep 2026).

AJ chose "own studio": a studio's comments are read and written by
the people who work at (or run) it -- the path is the tenancy, and
unlike the older blocks above, this one checks it on READ as well.
Tagging someone rings their bell through the notifications rule; it
gives them nothing here they could not already read.

The author may correct the words and the tags (signed with editedAt);
nothing else about a comment changes. The author, the studio's
leaders and administrators may take one down.
```

<a id="path-roster-machineid"></a>
### `match /{path=**}/roster/{machineId}`

```text
THE MSF MACHINE DATABASE (Learning + Planner round, Sep 2026).

Collection-group reads over what studios chose to share: their own
machines (roster), their machine notes (wiki overlays) and their tips
(playbook). A collection-group query is judged by these rules alone,
and only one filtered on `shared == true` can pass -- so nothing a
studio did not share is listed to another. These recursive matches
also answer a direct read of one shared document; everything else is
the studios/{studioId} block's, which lets only the studio's own
people read it (the roster and the machine notes since Sep 28 2026).

Administrators may list rosters unfiltered: the catalog editor counts
the studios still running a machine before retiring it. Since Sep 28
2026 they also list the notes and tips studios have OFFERED
(shareStatus 'pending'), to decide them on the Admins dashboard --
nothing reaches another studio until they do (shareDecisionOk).
```

<a id="networks-networkid"></a>
### `match /networks/{networkId}`

```text
NETWORKS: Regional Franchise Groupings. Administrators make and change
them (which studios, which owners). A franchise owner sets the
network's focus (relayFocus, Operations -> All my studios) on a network
that holds one of the studios they run -- AJ, Sep 27 2026, "every
network that holds a studio in their scope", including one made with
"Choose later" that lists no owner -- and that field alone (the
franchise partition, Oct 2026). Never studioIds or ownerIds: a
partition that read them could be rewritten by the people it fences.
superOnRecord: the administrator's role from their own document.
```

<a id="access-requests-requestid"></a>
### `match /access_requests/{requestId}`

```text
ACCESS REQUESTS

Privacy (Oct 10 2026). A request holds a stranger's name, email and
phone, and anyone with a Google account can sign in, so "any signed-in
user" was everyone. Now:
  - reading: the sender (Type 1 sits at their uid; Type 2 names them
    in trainerId), administrators, and whoever runs the studio the
    request names -- requestedStudioId for a new person
    (front-door/my-request.ts), studioId for a studio-access request
    (admin/staff/roster.ts). A leader's or owner's list query names
    those studios (useStaffRoster.ts, two `in` queries, each with its
    index), and a request that names no studio is administrators'
    alone. Never Demo Mode's id: everyone has the run of it, and a
    stranger's name and phone are not a practice record (the franchise
    partition, Oct 2026). features/admin/staff/request-readers.ts is
    the app's mirror, so a trainer's iPad never opens a listener this
    refuses.
  - creating a Type 1 request: signed in, at the doc id of their own
    uid, with userId their own uid (approval writes trainers/{userId}).
    The front door writes exactly that (front-door/my-request.ts).
```

<a id="access-requests-requestid-allow-update"></a>
### `match /access_requests/{requestId}`, allow update

```text
A studio's leaders let people in from My Studio -> Team (My Studio
round, Sep 2026): marking the request Approved is theirs too.
Approving or denying: an administrator, or someone who runs the
studio it names. They change the status and its stamps and nothing
else (the franchise partition, second review: a leader could rewrite
userId, and the approval then wrote trainers/{that uid}). The
requester's own clause asks that the request was already theirs
(Oct 10 2026), and since the partition that they re-ask for the
same studio only (the id names it).
```

<a id="bug-reports-reportid"></a>
### `match /bug_reports/{reportId}`

```text
BUG REPORTS

The read rule was superadmin-only, and features/feedback/useMyFeedback
queries this collection filtered to `userId == me` so a trainer can see
what became of their reports - its own header says it exists "for when
reports feel like they go nowhere". That listener was denied for every
trainer but the owner, silently, so the reports went nowhere visibly
too. A reporter may read their OWN report; nobody else can.
```

<a id="bugreplyvalid"></a>
### `function bugReplyValid` (in `match /bug_reports/{reportId}`)

```text
WAVE 2 ADMINS: A REPLY THE REPORTER READS IN SETTINGS (Sep 28 2026; AJ
"all yes", q11: "in the app only. Nothing is emailed"). One field,
  reply: { text, by: { uid, name }, at }
written by an administrator from Admins -> Machinery -> Bug reports
(features/admin/bugs/BugReplyBox.tsx), signed with their Auth uid and
the server's time. The shape is checked only when the reply changes,
so setting a status on a report that already has one isn't refused.
The reporter reads it with the report (the read rule below), and a
report is never filed with a reply already on it.
```

<a id="activity-entryid"></a>
### `match /activity/{entryId}`

```text
WAVE 2 ADMINS: THE ACTIVITY RECORD (the Admins room's second wave, Sep
28 2026; AJ "all yes" to "an Activity record ... every standard edit,
publish, admin grant and assisted change is signed with who, what, when
and before and after"). One document per change made from the Admins
dashboard (src/features/admins/activity/, written only by logActivity):
  { at, by: { uid, name }, studioId, kind, what, before?, after? }
APPEND-ONLY: created by administrators, signed with their Auth uid and
the server's time; never updated, never deleted. Read by administrators,
and by a studio's leaders for their own studio's entries (studioId is
that studio; a company entry has studioId null and is administrators'
alone). A leader's list query names the studio (where studioId == s).
Cheap shape checks first; isSuperAdmin() (document reads) runs last.
```

<a id="studios-studioid-setupitems-itemid"></a>
### `match /studios/{studioId}/setupItems/{itemId}`

```text
WAVE 2 ADMINS: A STUDIO'S SETUP CHECKLIST (Opening a studio, the Admins
room's second wave, Sep 28 2026; AJ "all yes" to "a studio's stage and
setup items"). The checklist's template lives in the app
(src/features/admins/launches/checklist.ts); a document here records
what an administrator did to an item — ticked it, skipped it with its
reason — or an item one added:
  { block, title, dueOn, doneAt, doneBy: { uid, name }, skipReason? }
Administrators write (each item whole; a template item's document is
deleted to put it back); the studio's leaders read. `doneBy` names the
caller when it changes, and may stay as it was when another
administrator edits the item. The stage and opening day live on the
studio document, which the studio rule already lets administrators
write. No owner field (AJ, q1: "we dont need to track who set up a
studio"). Cheap shape checks first; isSuperAdmin() runs last.
```

<a id="adminhome-itemkey"></a>
### `match /adminHome/{itemKey}`

```text
WAVE 2 ADMINS: HOME'S TAKE IT / SNOOZE / DISMISS (the Admins room's
second wave, Sep 28 2026; AJ "all yes" to "small records for Home's
Take it, Snooze and Dismiss"). One document per mark, shared by every
administrator (src/features/admins/home/home-marks.ts; written only by
home-marks-store.ts):
  { state: taken | snoozed | dismissed, by: { uid, name }, until?, reason?, at }
The id is the item's kind and a hash of its condition, so a mark holds
for that condition only. A snooze says until when; a dismiss says why.
Written whole, signed with the Auth uid and the server's time; Let it
go, Bring it back, Undo and an ended condition delete it.
Administrators only, reading and writing.
```

<a id="announcementreads-uid"></a>
### `match /announcementReads/{uid}`

```text
ANNOUNCEMENTS

Learning + Planner round, Sep 2026: posting and editing were open to
any signed-in user with the right field names -- anyone could post to
every studio, or rewrite someone else's notice. Now they follow the
app (the franchise partition, Oct 2026): administrators post anywhere
and change any notice; a studio's leaders and franchise owner post to
that studio, a franchise owner to a network whose every studio they
run, under their own name; after that, anyone but an administrator
only takes a notice down; only administrators delete one. Everyone
else may do the one thing the bell does: add THEMSELVES, by sign-in
id, to readBy, and nothing more.
ANNOUNCEMENT READ-MARKS (the cost plan, Sep 26 2026, D5). The bell
marks what a person opened in ONE document of their own, not in each
announcement's readBy: every iPad in the company watches every
announcement, so a stamp there reached all of them. Only the person
reads or writes theirs; it holds a map of announcement ids and a time.
RELAY'S THIRD WAVE (Sep 29 2026, q7): `acks` beside `ids` -- the
notices this person said "I've read it" to, id -> the server's time,
private in the same way. The poster never counts them.
```

<a id="announcementacksreadable"></a>
### `function announcementAcksReadable`

```text
WHO HAS READ A NOTICE (the Atlas answers, Oct 2 2026). A person's "I've
read it" on a notice that asks is ALSO written here, by that person
alone, so the poster and the studio's leaders can see "9 of 12 have
read it" (src/features/admin/announcements/read-count.ts). Nobody is
pinged. The poster, administrators and the leaders of the notice's
studio (its franchise owner included; the franchise partition, Oct
2026) read it -- a network notice's count is its author's and
administrators' only; the reader writes only their own, stamped with
the server's time; nobody deletes one. The caller is resolved once
(getRole, callerTrainer) to stay inside the budget.
```
