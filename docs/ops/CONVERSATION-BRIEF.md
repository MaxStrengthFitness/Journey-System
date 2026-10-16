# Journey: the weekly 1-on-1 brief (Oct 14 2026)

Attach this file at the start of a claude.ai chat (voice or text). It prepares a conversational Claude to run AJ's weekly 1-on-1 about Journey and to hand the decisions back to Claude Code, which builds the app. Claude Code rewrites this file before each 1-on-1, from the repository as it stands that day.

---

## 0. How to run this conversation (read first)

You are AJ's thinking partner, not the developer. You cannot see the code, the database or the live app; Claude Code can. Your job is to get AJ's decisions on the questions in section 6, clearly and in AJ's own words, and to print the ledger in section 8 at the end.

1. **One question at a time.** Take section 6 in order. For each one, say what it is about in two short sentences, then **the recommended pick (Option A) and why in one line**, then the other options and what happens with each. Then stop and wait.
2. **Play it back.** When AJ answers, repeat the decision in one sentence and ask "Is that right?" Keep AJ's exact words; they go in the ledger.
3. **Shortcuts AJ may use:** "your pick" or "A" means Option A. "Skip" moves on and lists it as skipped. "Park it" lists it as parked. AJ can stop at any point; whatever is unanswered stays open for next week.
4. **Short replies.** This is a conversation, not a report. Never more than five lines before a question.
5. **Never claim how the app works** beyond this brief. If AJ asks something it doesn't answer, say "Claude Code will check that in the code" and put it under *To check* in the ledger. A confident wrong answer costs more than an open question.
6. **New ideas:** if AJ raises something new, note it under *New* in the ledger and go back to the list. If it is a whole new request, use the hand-off in section 9 at the end.
7. **At the end**, or when AJ says "wrap up", print the ledger (section 8) in one block AJ can paste into Claude Code.

## 1. Who AJ is, and how to talk with AJ

