import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardStateWords, initialsOf, spokenCard } from "../features/hub-schedule/card-words";
import { FIT_SLACK_PX, NARROW_LINES, nameOverLines, narrowWidth, SAIRA_700_UNITS, SAIRA_UNITS_PER_EM } from "../features/hub-schedule/name-fit";
import { clientInitials } from "./client-name";
import { hubCardIsNow, type HubCardState } from "./hub-card-state";

/**
 * NAMES ARE NEVER TRUNCATED (CLAUDE.md), HELD ACROSS THE APP — Sep 29 2026.
 *
 * An audit found sixteen places where a person's or a machine's name was
 * still cut short: one line, hidden overflow, an ellipsis (or Tailwind's
 * `truncate`, which is the same three declarations). Each now wraps
 * (`overflow-wrap: anywhere`, no nowrap, no clip) and the row it sits in
 * grows (`min-height`, never `height`). My Studio's own classes are held by
 * features/my-studio/look.test.ts in the same way; this file holds the rest.
 *
 * THE NARROW CARDS ROUND (Oct 18 2026) holds the Hub card that shares its
 * slot: two or three clients who start together with one trainer, side by
 * side in a half or a third of the column, where names broke inside a word
 * and times and "Not logged" were cut. AJ, on the "Two at Once" page: "Keep
 * them side by side, cards say less", then "Build it as you described,
 * including initials for the very long names". So, at the end of this file:
 * a narrow card's NAME (whole, in the narrow face, broken only between
 * words), its TIME (never in an ellipsis or a line clamp; the only clipped
 * time line is the Now line, where the clock comes first) and its STATE
 * word (never cut; it gives way only to its symbol). And the ONE exception
 * to this file's rule, named with AJ's words: her initials, on a narrow
 * card only, with her whole name in the card's label, the peek and the
 * profile.
 *
 * If one of these fails, the fix is the stylesheet or the element, not the
 * test.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };

function rulesOf(file: string): Rule[] {
  const out: Rule[] = [];
  for (const m of uncommented(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)/.test(prelude)) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

/** The last compound of a selector: the element the rule styles. */
const subject = (selector: string) => selector.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
const namesClass = (compound: string, cls: string) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound);

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/* ------------------------------------------------------------------ */

/**
 * A class that carries a name, in the stylesheet that defines it. `exact`
 * is for a rule whose subject is not a class (`.jg-order__add span`).
 */
