# Relay and My Studio: the rules

*Collected Oct 16 2026 for the design overhaul of Relay and My Studio (AJ: "we need to collect all rules about that so we can be consistent"), from `oct16/docs`. Each rule gives its source and, when a test enforces it, the test that fails if the overhaul breaks it ("—": no test). Test names are unique in `src/`. When a test fails, fix the screen or stylesheet, unless AJ changes the rule. Nothing here is invented; a reading rather than a written rule says "unsure".*

## 1. What each place is for

**The yardstick for all of it.** AJ, Oct 16 2026: "Trainer mode is where you handle clients sessions and notes. Operations mode is where you handle the studio, retention and making sure everything is going as planned or set too. Admin mode is to control the app and control the studios ... Studios do have freedom and the app needs to allow the trainer to have full control of what they are working with. In its most basic terms the app is meant to record data and allow trainers to learn from it. its not something to force trainers to do something specific or a gotcha type trap meant to have tyranny over the trainers, this is a tool that we the trainers can use to really help our clients." And the same day: "it is their studio at the end of the day, we are just the name on the sign" (a studio changes its basic things itself; head office can see and audit them). Every screen in the overhaul is held to this (`docs/START-HERE.md` §1; `docs/DECISIONS.md`).

**My Studio, and Operations.** AJ, Sep 18 2026: "My Studio is where you run the studio; Operations is where you look at it"; "each studio should have full insight and control over its own studio". Sep 21: My Studio is "a place the team can actively go when they need to ask themselves how can I help the team right now … Operations is more of let's locate the problems". So My Studio is present tense: today, what everyone is doing, what's coming, our machines. A panel that diagnoses belongs on Operations; one that helps someone pitch in belongs here. Sections: Relay · Openings · Machines · Team · Studio (`src/features/my-studio/`).

