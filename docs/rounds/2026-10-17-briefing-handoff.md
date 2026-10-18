# Pre-Session Briefing: Handoff for Claude Code

Journey System, Sep–Oct 2026 round. This covers the pre-session briefing: the screen a trainer sees when they hit START SESSION. It is built from three fixed questions, shown in this order.

## Why the briefing exists

- Today, trainers in FileMaker dig through the general notes blob, per-session notes, and set-level notes, then work out the routine and the performance history in their heads.
- Trainers often have 10 to 14 clients back to back with no time to prep in the morning. The briefing must be complete enough to be their **only** prep.
- It is a levelling tool. A veteran, or a trainer covering a client they haven't seen in four weeks, should be able to deliver the same quality session as the regular trainer.
- Two speeds must both work. A trainer who prepped in the morning skims past it. A trainer who didn't gets everything from this one screen.

## Trust constraint

Start smaller than feels right. A briefing that is noisy or wrong once will be ignored, and trainers will stop opening it without telling anyone why. Every line has to earn its place for this trainer, today.

## Where the briefing sits in the day

- **Morning:** the hub shows icons for critical notes, FORD updates, birthdays, and new clients. Trainers may open a few profiles to check routines and recent performance.
- **At the door:** START SESSION opens the briefing. It is the final checkpoint: confirm, adjust, or add a note, then start.
- The briefing is not reachable mid-session. If something matters mid-set, the trainer checks the client's profile.

---

## Question 1: What's different about this person?

Goes first. It colours how the trainer reads everything below it.

**What it covers**

