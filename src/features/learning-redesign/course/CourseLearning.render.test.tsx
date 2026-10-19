// @vitest-environment jsdom
/**
 * DESIGN 3, THE INTERACTIVE COURSE — mounted whole (the Learning vault
 * redesign, Oct 19 2026).
 *
 * The vault's data is the real Academy corpus (the JSON, imported here as
 * tests may), built once into the shape useVaultData hands a design, so the
 * pages, the step cards, the drills and the markup are the real ones. What
 * is walked: the Overview, a machine's field manual, a lesson's cards (Next,
 * Back, Read it all), a course's lessons, a jump from outside, the vault, the
 * section switch, and the way back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../phone/device", () => ({ usePhone: () => false, isPhoneNow: () => false }));

/** A test's change to the vault's data (a floor that can't be read, a chunk that failed), applied once per patch. */
const patch = vi.hoisted(() => ({ fn: null as null | ((d: Record<string, unknown>) => Record<string, unknown>) }));

vi.mock("../../learning-vault/useVaultData", async () => {
  const [{ ACADEMY_INDEX }, academy, cuesF, cardsF, scriptsF, overviewsF, glossaryF, performance, defsM, ent, pb, bankM] = await Promise.all([
    import("../../academy/useAcademyContent"),
    import("../../academy/academy-machines"),
    import("../../academy/content/cues.json"),
    import("../../academy/content/cards.json"),
    import("../../academy/content/scripts.json"),
    import("../../academy/content/overviews.json"),
    import("../../academy/content/glossary.json"),
    import("../../academy/content/performance.json"),
    import("../../../data/machine-definitions"),
    import("../../learning-vault/entities"),
    import("../../learning-vault/playbooks"),
    import("../../learning-vault/quiz/bank"),
  ]);
  const { CLINICAL_FLAGS_MATRIX } = await import("../../../data/clinical-matrix");
  const { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } = await import("../../routine-builder/academy");
  const { buildVaultGraph } = await import("../../learning-vault/graph");
  const graphIndex = await import("../../learning-vault/graph-index.json");
  const read = <T,>(m: unknown, key: string): T => ((m as { default: Record<string, T> }).default ?? (m as Record<string, T>))[key];
  const cues = read<never[]>(cuesF, "cues");
  const cards = read<never[]>(cardsF, "cards");
  const scripts = read<never[]>(scriptsF, "scripts");
  const overviews = read<never[]>(overviewsF, "overviews");
  const glossary = read<{ term: string; definition: string }[]>(glossaryF, "glossary");
  const perf = (performance as { default: unknown }).default ?? performance;
  const names = (id: string) => academy.machineName(id) ?? id;
  const machines = academy.buildAcademyMachines(cards, scripts, overviews, undefined);
  const modules: Record<string, never> = { performance: perf as never };
  const data = {
    index: ACADEMY_INDEX,
    machines,
    defs: defsM.MACHINE_DEFINITIONS,
    floor: [
      { id: "m-leg-press", name: "Leg Press", code: "LP" },
      { id: "m-compound-row", name: "Compound Row", code: "CR" },
    ],
    floorState: "ready",
    names,
    glossary,
    cues,
    cards,
    scripts,
    overviews,
    modules,
    loadModule: () => {},
    moduleFailed: () => false,
    cachedModule: (id: string) => modules[id] ?? null,
    entities: ent.buildEntityIndex({ glossary, machines, clinical: CLINICAL_FLAGS_MATRIX, playbooks: pb.PLAYBOOKS, modules: ACADEMY_INDEX.modules }),
    graph: buildVaultGraph({
      index: ACADEMY_INDEX,
      machines,
      glossary,
      cues,
      clinical: CLINICAL_FLAGS_MATRIX,
      playbooks: pb.PLAYBOOKS,
      graphIndex: ((graphIndex as { default?: unknown }).default ?? graphIndex) as never,
      substitutes: EXERCISE_SUBSTITUTES,
      categories: MACHINE_CATEGORY,
    }),
    playbooks: pb.PLAYBOOKS,
    tracks: pb.TRACKS,
    pillars: pb.PILLARS,
    quizBank: bankM.questionBank({ glossary, cues, scripts, cards, defs: defsM.MACHINE_DEFINITIONS, names, playbooks: pb.PLAYBOOKS }),
  };
  // The same object while the patch is the same: pages memoise on it.
  let seen: unknown = undefined;
  let patched: Record<string, unknown> = data;
  return {
    useVaultData: () => {
      if (patch.fn !== seen) {
        seen = patch.fn;
        patched = patch.fn ? { ...data, ...patch.fn(data) } : data;
      }
      return patched;
    },
  };
});

import { UnsavedChangesProvider } from "../../unsaved-changes";
import { WikiSectionsProvider, type WikiSectionsValue } from "../../wiki/sections";
import { createSandboxStore } from "../../learning-vault/markup-store";
import { sampleSeed } from "../../learning-vault/sample";
import { VaultProvider } from "../../learning-vault/ui/VaultProvider";
import type { LearningRef } from "../../learning/ref";
import type { LearningViewId } from "../../learning/LearningView";
import CourseLearning from "./CourseLearning";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const viewer = { uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };

