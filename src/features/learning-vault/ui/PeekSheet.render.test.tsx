// @vitest-environment jsdom
/**
 * THE PEEK SHEET, MOUNTED (Learning vault redesign, Oct 19 2026). Checks the
 * stack (push, the trail, Back, Close, Open full page), the detents (a phone
 * opens tall), Escape and focus, and that typing inside the peek is asked
 * about before any move throws it away, with the page left untouched until
 * the answer. Plus the pure helpers the sheet is built on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({ phone: false }));
vi.mock("../../phone/device", () => ({ usePhone: () => fx.phone }));

import { UnsavedChangesProvider, useUnsavedChanges } from "../../unsaved-changes";
import { PEEK_DEPTH, PeekFrame, PeekSheet, clearanceFrom, peekKey, pushPeek, usePeekStack } from "./PeekSheet";
import type { VaultRoute } from "../types";

const LEG_PRESS: VaultRoute = { kind: "machine", id: "m-leg-press" };
const PACE: VaultRoute = { kind: "topic", moduleId: "mastery", topicId: "mastery-pace" };
const GAP: VaultRoute = { kind: "glossary", term: "Gap" };

const TITLES: Record<string, string> = {
  [peekKey(LEG_PRESS)]: "LEG PRESS",
  [peekKey(PACE)]: "Pace",
  [peekKey(GAP)]: "Gap",
};
const titleOf = (r: VaultRoute) => TITLES[peekKey(r)] ?? "Unknown";

/** A note being typed inside the peek, as ArticleBlocks' NoteForm would hold one. */
function Typing({ label = "Note", says = "the note" }: { label?: string; says?: string }) {
  const [text, setText] = useState("");
  useUnsavedChanges(text.length > 0, says, { onDiscard: () => setText("") });
  return <textarea aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />;
}

let opened: VaultRoute[] = [];
let api: ReturnType<typeof usePeekStack> | null = null;

function Host({ withTyping = false, pageTyping = false }: { withTyping?: boolean; pageTyping?: boolean }) {
  const peek = usePeekStack();
  api = peek;
  // The Vault's and the Course's wiring: the peek closes, then the page opens.
  // Asked as one question before either, so the order cannot lose anything.
  const openFull = (r: VaultRoute) => {
    peek.close();
    opened.push(r);
  };
  return (
    <PeekFrame
      open={peek.stack.length > 0}
      peek={
        <PeekSheet
          stack={peek.stack}
          scope={peek.scope}
          titleOf={titleOf}
          render={(r) => (
            <div>
              <p className="body-of">{titleOf(r)} body</p>
              {withTyping && <Typing />}
              <button type="button" onClick={() => peek.push(GAP)}>
                Peek Gap
              </button>
            </div>
          )}
          onBack={peek.back}
          onCrumb={peek.crumb}
          onClose={peek.close}
          onOpenFull={openFull}
        />
      }
    >
      <button type="button" className="opener" onClick={() => peek.push(LEG_PRESS)}>
        Peek Leg Press
      </button>
      {pageTyping && <Typing label="Reason" says="the line you are crossing out" />}
    </PeekFrame>
  );
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fx.phone = false;
  opened = [];
  api = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(ui: React.ReactNode) {
  await act(async () => root.render(<UnsavedChangesProvider>{ui}</UnsavedChangesProvider>));
}
const sheet = () => host.querySelector<HTMLElement>("aside.vtp");
const title = () => sheet()?.querySelector(".vtp__title")?.textContent;
const crumbs = () => Array.from(host.querySelectorAll<HTMLButtonElement>(".vtp__crumb")).map((c) => c.textContent);
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  await act(async () => (el as HTMLElement).click());
};
const button = (label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );

