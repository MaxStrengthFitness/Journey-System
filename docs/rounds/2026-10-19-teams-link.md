# Journey links: the way in (Oct 19 2026)

**Branch:** `claude/oct19-teams-link-795436` (a desktop worktree), cut from
master `0f6a936f` (iPad: no zoom, Oct 18 2026). One commit per phase, each
typechecked on its own. App, rules and one index; no Cloud Function, cron or
Mindbody change. **The one Firestore structure change is the `shares`
collection, which AJ approved on Oct 19 as T2a.** Not pushed; AJ ships it (§7).

## 1. What this is

The company moved from Slack to Microsoft Teams. AJ wants a trainer to paste
a Journey link into a Teams message so a colleague taps it on a phone or an
iPad and lands exactly on that client's profile, that session's pop-up, that
ask on the Board, or that Learning page. On Oct 18 a design panel settled on
**"Links first"**: no Teams app, bot, Graph call, Azure registration or
Microsoft token. **Journey keeps the record; Teams carries the talk.** This
round builds the panel's phase 1 (the way in, Copy link, the frame header)
and the share documents from its phase 2.

AJ's answers, Oct 19: **T2 = (a)**, random share ids in a new `shares/{id}`
collection; **T3**, counsel in parallel; "run both rounds with your decisions
and if i want to change anything ill let you know in the morning".

## 2. What was built

| Phase | Commit | What |
| --- | --- | --- |
| 1 | `30991ee9` | `src/features/deep-link/`: the three link paths, the link remembered at boot, the pure decision, the hook, the signed-out landing, the quiet hold line; the Relay `open-ask` intent; the Activity Archive opening a linked session's pop-up; the picker offering the link's studio first |
| 2 | `afd9dc6c` | `shares/{shareId}`: the data dictionary row, `JourneyShare`, the rules and their tests, the index, the id made on the iPad, the write that never waits |
| 3 | `cd691c07` | Copy link: the profile header's fourth tool, beside Close on the finished-session pop-up (a slot each host fills), on a Relay ask, on every Learning page; the Wrap-up off the notes barrel |
| 4 | `492cfc1c` | The two guards: deep-link imports no client detail; the floor reaches no door |
| 5 | `8f11d95a` | The server: every link path gets the shell as `/` does; `Content-Security-Policy: frame-ancestors 'self'` on every app-shell response |
| 6 | this | The docs |

`src/features/deep-link/README.md` is the full account; the decision is
`docs/DECISIONS.md#journey-links`.

### The three paths

| Path | Opens | Carries |
| --- | --- | --- |
| `/t/{shareId}` | a client's profile, or a finished session's pop-up | a random share id, never a name or a record id |
| `/l/{kind}~{id}` (`?studio=` for a studio's own page) | a Learning page | the page's kind and id |
| `/a/{askId}?studio={id}` | an ask on Relay's Board | the ask's id and studio |

An id is letters, digits, `-` and `_`, at most 64 characters; a dot is refused
because the server answers a path ending in `.xxx` with Not found.

### What a link does

- **Opens** through the bell's own navigation (`openLinkedPlace` in
  `AppContent.tsx`, now the one way the bell and a link open a place), so the
  unsaved-changes gate is the tested one.
- **Holds** while a session screen is up: "Opens when you finish this
  session", one quiet line under the status bar, never a dialog over the
  floor.
- **Offers Switch** when the link is at another studio you work at: a toast
  with one button, "Switch to Solon". Nothing switches by itself; the switch
  is `features/studio-switch`'s and lets go of the client first. An offer not
  taken lets the link go when the toast does.
- **Refuses** in the rules' words: "This link isn't at a studio you work at,
  or the link is wrong." for permission-denied and for a document that is
  not there (never "not found"); "You're offline. The link opens when you're
  back." for unavailable, and the link is kept.
- **Demo Mode**: "You're in Demo Mode. Leave it to open this link."
- **A session link's four cases**: finished opens the pop-up from the
  document; another trainer's running session opens the watching view; your
  own open session says "still open where you started it"; a session with no
  client yet says so.
- **Signed out**: "This is a Journey link." with Sign in first; on an iPad
  outside the Home Screen app also "Open it in the Journey icon" with Copy
  link, in the blue of a selection.
- **A cold open**: the studio picker offers the link's studio first, when the
  person works there. They still tap it.

### Copy link

