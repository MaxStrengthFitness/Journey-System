// @vitest-environment jsdom
/**
 * ITS SIZE, MOUNTED (the studio map, Oct 2026): the machine's size on its
 * door. Each of the five states, the measure that writes `unit.size` alone
 * by its dotted path and never waits for it, the model picker, and typing
 * that a leave asks about.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));

const writes: { path: string; data: Record<string, unknown> }[] = [];
/** How the models read answers: with documents, never (loading), or with an error. */
const models = vi.hoisted(() => ({ mode: "docs" as "docs" | "never" | "error", docs: [] as { id: string; data: () => unknown }[] }));
const pending = vi.hoisted(() => ({ hold: false }));

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  onSnapshot: (_q: unknown, next: (s: { docs: typeof models.docs }) => void, fail: (e: Error) => void) => {
    if (models.mode === "docs") next({ docs: models.docs });
    if (models.mode === "error") fail(new Error("permission-denied"));
    return () => {};
  },
  serverTimestamp: () => "__now__",
  deleteField: () => "__delete__",
  updateDoc: (ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ path: ref.path, data });
    // A write offline: it never comes back.
    return pending.hold ? new Promise(() => {}) : Promise.resolve();
  },
  writeBatch: () => ({ update: () => {}, commit: async () => {} }),
}));

const toasts: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const { UnitSizeCard } = await import("./UnitSizeCard");
const { UnsavedChangesProvider, UnsavedChangesScope, useLeaveScope } = await import("../../unsaved-changes");
import type { StudioMachineRosterEntry } from "../../../types/machines";

const IS_LP = {
  id: "mm-imagine-strength-is2019-leg-press",
  data: () => ({
    brand: "Imagine Strength",
    model: "IS2019 Leg Press",
    movementId: "m-leg-press",
    size: { lengthMm: 2120, widthMm: 1260, heightMm: 1800, source: "Imagine Strength brochure, 2026, page 2", note: "The seat moves past the frame." },
  }),
};
const HOIST_LP = { id: "mm-hoist-roc-it-leg-press", data: () => ({ brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press" }) };

const base: StudioMachineRosterEntry = { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" };

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function Door({ entry, canEdit }: { entry: StudioMachineRosterEntry; canEdit: boolean }) {
  const scope = useLeaveScope();
  const [open, setOpen] = useState(true);
  if (!open) return <p>Door closed</p>;
  return (
    <>
      <button type="button" onClick={() => scope.guard(() => setOpen(false))}>
        Close the door
      </button>
      <UnsavedChangesScope scope={scope}>
        <UnitSizeCard
          studioId="solon"
          entry={entry}
          machineName="Leg Press"
          canEdit={canEdit}
          authUid="uid-aj"
          nameOf={(uid) => (uid === "uid-aj" ? "AJ Jurgens" : null)}
        />
      </UnsavedChangesScope>
    </>
  );
}

async function mount(entry: StudioMachineRosterEntry, canEdit = true) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <UnsavedChangesProvider>
          <Door entry={entry} canEdit={canEdit} />
        </UnsavedChangesProvider>
      </StrictMode>,
    );
  });
  return host!;
}

const byText = (el: ParentNode, text: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
  models.mode = "docs";
  models.docs = [];
  pending.hold = false;
  document.body.innerHTML = "";
});