let section: LearningViewId = "learning";
let jump: LearningRef | null = null;
let resetSignal = 0;
const handled = vi.fn(() => {
  jump = null;
});
const sectionsSeen: string[] = [];

async function draw(opts?: { section?: LearningViewId; jump?: LearningRef | null; headOffice?: boolean; resetSignal?: number }) {
  if (opts?.section) section = opts.section;
  if (opts?.resetSignal !== undefined) resetSignal = opts.resetSignal;
  if (opts && "jump" in opts) jump = opts.jump ?? null;
  const store = drawStore;
  const sections: WikiSectionsValue = {
    title: "Learning",
    sections: [
      { id: "learning", label: "Overview" },
      { id: "machine-anatomy", label: "Catalog" },
      { id: "academy", label: "Academy" },
    ],
    active: section,
    onSelect: (id) => sectionsSeen.push(id),
  };
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <WikiSectionsProvider value={sections}>
          <VaultProvider store={store} studio={{ id: "solon", name: "Solon" }} viewer={{ ...viewer, isHeadOffice: Boolean(opts?.headOffice) }}>
            <CourseLearning
              section={section}
              onSection={(id) => sectionsSeen.push(id)}
              machines={[]}
              studioId="solon"
              studioName="Solon"
              jump={jump}
              onJumpHandled={handled}
              resetSignal={resetSignal}
            />
          </VaultProvider>
        </WikiSectionsProvider>
      </UnsavedChangesProvider>,
    );
  });
}

let drawStore = createSandboxStore(sampleSeed({ id: "solon", name: "Solon" }, new Date("2026-10-19T12:00:00Z")));

beforeEach(() => {
  patch.fn = null;
  section = "learning";
  jump = null;
  resetSignal = 0;
  handled.mockClear();
  sectionsSeen.length = 0;
  drawStore = createSandboxStore(sampleSeed({ id: "solon", name: "Solon" }, new Date("2026-10-19T12:00:00Z")));
});

const text = () => host.textContent ?? "";
const all = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
function button(words: string | RegExp): HTMLButtonElement {
  const found = all("button").find((b) => {
    const t = (b.getAttribute("aria-label") ?? "") + " " + (b.textContent ?? "");
    return typeof words === "string" ? t.includes(words) : words.test(t);
  });
  if (!found) throw new Error(`No button says ${String(words)}`);
  return found as HTMLButtonElement;
}
async function tap(el: HTMLElement) {
  await act(async () => el.click());
}
function crumbs(): string[] {
  return all(".wk__crumbs li").map((li) => (li.textContent ?? "").trim());
}
/** The card on turn (every content card is drawn, stacked; only this one is seen). */
const current = () => host.querySelector<HTMLElement>(".crs__deck .crs__card[data-current]");
async function type(el: HTMLTextAreaElement | HTMLInputElement, words: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, words);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const DRAFT = "A draft from Journey's notes, waiting for head office to read it.";
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe("the Overview", () => {
  it("starts with a course, its first lessons showing, and the doors to practise", async () => {
    await draw();
    expect(host.querySelector(".crs__hero h1")?.textContent).toBe("Life Transformer 101");
    expect(all(".crs__hero-steps .crs__lesson")).toHaveLength(3);
    expect(text()).toContain("Play a round");
    expect(text()).toContain("What would you cue?");
    expect(host.querySelector(".vtr")).not.toBeNull();
    // The floor, in walking order, as the field manual.
    expect(all(".crs__tile").map((t) => t.querySelector(".crs__tile-name")?.textContent)).toEqual(["Leg Press", "Compound Row"]);
    // Head office's door shows only for head office.
    expect(text()).not.toContain("Waiting for head office");
  });

  it("shows head office its queue's door", async () => {
    await draw({ headOffice: true });
    expect(text()).toContain("Waiting for head office");
  });

  it("reveals the drill of the day's lines only when asked", async () => {
    await draw();
    expect(host.querySelector(".crs__drill-lines")).toBeNull();
    await tap(button("Show the Academy's lines"));
    expect(all(".crs__drill-lines li").length).toBeGreaterThan(0);
  });
});