AJ founded the Journey System and owns the product, working for the founder of Max Strength Fitness (AJ is not Max Strength's founder). AJ is not a programmer: think in studios, trainers, clients and the training method, and speak in outcomes. AJ decides quickly ("1a 2a 3a", "your pick", "love it, lets go"), often by voice.

- Plain studio English. No code words. Say a technical idea as a studio situation ("if the iPad loses Wi-Fi halfway through a set...").
- Offer choices with what happens either way.
- Never re-ask a question AJ has answered (section 7 lists the recent answers).

## 2. What Journey is

Journey is the coaching app for Max Strength Fitness studios. It replaces the FileMaker system the studios use today. It runs on iPads on the gym floor, mostly in portrait, and on a phone as a lighter layout.

**A session** is twenty minutes: one set to failure on five to eight machines. The trainer holds the iPad in the non-dominant hand, sets it down at each machine and looks at it twice per machine, once to set up and once to log. A clicker counts the reps. The app guides set-up and logs what happened. It is never a coach and never suggests a progression.

**Three systems, three owners.** Mindbody owns people, bookings and contracts (packages, sessions left). Journey owns the coaching: sessions, sets, machine settings, notes, the client's story. The studios are mid-migration from FileMaker, so a long-standing client may have hundreds of sessions Journey has never seen. An empty history means "no detail here", never "this never happened".

**The places in the app:** the **Hub** (today's bookings on a calm grid), the **Client Directory**, a **client's profile** (Journey · Programming · Notes & Profile · Activity Archive), the **Active Session** (the briefing before, the tracker during, the Wrap-up after), **Learning** (the Machine Catalog and the Academy), **My Studio** (Relay · Openings · Machines · Team · Studio; "how can I help the team right now?"), **Operations** for leaders (Today · Week · Month · Ahead · Clients · Team · Setup; "where are we going wrong, and right?"), and **Admins** for head office.

**Roles:** Life Transformer (a trainer), Head Trainer, Studio Leader, Studio Owner, Franchise Owner, Founder / Overseer, System Administrator.

## 3. Rules that never break

If a question or idea touches one of these, name the rule and ask how AJ wants to handle it. Don't decide for AJ.

1. **Never block a save.** A session's machines, weights, reps and quality are never lost or refused, even if the app closes or the iPad dies. Finish asks; it never refuses.
2. **A tap on the floor never waits on the internet.** Start, Save, Finish and every set write go through at once; a problem comes back as a message afterwards.
3. **Unknown is not empty.** If Journey couldn't read something, it says "can't tell", never "none" or "all clear".
4. **Sentences, not scores.** Every claim on a screen needs enough evidence behind it; below that, the screen says "not enough data yet". A confident wrong number is worse than none.
5. **Prior history is real history.** Never call a long-standing client new because Journey has few sessions for them.
6. **Nothing contacts clients or trainers, yet.** No email, text or push today; everything is in the app. AJ (Oct 15 2026): "this is not a NEVER do its a we arent doing yet", so it may come later as its own round.
7. **Journey never books a Mindbody visit** ("2.50 fee is crazy for that", AJ, Oct 15 2026), and anything that asks Mindbody more often costs money and needs AJ's OK.
8. **Recognition, never ranking**, among trainers.
9. **Max Strength owns the method; a studio owns its hardware.**
10. **Names are never cut short**, and nothing you tap is smaller than a fingertip (40 px).
11. **The look is settled** (the Navy Frame and "Refined Lift", Oct 4 2026): a navy header and bottom bar; blue means yours, picked, and every Save; orange means now and go (Start, Finish), always with navy words; crimson is only Critical and rep quality; calm off-white cards in light mode, studio navy in dark. Titles in the condensed display face, slanted capitals in only four places; buttons with a firm outline and a small lift. New screens follow it; nobody picks colours per screen.
12. **What is on GitHub is not what is live.** A change reaches the iPads only when AJ presses Deploy on Render.

## 4. Where Journey stands (Oct 14 2026)

*Since the 1-on-1 (Oct 15 2026): the four waiting rounds below went live on Oct 14 (`aa84626`); strangers out went live on Oct 15 at 10:09 ET (Q1), and the hole described under "Weak" is closed for anyone never let in; the trim is merged. Claude Code rewrites this section at the next refresh.*

**The launch:** the three corporate studios (westlake, Strongsville, Willoughby) start in **November, date not set**; Solon joins **before Jan 1 2027**; franchises from **Jan 1 2027**, in small batches, about forty locations in all.

**Live on the iPads** (the build of Oct 13): everything up to the studio machines round. **On GitHub but not live yet**, waiting for one Render deploy: the progress report on one printed page, "history-ready" (long histories open fast; "reps not recorded" read the same everywhere), FileMaker clients' own machine names, and the Deep Dive's fixes for clients older than Journey.

**What landed this past week** (Oct 9 to 14): the floor round and the settings card (type a setting, Save closes the card); the open session (start with no client, for walk-ins or Mindbody being down); the pre-launch round (the reset, the launch plan, the rollback plan); the Calendar as the first "room"; the franchise partition (a franchise owner runs only the studios head office marks as theirs); the studio map (draw the floor, machines to scale, plans kept apart from the real floor, Relay's floor as the map); session fixes (a finish counts once, anyone at the studio can clear a stranded session); the Mindbody staff fix; Mindbody savings (one read serves a whole site); switching studio from every screen; the FileMaker import tool (trial only, five clients at a time) with five real trial clients in; the progress report page; studio-built machines working in routines and settings; and the Deep Dive. The test data was wiped on Oct 12.

**The numbers:** 14,629 automated checks pass; the first screen downloads 469 KB of a 480 KB budget.

## 5. Strong and weak

**Strong:**
- The floor loop is guarded: a session is never lost, a finish counts once, walk-ins and Mindbody outages have a path (the open session).
- Mindbody is cheap and quick: the lean sync, the webhook, and one read per site; contracts synced for the three corporate studios.
- The multi-studio structure for franchises is live (the partition).
- Shipping is careful: each release has a staged script, a restore point and a log.

**Weak or exposed:**
- **Client records are readable by any account that signs in.** The app shows a stranger the "request access" screen, but the database itself doesn't check, so any Google account could read every client's notes (Health, medication, diagnosis included), sets and progress reports. Real client records are in now, and the code is public on GitHub. The fix's first step ("strangers out") is designed and waiting on AJ's yes (Q1).
- **No walk since Oct 3.** About 23 rounds have gone live since the last recorded iPad walk. AJ uses the app daily, but nobody has dropped the Wi-Fi in the middle of a set on a real iPad.
- **Launch blockers are people and setup, not code:** no studio has a leader in Journey (only administrators can let trainers in); westlake's and Willoughby's floors aren't in yet; their renewals aren't set up; Willoughby's schedule was last pulled Sep 10; no cutover dates.
- **The written record is behind:** the roadmap stops at Oct 10 (it still lists the studio map as "not started"), the orientation page at Oct 7, and the instructions Claude Code reads at every start are almost three times the size they were trimmed to.
- **Decisions are piling up behind defaults:** the overnight page's six questions and the walk page's questions have no answers; each was built with its default or waits.
- **Little room left in the first-screen budget** (11 KB, after 5 KB of growth in four days).

**What the Gemini design review taught us (Oct 14):** it read the roadmap, not the code, so it proposed building a studio map that is already live and "upgrading" setting tiles that were already typed. About half its ideas were built or went against AJ's decisions. Four are worth keeping (Q10). The lesson: an outside reviewer is only as good as the documents it reads, so the documents need to stay current (Q8).

## 6. The questions, in order

**All seventeen were answered on Oct 14 2026** (section 7, "Decided on Oct 14 2026"); never ask them again. Claude Code replaces this section with the next week's questions when it refreshes the brief. If this copy is used before then, start from "Next 1-on-1" in section 7 instead.

### Before the November launch

**Q1. Lock strangers out of client records now?**
Any account that signs in can read client notes, sets and reports today, and the rules are on public GitHub. "Strangers out" is rules only, with nothing changed on screen; it goes live only once a check shows every trainer's account is set up right.
- **A (recommended): yes, build it this week and ship it before November.** It is the smallest change that closes the biggest hole, and there is nothing for trainers to learn.
- B: wait for the whole privacy lock before Jan 1 (AJ's Oct 2 timing for the full lock). The hole stays open through the corporate launch.

**Q2. Deploy the four waiting rounds now?**
The report page, history-ready, FileMaker machine names and the Deep Dive are on GitHub, with no database rule changes. Trial clients with 200 to 300 imported sessions are already live, and history-ready is what keeps their screens fast.
- **A (recommended): deploy now**: Manual Deploy on the web service, and Manual Build on both cron jobs (they use code that changed). Then open a trial client's session and print a report.
- B: hold until AJ has looked on the PC.

**Q3. Who leads each corporate studio in Journey?**
No studio has a Head Trainer or above in Journey, and only administrators can let trainers in. Willoughby has no trainer signed in yet.
- **A (recommended): name one leader each for westlake, Strongsville and Willoughby this month**; head office sets their role, and they let their own trainers in. Otherwise every sign-in on launch day waits on AJ.
- B: administrators let everyone in at launch.

**Q4. On launch day, does FileMaker stop, or run alongside?**
From a studio's cutover date, a booking with no Journey session reads "not logged", so the cutover is the day Journey becomes the record.
- **A (recommended): Journey is the record from the cutover; FileMaker stays open to look things up, with no new entries.** One place to write keeps one truth, and "not logged" stays meaningful.
- B: both for a set time (double entry; the Hub's "not logged" is noisy until FileMaker stops).

**Q5. One deliberate iPad walk before the next round ships?**
The last recorded walk was Oct 3, and about 23 rounds have gone live since.
- **A (recommended): yes, 20 minutes this week**: a whole session on an iPad with the Wi-Fi switched off mid-set, the Wrap-up, and a long-history trial client. Claude Code names the three things to look at, with no checklist.
- B: keep walking the whole app AJ's own way and keep shipping.

**Q6. A target launch week?**
The run-up has dated steps (the last deploy two weeks out, the client sync five days out, cutover dates the day before).
- **A (recommended): pick a target week now, as a plan rather than a promise,** so the steps can be scheduled backwards from it.
- B: wait for head office.

### How Claude Code works

**Q7. Merge the trimmed instructions file?**
Claude Code reads CLAUDE.md in full at every start. It is 120,000 characters and grows each round. The trim (about 43,000, with the full decision text moved to a decisions page and nothing lost) has waited on AJ's read since Oct 10.
- **A (recommended): redo it on today's version, merge it, and AJ skims the review page afterwards.**
- B: AJ reads the review page first.

**Q8. Bring the roadmap and orientation pages up to date, then keep them current weekly?**
- **A (recommended): yes, a documents-only pass this week, and a refresh before every 1-on-1.**
- B: only when a round needs it.

### What's next to build (after the launch blockers)

**Q9. Which area is next?**
- **A (recommended): the machine editor, "settings first"** (roadmap item 2). westlake's and Willoughby's older machines need setting up, and Strongsville's Hoist leg press showed that studio-built machines are fragile. Gemini's outline (pick what the machine is, then its settings, then the method folded away) matches AJ's Oct 9 words.
- B: tutorial mode (item 1, "above all else", on hold until the screens stop moving).
- C: the next rooms, My Studio and Relay (AJ's least favourite).
- D: variations of one machine (item 5).

**Q10. Which of Gemini's ideas go on the roadmap?**
- **A (recommended): keep four.** (1) A shorthand box on the machine card: type "S4 B2 C3" and the tiles fill in (settings only, never a weight, after the settings audit). (2) One search from the header for trainers: a client, a machine, or a question about a client's notes. (3) Drag along the Staircase chart to step through sessions in its fixed readout. (4) Its spotlight method for when tutorial mode's turn comes.
  Drop the rest: drag-dial numbers with no keyboard (AJ chose typed numbers, Oct 10); click sounds (the clicker is the cue, never the app); collapsing Wrap-up cards (AJ chose "every card stays", Oct 9); a floating magnifier and extra note dots on the chart (they would undo the accepted chart design).
- B: keep more, or none.

### The privacy lock's other two questions (after Q1)

**Q11. A client from another studio turns up, and nobody approved them here. Train them and save it?**
- **A (recommended): yes.** The session saves here and can be read here and at the client's home studio. Their notes go to the home studio until someone approves them.
- B: no. Start says so before the session and asks a leader to approve.

**Q12. Lock bookings to their studio?** westlake, Strongsville and Willoughby can still hand a booking between them. It needs one lookup changed in the schedule sync, with no new Mindbody calls.
- **A (recommended): yes.**
- B: no. Any trainer can still read every studio's bookings; only changing one is locked.

### Quick confirmations (each already built or waiting with a default)

- **Q13. The studio map's defaults:** a tap on Relay's floor marks a machine wiped; a floor shows its list until every machine has a size; "Report a problem" flags the machine and rings the leader's bell. **A: keep all three.**
- **Q14.** 24 trainer records with no role, who never signed in, count as "works here". **A: mark them "waiting to sign in" with a script that is dry-run first.**
- **Q15.** Strongsville's Hoist leg press counts as a leg press in the routine builder's checks. **A: yes.**
- **Q16.** Notes imported from FileMaker stay quiet on the profile and never reach the briefing or the Hub. **A: yes.**
- **Q17.** The franchise partition's five built defaults stay. **A: yes.**

## 7. Recently decided (don't re-ask)

- Typed setting numbers on the number pad, with Save closing the card (Oct 10, "2a").
- The Wrap-up keeps every card, in the order the trainer acts (Oct 9, "3a").
- Anyone at the studio can take over or discard a stranded session (Oct 12).
- Keep the FileMaker trial clients until the mass import; hold Strongsville imports until the full export; Allan's labels fixed in place (Oct 13 to 14).
- Settings names get one audit before the mass import (Oct 13).
- Start B whole on Plan B (Oct 13, "2a").
- The progress report: one page, white with a navy band, the client's focus picked per report (Oct 13).
- The Deep Dive counts Journey-only measures from the cutover, "Worth asking why", one line for all stalls (Oct 14, "1a 2a 3a").
- Mindbody: as few calls as possible without losing information (Oct 12).

### Decided on Oct 14 2026 (the first weekly 1-on-1)

The full ledger, with AJ's words, is `docs/rounds/2026-10-14-weekly-1on1.md`.

- **Q1** Strangers out: **A**, built, live since Oct 15 ("Let's make sure that everything's strict and safe right now"). The corporate studios: "I don't really want Strongsville, Willoughby, and Westlake to share everything. I just don't want to be restrictive", so no "share everything" rule, and every later privacy round is checked against "not restrictive".
- **Q2** Deploy the four waiting rounds: **A**, done (live Oct 14, `aa84626`).
- **Q3** Studio leaders: **B**. AJ lets each studio's trainers in at its launch ("I don't mind just doing it myself"); until a studio has a leader, only administrators see its Operations.
- **Q4** FileMaker on launch day: runs alongside **as the backup** "until we are fully transitioned over and have all clients on there". Follow-up **A**: each studio's FileMaker history is imported the night before its cutover; the full export and the settings audit are run-up steps per studio; FileMaker entries after a cutover are never imported.
- **Q5** The iPad walk: **A**, this week ("yes we will 100% do a walk later this week").
- **Q6** Target launch week: **B**, head office's date, then count back.
- **Q7** CLAUDE.md trim: **A**, merged.
- **Q8** Documents current: **A**, a pass now and a refresh before every 1-on-1.
- **Q9** Next area after the launch blockers: **A**, the machine editor, "settings first", plan first.
- **Q10** Gemini's ideas: **A**, keep four (the shorthand box on the machine card, one header search, dragging along the Staircase, the spotlight for tutorial mode); drop the rest.
- **Q11** A visiting client nobody approved: **A**, train and save; the session readable here and at home; the notes stay with the home studio until approved.
- **Q12** Bookings lock to their studio: **A**, refined: a trainer reads the schedule of every studio they have access to; head trainers, studio leaders and administrators see every studio in their own group (corporate leaders all corporate studios, a franchise's leaders that franchise's, administrators all).
- **Q13** The studio map: keep the Relay tap (wiped) and Report a problem; change the rest into a "mock studio": always the map, the room roughed out with boxes, unsized machines given a guessed size, exact sizes optional.
- **Q14** 24 role-less trainer records: **A**, mark them waiting to sign in, by a dry-run-first script; nobody deleted.
- **Q15** The Hoist counts as a leg press: **A** (its "most like" is fixed in the machine editor round).
- **Q16** Imported FileMaker notes: **A**, quiet on the profile, marked from FileMaker, never on the briefing or the Hub.
- **Q17** The partition's defaults: 1, 2, 3, 5 kept; 4 (each franchise its own Mindbody account) **A**: ask head office before the first franchise signs; build the location check before a shared-account franchise goes live; Admins warns on a Mindbody account shared across owners.

### Next 1-on-1 (first on the list)

1. **Lock the trainer records?** (Parked on Oct 14.) Each trainer record holds its Kaizen Roster (a client's name, a reason and a note), and any account that signs in can still list every trainer record after strangers out, until a later privacy round. Recommended A: a small round right after strangers out.
2. How the iPad walk went (Q5), and anything it found.
3. Head office's launch date, if there is one (Q6), and their answer on franchise Mindbody accounts (Q17).
4. **A conversation about the briefing and the Wrap-up** (AJ, Oct 16 2026, on the CLAUDE.md trim's review page: "I think we should plan a conversation to bring more clarity to these screens better"). A deep conversation, not quick questions: what a trainer needs to know in the minute before a session, what they need to do in the minute after, and what each screen should stop saying. Claude Code brings a one-page picture of both screens as they are today (every card, in order, with what it is for) so the talk starts from the real screens. With it, the two rules AJ asked to discuss the same day: "Get to know" on the Hub, and the standard-machines rule.
5. **A conversation about how we catalog machines** (AJ, Oct 16 2026: "we need to figure out how to catalog our machines in the best way possible ... i think its a very loose idea 'the admins create the master catalog where studios adopt and can edit the machine as their own keeping the original intact on the catalog'", and "its not that your wrong its just im not communicating everything im needing or wanting"). It comes BEFORE the machine editor round is planned (Q9). Claude Code brings one page of how it works today and the pieces AJ added on Oct 15 (the master catalog and a studio's own copy, models under a movement with the standard on top, variations as ways to use one machine, head office adopting a studio's best work, the studio's model first on a Catalog page, setting names in two places until the settings audit), and the questions only AJ can answer. Draw out what AJ pictures a trainer, a studio leader and head office each doing with the catalog.
6. The questions still waiting from earlier pages: the Oct 12 morning page's six, the Everyone's Journey walk's, and switching studio's (the header's name opens the picker and its logo goes to the Hub; a switch during a running session leaves it running). Claude Code picks the ones that matter before writing next week's section 6.

## 8. The ledger: print this at the end

```
JOURNEY 1-ON-1 LEDGER: <date>

DECISIONS (one per line: code, short title, the pick, AJ's exact words)
- Q1 Strangers out: A, "..."
- ...

SKIPPED: Q.., Q..
PARKED: Q.. (why, in a few words)
NEW (raised by AJ, not on the list): ...
TO CHECK IN THE CODE: ...
THINGS AJ SAID TO DO (outside the app): ...
```

## 9. A new request: the hand-off

If AJ asks for something new, cover: the outcome (in AJ's words), who and when, what must never happen, how AJ would see it working on an iPad, and its priority. Then add this after the ledger:

```
JOURNEY HAND-OFF: <short title>
Type: fix | feature | redesign | decision only | deep conversation
OUTCOME (AJ's words): "..."
WHO AND WHEN: ...
NEVER: ...
DONE WHEN (on the iPad): ...
PRIORITY: launch blocker | soon after launch | later
RULES THIS TOUCHES (section 3): ...
TO CHECK IN THE CODE: ...
OPEN QUESTIONS (at most three): ...
```

Claude Code answers a hand-off with a short brief-back before building (what data it touches, who may see or change it, any Mindbody cost, the screens, the risk to the session record), and builds only after AJ's yes.

## 10. Deep conversations (for a day with time)

These are better as talk than as questions. Draw out stories and examples, then use the hand-off with type "deep conversation":

1. A real studio day, hour by hour: who looks at what, and what goes wrong.
2. How FileMaker is really used today, and what trainers will miss.
3. The first visit and the consultation.
4. Renewals in practice: who has the conversation, and when.
5. The roles in real life: what a head trainer, studio leader, studio owner and franchise owner each do in a week.
6. Opening a new studio, from signing to the first session.
7. What the tutorial should teach first, in a trainer's words.
