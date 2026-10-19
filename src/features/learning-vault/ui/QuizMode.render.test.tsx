// @vitest-environment jsdom
/**
 * THE QUIZ, MOUNTED (Learning vault redesign, Oct 19 2026).
 *
 * A tiny bank (a choice, a True / False and an order question) played
 * through: loading while the bank is null, the deck picker, one right
 * answer and one wrong one (the miss grey, never crimson, and the right
 * answer shown), tap-to-place on the order question, "Read it", the end
 * card's one sentence and its list of what to read again, Play again, and
 * a deck named from outside starting straight away. Nothing is written to
 * storage at any point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { QuizQuestion, VaultRoute } from "../types";
import { QuizMode } from "./QuizMode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BANK: QuizQuestion[] = [
  {
    id: "a-cycle",
    deck: "rep",
    kind: "choice",
    prompt: "About how long is one repetition cycle in the protocol?",
    options: ["About 12 to 20 seconds", "About 4 seconds", "About 30 to 40 seconds", "Exactly 20 seconds, every rep"],
    answer: 0,
    explain: "6 to 10 seconds up and 6 to 10 seconds down.",
    source: {
      label: "Academy · Exercise Performance · Speed of movement",
      route: { kind: "topic", moduleId: "performance", topicId: "performance-speed-of-movement" },
    },
  },
  {
    id: "a-squeeze-first-rep",
    deck: "rep",
    kind: "truefalse",
    prompt: "True or false: on a machine with a squeeze, the squeeze starts on the very first rep.",
    options: ["True", "False"],
    answer: 1,
    explain: "The squeeze starts with the third rep.",
    source: { label: "Academy · Turnaround technique", route: null },
  },
  {
    id: "a-lower-rules",
    deck: "rep",
    kind: "order",
    prompt: "Put the three rules of the lower turnaround in order.",
    options: ["Always bottom out", "Do not unload at the bottom", "Do not fire out of the bottom"],
    answer: -1,
    explain: "Barely touch, never set the weight down, and change direction without firing out.",
    source: {
      label: "Academy · Mastery Series 6 · Lower turnarounds",
      route: { kind: "topic", moduleId: "mastery", topicId: "mastery-lower-turnarounds" },
    },
  },
];

let root: Root;
let host: HTMLDivElement;
const opened: VaultRoute[] = [];
const onOpenSource = (r: VaultRoute) => {
  opened.push(r);
};

beforeEach(() => {
  opened.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function render(node: Parameters<Root["render"]>[0]) {
  await act(async () => root.render(node));
}

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
}

const q = (sel: string) => host.querySelector(sel);
const qa = (sel: string) => [...host.querySelectorAll(sel)];
const byText = (sel: string, text: string) => qa(sel).find((el) => el.textContent?.includes(text));
const prompt = () => q(".qz__prompt")?.textContent ?? "";

/** Answer whatever card is showing: the choice right, the True / False wrong, the order right. */
async function answerShowing() {
  const shown = BANK.find((b) => b.prompt === prompt());
  expect(shown, `a fixture question on screen: "${prompt()}"`).toBeTruthy();
  if (!shown) return;
  if (shown.kind === "choice") {
    await click(byText("[data-qz-option]", shown.options[shown.answer]));
  } else if (shown.kind === "truefalse") {
    await click(byText("[data-qz-option]", shown.options[1 - shown.answer]));
  } else {
    // Tap-to-place: tap each item in its right order, then check.
    for (const item of shown.options) await click(byText("[data-qz-pool]", item));
    expect(qa("[data-qz-placed]").map((el) => el.textContent)).toEqual(
      shown.options.map((o, i) => `${i + 1}${o}`),
    );
    await click(q("[data-qz-check]"));
  }
  return shown;
}

