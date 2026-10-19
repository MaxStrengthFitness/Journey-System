// @vitest-environment jsdom
/**
 * ASK IN TEAMS, MOUNTED (the Learning vault redesign, Oct 19 2026).
 *
 * The form opens in place under a line: it shows the words that will leave
 * the iPad, offers the share sheet only where there is one, always offers
 * Copy link, says "Keep client names out of Teams." under the box where a
 * person types, and holds a typed question like any other typing until the
 * words have gone. The io is a fake, so nothing here touches a clipboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UnsavedChangesProvider, useLeaveGuard } from "../../unsaved-changes";
import type { ShareIo } from "../share";
import type { VaultBlock, VaultTarget } from "../types";
import {
  COPIED_LINE,
  COPY_FAILED_LINE,
  NAMES_LINE,
  NO_LINK_LINE,
  SHARED_LINE,
  SHARE_FAILED_LINE,
  ShareForm,
} from "./ShareForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = "https://journey.example";
const LEG_PRESS: VaultTarget = { ref: { kind: "machine", id: "m-leg-press" }, key: "machine:m-leg-press", title: "Leg Press" };
const LINE: VaultBlock = { key: "b-1a2b3c4d", kind: "line", text: "Keep the load moving slowly.", label: "The load-up" };
const PLAYBOOK: VaultTarget = { ref: { kind: "playbook", id: "the-floor" }, key: "playbook:the-floor", title: "The twenty minutes" };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function fakeIo(over: Partial<ShareIo> = {}): ShareIo & { copied: string[]; shared: { title: string; text: string; url?: string }[] } {
  const copied: string[] = [];
  const shared: { title: string; text: string; url?: string }[] = [];
  return {
    origin: ORIGIN,
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    share: (data) => {
      shared.push(data);
      return Promise.resolve();
    },
    copied,
    shared,
    ...over,
  };
}

/** A stand-in for any door in the app that would close the page: it asks the gate first. */
function Door({ onLeft }: { onLeft: () => void }) {
  const leave = useLeaveGuard();
  return (
    <button type="button" data-testid="door" onClick={() => leave(onLeft)}>
      Elsewhere
    </button>
  );
}

async function mount(props: Partial<Parameters<typeof ShareForm>[0]> & { io: ShareIo }, onLeft = () => {}) {
  const onDone = props.onDone ?? vi.fn();
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <Door onLeft={onLeft} />
        <ShareForm target={props.target ?? LEG_PRESS} block={props.block} sectionTitle={props.sectionTitle} io={props.io} onDone={onDone} />
      </UnsavedChangesProvider>,
    );
  });
  return onDone;
}

function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (value: string) => act(async () => setValue(host.querySelector("textarea"), value));
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name) ?? null;
const press = (name: string) =>
  act(async () => {
    const b = button(name);
    if (!b) throw new Error(`button "${name}" not found`);
    b.click();
  });
