// @vitest-environment jsdom
/**
 * Mounts the report's "Why … trains" step. It proves the client is named by
 * first name, else by the pronoun of the gender on the record (AJ, Oct 15
 * 2026: Male he, Female she, anything else they, with the verb agreeing), and
 * that the own-goal box's label and hint follow the same pronoun.
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FocusPicker } from "./FocusPicker";
import { pronounsFor } from "../client-codex/kit/pronouns";
import type { TrainingFocus } from "./report-page";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const picker = (firstName: string, gender: string | undefined, value: TrainingFocus | null = null, fallback: TrainingFocus | null = null) =>
  mount(<FocusPicker value={value} onChange={() => {}} firstName={firstName} pronouns={pronounsFor({ gender })} fallback={fallback} />);

const title = (host: HTMLElement) => host.querySelector("#pr-focus-title")!.textContent;

describe("FocusPicker names the client", () => {
  it("by first name when there is one, whatever the gender", async () => {
    expect(title(await picker("Carol", "Female"))).toBe("Why Carol trains");
    expect(title(await picker("Bill", undefined))).toBe("Why Bill trains");
  });

  it("else by the pronoun of the gender on the record, the verb agreeing", async () => {
    expect(title(await picker("", "Male"))).toBe("Why he trains");
    expect(title(await picker("", "Female"))).toBe("Why she trains");
    expect(title(await picker("", undefined))).toBe("Why they train");
    expect(title(await picker("", "Other"))).toBe("Why they train");
  });

  it("says the own goal's label and hint in the same pronoun", async () => {
    const custom: TrainingFocus = { kind: "custom", words: "" };
    const he = await picker("Bill", "Male", custom, { kind: "body" });
    expect(he.querySelector(".pr-focus__words-label")!.textContent).toBe("His goal, in your words");
    expect(he.textContent).toContain("Type his goal to use it: until then the page follows his focus on file, Body composition.");
    const she = await picker("Carol", "Female", custom);
    expect(she.querySelector(".pr-focus__words-label")!.textContent).toBe("Her goal, in your words");
    expect(she.textContent).toContain("Type her goal to use it: until then the page follows A goal to hit's order and prints no focus.");
    const they = await picker("Sam", undefined, custom);
    expect(they.querySelector(".pr-focus__words-label")!.textContent).toBe("Their goal, in your words");
    expect(they.textContent).toContain("Type their goal to use it");
  });
});
