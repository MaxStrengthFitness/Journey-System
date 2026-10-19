# The phone minimalist round (Oct 19 2026)

**Branch** `oct19/phone-min`, on master's `0f6a936f`. **Deploy:** the push alone (no rules, no index, no Mindbody, no Cloud Function). Front end only.

## The brief

AJ, from a phone screenshot of the Hub in the Home Screen app (Strongsville, Monday Oct 19, four bookings filling the screen):

- "mobile mode seems to have the same issue where the bottom has a big gap, i think we need to take another look at our mobile mode and try to make it useful for trainers to use at home to plan their week and know their schedules easy."
- "really the phone mode is the minimalist mode, we can get rid of a lot of the features on the screen so that way we get more information on the screen"
- The questions: (1) a screenshot of Settings → My account → This screen on the phone, for the gap; (2) link ids for the Teams round; (3) My week: **(a) the seven days in one scroll, headings between them**, or (b) one day at a time. AJ: "Phone first: fix the gap and build the minimalist Schedule with My week, then the Teams link as the next round. My answers: 1 (I'll send the This screen screenshot), 2a, 3a." Then: "run both rounds with your decisions and if i want to change anything ill let you know in the morning".

The Teams link is its own round (`2026-10-19-teams-link.md`, its own branch).

## What was built

`src/features/phone/README.md` ("The minimalist mode") is the detail.

| Where | On a phone |
| --- | --- |
| **A booking** | A row, not a card: the time (and whose, on Everyone) in its own column, then the Hub's own card drawn **dense** (`HubCard` `dense`): the name whole, the Critical triangle, the state word, the glyphs; no time, no number, no "New to Journey", no service (the peek says them). 44px tall, about a dozen to a screen (was four). |
| **My week** | The strip's seven days in one scroll, a heading each ("Today · Mon 19 · 3 booked", "Tomorrow · Tue 20 · Nothing booked"), the same rows, the Now line on today. From the Hub's own window: **no new read, no new Mindbody call, no new index**. A free day stays on the list; a day not read yet says so. A tap on a card picks its day and opens its peek there. A tap on the strip scrolls the week to that day. |
| **The top** | The layers (Schedule \| Opportunities), Today and Tasks on one row. Gone from the phone: the family chips, the Key, the Next 30 minutes strip. Under the week, one switch: **My day · Everyone · My week** (Day · Week for someone with no column on the day), remembered on the phone. |
| **The iPad** | Unchanged. Every change is behind `usePhone()` or the phone's own container query. |

## Decided without AJ (say if wrong)

- **Another day's card on My week shows who and when, and no marks.** The Hub's moments engine runs for the day on screen only (the speed round, R6), so a week of marks would be seven runs a minute. A tap opens the peek on that day, with its marks.
- **The Opportunities layer stays on the phone.** It is a whole layer, not a feature on the screen; dropping it is a product call. The chips that counted it are gone.
- **The Next 30 minutes strip is off the phone.** The list's Now line says it.
- **The bottom gap is not fixed in this round.** Its cause is known (the shell takes the smallest height iOS reports; a phone's status bar is about 59pt, three times the iPad's; the home inset is painted navy under the bar), but the Oct 5 note says not to let the shell take a taller height without the numbers from Settings → My account → This screen. AJ is sending that screenshot.

## Checks

Typecheck, the suite and the case check are recorded in the commit messages. The main checkout's `node_modules` was found empty on Oct 19 (every worktree's junction points at it) and reinstalled with `npm ci`.

## For the walk

On a phone: Schedule shows about a dozen rows; My day · Everyone · My week under the week; My week scrolls seven days with headings; a tap on a row opens the peek; Opportunities still opens; the Critical triangle shows on today's rows. On the iPad: nothing moved.
