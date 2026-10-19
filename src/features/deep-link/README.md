# Journey links — the way in (the Teams link round, Oct 19 2026)

The company moved from Slack to Microsoft Teams. A trainer pastes a Journey
link into a Teams message; a colleague taps it on a phone or an iPad and
lands on that client's profile, that session's pop-up, that ask on the Board,
or that Learning page. **Journey keeps the record; Teams carries the talk.**
No Teams app, bot, Graph call, Azure registration or Microsoft token: a link
is a URL, and the app reads it once at boot. The round is
`docs/rounds/2026-10-19-teams-link.md`; the decision is
`docs/DECISIONS.md#journey-links`.

## The three paths (`parse.ts`)

| Path | Opens | Carries |
| --- | --- | --- |
| `/t/{shareId}` | a client's profile, or a finished session's pop-up | a random share id (`shares/{shareId}`, `share.ts`) |
| `/l/{kind}~{id}` | a Learning page (a machine's Catalog page, an Academy page); `?studio=` for a studio's own page | the page's kind and its id |
| `/a/{askId}?studio={id}` | an ask on Relay's Board | the ask's id and its studio |

An id is letters, digits, `-` and `_`, at most 64 characters. **A dot is
refused** because the web server answers any path whose last part looks like
a file with Not found (`server/served-files.ts`); a slash would be another
segment. **A client or session link is always `/t/{shareId}`**: the client's
record id (usually their Mindbody number) never appears in a link, so a
mis-sent link means nothing in Teams' logs or on a lock screen, and a leader
can delete the share to cancel it. A link this file cannot read is `null`,
never a guess.

The Learning page's id in a link is its kind, `~`, and the page's own id
(`machine~m-leg-press`, `academy-topic~hydration`); the two pages with no id
of their own (the cueing phrasebook, the glossary) are the kind alone. The
longest Academy id today is 60 characters; a page whose id cannot be
carried gets no Copy link rather than a broken one.

## What happens, in order

1. **Boot** (`pending.ts`, called from `src/main.tsx` before React mounts).
   The address is parsed once. A link is kept in module memory, registered
   with `forgetOnSignOut` (`features/sign-out/memory.ts`) so a link left
   waiting is the last person's and not the next one's; a flag goes into
   `sessionStorage` (`journey.link-tab`) saying this tab opened from a link;
   and the address bar is replaced with `/` at once, so a reload or a sign-in
   that comes back by redirect does not open the link again, and the id does
   not sit in the address bar for the next person on the iPad.
2. **Signed out** (`LinkLanding.tsx`). The tab says "This is a Journey link."
   with Sign in first. On an iPad outside the Home Screen app (a link tapped
   in Teams opens in Safari, where nobody is signed in) it also says to open
   it in the Journey icon, with Copy link in the blue of a selection (the
   Navy Frame), 48px. The front door's look, nothing new.
3. **The studio picker** offers the link's studio first on a cold open, when
   the person works there (`StudioSelectionView`'s `preferStudioId`). The
   person still taps it; nothing is chosen for them. The share document is
   read as soon as someone is signed in so the picker can know the studio.
4. **The decision** (`decide.ts`, pure, tested): once a studio is picked,
   `decide()` gives one of six answers, and `useDeepLink.ts` does it once:
   - **open** here, through the bell's own navigation (`openLinkedPlace` in
     `AppContent.tsx`, the one way a link opens a place: the unsaved-changes
     gate is asked there, a Learning page wins over a view, a Relay intent is
     requested before the view changes);
   - **hold** until Finish while a session screen is up: "Opens when you
     finish this session", one quiet line under the status bar
     (`DeepLinkLine.tsx`), never a dialog over the floor;
   - **switch**: the link is at another studio this person works at, so
     "Switch to Solon" is offered on a toast with one button, and **nothing
     switches by itself**. The switch is `features/studio-switch`'s (it lets
     go of the client); the client opens only after the let-go effect has
     run, on the next render. An offer not taken lets the link go when the
     toast does, so a studio switched to twenty minutes later never opens a
     profile by surprise;
   - **refuse**, by error code: "This link isn't at a studio you work at, or
     the link is wrong." for permission-denied **and for a document that is
     not there** (never "not found": the two are told apart by nothing a
     stranger should learn); "You're offline. The link opens when you're
     back." for unavailable, and the link is kept;
   - **demo**: in Demo Mode a link to a real studio says "You're in Demo
     Mode. Leave it to open this link."; at a real studio a link into Demo
     Mode is offered as a switch like any other;
   - **wait** while the share is still being read.
5. **A session link's four cases** (`sessionCase`, from the session document,
   one read): a finished session opens the Activity Archive's pop-up
   (`SessionDetailDialog`) from the document, through
   `client-history/open-session-handoff.ts` and `openProfileAt`; another
   trainer's running session opens the watching view (the client is
   selected and the Active Session draws it read-only); your own open session
   says "That session is still open where you started it."; a session with
   no client yet says so.
6. **An ask** opens through the Relay intent `open-ask` (`relay/intent.ts`,
   the bell's vocabulary: `ask:{id}`), and the Board opens its panel once its
   cards hold it; an ask that is closed or not on the board is said once.

Every open is at most two document reads (the share, the session), each
judged by the rules alone. The way in adds no query and no write.

## What is deliberately not here

- **No Teams on the floor.** Nothing in this folder can be reached from the
  Active Session, the briefing, the Wrap-up, the watching view, the grid or
  the open session, and the header row and avatar menu the session screens
  draw carry no Share control: `floor-guard.test.ts` holds it. A link that
  arrives during a session waits for Finish.
- **No client detail.** This folder imports none of client-notes, FORD,
  Pulse, renewals, InBody, the Deep Dive or the leaders' client states:
  `deep-link.imports.test.ts` holds it.
- **No reload, no router.** The app still has no router; a link is read once
  and the address becomes `/`. `src/firebase.ts` does not yet read the
  link-tab flag (the plan's session-only sign-in for a Safari tab); that is
  a later round.
- **The Teams Share sheet, Message in Teams, the "Talk in Teams" studio
  setting** and any Microsoft SDK are the plan's later phases.

## Files

| File | What |
| --- | --- |
| `parse.ts` (+ test) | the three paths, read and written; `LINK_ID_MAX`, `linkUrl`, `learningPageId` |
| `pending.ts` (+ test) | the link a tab opened with: module memory, the tab flag, the address replaced |
| `decide.ts` (+ test) | the pure decision and the session link's four cases; every sentence |
| `share.ts` | `shares/{shareId}`: the record, how it reads back |
| `useDeepLink.ts` | reads the share and the session, decides once, acts once; the hold line and the picker's studio |
| `LinkLanding.tsx` (+ render test) | the signed-out landing |
| `DeepLinkLine.tsx` | the quiet hold line |
| `deep-link.imports.test.ts`, `floor-guard.test.ts` | the two guards above |
