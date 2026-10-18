// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findQuoteElement, needleOf, wordsOf } from "./find-quote";

describe("finding a quote on its page", () => {
  it("compares words, not spacing, bullets or quote marks", () => {
    expect(wordsOf('• "Breathe Freely" —  jaw relaxed')).toBe("breathe freely jaw relaxed");
    expect(needleOf('\n• "Keep breathing and do not pause at the bottom"\n• "Show me"')).toBe("keep breathing and do not pause at the");
  });

  it("finds the smallest element holding the quote's first words", () => {
    document.body.innerHTML = `
      <article><section>
        <p>Breathing matters.</p>
        <p id="hit">The brief moments of breath holding almost always go unnoticed by the trainee.</p>
      </section></article>`;
    const found = findQuoteElement(document.body, "The brief moments of breath holding almost always go unnoticed by the trainee. They are often disguised");
    expect(found?.id).toBe("hit");
  });

  it("skips the hidden search stash, and says null when the words aren't there", () => {
    document.body.innerHTML = `<div class="lv__stash"><p>Breathe freely throughout the whole set</p></div><p>Something else</p>`;
    expect(findQuoteElement(document.body, "Breathe freely throughout the whole set")).toBeNull();
    expect(findQuoteElement(document.body, "x")).toBeNull();
  });
});
