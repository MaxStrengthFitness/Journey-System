/**
 * PLAYBOOKS — Life Transformer 101 and beyond: the business side of the job,
 * written for the floor.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (contract part A6). The
 * Academy is the method; it does not say how a session runs in Journey, how
 * the packages are talked about, what FORD is, or how a renewal conversation
 * goes. Those live in Journey's own notes (docs/business/ and the feature
 * READMEs that record AJ's decisions), written for developers. These pages
 * say the same things to a Life Transformer between clients: short
 * paragraphs, second person, no app internals.
 *
 * EVERY PAGE IS A DRAFT. "Corporate owns the method, so corporate reads it
 * before adopting it" (CLAUDE.md, Sep 20 2026). Claude wrote these from
 * Journey's notes; head office has not read them. `status` is "draft" on
 * every page and a design shows PLAYBOOK_DRAFT_LINE wherever a playbook is
 * drawn. Every line cites the file and line it came from (write.ts), so the
 * person who reads it for head office can check each one.
 *
 * What is never here (business digest §5): prices (each studio's own), the
 * leaders' renewal screens and per-trainer rates, anything that says the app
 * suggests a weight or contacts a client, and the Academy's stale package
 * lines. `playbooks.test.ts` holds the rules a test can hold.
 *
 * PURE MODULE: data only. No React, no Firestore, no JSON import.
 */

import type { PillarId, PlaybookPage, Track } from "../types";
import { FIRST_SESSIONS } from "./pages/first-sessions";
import { FORD } from "./pages/ford";
import { PACKAGES_PAGE } from "./pages/packages";
import { PROGRESS_REPORT } from "./pages/progress-report";
import { PULSE } from "./pages/pulse";
import { RENEWALS_PAGE } from "./pages/renewals";
import { THE_KIT } from "./pages/the-kit";
import { THE_TWENTY_MINUTES } from "./pages/the-twenty-minutes";
import { WHY_EVERY_RULE } from "./pages/why-every-rule";
import { TRACKS } from "./tracks";
import { parsePlaybookSource, SOURCE_TITLES } from "./write";

export { TRACKS } from "./tracks";
export { HUTCHINS_LABEL } from "./pages/why-every-rule";
export { FOUR_PS, FOUR_PS_TITLE, parsePlaybookSource, playbookSourceLabel, SOURCE_TITLES } from "./write";

/** The five shelves, in the order a new Life Transformer meets them. */
export const PILLARS: { id: PillarId; title: string; blurb: string }[] = [
  {
    id: "floor",
    title: "The floor and the protocol",
    blurb: "What a session is, and the one definition every rule on the floor comes from.",
  },
  {
    id: "equipment",
    title: "Equipment and cueing",
    blurb: "The kit you carry, the machines, and the words you say at each moment of a set.",
  },
  {
    id: "programming",
    title: "Programming and adapting",
    blurb: "Starting a new client, building a routine, and keeping up with how life is going.",
  },
  {
    id: "consult",
    title: "Consultations and packages",
    blurb: "The first visits, the packages, and what to do when money is the worry.",
  },
  {
    id: "retention",
    title: "Relationships and renewals",
    blurb: "Knowing the person, showing them their progress, and the renewal conversation.",
  },
];

/** Every playbook, in reading order: by pillar, then the order within it. */
export const PLAYBOOKS: PlaybookPage[] = [
  THE_TWENTY_MINUTES,
  WHY_EVERY_RULE,
  THE_KIT,
  FIRST_SESSIONS,
  PULSE,
  PACKAGES_PAGE,
  FORD,
  PROGRESS_REPORT,
  RENEWALS_PAGE,
];

/**
 * The one line every playbook shows, so no design words the draft status its
 * own way. Head office reads a playbook before it stops being a draft.
 */
export const PLAYBOOK_DRAFT_LINE = "A draft from Journey's notes, waiting for head office to read it.";

/**
 * THE PLAYBOOKS A READER SEES (the Mix for everyone, Oct 20 2026). AJ:
 * "playbooks hidden until head office reads them." A page shows once its
 * file says `status: "read"`, set by whoever reads it for head office (AJ or
 * Jeff); until then it is kept here and tested, and drawn nowhere: not on the
 * Academy's shelves, not in a path, not on the map, not as a quiz answer's
 * door. Today that is none of them.
 */
export const SHOWN_PLAYBOOKS: PlaybookPage[] = PLAYBOOKS.filter((p) => p.status === "read");

/**
 * The quiz's playbooks deck ("The floor and the conversation") asks about
 * the same business notes the playbooks were written from, so it waits with
 * them: it shows once any playbook does.
 */
export const PLAYBOOKS_DECK_SHOWN = SHOWN_PLAYBOOKS.length > 0;

/**
 * The paths as a reader sees them: a step that opens a playbook nobody may
 * see yet is left out, so is a step to the playbooks deck while it waits, and
 * a path left with no step at all is left out with them. Nothing else about a
 * path changes (its order, its words).
 */
export function shownTracks(tracks: readonly Track[], shown: readonly PlaybookPage[], deckShown: boolean): Track[] {
  const ids = new Set(shown.map((p) => p.id));
  const out: Track[] = [];
  for (const t of tracks) {
    const steps = t.steps.filter((s) => {
      if (s.route.kind === "playbook") return ids.has(s.route.id);
      if (s.route.kind === "quiz" && s.route.deck === "playbooks") return deckShown;
      return true;
    });
    if (steps.length === 0) continue;
    out.push(steps.length === t.steps.length ? t : { ...t, steps });
  }
  return out;
}

const PLAYBOOK_BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p]));
const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

export function playbookById(id: string): PlaybookPage | null {
  return PLAYBOOK_BY_ID.get(id) ?? null;
}

export function trackById(id: string): Track | null {
  return TRACK_BY_ID.get(id) ?? null;
}

/** A pillar's playbooks, in reading order. An unknown pillar has none. */
export function playbooksForPillar(pillar: PillarId): PlaybookPage[] {
  return PLAYBOOKS.filter((p) => p.pillar === pillar);
}

/** The pillar a playbook sits on, with its title. Null for an unknown id. */
export function pillarOf(page: PlaybookPage): { id: PillarId; title: string; blurb: string } | null {
  return PILLARS.find((p) => p.id === page.pillar) ?? null;
}

/**
 * The files a page draws from, by the names a reader sees, in the order the
 * page first cites them: "The floor · History before Journey". What a page's
 * one sources line says (VaultPage.source for a playbook).
 */
export function playbookSourcesLine(page: PlaybookPage): string {
  const titles: string[] = [];
  for (const section of page.sections) {
    for (const block of section.blocks) {
      const parsed = parsePlaybookSource(block.source);
      if (!parsed) continue;
      const title = SOURCE_TITLES[parsed.path] ?? parsed.path;
      if (!titles.includes(title)) titles.push(title);
    }
  }
  return titles.length > 0 ? `Written from: ${titles.join(" · ")}` : "";
}

/** Every file a page cites, as repo paths, in first-cited order. For head office's read. */
export function playbookSourceFiles(page: PlaybookPage): string[] {
  const out: string[] = [];
  for (const section of page.sections) {
    for (const block of section.blocks) {
      const parsed = parsePlaybookSource(block.source);
      if (parsed && !out.includes(parsed.path)) out.push(parsed.path);
    }
  }
  return out;
}
