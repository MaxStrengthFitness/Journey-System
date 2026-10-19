// @vitest-environment jsdom
/**
 * PROGRAMMING → ROUTINES, MOUNTED (the routine builder round, Oct 19 2026).
 *
 * The real builder over a host whose floor and signer are given, with the
 * two commits recorded (the pure half that works each save out runs for
 * real). What matters is silent when wrong:
 *   - a tap goes into the routine Add to names, and never into the other;
 *   - Routine B saved with machines while B is off turns B on with it;
 *   - Copy A into B, and Phase it in only when B differs;
 *   - a phase-in plan ticks a step as ONE write, and nothing changes B by itself;
 *   - what is tapped and not saved is registered as unsaved work;
 *   - a read that hasn't answered, or failed, says so and offers nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
const commits = vi.hoisted(() => ({ routine: [] as unknown[], phase: [] as unknown[] }));
vi.mock("../store", async () => {
  const real = await vi.importActual<typeof import("../store")>("../store");
  return {
    ...real,
    commitRoutineSave: (_db: unknown, save: unknown) => {
      commits.routine.push(save);
      return { routineId: "new", commit: Promise.resolve() };
    },
    commitPhaseSave: (_db: unknown, save: unknown) => {
      commits.phase.push(save);
      return { routineId: "new", commit: Promise.resolve() };
    },
  };
});
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Client, Machine, Routine } from "../../../types";
import { UnsavedChangesProvider, useUnsavedStatus, type UnsavedStatus } from "../../unsaved-changes";
import { startingKindOf } from "../../routine-plan/client-kind";
import type { PlanHost } from "../../routine-plan/ui/host";
import { phasePlanOf } from "../phase";
import type { PhaseSave, RoutineSave } from "../store";
import { RoutineBuilder } from "./RoutineBuilder";

const FLOOR: Machine[] = [
  { id: "m-pulldown", name: "Pulldown" },
  { id: "m-leg-press", name: "Leg Press" },
  { id: "m-leg-curl", name: "Leg Curl" },
  { id: "m-chest-press", name: "Chest Press" },
] as Machine[];
const TODAY = "2026-10-19";
const client = { id: "c1", firstName: "Michael", homeStudioId: "strongsville" } as Client;

function hostOf(over: Partial<PlanHost> = {}): PlanHost {
  return {
    status: "ready",
    kind: startingKindOf({ known: true, hasRoutine: true, hasPlan: false, journeySessions: 4, coverage: "complete", provisionalNewClient: false }),
    floor: FLOOR,
    studioId: "strongsville",
    studioName: "Strongsville",
    who: { uid: "uid-sam", name: "Sam Lee" },
    todayYmd: TODAY,
    intakeText: null,
    actions: { start: () => {}, save: () => {}, healthNote: () => {}, readChanges: () => Promise.resolve([]) },
    ...over,
  };
}
const A: Routine = { id: "ra", name: "Routine A", clientId: "c1", studioId: "strongsville", machineIds: ["m-pulldown", "m-leg-press"] };

let root: Root | null = null;
let el: HTMLElement | null = null;
let status: UnsavedStatus | null = null;
function Probe() {
  status = useUnsavedStatus();
  return null;
}
async function mount(props: { routines: Routine[]; isBActive?: boolean; host?: PlanHost; toggles?: boolean[] }) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <UnsavedChangesProvider>
        <Probe />
        <RoutineBuilder
          host={props.host ?? hostOf()}
          client={client}
          clientId="c1"
          routines={props.routines}
          machines={FLOOR}
          isBActive={props.isBActive ?? false}
          trainers={[]}
          adjustments={[]}
          onToggleB={(on) => props.toggles?.push(on)}
        />
      </UnsavedChangesProvider>,
    );
  });
  await act(async () => {});
}
const text = () => document.body.textContent ?? "";
const buttons = () => Array.from(document.body.querySelectorAll("button"));
function button(label: string | RegExp): HTMLButtonElement {
  const found = buttons().find((b) => {
    const words = (b.getAttribute("aria-label") || b.textContent || "").trim();
    return typeof label === "string" ? words === label : label.test(words);
  });
  if (!found) throw new Error(`no button ${String(label)} among: ${buttons().map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).join(" | ")}`);
  return found as HTMLButtonElement;
}
const has = (label: string | RegExp) => buttons().some((b) => {
  const words = (b.getAttribute("aria-label") || b.textContent || "").trim();
  return typeof label === "string" ? words === label : label.test(words);
});
async function tap(label: string | RegExp) {
  await act(async () => {
    button(label).click();
  });
  await act(async () => {});
}
const listOf = (slot: string) =>
  Array.from(document.body.querySelectorAll(`ol[aria-label="Michael's ${slot}"] .rpl-cell__name`)).map((n) => n.textContent);

beforeEach(() => {
  commits.routine = [];
  commits.phase = [];
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe("one builder for A and B", () => {
  it("draws the floor, Routine A and Routine B together, each tile marked", async () => {
    await mount({ routines: [A] });
    expect(text()).toContain("This studio's floor");
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press"]);
    expect(listOf("Routine B")).toEqual([]);
    expect(has("Pulldown, In Routine A")).toBe(true);
  });

  it("taps into the routine Add to names, and never into the other", async () => {
    await mount({ routines: [A] });
    await tap("Routine B");
    await tap("Leg Curl");
    expect(listOf("Routine B")).toEqual(["Leg Curl"]);
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press"]);
    expect(status?.anyDirty()).toBe(true);
    await tap("Both");
    await tap("Chest Press");
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press", "Chest Press"]);
    expect(listOf("Routine B")).toEqual(["Leg Curl", "Chest Press"]);
  });

  it("saves Routine B whole, and turns B on with it", async () => {
    await mount({ routines: [A] });
    await tap("Copy A into B");
    expect(listOf("Routine B")).toEqual(["Pulldown", "Leg Press"]);
    await tap("Save and turn B on");
    const save = commits.routine[0] as RoutineSave;
    expect(save.fields).toMatchObject({ name: "Routine B", machineIds: ["m-pulldown", "m-leg-press"] });
    expect(save.turnB).toBe(true);
    expect(status?.anyDirty()).toBe(false);
  });

  it("offers Phase it in only once B differs, and starts it as one write", async () => {
    await mount({ routines: [A] });
    await tap("Copy A into B");
    expect(has("Phase it in")).toBe(false);
    await tap("Routine B");
    await tap(/^Leg Press, In Routine A and Routine B$/);
    await tap("Leg Curl");
    await tap("Phase it in");
    expect(text()).toContain("Leg Curl for Leg Press");
    await tap("Start phasing in");
    const save = commits.phase[0] as PhaseSave;
    expect(save.fields.machineIds).toEqual(["m-pulldown", "m-leg-press"]);
    expect((save.fields.plan as { phase: { steps: unknown[] } }).phase.steps).toHaveLength(1);
    expect(save.turnB).toBe(true);
  });

  it("ticks a planned step as one write, and says where it stands", async () => {
    const phase = phasePlanOf({ base: ["m-pulldown", "m-leg-press"], target: ["m-pulldown", "m-leg-curl"], todayYmd: TODAY, who: { uid: "u0" } });
    const B: Routine = {
      id: "rb",
      name: "Routine B",
      clientId: "c1",
      studioId: "strongsville",
      machineIds: ["m-pulldown", "m-leg-press"],
      plan: { purpose: "", intended: [], building: false, madeByUid: "u0", phase },
    };
    await mount({ routines: [A, B], isBActive: true });
    expect(text()).toContain("Phasing in · 0 of 1 done · next: Leg Curl for Leg Press, week of Oct 19 · Anyone");
    await tap(/^Leg Curl for Leg Press/);
    const save = commits.phase[0] as PhaseSave;
    expect(save.fields.machineIds).toEqual(["m-pulldown", "m-leg-curl"]);
    expect(save.adjustment?.notes).toBe("Phasing in: Leg Curl for Leg Press");
  });

  it("hands the B switch to the profile once B has machines", async () => {
    const toggles: boolean[] = [];
    const B: Routine = { id: "rb", name: "Routine B", clientId: "c1", studioId: "strongsville", machineIds: ["m-leg-curl"] };
    await mount({ routines: [A, B], isBActive: true, toggles });
    expect(document.body.querySelector('[aria-label="Turn Routine B off"]')).not.toBeNull();
  });

  it("says a read that hasn't answered, or failed, and offers nothing", async () => {
    await mount({ routines: [], host: hostOf({ status: "loading" }) });
    expect(text()).toContain("Reading Michael's routines…");
    expect(has(/^Save/)).toBe(false);
  });

  it("asks the signed-in person to sign in again before anything saves", async () => {
    await mount({ routines: [A], host: hostOf({ who: null }) });
    await tap("Chest Press");
    expect(button("Save Routine A").disabled).toBe(true);
    expect(text()).toContain("Sign in again to save a routine.");
  });
});