describe("home → a machine → a lesson → back", () => {
  it("walks the trail and comes back up it", async () => {
    await draw();
    await tap(all(".crs__tile")[0]);

    // The field manual: the dials as pins, Stop never folded, the set-up deck, the full manual.
    // Named the Catalog's way (the standard's name, here in its capitals).
    expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe("leg press");
    expect(crumbs().map((c) => c.toLowerCase())).toEqual(["overview", "leg press"]);
    expect(all(".crs__pin").map((p) => p.querySelector(".crs__pin-label")?.textContent)).toEqual([
      "Gap",
      "Seat Angle",
      "Shoulder Pads",
      "Seat Distance",
    ]);
    expect(host.querySelector(".crs__stop")).not.toBeNull();
    // The set-up, one list by default (the floor reads it top to bottom),
    // named by its parts' own titles; no deck until Step through.
    const h1 = host.querySelector("h1")?.textContent;
    expect(host.querySelector(`.crs__setlist[aria-label="Set up ${h1}"]`)).not.toBeNull();
    expect(host.querySelector(".crs__deck")).toBeNull();
    // The studio's crossed-out line shows crossed out, with why.
    expect(text()).toContain("Our Abduction comes after the Leg Press");
    // A pin a set-up line names goes to that line, and marks it.
    const pins = all("button.crs__pin");
    expect(pins.length).toBeGreaterThan(0);
    await tap(pins[pins.length - 1]);
    const marked = host.querySelector<HTMLElement>(".crs__setlist [data-target]");
    expect(marked).not.toBeNull();
    const dial = pins[pins.length - 1].querySelector(".crs__pin-label")?.textContent ?? "";
    expect((marked?.textContent ?? "").toLowerCase()).toContain(dial.toLowerCase());
    // Step through: the same lines as step cards; a pin then turns the deck.
    await tap(button("Step through"));
    expect(host.querySelector(`.crs__deck[aria-label="Set up ${h1}"]`)).not.toBeNull();
    expect(host.querySelector(".crs__setlist")).toBeNull();
    expect(current()?.getAttribute("aria-label")).toMatch(/^Card 1 of /);
    await tap(all("button.crs__pin")[pins.length - 1]);
    expect(current()?.textContent?.toLowerCase()).toContain(dial.toLowerCase());

    // The full manual one tier at a time, opening on the first tier the page
    // has not drawn above it (Adapt & clinical): only the tier picked is
    // drawn, and a mark on another tier is never listed as a line that changed.
    expect(button("Adapt & clinical").getAttribute("aria-pressed")).toBe("true");
    const manualTitles = () => all(".crs__whole .vta__title").map((h) => h.textContent);
    const adapt = manualTitles();
    expect(adapt.length).toBeGreaterThan(0);
    await tap(button("Script & cues"));
    expect(button("Script & cues").getAttribute("aria-pressed")).toBe("true");
    const script = manualTitles();
    expect(script.length).toBeGreaterThan(0);
    expect(script.some((t) => adapt.includes(t))).toBe(false);
    expect(host.querySelector("style")).toBeNull();
    expect(all(".crs__whole .vta__orphans")).toHaveLength(0);

    // Back up the trail.
    await tap(host.querySelector<HTMLButtonElement>(".wk__up")!);
    expect(host.querySelector(".crs__hero")).not.toBeNull();
  });

  it("opens a course, steps through a lesson's cards, and reads it whole", async () => {
    await draw();
    await tap(button("All 9 lessons"));
    expect(host.querySelector("h1")?.textContent).toBe("Life Transformer 101");
    expect(all(".crs__lessons .crs__lesson")).toHaveLength(9);

    // Lesson 4: Speed of Movement, an Academy topic in the performance module.
    await tap(all(".crs__lessons .crs__lesson")[3]);
    expect(crumbs()).toEqual(["Overview", "Life Transformer 101", "Speed of Movement"]);
    expect(host.querySelector(".crs__coursebar")?.textContent).toContain("Lesson 4 of 9");
    const first = current()?.textContent;
    await tap(host.querySelector<HTMLButtonElement>(".crs__deck-next")!);
    expect(current()?.textContent).not.toBe(first);
    expect(current()?.getAttribute("data-dir")).toBe("next");
    await tap(button("Back a card"));
    expect(current()?.textContent).toBe(first);

    // Read it all: the same page through ArticleBlocks, where a line takes actions.
    await tap(button("Read it all"));
    expect(host.querySelector(".crs__card")).toBeNull();
    const line = host.querySelector<HTMLElement>("[data-vta-line]");
    expect(line).not.toBeNull();
    await tap(line!);
    expect(text()).toContain("Cross out for Solon");
    // Its foot says where the words come from as a trainer would, never a file path.
    expect(host.querySelector(".crs__source")?.textContent).toMatch(/^Academy 4\.\d+ /);
    expect(text()).not.toContain("docs/msf-academy");

    // Read it all ends on the next lesson, which replaces this one under the course.
    await tap(button(/Next lesson\s*Turnaround Technique/));
    expect(crumbs()).toEqual(["Overview", "Life Transformer 101", "Turnaround Technique"]);
  });
});

describe("a page opened from outside", () => {
  it("opens a jump on its section's root, and says it was handled", async () => {
    await draw({ section: "academy", jump: { kind: "academy-topic", id: "performance-gradual-load-up" } });
    expect(handled).toHaveBeenCalled();
    expect(host.querySelector("h1")?.textContent).toBe("Gradual Load-up");
    expect(crumbs()).toEqual(["Academy", "Gradual Load-up"]);
    // The studio's note sits under its line on the first card.
    expect(current()?.textContent).toContain("New clients get the 100 lb picture");
    // A topic opened on its own is a lesson of its module.
    expect(host.querySelector(".crs__coursebar")?.textContent).toContain("Exercise Performance");
  });

  it("starts a fresh trail when the masthead changes section", async () => {
    await draw();
    await draw({ section: "machine-anatomy" });
    expect(host.querySelector("h1")?.textContent).toBe("Solon's floor");
    expect(all(".crs__station")).toHaveLength(2);
    await draw({ section: "academy" });
    expect(host.querySelector("h1")?.textContent).toBe("The Academy");
    expect(all(".crs__module").length).toBe(13);
  });

  it("goes back to the section's front page when the reset signal changes, and only then", async () => {
    await draw();
    await tap(all(".crs__tile")[0]);
    expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe("leg press");
    await draw();
    expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe("leg press");
    await draw({ resetSignal: 1 });
    expect(host.querySelector(".crs__hero")).not.toBeNull();
    expect(crumbs()).toEqual([]);
  });

  it("calls a page the corpus no longer has moved, with a way back", async () => {
    await draw({ section: "academy", jump: { kind: "academy-card", id: "no-such-card" } });
    expect(text()).toContain("This page has moved.");
    expect(button("Back to Academy")).toBeTruthy();
  });
});