The words are "A client · Open in Journey <url>", "A session · …", "An ask ·
…", "A Learning page · …": never a name, never a title. A client or session
link is offered only at the client's studio. The share id and the link are
made at the tap, the words go to the clipboard in the same tap, and the
document is written without waiting; a refused write is a toast: "That link
won't open. Check your connection and copy it again."

## 3. Decisions the plan left open, and what was decided

1. **An ask's link carries its studio in the query** (`/a/{askId}?studio=`),
   because asks live under `studios/{s}/taskRequests` and the id alone cannot
   find one. A studio's own Learning page does the same. The studio id is a
   Firestore id, not a client's.
2. **A Learning page's id is its kind, `~`, and its id**
   (`/l/academy-topic~hydration`). The 64-character cap is on the page's own
   id; the longest Academy id today is 60. A page whose id cannot be carried
   gets no Copy link.
3. **A share the rules let through at a studio you don't work at opens where
   you stand** (a client approved to cross-train here): the rules already
   said yes. An ask or a studio page at a studio you don't work at is
   refused with the rules' words.
4. **A Switch offer stands for 12 seconds** (`SWITCH_OFFER_MS`), the toast's
   life. Not taken, the link is let go, so a studio switched to later never
   opens a profile by surprise.
5. **The share's create rule accepts an id of 20 to 32 letters and digits**:
   a UUID without dashes (32 hex) or, on an iPad without `randomUUID`, 20
   base-62 characters. A record id (`100000123`, nine digits) is refused as
   an id, so a client's number can never be a share's address.
6. **Copy link for an ask and a Learning page writes nothing**: the ids are
   already public inside the app, so no share document; the words still say
   the kind, never the title.
7. **The link-tab flag is set but not yet read.** The plan's session-only
   sign-in for a Safari link tab (`src/firebase.ts`) is a later round; this
   round sets `sessionStorage.journey.link-tab` so that round has it.
8. **The profile header's Link tool is icon-only in the one-band landscape**
   (xl), where the band is tight, and says "Link" everywhere else. Not yet
   seen on an iPad in either orientation: the walk below.
9. **The Hub's Edit session loads Copy link with the pop-up**, lazily inside
   the same LoadBoundary, so nothing of this round is on the first screen.
10. **`useToastMaybe`** was added to `ToastContext` so the Learning tab, which
    its render test mounts without a provider, could say "Link copied"
    without refusing to mount.

## 4. Not in this round

The Teams Share sheet, Message in Teams, the "Talk in Teams" studio setting,
any Microsoft SDK, a count of link opens in Render's logs, and the Safari
link tab's session-only sign-in.

## 5. Counts

Typecheck 0. The suite: see the final report in the session, and
`CLAUDE.md`'s Tests row. Rules: 606 on the emulator (the five share tests
among them), run on a spare port because an emulator from Oct 18 still held
8080; **AJ's run is the one that counts.**

## 6. What AJ walks on an iPad

1. **A pasted link.** On the profile, tap Link in the header; paste into a
   Teams message to yourself; tap it on the iPad. In the Journey icon: the
   profile opens. The words say "A client · Open in Journey", not her name.
2. **A link opened in Safari, and reloaded.** Tap the same link in Safari:
   "This is a Journey link." with Sign in and, under it, "Open it in the
   Journey icon" with Copy link. Reload the tab: the address is `/`, and the
   link does not open again.
3. **A link at another studio.** Copy a client's link at Solon, switch the
   iPad to Westlake, open the link: a toast "That link is at Solon" with
   "Switch to Solon". Let it pass once (nothing opens); tap it the second
   time (the studio switches, then the profile opens).
4. **A link during a session.** Start a session, open a link: one quiet line
   under the status bar, "Opens when you finish this session"; nothing
   over the floor. Finish: the link opens.
5. **A session's link.** On the Activity Archive, open a finished session;
   beside Close, Copy link; open it: the same pop-up. Then a running session's
   link from another iPad: the watching view.
6. **An ask and a Learning page.** Copy link on an ask's panel and on a
   machine's Catalog page; open each.
7. **The header in landscape.** The Link tool shows its icon alone and the
   name still wraps.

## 7. Shipping (AJ)

The deploy order: `firebase deploy --only firestore:indexes` →
`npm run test:rules` → `firebase deploy --only firestore:rules` → `git push
origin master` → on Render, Manual Deploy on the web service and Manual Build
on both cron jobs. The rules only add access (a new collection), so they go
first and the running app is unaffected.