const words = () => host.querySelector(".vts__words")?.textContent ?? "";
const said = () => host.querySelector('[role="status"]')?.textContent ?? "";
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (a: "keep-editing" | "leave") =>
  act(async () => {
    (document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`) as HTMLElement).click();
  });

describe("ShareForm", () => {
  it("shows the words that will leave the iPad: the page, the section, the line and its link", async () => {
    await mount({ block: LINE, sectionTitle: "Script & cues", io: fakeIo() });
    expect(words()).toBe(
      "Leg Press · Script & cues — Open in Journey https://journey.example/l/machine~m-leg-press?section=b-1a2b3c4d\n" +
        "“The load-up: Keep the load moving slowly.”",
    );
    expect(host.textContent).toContain(NAMES_LINE);
    expect(host.textContent).not.toContain(NO_LINK_LINE);
    expect(host.querySelector(".vts__title")?.textContent).toBe("Ask in Teams");
  });

  it("offers Share… where there is a share sheet, and Copy link always", async () => {
    await mount({ io: fakeIo() });
    expect(button("Share…")).not.toBeNull();
    expect(button("Copy link")).not.toBeNull();
    expect(button("Share…")!.className).toContain("vts__btn--primary");
  });

  it("leaves Share… out where there is none, and Copy link becomes the one blue button", async () => {
    await mount({ io: fakeIo({ share: undefined }) });
    expect(button("Share…")).toBeNull();
    expect(button("Copy link")!.className).toContain("vts__btn--primary");
  });

  it("puts a typed question into the words as it is typed", async () => {
    await mount({ io: fakeIo() });
    await type("Does anyone cue this one differently?");
    expect(words()).toBe(
      "Leg Press — Open in Journey https://journey.example/l/machine~m-leg-press\nDoes anyone cue this one differently?",
    );
  });

  it("copies exactly the words shown, and says so", async () => {
    const io = fakeIo();
    await mount({ block: LINE, sectionTitle: "Script & cues", io });
    await type("Is this right for a new client?");
    const shown = words();
    await press("Copy link");
    expect(io.copied).toEqual([shown]);
    expect(said()).toBe(COPIED_LINE);
    expect(button("Done")).not.toBeNull();
  });

  it("says plainly when it could not copy, never in crimson", async () => {
    await mount({ io: fakeIo({ copy: () => Promise.reject(new Error("denied")) }) });
    await press("Copy link");
    expect(said()).toBe(COPY_FAILED_LINE);
    expect(host.querySelector(".vts__said--ok")).toBeNull();
  });

  it("hands the share sheet the words with the link inside them, and no second url", async () => {
    const io = fakeIo();
    await mount({ block: LINE, sectionTitle: "Script & cues", io });
    await press("Share…");
    expect(io.shared).toEqual([{ title: "Leg Press", text: words() }]);
    expect(said()).toBe(SHARED_LINE);
  });

  it("says nothing when the share sheet is closed without picking an app, and says so when it fails", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    await mount({ io: fakeIo({ share: () => Promise.reject(abort) }) });
    await press("Share…");
    expect(said()).toBe("");
    expect(button("Close")).not.toBeNull();

    await act(async () => root.render(<></>));
    await mount({ io: fakeIo({ share: () => Promise.reject(new Error("refused")) }) });
    await press("Share…");
    expect(said()).toBe(SHARE_FAILED_LINE);
  });

  it("a page with no link (a playbook draft) copies the words, which say where to look", async () => {
    const io = fakeIo({ share: undefined });
    await mount({ target: PLAYBOOK, sectionTitle: "Before the session", io });
    expect(words()).toBe("The twenty minutes · Before the session — in Journey's Learning");
    expect(host.textContent).toContain(NO_LINK_LINE);
    expect(button("Copy link")).toBeNull();
    await press("Copy the words");
    expect(io.copied).toEqual([words()]);
  });

  it("a typed question is held: a door asks first, and Keep editing keeps it", async () => {
    const onLeft = vi.fn();
    await mount({ io: fakeIo() }, onLeft);
    await type("Is this right?");
    await act(async () => (document.querySelector('[data-testid="door"]') as HTMLElement).click());
    expect(question()).not.toBeNull();
    await answer("keep-editing");
    expect(onLeft).not.toHaveBeenCalled();
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Is this right?");
  });

  it("once the words are copied the question has gone where it was going, and leaving no longer asks", async () => {
    const onLeft = vi.fn();
    await mount({ io: fakeIo() }, onLeft);
    await type("Is this right?");
    await press("Copy link");
    await act(async () => (document.querySelector('[data-testid="door"]') as HTMLElement).click());
    expect(question()).toBeNull();
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("Close closes at once with nothing typed, and asks first over a typed question", async () => {
    const quiet = await mount({ io: fakeIo() });
    await press("Close");
    expect(quiet).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<></>));
    const onDone = await mount({ io: fakeIo() });
    await type("Half a question");
    await press("Close");
    expect(onDone).not.toHaveBeenCalled();
    expect(question()).not.toBeNull();
    await answer("leave");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("every button is a real button, with the words a person reads", async () => {
    await mount({ io: fakeIo() });
    const names = [...host.querySelectorAll(".vts button")].map((b) => (b.textContent ?? "").trim());
    expect(names).toEqual(["Share…", "Copy link", "Close"]);
    for (const b of host.querySelectorAll(".vts button")) expect(b.getAttribute("type")).toBe("button");
  });
});
