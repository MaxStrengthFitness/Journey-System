// @vitest-environment jsdom
/**
 * THE SHARED PAGE BODY, MOUNTED (the Learning vault redesign, Oct 19 2026).
 *
 * ArticleBlocks inside the real VaultProvider, on the in-memory sandbox
 * store, under the real unsaved-changes provider: a leader crosses a line
 * out (the reason first), sees it struck with the reason, and puts it back;
 * a trainer notes but never crosses out; the MSF original carries no markup;
 * hiding crossed-out lines folds them into a quiet toggle; a mark whose line
 * has gone waits at the foot. And selecting a line never fights reading.
 *
 * Teams' share form is A7's and is stood in for here: this file is about
 * where it opens, not what it says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type CSSProperties, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./ShareForm", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    ShareForm: (p: { onDone: () => void; sectionTitle?: string }) =>
      React.createElement(
        "div",
        { "data-testid": "share-form" },
        `Share from ${p.sectionTitle ?? "the page"}`,
        React.createElement("button", { type: "button", onClick: p.onDone }, "Close share"),
      ),
  };
});

import { UnsavedChangesProvider } from "../../unsaved-changes";
import { blockKeyFor, toVaultBlocks, vaultSection } from "../blocks";
import { createSandboxStore, type MarkupStore } from "../markup-store";
import type {
  LearningSubmission,
  StudioBlockNote,
  StudioMarkup,
  StudioStrike,
  VaultBlock,
  VaultSection,
  VaultTarget,
  VaultViewer,
} from "../types";
import { ArticleBlocks, OrphanMarks, useAppliedMarkup, type ArticleBlocksProps } from "./ArticleBlocks";
import { LINE_HINT_KEY, resetLineHint } from "./line-hint";
import { VaultProvider, useVault } from "./VaultProvider";

/* ── fixtures ─────────────────────────────────────────────────────────── */

const TARGET: VaultTarget = {
  ref: { kind: "academy-topic", id: "speed-of-movement" },
  key: "academy-topic:speed-of-movement",
  title: "Speed of Movement",
};

const SPEED = "Move the weight slowly and smoothly in both directions.";
const STACK = "Never let the weight stack touch between repetitions.";
const BREATHE = "Breathe freely throughout the set.";
const LOWER = "Reverse direction slowly at the bottom.";
const ALONE = "A line that sits alone in its section.";

const SECTIONS: VaultSection[] = [
  vaultSection(
    "speed",
    "Speed of movement",
    toVaultBlocks(
      [
        { kind: "body", text: SPEED },
        { kind: "bullet", text: STACK },
        { kind: "bullet", text: BREATHE },
      ],
      { source: "Academy 4.5 Speed of Movement" },
    ),
  ),
  vaultSection(
    "turn",
    "Turnarounds",
    toVaultBlocks([
      { kind: "heading", text: "The lower turnaround" },
      { kind: "body", text: LOWER },
    ]),
  ),
  vaultSection("alone", "On its own", toVaultBlocks([{ kind: "body", text: ALONE }])),
];

const LEADER: VaultViewer = { uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };
const TRAINER: VaultViewer = { uid: "uid-kim", name: "Kim Ortiz", canStrike: false, canNote: true, isHeadOffice: false };
const SOLON = { id: "solon", name: "Solon" };
const NOW = new Date("2026-10-19T14:00:00.000Z");

const strikeOn = (text: string, over: Partial<StudioStrike> = {}): StudioStrike => ({
  blockKey: blockKeyFor(text),
  originalText: text,
  reason: "Our stack has a hard stop",
  by: { uid: "uid-sam", name: "Sam Lee" },
  at: "2026-10-18T15:00:00.000Z",
  ...over,
});
const noteOn = (text: string, over: Partial<StudioBlockNote> = {}): StudioBlockNote => ({
  id: "note-seed",
  blockKey: blockKeyFor(text),
  quote: text,
  body: "We count it out loud for new clients.",
  author: { uid: "uid-kim", name: "Kim Ortiz" },
  at: "2026-10-18T15:00:00.000Z",
  ...over,
});
const markup = (over: Partial<StudioMarkup>): StudioMarkup => ({
  studioId: "solon",
  studioName: "Solon",
  targetKey: TARGET.key,
  title: TARGET.title,
  strikes: [],
  notes: [],
  ...over,
});

/* ── mounting ─────────────────────────────────────────────────────────── */

let root: Root;
let host: HTMLDivElement;
let store: MarkupStore;
let ids = 0;