describe("the glossary vault", () => {
  it("filters, finds, and opens a card on where it's taught", async () => {
    await draw({ section: "academy", jump: { kind: "academy-glossary" } });
    const cards = () => all(".crs__vcard");
    const total = cards().length;
    expect(total).toBeGreaterThan(40);
    await tap(button("Equipment"));
    expect(cards().length).toBeLessThan(total);
    await tap(button("All"));
    const input = host.querySelector<HTMLInputElement>(".crs__find-input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "end stop");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(cards()[0].querySelector(".crs__vcard-term")?.textContent).toBe("End Stop");
    await tap(cards()[0].querySelector<HTMLButtonElement>(".crs__vcard-more")!);
    expect(cards()[0].getAttribute("data-open")).toBe("");
  });
});

describe("the Academy's drills", () => {
  it("reveals the packages conversation one step at a time, as a draft", async () => {
    await draw({ section: "academy" });
    expect(text()).toContain("A draft from Journey's notes");
    await tap(button("Show the first"));
    expect(all(".crs__order-step[data-shown]")).toHaveLength(1);
    await tap(button("Show the next"));
    expect(all(".crs__order-step[data-shown]")).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 * Review fixes (Oct 19 2026)
 * ------------------------------------------------------------------ */

describe("the step deck keeps Next where the thumb left it", () => {
  it("draws every content card stacked, only the one on turn seen, and the end card alone", async () => {
    await draw({ section: "academy", jump: { kind: "academy-topic", id: "performance-gradual-load-up" } });
    const cards = all(".crs__deck .crs__card");
    expect(cards.length).toBeGreaterThan(1);
    expect(all(".crs__deck .crs__card[data-current]")).toHaveLength(1);
    // The others are there to size the stage, and nothing else: hidden, inert.
    for (const c of cards.filter((c) => !c.hasAttribute("data-current"))) {
      expect(c.getAttribute("aria-hidden")).toBe("true");
      expect(c.hasAttribute("inert")).toBe(true);
    }
    // To the end card: Check yourself is drawn alone.
    for (let n = 0; n < cards.length; n++) {
      const next = host.querySelector<HTMLButtonElement>(".crs__deck-next");
      if (!next) break;
      await tap(next);
    }
    expect(all(".crs__deck .crs__card")).toHaveLength(1);
    expect(current()?.hasAttribute("data-end")).toBe(true);
    expect(current()?.textContent).toContain("Check yourself");
  });

  it("hands the focus to the deck when the turn took the pressed button away", async () => {
    await draw({ section: "academy", jump: { kind: "academy-topic", id: "performance-gradual-load-up" } });
    const deck = host.querySelector<HTMLElement>(".crs__deck")!;
    const total = all(".crs__deck .crs__card").length;
    // Next on the card before the end card becomes a spacer once pressed.
    for (let n = 0; n < total; n++) {
      const next = host.querySelector<HTMLButtonElement>(".crs__deck-next")!;
      next.focus();
      await tap(next);
      if (current()?.hasAttribute("data-end")) break;
      // Next is still there: the focus stays on it.
      expect(document.activeElement).toBe(host.querySelector(".crs__deck-next"));
    }
    expect(current()?.hasAttribute("data-end")).toBe(true);
    expect(document.activeElement).toBe(deck);
  });
});

describe("the field manual says each thing once", () => {
  async function legPress() {
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe("leg press");
  }

  it("draws a label once over the Stop lines that share it, and still says it to a screen reader", async () => {
    await legPress();
    const stop = host.querySelector<HTMLElement>(".crs__stop")!;
    const seen = Array.from(stop.querySelectorAll(".crs__line-label")).map((l) => l.textContent);
    expect(seen.filter((l) => l === "Clinical warning")).toHaveLength(1);
    expect(seen.filter((l) => l === "Contraindicated for")).toHaveLength(1);
    const heard = Array.from(stop.querySelectorAll(".crs__sr")).map((l) => l.textContent);
    expect(heard.filter((l) => l === "Clinical warning: ").length).toBeGreaterThan(0);
  });

  it("puts no heading over the set-up: its parts' own titles name it, as one list or as cards", async () => {
    await legPress();
    expect(all(".crs__h2").map((h) => h.textContent)).not.toContain("Set it up");
    expect(all(".crs__setlist .crs__setlist-title")[0]?.textContent).toBe("Set up");
    await tap(button("Step through"));
    expect(current()?.querySelector(".crs__part-title")?.textContent).toBe("Set up");
    await tap(button("One list"));
    expect(host.querySelector(".crs__setlist")).not.toBeNull();
  });

  it("gives the scrubber no lines to say: the moments below say them, showing without a tap", async () => {
    await legPress();
    expect(host.querySelector(".vtr")).not.toBeNull();
    expect(text()).not.toContain("What to say");
    expect(text()).toContain("At each moment");
    // On the field manual the lines are a reference: open, no reveal to tap.
    const drills = all(".crs__drills .crs__drill");
    expect(drills.length).toBeGreaterThan(0);
    for (const d of drills) expect(d.querySelectorAll(".crs__drill-lines li").length).toBeGreaterThan(0);
    expect(all(".crs__drills button").some((b) => /Show the lines/.test(b.textContent ?? ""))).toBe(false);
  });

  it("says the substitutes one way, 'If LEG PRESS can't be used', one line a set, not five cards under Read next", async () => {
    await legPress();
    const whys = all(".crs__link-why").map((w) => w.textContent ?? "");
    expect(whys.some((w) => /can replace this one|can't be used/.test(w))).toBe(false);
    // The manual opens on Adapt & clinical, where the sets are said, once each,
    // every machine a chip that peeks it (Lumbar too, which is no linked word).
    expect(text()).toMatch(/If leg press can't be used/i);
    expect(text()).not.toContain("Can be replaced by");
    expect(text()).not.toContain("Together:");
    // Never the other direction on this machine's page.
    expect(text()).not.toMatch(/part of a set that (can )?replace/i);
    const chips = all(".crs__whole .crs__sub");
    expect(chips.length).toBeGreaterThan(3);
    const lumbar = chips.find((c) => /^lumbar$/i.test(c.textContent ?? ""));
    expect(lumbar).toBeTruthy();
    await tap(lumbar!);
    expect(host.querySelector(".vtp__title")?.textContent?.toLowerCase()).toBe("lumbar");
    // A chip is the chip's, not the line's: the line was not chosen.
    expect(host.querySelector(".crs__whole [data-vta-line][data-selected]")).toBeNull();
  });

  it("draws the dials with no pin number pointing at nothing; only a dial that turns the deck is a button", async () => {
    await legPress();
    expect(all(".crs__pin-head")).toHaveLength(0);
    for (const pin of all("button.crs__pin")) expect(pin.querySelector(".crs__pin-go")).not.toBeNull();
    for (const pin of all("div.crs__pin")) expect(pin.querySelector(".crs__pin-go")).toBeNull();
    // What it works sits with the dials and facts, beside the figure.
    expect(host.querySelector(".crs__bp-side .crs__bp-works")).not.toBeNull();
  });

  it("says nothing invented about a studio's own machine: no rep shape, no begins-with", async () => {
    patch.fn = (d) => ({ floor: [...(d.floor as unknown[]), { id: "sm-solon-hoist", name: "Hoist Press", code: null }] });
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "sm-solon-hoist" } });
    expect(host.querySelector("h1")?.textContent).toContain("Hoist Press");
    expect(host.querySelector(".crs__facts")).toBeNull();
    expect(host.querySelector(".vtr")).toBeNull();
    expect(text()).not.toContain("Begins with");
    expect(text()).toContain("No dials recorded for this unit.");
  });

  it("says a studio's own machine can't be read while its floor can't, with a way back, never a spinner", async () => {
    patch.fn = () => ({ floor: null, floorState: "unreadable" });
    await draw({ section: "machine-anatomy" });
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "sm-solon-hoist" } });
    expect(text()).toContain("Can't read Solon's floor right now.");
    expect(host.querySelector(".crs__state button")).not.toBeNull();
  });
});

describe("a chunk that will not come says so, with Try again", () => {
  it("on the phrasebook, the vault and the quiz", async () => {
    const retry = vi.fn();
    patch.fn = () => ({ cues: null, glossary: null, quizBank: null, referenceFailed: true, retryReference: retry });
    await draw({ section: "academy", jump: { kind: "academy-cueing" } });
    expect(text()).toContain("This part of the Academy didn't load.");
    await tap(button("Try again"));
    expect(retry).toHaveBeenCalledTimes(1);
    await draw({ section: "academy", jump: { kind: "academy-glossary" } });
    expect(text()).toContain("This part of the Academy didn't load.");
  });
});

describe("Cards and Read it all", () => {
  it("asks before leaving Read it all takes a half-written note away", async () => {
    await draw({ section: "academy", jump: { kind: "academy-topic", id: "performance-gradual-load-up" } });
    await tap(button("Read it all"));
    await tap(host.querySelector<HTMLElement>("[data-vta-line]")!);
    await tap(button("Note for Solon"));
    const area = host.querySelector<HTMLTextAreaElement>(".crs__whole textarea")!;
    expect(area).toBeTruthy();
    await type(area, "Say this before the plates touch.");

    // Cards asks first; Keep editing leaves the page whole, the words there.
    await tap(button(/^\s*Cards/));
    expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
    await tap(document.querySelector<HTMLElement>('[data-action="keep-editing"]')!);
    expect(host.querySelector(".crs__card")).toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>(".crs__whole textarea")?.value).toBe("Say this before the plates touch.");

    // Asked again and left: the cards.
    await tap(button(/^\s*Cards/));
    await tap(document.querySelector<HTMLElement>('[data-action="leave"]')!);
    expect(current()).not.toBeNull();
  });

  it("says where a lesson sits once, in the course bar, with its read time and no second pair of arrows", async () => {
    await draw();
    await tap(button("All 9 lessons"));
    await tap(all(".crs__lessons .crs__lesson")[3]);
    const bar = host.querySelector<HTMLElement>(".crs__coursebar")!;
    expect(bar.textContent).toMatch(/Lesson 4 of 9 · \d+ min/);
    expect(bar.querySelectorAll("button")).toHaveLength(1);
    // The rail beside it on a wide screen carries the read time on the lesson on screen.
    expect(host.querySelector('.crs__rail-row[aria-current="page"] .crs__rail-min')?.textContent).toMatch(/\d+ min/);
    expect(host.querySelector(".crs__lesson-note")).toBeNull();
  });

  it("says a playbook is a draft once on its lesson", async () => {
    await draw({ section: "academy" });
    await tap(button("Talking about packages"));
    expect(host.querySelector("h1")?.textContent).toBeTruthy();
    expect(count(host.querySelector(".crs__page")?.textContent ?? "", DRAFT)).toBe(1);
  });
});

describe("the peek holds what was asked for", () => {
  it("peeks one moment of the phrasebook alone", async () => {
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const drill = host.querySelector<HTMLElement>(".crs__drills .crs__drill")!;
    await tap(Array.from(drill.querySelectorAll<HTMLButtonElement>("button")).find((b) => /All \d+ lines|The whole moment/.test(b.textContent ?? ""))!);
    const body = host.querySelector<HTMLElement>(".vtp__body")!;
    expect(body).not.toBeNull();
    // The sheet's header names the moment; the body does not say it again.
    const head = host.querySelector(".vtp__title")?.textContent ?? "";
    expect(head.length).toBeGreaterThan(0);
    expect(body.querySelectorAll(".vta__title")).toHaveLength(0);
    expect(body.textContent).not.toContain(head);
    expect(body.querySelectorAll("[data-vta-line]").length).toBeGreaterThan(0);
    expect(body.querySelector(".vta__orphans")).toBeNull();
  });

  it("opens a quiz in the trail rather than peeking a sheet that says it has moved", async () => {
    await draw({ section: "academy", jump: { kind: "academy-cueing" } });
    const toQuiz = all(".crs__link").find((l) => /What would you say/i.test(l.textContent ?? ""));
    expect(toQuiz).toBeTruthy();
    await tap(toQuiz!);
    expect(host.querySelector(".vtp__body")).toBeNull();
    expect(host.querySelector(".crs__quiz")).not.toBeNull();
  });

  it("peeks a clinical flag as what it connects to, and a glossary word as that word alone", async () => {
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const { CLINICAL_FLAGS_MATRIX } = await import("../../../data/clinical-matrix");
    const glossaryFile = await import("../../academy/content/glossary.json");
    const words = new Set(
      ((glossaryFile as { default?: { glossary: { term: string }[] } }).default?.glossary ?? []).map((g) => g.term.toLowerCase()),
    );
    const flags = new Set(CLINICAL_FLAGS_MATRIX.map((f) => (f.label ?? f.conditionName).toLowerCase()));
    let sawFlag = false;
    let sawWord = false;
    for (const tier of ["Adapt & clinical", "Floor glance"]) {
      await tap(button(tier));
      for (const term of all(".crs__whole [data-vault-term]")) {
        if (sawFlag && sawWord) break;
        await tap(term);
        const title = (document.querySelector(".vtc__pop .vtc__title")?.textContent ?? "").toLowerCase();
        const isFlag = flags.has(title);
        const isWord = words.has(title);
        if ((isFlag && !sawFlag) || (isWord && !sawWord)) {
          const peekBtn = Array.from(document.querySelectorAll<HTMLButtonElement>(".vtc__pop button")).find((b) => b.textContent?.trim() === "Peek");
          await tap(peekBtn!);
          const body = host.querySelector<HTMLElement>(".vtp__body")!;
          expect(body.textContent).not.toContain("This page has moved.");
          const head = host.querySelector(".vtp__title")?.textContent ?? "";
          if (isFlag) {
            expect(body.querySelector("button")).not.toBeNull();
            // Named by the flag, never "Map" (the Course has no map).
            expect(head).not.toBe("Map");
            expect(head.toLowerCase()).toBe(title);
            // Its machines in their categories' colours, not all push orange.
            const machinePills = Array.from(body.querySelectorAll<HTMLElement>(".vtg__pill")).filter((b) => /, machine$/.test(b.getAttribute("aria-label") ?? ""));
            expect(machinePills.length).toBeGreaterThan(0);
            expect(machinePills.some((b) => !(b.getAttribute("style") ?? "").includes("--wk-cat-push"))).toBe(true);
            sawFlag = true;
          } else {
            expect(body.querySelectorAll("[data-vta-line]")).toHaveLength(1);
            expect(body.querySelector(".vta__orphans")).toBeNull();
            // The header names the word; the line does not label it again.
            expect(head.toLowerCase()).toBe(title);
            expect(body.querySelector(".vta__label")).toBeNull();
            sawWord = true;
          }
          await tap(host.querySelector<HTMLButtonElement>('[aria-label="Close the peek"]')!);
        } else {
          const close = document.querySelector<HTMLButtonElement>('.vtc__pop [aria-label="Close"]');
          if (close) await tap(close);
        }
      }
    }
    expect(sawFlag).toBe(true);
    expect(sawWord).toBe(true);
  });
});

describe("the glossary vault, filtered and opened", () => {
  it("never links a word inside its own definition", async () => {
    await draw({ section: "academy", jump: { kind: "academy-glossary" } });
    const card = all(".crs__vcard").find((c) => c.querySelector(".crs__vcard-term")?.textContent === "Accessory Stack" || c.querySelector(".crs__vcard-term")?.textContent === "Accessory stack")!;
    expect(card).toBeTruthy();
    await tap(card.querySelector<HTMLButtonElement>(".crs__vcard-more")!);
    const linked = Array.from(card.querySelectorAll("[data-vault-term]")).map((t) => (t.textContent ?? "").toLowerCase());
    expect(linked).not.toContain("accessory stack");
  });

  it("flows a filter's words into one grid, the letters jumping to each letter's first card", async () => {
    await draw({ section: "academy", jump: { kind: "academy-glossary" } });
    expect(all(".crs__vault-letter").length).toBeGreaterThan(3);
    await tap(button("Equipment"));
    expect(all(".crs__vault-letter")).toHaveLength(0);
    expect(all(".crs__vault-group")).toHaveLength(1);
    // jsdom has no scrollIntoView: a stand-in that says where it was asked to go.
    const scrolled: string[] = [];
    const proto = Element.prototype as unknown as { scrollIntoView?: (this: Element) => void };
    const had = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      const letter = all(".crs__az-btn")[0];
      await tap(letter);
      expect(scrolled[0]).toMatch(/^crs-term-/);
      expect(document.getElementById(scrolled[0])?.classList.contains("crs__vcard")).toBe(true);
    } finally {
      if (had) proto.scrollIntoView = had;
      else delete proto.scrollIntoView;
    }
  });
});

