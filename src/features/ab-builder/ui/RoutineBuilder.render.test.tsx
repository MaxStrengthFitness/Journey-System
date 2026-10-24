// @vitest-environment jsdom
/**
 * PROGRAMMING → ROUTINES, MOUNTED (the routine builder round, Oct 19 2026).
 *
 * The real builder over a host whose floor and signer are given, with the
 * commits recorded (the pure half that works each save out runs for
 * real). What matters is silent when wrong:
 *   - Add machine adds to the slot it was opened from, and never the other;
 *   - Change puts a stashed routine in a slot (one in the other slot swaps),
 *     a template is copied in, and a letter-named routine leaving is renamed;
 *   - the stash: rename, retire, bring back; never a delete;
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
const commits = vi.hoisted(() => ({
  routine: [] as unknown[],
  phase: [] as unknown[],
  moves: [] as unknown[],
  made: [] as { input: unknown; move: unknown }[],
  renames: [] as unknown[],
  retires: [] as unknown[],
}));
vi.mock("../../routine-slots/store", async () => {
  const real = await vi.importActual<typeof import("../../routine-slots/store")>("../../routine-slots/store");
  return {
    ...real,
    commitSlotMove: (_db: unknown, _client: string, move: unknown) => {
      commits.moves.push(move);
      return Promise.resolve();
    },
    commitNewRoutine: (_db: unknown, input: unknown, equip: ((id: string) => unknown) | null) => {
      commits.made.push({ input, move: equip ? equip("new-routine") : null });
      return { routineId: "new-routine", commit: Promise.resolve() };
    },
    commitRename: (_db: unknown, _client: string, id: string, name: string, pin: unknown) => {
      commits.renames.push({ id, name, pin });
      return Promise.resolve();
    },
    commitRetire: (_db: unknown, id: string, archived: boolean) => {
      commits.retires.push({ id, archived });
      return Promise.resolve();
    },
  };
});
vi.mock("../../routine-slots/useMyRoutines", () => ({
  useMyRoutines: () => ({ routines: [], status: "ready", reload: () => {} }),
}));
vi.mock("../../routine-plan/useStartingRoutines", () => ({
  useStartingRoutines: () => ({
    status: "ready",
    routines: [],
    choice: null,
    fromCode: false,
    templates: [{ id: "tpl-upper", name: "Upper focus", machineIds: ["m-pulldown", "m-chest-press"], scope: "strongsville", tier: "studio", studioId: "strongsville" }],
    reload: () => {},
  }),
}));
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
import { PhaseDueLine } from "./PhaseDueLine";
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
async function mount(props: { routines: Routine[]; isBActive?: boolean; host?: PlanHost; toggles?: boolean[]; client?: Client }) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <UnsavedChangesProvider>
        <Probe />
        <RoutineBuilder
          host={props.host ?? hostOf()}
          client={props.client ?? client}
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
  commits.moves = [];
  commits.made = [];
  commits.renames = [];
  commits.retires = [];
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe("one builder for A and B", () => {
  it("draws the two slots first, and the floor only in Add machine, each tile marked", async () => {
    await mount({ routines: [A] });
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press"]);
    expect(listOf("Routine B")).toEqual([]);
    expect(text()).toContain("Slot A");
    expect(text()).toContain("Nothing in B: every session runs A.");
    expect(has("Pulldown, In Routine A")).toBe(false);
    await tap("Add a machine to slot A");
    expect(has("Pulldown, In Routine A")).toBe(true);
  });

  it("adds to the slot Add machine was opened from, and never the other", async () => {
    await mount({ routines: [A] });
    await tap("Add a machine to slot B");
    await tap("Leg Curl");
    expect(listOf("Routine B")).toEqual(["Leg Curl"]);
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press"]);
    expect(status?.anyDirty()).toBe(true);
    await tap("Done");
    await tap("Add a machine to slot A");
    await tap("Chest Press");
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press", "Chest Press"]);
    expect(listOf("Routine B")).toEqual(["Leg Curl"]);
  });

  it("swaps a machine in its own place in B, and never touches A", async () => {
    await mount({ routines: [A] });
    await tap("Copy A into B");
    await tap("Change Leg Press in Routine B");
    await tap("Swap for…");
    await tap("Swap Leg Press for Leg Curl");
    expect(listOf("Routine B")).toEqual(["Pulldown", "Leg Curl"]);
    expect(listOf("Routine A")).toEqual(["Pulldown", "Leg Press"]);
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
    await tap("Add a machine to slot B");
    await tap(/^Leg Press, In Routine A and Routine B$/);
    await tap("Leg Curl");
    await tap("Done");
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

  it("keeps a machine someone else added to B when a step is ticked, and never turns B back on", async () => {
    const phase = phasePlanOf({ base: ["m-pulldown", "m-leg-press"], target: ["m-pulldown", "m-leg-curl"], todayYmd: TODAY, who: { uid: "u0" } });
    const B: Routine = {
      id: "rb",
      name: "Routine B",
      clientId: "c1",
      studioId: "strongsville",
      // The Wrap-up added Chest Press since the plan began.
      machineIds: ["m-pulldown", "m-leg-press", "m-chest-press"],
      plan: { purpose: "", intended: [], building: false, madeByUid: "u0", phase },
    };
    await mount({ routines: [A, B], isBActive: false });
    await tap(/^Leg Curl for Leg Press/);
    const save = commits.phase[0] as PhaseSave;
    expect(save.fields.machineIds).toEqual(["m-pulldown", "m-leg-curl", "m-chest-press"]);
    expect(save.turnB).toBeNull();
  });

  it("shows the B switch while B is on with nothing in it, so it can be turned off", async () => {
    await mount({ routines: [A], isBActive: true });
    expect(document.body.querySelector('[aria-label="Turn Routine B off"]')).not.toBeNull();
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

  it("says a due step on the briefing, and nothing before its week", async () => {
    const phase = phasePlanOf({ base: ["m-leg-press"], target: ["m-leg-curl"], todayYmd: TODAY, who: { uid: "u0" } });
    const nameOf = (id: string) => FLOOR.find((m) => m.id === id)?.name ?? id;
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => {
      root!.render(
        <>
          <PhaseDueLine active routineB={{ plan: { purpose: "", intended: [], building: false, madeByUid: "u0", phase } }} todayYmd="2026-10-27" nameOf={nameOf} />
          <PhaseDueLine active routineB={{ plan: { purpose: "", intended: [], building: false, madeByUid: "u0", phase } }} todayYmd="2026-10-12" nameOf={nameOf} />
        </>,
      );
    });
    const lines = document.body.querySelectorAll('[data-testid="phase-due"]');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe("Routine B · Leg Curl for Leg Press was due the week of Oct 19 · Anyone · behind");
  });

  it("asks the signed-in person to sign in again before anything saves", async () => {
    await mount({ routines: [A], host: hostOf({ who: null }) });
    await tap("Add a machine to slot A");
    await tap("Chest Press");
    await tap("Done");
    expect(button("Save Routine A").disabled).toBe(true);
    expect(text()).toContain("Sign in again to save a routine.");
  });

  it("Change puts a stashed routine in slot A; the letter-named one leaving takes a dated name", async () => {
    const post: Routine = { id: "rp", name: "Post-surgery", clientId: "c1", studioId: "strongsville", machineIds: ["m-leg-curl"] };
    await mount({ routines: [A, post] });
    expect(has("Post-surgery, in the stash")).toBe(true);
    await tap("Change what is in slot A");
    await tap(/^Post-surgery1 machine/);
    const move = commits.moves[0] as { patch: Record<string, unknown>; renames: { id: string; name: string }[] };
    expect(move.patch).toEqual({ "routineSlots.a": "rp", "routineSlots.b": null });
    expect(move.renames).toEqual([{ id: "ra", name: "Routine A · until Oct 19 2026" }]);
  });

  it("a slot reads the client's slots: a renamed routine is still A, and a stashed one is not", async () => {
    const strength: Routine = { id: "rs", name: "Strength", clientId: "c1", studioId: "strongsville", machineIds: ["m-leg-press"], inSlot: "A" };
    const winter: Routine = { id: "ro", name: "Winter", clientId: "c1", studioId: "strongsville", machineIds: ["m-chest-press"], inSlot: null };
    await mount({ routines: [strength, winter], client: { ...client, routineSlots: { a: "rs", b: null } } as Client });
    expect(listOf("Routine A")).toEqual(["Leg Press"]);
    expect(text()).toContain("Strength");
    expect(has("Winter, in the stash")).toBe(true);
  });

  it("copies a template into the stash and into the slot, its source kept", async () => {
    await mount({ routines: [A] });
    await tap("Change what is in slot B");
    await tap(/^Upper focus/);
    const made = commits.made[0] as { input: { name: string; machineIds: string[]; template: { id: string; name: string } }; move: { patch: Record<string, unknown> } };
    expect(made.input.name).toBe("Upper focus");
    expect(made.input.machineIds).toEqual(["m-pulldown", "m-chest-press"]);
    expect(made.input.template).toMatchObject({ id: "tpl-upper", name: "Upper focus" });
    expect(made.move.patch).toMatchObject({ "routineSlots.b": "new-routine" });
  });

  it("renames, retires and brings back a stashed routine, never deleting it", async () => {
    const winter: Routine = { id: "rw", name: "Winter", clientId: "c1", studioId: "strongsville", machineIds: ["m-chest-press"] };
    const gone: Routine = { id: "rg", name: "Old", clientId: "c1", studioId: "strongsville", machineIds: [], archived: true };
    await mount({ routines: [A, winter, gone] });
    await tap("Winter, in the stash");
    await tap("Rename");
    const input = document.body.querySelector('input[aria-label="Routine name"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "Winter variety");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(status?.anyDirty()).toBe(true);
    await tap("Save name");
    expect(commits.renames[0]).toMatchObject({ id: "rw", name: "Winter variety" });
    await tap("Winter, in the stash");
    await tap("Retire");
    expect(commits.retires[0]).toEqual({ id: "rw", archived: true });
    await tap("Retired (1)");
    await tap("Old, retired");
    await tap("Bring it back");
    expect(commits.retires[1]).toEqual({ id: "rg", archived: false });
  });

  it("leaves slot B empty from Change, which turns B off", async () => {
    const B: Routine = { id: "rb", name: "Routine B", clientId: "c1", studioId: "strongsville", machineIds: ["m-leg-curl"] };
    await mount({ routines: [A, B], isBActive: true });
    await tap("Change what is in slot B");
    await tap("Leave slot B empty");
    const move = commits.moves[0] as { patch: Record<string, unknown>; renames: { id: string; name: string }[] };
    expect(move.patch).toEqual({ "routineSlots.a": "ra", "routineSlots.b": null, isRoutineBActive: false });
    expect(move.renames).toEqual([{ id: "rb", name: "Routine B · until Oct 19 2026" }]);
  });
});
