# The session record

The one thing Journey cannot lose or refuse is a client's session: the machines, their order, the weight, the reps and the quality (AJ, Sep 25 2026). This folder holds what the Active Session uses to keep that promise and to say so. The round is `docs/rounds/2026-09-26-session-record.md`.

## The line under the session bar

`SendStatusStrip` draws one line under the session bar, and only when there is something to say:

- **Offline.** "Everything you enter is saved on this iPad and sends when the connection is back." The sets really are saved there: every set goes into the iPad's own copy of the database as it is sent, and Firestore passes it on when it can.
- **Still sending.** When a save has waited `STILL_SENDING_AFTER_MS` while the iPad thinks it is online (studio Wi-Fi with no internet behind it), the line says the sets are saved on the iPad and still going.
- Otherwise nothing. An ordinary save never shows it.

The line sits at the top so it never covers the Now Bar's buttons at the bottom of the screen. It is never red, because red on the floor is the rep-quality mark. `send-status.ts` is the rule and its words; `useSendState.ts` is where the facts come from:

- the browser's `online` and `offline` events;
- `waitForPendingWrites`, called each time the tracker says `sent()` after issuing a set's write. Only the newest wait may clear the clock.

It reads nothing and writes nothing.

## Finish never hangs, and never counts twice

`finish-wait.ts`, used by `WorkoutTrackerView`'s `commitEndSession` and its post-session note writes:

- `settleOrQueue` waits up to `FINISH_WAIT_MS` for the database's answer, and not at all while offline. Past that, the save is on the iPad, and the Wrap-up says "saved on this iPad" until the answer comes.
- `finishedElsewhere` asks the server whether another iPad already finished the session. Finish then writes nothing, so the client's totals are never counted twice. Offline, or with no answer, it says no and Finish goes ahead.
- ~~What this cannot stop: an offline Finish that replays after another iPad finished the same session online.~~ AJ judged that extremely unlikely on Sep 26 2026; on Oct 12 2026 the sessions round's audit found the same double count also comes from a take-over from an offline iPad, one trainer on two iPads and two "Finish it as it was", and AJ said "2 and 3 I will trust your decision please be sure!": the database now guards it (below).

## Finish waits for the sets (F22, Oct 17 2026)

AJ's "a" on the three-day review (Oct 16 2026): "Finish waits for the sets". Finish writes every set it holds back with a merge, adds a "not reached" row under the set's own id for each machine it holds nothing for, and counts the totals from what it holds. On a session that reached this iPad by Resume, a take-over or Continue on this iPad, before the server had answered for its sets, that stamped real sets "not reached" and left them out of the client's totals.

- `sets-heard.ts` `setsHeardFor` is the one rule: the sets are **heard** once the tracker's sets listener has had the server's answer for a window holding the session (`logsWindow` "ready"), or when this iPad recorded the session from its Start (`recorded-here.ts`); otherwise **getting** (online), **offline**, or **failed**.
- Until heard, the Finish question says so in one line (`setsWaitWords`) and its button waits ("Getting the sets…"); a failed read offers Try again, which listens again. Keep training and Scrap session stay. Nothing is refused: every set is already saved, and a session left open is finished here once the sets arrive or as it was by anyone at the studio. "Finish it as it was" waits the same way (its button already said "Reading the machines…").
- The "Started, no count" machines are worked out again once the sets are heard, keeping every answer given (`refreshEndChoices`).
- `recorded-here.ts` keeps, in localStorage, the sessions this iPad made (Start, and the Client Directory's Open session): every set of them was typed here, so a Finish offline (the studio's Wi-Fi gone, even after a reload) goes ahead from the iPad's copy as before. The mark comes off when this iPad turns to watching the session, lasts twelve hours, and is forgotten at a sign-out; forgetting only makes a Finish wait for the server.

## A finish is counted once (the sessions round, Oct 12 2026)

The sessions round is `docs/rounds/2026-10-12-sessions.md` (AJ, Oct 12 2026: "Anyone can clear a session"): a finish counted once (this section), a trainer on two devices (Continue on this iPad) and a session left open, cleared by anyone at the studio (both below).

`finish-once.ts`, with `firestore.rules` `finishOnceOk` / `countedOnceOk` and `match /finish/{docId}` (their notes are `docs/ops/RULES-NOTES.md#finishonceok`, `#countedonceok`, `#sessions-finish-once`):