- **Workout limits:** medical or physical constraints that change how to train them (e.g. fibromyalgia, don't push as hard; knee replacement; shoulder flare-up).
- **Plain differences:** how this client does the workout differently from everyone else.
- **Personality and interaction:** how they are as a person, what works with them.
- **Their life (FORD):** family, occupation, recreation, dreams. Held deliberately as a relationship asset so trainers can ask genuine follow-up questions.
- **Personal relationship notes:** the trainer's own memories with this client (e.g. "we have a Guardians bet, ask how it went").

**Rules**

- Shared notes show to every trainer who sees this client.
- Personal notes show **only** to the trainer who wrote them, in the briefing and everywhere else. They carry a privacy toggle: "this is just for me."
- Critical notes always show. Heads-up notes can be hidden by an individual trainer. Regular notes stay in the profile and do not clutter the briefing.
- A note that is updated comes back into the briefing even if a trainer had hidden it, because new information has arrived.
- Closed threads do not appear in the briefing.
- Notes are judged by who is looking and when: a shoulder issue is critical for a trainer who has never worked with the client, and background for a regular.
- Missed sessions drive the surfacing, not calendar time. Four missed sessions after an incident matters. Two weeks at Disney World with no change does not need catch-up.
- Once a trainer is familiar with a point, it becomes quieter, not invisible.
- Not every note needs to be briefing-visible. A kid just starting daycare is not a briefing item.

**Expandable: performance history**

- A collapsed box below question 1, labelled to show it holds performance history.
- Open it for a refresher after a long break, or on a first session with the client.
- Regulars can skip it without it being in their way.

**In-briefing capture**

- Trainers can add a note right in the briefing, for example when the client arrives and says "my dog is sick" or "my neck feels weird."
- Trainers can update Pulse answers from conversation (protein intake, schedule, and so on) and navigate Pulse quickly.

## Question 2: What are we doing today?

A confirmation checkpoint. The app calculates the routine, the trainer decides whether to keep it.

**What it shows**

- The routine the app selected from the normal schedule (for example, A on Monday, B on Thursday).
- The schedule can shift when a client misses a session. If a Thursday B session was cancelled and never made up, the next Monday is B, not A.

**Trainer controls, all in the briefing**

- **Swap the routine:** choose A or B, or any other routine, if the app picked the wrong one or the trainer prefers another.
- **Swap a machine out, or add one in:** quick edit to today's routine.
- **Rebuild:** a larger change to the routine, if needed.
- Changes made here apply to today's session. Programming can also be done ahead of time, before the client arrives.

**Principle:** the app suggests, the trainer decides.

## Question 3: How have they been doing?

Recent performance on the routine they are about to do. The default is brief.

**What it shows by default**

- The last five to ten sessions on **today's machines only**.
- The most important data is the most recent session: how they performed on it.
- Keep the density low. The briefing is not the full history.

**Expandable: "view all machines"**

- A quiet box, not loud, for checking performance on machines outside today's routine.
- If the trainer needs deep analysis across everything, they go to the client's profile.

**Open design question (separate design round)**

- How to show recent performance glanceably. FileMaker uses a grid of numbers, for example 98, 98, 98, 94, 94, 94, 92, 92, 90, 90. Trainers see up to 14 machines per routine.
- Idea raised by AJ, not decided: a bar that fills to the current weight and shifts when the weight changes, so progression reads at a glance. A line chart was considered and not chosen.
- Do not finalise this visualization in the same change that builds the rest of the briefing. Build the data and placeholder, then design the visualization in its own round.

---

## Layout and feel

- The briefing is a working screen, not a read-only card. Trainers arrive with the client, see everything at a glance, and make quick changes.
- It must look good. It should feel organised and visually clean, and a little fun to look at. Clients sometimes glance at it, and it should read as "this person has been looking after me," not as internal data.
- Because a client may see it, nothing on it should be internal shorthand or cryptic.
- Trainers can hide the briefing on the tablet if the client leans over, or simply scroll away from it.
- Designed for a tablet held in the hand. Thumb reach and eyes-off interaction matter.

## What the trainer does NOT need spelled out

- Connecting a note to today's routine (e.g. "shoulder flared, you're doing rows today"). Trainers can make that mental link themselves. Do not build a warning for it.

## Post-session briefing (related, not part of the three questions)

- Fires after the whole session, not after each machine.
- Captures last observations, confirms what happened today so the trainer can answer client questions, and surfaces the "fancy math" (e.g. percent increase on a machine) for small talk.
- Shows the next scheduled appointment so the trainer does not need to open Mindbody.

## Notes behaviour that feeds the briefing

- A note is a thread: it opens, runs, then closes or deepens. An update attaches to the original note rather than creating a new one.
- Timing classifiers: matters FROM, matters UNTIL, matters ONLY ON (a single day), and matters UNTIL SOMETHING HAPPENS (no date, with a follow-up prompt and a clean close when resolved).
- Loudness is currently binary (flagged or not) and too harsh. Reminding has to come from what surrounds the note, not from Loudness alone. "Quieter once familiar" is a third state that the binary cannot express. Resolve this when building.
- Notes are written opportunistically: during a session, before a session when a client mentions something on arrival, or after the session.
- Cataloguing is always within one client. Trainers do not compare notes across clients.

## Open items

1. **Visualization of recent performance:** dedicated design round (see Question 3).
2. **Personal notes UI:** how a trainer marks a note as private (only for them) versus shared, during capture.
3. **Real-time capture flow:** adding a note on arrival without breaking the briefing.
4. **Loudness versus "quieter once familiar":** a third state the current binary cannot express.
5. **Note-timing UI:** how a trainer sets from, until, only-on, or until-something-happens without it adding friction.
6. **Outside-studio care** (massage, chiropractor, physical therapy): left open for later discussion.

## Build guidance

- Build question 1, question 2, and question 3 in that order, matching the on-screen order.
- Honour the privacy rule: personal notes never appear in another trainer's briefing, in any form.
- Honour the trust constraint: start with a small, accurate set of lines. Add more only once trainers are opening it.
- Keep the briefing self-sufficient. Do not assume the trainer opened the profile first.
- Put the visualization behind a placeholder until its design round is done.