beforeEach(() => {
  ids = 0;
  // The one-time "Tap a line to …" hint starts unseen in every test.
  localStorage.clear();
  resetLineHint();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** Test-only doors on the vault: the lens and the hide choice (A1's VersionToggle draws the real ones). */
function Controls() {
  const v = useVault();
  return (
    <div>
      <button type="button" data-testid="hide" onClick={() => v.setShowCrossed(false)} />
      <button type="button" data-testid="original" onClick={() => v.setLens("original")} />
      <button type="button" data-testid="studio" onClick={() => v.setLens("studio")} />
    </div>
  );
}

interface MountOpts {
  viewer?: VaultViewer;
  seed?: StudioMarkup[];
  subs?: LearningSubmission[];
  initialLens?: "studio" | "original";
  props?: Partial<ArticleBlocksProps>;
  extra?: ReactNode;
}
let mounted: MountOpts = {};

function tree(opts: MountOpts) {
  return (
    <UnsavedChangesProvider>
      <VaultProvider
        store={store}
        studio={SOLON}
        viewer={opts.viewer ?? LEADER}
        now={() => NOW}
        newId={(p) => `${p}-${++ids}`}
        initialLens={opts.initialLens}
      >
        <Controls />
        <ArticleBlocks target={TARGET} sections={SECTIONS} {...opts.props} />
        {opts.extra}
      </VaultProvider>
    </UnsavedChangesProvider>
  );
}

async function mount(opts: MountOpts = {}) {
  mounted = opts;
  store = createSandboxStore({ markup: opts.seed ?? [], submissions: opts.subs ?? [] });
  await act(async () => {
    root.render(tree(opts));
  });
}

/** The same page, the same store, read as someone else (the prototype bar's View as). */
async function viewAs(viewer: VaultViewer) {
  mounted = { ...mounted, viewer };
  await act(async () => {
    root.render(tree(mounted));
  });
}

const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
  });
function setValue(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (el: Element | null | undefined, value: string) => act(async () => setValue(el, value));
const escape = () =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

const buttons = () => [...document.querySelectorAll("button")];
const button = (label: string) => buttons().find((b) => b.textContent?.trim() === label);
const lines = () => [...host.querySelectorAll<HTMLElement>("[data-vta-line]")];
const lineOf = (text: string) => {
  const el = lines().find((l) => l.textContent?.includes(text));
  if (!el) throw new Error(`no line reading "${text}"`);
  return el;
};
const selected = () => lines().filter((l) => l.hasAttribute("data-selected"));
/** The line's one real button (the line itself is not one: its terms must stay reachable). */
const toggleOf = (line: Element) => {
  const t = line.querySelector<HTMLButtonElement>("button.vta__toggle");
  if (!t) throw new Error("no toggle on the line");
  return t;
};
const actionsShown = () =>
  [...host.querySelectorAll(".vta__actions button")].map((b) => b.textContent?.trim());
const fieldLabelled = (label: string) => {
  const l = [...host.querySelectorAll("label")].find((x) => x.textContent?.includes(label));
  if (!l) throw new Error(`no field "${label}"`);
  return document.getElementById(l.htmlFor);
};
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (a: "keep-editing" | "leave") =>
  document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`);

/* ── the studio's version: crossing out ───────────────────────────────── */

describe("a leader crosses a line out", () => {
  it("asks why first, shows it struck with the reason, and puts it back", async () => {
    await mount();
    await click(lineOf(STACK));
    expect(actionsShown()).toEqual(["Cross out for Solon…", "Note for Solon", "Tell head office", "Ask in Teams"]);

    await click(button("Cross out for Solon…"));
    expect(host.textContent).toContain("Why does Solon cross this out?");
    const crossOut = () => button("Cross it out") as HTMLButtonElement;
    expect(crossOut().disabled).toBe(true);

    await type(fieldLabelled("Why does Solon cross this out?"), "ab");
    expect(crossOut().disabled).toBe(true);
    await type(fieldLabelled("Why does Solon cross this out?"), "Our stack has a hard stop");
    expect(crossOut().disabled).toBe(false);
    await type(fieldLabelled("What Solon does instead"), "We let it rest a beat at the bottom.");
    await click(crossOut());

    const struck = lineOf(STACK).querySelector("s.vta__struck");
    expect(struck?.textContent).toBe(STACK);
    expect(host.textContent).toContain("We let it rest a beat at the bottom.");
    expect(host.textContent).toContain("Why: Our stack has a hard stop · Sam Lee · Oct 19, 2026");
    expect(selected()).toEqual([]);
    expect(store.markupFor("solon", TARGET.key)?.strikes.map((s) => s.blockKey)).toEqual([blockKeyFor(STACK)]);

    await click(lineOf(STACK));
    expect(actionsShown()[0]).toBe("Put it back");
    await click(button("Put it back"));
    expect(lineOf(STACK).querySelector("s")).toBeNull();
    expect(host.textContent).not.toContain("Why: Our stack has a hard stop");
    expect(store.markupFor("solon", TARGET.key)).toBeNull();
    expect(actionsShown()[0]).toBe("Cross out for Solon…");
  });

  it("Keep it leaves the line as it was", async () => {
    await mount();
    await click(lineOf(SPEED));
    await click(button("Cross out for Solon…"));
    await type(fieldLabelled("Why does Solon cross this out?"), "Not how we teach it");
    await click(button("Keep it"));
    expect(question()).toBeNull();
    expect(host.querySelector("form")).toBeNull();
    expect(lineOf(SPEED).querySelector("s")).toBeNull();
    expect(selected()).toEqual([lineOf(SPEED)]);
    // The focus goes back to the line the form was under (its own button).
    expect(document.activeElement).toBe(toggleOf(lineOf(SPEED)));
  });

  it("the same words twice on a page are struck in both places", async () => {
    const twice: VaultSection[] = [
      vaultSection("a", "First", toVaultBlocks([{ kind: "bullet", text: STACK }])),
      vaultSection("b", "Second", toVaultBlocks([{ kind: "bullet", text: STACK }])),
    ];
    await mount({ seed: [markup({ strikes: [strikeOn(STACK)] })], props: { sections: twice } });
    expect(host.querySelectorAll("s.vta__struck")).toHaveLength(2);
  });
});

/* ── who may do what ──────────────────────────────────────────────────── */

describe("a trainer at the studio", () => {
  it("sees no cross-out, and leaves a note under the line", async () => {
    await mount({ viewer: TRAINER, seed: [markup({ strikes: [strikeOn(STACK)] })] });
    await click(lineOf(STACK));
    expect(actionsShown()).toEqual(["Note for Solon", "Tell head office", "Ask in Teams"]);
    expect(button("Put it back")).toBeUndefined();

    await click(lineOf(SPEED));
    expect(actionsShown()).toEqual(["Note for Solon", "Tell head office", "Ask in Teams"]);
    await click(button("Note for Solon"));
    const add = () => button("Add note") as HTMLButtonElement;
    expect(add().disabled).toBe(true);
    await type(fieldLabelled("What should Solon know about this line?"), "We say it twice on the first rep.");
    await click(add());

    const unit = lineOf(SPEED).closest(".vta__unit")!;
    expect(unit.querySelector(".vta__notes")?.textContent).toContain("We say it twice on the first rep.");
    expect(unit.querySelector(".vta__notes")?.textContent).toContain("Kim Ortiz · Oct 19, 2026");
    expect(store.markupFor("solon", TARGET.key)?.notes.map((n) => n.body)).toEqual(["We say it twice on the first rep."]);
  });

  it("removes their own note after saying yes, and never a colleague's", async () => {
    await mount({
      viewer: TRAINER,
      seed: [
        markup({
          notes: [
            noteOn(SPEED, { id: "mine", body: "Mine to take off." }),
            noteOn(BREATHE, { id: "theirs", body: "A colleague's.", author: { uid: "uid-sam", name: "Sam Lee" } }),
          ],
        }),
      ],
    });
    await click(lineOf(BREATHE));
    expect(lineOf(BREATHE).closest(".vta__unit")!.querySelector(".vta__mark-row")).toBeNull();

    await click(lineOf(SPEED));
    await click(button("Remove"));
    expect(host.textContent).toContain("Remove this note?");
    await click(host.querySelector(".vta__mark-row .vta__btn--danger"));
    expect(host.textContent).not.toContain("Mine to take off.");
    expect(store.markupFor("solon", TARGET.key)?.notes.map((n) => n.id)).toEqual(["theirs"]);
  });
});

describe("the MSF original", () => {
  it("shows no markup, and offers only head office and Teams", async () => {
    await mount({
      initialLens: "original",
      seed: [markup({ strikes: [strikeOn(STACK)], notes: [noteOn(SPEED)] })],
    });
    expect(host.querySelector("s")).toBeNull();
    expect(host.textContent).not.toContain("Why:");
    expect(host.textContent).not.toContain("We count it out loud");
    expect(host.querySelector(".vta__orphans")).toBeNull();

    await click(lineOf(STACK));
    expect(actionsShown()).toEqual(["Tell head office", "Ask in Teams"]);

    // One tap back to Solon's version, and the marks are there.
    await click(host.querySelector('[data-testid="studio"]'));
    expect(lineOf(STACK).querySelector("s")).not.toBeNull();
    expect(host.textContent).toContain("We count it out loud for new clients.");
  });
});

/* ── hiding crossed-out lines ─────────────────────────────────────────── */

describe("hiding crossed-out lines", () => {
  it("folds the line into a quiet toggle that shows it again in place", async () => {
    await mount({ seed: [markup({ strikes: [strikeOn(STACK)] })] });
    expect(lineOf(STACK).querySelector("s")).not.toBeNull();

    await click(host.querySelector('[data-testid="hide"]'));
    expect(lines().some((l) => l.textContent?.includes(STACK))).toBe(false);
    const reveal = button("1 line hidden");
    expect(reveal?.getAttribute("aria-expanded")).toBe("false");

    await click(reveal);
    expect(lineOf(STACK).querySelector("s")).not.toBeNull();
    expect(host.textContent).toContain("Why: Our stack has a hard stop");
    await click(button("Hide the crossed-out line"));
    expect(lines().some((l) => l.textContent?.includes(STACK))).toBe(false);
  });

  it("a section with every line hidden keeps its title", async () => {
    await mount({ seed: [markup({ strikes: [strikeOn(ALONE)] })] });
    await click(host.querySelector('[data-testid="hide"]'));
    expect([...host.querySelectorAll(".vta__title")].map((h) => h.textContent)).toContain("On its own");
    expect(button("1 line hidden")).toBeDefined();
  });
});

/* ── a mark with no line left ─────────────────────────────────────────── */

describe("a mark whose line has changed", () => {
  const OLD = "Hold the squeeze for exactly three seconds.";

  it("waits at the foot with its old words, and a leader puts it back", async () => {
    await mount({ seed: [markup({ strikes: [strikeOn(OLD, { reason: "We hold two" })] })] });
    const orphans = host.querySelector(".vta__orphans");
    expect(orphans?.textContent).toContain("Lines that changed since Solon marked them");
    expect(orphans?.querySelector("s")?.textContent).toBe(OLD);
    expect(orphans?.textContent).toContain("Why: We hold two · Sam Lee");

    await click(orphans?.querySelector("button"));
    expect(host.querySelector(".vta__orphans")).toBeNull();
    expect(store.markupFor("solon", TARGET.key)).toBeNull();
  });

  it("a note whose line has gone keeps its old words, unstruck, and its author removes it", async () => {
    await mount({ viewer: TRAINER, seed: [markup({ notes: [noteOn(OLD, { id: "old-note", body: "We hold two here." })] })] });
    const orphan = host.querySelector('[data-testid="orphan-mark"]');
    expect(orphan?.querySelector("s")).toBeNull();
    expect(orphan?.textContent).toContain(OLD);
    expect(orphan?.textContent).toContain("We hold two here.");
    await click(button("Remove"));
    await click(host.querySelector(".vta__orphans .vta__btn--danger"));
    expect(host.querySelector(".vta__orphans")).toBeNull();
  });

  it("a trainer sees it but cannot put it back", async () => {
    await mount({ viewer: TRAINER, seed: [markup({ strikes: [strikeOn(OLD)] })] });
    expect(host.querySelectorAll('[data-testid="orphan-mark"]')).toHaveLength(1);
    expect(host.querySelector(".vta__orphans button")).toBeNull();
  });
});

/* ── a page drawn in parts (a codex tier, the course's manual) ────────── */

/** The design's foot: the page's own lines that changed, over EVERY part. */
function PageFoot() {
  const applied = useAppliedMarkup(TARGET, SECTIONS);
  return <OrphanMarks target={TARGET} orphans={applied.orphans} />;
}

describe("a page drawn in parts (showOrphans)", () => {
  const OLD = "Hold the squeeze for exactly three seconds.";
  const seed = () => [markup({ strikes: [strikeOn(LOWER, { reason: "Ours has a hard stop" }), strikeOn(OLD, { reason: "We hold two" })] })];
  const orphanWords = () => [...host.querySelectorAll('[data-testid="orphan-mark"] .vta__orphan-words')].map((o) => o.textContent);

  it("left on, one part alone calls a mark on another part a line that changed (why a part turns it off)", async () => {
    await mount({ seed: seed(), props: { sections: [SECTIONS[0]] } });
    expect(orphanWords()).toEqual([LOWER, OLD]);
  });

  it("turned off, a part lists none, and the page's foot lists only the mark whose words left the page, once", async () => {
    await mount({ seed: seed(), props: { sections: [SECTIONS[0]], showOrphans: false }, extra: <PageFoot /> });
    expect(host.querySelectorAll(".vta__orphans")).toHaveLength(1);
    expect(orphanWords()).toEqual([OLD]);
    // The part's own lines still carry their marks.
    expect(lines().map((l) => l.textContent)).toEqual([SPEED, STACK, BREATHE]);
  });

  it("the default draws the foot itself on a whole page", async () => {
    await mount({ seed: seed() });
    expect(host.querySelectorAll(".vta__orphans")).toHaveLength(1);
    expect(orphanWords()).toEqual([OLD]);
  });
});

/* ── selecting never fights reading ───────────────────────────────────── */

describe("choosing a line", () => {
  it("one at a time: a second tap, Escape, or a tap elsewhere lets go", async () => {
    await mount({
      extra: (
        <div role="dialog" data-testid="card">
          <button type="button">Pin</button>
        </div>
      ),
    });
    await click(lineOf(SPEED));
    expect(selected()).toEqual([lineOf(SPEED)]);
    await click(lineOf(BREATHE));
    expect(selected()).toEqual([lineOf(BREATHE)]);
    await click(lineOf(BREATHE));
    expect(selected()).toEqual([]);

    await click(lineOf(LOWER));
    await escape();
    expect(selected()).toEqual([]);
    expect(document.activeElement).toBe(toggleOf(lineOf(LOWER)));

    // A tap inside a card laid over the page (a term's concept card) is not elsewhere.
    await click(lineOf(LOWER));
    await click(document.querySelector('[data-testid="card"] button'));
    expect(selected()).toEqual([lineOf(LOWER)]);

    await click(document.body);
    expect(selected()).toEqual([]);
  });

  it("the line is not a button: its one real button, after its words, chooses it (Enter presses a button)", async () => {
    await mount();
    const line = lineOf(SPEED);
    expect(line.hasAttribute("role")).toBe(false);
    expect(line.hasAttribute("tabindex")).toBe(false);
    const toggle = toggleOf(line);
    expect(toggle.getAttribute("aria-label")).toBe("Actions for this line");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // After the words, so a screen reader hears the line before its control.
    expect(line.lastElementChild).toBe(toggle);
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(host.querySelector(".vta__panel")?.id);
    expect(selected()).toEqual([line]);
  });

  it("a linked term inside a line is the toggle's sibling, never inside a button (VoiceOver reaches it)", async () => {
    await mount({
      props: {
        renderText: (text: string) =>
          text === SPEED ? (
            <>
              Move the{" "}
              <span role="button" tabIndex={0} data-vault-term="">
                weight
              </span>{" "}
              slowly.
            </>
          ) : (
            text
          ),
      },
    });
    const term = host.querySelector<HTMLElement>("[data-vault-term]")!;
    const line = lineOf("Move the");
    expect(term.parentElement?.closest('[role="button"], button')).toBeNull();
    expect(toggleOf(line).contains(term)).toBe(false);
    expect(term.closest("[data-vta-line]")).toBe(line);
  });

  it("a tap on a linked term inside a line opens the term, not the line", async () => {
    const term = vi.fn();
    await mount({
      props: {
        renderText: (text: string, _block: VaultBlock) =>
          text === SPEED ? (
            <>
              Move the{" "}
              <button type="button" data-vault-term="" onClick={term}>
                weight
              </button>{" "}
              slowly.
            </>
          ) : (
            text
          ),
      },
    });
    await click(lineOf("Move the").querySelector("[data-vault-term]"));
    expect(term).toHaveBeenCalledTimes(1);
    expect(selected()).toEqual([]);
  });

  it("headings take no marks", async () => {
    await mount();
    const heading = [...host.querySelectorAll(".vta__heading")].find((h) => h.textContent === "The lower turnaround");
    expect(heading?.tagName).toBe("H3");
    expect(heading?.closest("[data-vta-line]")).toBeNull();
  });

  it("shows the line's source when chosen", async () => {
    await mount();
    await click(lineOf(SPEED));
    expect(host.querySelector(".vta__source")?.textContent).toBe("Academy 4.5 Speed of Movement");
  });

  it("asks before another line takes a half-typed note away", async () => {
    await mount();
    await click(lineOf(SPEED));
    await click(button("Note for Solon"));
    await type(fieldLabelled("What should Solon know about this line?"), "Half a thought");

    // A stray tap elsewhere is ignored while a form is open.
    await click(document.body);
    expect(selected()).toEqual([lineOf(SPEED)]);

    await click(lineOf(BREATHE));
    expect(question()?.textContent).toContain("the note you are writing");
    await click(answer("keep-editing"));
    expect(selected()).toEqual([lineOf(SPEED)]);
    expect((fieldLabelled("What should Solon know about this line?") as HTMLTextAreaElement).value).toBe("Half a thought");

    await click(lineOf(BREATHE));
    await click(answer("leave"));
    expect(selected()).toEqual([lineOf(BREATHE)]);
    expect(host.querySelector("form")).toBeNull();
  });
});

/* ── head office and Teams ────────────────────────────────────────────── */

describe("telling head office", () => {
  it("anyone sends a dispute or an addition about a line, and sees it went", async () => {
    await mount({ viewer: TRAINER, initialLens: "original" });
    await click(lineOf(LOWER));
    await click(button("Tell head office"));
    const send = () => button("Send to head office") as HTMLButtonElement;
    expect(send().disabled).toBe(true);

    await click(button("Add to it"));
    expect(button("Add to it")?.getAttribute("aria-pressed")).toBe("true");
    await type(fieldLabelled("What should it add?"), "Say what to do when the stack touches.");
    await type(fieldLabelled("How would you word it?"), "If the stack touches, reverse more slowly.");
    await click(send());

    expect(host.textContent).toContain("Sent to head office.");
    const subs = store.submissions();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      intent: "addition",
      targetKey: TARGET.key,
      blockKey: blockKeyFor(LOWER),
      quote: LOWER,
      body: "Say what to do when the stack touches.",
      proposed: "If the stack touches, reverse more slowly.",
      studioId: "solon",
      studioName: "Solon",
      by: { uid: "uid-kim", name: "Kim Ortiz" },
      status: "pending",
      at: NOW.toISOString(),
    });

    await click(button("Done"));
    expect(selected()).toEqual([]);
  });
});

describe("asking in Teams", () => {
  it("opens the share form in place under the line, and closes it again", async () => {
    await mount();
    await click(lineOf(LOWER));
    await click(button("Ask in Teams"));
    const form = host.querySelector('[data-testid="share-form"]');
    expect(form?.textContent).toContain("Share from Turnarounds");
    expect(form?.closest(".vta__unit")).toBe(lineOf(LOWER).closest(".vta__unit"));
    expect(button("Ask in Teams")?.getAttribute("aria-expanded")).toBe("true");
    await click(button("Close share"));
    expect(host.querySelector('[data-testid="share-form"]')).toBeNull();
  });
});

/* ── Design 2's gutter ────────────────────────────────────────────────── */

describe("the gutter", () => {
  it("keeps notes behind a marker that unfolds them, and a reason always in view", async () => {
    await mount({
      props: { annotate: "gutter" },
      seed: [markup({ strikes: [strikeOn(STACK)], notes: [noteOn(SPEED)] })],
    });
    expect(host.querySelector(".vta")?.getAttribute("data-annotate")).toBe("gutter");
    expect(host.textContent).not.toContain("We count it out loud for new clients.");
    expect(host.textContent).toContain("Why: Our stack has a hard stop");

    const marker = host.querySelector('button.vta__marker[aria-label="1 note from Solon"]');
    expect(marker?.getAttribute("aria-expanded")).toBe("false");
    await click(marker);
    expect(host.textContent).toContain("We count it out loud for new clients.");
    expect(marker?.getAttribute("aria-expanded")).toBe("true");

    expect(host.querySelector('.vta__marker--still[aria-label="Crossed out at Solon"]')).not.toBeNull();
  });
});

describe("the gutter only where a mark can be (review fix, Oct 19 2026)", () => {
  it("is laid out inline on the MSF original and in a peek, where no gutter pays for itself", async () => {
    await mount({ props: { annotate: "gutter" } });
    expect(host.querySelector(".vta")?.getAttribute("data-annotate")).toBe("gutter");
    await mount({ props: { annotate: "gutter", compact: true } });
    expect(host.querySelector(".vta")?.getAttribute("data-annotate")).toBe("inline");
    await mount({ props: { annotate: "gutter" } });
    await click(host.querySelector('[data-testid="original"]'));
    expect(host.querySelector(".vta")?.getAttribute("data-annotate")).toBe("inline");
    expect(host.querySelector(".vta__gutter")).toBeNull();
  });
});

describe("an empty page", () => {
  it("says so in a well, never a blank", async () => {
    await mount({ props: { sections: [] } });
    expect(host.querySelector(".vta__empty")?.textContent).toBe("Nothing written here yet.");
  });

  it("but a section with no lines and an honest note shows its title and note (an empty codex tier)", async () => {
    await mount({ props: { sections: [vaultSection("glance-empty", "Floor glance", [], "Nothing written for this machine yet.")] } });
    expect(host.querySelector(".vta__empty")).toBeNull();
    expect(host.querySelector(".vta__title")?.textContent).toBe("Floor glance");
    expect(host.querySelector(".vta__section-note")?.textContent).toBe("Nothing written for this machine yet.");
  });
});

/* ── review fixes (Oct 19 2026) ───────────────────────────────────────── */

describe("a form for an action the line no longer offers", () => {
  it("closes when the MSF original comes on, writes nothing, and does not come back with Solon's version", async () => {
    await mount();
    await click(lineOf(STACK));
    await click(button("Cross out for Solon…"));
    expect(host.querySelector("form")).not.toBeNull();

    await click(host.querySelector('[data-testid="original"]'));
    expect(host.querySelector("form")).toBeNull();
    expect(actionsShown()).toEqual(["Tell head office", "Ask in Teams"]);

    await click(host.querySelector('[data-testid="studio"]'));
    expect(host.querySelector("form")).toBeNull();
    expect(store.markupFor("solon", TARGET.key)).toBeNull();
  });

  it("closes when View as turns a leader into a trainer, who may still note", async () => {
    await mount();
    await click(lineOf(SPEED));
    await click(button("Cross out for Solon…"));
    expect(host.textContent).toContain("Why does Solon cross this out?");

    await viewAs(TRAINER);
    expect(host.textContent).not.toContain("Why does Solon cross this out?");
    expect(actionsShown()).toEqual(["Note for Solon", "Tell head office", "Ask in Teams"]);

    // A trainer's note form stays a trainer's.
    await click(button("Note for Solon"));
    expect(host.textContent).toContain("What should Solon know about this line?");
  });
});

describe("Escape is used up by the innermost thing", () => {
  it("lets go of the line and says so (preventDefault), so a peek listening on window stays open", async () => {
    const seen: boolean[] = [];
    const onWindow = (e: KeyboardEvent) => {
      if (e.key === "Escape") seen.push(e.defaultPrevented);
    };
    window.addEventListener("keydown", onWindow);
    try {
      await mount();
      await click(lineOf(SPEED));
      // A real key press can be used up (cancelable), as a browser's is.
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      expect(selected()).toEqual([]);
      expect(seen).toEqual([true]);
    } finally {
      window.removeEventListener("keydown", onWindow);
    }
  });

  it("leaves it alone when the reader's focus is somewhere else (a peek's own page)", async () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    try {
      await mount();
      await click(lineOf(SPEED));
      outside.focus();
      const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      await act(async () => {
        outside.dispatchEvent(ev);
      });
      expect(ev.defaultPrevented).toBe(false);
      expect(selected()).toEqual([lineOf(SPEED)]);
    } finally {
      outside.remove();
    }
  });
});

describe("the focus never falls to the top of the page", () => {
  it("Put it back hands it to the line", async () => {
    await mount({ seed: [markup({ strikes: [strikeOn(STACK)] })] });
    await click(lineOf(STACK));
    const putBack = button("Put it back")!;
    putBack.focus();
    await click(putBack);
    expect(lineOf(STACK).querySelector("s")).toBeNull();
    expect(document.activeElement).toBe(toggleOf(lineOf(STACK)));
  });

  it("Remove asks, Keep goes back to Remove, and a removed note hands it to the line", async () => {
    await mount({ viewer: TRAINER, seed: [markup({ notes: [noteOn(SPEED, { id: "mine" })] })] });
    await click(lineOf(SPEED));
    const remove = () => host.querySelector<HTMLButtonElement>('[data-note-remove="mine"]');
    remove()!.focus();
    await click(remove());
    expect(document.activeElement).toBe(host.querySelector('[data-note-keep="mine"]'));
    await click(host.querySelector('[data-note-keep="mine"]'));
    expect(document.activeElement).toBe(remove());

    await click(remove());
    await click(host.querySelector(".vta__mark-row .vta__btn--danger"));
    expect(host.textContent).not.toContain("We count it out loud");
    expect(document.activeElement).toBe(toggleOf(lineOf(SPEED)));
  });

  it("a line crossed out while crossed-out lines are hidden hands it to its run's reveal button", async () => {
    await mount();
    await click(host.querySelector('[data-testid="hide"]'));
    await click(lineOf(STACK));
    await click(button("Cross out for Solon…"));
    await type(fieldLabelled("Why does Solon cross this out?"), "Our stack has a hard stop");
    const crossOut = button("Cross it out")!;
    crossOut.focus();
    await click(crossOut);
    expect(lines().some((l) => l.textContent?.includes(STACK))).toBe(false);
    expect(document.activeElement).toBe(button("1 line hidden"));
  });
});

describe("a label is said once per run", () => {
  const WARN_A = "Do not use with an acute back injury.";
  const WARN_B = "Stop if the client feels sharp pain.";
  const WARN_C = "Watch the knees at the bottom.";
  const KNEE = "Knee replacement";
  const stop = (): VaultSection[] => [
    {
      id: "leaf-stop",
      title: "Stop",
      blocks: [
        { key: blockKeyFor(WARN_A), kind: "line", text: WARN_A, label: "Clinical warning" },
        { key: blockKeyFor(WARN_B), kind: "line", text: WARN_B, label: "Clinical warning" },
        { key: blockKeyFor(WARN_C), kind: "line", text: WARN_C, label: "Clinical warning" },
        { key: blockKeyFor(KNEE), kind: "line", text: KNEE, label: "Contraindicated for" },
      ],
    },
  ];
  const shownLabels = () => [...host.querySelectorAll(".vta__label")].map((l) => l.textContent);

  it("draws it at the head of the run, and still says it to a screen reader on the rest", async () => {
    await mount({ props: { sections: stop() } });
    expect(shownLabels()).toEqual(["Clinical warning", "Contraindicated for"]);
    expect(lineOf(WARN_B).querySelector(".vta__sr")?.textContent).toBe("Clinical warning: ");
    expect(lineOf(WARN_A).closest(".vta__unit")?.getAttribute("data-run")).toBe("head");
    expect(lineOf(WARN_B).closest(".vta__unit")?.getAttribute("data-run")).toBe("cont");
  });

  it("moves to the first line still shown when the head of the run is crossed out and hidden", async () => {
    await mount({ props: { sections: stop() }, seed: [markup({ strikes: [strikeOn(WARN_A)] })] });
    await click(host.querySelector('[data-testid="hide"]'));
    expect(shownLabels()).toEqual(["Clinical warning", "Contraindicated for"]);
    expect(lineOf(WARN_B).querySelector(".vta__label")?.textContent).toBe("Clinical warning");
  });

  it("draws a machine's Stop list as the caution well", async () => {
    await mount({ props: { sections: stop() } });
    expect(host.querySelector(".vta__section")?.getAttribute("data-tone")).toBe("stop");
    await mount();
    expect(host.querySelector(".vta__section")?.hasAttribute("data-tone")).toBe(false);
  });
});

describe("a spoken line takes the page's accent", () => {
  const accentOn = () => (host.querySelector(".vta") as HTMLElement).style.getPropertyValue("--wk-accent");

  it("a machine page sets its category's accent on the body; another page sets none; a design may give one", async () => {
    await mount({ props: { target: { ref: { kind: "machine", id: "m-leg-press" }, key: "machine:m-leg-press", title: "Leg Press" } } });
    expect(accentOn()).toBe("var(--wk-cat-legs)");
    await mount();
    expect(accentOn()).toBe("");
    await mount({ props: { accent: { "--wk-accent": "var(--wk-cat-pull)" } as CSSProperties } });
    expect(accentOn()).toBe("var(--wk-cat-pull)");
  });
});

describe("the one hint that a line can be tapped", () => {
  const hint = () => host.querySelector(".vta__tap-hint");

  it("sits under the page's first line, in the words this reader's actions make, until a line is chosen", async () => {
    await mount();
    expect(hint()?.textContent).toBe("Tap a line to cross it out, note it, tell head office or ask in Teams.");
    expect(hint()?.closest(".vta__unit")).toBe(lineOf(SPEED).closest(".vta__unit"));
    await click(lineOf(BREATHE));
    expect(hint()).toBeNull();
    expect(localStorage.getItem(LINE_HINT_KEY)).toBe("seen");
    // Gone for good on this iPad, on the next page too.
    await mount();
    expect(hint()).toBeNull();
  });

  it("never promises a trainer a cross-out, and never shows in a peek", async () => {
    await mount({ viewer: TRAINER });
    expect(hint()?.textContent).toBe("Tap a line to note it, tell head office or ask in Teams.");
    await mount({ props: { compact: true } });
    expect(hint()).toBeNull();
  });
});

describe("what the studio told head office, and the answer", () => {
  const sub = (over: Partial<LearningSubmission> = {}): LearningSubmission => ({
    id: "sub-1",
    intent: "dispute",
    ref: TARGET.ref,
    targetKey: TARGET.key,
    targetTitle: TARGET.title,
    blockKey: blockKeyFor(LOWER),
    quote: LOWER,
    body: "Ours touches.",
    studioId: "solon",
    studioName: "Solon",
    by: { uid: "uid-kim", name: "Kim Ortiz" },
    at: "2026-10-18T15:00:00.000Z",
    status: "pending",
    ...over,
  });
  const answers = () => [...host.querySelectorAll(".vta__answer")].map((a) => a.textContent);

  it("says it under the line, waiting and then answered, with head office's note", async () => {
    await mount({ subs: [sub(), sub({ id: "elsewhere", studioId: "north", studioName: "Practice Studio North" })] });
    expect(answers()).toEqual(["Kim Ortiz told head office · Oct 18, 2026 · Waiting"]);
    expect(host.querySelector(".vta__answer")?.closest(".vta__unit")).toBe(lineOf(LOWER).closest(".vta__unit"));

    await act(async () => {
      store.decide("sub-1", "taken", { note: "We will add it in the next edit.", byName: "Pat Head", at: "2026-10-19T14:00:00.000Z" });
    });
    expect(host.querySelector(".vta__answer")?.getAttribute("data-verdict")).toBe("taken");
    expect(answers()[0]).toContain("Kim Ortiz told head office · Oct 18, 2026 · Taken");
    expect(answers()[0]).toContain("We will add it in the next edit.");
    expect(answers()[0]).toContain("Pat Head · Oct 19, 2026");
  });

  it("is not markup on the MSF original", async () => {
    await mount({ subs: [sub()], initialLens: "original" });
    expect(answers()).toEqual([]);
  });
});