describe("the quiz, played", () => {
  it("waits for the bank, deals a round, turns each card over, and ends with one sentence", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await render(<QuizMode bank={null} seed={7} onOpenSource={onOpenSource} />);
    expect(q('[role="status"]')?.getAttribute("aria-label")).toBe("Shuffling the decks…");

    await render(<QuizMode bank={BANK} seed={7} onOpenSource={onOpenSource} />);
    // One deck in the bank: no mixed deck to offer, just the repetition.
    expect(qa("[data-qz-deck]").map((el) => el.getAttribute("data-qz-deck"))).toEqual(["rep"]);
    expect(host.textContent).toContain("The repetition");

    await click(q('[data-qz-deck="rep"]'));
    // The pips say where the round is; their words are a screen reader's
    // (said once: never "Question 1 of 3" written beside three pips).
    const pips = () => q(".qz__pips");
    expect(pips()?.getAttribute("role")).toBe("img");
    expect(pips()?.getAttribute("aria-label")).toBe("Question 1 of 3");
    expect(host.textContent).not.toContain("Question 1 of 3");
    expect(qa(".qz__pip")).toHaveLength(3);

    const seen: string[] = [];
    for (let n = 0; n < 3; n++) {
      const shown = await answerShowing();
      if (!shown) return;
      seen.push(shown.id);
      const reveal = q(".qz__reveal");
      expect(reveal?.getAttribute("role")).toBe("status");
      expect(reveal?.textContent).toContain(shown.explain);
      expect(reveal?.textContent).toContain(shown.source.label);

      if (shown.kind === "truefalse") {
        // The miss: the picked one grey and tagged, the right one green and shown.
        expect(reveal?.textContent).toContain("Not quite.");
        expect(reveal?.textContent).toContain(`It's “${shown.options[shown.answer]}”`);
        const missed = q(".qz__option--missed");
        expect(missed?.textContent).toContain(shown.options[1 - shown.answer]);
        expect(missed?.textContent).toContain("Your answer");
        expect(q(".qz__option--right")?.textContent).toContain(shown.options[shown.answer]);
        expect(host.innerHTML).not.toMatch(/alert|crimson/);
        // No Learning page behind this one: the source is named, no door.
        expect(q("[data-qz-read]")).toBeNull();
      } else {
        expect(reveal?.textContent).toContain("That's it.");
        expect(q(".qz__option--missed")).toBeNull();
        await click(q("[data-qz-read]"));
        expect(opened[opened.length - 1]).toEqual(shown.source.route);
      }
      // Every option locks once the card is answered.
      for (const b of qa("[data-qz-option]")) expect((b as HTMLButtonElement).disabled).toBe(true);

      const next = q("[data-qz-next]");
      expect(next?.textContent).toContain(n === 2 ? "See the round" : "Next question");
      await click(next);
      if (n < 2) expect(pips()?.getAttribute("aria-label")).toBe(`Question ${n + 2} of 3`);
    }
    expect(new Set(seen).size).toBe(3);

    // The end: the one sentence, and the miss to read again.
    expect(q("[data-qz-end]")).toBeTruthy();
    expect(q(".qz__end-line")?.textContent).toBe("2 of 3 this round");
    const missedRows = qa(".qz__missed-row");
    expect(missedRows).toHaveLength(1);
    expect(missedRows[0].textContent).toContain("the squeeze starts on the very first rep");
    expect(missedRows[0].textContent).toContain("False");

    // Nothing was kept anywhere.
    expect(setItem).not.toHaveBeenCalled();

    // Play again deals a fresh round of the same deck; Another deck goes back.
    await click(q("[data-qz-again]"));
    expect(pips()?.getAttribute("aria-label")).toBe("Question 1 of 3");
    expect(q("[data-qz-end]")).toBeNull();
    await click(byText("button", "Other decks"));
    expect(q('[data-qz-deck="rep"]')).toBeTruthy();
  });

  it("puts a placed item back when it is tapped, and checks only a full order", async () => {
    const order = BANK[2];
    await render(<QuizMode bank={[order]} initialDeck="rep" seed={3} onOpenSource={onOpenSource} />);
    // A deck named from outside starts at once.
    expect(prompt()).toBe(order.prompt);
    const check = () => q("[data-qz-check]") as HTMLButtonElement;
    expect(check().disabled).toBe(true);

    await click(byText("[data-qz-pool]", order.options[1]));
    await click(byText("[data-qz-pool]", order.options[0]));
    expect(qa("[data-qz-placed]")).toHaveLength(2);
    // Tap the first placed one: it goes back to the pile.
    await click(q("[data-qz-placed]"));
    expect(qa("[data-qz-placed]")).toHaveLength(1);
    expect(qa("[data-qz-pool]")).toHaveLength(2);

    // Place the rest in the wrong order and check.
    await click(byText("[data-qz-pool]", order.options[2]));
    await click(byText("[data-qz-pool]", order.options[1]));
    expect(check().disabled).toBe(false);
    await click(check());
    const reveal = q(".qz__reveal");
    expect(reveal?.textContent).toContain("Not quite. Here is the order.");
    expect(qa(".qz__order-right li").map((li) => li.textContent)).toEqual(order.options);
    expect(qa(".qz__placed-row--missed").length).toBeGreaterThan(0);

    await click(q("[data-qz-next]"));
    expect(q(".qz__end-line")?.textContent).toBe("0 of 1 this round");
  });

  it("says so when there is nothing to play, and offers the way back", async () => {
    const onExit = vi.fn();
    await render(<QuizMode bank={[]} onOpenSource={onOpenSource} onExit={onExit} />);
    expect(host.textContent).toContain("Nothing to play yet.");
    await click(byText("button", "Back to Learning"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