**Relay.** AJ's brief, Sep 16: it "must eliminate off-clock digital alerts and act as an asynchronous 'hive mind' and 'second brain' for the studio", with trainers doing cleaning, maintenance and opening and closing "during natural schedule gaps without requiring micro-management". Sep 27: "Relay must prioritize the trainers transitioning between clients. Leaders running the day have operations and the hub to rely on." Oct 3: "this is replacing the laminated paper of a to-do list". Three tabs, from AJ's "a mission board, a mission tracker and a full on journal": the **Board** (the studio's day), the **Tracker** (your work, by when), the **Journal** (your notes, day logs, the Studio shelf). A board, not a chat thread, because trainers are never all on the floor at once.

**Openings.** When the studio is usually busy, what opened up in the next 7 days, a regular time to offer a client, who's usually in. AJ wanted "what our regular times are and our busy times are"; Sep 27: "love it, lets go". It only reads: no booking, no Mindbody call, no ping (`src/features/openings/`).

**Machines.** The studio's floor and its own version of each machine. AJ, Oct 11: "yes id love an interactive map because the trainers know where all the machines are they dont remember them alphabetically"; a tap is how people "learn, clean, maintaince the machines"; "the my studio map will hold the unique to that studio version" (`src/features/studio-map/`, `src/features/machine-card/`).

**Team.** People and standards. AJ, Sep 27: "Execute the people and standards pivot. Stripping out the hub and operations duplicate gives the team tab a distinct standalone purpose." Each person's week, the staff and who waits to be let in, standing duties, initiatives, open loops, the vault. The team is "everyone who works there" (`src/lib/who-works-here.ts`).

**Studio.** The studio's own record and numbers. AJ, Sep 28: "Leaders edit it; trainers can view it read-only. Studio settings are edited here and nowhere else." Each number sits over head office's default ("let the admins assign the default within the app"; `src/features/studio-settings/`).

## 2. The rules

### Purpose and placement

- **P1. A leader-only view never goes on Relay.** Who's in today is the Hub's; the month's client groups (renewals, attendance, moments, Delight) are Operations'; neither returns to Relay or Team.
  Source: AJ, Sep 27 2026 (DECISIONS, Team and Relay). Held by: —
- **P2. The network is Operations'.** The quarter's focus and initiatives everywhere live on Operations → All my studios; the Board shows only the focus line at its foot. Studios are never ranked.
  Source: Sep 27 2026. Held by: `planner.render.test.tsx`
- **P3. A studio's settings are edited once, here, with one save bar; nothing on Operations is a second editor.** A panel that moves in really moves.
  Source: AJ, Sep 18 and 28 2026. Held by: —
- **P4. Head office's fields show here locked:** the Mindbody Site ID and location ("Head office sets the Mindbody link (Admins → Studios)") and the schedule's pull rate.
  Source: partition, Oct 10 2026, kept Oct 14 (Q17); AJ, Sep 28 2026. Held by: rules tests
- **P5. One floor editor, two doors:** Operations → Setup → Floor mounts the same Machines section, so it must draw without My Studio's shell.
  Source: AJ, Sep 19 2026. Held by: `css-imports.test.ts`, `look.test.ts` (my-studio), `AdminDashboardView.render.test.tsx`
- **P6. Machines are adopted from the MSF standard, never pushed;** fields, settings and routines inherit unless overridden.
  Source: AJ, Sep 18 2026. Held by: `floor.test.ts`
- **P7. Team keeps one line and a door for free slots** ("3 free slots in the next 7 days · See them on Openings."); the list is Openings'.
  Source: AJ, Sep 27 2026: "perfect". Held by: `MyStudioOpenings.render.test.tsx`
- **P8. One machine card from every door: Learn · Clean · Maintain · Set up.** The door only decides which part opens first (Relay: Clean; My Studio: Set up). It is the studio's machine, not the machine menu (a client on a machine).
  Source: AJ, Oct 11 2026: "1a". Held by: `parts.test.ts`, `MachineCard.render.test.tsx`
- **P9. Machines opens on the map once there is one with a machine on it** (Map | List; always the list on a phone). Arranging the floor is rare and a leader's, never on Relay.
  Source: AJ, Oct 11 2026 ("Map first: yes"; rearranging "EXTREMELY rare"). Held by: `MachinesSection.render.test.tsx`
- **P10. On the Board the floor sits under today's cards,** folded to one line until a machine wants a wipe, a deep clean or is flagged.
  Source: Relay Board rebuild, Oct 3 2026. Held by: —

### Who sees and changes what

- **W1. Relay is everyone's; its leader controls follow `leadsHere`** (`relay/leads.ts`, mirroring the rules): Put a name on it, the Who? faces, a studio task or team job under +.
  Source: AJ, Sep 28 2026 (q5). Held by: rules tests
- **W2. Openings is for everyone who may read the studio's standing weeks** (`mayReadWeeks`).
  Source: Sep 27 2026. Held by: `MyStudioOpenings.render.test.tsx`
- **W3. Machines: everyone reads and writes floor notes; leaders change the floor, set-up, sizes and Out of service.** Every card part shows for everyone; only what's inside changes.
  Source: AJ, Sep 18 2026. Held by: `planner.render.test.tsx`, `MachineCard.render.test.tsx`
- **W4. Team is the studio tier** (head trainer, studio leader, studio owner there, or the grant). The grant opens My Studio's leader sections, never Operations.
  Source: AJ, Sep 18 2026. Held by: `planner.render.test.tsx`
- **W5. Studio is read by everyone who works there, changed by its leaders.** Readers see fields locked in full ink (`.ms__readonly`), no save bar or Publish, and who changes each panel. Activity shows to the studio tier only.
  Source: AJ, Sep 28 2026. Held by: `planner.render.test.tsx`, `InBodyVariationPanel.render.test.tsx`, `StudioActivityPanel.render.test.tsx`
- **W6. A menu is not a gate:** each section checks who may open it; the rules are the boundary.
  Source: CLAUDE.md. Held by: `MyStudioOpenings.render.test.tsx`, rules tests
- **W7. Permissions stay relaxed in the beta:** "Let's more worry about features rather than permission restrictions" (Sep 18); "keep it relaxed and we will tighten up later" (Sep 27); "I just don't want to be restrictive" (Oct 14).
  Held by: —
- **W8. Trainers' names show to everyone; a client's name only after a tap** (a courtesy to the client at the iPad); Times with room shows times only.
  Source: AJ, Sep 27 2026. Held by: `NextDaysPart.render.test.tsx`, `WhosInPart.render.test.tsx`, `TimesWithRoomSheet.render.test.tsx`
- **W9. Leaders hand out trainer, head trainer, studio leader and the grant, "never owner and admin";** the grant only on Team; one staff editor for Team and Operations; notices to their own studio only.
  Source: AJ, Sep 18 2026. Held by: rules tests
- **W10. Private stays private:** a trainer's Journal, a leader's notes about a trainer, the vault (leaders'); sharing is a copy; kudos show to leaders and the person. Rules pin people by the Auth uid.
  Source: Sep 16; Oct 2–3 2026. Held by: rules tests

### Behaviour

- **B1. Nothing pings anyone.** In-app bells ring only for a leader's hand-off (once), a claim and a close (to the asker), a flagged machine (to the leader), your own reminder, a comment tag. Kudos and reactions never ring; nothing is pushed, texted or emailed.
  Source: Sep 16 brief; Oct 2 2026 (kudos: "A heart, no bell notification"). Held by: `AskSheet.render.test.tsx`
- **B2. Outreach: "not a NEVER do its a we arent doing yet"**: in-app only, for now.
  Source: AJ, Oct 15 2026. Held by: —
- **B3. Trainers offer; leaders assign.** A leader's job arrives already yours, with "I can't", never "Take it · Not me · Later". Only an explicit Take it claims work.
  Source: AJ, Sep 28 and Oct 2 2026; restated Oct 16 2026: "Trainers can ask for help but leaders can assign work". Held by: `AskSheet.render.test.tsx`, `ask.test.ts`
- **B4. The Board is the plan; nothing is dealt.** Parts of the day (Opening · Between clients · Close · This week), four columns (Floor · Desk · Clients · Team), one checkbox card.
  Source: AJ, Oct 3 2026: "No, the board is the plan", "Checkbox card", "One part of the day at a time". Held by: `cards.test.ts`, `Board.render.test.tsx`
- **B5. The box finishes in one tap with an eight-second Undo, or (dashed) opens what one tap can't.** Every tick and pass-back can be undone. Nothing locks: anyone at the studio may tick or close.
  Source: AJ, Oct 3 2026 ("Box opens the job"). Held by: `Board.render.test.tsx`
- **B6. A question about a client is answered, not ticked:** a thread on their record, each line by its author, closed by the answer.
  Source: AJ, Sep 28 2026: "yes yes yes". Held by: `AskSheet.render.test.tsx`
- **B7. Cleaning "doesn't need to be that military".** Wiped and Deep cleaned in days; Mark all in one tap; Relay's floor opens in Cleaning and a tap marks wiped; Report a problem flags the machine and rings the leader.
  Source: AJ, Oct 11 2026; kept Oct 14 (Q13: "definitely"). Held by: `cards.test.ts`, `cleaning.test.ts`, `FloorMapView.render.test.tsx`
- **B8. Never book.** Nothing is written to Mindbody; never a visit ("2.50 fee is crazy for that"). Every offer ends "Check it in Mindbody before you promise it. Journey doesn't book."
  Source: AJ, Sep 27 and Oct 15 2026. Held by: `present.test.ts` (openings), `NextDaysPart.render.test.tsx`
- **B9. The standing week is a check:** proposed on My Profile, agreed on Team; only agreed weeks of current staff are checked; days away block slots; "schedules are open to all".
  Source: AJ, Sep 27 2026. Held by: `check.test.ts`, `team.test.ts`
- **B10. Unknown is never empty.** Loading, failed, offline or cache-only reads say "can't tell", never "nothing" or "open".
  Source: CLAUDE.md. Held by: `Board.render.test.tsx`, `Tracker.render.test.tsx`, `NextDaysPart.render.test.tsx`, `StandingWeeksPanel.offline.render.test.tsx`, `since.test.ts`
- **B11. "New to the studio" means a first-ever visit, never a first Journey session.**
  Source: second Relay wave, Sep 28 2026. Held by: `since.test.ts`
- **B12. Retire, never delete** (machines, floor notes, layouts); a wrong tick is reopened.
  Source: AJ, Oct 2 2026; the rounds. Held by: rules tests, `store.test.ts` (studio-map)
- **B13. A notice that asks "I've read it" stays new until answered;** Mark all read answers it; leaders see "9 of 12 have read it".
  Source: AJ, Oct 2 2026. Held by: `since.test.ts`, `SinceYouWereIn.render.test.tsx`
- **B14. Moving between sections asks about typing first** (`openMyStudioSection`); the section, tab, part and map mode are remembered until sign-out; bells land on Relay; the view id `studio-tasks` and tab ids `floor` · `mine` · `notes` never change.
  Source: my-studio and relay READMEs. Held by: `MyStudioOpenings.render.test.tsx`, `intent.test.ts`

### Words

- **S1. Sentences, not scores, in plain studio English;** below a named minimum sample, "not enough data yet".
  Source: CLAUDE.md. Held by: `present.test.ts` (openings)
- **S2. Say less.** "Operations says it once" (AJ, Oct 3: "so many words on there. It's really overwhelming") is written for Operations; the Oct 10 Journey Rooms proposal applies it here: Team and Studio "drop their paragraphs to one line each, the rest behind (i)". Unsure: see s2.
  Held by: —
- **S3. Recognition, never ranking:** name order everywhere, no count beside a name, no "Behind", no points, badges, streaks or leaderboards.
  Source: CLAUDE.md; AJ, Sep 27 2026. Held by: `accountability.test.ts`, `hub.test.ts`, `who.test.ts`, `planner.render.test.tsx`
  **Changing (Oct 16 2026):** "we are going to plan to use our app with Teams so we will be moving away from this rule and how comments are made on things like this, not to be confused with notes": kudos and comments move to Teams; a client's notes stay in Journey. Whether "never ranking" itself stays is open (question 12 below).
- **S4. Cleaning and the machine card never say who wiped or flagged it, or when to the minute;** never rank, suggest a weight or name a client. Floor notes keep their signed authors.
  Source: AJ, Oct 11 2026. Held by: `cards.test.ts`, `cleaning.test.ts`, `MachineCard.render.test.tsx`
- **S5. A client's pronoun follows their Mindbody gender** (Male he, Female she, else first name or they) through `pronounsFor`; this reversed Oct 3's rule.
  Source: AJ, Oct 15 2026. Held by: `pronouns.test.ts`
- **S6. Names are never cut** (no ellipsis, clamp or one-line cut-off); a row holding a wrapped name has a minimum height.
  Source: CLAUDE.md. Held by: `look.test.ts` (my-studio), `names-wrap.test.ts`
- **S7. Openings' and the standing week's sentences live in their `present.ts`;** no screen types its own.
  Held by: both `present.test.ts`
- **S8. The map speaks AJ's words** ("The map", "Plan a remodel", "Make this the map") in feet and inches; never spacing, path, reach, inspection, "All clear" or metric.
  Source: AJ, Oct 11 2026. Held by: `LayoutView.render.test.tsx`, `FloorMapView.render.test.tsx`
- **S9. A locked control says who sets it in one quiet line.** Source: Sep 28 2026. Held by: — (unsure)
- **S10. Names on screen:** Board · Tracker · Journal; Just now (never "Pulse"); Ask the team; "Offer to all MSF studios". Held by: —

### Look

- **L1. The Navy Frame:** navy frame in both modes; calm daylight, nothing pure white; dark fills opaque; no studio accent colour.
  Source: Oct 4 2026. Held by: `core-tokens.test.ts`, `neutral-ramp.test.ts`, `page-grounds.test.ts`, `frame-colours.test.ts`
- **L2. Blue is yours and picked:** every Save solid blue, every selection blue, never ink.
  Source: AJ, Oct 4 2026. Held by: `look.test.ts` (my-studio), `loud-orange.test.ts`
- **L3. Orange is only now and go,** with navy words, never white; the + is a quiet round button.
  Source: Oct 3–4 2026. Held by: `loud-orange.test.ts`
- **L4. Plum is caution, crimson Critical and destructive only, green done;** the red kaizen mark is rep quality's.
  Source: Navy Frame; Sep 27 2026. Held by: `studio-tokens.test.ts`, `look.test.ts` (studio-map)
- **L5. Tokens only:** `--st-*` copies of `equipment.tokens.css`, defined once; `--eq-*` on the standing week, floor notes, map and card; `--adm-*` in the Operations kit. No raw hex or Tailwind colour; words 4.5:1, edges and icons 3:1.
  Source: CLAUDE.md. Held by: `studio-tokens.test.ts`, `look.test.ts`, `neutral-ramp.test.ts`
- **L6. The room bar** (AJ's 1b, Oct 10): the mark and name (Saira 22/800 upright), ONE visible switch (a raised pick in a sunk well), tools on the right, an optional second row; a full-bleed shelf. "Every section is visible: a room never hides its top level in a dropdown." Only the Calendar has it.
  Source: `rooms/README.md`. Held by: `RoomBar.render.test.tsx`, `frame-and-shelves.test.ts`
- **L7. My Studio's hue is ochre** (`#85690A` / `#DDB955`), on the mark tile and the bar's 3px line only; nothing outside `rooms.css` reads `--room-`.
  Source: Oct 10 2026. Held by: `room-hues.test.ts`
- **L8. Type:** upright Saira titles; slanted capitals in four places only (studio name, Start session, In progress, front door); scale 11 · 12 · 14 · 17 · 22 · 30 (off-scale budget 3); buttons 14/700, chips 12/700; card heads 17/700 ink, list heads 14/700 ink-2.
  Source: AJ, Oct 4–5 2026. Held by: `type-voice.test.ts`, `fonts.test.ts`, `look.test.ts`
- **L9. Depth:** a panel is an outside edge and a short navy lift, head with no band; wells inside; buttons on the firm 3:1 edge with a lift and a press; tapped chips firm-edged; navy shadows, never black or animated.
  Source: AJ, Oct 4 2026. Held by: `elevation.test.ts`, `buttons-depth.test.ts`, `firm-chips.test.ts`, `panels-and-heads.test.ts`, `wells-and-rows.test.ts`
- **L10. Taps:** nothing under 40px (the Board's 44px); never hover-only; Just now's kudos never hidden.
  Source: CLAUDE.md; Sep 28 2026. Held by: `look.test.ts` (my-studio)
- **L11. Tappable looks tappable; information doesn't.**
  Source: AJ, Oct 3 2026: "I don't know what I can interact with, what's not interactable, what's information." Held by: —
- **L12. One stylesheet owns a class; a component imports its own stylesheet.**
  Held by: `css-class-owners.test.ts`, `css-imports.test.ts`
- **L13. Portrait first** ("the tablet is mostly portrait but landscape is also used", Sep 23); the Context Panel a column from 900px, a sheet below; phone changes only under 600px.
  Held by: —
- **L14. The map:** ink walls; no orange or crimson; the AED and extinguisher on every map, never dimmed or tappable.
  Source: AJ, Oct 11 2026. Held by: `look.test.ts` (studio-map)

### Data and cost

- **D1. Looking costs no Mindbody call;** Openings adds no index ("i just dont want a big mindbody bill or firestore bill popping up").
  Source: AJ, Sep 27–28 2026. Held by: `StudioDetailsForm.render.test.tsx`, `OpeningsSection.render.test.tsx`
- **D2. Read once and share:** one floor-notes listener per studio; machine care is the screen's one live read, never a prop; a card part reads only while open; never one read per person.
  Held by: `MachineCard.render.test.tsx`
- **D3. Every query has its index and names its studio; no per-client loops.** Held by: `firestore-indexes.test.ts`
- **D4. A studio's number is a setting** (`registry.ts`, `useStudioSettings`), never a constant.
  Source: AJ, Sep 28 2026. Held by: `right-now.test.ts`, `resolve.test.ts`
- **D5. A write never erases another iPad's** (map keys for job parts and claims; layouts at `rev + 1`; Undo never erases a later wipe).
  Held by: `jobs.test.ts`, `store.test.ts` (studio-map), `cleaning.test.ts`
- **D6. A tap never waits on the network;** a refusal comes back as a toast.
  Source: speed round, Oct 5 2026. Held by: — (unsure)

### Always on

- **A1. Typing registers with `useUnsavedChanges`;** sections, tabs, parts and the Context Panel ask first. Held by: `MachinesSection.render.test.tsx`, `MarkThisTime.render.test.tsx`
- **A2. Never block a save;** a reason is asked, never required. Held by: —
- **A3. Write only what changed** (`changedPatch`); `studioPatchPayload` is the studio's one writer. Held by: —
- **A4. Render tests for screens that work while drawing; lazy screens inside `LoadBoundary`; the studio's Eastern day.** Held by: `lazy-screens.test.ts`
- **A5. Plan first, AJ's yes before code,** at most three questions, one area to finished, the rest parked.
  Source: AJ, Oct 9 2026 ("a strict step-by-step protocol"). Held by: —

## 3. Decided but not yet built

1. **The mock studio map** (Q13, Oct 14; ROADMAP Planned 3): always draw the map (the "Too small to tap" list goes); rough the room out without exact square feet; unsized or studio-built machines get a "size guessed"; exact sizes optional. Reverses Oct 12's "a studio's own machine is never given a size".
2. **My Studio's room bar.** The hue waits (L7). The Oct 10 proposal, under AJ's "take charge, i love the ideas": five sections visible; Board · Tracker · Journal as Relay's switch; the parts of the day into the Board; the floor map folded, no orange for "wipe due"; Team and Studio to one line each; one button, chip and "picked" look; unused styles deleted (the audit: about 77 of 80 `.sh__` classes unused). Unsure how much is decided: its timing was re-asked as s1.
3. **Unclaimed trainer records leave "works here"** (`pendingClaim`, Q14, Oct 14): shorter Team lists.
4. **Part-day blocks with a reason, and likely regulars on Openings** (ROADMAP Planned 8, Oct 15).
5. **Offers both ways on Machines** (AJ, Oct 16 2026: "Questioning authority isnt bad ... Knowledge is power, allow us to build it"; ROADMAP Planned 2): head office adopts a studio's best work unasked, and a studio offers a change to a standard machine's words with its reason, into Admins → Waiting for review.
6. **Kudos and comments into Teams** (Oct 16 2026; ROADMAP Later, Teams): Relay's social layer moves; the Board, the Tracker, the Journal and client notes stay.
7. **Relay's loose ends:** Capture's "The Board" into the Ask sheet; a load status for the quiet-floor line; the Relay strip on the Calendar; stale copy in `StudioSection` and `TeamPanel`.

## 4. Open questions waiting on AJ

1. **s1, My Studio's top** (walk page, Oct 11): (a, recommended) room bar after the map round; (b) now; (c) keep the dropdown. The map round shipped Oct 12.
2. **s2, Team's first screen:** (a, recommended) people first, one row each in name order, explanations behind (i); (b) keep panels, cut paragraphs.
3. **Walk-page pieces:** t2 one look for a trainer (recommended b); l2 a two-letter studio mark (a); l3 the studio's road on My Studio → Studio (a).
4. **Is this the "next design check"** of the tokens rule, the Navy Frame and Type and depth (AJ, Oct 15)? Until then all three stand.
5. **40px or Apple's 44px.** 40 stands.
6. **One fault, two records:** the card's flag-and-bell vs the machine menu's floor note.
7. **Relay leftovers:** an open question read for four sessions, not until answered; closing it on Notes leaves the ask open; only leaders name one person.
8. **Second-wave defaults:** "New this week" Monday to Sunday; a cover ask ends at the session's start; Journal sharing defaults.
9. **Openings defaults:** taken slots shown nowhere; no door from a time to the standing week.
10. **A reasoned time block:** a leader's agreement, or the trainer's word?
11. **Map-round rules:** a studio check on `taskInstances`; who reads `machineCare` and `upkeepLog` (strangers out, live Oct 15 2026, closed both to accounts never let in; who among the let-in may read them is a later privacy round).
12. **Does "never ranking" stay once kudos move to Teams?** Asked Oct 16 2026; the recommendation is keep it ("a tool, not a gotcha").

## 5. Conflicts and tensions

1. **Room bar vs dropdown:** the room rule forbids hiding sections; My Studio's header hides them (Sep 28, kept by AJ's Oct 3 "Tabs are the header").
2. **Navigation levels:** AJ's Oct 3 picks make three; the Oct 10 proposal moves the parts of the day into the Board for two.
3. **Orange:** kept for now and go, with caution and can't-tell in plum; the Board uses orange for "someone is waiting", kudos, the Floor Map's heat (`look.test.ts` holds it) and "Couldn't read all of today's work", and marks "now" with a blue dot.
4. **Blue:** yours and picked, but also "someone's on it"; the solid blue Ask pill was the Board's loudest thing (rooms audit).
5. **40px vs 44px.**
6. **Three kits in one room:** `--st-*`, `--adm-*` and `--eq-*`, all allowed; the audit counted 45 class prefixes and 14 button kinds.
7. **Machines lives in two rooms;** its redesign shows under Operations' bar too.
8. **"Edited here and nowhere else"** has head-office exceptions (P4; defaults and second studios on Admins).
9. **"No leader-only view on Relay"** beside leader controls on the Board: a view is out, a control is in (unsure).
10. **"A bell rings only for what a person opted into"** (Sep 19) vs bells for hand-offs, flags, claims and closes.
11. **Machine faults:** CLAUDE.md: "a floor note, never a Relay flag"; the card's Report a problem writes the flag (kept Oct 14).
12. **Q13 vs the docs:** the map README and KNOWN-TRAPS still hold the list fallback and "never sized".
13. **Order:** Q9 (Oct 14) chose the machine editor next.
14. **Stale records:** ROADMAP lists Relay questions answered Oct 2 and "three weeks" (four sessions since Oct 3); KNOWN-TRAPS uses old tab names.