describe("the stack", () => {
  it("draws nothing until something is peeked", async () => {
    await mount(<Host />);
    expect(sheet()).toBeNull();
    expect(host.querySelector(".vtp__frame--open")).toBeNull();
  });

  it("opens on the page peeked, its title the sheet's name, its body below", async () => {
    await mount(<Host />);
    const opener = host.querySelector<HTMLButtonElement>(".opener")!;
    opener.focus();
    await click(opener);
    expect(title()).toBe("LEG PRESS");
    expect(sheet()?.getAttribute("aria-labelledby")).toBe(sheet()?.querySelector(".vtp__title")?.id);
    expect(host.querySelector(".body-of")?.textContent).toBe("LEG PRESS body");
    expect(host.querySelector(".vtp__frame--open")).not.toBeNull();
    // One page: no trail and no Back.
    expect(crumbs()).toEqual([]);
    expect(host.querySelector('[aria-label^="Back to"]')).toBeNull();
    // Focus is on the title, so a reader hears where they are.
    expect(document.activeElement?.classList.contains("vtp__title")).toBe(true);
  });

  it("keeps a trail, goes Back one, or back to any crumb", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    await act(async () => api!.push(PACE));
    await click(button("Peek Gap"));
    expect(title()).toBe("Gap");
    expect(crumbs()).toEqual(["LEG PRESS", "Pace"]);
    await click(button("Back to Pace"));
    expect(title()).toBe("Pace");
    expect(crumbs()).toEqual(["LEG PRESS"]);
    await act(async () => api!.push(GAP));
    await click(host.querySelectorAll(".vtp__crumb")[0]);
    expect(title()).toBe("LEG PRESS");
    expect(crumbs()).toEqual([]);
  });

  it("hands the page on top to the design's own navigation", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    await act(async () => api!.push(PACE));
    await click(button("Open full page"));
    expect(opened).toEqual([PACE]);
  });

  it("closes from its button, giving focus back to what opened it", async () => {
    await mount(<Host />);
    const opener = host.querySelector<HTMLButtonElement>(".opener")!;
    opener.focus();
    await click(opener);
    await click(button("Close the peek"));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("Escape", () => {
  it("closes the peek", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(sheet()).toBeNull();
  });

  it("leaves it open when something above already used the key", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    await act(async () => {
      const ev = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      ev.preventDefault();
      window.dispatchEvent(ev);
    });
    expect(sheet()).not.toBeNull();
  });
});

describe("the detents", () => {
  it("opens at 55% on an iPad, and the grip makes it tall and back", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    expect(sheet()?.classList.contains("vtp--tall")).toBe(false);
    const grip = host.querySelector<HTMLButtonElement>(".vtp__grip")!;
    expect(grip.getAttribute("aria-label")).toBe("Make the peek taller");
    await click(grip);
    expect(sheet()?.classList.contains("vtp--tall")).toBe(true);
    expect(grip.getAttribute("aria-expanded")).toBe("true");
    await click(grip);
    expect(sheet()?.classList.contains("vtp--tall")).toBe(false);
  });

  it("opens tall on a phone", async () => {
    fx.phone = true;
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    expect(sheet()?.classList.contains("vtp--tall")).toBe(true);
    expect(host.querySelector(".vtp__grip")?.getAttribute("aria-label")).toBe("Make the peek shorter");
  });
});