- **The marker.** Finish's session batch (`lib/sync-utils.ts` `completeWorkoutSession`) creates `sessions/{id}/finish/once` = `{ finishId, by: the sign-in uid, at, clientId }`. The rules allow it only when the same request moves the session from not Completed to Completed. The totals batch marks it `{ countedAt, countedBy: finishId }`, once, by the person who made it. A second finish of the same session from the current app is refused whole: no second count, no older sets merged over newer ones, no trainer credit flipped back, no older weights over `clientMachineSettings`.
- **Never block a save.** A first finish passes by construction. On a refusal the server is asked (`readFromServer`, bounded: failed, denied, missing or found, never null for two meanings) and `judgeFinishRefusal` decides: `mine` (a resend that landed: saved), `elsewhere` (`FinishedElsewhereError`), `gone` (`SessionGoneError`), `unmarked` (the session answered there and not Completed and the marker is missing or its read refused by the rules: finished again without the marker, awaited, then the totals without the mark, once), `refused` (anything else: thrown, nothing more written). A refused totals batch reads the marker too (`judgeTotalsRefusal`): counted by this finish is saved; ours and uncounted, the counters alone with the mark, then without it, once, logged `[finish] counted-refused`.
- **What it does not cover:** an iPad still on the old version, a counter written outside Finish, two session documents for one visit. The sessions' own rules do NOT require the marker (that would refuse every old iPad's Finish); the guard lives only in documents the new app writes. **Any branch with its own `firestore.rules` must be merged with this one before its rules ship**: the rules lint fails without `match /finish/{docId}`, and `scripts/ship/ship-sessions.ps1` refuses the deploy.
- **The words** (`finishedElsewhereWords`, `sessionGoneWords`, `finishRefusedWords`, `finishRefusedAgainWords`, `wrapUpRefusedLine`): "It counts once", never system words. A Finish refused after the Wrap-up came up says so in one line there, and the Wrap-up never claims "saved" over it.
- **The session's number** is added at Finish (`sessionCount: increment(1)`), never set to the number shown at Start.
- **The device holding it** (the review and attack, Oct 12 2026; `firestore.rules` `finishFromHolder`). The marker carries the finishing device's id, and the rules take it only from the device the session names (`recordingDeviceId`), from a session no device holds, or once nothing has been saved in it for an hour (left open: anyone at the studio may finish it as it was). After a take-over, the iPad it was taken from can no longer finish first and put its credit and older sets back: `judgeFinishRefusal` says `taken` (`TakenOverError`, "taken over on another device, so it finishes there"), and a session another device holds never goes through the `unmarked` net, which would write past it.
- **Finish it as it was is not the last word.** Its marker says `asItWas: true`. When the iPad that ran the session finishes late (offline until then), its refusal is judged `correct`: the session batch goes again with no marker, no credit change and no totals (`counted: "corrected"`), so its sets, next weights and note land and it still counts once.
- **A finished session keeps who holds it** (`finishedHolderKept`): a take-over, Resume, Continue or heartbeat sent to a session another iPad already finished is refused, and the iPad says it was already finished there (`finishedSinceRefusal`), never "didn't go through".
- **Sets and settings** are written only by whoever can reach the set's session or the settings' client (`logSessionReach`, `machineSettingsClientOk`): before, any signed-in trainer at any studio could blank, rewrite or delete another studio's sets and next weights.

## A trainer on two devices: Continue on this iPad (Oct 12 2026)

- `device.ts` gives each browser an id (`journey_device_id`, read back after it is written, kept through a sign-out); null when it can't be kept. A session carries `recordingDeviceId`, written at Start, Resume, a take-over and Continue.
- `isRecordedElsewhere` (`lib/live-session.ts`): another trainer's session, or this trainer's LIVE session on another device. A null id, or a session with none, is never "another device": a trainer is never locked out.
- `WatchingSession` shows **Continue on this iPad** (the blue of a Save) for the trainer's own session: asked from the button while the other device saved in the last three minutes, asked at once when it is quieter (`continueHereWords`); watching is the default. The words say "another device", never "your other iPad" (the Home Screen app and a Safari tab are two devices to Journey).

## A session left open, cleared by anyone at the studio (Oct 12 2026)

