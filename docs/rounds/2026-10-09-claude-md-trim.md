# The CLAUDE.md trim — Oct 9 2026

Branch `oct9/claude-md`, on master's `546bb0aa`; redone on master's `7957d1a0` on Oct 10 2026 (section 7). Documents and one test only: no app code, no rules, no index, nothing a trainer sees, nothing to deploy.

## 1. What AJ asked

At a check-in on Oct 9 2026 about which Claude model to use for what, Claude raised that `CLAUDE.md` had become a changelog: every session and every helper reads it in full before doing anything, and its rows had grown into paragraphs of round history. AJ: "we should definitely trim Claude MD ... let's have a conversation about it and work together to fix this document up."

Claude proposed a map of one line per area (the detail in each feature's README), each decision cut to its rule in AJ's words (the full text in a new `docs/DECISIONS.md`), and a test so it does not grow back. AJ answered **"1a 2a 3a"**:

- **1a** — the full decision text lives in `docs/DECISIONS.md`; `CLAUDE.md` keeps the rule, AJ's words and a link.
- **2a** — one short quote per decision in `CLAUDE.md`; AJ's full quotes in `docs/DECISIONS.md`.
- **3a** — a test that fails when `CLAUDE.md` passes a size limit, like the first screen's bundle budget.

In the same conversation AJ agreed that reading and documentation helpers run on Sonnet ("If you think that better fits our usage, then for sure we should do that"); this round's README work was done that way, and the decisions were written in the main session.

## 2. Before and after

| | Before (master `546bb0aa`) | After |
| --- | --- | --- |
| `CLAUDE.md` | 114,812 characters, 17,563 words | 41,827 characters (36%) |
| Where things are | 56 rows, 50,767 characters, the longest 3,443 (Operations) | 56 rows, about 7,200 characters, none over 320 |
| Decisions | 57, 51,509 characters, the longest 3,878 (Type and depth) | 57, about 22,000 characters, none over 650; 39 shortened with a link, 18 short enough to stand as they were |
| Commands → Tests | 1,000 characters of measurement history | the current count and how to run it (the old row is already in `docs/KNOWN-TRAPS.md#baselines`) |

The size Claude estimated before starting was about 30,000 characters. It came out at about 42,000 because the decisions keep their rules whole; cutting further would have meant cutting rules.

## 3. What was done

1. **`docs/DECISIONS.md`** (new): the full text of the 39 decisions that were shortened, moved by a script word for word, one heading each, grouped Product · Data · How we work. Three entries also carry the map row that pointed at them (the Navy Frame, Type and depth, Every query ships with its index), and one carries a dated correction (section 5).
2. **The decisions in `CLAUDE.md`**: each shortened one is the rule, its date, one short quote of AJ's and **More** linking to its entry. A decision changes in both places in the same commit.
3. **The map**: each row is one line naming the folder and what it is. Before a row was cut, a helper read it against the folder's README and added whatever the README did not already say, in its own section or under "At a glance (from CLAUDE.md, Oct 9 2026)". Five helpers, each with its own set of READMEs. Two READMEs are new: `server/README.md` (the web server and the scheduled jobs) and `functions/README.md` (Cloud Functions). A check then looked for every name written in backticks in the old rows (726 of them) across the new `CLAUDE.md`, every README, `docs/DECISIONS.md`, `docs/KNOWN-TRAPS.md` and `docs/business/`: all 726 are there (four only in a slightly different spelling, checked by hand).
4. **Keeping this file short**: a closing section in `CLAUDE.md` says what goes where, and **`src/claude-md.test.ts`** holds it: the whole file at most 45,000 characters, a map row at most 320, a decision at most 650, every `docs/DECISIONS.md` link landing on a heading and every heading linked. When it fails, the detail moves out; the limit does not move up.
5. **Pointers**: `docs/START-HERE.md` and `docs/ARCHITECTURE.md` name `docs/DECISIONS.md`.

## 4. How nothing was lost

- The decisions were copied by script from the file as it stood, never retyped.
- The map's facts were checked into the READMEs before any row was cut, and the name check above found none missing.
- Code comments that cite `CLAUDE.md` cite a rule; every rule is still in it.

## 5. What had gone stale (found while checking)

| Where | What `CLAUDE.md` said | What is true | Done |
| --- | --- | --- | --- |
| Briefing and Wrap-up (decision) | the Note for the next trainer is on the briefing "for three weeks" | since Oct 3 2026 a Heads up is read at the client's next four sessions (`HEADS_UP_SESSIONS`); three weeks is only the fallback while the sessions are unknown | the short form says no number; a dated correction under the full entry |
| Running costs (map) | "about $52-54 a month today, almost all Render" | `docs/business/running-costs.md`, corrected Oct 5 2026: about $66-68 a month (Render $50, two crons about $2, Mindbody about $14, Firestore $0-2) | the new line names no figure |
| First session (map) | the client's `isRoutineBActive` "always its own write" | Plan B's Start B keeps it in its own batch (`routine-plan/store.ts`); the README says so | the new line does not repeat it |
| Opportunities (map) | moments "in five families" | six since Get to know (wave 2 hub); the README says six | the new line does not repeat it |
| Journey on a phone (map) | rooms tighten under `max-width: 599px` only | also a container query (`day-header.css`, 520px); the README says so | the new line does not repeat it |
| The Machine Codex (map) | models at Admins → Standard → Machines → Models | right; the codex README still said Admins → Catalog → Models | a sentence in the README gives the current name |

## 6. Not done

- The "Always on" traps (about 5,000 characters) stay as they are: they are the rules that apply whatever a session touches.
- The open-session round (`oct9/open-session`) does not touch `CLAUDE.md` yet; when its documents phase runs it adds one map line and, if any, one short decision, and the test will say if it does more.

## 7. Redone on master's `7957d1a0` (Oct 10 2026)

AJ, Oct 10 2026: "redo the CLAUDE.md trim on today's master, then I read the review page". By then master was 22 commits past `546bb0aa` (the open session, the floor round, the settings card). The Oct 9 draft was committed as it stood (`96022b74`) and master merged into it (`086ceb41`), then the lines below were added. Still not pushed, and nothing to deploy.

- **The merge: three conflicts, each kept both sides.** `CLAUDE.md`: master's one change to it since `546bb0aa` was the floor round's sentence in Briefing and Wrap-up (`d56f7992`); it is in that entry in `docs/DECISIONS.md` word for word, and in short in the decision (644 characters of 650). `docs/rounds/CHANGELOG.md` and `docs/rounds/README.md`: every entry from both sides, in date order. `docs/ARCHITECTURE.md` and six READMEs (hub-schedule, machine-fit, machine-menu, phone, routine-plan) merged by themselves, the trim's additions beside master's.
- **The open session round's lines** (its §6, written for after the trim): the map's open session row, a clause each on the machine menu row (Set up) and the routine plan row (Start from a routine…), the decision, and its full text as a new entry in `docs/DECISIONS.md`. Its §5 item about the missing row is marked done.
- **The settings card** (Oct 10 2026, AJ's "1a 2a 3a"): one clause in the machine card decision ("A setting is typed in its own tile, its reason asked, never required, and Save closes the card"), and a dated paragraph under its entry in `docs/DECISIONS.md`. The detail stays in `src/features/machine-menu/README.md` → The settings card.
- **The Tests row** is this branch's own count (below). Master's Tests row, which the Oct 9 draft replaced without moving (section 2 said it was already in the baselines; its facts were, its words were not), is now in `docs/KNOWN-TRAPS.md#baselines` word for word.
- **The name check, against master's `CLAUDE.md`:** all 926 distinct names in backticks (726 of them in the map rows, as on Oct 9) are found again in the new `CLAUDE.md`, a README, `docs/DECISIONS.md`, `docs/KNOWN-TRAPS.md` or `docs/business/`; the same four only in a slightly different spelling (`retention` as a kind, `claims.{uid}`, `announcementReads/{uid}` with `acks.{id}`, the two `*-model.py` files by name), checked by hand.

| | Master `7957d1a0` | The Oct 9 draft | Redone |
| --- | --- | --- | --- |
| `CLAUDE.md` | 115,107 characters, 17,612 words | 41,827 | 43,214 characters (38%), 6,672 words |
| Where things are | 56 rows, the longest 3,510 | 55 rows, none over 320 | 56 rows, the longest 318 |
| Decisions | 57, the longest 3,880 | 57: 39 shortened, 18 as they were | 58: 40 shortened, 18 as they were; the longest 644 |
| `docs/DECISIONS.md` | — | 39 entries | 40 entries, 56,353 characters |

**Measured on the branch** (Oct 10 2026, the worktree on AJ's PC, its files in LF): `src/claude-md.test.ts` 6 passing; the suite **13,470** passing in 815 files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`: master's 13,464 in 814, the settings card's count, plus this test's 6); typecheck **2** (`clinical-review/charts.tsx`, `EditTrainerModal.tsx`); `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing. Rules tests not run (no rules change; 351 is the open session round's count).

**Still standing from section 5, outside `CLAUDE.md`:** the Note for the next trainer "for three weeks" in `docs/ARCHITECTURE.md` (the Active Session, End) and `docs/business/glossary.md`; "Admins → Catalog → Models" in `src/features/admin/machines/README.md`. Left as they are, for AJ's word.