describe("typing inside the peek", () => {
  async function typeANote() {
    const field = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(field, "Left pad sticks");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const question = () => document.querySelector('[role="alertdialog"]');
  const answer = async (action: "keep-editing" | "leave") =>
    click(document.querySelector(`[data-testid="leave-confirm"] [data-action="${action}"]`));

  it("is asked about before Close throws it away, and nothing moves until the answer", async () => {
    await mount(<Host withTyping />);
    await click(host.querySelector(".opener"));
    await typeANote();
    await click(button("Close the peek"));
    expect(question()).not.toBeNull();
    expect(sheet()).not.toBeNull();
    await answer("keep-editing");
    expect(question()).toBeNull();
    expect(title()).toBe("LEG PRESS");
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note"]')?.value).toBe("Left pad sticks");
    await click(button("Close the peek"));
    await answer("leave");
    expect(sheet()).toBeNull();
  });

  it("is asked about before a link pushes another page over it", async () => {
    await mount(<Host withTyping />);
    await click(host.querySelector(".opener"));
    await typeANote();
    await click(button("Peek Gap"));
    expect(question()).not.toBeNull();
    expect(title()).toBe("LEG PRESS");
    await answer("leave");
    expect(title()).toBe("Gap");
  });

  it("does not ask when nothing is typed", async () => {
    await mount(<Host withTyping />);
    await click(host.querySelector(".opener"));
    await click(button("Peek Gap"));
    expect(question()).toBeNull();
    expect(title()).toBe("Gap");
  });
});

describe("the pure helpers", () => {
  it("know a page whatever order its fields were written in", () => {
    expect(peekKey({ kind: "topic", moduleId: "a", topicId: "b" })).toBe(
      peekKey({ topicId: "b", kind: "topic", moduleId: "a" } as VaultRoute),
    );
    expect(peekKey({ kind: "glossary" })).toBe(peekKey({ kind: "glossary", term: undefined }));
    expect(peekKey(PACE)).not.toBe(peekKey(GAP));
  });

  it("push a page once: on top nothing changes, further down the trail goes back to it", () => {
    const s = [LEG_PRESS, PACE];
    expect(pushPeek(s, PACE)).toBe(s);
    expect(pushPeek(s, LEG_PRESS)).toEqual([LEG_PRESS]);
    expect(pushPeek(s, GAP)).toEqual([LEG_PRESS, PACE, GAP]);
  });

  it("drop the oldest page past the depth", () => {
    let s: VaultRoute[] = [];
    for (let i = 0; i < PEEK_DEPTH + 2; i += 1) s = pushPeek(s, { kind: "machine", id: `m-${i}` });
    expect(s).toHaveLength(PEEK_DEPTH);
    expect(s[0]).toEqual({ kind: "machine", id: "m-2" });
  });

  it("measure how far the bars reach, skipping hidden ones and ones above", () => {
    expect(clearanceFrom(100, [])).toBe(0);
    expect(
      clearanceFrom(100, [
        { top: 100, bottom: 158 },
        { top: 158, bottom: 206.4 },
        { top: 300, bottom: 300 },
        { top: 0, bottom: 60 },
      ]),
    ).toBe(106);
  });
});

describe("Open full page replaces the page too (review fix, Oct 19 2026)", () => {
  async function typeInto(label: string, text: string) {
    const field = host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const question = () => document.querySelector('[role="alertdialog"]');
  const answer = async (action: "keep-editing" | "leave") =>
    click(document.querySelector(`[data-testid="leave-confirm"] [data-action="${action}"]`));
  const value = (label: string) => host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)?.value;

  it("asks once about the page's typing AND the peek's, and moves nothing until the answer", async () => {
    await mount(<Host withTyping pageTyping />);
    await click(host.querySelector(".opener"));
    await typeInto("Reason", "Ours has a hard stop");
    await typeInto("Note", "Left pad sticks");
    await click(button("Open full page"));
    expect(question()?.textContent).toContain("the line you are crossing out");
    expect(question()?.textContent).toContain("the note");
    expect(opened).toEqual([]);

    await answer("keep-editing");
    expect(sheet()).not.toBeNull();
    expect(value("Reason")).toBe("Ours has a hard stop");
    expect(value("Note")).toBe("Left pad sticks");

    await click(button("Open full page"));
    await answer("leave");
    expect(question()).toBeNull();
    expect(opened).toEqual([LEG_PRESS]);
    expect(sheet()).toBeNull();
  });

  it("with only the page's typing, Keep editing leaves the peek open where it was", async () => {
    await mount(<Host pageTyping />);
    await click(host.querySelector(".opener"));
    await typeInto("Reason", "Ours has a hard stop");
    await click(button("Open full page"));
    expect(question()?.textContent).toContain("the line you are crossing out");
    await answer("keep-editing");
    expect(title()).toBe("LEG PRESS");
    expect(opened).toEqual([]);
  });

  it("with nothing typed, opens at once", async () => {
    await mount(<Host />);
    await click(host.querySelector(".opener"));
    await click(button("Open full page"));
    expect(question()).toBeNull();
    expect(opened).toEqual([LEG_PRESS]);
  });
});
