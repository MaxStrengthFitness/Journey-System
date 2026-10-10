# The CLAUDE.md trim — Oct 9 2026

Branch `oct9/claude-md`, on master's `546bb0aa`. Documents and one test only: no app code, no rules, no index, nothing a trainer sees, nothing to deploy.

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