AJ: "Anyone can clear a session". `discard.ts` and the stale question (`features/tracker/StaleSessionDialog.tsx`):

- **Who:** anyone who works at the studio that hosts the session may resume it (a take-over), finish it as it was (a client's session only) or discard it, once it is left open (no sign of life for an hour). A session at another studio is described, never cleared. The rules' reach is wider (the client's home studio and approved studios); that gap is recorded in the rules tests and parked.
- **Discard** asks twice. For someone else's session the server is read when the second question opens (`checkStillLeftOpen`); only "ok" lets the final Discard through. It is ONE batch with every set known and the session (`discardStaleSession`), issued at once, then a sweep. The set ids are read when the question appears (`readSetIds`, the review, Oct 12 2026), so an older session with no machine list still deletes every set with the session; the sweep stays as a second net. A session Paused or At End Session says so above Discard (`quietNoteWords`), and the "last on it" line is `lastOnItWords`, the same in both questions (the profile's and the Active Session's look and read alike).
- **Someone else's session left open today is discarded from the next studio day** (`discardWaitsToday`, the attack, Oct 12 2026): a Finish queued on an iPad that was offline is refused, and lost, if the session was deleted first, and the rules can't tell that from a second finish. Today it can be resumed or finished as it was (which a late real finish still lands over); the trainer's own session can always be discarded.
- **Not now** (someone else's session, any way of closing) leaves it as it is and goes back to the door it came from (`rememberLiveSession`'s `returnTo`, the tracker's `onReturn`).

## Start, Discard, Back to Hub and the machine Save never wait on the network

The speed round (Oct 5 2026, R9 in its blueprint). A write is on the iPad the moment it is made; what can take forever is the database's answer, so nothing a trainer taps waits for one.

- **Start** (`start-plan.ts` is the plan, `WorkoutTrackerView` issues it): the ids are made on the iPad, and the session, its new routine (only when one has to be made) and the prefilled sets go in ONE batch, issued and never awaited. Since the first-session design round (Oct 8 2026, §4.5 and §4.8) the only routine Start makes is Routine A from a starting plan the briefing hands up for a client starting out: EMPTY, the plan carrying day one, with its `start` change, written by `routine-plan/store.ts`'s `addStartPlanToBatch` into the Start batch (the consult is not Routine A). Start never saves today's list as a routine: a client with no routine starts with no routine and today's machines exactly as chosen, an empty session when none were, never the whole floor (`resolveStartRoutine`'s `none`; the session records its empty list, and the seeding reads it as such). A Free session keeps its own behaviour: it records the floor, or no list at all while the floor is still being read, so it takes the floor the moment it is. A routine is found by either spelling of its name (`findRoutineByLetter`), as the briefing finds the one it shows. The screen switches in the same tap, online or off. A refusal comes back through the batch's promise: it is said, and the session leaves the screen. A refusal can come late, after a whole offline session, so the sets typed meanwhile are KEPT (sent if still waiting, never deleted: they are the only record of what the client lifted, and an administrator can recover them), and only the untouched prefills are taken back (`refusedStartSweep`, the speed round's final review). The client's own fields (Routine B, the first session's day) are a SEPARATE write whose failure is logged, because the clients rules limit what a visiting or cross-train trainer may change and one refused field must never take the session down. Routine B is switched on only for a session that runs the client's own Routine B, whether Start knew it at once or the routines answered after (the follow-up issues the same separate write). The arrival note is its own write too. A Routine B planned with the starting lineup (a studio that starts new clients on A and B together, `newClientsStart`) rides in the Start batch beside the plan (`addPlannedBAtStart`), or in the follow-up's batch when the routines answered after Start; when it is written over an EMPTY Routine B of the client's own that was switched on, turning B off is that same separate write (`setRoutineBActive`), never part of the batch (the whole-branch review, Oct 9 2026: a client the rules refuse an update to took the session down with it). A session started before the routines answered keeps what the trainer added meanwhile beside the routine's machines when they come (`followUpList`).
- **Known.** The client's routines and machine settings are known once a snapshot has arrived (cache or server), except that an EMPTY routines answer from the iPad's cache is not known (it may only mean this iPad never read them; the routines listener hears metadata changes so the server confirming an empty list is heard). Until the routines are known Start makes no Routine A (an empty list there is "not read yet", which is how a second, empty Routine A got made); a starting plan handed up then waits, and is kept the moment they are known to hold no Routine A; until the settings are known the prefilled weights wait. A settings read that fails before any answer counts as "no settings", so the last performed weights still prefill. Neither ever holds Start or Finish: the routine and the weights follow the moment they are known.
- **The seed never writes over a set this iPad holds**, so a weight typed while the seed waited is never overwritten when the connection comes back.
- **Discard** is one batch (the sets this iPad holds, every id the session's machines write under, and the session), never awaited; the Hub comes at once. Sets still waiting to be sent for it are dropped first. The legacy `sessionNotes` are no longer touched: nothing writes them, and only an administrator may delete one.
- **This session's notes** on the Wrap-up's tray and the note sheet come from the tracker's journal stream (`session-journal.ts`, R11); a screen reads them itself when the stream failed, is absent, or is the index-less fallback that came back at its limit (`JournalStream.newest`).
- **Back to Hub** from the Wrap-up issues its note writes side by side and goes; each says its own refusal.
- **Finish** starts the "already finished on another iPad?" read when the End Session dialog opens, and at the tap also reads the client's live sessions stream (`finishedElsewhereAtTap`), so starting early never widens the window in which a session could be counted twice.
- **The machine menu's Save** closes at once: "saved" online, "saved on this iPad" offline or once the answer is still out after `FINISH_WAIT_MS`; a later refusal takes the Undo back as before.
- **Open session** (the Client Directory's, a session before the client is chosen; the open session round, Oct 9 2026) is one `setDoc`, issued and never awaited, with no sets seeded; the device remembers it and the Session tab brings it back (`findMyLiveSession` counts it, `resumeSession` follows it), and Open session goes back to a running one rather than starting a second. `src/features/open-session/README.md`.

## Sign-out asks first

`sign-out-check.ts`, used by AppContent's `logOut`:

- `sendSetsNow()` has the Active Session send its waiting sets while the person is still signed in.
- `unsentWritesWaiting` checks whether every save has reached the database.
- `signOutQuestion` asks, in the app's one leave dialog, when the trainer's own session is still open or saves are waiting on the iPad.

A question, never a block.

## Never a blank page

`NothingOnScreen` and `nothing-on-screen.ts` cover the Active Session with nothing to draw: a client still loading, a read that failed, no record, or no session. Each gets the app header, one sentence and the way on. The shell passes `clientLookup` and `onRetryClient` so the tracker knows which case it is.

## Watching, and taking over

A session is recorded by the trainer running it, from any iPad they sign in on; anyone else watches it (AJ, Sep 26 2026: leaders "follow along", and a trainer can always get back into their own session).

- **Whose session it is** is `isAnotherTrainersSession` with `myTrainerIds`, in `src/lib/live-session.ts`. It matches every id a trainer's sessions can carry, and fails toward recording: a session with no trainer, or a person the app cannot identify, is never someone else's.
- **`WatchingSession`** is the Active Session drawn read-only: the session bar without its buttons, one line from `watchWords` (`watch.ts`), the grid with a Today column that only reads, and no Now Bar. `WorkoutTrackerView` holds the watched session as `watchedSession`, apart from `currentSession`, so nothing that records runs while watching.
- **Take over** asks first (`takeOverWords`), then writes `takeOverPatch`: the new trainer, with `startedByTrainerId` kept, and this device's id (Oct 12 2026). Finish credits whoever finishes, as it always has. The iPad it was taken from sends its waiting sets and turns to watching.
- `sessionMachineList`, `firstOpenMachine` and `machinesDone` are what the watching screen reads off the session, by the same rules as the recording screen. `sessionMachineList` follows the tracker's seeding rule exactly (the first-session design round, Oct 8 2026): an empty list on record with no routine is a session started with nothing chosen and draws empty, never the floor; a routine with no list on record runs `todayFor` (its machines, else its plan's day one); only an older session with no list and no routine takes the floor. `whoStartedIt` names the starter after a take-over, for the profile's menu and the session pop-up (Activity Archive → Calendar or Sessions).

## Related pieces elsewhere

- `src/lib/pending-log-edits.ts`: a set whose write is still queued keeps what the trainer typed when another machine's save lands.
- `src/features/journey-grid/send-at-once.ts` and `SessionNowBar`'s `onCommit`: a set is sent the moment it is entered, not after the typing wait.