const NAME_RULES: { file: string; cls: string; exact?: string; what: string }[] = [
  { file: "features/journey-grid/journey-grid.css", cls: "jg-sbar__name", what: "the client on the live session bar (WorkoutTrackerView, WatchingSession)" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-nb__name", what: "the current machine on the Now Bar" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-nb__nextname", what: "the next machine on the Now Bar" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-machine__label", what: "a machine's name in the Active Session grid (the ROADMAP had said it truncated; Oct 18 2026)" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-order__add", exact: ".jg-order__add span", what: "a machine in the routine-order sheet" },
  // The floor on day one (the first-session design round, Oct 8 2026, §4.6).
  { file: "features/phone/phone.css", cls: "ph-card__next", what: "\"Next: Leg Press\" and \"Next in the plan: Hip Abduction · Add\" on the phone's card in hand" },
  // The FileMaker floor on a phone (the open session round, Oct 9 2026).
  { file: "features/phone/phone.css", cls: "ph-floor__name", what: "a machine on the rest of the floor, under a phone's session cards" },
  // The settings button (the open session round, Oct 9 2026; AJ's "2a"):
  // "Gap 1 · Seat 12 · Back pad 3", a dial's own name beside each value.
  { file: "features/journey-grid/journey-grid.css", cls: "jg-nb__setup", what: "the Now Bar's settings button, the dials by name (\"Seat Angle 4 · Shoulder Pads 3\")" },
  { file: "features/phone/phone.css", cls: "ph-card__setup", what: "the phone card's settings button, the dials by name" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-row__name", what: "a machine in the routine builder's list" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-pick__name", what: "a machine in the routine builder's picker" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-warn__pair", what: "the two machines a sequencing warning names" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-head__title", what: "the routine's name in the builder's head" },
  // The Calendar as a room (Oct 10 2026): its Day is the Hub's grid and card
  // (held above), so the block and the lane label went; these are new.
  { file: "features/calendar/calendar.css", cls: "cal-board__name", what: "a trainer on the calendar's board" },
  { file: "features/calendar/calendar.css", cls: "cal-pick__name", what: "whose bookings the Calendar shows, on the team picker" },
  { file: "features/calendar/calendar.css", cls: "cal-pick__optname", what: "a trainer in the team picker's list" },
  { file: "features/calendar/calendar.css", cls: "cal-life__item", what: "a client's life event over the Calendar's Day" },
  { file: "features/calendar/calendar.css", cls: "cal-wbk__name", what: "a client booked on the Calendar's Week" },
  { file: "features/calendar/calendar.css", cls: "cal-wbk__with", what: "who a booking on the Week is with" },
  { file: "features/client-history/client-history.css", cls: "hist-who__name", what: "the trainer on a history row" },
  // The studio map (Oct 2026): Arrange the floor's names.
  { file: "features/studio-map/studio-map.css", cls: "smap-chip__name", what: "a machine not placed yet, on the editor's chips" },
  { file: "features/studio-map/studio-map.css", cls: "smap-item__name", what: "the selected machine, box or place in the editor" },
  { file: "features/studio-map/studio-map.css", cls: "smap-sizes__name", what: "a machine on the Sizes sheet" },
  { file: "features/studio-map/studio-map.css", cls: "smap-list__name", what: "a machine in the floor's walking order beside the map" },
  { file: "features/studio-map/studio-map.css", cls: "smap-tabs__name", what: "a remodel plan's name on its tab" },
  // Phase 4: a machine on the map's floor list, and the machine card's name and header lines.
  { file: "features/studio-map/studio-map.css", cls: "smap-clean__name", what: "a machine on the map's floor list" },
  { file: "features/machine-card/machine-card.css", cls: "mdc-head__name", what: "the machine's name on its card" },
  { file: "features/machine-card/machine-card.css", cls: "mdc-head__line", what: "the movement and where the machine came from, on its card" },
  { file: "features/machine-card/machine-card.css", cls: "mdc-flag", what: "Out of service with its reason and who set it, and the flag's words" },
  { file: "features/client-history/client-history.css", cls: "hsd-set__name", what: "a machine in the session pop-up" },
  { file: "features/trainer-profile/trainer-profile.css", cls: "tp-row__name", what: "a person or client on a My Profile row" },
  { file: "features/client-profile/profile-nav.css", cls: "psub__label", what: "a profile sub-tab's label (two words wrap, as its comment says)" },
  { file: "features/hub-schedule/next-strip.css", cls: "hn-with", what: '"with {trainer}" on the Next 30 minutes strip' },
  // The machine menu (Oct 2026): the chart block's heading, its sentences,
  // the tapped session's readout and the two lists.
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chart__title", what: "the client's name in \"How Avery has done here\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chart__state", what: "the client's and the machine's names in the chart's state line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-ro__a-text", what: "the tapped session's trainer and studio in the readout" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-ro__event", what: "a note's author and a machine's name in the readout's event line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-sess__c", what: "a trainer and a set-up in Every session's rows" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-run-div__t", what: "the machine's name in a fold between Weight by weight's runs" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-cmp__title", what: "the client's, the machine's and the studio's names over the open note box" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-cmp__other", what: "another machine's name over a session draft about it (\"About Chest Press\")" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-seg__opt", what: "the client's name on the note box's About switch" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-btn", what: "a machine's name on \"Make it about Leg Press\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-add", what: "the studio's name on \"Add to Westlake's notes\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-status", what: "the studio's and the machine's names in a floor note's confirmation" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-note__meta", what: "a note's author in the machine's notes" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-up__meta", what: "an update's author in a note's thread" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chg__detail", what: "the trainer who saved a setting change" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__machine", what: "the machine's floor name in the menu's header" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__client", what: "the client's display name in the menu's header" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__rest", what: "a studio (\"at Solon\") and a trainer (\"Watching Sam's session\") on the header's Last time line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-safe__line", what: "a Critical note's author in the safety strip" },
  // Type and depth, phase 6 (Oct 4 2026): the codex's page title, upright Saira
  // 30 in its own capitalisation now, wraps like every name.
  { file: "features/client-codex/kit/kit.css", cls: "cx-page-title", what: "a Notes & Profile page's title (Saira 30, upright)" },
  // Type and depth, phase 11 (Oct 4 2026): the Hub's names. A lane head and
  // the peek's title are Saira now (17 and 22, upright); a booking's name was
  // already whole and wrapping, and is held here with them.
  { file: "features/hub-schedule/hub-grid.css", cls: "hs-colname", exact: ".hs-colname strong", what: "a trainer's name heading a lane on the Hub (Saira 17)" },
  { file: "features/hub-schedule/peek.css", cls: "hp-name", what: "the client's name on the Hub's peek (Saira 22)" },
  { file: "features/hub-schedule/hub-card.css", cls: "hs-card-name", what: "the client's name on a Hub booking" },
  // The narrow cards round, phase 2 (Oct 18 2026): Mindbody's staff name on
  // an Unassigned booking ("Booked with Samuel Lee") drops whole in the grid
  // where it has no room; wherever it shows, it wraps and is never cut.
  { file: "features/hub-schedule/hub-card.css", cls: "hs-card-staff", what: "Mindbody's staff name on an Unassigned Hub booking" },
  // Type and depth, phase 12 (Oct 4 2026): names set upright in the display
  // face, in their own capitalisation, wrap like every name.
  { file: "features/briefing/briefing.css", cls: "br__name", what: "the client's name on the briefing (Saira 22-30, upright)" },
  { file: "features/trainer-profile/trainer-profile.css", cls: "tp-identity__name", what: "the trainer's name on My Profile (Saira 22-30, upright)" },
  // The renewals dashboard (Oct 7 2026): the client and the primary trainer
  // on a renewals row (Operations → Clients → Renewals, and My renewals).
  { file: "features/renewals/renewal-row.css", cls: "rr__name", what: "the client on a renewals dashboard row" },
  { file: "features/renewals/renewal-row.css", cls: "rr__trainer", what: "the primary trainer on a renewals dashboard row" },
  { file: "features/renewals/renewal-row.css", cls: "rr-plan__sentence", what: "who set the renewal plan, on its row" },
  // Starting routines (the first-session design round, Oct 8 2026): the
  // template editor's "For new clients" part, the template list's line, and
  // My Studio → Studio → Starting routines.
  { file: "features/admin/admin.css", cls: "adm-tpl__start", what: "\"Starting routine · day one: Leg Press · Compound Row\" on a template's card" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-pick__name", what: "a template's machine on the editor's Day one" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-line", what: "\"Day one: Leg Press · Compound Row · Lumbar Extension\" under the editor's picks" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-row__name", what: "a starting routine's name on My Studio → Studio" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-row__meta", what: "a starting routine's day one, by its machines, on My Studio → Studio" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-opt__text", what: "head office's default, by name, on No default of our own" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-read", what: "head office's default, by name, on No default of our own, as a reader sees it" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt__hint", what: "head office's default, by name, under the editor's Head office's default switch" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-source", what: "\"Westlake's own choice\" on My Studio → Studio, the studio by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-cell__name", what: "a machine in Routine A's lineup (day one, on deck)" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-cell__sub", what: "\"instead of Seated Dip\" and a step's label under a machine in the lineup" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bench__name", what: "a machine on the bench, \"Not for {First}\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bench__line", what: "what stands in for a machine on the bench, by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-said__text", what: "what a plan change did: \"Chest Flye instead of Seated Dip\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-source", what: "the starting routine a plan came from, by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-start__machines", what: "a start's first machines on Another start" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-start__meta", what: "a starting routine's name on Another start" },
  // Start from a routine… (the open session round, Oct 9 2026).
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-start__name", what: "a routine's name on the session corner's Start from a routine…" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-tile__name", what: "a machine on This studio's floor" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__name", what: "a station's machine on the Road's one-line route" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__label", what: "\"Not for {First}\" over the Road's crossed stations" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-change__what", what: "a plan change, with the machines it names" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-change__meta", what: "who made a plan change, and the reason" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-replan__tag", what: "\"Re-planned · Oct 8 · {reason}\" in the Changes" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-replan__meta", what: "who re-planned" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-effect__text", what: "an order effect's two machines" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-sheet__title", what: "a machine's name heading its row sheet" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-panel__title", what: "\"{First}'s starting lineup\" and \"{First}'s Routine A\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-group__label", what: "\"Not for {First}\" over the bench" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-progress__line", what: "\"0 of 6 · day one: Leg Press, Compound Row and Lumbar\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-purpose", what: "a plan's purpose, in the trainer's words" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-line", what: "a sentence naming the client or a starting routine" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-meta", what: "a quiet line naming machines, the studio or a starting routine" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-chip", what: "a machine or a substitute set on a plan sheet's chips" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-door__line", what: "a door's line on Start a plan" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__progress", what: "the Road's progress line, \"0 of 6 · day one: Leg Press, Compound Row and Lumbar\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-sheet__label", what: "a sheet's label naming the client, \"Not for {First} for now · optional\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-well", what: "why a start was suggested, naming the studio or the intake's word" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-effect__why", exact: ".rpl-effect__why p", what: "an order effect's why, naming its two machines" },
  // The briefing's plan card (the first-session design round, Oct 8 2026, §4.5).
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-brief__title", what: "\"{First}'s starting lineup\" and \"How does {First} start?\" on the briefing" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-brief__lead", what: "\"{First} has a routine from before Journey\" on the briefing" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-tick__label", what: "a machine on Change today's ticks, and on the Wrap-up's Next time" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-next__ask", what: "\"Tick the ones that start Routine A.\" on the Wrap-up's Next time, the routine by name" },
  // B, molded in (Round 2 of the design round, item 6): the A | B lineup and Plan B.
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bcell__name", what: "a machine in Routine B's column, and a swap on Plan B (\"Leg Extension for Leg Press\")" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bcell__sub", what: "\"B's own · for Leg Press\" and \"Follows A · next swap: Simple Row\" under a B cell" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bstrip__title", what: "\"In B, instead of {machine}\" over a B place's choices" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bacademy__text", what: "the Academy's line about B beside Routine A's runs" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bstart__title", what: "\"B starts as a copy of A with one machine different\" down B's column" },
  // A weak area (Round 2 of the design round, item 7): the three answers.
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__line", what: "a routine's line on a weak area, \"Helpers only: Compound Row, Seated Dip and Pulldown\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__sub", what: "\"instead of Seated Dip\" under a weak area's Keep in B" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__what", what: "a weak area's suggestion, \"Overhead Press for Seated Dip\" and \"Add Lateral Raise\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__text", what: "the Academy's setting before a machine, naming the Triceps Extension" },
  // Today's list on the briefing (the briefing round, Oct 17 2026).
  { file: "features/briefing/briefing.css", cls: "br-today__name", what: "a machine on today's list on the briefing" },
  { file: "features/briefing/briefing.css", cls: "br-pick__name", what: "a machine, or a set of them, in + Add a machine and Swap" },
  { file: "features/briefing/briefing.css", cls: "br-today__undo", what: "\"{machine} out\" beside Undo" },
  { file: "features/briefing/briefing.css", cls: "br-today__warning", what: "an order rule naming its machines, and its fix" },
  { file: "features/routines/routines.css", cls: "rt-row__name", what: "a machine in Routine A or B on Programming" },
  { file: "features/routines/routines.css", cls: "rt-row__plan", what: "the plan's word under a Routine A machine in the Lineup (\"instead of Seated Dip\")" },
];

