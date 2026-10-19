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
import { act, type ReactNode } from "react";
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
import type { StudioBlockNote, StudioMarkup, StudioStrike, VaultBlock, VaultSection, VaultTarget, VaultViewer } from "../types";
import { ArticleBlocks, type ArticleBlocksProps } from "./ArticleBlocks";
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

async function mount(
  opts: {
    viewer?: VaultViewer;
    seed?: StudioMarkup[];
    initialLens?: "studio" | "original";
    props?: Partial<ArticleBlocksProps>;
    extra?: ReactNode;
  } = {},
) {
  store = createSandboxStore({ markup: opts.seed ?? [] });
  await act(async () => {
    root.render(
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
      </UnsavedChangesProvider>,
    );
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
const selected = () => lines().filter((l) => l.getAttribute("aria-expanded") === "true");
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
    // The focus goes back to the line the form was under.
    expect(document.activeElement).toBe(lineOf(SPEED));
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
    expect(document.activeElement).toBe(lineOf(LOWER));

    // A tap inside a card laid over the page (a term's concept card) is not elsewhere.
    await click(lineOf(LOWER));
    await click(document.querySelector('[data-testid="card"] button'));
    expect(selected()).toEqual([lineOf(LOWER)]);

    await click(document.body);
    expect(selected()).toEqual([]);
  });

  it("Enter on a focused line chooses it", async () => {
    await mount();
    const line = lineOf(SPEED);
    expect(line.getAttribute("role")).toBe("button");
    expect(line.tabIndex).toBe(0);
    await act(async () => {
      line.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(line.getAttribute("aria-expanded")).toBe("true");
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