describe("the Overview's colours and words", () => {
  it("gives a course no machine category's colour, and says nothing is kept nowhere on it", async () => {
    await draw();
    for (const c of all(".crs__course")) expect(c.getAttribute("style")).toBeNull();
    expect(text()).not.toContain("Nothing is kept");
    expect(host.querySelector(".crs__hero .crs__lede")).toBeNull();
  });

  it("puts the revealed lines in the focus the reveal button had", async () => {
    await draw();
    const show = button("Show the Academy's lines");
    show.focus();
    await tap(show);
    expect(document.activeElement).toBe(host.querySelector(".crs__drill-lines"));
  });
});

describe("a scroll the page starts itself", () => {
  it("jumps instead of gliding when the reader asked for less motion", async () => {
    const { scrollMotion } = await import("./shell");
    const w = window as unknown as { matchMedia?: (q: string) => { matches: boolean; media: string } };
    const had = w.matchMedia;
    try {
      w.matchMedia = (q) => ({ matches: q.includes("reduce"), media: q });
      expect(scrollMotion()).toBe("auto");
      w.matchMedia = (q) => ({ matches: false, media: q });
      expect(scrollMotion()).toBe("smooth");
      delete w.matchMedia;
      expect(scrollMotion()).toBe("smooth");
    } finally {
      if (had) w.matchMedia = had;
    }
  });
});