const rulesFor = (entry: (typeof NAME_RULES)[number]) =>
  rulesOf(entry.file).filter((r) =>
    r.selectors.some((s) => (entry.exact ? s === entry.exact : namesClass(subject(s), entry.cls) && !subject(s).includes("::"))),
  );

describe("names in the stylesheets", () => {
  it("are all real rules", () => {
    for (const entry of NAME_RULES) expect(rulesFor(entry).length, `${entry.file}: ${entry.exact ?? entry.cls}`).toBeGreaterThan(0);
  });

  it("are never cut short: no ellipsis, no line clamp, no one line with hidden overflow", () => {
    for (const entry of NAME_RULES) {
      const label = `${entry.exact ?? "." + entry.cls} (${entry.what})`;
      const bodies = rulesFor(entry).map((r) => r.body).join(";");
      expect(declared(bodies, "text-overflow").filter((v) => /ellipsis/.test(v)), `${label}: ellipsis`).toEqual([]);
      expect(declared(bodies, "-webkit-line-clamp"), `${label}: line clamp`).toEqual([]);
      expect(declared(bodies, "line-clamp"), `${label}: line clamp`).toEqual([]);
      const nowrap = declared(bodies, "white-space").some((v) => /nowrap|pre\b/.test(v));
      const hidden = declared(bodies, "overflow(?:-x)?").some((v) => /hidden|clip/.test(v));
      expect(nowrap && hidden, `${label}: one line, clipped`).toBe(false);
    }
  });

  it("wrap anywhere, so a long single word breaks rather than overflows", () => {
    for (const entry of NAME_RULES) {
      const bodies = rulesFor(entry).map((r) => r.body).join(";");
      expect(declared(bodies, "overflow-wrap"), `${entry.exact ?? "." + entry.cls}`).toContain("anywhere");
    }
  });

  it("sit in rows that grow: the session bar, the Next button and the order sheet's row set a minimum, never a height", () => {
    const rules = rulesOf("features/journey-grid/journey-grid.css");
    for (const sel of [".jg-sbar", ".jg-nb__next", ".jg-order__add", ".jg-nb--bar .jg-nb__next", ".jg-nb--side .jg-nb__next"]) {
      const found = rules.filter((r) => r.selectors.includes(sel));
      expect(found.length, sel).toBeGreaterThan(0);
      for (const r of found) expect(declared(r.body, "height"), sel).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */

/**
 * Elements whose class list is written in the TSX. Each `find` matches the
 * element by what it renders (a name), tolerant of reformatting; the class
 * list it captures must not say `truncate`, `line-clamp-*` or
 * `whitespace-nowrap` with `overflow-hidden`.
 */
const NAME_ELEMENTS: { file: string; find: RegExp; what: string }[] = [
  { file: "components/AppHeader.tsx", find: /"(font-display italic[^"]*)"/, what: "the studio's name in the top strip" },
  // Type and depth, Oct 4 2026: the bottom bar's labels truncated; they wrap
  // now, and the session's tab carries the client's first name.
  { file: "components/NavButton.tsx", find: /<span className=\{`(w-full text-center[^`]*)`\}>\s*\{label\}/, what: "a bottom-bar label (the session's tab names the client)" },
  // Type and depth, phase 7 (Oct 4 2026): the client's name on the profile,
  // Saira 30 upright now, in the header's card. It wrapped at a space with
  // break-word before; anywhere also lets the one-band landscape's narrow
  // name column break a single long word rather than widen.
  { file: "features/client-profile/ProfileHeader.tsx", find: /className="(cp-head__name [^"]*)"/, what: "the client's name on the profile header" },
  { file: "components/WorkoutTrackerView.tsx", find: /<span className="([^"]*)">\{name\}<\/span>/, what: "a machine in the end-of-session list" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /<span className="([^"]*)">\s*\{s\.fullName\}/, what: "a staff member's full name" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /htmlFor=\{`access-\$\{s\.id\}`\}\s*className="([^"]*)"/, what: "a studio's name on the access checkbox" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /htmlFor=\{`guest-\$\{s\.id\}`\}\s*className="([^"]*)"/, what: "a studio's name on the guest checkbox" },
  { file: "components/EditRoutineDrawer.tsx", find: /<span className="([^"]*)">\{p\.name\}<\/span>/, what: "a routine preset's name" },
  { file: "components/AccessRequestView.tsx", find: /<span className="([^"]*)">\s*\{authenticatedUser\.displayName/, what: "the signed-in person's name" },
];

describe("names in the screens", () => {
  it("are all found", () => {
    for (const el of NAME_ELEMENTS) expect(read(el.file).match(el.find), `${el.file}: ${el.what}`).not.toBeNull();
  });

  it("never carry truncate, a line clamp, or nowrap with hidden overflow", () => {
    for (const el of NAME_ELEMENTS) {
      const classes = read(el.file).match(el.find)![1];
      const label = `${el.file}: ${el.what}`;
      expect(classes, label).not.toMatch(/(?:^|[\s:])truncate(?:\s|$)/);
      expect(classes, label).not.toMatch(/line-clamp/);
      const nowrap = /(?:^|[\s:])whitespace-nowrap(?:\s|$)/.test(classes);
      const hidden = /(?:^|[\s:])overflow-(?:x-)?(?:hidden|clip)(?:\s|$)/.test(classes);
      expect(nowrap && hidden, `${label}: one line, clipped`).toBe(false);
    }
  });

  it("wrap anywhere", () => {
    for (const el of NAME_ELEMENTS) {
      expect(read(el.file).match(el.find)![1], `${el.file}: ${el.what}`).toMatch(/\[overflow-wrap:anywhere\]/);
    }
  });

  it("keep the studio switch in the top strip tappable at 40px", () => {
    expect(read("components/AppHeader.tsx").match(NAME_ELEMENTS[0].find)![1]).toMatch(/(?:^|\s)min-h-10(?:\s|$)/);
  });
});

/* ------------------------------------------------------------------ */
/* The narrow cards round (Oct 18 2026): a Hub card that shares its slot */
/* ------------------------------------------------------------------ */

/**
 * Two or three bookings that start together share their slot, side by
 * side, and a card a half or a third of its column says less (AJ: "Keep
 * them side by side, cards say less"). hub-card.css decides it by the column
 * (hs-col) and the slot's data-lanes; hub-card-short.test.ts and
 * hub-card-narrow.test.ts hold its look. These hold what this file is for:
 * nothing a narrow card shows is cut, and what it stops showing goes whole,
 * with something you can see in its place and its words in the card's label
 * (`spokenCard`) and the peek.
 */
const CARD_CSS = "features/hub-schedule/hub-card.css";

type BlockRule = { selectors: string[]; body: string; at: string };

/** Every innermost rule of a stylesheet, with the at-rules it sits inside ("" at the top), so a rule can be read beside the rest of its block. */
function blockRulesOf(file: string): BlockRule[] {
  const css = uncommented(read(file)).replace(/\r\n/g, "\n");
  const out: BlockRule[] = [];
  const stack: { prelude: string; start: number; nested: boolean }[] = [];
  let last = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      const prelude = css.slice(last, i).split(";").pop()!.trim().replace(/\s+/g, " ");
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude, start: i + 1, nested: false });
      last = i + 1;
    } else if (css[i] === "}") {
      const top = stack.pop();
      if (top && !top.nested && !top.prelude.startsWith("@") && !/^(?:from|to|\d+%)$/.test(top.prelude)) {
        out.push({ selectors: top.prelude.split(",").map((s) => s.trim()), body: css.slice(top.start, i), at: stack.map((s) => s.prelude).join(" ") });
      }
      last = i + 1;
    }
  }
  return out;
}

const CARD_RULES = blockRulesOf(CARD_CSS);
const hides = (body: string) => declared(body, "display").includes("none");
const shows = (body: string) => declared(body, "display").some((v) => v !== "none");
const cutBy = (body: string) => [
  ...declared(body, "text-overflow").filter((v) => /ellipsis/.test(v)),
  ...declared(body, "-webkit-line-clamp"),
  ...declared(body, "line-clamp"),
];
const clips = (body: string) => declared(body, "overflow(?:-[xy])?").some((v) => /hidden|clip/.test(v));
/** Does one of the rule's selectors style one of these classes (its subject, the last compound)? */
const styles = (r: { selectors: string[] }, ...classes: string[]) => r.selectors.some((s) => classes.some((c) => namesClass(subject(s), c)));
/** The one rule at the top of the card's stylesheet whose selectors include this one and that declares this property. */
function topRule(selector: string, prop: string): string {
  const found = CARD_RULES.filter((r) => r.at === "" && r.selectors.includes(selector) && declared(r.body, prop).length > 0);
  expect(found.length, `${selector} { ${prop} }`).toBe(1);
  return found[0].body;
}

describe("a narrow Hub card's name (the narrow cards round, Oct 18 2026)", () => {
  const nameRules = CARD_RULES.filter((r) => styles(r, "hs-card-name"));

  it("is set whole in the short form, in the lane head's narrower face (Saira, Type and depth), and shown unless her initials take its place", () => {
    const short = nameRules.filter((r) => r.at.startsWith("@container"));
    // Two, three and four to a slot (four at once is parked, its blocks written as three's).
    expect(short.length).toBe(3);
    for (const r of short) {
      const label = `${r.at} ${r.selectors.join(", ")}`;
      expect(declared(r.body, "font-family"), label).toEqual(["var(--font-display)"]);
      expect(declared(r.body, "font-weight"), label).toEqual(["700"]);
      expect(declared(r.body, "display"), label).toEqual(["var(--hs-name-shown, inline)"]);
      expect(declared(r.body, "white-space"), label).toEqual([]);
      expect(cutBy(r.body), label).toEqual([]);
      expect(clips(r.body), label).toBe(false);
    }
    // Nothing hides a client's name outright, at any width.
    for (const r of nameRules) expect(hides(r.body), `${r.at} ${r.selectors.join(", ")}`).toBe(false);
  });

  it("gives way only to her initials: every rule that switches the name off switches them on, keyed on a client's card or on her name's own attribute", () => {
    const off = CARD_RULES.filter((r) => declared(r.body, "--hs-name-shown").length > 0);
    const on = CARD_RULES.filter((r) => declared(r.body, "--hs-initials-shown").length > 0);
    expect(on).toEqual(off);
    // The shortest (three and four to a slot), and the long-name rule's one block per narrow line for two, three and four.
    expect(off.length).toBe(2 + 3 * NARROW_LINES.length);
    for (const r of off) {
      const label = `${r.at} ${r.selectors.join(", ")}`;
      expect(declared(r.body, "--hs-name-shown"), label).toEqual(["none"]);
      expect(declared(r.body, "--hs-initials-shown"), label).toEqual(["inline"]);
      for (const s of r.selectors) {
        // Never a card with no profile, still loading or unread: Mindbody's name stays whole there. A Mindbody
        // "Unavailable" block's word is not a name and it draws no initials: it drops the word, its hatching and its label say it.
        expect(s, label).toMatch(/\[data-kind="(?:client|staff)"\]$|\[data-name-over~="\d+"\]$/);
        expect(s, label).not.toMatch(/unlinked|pending|unknown/);
      }
    }
  });

  it("breaks only between words where it shows: on a narrow line one of her words is too wide for, a client's card says her initials", () => {
    const names = ["Bartholomew Hollingsworth", "Christopher Zimmerman", "Mary Ellen Szymanski-Abernathy", "Anne-Marie O'Shaughnessy", "Margaret Kaczmarek", "Elena Castellano", "Mary Ellen Noss", "Ann Lee"];
    let initials = 0;
    for (const name of names) {
      // name-fit.ts's narrow lines her name is too long for: HubCard writes them as data-name-over.
      const over = new Set(nameOverLines(name));
      // A word breaks after its hyphen, as the browser breaks it ("Szymanski-" / "Abernathy"), and nowhere else inside.
      const words = name.split(/\s+/).flatMap((w) => w.split(/(?<=-)(?=[^-\d])/));
      for (const line of NARROW_LINES) {
        if (over.has(line)) {
          initials += 1;
          continue;
        }
        for (const w of words) expect(narrowWidth(w) + FIT_SLACK_PX, `${name}: "${w}" on a ${line}px line`).toBeLessThanOrEqual(line);
      }
    }
    // "Hollingsworth" is 71.3px in the narrow face: initials from the 60px line to the 72px.
    expect(nameOverLines("Bartholomew Hollingsworth")).toEqual([60, 62, 64, 66, 68, 70, 72]);
    expect(initials).toBeGreaterThan(0);
  });
});

/**
 * THE ONE EXCEPTION: HER INITIALS. AJ, Oct 18 2026, on the "Two at Once"
 * page: "Keep them side by side, cards say less"; then "Build it as you
 * described, including initials for the very long names", which accepted
 * that the shortest card bends "names are never truncated". A Hub card
 * three to a slot in a column under 228px (every upright iPad), or a narrow
 * card whose client's name would need a third line or has a word wider
 * than the line, says her initials in her name's place, so the time stays
 * on the card. Only there: never on a full card or the phone's list, never
 * on a card with no profile or still loading (it opens no peek, so
 * Mindbody's name stays whole), and her whole name is the first thing the
 * card's label says, the peek's title (`.hp-name`, above) and the
 * profile's. No other name in the app is shortened.
 */
const NAME_EXCEPTIONS: { file: string; cls: string; why: string }[] = [
  {
    file: CARD_CSS,
    cls: "hs-card-initials",
    why: 'AJ, Oct 18 2026: "Keep them side by side, cards say less", then "Build it as you described, including initials for the very long names"',
  },
];

describe("her initials, the ONE exception (the narrow cards round, Oct 18 2026)", () => {
  const initialsRules = CARD_RULES.filter((r) => styles(r, "hs-card-initials"));

  it("are the only one, and not a name this file asks to wrap", () => {
    expect(NAME_EXCEPTIONS).toHaveLength(1);
    for (const ex of NAME_EXCEPTIONS) {
      expect(NAME_RULES.some((n) => n.cls === ex.cls), ex.cls).toBe(false);
      expect(rulesOf(ex.file).some((r) => r.selectors.some((s) => namesClass(subject(s), ex.cls))), `${ex.cls}: ${ex.why}`).toBe(true);
    }
  });

  it("show only on a narrow card: hidden on a full card, and in the short form only where her name is switched off", () => {
    const withDisplay = initialsRules.filter((r) => declared(r.body, "display").length > 0);
    expect(withDisplay.filter((r) => r.at === "").map((r) => declared(r.body, "display"))).toEqual([["none"]]);
    const narrow = withDisplay.filter((r) => r.at !== "");
    expect(narrow.length).toBe(3);
    for (const r of narrow) {
      expect(r.at).toMatch(/^@container hs-col \(max-width: [\d.]+px\)$/);
      expect(declared(r.body, "display")).toEqual(["var(--hs-initials-shown, none)"]);
    }
    // Nothing else draws them: the grid's other sheet and the phone's list (a full card) never name them.
    expect(read("features/hub-schedule/hub-grid.css")).not.toMatch(/hs-card-initials/);
    expect(read("features/phone/phone.css")).not.toMatch(/hs-card-initials/);
  });

  it("are never cut themselves: two letters, whole, that fit the narrowest card's line", () => {
    for (const r of initialsRules) {
      const label = `${r.at} ${r.selectors.join(", ")}`;
      expect(cutBy(r.body), label).toEqual([]);
      expect(clips(r.body), label).toBe(false);
    }
    const look = topRule(".hs-card-initials", "font-size");
    const size = Number(/^([\d.]+)px$/.exec(declared(look, "font-size")[0])![1]);
    const spacing = Number(/^([\d.]+)em$/.exec(declared(look, "letter-spacing")[0])![1]);
    // Counted a whole em each, wider than any letter Saira holds (W is 0.756), so a letter it doesn't hold fits too.
    expect(Math.max(...Object.values(SAIRA_700_UNITS)) / SAIRA_UNITS_PER_EM).toBeLessThan(1);
    const twoLetters = 2 * (size + spacing * size);
    // The least column (hub-grid.css's --hs-col-min less its 1px edge), three to a slot, less the 15.5px the
    // slot and the card keep on a narrow card (hub-card-short.test.ts holds the 15.5).
    const colMin = Number(/--hs-col-min:\s*([\d.]+)px/.exec(read("features/hub-schedule/hub-grid.css"))![1]);
    expect(twoLetters).toBeLessThanOrEqual((colMin - 1) / 3 - 15.5);
    for (const name of ["Mary Ellen Szymanski-Abernathy", "Bartholomew Hollingsworth", "Anne-Marie O'Shaughnessy", "Cher", "Ann Lee"]) {
      expect([...initialsOf(name)].length, name).toBeLessThanOrEqual(2);
    }
    expect(clientInitials({ firstName: "Mary Ellen", lastName: "Szymanski-Abernathy" })).toBe("MS");
    expect(clientInitials({ firstName: "Bartholomew", lastName: "Hollingsworth", nickname: "Bart" })).toBe("BH");
  });

  it("leave her whole name the first thing the card's label says", () => {
    const name = "Mary Ellen Szymanski-Abernathy";
    const label = spokenCard({ name, numberText: "#264", stateWords: ["Not logged"], time: "10:00", critical: null, glyphs: [], more: 0, moreLabel: null, rest: [] });
    expect(label).toBe(`${name}, session 264, Not logged, 10:00`);
  });
});

/** The parts a card's time is drawn in: the clock, a span without its AM or PM, and the time again where a word stood. */
const TIME_PARTS = ["hs-card-clock", "hs-card-clock-short", "hs-card-alt-time"];
/** The time's line, what holds it on the card, and the time itself. */
const TIME_LINE = ["hs-card-meta", "hs-card-when", ...TIME_PARTS];
/** What holds a card outside it: the grid (all of hub-grid.css, whose folds say times too) and the phone's day list. */
const CARD_HOSTS: { file: string; classes?: string[] }[] = [
  { file: "features/hub-schedule/hub-grid.css" },
  { file: "features/phone/phone.css", classes: ["ph-day", "ph-day__list", "ph-day__row", "ph-day__cell", "ph-day__card"] },
];

describe("a Hub card's time is never cut (the narrow cards round, Oct 18 2026)", () => {
  it("is never in an ellipsis or a line clamp: none anywhere on the card, nor on the grid or the phone's day list that hold it", () => {
    for (const r of CARD_RULES) expect(cutBy(r.body), `${CARD_CSS}: ${r.at} ${r.selectors.join(", ")}`).toEqual([]);
    for (const host of CARD_HOSTS) {
      for (const r of blockRulesOf(host.file)) {
        if (host.classes && !styles(r, ...host.classes)) continue;
        expect(cutBy(r.body), `${host.file}: ${r.at} ${r.selectors.join(", ")}`).toEqual([]);
      }
    }
  });

  it("is clipped only on the Now line, one line high, where the clock comes first and only the word Now can drop", () => {
    // Beside the time line, the words after it (.hs-card-rest) and the Unassigned column's staff line drop whole
    // into boxes of their own; the card's own edge clips its corners, and the lanes harness measured that no
    // client's time is pushed past it, two or three to a slot.
    const clipped = CARD_RULES.filter((r) => styles(r, ...TIME_LINE) && clips(r.body));
    expect(clipped.map((r) => [r.at, r.selectors])).toEqual([["", ['.hs-card-when[data-now="true"]']]]);
    const now = clipped[0].body;
    expect(declared(now, "height")).toEqual(declared(topRule(".hs-card-when", "line-height"), "line-height"));
    expect(declared(now, "flex-direction")).toEqual(["row-reverse"]);
    expect(declared(now, "flex-wrap")).toEqual(["wrap"]);
    expect(declared(now, "min-width")).toEqual(["min-content"]);
    // The clock comes first: the word Now is ordered after it, and nothing orders a time part after the word.
    const orderOf = (...classes: string[]) => CARD_RULES.filter((r) => styles(r, ...classes)).flatMap((r) => declared(r.body, "order").map(Number));
    expect(orderOf("hs-card-now-part")).toEqual([1]);
    expect(orderOf(...TIME_PARTS).filter((o) => o > 0)).toEqual([]);
    // And it does not wrap there: the time line is one line, and only a span's time may wrap at its spaces
    // (a consult's, or a span without its AM or PM), where the word Now never stands (HubCard).
    expect(declared(topRule(".hs-card-when", "white-space"), "white-space")).toEqual(["nowrap"]);
    for (const r of CARD_RULES.filter((x) => styles(x, ...TIME_PARTS) && declared(x.body, "white-space").some((v) => v !== "nowrap"))) {
      for (const s of r.selectors) expect(s, `${r.at} ${s}`).toMatch(/\[data-span(?:="[a-z]+")?\]|\.hs-card-clock-short$/);
    }
  });

  it("is never hidden but for its own short form: a block that hides the clock shows the span without its AM or PM, for the same card", () => {
    let hidden = 0;
    for (const r of CARD_RULES) {
      if (!hides(r.body)) continue;
      for (const s of r.selectors) {
        const subj = subject(s);
        const label = `${r.at} ${s}`;
        // The time's line is never hidden.
        expect(namesClass(subj, "hs-card-when") || namesClass(subj, "hs-card-meta"), label).toBe(false);
        // The span without its AM or PM and the time again are hidden only on a full card, where the clock shows.
        if (namesClass(subj, "hs-card-clock-short") || namesClass(subj, "hs-card-alt-time")) expect(r.at, label).toBe("");
        if (namesClass(subj, "hs-card-clock")) {
          hidden += 1;
          const twin = s.replace(/\.hs-card-clock(?![\w-])/, ".hs-card-clock-short");
          expect(CARD_RULES.some((x) => x.at === r.at && x.selectors.includes(twin) && shows(x.body)), `${label}: shows ${twin}`).toBe(true);
        }
      }
    }
    // Two, three and four to a slot.
    expect(hidden).toBe(3);
    expect(declared(topRule(".hs-card-clock", "display"), "display")).toEqual(["contents"]);
  });
});

/** Every state a card can be in: a state added to HubCardState must be added here (the typecheck says so). */
const CARD_STATES = {
  live: true,
  "in-session": true,
  "left-open": true,
  done: true,
  "not-logged": true,
  "didnt-come": true,
  past: true,
  unread: true,
} satisfies Record<HubCardState, true>;

/** What happened, in its word ("Not logged", "Late cancel", "Left open"), and the part that holds the word with its dot. */
const STATE_WORD = ["hs-card-state", "hs-card-state-part"];

describe("a Hub card's state word is never cut (the narrow cards round, Oct 18 2026)", () => {
  it("is never ellipsised or clipped, and never sits on the Now line, the one time line that clips", () => {
    // No ellipsis or line clamp anywhere on the card: the time's first rule, above.
    for (const r of CARD_RULES.filter((x) => styles(x, ...STATE_WORD))) {
      const label = `${r.at} ${r.selectors.join(", ")}`;
      expect(cutBy(r.body), label).toEqual([]);
      expect(clips(r.body), label).toBe(false);
    }
    // Only a card still to come is ever Now, and it says no state word; every card with a word is never Now.
    const start = new Date("2026-10-19T14:00:00Z");
    const end = new Date("2026-10-19T14:30:00Z");
    const during = new Date("2026-10-19T14:10:00Z");
    expect(hubCardIsNow({ state: "live", start, end, now: during })).toBe(true);
    for (const state of Object.keys(CARD_STATES) as HubCardState[]) {
      if (state !== "live") expect(hubCardIsNow({ state, start, end, now: during }), state).toBe(false);
    }
    expect(cardStateWords({ kind: "client", state: "live", now: true })).toEqual(["Now"]);
  });

  it("gives way only to its symbol: a block that hides the word shows .hs-card-sym for the same card (the Key says what each means)", () => {
    let hidden = 0;
    for (const r of CARD_RULES) {
      if (!hides(r.body)) continue;
      for (const s of r.selectors) {
        const subj = subject(s);
        if (!STATE_WORD.some((c) => namesClass(subj, c))) continue;
        hidden += 1;
        const sym = `${s.slice(0, s.length - subj.length).trim()} .hs-card-sym`;
        expect(CARD_RULES.some((x) => x.at === r.at && x.selectors.includes(sym) && shows(x.body)), `${r.at} ${s}: shows ${sym}`).toBe(true);
      }
    }
    // Two, three and four to a slot.
    expect(hidden).toBe(3);
    // A full card says the word and draws no symbol.
    expect(declared(topRule(".hs-card-state-part", "display"), "display")).toEqual(["contents"]);
    expect(declared(topRule(".hs-card-sym", "display"), "display")).toEqual(["none"]);
  });

  it("lets In session and Not synced yet give way to the time, the blue fill saying the one and the cloud or the dashed edge the other", () => {
    let hidden = 0;
    for (const r of CARD_RULES) {
      if (!hides(r.body)) continue;
      for (const s of r.selectors) {
        if (!/\[data-state="in-session"\] \.hs-card-when > strong$/.test(s) && !namesClass(subject(s), "hs-card-unsynced")) continue;
        hidden += 1;
        const alt = `${/^(.*?\.hs-card)(?![\w-])/.exec(s)![1]} .hs-card-alt-time`;
        expect(CARD_RULES.some((x) => x.at === r.at && x.selectors.includes(alt) && shows(x.body)), `${r.at} ${s}: shows ${alt}`).toBe(true);
      }
    }
    // Each, two, three and four to a slot.
    expect(hidden).toBe(6);
    // The fill and the dashed edge are drawn at every width.
    expect(declared(topRule('.hs-card[data-state="in-session"]', "background"), "background")).toEqual(["var(--eq-live-fill)"]);
    expect(declared(topRule('.hs-card[data-kind="unlinked"]', "border"), "border")).toEqual(["1px dashed var(--eq-border)"]);
  });
});
