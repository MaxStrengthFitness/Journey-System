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
    graph: null,
    playbooks: pb.PLAYBOOKS,
    tracks: pb.TRACKS,
    pillars: pb.PILLARS,
    quizBank: bankM.questionBank({ glossary, cues, scripts, cards, defs: defsM.MACHINE_DEFINITIONS, names, playbooks: pb.PLAYBOOKS }),
  };
  return { useVaultData: () => data };
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
    expect(text()).toContain("Set it up");
    // The studio's crossed-out line shows crossed out, with why.
    expect(text()).toContain("Our Abduction comes after the Leg Press");
    // A pin a set-up line names turns the deck to that card.
    const before = host.querySelector(".crs__deck .crs__card")?.getAttribute("aria-label");
    const pins = all("button.crs__pin");
    expect(pins.length).toBeGreaterThan(0);
    await tap(pins[pins.length - 1]);
    expect(host.querySelector(".crs__deck .crs__card")?.getAttribute("aria-label")).toBeTruthy();
    expect(before).toBeTruthy();

    // The full manual one tier at a time: only the tier picked is drawn, and
    // a mark on another tier is never listed as a line that changed.
    const manualTitles = () => all(".crs__whole .vta__title").map((h) => h.textContent);
    const glance = manualTitles();
    expect(glance.length).toBeGreaterThan(0);
    await tap(button("Script & cues"));
    expect(button("Script & cues").getAttribute("aria-pressed")).toBe("true");
    const script = manualTitles();
    expect(script.length).toBeGreaterThan(0);
    expect(script.some((t) => glance.includes(t))).toBe(false);
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
    const first = host.querySelector(".crs__card")?.textContent;
    await tap(host.querySelector<HTMLButtonElement>(".crs__deck-next")!);
    expect(host.querySelector(".crs__card")?.textContent).not.toBe(first);
    expect(host.querySelector(".crs__card")?.getAttribute("data-dir")).toBe("next");
    await tap(button("Back a card"));
    expect(host.querySelector(".crs__card")?.textContent).toBe(first);

    // Read it all: the same page through ArticleBlocks, where a line takes actions.
    await tap(button("Read it all"));
    expect(host.querySelector(".crs__card")).toBeNull();
    const line = host.querySelector<HTMLElement>("[data-vta-line]");
    expect(line).not.toBeNull();
    await tap(line!);
    expect(text()).toContain("Cross out for Solon");

    // The course bar's next lesson replaces this one under the course.
    await tap(button("Next lesson: Turnaround Technique"));
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
    expect(host.querySelector(".crs__card")?.textContent).toContain("New clients get the 100 lb picture");
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
