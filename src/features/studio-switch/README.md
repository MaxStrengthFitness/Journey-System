# Studio switch — from every screen, and it lets go of the client

Oct 12 2026. AJ: "We can only switch studios in trainer mode, it doesnt pop up
when in operations or admin mode, switching a studio with a client pulled up
keeps the client loaded, switching studios should clear whoever youre
holding."

**Switch studio works on every screen.** The picker is an early return in
`AppContent.tsx`; until Oct 12 it was skipped on Operations and the Admins
dashboard even when asked for, so the menu's Switch studio did nothing there
and the picker sprang up later at the next trainer screen. Now a request to
change studio opens it from anywhere (the two dashboards are excused only from
"no studio yet", where an administrator may stand without one). The header's
studio NAME opens it on every screen; inside Operations and the Admins
dashboard the LOGO alone goes back to the Hub (the Atlas answer of Oct 2 2026
had both go home). Choosing a studio, or Back, returns to the screen it was
opened from. `picker-everywhere.test.ts` holds it.

**A switch lets go of the client.** `let-go.ts` is the rule, `useLetGoOnStudioSwitch`
the hook AppContent calls: when the active studio moves from one studio to
another (or to none), the held client is cleared, and a client's own screen
(her profile, a progress report, the Active Session) goes to the Hub; every
other screen stays put, on the new studio. It watches the one active studio
rather than each door, so the picker, Operations' Looking at and Admins →
Home's "Go to {Studio}'s Today" are all covered, and a new door will be too.
It adjusts state during render, so the new studio never draws the last one's
client, not even for a frame (`useLetGoOnStudioSwitch.render.test.tsx`). The
raw setters are used: a switch someone chose already asked about unsaved
typing (a studio that was deleted leaves nothing to save into).

Operations keeps its own open client (`admin/shell/place-memory.ts`). A
switch forgets it (AppContent's let-go), so Westlake → Solon → Westlake
never reopens her; it is also remembered with the studio the app was on when
she was opened, and the shell closes her when the app's studio moves under
"All my studios".

A running session is not touched: leaving it for another studio leaves it
running in the database. The new studio's session stream doesn't hold it,
so the bottom bar doesn't show it there; switching back, or the session this
iPad remembers, brings it back (`lib/live-session.ts`). The switch asks
about unsaved typing only, not about a running session.