describe("its size, in each state", () => {
  it("a measured size: the line, who measured it and when, and its leader's two ways on", async () => {
    models.docs = [IS_LP];
    const el = await mount({
      ...base,
      modelId: IS_LP.id,
      unit: { size: { lengthMm: 2134, widthMm: 1270, by: "uid-aj", at: new Date("2026-10-12T15:00:00Z") } },
    });
    expect(el.textContent).toContain("7 ft long × 4 ft 2 in wide");
    expect(el.textContent).toContain("Measured by AJ Jurgens on Oct 12");
    expect(byText(el, "Measure again")).toBeTruthy();
    expect(byText(el, "Use the model's size instead")).toBeTruthy();
    await act(async () => byText(el, "Use the model's size instead")!.click());
    expect(writes).toEqual([{ path: "studios/solon/roster/m-leg-press", data: { "unit.size": "__delete__" } }]);
  });

  it("the model's size: the line, its source, and head office's note", async () => {
    models.docs = [IS_LP, HOIST_LP];
    const el = await mount({ ...base, modelId: IS_LP.id });
    expect(el.textContent).toContain("6 ft 11 in long × 4 ft 2 in wide × 5 ft 11 in tall");
    expect(el.textContent).toContain("IS2019 Leg Press · Imagine Strength brochure, 2026, page 2 · frame at rest");
    expect(el.textContent).toContain("The seat moves past the frame.");
    expect(el.querySelector("select")).toBeNull();
    await act(async () => byText(el, "Change model")!.click());
    expect(el.querySelector("select")).not.toBeNull();
  });

  it("unknown, with what can be done: pick a model, measure, or ask head office", async () => {
    models.docs = [HOIST_LP];
    let el = await mount({ ...base, modelId: HOIST_LP.id });
    // A model is picked: the sentence says why it has no size, never "pick its model".
    expect(el.textContent).toContain("Size not known: head office hasn't recorded this model's size. Measure it, or pick another model.");
    expect(el.textContent).not.toContain("Pick its model");
    const select = el.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Not recorded", "Hoist ROC-IT Leg Press"]);
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(writes).toEqual([{ path: "studios/solon/roster/m-leg-press", data: { modelId: "__delete__" } }]);
    await act(async () => root!.unmount());
    root = null;

    models.docs = [];
    el = await mount({ ...base, machineId: "m-neck", basedOn: "m-neck" });
    expect(el.textContent).toContain("Size not known. Measure it, or ask head office to record its model.");
    expect(el.querySelector("select")).toBeNull();
    await act(async () => root!.unmount());
    root = null;

    el = await mount({ machineId: "sm-solon-sled", studioId: "solon", source: "custom", status: "active" } as StudioMachineRosterEntry);
    expect(el.textContent).toContain("Size not known. Measure it.");
    expect(el.querySelector("select")).toBeNull();
    expect(byText(el, "Measure it")).toBeTruthy();
  });

  it("loading, and a read that failed", async () => {
    models.mode = "never";
    let el = await mount({ ...base, modelId: IS_LP.id });
    expect(el.textContent).toContain("Checking the model's size…");
    await act(async () => root!.unmount());
    root = null;
    models.mode = "error";
    el = await mount({ ...base, modelId: IS_LP.id });
    expect(el.textContent).toContain("The model's size couldn't be read.");
  });

  it("a catalog copy naming no model: its Imagine Strength size, not confirmed, and Confirm names that model without waiting", async () => {
    models.docs = [IS_LP, HOIST_LP];
    pending.hold = true;
    const el = await mount({ ...base });
    expect(el.textContent).toContain("6 ft 11 in long × 4 ft 2 in wide × 5 ft 11 in tall");
    expect(el.textContent).toContain("Imagine Strength size, not confirmed · IS2019 Leg Press");
    expect(el.textContent).toContain("The seat moves past the frame.");
    expect(el.querySelector("select")).toBeNull();
    await act(async () => byText(el, "Confirm")!.click());
    expect(writes).toEqual([{ path: "studios/solon/roster/m-leg-press", data: { modelId: IS_LP.id } }]);
    expect(toasts).toContain("Leg Press confirmed as the IS2019 Leg Press.");
    // Another model is one tap away, and Measure it is still there.
    await act(async () => byText(el, "Change model")!.click());
    expect(el.querySelector("select")).not.toBeNull();
    expect(byText(el, "Measure it")).toBeTruthy();
  });

  it("never gives a studio's own machine an Imagine Strength size, and a trainer sees the words but no Confirm", async () => {
    models.docs = [IS_LP];
    let el = await mount({ machineId: "sm-solon-sled", studioId: "solon", source: "custom", basedOn: "m-leg-press", status: "active" } as StudioMachineRosterEntry);
    expect(el.textContent).toContain("Size not known. Pick its model or measure it.");
    expect(byText(el, "Confirm")).toBeUndefined();
    await act(async () => root!.unmount());
    root = null;

    el = await mount({ ...base }, false);
    expect(el.textContent).toContain("Imagine Strength size, not confirmed · IS2019 Leg Press");
    expect(byText(el, "Confirm")).toBeUndefined();
    expect(el.querySelectorAll("button").length).toBe(1); // the test door's own Close
  });

  it("is read only for a trainer", async () => {
    models.docs = [HOIST_LP];
    const el = await mount({ ...base }, false);
    // Never told to do what only a leader can.
    expect(el.textContent).toContain("Size not known yet.");
    expect(el.textContent).not.toMatch(/Pick its model|Measure it/);
    expect(el.querySelector("select")).toBeNull();
    expect(el.querySelectorAll("button").length).toBe(1); // the test door's own Close
  });
});

describe("measuring it", () => {
  it("writes unit.size alone, signed with the Auth uid and the server's time, and never waits for it", async () => {
    models.docs = [IS_LP];
    pending.hold = true;
    const el = await mount({ ...base });
    await act(async () => byText(el, "Measure it")!.click());
    await type(el.querySelector("#smap-size-m-leg-press-length-in") as HTMLInputElement, "83 1/2");
    await type(el.querySelector("#smap-size-m-leg-press-width-ft") as HTMLInputElement, "4");
    await type(el.querySelector("#smap-size-m-leg-press-width-in") as HTMLInputElement, "1 1/2");
    await act(async () => byText(el, "Save")!.click());
    expect(writes).toEqual([
      { path: "studios/solon/roster/m-leg-press", data: { "unit.size": { lengthMm: 2121, widthMm: 1257, by: "uid-aj", at: "__now__" } } },
    ]);
    // The write is still on its way, and the form is already closed.
    expect(el.querySelector("#smap-size-m-leg-press-length-in")).toBeNull();
    expect(toasts).toContain("Size saved.");
  });

  it("says what is wrong rather than saving it", async () => {
    const el = await mount({ ...base });
    await act(async () => byText(el, "Measure it")!.click());
    await type(el.querySelector("#smap-size-m-leg-press-length-in") as HTMLInputElement, "83 1/0");
    await act(async () => byText(el, "Save")!.click());
    expect(el.textContent).toContain("Length: feet are whole numbers; inches can be 83, 83.5 or 83 1/2.");
    // An empty width is a width, and so is one out of range.
    await type(el.querySelector("#smap-size-m-leg-press-length-in") as HTMLInputElement, "83");
    await act(async () => byText(el, "Save")!.click());
    expect(el.querySelector(".smap-form__problem")?.textContent).toBe("Type the width.");
    await type(el.querySelector("#smap-size-m-leg-press-width-ft") as HTMLInputElement, "30");
    await act(async () => byText(el, "Save")!.click());
    expect(el.querySelector(".smap-form__problem")?.textContent).toBe("The width is between 1 ft and 20 ft.");
    expect(writes).toEqual([]);
  });

  it("asks before the door closes over a size being typed", async () => {
    const el = await mount({ ...base });
    await act(async () => byText(el, "Measure it")!.click());
    await type(el.querySelector("#smap-size-m-leg-press-length-in") as HTMLInputElement, "83");
    await act(async () => byText(el, "Close the door")!.click());
    expect(el.textContent).not.toContain("Door closed");
    expect(document.body.textContent).toMatch(/Keep editing/);
  });
});