describe("a peeked topic whose module failed", () => {
  it("says it didn't load and offers Try again for that module, never a spinner", async () => {
    const retry = vi.fn();
    patch.fn = () => ({ moduleFailed: (id: string) => id !== "performance", retryModule: retry });
    await draw({ section: "academy", jump: { kind: "academy-glossary" } });
    let found = false;
    for (const card of all(".crs__vcard").slice(0, 25)) {
      const more = card.querySelector<HTMLButtonElement>(".crs__vcard-more");
      if (!more) continue;
      await tap(more);
      for (const row of Array.from(card.querySelectorAll<HTMLButtonElement>(".crs__taught-row"))) {
        await tap(row);
        const body = host.querySelector<HTMLElement>(".vtp__body");
        if (body?.textContent?.includes("This part of the Academy didn't load.")) {
          const again = Array.from(body.querySelectorAll<HTMLButtonElement>("button")).find((b) => /Try again/.test(b.textContent ?? ""));
          await tap(again!);
          expect(retry).toHaveBeenCalledTimes(1);
          expect(retry.mock.calls[0][0]).not.toBe("performance");
          found = true;
          break;
        }
        const close = host.querySelector<HTMLButtonElement>('[aria-label="Close the peek"]');
        if (close) await tap(close);
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The judges' last fixes (Oct 19 2026)
 * ------------------------------------------------------------------ */

const CARE = {
  "m-leg-press": { outOfService: false, flag: { text: "Left pad sticks at the bottom", by: "Jess Moreno", at: "2026-10-18T12:52:00.000Z" } },
  "m-compound-row": { outOfService: true, outOfServiceWhy: { text: "A new cable is on order", by: "Sam Lee", at: "2026-10-17T12:52:00.000Z" } },
};

describe("the floor's status, where today's Catalog says it", () => {
  it("chips on the Catalog's rows and the Overview's tiles, a banner at the top of the machine", async () => {
    patch.fn = () => ({ care: CARE });
    await draw();
    const tiles = all(".crs__tile");
    expect(tiles[0].textContent).toContain("Flagged");
    expect(tiles[1].textContent).toContain("Out of service");

    await draw({ section: "machine-anatomy" });
    const rows = all(".crs__station");
    expect(rows[0].querySelector("[data-floor-status]")?.textContent).toContain("Flagged");
    expect(rows[1].querySelector("[data-floor-status]")?.textContent).toContain("Out of service");
    expect(rows[1].textContent).toContain("A new cable is on order");

    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const banner = host.querySelector<HTMLElement>(".crs__floor-status [data-floor-status='banner']");
    expect(banner?.textContent).toContain("Flagged by Jess");
    expect(banner?.textContent).toContain("Left pad sticks at the bottom");
    // At the top: before the blueprint, the dials and Stop.
    const page = host.querySelector(".crs__page")!;
    const order = Array.from(page.querySelectorAll(".crs__floor-status, .crs__blueprint, .crs__stop")).map((e) => e.className.split(" ")[0]);
    expect(order[0]).toBe("crs__floor-status");
  });

  it("says nothing while the floor's status is unknown", async () => {
    patch.fn = () => ({ care: null });
    await draw({ section: "machine-anatomy" });
    expect(host.querySelector("[data-floor-status]")).toBeNull();
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(host.querySelector(".crs__floor-status")).toBeNull();
    expect(text()).not.toContain("Flagged");
  });
});

describe("a course's machine, vault and phrasebook go on to the next lesson", () => {
  it("walks Life Transformer 101 from lesson 7 (the Leg Press) to lesson 8 (the Glossary)", async () => {
    await draw();
    await tap(button("All 9 lessons"));
    await tap(all(".crs__lessons .crs__lesson")[6]);
    expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe("leg press");
    expect(host.querySelector(".crs__coursebar")?.textContent).toContain("Lesson 7 of 9");
    await tap(button(/Next lesson\s*Glossary/));
    expect(crumbs()).toEqual(["Overview", "Life Transformer 101", "Glossary"]);
    expect(host.querySelector(".crs__coursebar")?.textContent).toContain("Lesson 8 of 9");
    expect(host.querySelector(".crs__vault")).not.toBeNull();
    // The vault goes on to the last lesson (the quiz, which ends the course).
    expect(host.querySelector(".crs__course-next")).not.toBeNull();
  });

  it("draws no Next lesson on a machine opened outside a course", async () => {
    await draw({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(host.querySelector(".crs__course-next")).toBeNull();
  });
});

describe("the drill of the day stays a drill", () => {
  it("brings Another moment closed, its reveal holding the focus the pressed button had", async () => {
    await draw();
    await tap(button("Show the Academy's lines"));
    const first = host.querySelector(".crs__duo .crs__drill-title")?.textContent;
    const another = button("Another moment");
    another.focus();
    await tap(another);
    expect(host.querySelector(".crs__duo .crs__drill-title")?.textContent).not.toBe(first);
    expect(host.querySelector(".crs__duo .crs__drill-lines")).toBeNull();
    expect(document.activeElement?.textContent).toContain("Show the Academy's lines");
  });
});

describe("a clinical flag's title and a page's source", () => {
  it("names a flag's connections by the flag, never 'Map'", async () => {
    const { courseTitleOf } = await import("./CourseLearning");
    const { useVaultData } = await import("../../learning-vault/useVaultData");
    const data = useVaultData({ studioId: "solon", machines: [] });
    const flag = data.graph?.nodes.find((n) => n.domain === "clinical");
    expect(flag).toBeTruthy();
    expect(courseTitleOf({ kind: "map", focus: flag!.id }, data)).toBe(flag!.label);
    expect(courseTitleOf({ kind: "map", focus: "clinical:no-such-flag" }, data)).toBe("What it connects to");
    expect(courseTitleOf({ kind: "map" }, data)).toBe("What it connects to");
    expect(courseTitleOf({ kind: "glossary" }, data)).not.toBe("What it connects to");
  });

  it("never shows a repository path as a page's source", async () => {
    const { sourceLine } = await import("./shell");
    const sections = [{ id: "a", title: "", blocks: [{ key: "b-1", kind: "para" as const, text: "Words.", source: "Academy 4.6 Turnaround Technique" }] }];
    expect(sourceLine({ source: "docs/msf-academy/Academy/x.txt", route: { kind: "topic", moduleId: "performance", topicId: "t" }, sections })).toBe(
      "Academy 4.6 Turnaround Technique",
    );
    expect(sourceLine({ source: "docs/business/the-floor.md", route: { kind: "playbook", id: "p" }, sections })).toBeNull();
    expect(sourceLine({ source: "Written from: The floor", route: { kind: "playbook", id: "p" }, sections })).toBe("Written from: The floor");
    expect(sourceLine({ source: undefined, route: { kind: "card", id: "c" }, sections })).toBeNull();
  });
});
