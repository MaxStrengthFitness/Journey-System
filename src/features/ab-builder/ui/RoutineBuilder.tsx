/**
 * PROGRAMMING → ROUTINES: the client's two equipped routines and their stash
 * (the routine library round, Oct 23 2026; docs/rounds/2026-10-20-routine-library.md
 * §2 and §10, over the one A+B builder of Oct 19).
 *
 * AJ, Oct 20: "the routine builder is a mess … I want to be able to create a
 * routine, rotate routines in and out and possibly name the routines". Oct 23:
 * each client has a stash of named routines and two equipped at once, slot A
 * and slot B, "both full weapons", alternating session to session.
 *
 * - Two slot cards first, each with its routine's name (Rename), What it's
 *   for, its machines in order and its own Save. Add machine opens this
 *   studio's floor as a sheet and adds to the slot it was opened from; each
 *   tile still says which slot holds it.
 * - Change puts another routine in a slot: one from the stash (one in the
 *   other slot swaps places), a starting routine or a template copied in, or a
 *   new one. What leaves goes to the stash, kept as it is.
 * - The stash is one row of names under the slots; Retire hides one under
 *   Retired, never deletes it.
 * - A routine is built whole, and nothing moves it but a person. A B saved
 *   while B is off is PLANNED (§10.2): it starts when a trainer phases it in
 *   from Routine A, or, where the studio allows it, switches it on whole.
 *   Either slot can be phased in toward what is on screen (AJ: "after
 *   building either one, you can choose to phase any of it in").
 *
 * Every save is issued and never awaited (`../store.ts`,
 * `../../routine-slots/store.ts`); a refusal comes back through `onError`.
 * What is typed and not saved is registered as unsaved work.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, BookmarkPlus, Check, ClipboardList, Copy, History, Layers, Pencil, Plus, Undo2 } from "lucide-react";
import type { Client, Machine, Routine, RoutineAdjustment, Trainer } from "../../../types";
import { db } from "../../../firebase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChanges } from "../../unsaved-changes";
import { cantDoActive } from "../../routine-plan/cant-do";
import { effectsAbove, floorByFamily, planFromRoutine, signedChange, takenOut as takenOutOfPlan, writeOf } from "../../routine-plan/lineup";
import { applyPlanChange } from "../../routine-plan/plan";
import { floorMachinesOf, machineNamer, savedRoutineA, savedRoutineB, type PlanHost } from "../../routine-plan/ui/host";
import { Chip, LineupRow, OrderNote, PlanSheet } from "../../routine-plan/ui/parts";
import { PlanChangesList } from "../../routine-plan/ui/PlanChangesList";
import { StartFromRoutineSheet } from "../../routine-plan/ui/StartFromRoutineSheet";
import type { StartFromChoice } from "../../routine-plan/start-from";
import {
  pinPatch,
  retiredOf,
  slotMove,
  stashOf,
  uniqueName,
  nextRoutineName,
  type SlotKey,
} from "../../routine-slots/slots";
import { commitNewRoutine, commitRename, commitRetire, commitSlotMove, copyOf } from "../../routine-slots/store";
import { addedForGood, plannedOf } from "../../routine-slots/planned";
import { programmingFromPlan } from "../../routine-slots/programming";
import { saveMyRoutine, useMyRoutines } from "../../routine-slots/useMyRoutines";
import { myRoutineFromClientRoutine } from "../../routine-slots/my-routines";
import { ChangeSlotSheet, RenameSheet, StashSheet } from "../../routine-slots/ui/SlotSheets";
import {
  copiedAIntoB,
  laidFrom,
  markOf,
  markWords,
  moved,
  sameList,
  swapped,
  takenOut,
  tapFloor,
  type Draft,
} from "../builder";
import { appliedStep, isDone, phaseOf, phasePlanOf, type PhasePlan } from "../phase";
import { commitPhaseSave, commitRoutineSave, phaseSaveOf, phaseSaveOfA, routineSaveOf, saveChanges, type Slot } from "../store";
import { useSwitchOnWhole } from "../../routine-slots/usePlannedStarts";
import { PhasePanel, PhaseSheet, type PhaseMove } from "./PhasePanel";
import "../../routine-plan/ui/routine-plan.css";
import "./ab-builder.css";

export interface RoutineBuilderProps {
  host: PlanHost;
  client: Client | null | undefined;
  clientId: string;
  routines: readonly Routine[];
  /** Every machine the app knows, so a routine machine off this floor keeps its name. */
  machines: readonly Machine[];
  isBActive: boolean;
  trainers: readonly Trainer[];
  adjustments: readonly RoutineAdjustment[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  /** The routine the next session runs (routines/next-routine.ts), marked on its slot. */
  nextRoutineId?: string | null;
  /** The profile's B switch: the reason asked, never required. */
  onToggleB: (on: boolean) => void;
  /** A refused save, in a sentence. */
  onError?: (message: string) => void;
  /** A save that went through and is worth saying (Save as my routine). */
  onNotice?: (message: string) => void;
  disabled?: boolean;
}

const KEY_OF_SLOT: Record<Slot, SlotKey> = { "Routine A": "a", "Routine B": "b" };
const LETTER: Record<Slot, "A" | "B"> = { "Routine A": "A", "Routine B": "B" };

export function RoutineBuilder({
  host,
  client,
  clientId,
  routines,
  machines,
  isBActive,
  trainers,
  adjustments,
  authTrainer,
  activeStudioId,
  nextRoutineId = null,
  onToggleB,
  onError,
  onNotice,
  disabled = false,
}: RoutineBuilderProps) {
  const first = client?.firstName?.trim() || "the client";
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const nameOf = useMemo(() => machineNamer(host.floor, machines), [host.floor, machines]);
  const savedA = savedRoutineA(routines);
  const savedB = savedRoutineB(routines);
  const slots = client?.routineSlots;
  const studioId = client?.homeStudioId || activeStudioId || host.studioId || "";
  const who = host.who;
  const ready = host.status === "ready";
  const trainerId = authTrainer?.id || "unknown";

  const [draftA, setDraftA] = useState<string[] | null>(null);
  const [draftB, setDraftB] = useState<string[] | null>(null);
  const [purposeA, setPurposeA] = useState<string | null>(null);
  const [purposeB, setPurposeB] = useState<string | null>(null);
  const [whyA, setWhyA] = useState("");
  const [whyB, setWhyB] = useState("");
  /**
   * What was just saved, held until the live read brings it back, so the
   * screen never shows the old list in between, and a tap meanwhile builds
   * on what was saved rather than on the list before it (the review, Oct 19
   * 2026). Cleared when the routine matches it, or the save is refused.
   */
  const [pendingA, setPendingA] = useState<{ ids: string[]; purpose: string } | null>(null);
  const [pendingB, setPendingB] = useState<{ ids: string[]; purpose: string } | null>(null);
  const [addFor, setAddFor] = useState<Slot | null>(null);
  /** The Add machine sheet adds to the routine now, or plans a machine for later (§10.2). */
  const [addMode, setAddMode] = useState<"now" | "later">("now");
  const [startFor, setStartFor] = useState<Slot | null>(null);
  const [changeFor, setChangeFor] = useState<SlotKey | null>(null);
  const [stashed, setStashed] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  /** A phase-in plan being made or changed, and the slot it is for (either slot since the routine library round). */
  const [phaseDraft, setPhaseDraft] = useState<{ slot: "A" | "B"; plan: PhasePlan } | null>(null);
  // How a planned routine starts at this studio: phased in, or (where the studio allows it) switched on whole (§10.2).
  const switchWhole = useSwitchOnWhole(studioId || null);
  const [changesOf, setChangesOf] = useState<Slot | null>(null);
  // The trainer's own routines, read only while Change is open.
  const mine = useMyRoutines(who?.uid ?? null, { enabled: changeFor !== null });

  // Another client is another builder: nothing carries over.
  const lastClient = useRef(clientId);
  useEffect(() => {
    if (lastClient.current === clientId) return;
    lastClient.current = clientId;
    setDraftA(null);
    setDraftB(null);
    setPurposeA(null);
    setPurposeB(null);
    setWhyA("");
    setWhyB("");
    setPendingA(null);
    setPendingB(null);
    setAddFor(null);
    setStartFor(null);
    setChangeFor(null);
    setStashed(null);
    setRenaming(null);
    setShowRetired(false);
    setPhaseDraft(null);
    setChangesOf(null);
  }, [clientId]);

  const savedPurposeA = (savedA?.plan?.purpose ?? "").trim();
  const savedPurposeB = (savedB?.plan?.purpose ?? "").trim();
  useEffect(() => {
    if (pendingA && sameList(pendingA.ids, savedA?.machineIds ?? []) && pendingA.purpose === savedPurposeA) setPendingA(null);
  }, [pendingA, savedA?.machineIds, savedPurposeA]);
  useEffect(() => {
    if (pendingB && sameList(pendingB.ids, savedB?.machineIds ?? []) && pendingB.purpose === savedPurposeB) setPendingB(null);
  }, [pendingB, savedB?.machineIds, savedPurposeB]);

  const baseA = pendingA ?? { ids: savedA?.machineIds ?? [], purpose: savedPurposeA };
  const baseB = pendingB ?? { ids: savedB?.machineIds ?? [], purpose: savedPurposeB };
  const draft: Draft = { a: draftA ?? baseA.ids, b: draftB ?? baseB.ids };
  const pA = purposeA ?? baseA.purpose;
  const pB = purposeB ?? baseB.purpose;
  const dirtyA = !sameList(baseA.ids, draft.a) || baseA.purpose !== pA.trim();
  const dirtyB = !sameList(baseB.ids, draft.b) || baseB.purpose !== pB.trim();
  const phase = phaseOf(savedB?.plan?.phase);
  const phaseA = phaseOf(savedA?.plan?.phase);

  const resetA = () => {
    setDraftA(null);
    setPurposeA(null);
    setWhyA("");
  };
  const resetB = () => {
    setDraftB(null);
    setPurposeB(null);
    setWhyB("");
  };
  const unsaved = useUnsavedChanges(dirtyA || dirtyB, `${first}'s routines`, {
    onDiscard: () => {
      resetA();
      resetB();
    },
  });

  // What the client can't do, kept on Routine A's plan and read by A and B: shown, never offered.
  const held = useMemo(
    () => (savedA?.plan?.cantDo ?? []).filter((c) => cantDoActive(c, host.todayYmd)).map((c) => c.machineId),
    [savedA?.plan?.cantDo, host.todayYmd],
  );

  const apply = (next: Draft) => {
    if (!sameList(next.a, draft.a)) setDraftA([...next.a]);
    if (!sameList(next.b, draft.b)) setDraftB([...next.b]);
  };

  const save = (slot: Slot) => {
    if (!who || disabled) return;
    const isA = slot === "Routine A";
    const ids = [...(isA ? draft.a : draft.b)];
    const purpose = (isA ? pA : pB).trim();
    // Not changed since it was saved: compared with the routine as saved, so the pending list is never written twice.
    if (!saveChanges(isA ? savedA : savedB, ids, purpose)) {
      if (isA) resetA();
      else resetB();
      return;
    }
    const s = routineSaveOf({
      slot,
      routine: isA ? savedA : savedB,
      routines,
      clientId,
      studioId,
      trainerId,
      who,
      todayYmd: host.todayYmd,
      machineIds: ids,
      purpose,
      why: isA ? whyA : whyB,
      isBActive,
    });
    const { commit } = commitRoutineSave(db, s);
    const setPending = isA ? setPendingA : setPendingB;
    setPending({ ids, purpose });
    commit.catch(() => {
      setPending(null);
      onError?.(`Couldn't save ${slot}. Try again.`);
    });
    if (isA) resetA();
    else resetB();
    if (!(isA ? dirtyB : dirtyA)) unsaved.release();
  };

  /* ── The stash and the slots ────────────────────────────────────────── */

  const by = {
    trainerId,
    studioId,
    machinesOf: (id: string) => routines.find((r) => r.id === id)?.machineIds ?? [],
    // What the client can't do and their focus, as slot A holds them now: onto the client before another routine takes slot A (§10.4).
    programming: who ? { prog: programmingFromPlan(savedA?.plan), uid: who.uid } : null,
  };
  /** A slot's unsaved draft is let go when another routine goes into it: it was a draft of the routine leaving. */
  const dropDraft = (key: SlotKey) => {
    if (key === "a") {
      resetA();
      setPendingA(null);
    } else {
      resetB();
      setPendingB(null);
    }
  };
  const equip = (key: SlotKey, routineId: string | null) => {
    if (disabled) return;
    const move = slotMove(routines, slots, key, routineId, isBActive, host.todayYmd);
    if (move.after.a !== (savedA?.id ?? null)) dropDraft("a");
    if (move.after.b !== (savedB?.id ?? null)) dropDraft("b");
    commitSlotMove(db, clientId, move, by).catch(() => onError?.("Couldn't change the slot. Try again."));
  };
  const copyIn = (key: SlotKey, input: { name: string; machineIds: string[]; template?: { id: string; name: string; machineIds: string[] } | null; machineNotes?: Record<string, string> }) => {
    if (disabled) return;
    dropDraft(key);
    const { commit } = commitNewRoutine(
      db,
      { clientId, studioId, trainerId, name: uniqueName(input.name, routines), machineIds: input.machineIds, template: input.template ?? null, machineNotes: input.machineNotes },
      (newId) => slotMove([...routines, { id: newId, name: input.name, clientId, machineIds: input.machineIds }], slots, key, newId, isBActive, host.todayYmd),
      by.programming,
    );
    commit.catch(() => onError?.("Couldn't make the routine. Try again."));
  };
  const fromChoice = (key: SlotKey, c: StartFromChoice) => {
    const id = c.key.slice(c.key.indexOf(":") + 1);
    copyIn(key, { name: c.label, machineIds: [...c.machineIds], template: { id, name: c.label, machineIds: [...c.machineIds] } });
  };
  const newRoutine = (key: SlotKey, from: "copy" | "blank") => {
    const here = key === "a" ? savedA : savedB;
    if (from === "copy" && here) copyIn(key, { name: `Copy of ${here.name}`, ...copyOf(here), machineIds: [...here.machineIds] });
    else copyIn(key, { name: nextRoutineName(routines), machineIds: [] });
  };
  const rename = (routineId: string, name: string) => {
    commitRename(db, clientId, routineId, name, pinPatch(routines, slots)).catch(() => onError?.("Couldn't rename the routine. Try again."));
  };
  /*
   * Planned, not active (§10.2): a machine on a routine's plan and not in it
   * yet. Planned and unplanned on the plan alone; Add now joins it to the
   * routine for good, the plan's own "add now". Each one ONE write through the
   * profile's plan actions, never awaited.
   */
  const planLater = (routine: Routine, id: string, on: boolean) => {
    if (!who || disabled || !routine.id) return;
    const plan = routine.plan ?? planFromRoutine(routine.machineIds, who, host.todayYmd, routine.plan?.purpose ?? "");
    if (on) {
      if (plan.intended.includes(id)) return;
      const change = { kind: "add" as const, machineIds: [id] };
      host.actions.save(routine.id, { plan: applyPlanChange(plan, change), change: signedChange(change, who) });
    } else {
      if (!plan.intended.includes(id) || routine.machineIds.includes(id)) return;
      host.actions.save(routine.id, writeOf(takenOutOfPlan(plan, routine.machineIds, id, "plan"), routine.machineIds, who));
    }
  };
  const addForGood = (routine: Routine, id: string) => {
    if (!who || disabled || !routine.id) return;
    const w = addedForGood(routine, [id], who, host.todayYmd);
    if (w) host.actions.save(routine.id, w);
  };
  /** One of the client's routines saved as the trainer's own (§10.3), never awaited. */
  const saveAsMine = (routine: Routine) => {
    if (!who || !studioId) return;
    const { commit } = saveMyRoutine(myRoutineFromClientRoutine(routine), who, studioId);
    commit.then(() => onNotice?.(`Saved "${routine.name}" to My routines.`)).catch(() => onError?.("Couldn't save it to My routines. Try again."));
  };
  const retire = (routineId: string, archived: boolean) => {
    commitRetire(db, routineId, archived).catch(() => onError?.(archived ? "Couldn't retire the routine. Try again." : "Couldn't bring the routine back. Try again."));
  };

  /*
   * A planned B (§10.2): saved with machines while B is off. AJ: "A full B
   * can be planned well in advance; when the trainer chooses, they go into B,
   * turn it on and phase it in". It phases in from Routine A as saved toward
   * the B that was planned.
   */
  const plannedB = !isBActive && !!savedB && savedB.machineIds.length > 0 && !phase;
  // Where B starts phasing in from: Routine A for a planned B; else B as saved, or a copy of Routine A as saved when B has nothing (never A's unsaved draft).
  const phaseBase = plannedB ? (savedA?.machineIds ?? []) : savedB && savedB.machineIds.length > 0 ? savedB.machineIds : (savedA?.machineIds ?? []);
  const canPhase = !phase && !plannedB && phaseBase.length > 0 && draft.b.length > 0 && !sameList(phaseBase, draft.b) && dirtyB;
  const canPhasePlanned = plannedB && !dirtyB && phaseBase.length > 0 && !sameList(phaseBase, savedB!.machineIds);
  // Slot A phased in too (AJ: "after building either one, you can choose to phase any of it in"): from A as saved toward the A on screen.
  const canPhaseA = !phaseA && !!savedA && savedA.machineIds.length > 0 && draft.a.length > 0 && dirtyA && !sameList(savedA.machineIds, draft.a);

  /** A phase plan on slot A saved: a tick is A's own save (its road kept), anything else `plan.phase` alone. */
  const savePhaseA = (next: PhasePlan | null, note: string, move: PhaseMove) => {
    if (!who || disabled || !savedA) return;
    const now = savedA.machineIds;
    const machineIds =
      move.kind === "step"
        ? appliedStep(now, move.step, next?.target ?? [], move.forward)
        : move.kind === "all"
          ? move.steps.reduce<string[]>((list, st) => appliedStep(list, st, next?.target ?? []), [...now])
          : now;
    const out = phaseSaveOfA({
      routine: savedA,
      routines,
      clientId,
      studioId,
      trainerId,
      who,
      todayYmd: host.todayYmd,
      phase: next,
      machineIds,
      note,
      isBActive,
    });
    const commit = out.routine ? commitRoutineSave(db, out.routine).commit : commitPhaseSave(db, out.phase!, clientId).commit;
    commit.catch(() => onError?.(`Couldn't save ${savedA.name}'s phase-in plan. Try again.`));
  };

  /**
   * A phase plan saved. B's machines are worked out from B as it stands now,
   * never rebuilt from the plan's base, so a change someone else made to B
   * since (the Wrap-up, the Edit routine drawer) is kept.
   */
  const savePhase = (next: PhasePlan | null, note: string, move: PhaseMove) => {
    if (!who || disabled) return;
    const now = savedB?.machineIds ?? [];
    const machineIds =
      move.kind === "start"
        ? phaseBase
        : move.kind === "step"
          ? appliedStep(now, move.step, next?.target ?? [], move.forward)
          : move.kind === "all"
            ? move.steps.reduce<string[]>((list, s) => appliedStep(list, s, next?.target ?? []), [...now])
            : now;
    const s = phaseSaveOf({
      routine: savedB,
      clientId,
      studioId,
      trainerId,
      who,
      todayYmd: host.todayYmd,
      phase: next,
      machineIds,
      starting: move.kind === "start",
      purpose: pB,
      note,
      isBActive,
    });
    const { commit } = commitPhaseSave(db, s, clientId);
    commit.catch(() => onError?.("Couldn't save Routine B's phase-in plan. Try again."));
  };
  if (host.status === "loading") {
    return (
      <section className="rpl-panel" aria-busy="true">
        <p className="rpl-line">Reading {first}'s routines…</p>
      </section>
    );
  }
  if (host.status === "failed") {
    return (
      <section className="rpl-panel">
        <p className="rpl-line">Couldn't read {first}'s routines just now. Try again in a moment.</p>
      </section>
    );
  }

  const signIn = !who ? <p className="rpl-meta">Sign in again to save a routine.</p> : null;
  const stash = stashOf(routines, slots);
  const retired = retiredOf(routines);
  const stashRoutine = stashed ? (routines.find((r) => r.id === stashed) ?? null) : null;
  const renameRoutine = renaming ? (routines.find((r) => r.id === renaming) ?? null) : null;
  const realA = savedA && !savedA.id?.startsWith("temp-") ? savedA : null;
  const realB = savedB && !savedB.id?.startsWith("temp-") ? savedB : null;

  return (
    <div className="rpl abb" data-disabled={disabled || undefined}>
      <div className="abb-slots">
        <RoutineCard
          slot="Routine A"
          routine={realA}
          next={!!realA && realA.id === nextRoutineId}
          held={held}
          first={first}
          ids={draft.a}
          nameOf={nameOf}
          floor={floor}
          purpose={pA}
          onPurpose={setPurposeA}
          why={whyA}
          onWhy={setWhyA}
          dirty={dirtyA}
          canSave={dirtyA && !!who && ready && !disabled}
          onChange={setDraftA}
          onSave={() => save("Routine A")}
          onUndo={resetA}
          onAdd={() => setAddFor("Routine A")}
          onStartFrom={() => setStartFor("Routine A")}
          onSwapSlot={() => setChangeFor("a")}
          onRename={realA?.id ? () => setRenaming(realA.id!) : undefined}
          onSaveAsMine={who && realA && realA.machineIds.length > 0 ? () => saveAsMine(realA) : undefined}
          onChanges={realA?.id ? () => setChangesOf("Routine A") : undefined}
          planned={plannedOf(realA, host.todayYmd)}
          onPlannedNow={realA && !dirtyA ? (id) => addForGood(realA, id) : undefined}
          onPlannedOff={realA ? (id) => planLater(realA, id, false) : undefined}
          middle={
            phaseA ? (
              <PhasePanel
                phase={phaseA}
                nameOf={nameOf}
                todayYmd={host.todayYmd}
                who={who}
                disabled={disabled}
                editing={dirtyA}
                onSave={savePhaseA}
                onChange={() => setPhaseDraft({ slot: "A", plan: phaseA })}
                routineName={realA?.name || "Routine A"}
              />
            ) : null
          }
          extra={
            canPhaseA ? (
              <Button
                variant="outline"
                onClick={() => who && savedA && setPhaseDraft({ slot: "A", plan: phasePlanOf({ base: savedA.machineIds, target: draft.a, todayYmd: host.todayYmd, who }) })}
                disabled={!who || disabled}
              >
                <Layers aria-hidden="true" />
                Phase it in
              </Button>
            ) : null
          }
          disabled={disabled}
          foot={signIn}
        />

        <RoutineCard
          slot="Routine B"
          routine={realB}
          next={!!realB && realB.id === nextRoutineId}
          held={held}
          first={first}
          ids={draft.b}
          nameOf={nameOf}
          floor={floor}
          purpose={pB}
          onPurpose={setPurposeB}
          why={whyB}
          onWhy={setWhyB}
          dirty={dirtyB}
          canSave={dirtyB && !!who && ready && !disabled}
          onChange={setDraftB}
          onSave={() => save("Routine B")}
          onUndo={resetB}
          onAdd={() => setAddFor("Routine B")}
          onStartFrom={() => setStartFor("Routine B")}
          onSwapSlot={() => setChangeFor("b")}
          onRename={realB?.id ? () => setRenaming(realB.id!) : undefined}
          onSaveAsMine={who && realB && realB.machineIds.length > 0 ? () => saveAsMine(realB) : undefined}
          onChanges={realB?.id ? () => setChangesOf("Routine B") : undefined}
          planned={plannedOf(realB, host.todayYmd)}
          onPlannedNow={realB && !dirtyB ? (id) => addForGood(realB, id) : undefined}
          onPlannedOff={realB ? (id) => planLater(realB, id, false) : undefined}
          disabled={disabled}
          head={
            // B's switch: B on (the way to turn it off), or B with machines where the studio lets a planned routine switch on whole.
            isBActive || (switchWhole && savedB && savedB.machineIds.length > 0) ? (
              <label className="rt-switch abb-switch">
                <span>{isBActive ? "B on" : "B off"}</span>
                <Switch
                  checked={isBActive}
                  disabled={disabled}
                  onCheckedChange={onToggleB}
                  aria-label={isBActive ? "Turn Routine B off" : "Turn Routine B on"}
                />
              </label>
            ) : null
          }
          empty={
            draft.a.length > 0 ? (
              <Button variant="outline" onClick={() => setDraftB([...copiedAIntoB(draft).b])} disabled={disabled}>
                <Copy aria-hidden="true" />
                Copy A into B
              </Button>
            ) : null
          }
          middle={
            phase ? (
              <PhasePanel
                phase={phase}
                nameOf={nameOf}
                todayYmd={host.todayYmd}
                who={who}
                disabled={disabled}
                editing={dirtyB}
                onSave={savePhase}
                onChange={() => setPhaseDraft({ slot: "B", plan: phase })}
                routineName={realB?.name || "Routine B"}
              />
            ) : plannedB ? (
              <p className="rpl-line" data-testid="planned-b">
                Planned · B is off, so every session runs A. {switchWhole ? "Phase it in, or switch it on." : "Phase it in to start it."}
              </p>
            ) : null
          }
          extra={
            canPhase || canPhasePlanned ? (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    who && setPhaseDraft({ slot: "B", plan: phasePlanOf({ base: phaseBase, target: canPhasePlanned ? savedB!.machineIds : draft.b, todayYmd: host.todayYmd, who }) })
                  }
                  disabled={!who || disabled}
                >
                  <Layers aria-hidden="true" />
                  {canPhasePlanned ? "Phase B in" : "Phase it in"}
                </Button>
              </>
            ) : null
          }
          foot={signIn}
        />
      </div>

      <section className="rpl-panel abb-stash" aria-label={`${first}'s stash`}>
        <div className="abb-stash__head">
          <h3 className="rpl-panel__title">Stash</h3>
          {retired.length > 0 && (
            <Button variant="ghost" aria-expanded={showRetired} onClick={() => setShowRetired((o) => !o)}>
              Retired ({retired.length})
            </Button>
          )}
        </div>
        {stash.length === 0 ? (
          <p className="rpl-meta">Routines {first} isn't running now wait here. Change on a slot puts one away or brings one back.</p>
        ) : (
          <div className="rpl-chips">
            {stash.map((r) => (
              <Chip key={r.id} label={`${r.name}, in the stash`} onClick={() => setStashed(r.id!)}>
                {r.name}
              </Chip>
            ))}
          </div>
        )}
        {showRetired && retired.length > 0 && (
          <div className="rpl-chips" aria-label="Retired routines">
            {retired.map((r) => (
              <Chip key={r.id} label={`${r.name}, retired`} onClick={() => setStashed(r.id!)}>
                {r.name}
              </Chip>
            ))}
          </div>
        )}
      </section>

      {addFor && (() => {
        const target = addFor === "Routine A" ? realA : realB;
        const later = addMode === "later" && !!target?.id;
        const plannedHere = later ? plannedOf(target, host.todayYmd) : [];
        return (
          <PlanSheet
            open
            title={`Add to ${target?.name ?? (addFor === "Routine A" ? "slot A" : "slot B")}`}
            meta={
              later
                ? "Tap a machine to plan it for this routine. It shows as planned on the briefing and in the session, and runs once someone adds it."
                : "Tap a machine to add it, or tap it again to take it out. Save on the slot keeps it."
            }
            onClose={() => {
              setAddFor(null);
              setAddMode("now");
            }}
            footer={
              <Button
                onClick={() => {
                  setAddFor(null);
                  setAddMode("now");
                }}
              >
                <Check aria-hidden="true" />
                Done
              </Button>
            }
          >
            <div className="rpl-chips" role="group" aria-label="Add or plan">
              <Chip on={addMode === "now"} onClick={() => setAddMode("now")}>
                Add now
              </Chip>
              <Chip on={addMode === "later"} onClick={() => setAddMode("later")} disabled={!target?.id || !who}>
                Plan for later
              </Chip>
            </div>
            {addMode === "later" && !target?.id && <p className="rpl-meta">Save this slot's routine first, then plan machines for it.</p>}
            <FloorTiles
              floor={floor}
              draft={draft}
              target={LETTER[addFor]}
              held={held}
              first={first}
              nameOf={nameOf}
              disabled={disabled}
              planned={later ? plannedHere : null}
              onTap={(id) => {
                if (later && target) planLater(target, id, !plannedHere.includes(id));
                else apply(tapFloor(draft, id, LETTER[addFor]));
              }}
            />
          </PlanSheet>
        );
      })()}

      {startFor && (
        <StartFromRoutineSheet
          onClose={() => setStartFor(null)}
          studioId={host.studioId}
          studioName={host.studioName}
          floor={floor}
          nameOf={nameOf}
          todayYmd={host.todayYmd}
          clientRoutines={routines}
          firstName={client?.firstName ?? null}
          onLay={(ids) => {
            apply(laidFrom(draft, ids, LETTER[startFor]));
            setStartFor(null);
          }}
        />
      )}

      {changeFor && (
        <ChangeSlotSheet
          slot={changeFor}
          first={first}
          routines={routines}
          slots={slots}
          nameOf={nameOf}
          floor={floor}
          studioId={host.studioId}
          studioName={host.studioName}
          todayYmd={host.todayYmd}
          myRoutines={mine.routines}
          onClose={() => setChangeFor(null)}
          onEquip={(id) => {
            equip(changeFor, id);
            setChangeFor(null);
          }}
          onCopyIn={(c) => {
            fromChoice(changeFor, c);
            setChangeFor(null);
          }}
          onNew={(from) => {
            newRoutine(changeFor, from);
            setChangeFor(null);
          }}
        />
      )}

      {stashRoutine && (
        <StashSheet
          routine={stashRoutine}
          first={first}
          nameOf={nameOf}
          onClose={() => setStashed(null)}
          onEquip={(key) => {
            equip(key, stashRoutine.id!);
            setStashed(null);
          }}
          onRename={() => {
            setRenaming(stashRoutine.id!);
            setStashed(null);
          }}
          onRetire={(archived) => {
            retire(stashRoutine.id!, archived);
            setStashed(null);
          }}
          onSaveAsMine={
            who
              ? () => {
                  saveAsMine(stashRoutine);
                  setStashed(null);
                }
              : undefined
          }
        />
      )}

      {renameRoutine && (
        <RenameSheet
          routine={{ id: renameRoutine.id, name: renameRoutine.name }}
          routines={routines}
          onClose={() => setRenaming(null)}
          onSave={(name) => {
            rename(renameRoutine.id!, name);
            setRenaming(null);
          }}
        />
      )}

      {phaseDraft && (() => {
        const forA = phaseDraft.slot === "A";
        const running = forA ? phaseA : phase;
        const save = forA ? savePhaseA : savePhase;
        const routineName = forA ? realA?.name || "Routine A" : realB?.name || "Routine B";
        return (
        <PhaseSheet
          initial={phaseDraft.plan}
          isNew={!running}
          nameOf={nameOf}
          trainers={trainers}
          todayYmd={host.todayYmd}
          first={first}
          routineName={routineName}
          onClose={() => setPhaseDraft(null)}
          onSave={(next) => {
            const phase = running;
            const savePhase = save;
            if (phase) {
              // Weeks and owners from the sheet over the plan as it stands now, so a tick made meanwhile on another iPad is kept.
              const merged =
                phase.steps.length === next.steps.length
                  ? {
                      ...phase,
                      steps: phase.steps.map((s, i) => {
                        if (isDone(s)) return s;
                        const { ownerId: _o, ownerName: _n, ...rest } = s;
                        const from = next.steps[i];
                        return { ...rest, week: from.week, ...(from.ownerId ? { ownerId: from.ownerId, ownerName: from.ownerName } : null) };
                      }),
                    }
                  : next;
              savePhase(merged, "Phase-in plan changed", { kind: "none" });
            } else {
              savePhase(next, `Phasing ${routineName} in: ${next.steps.length} ${next.steps.length === 1 ? "step" : "steps"}`, { kind: "start" });
            }
            setPhaseDraft(null);
            if (!phase) {
              if (forA) {
                resetA();
                if (!dirtyB) unsaved.release();
              } else {
                resetB();
                if (!dirtyA) unsaved.release();
              }
            }
          }}
        />
        );
      })()}

      <PlanSheet open={changesOf !== null} title={`${changesOf === "Routine A" ? (realA?.name ?? "Routine A") : (realB?.name ?? "Routine B")} · changes`} onClose={() => setChangesOf(null)}>
        {changesOf && (changesOf === "Routine A" ? realA?.id : realB?.id) ? (
          <PlanChangesList
            routineId={(changesOf === "Routine A" ? realA?.id : realB?.id) as string}
            adjustments={adjustments}
            trainers={trainers}
            nameOf={nameOf}
            firstName={client?.firstName ?? undefined}
            todayYmd={host.todayYmd}
            read={host.actions.readChanges}
            routineName={changesOf === "Routine A" ? (realA?.name ?? "Routine A") : (realB?.name ?? "Routine B")}
          />
        ) : null}
      </PlanSheet>
    </div>
  );
}

/* ── This studio's floor, in the Add machine sheet ────────────────────── */

function FloorTiles({
  floor,
  draft,
  target,
  held,
  first,
  nameOf,
  disabled,
  planned = null,
  onTap,
}: {
  floor: ReturnType<typeof floorMachinesOf>;
  draft: Draft;
  target: "A" | "B";
  held: readonly string[];
  first: string;
  nameOf: (id: string) => string;
  disabled: boolean;
  /** Planning for later: the machines planned for the routine (a tap plans or unplans one); null while adding now. */
  planned?: readonly string[] | null;
  onTap: (id: string) => void;
}) {
  const families = floorByFamily(floor);
  if (families.length === 0) return <p className="rpl-meta">This studio's floor has no machines listed yet.</p>;
  return (
    <div className="rpl-floor abb-floor" aria-label="This studio's floor">
      {families.map((f) => (
        <div key={f.key}>
          <p className="rpl-family__label">{f.label}</p>
          <div className="rpl-tiles">
            {f.machineIds.map((id) => {
              if (held.includes(id)) {
                return (
                  <div key={id} className="rpl-tile rpl-tile--held">
                    <span className="rpl-tile__name">
                      {nameOf(id)} · not for {first}
                    </span>
                  </div>
                );
              }
              const mark = markOf(draft, id);
              const inRoutine = target === "A" ? draft.a.includes(id) : draft.b.includes(id);
              const isPlanned = !!planned && planned.includes(id);
              const inTarget = planned ? isPlanned : inRoutine;
              const said = planned ? (inRoutine ? "in the routine already" : isPlanned ? "planned" : null) : markWords(mark);
              return (
                <button
                  key={id}
                  type="button"
                  className="rpl-tile"
                  aria-pressed={inTarget}
                  aria-label={said ? `${nameOf(id)}, ${said}` : nameOf(id)}
                  onClick={() => onTap(id)}
                  disabled={disabled || (!!planned && inRoutine)}
                >
                  <span className="rpl-tile__name">{nameOf(id)}</span>
                  {mark && (
                    <span className={inTarget ? "abb-mark" : "abb-mark abb-mark--quiet"} aria-hidden="true">
                      {mark}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── One slot ─────────────────────────────────────────────────────────── */

function RoutineCard({
  slot,
  routine,
  next,
  first,
  ids,
  nameOf,
  floor,
  purpose,
  onPurpose,
  why,
  onWhy,
  dirty,
  canSave,
  onChange,
  onSave,
  onUndo,
  onAdd,
  onStartFrom,
  onSwapSlot,
  onRename,
  onSaveAsMine,
  onChanges,
  planned = [],
  onPlannedNow,
  onPlannedOff,
  disabled,
  saveWords,
  head,
  empty,
  middle,
  extra,
  foot,
  held = [],
}: {
  slot: Slot;
  /** The routine equipped here, or null while the slot has none saved. */
  routine: Routine | null;
  /** The next session runs this slot. */
  next: boolean;
  first: string;
  ids: readonly string[];
  nameOf: (id: string) => string;
  floor: ReturnType<typeof floorMachinesOf>;
  purpose: string;
  onPurpose: (v: string) => void;
  why: string;
  onWhy: (v: string) => void;
  dirty: boolean;
  canSave: boolean;
  onChange: (ids: string[]) => void;
  onSave: () => void;
  onUndo: () => void;
  onAdd: () => void;
  onStartFrom: () => void;
  onSwapSlot: () => void;
  onRename?: () => void;
  /** Saves this slot's routine to the trainer's own (My Profile → My routines). */
  onSaveAsMine?: () => void;
  onChanges?: () => void;
  /** Planned for the routine, not in it yet (§10.2), in the road's order. */
  planned?: readonly string[];
  /** Adds a planned machine to the routine for good; absent while the slot has unsaved changes. */
  onPlannedNow?: (id: string) => void;
  onPlannedOff?: (id: string) => void;
  disabled: boolean;
  saveWords?: string;
  head?: ReactNode;
  empty?: ReactNode;
  middle?: ReactNode;
  extra?: ReactNode;
  foot?: ReactNode;
  /** What the client can't do: never offered as a swap. */
  held?: readonly string[];
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const open = openRow;
  const setOpen = (id: string | null) => {
    setOpenRow(id);
    setSwapOpen(false);
  };
  const effects = useMemo(() => effectsAbove(ids, nameOf, floor), [ids, nameOf, floor]);
  const letter = LETTER[slot];
  const title = routine?.name?.trim() || slot;
  const items: ReactNode[] = [];
  if (ids.length === 0) {
    items.push(
      <li key="e" className="abb-empty">
        <p className="rpl-meta">
          {slot === "Routine A"
            ? `Add the machines ${first} does, in the order ${first} does them.`
            : `Nothing in B: every session runs A. Add B's machines, or Change to put a routine here. Saved, it is planned until someone starts it.`}
        </p>
        {empty}
      </li>,
    );
  }
  ids.forEach((id, i) => {
    for (const e of effects.get(i) ?? []) items.push(<OrderNote key={`e-${e.ruleId}-${i}`} effect={e} />);
    items.push(<LineupRow key={`r-${id}`} n={i + 1} name={nameOf(id)} onOpen={() => setOpen(open === id ? null : id)} openLabel={`Change ${nameOf(id)} in ${slot}`} />);
    if (open === id) {
      items.push(
        <li key={`a-${id}`} className="rpl-actions">
          {i > 0 && (
            <Button variant="outline" onClick={() => onChange(moved(ids, id, -1))}>
              Move up
            </Button>
          )}
          {i < ids.length - 1 && (
            <Button variant="outline" onClick={() => onChange(moved(ids, id, 1))}>
              Move down
            </Button>
          )}
          <Button variant="outline" aria-expanded={swapOpen} onClick={() => setSwapOpen((o) => !o)}>
            Swap for…
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onChange(takenOut(ids, id));
              setOpen(null);
            }}
          >
            Take out
          </Button>
        </li>,
      );
      if (swapOpen) {
        // The same family first (the Academy's swap is within the family), then the rest of the floor.
        const families = floorByFamily(floor);
        const own = families.find((f) => f.machineIds.includes(id));
        const groups = [
          ...(own ? [{ key: own.key, label: `${own.label}, like ${nameOf(id)}`, ids: own.machineIds }] : []),
          ...families.filter((f) => f !== own).map((f) => ({ key: f.key, label: f.label, ids: f.machineIds })),
        ]
          .map((g) => ({ ...g, ids: g.ids.filter((x) => !ids.includes(x) && !held.includes(x)) }))
          .filter((g) => g.ids.length > 0);
        items.push(
          <li key={`s-${id}`} className="abb-swap" aria-label={`Swap ${nameOf(id)} for`}>
            {groups.length === 0 ? (
              <p className="rpl-meta">Every machine on this floor is in {slot} already.</p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="rpl-sheet__section">
                  <p className="rpl-meta">{g.label}</p>
                  <div className="rpl-chips">
                    {g.ids.map((x) => (
                      <Chip
                        key={x}
                        label={`Swap ${nameOf(id)} for ${nameOf(x)}`}
                        onClick={() => {
                          onChange(swapped(ids, id, x));
                          setOpen(null);
                          setSwapOpen(false);
                        }}
                      >
                        {nameOf(x)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))
            )}
          </li>,
        );
      }
    }
  });

  return (
    <section className="rpl-panel abb-routine" aria-label={`${first}'s ${slot}`} data-routine={letter}>
      <div className="rpl-panel__head">
        <div className="abb-slot__titles">
          <span className="abb-slot__label">
            Slot {letter}
            {next ? <span className="abb-next"> · Next session</span> : null}
          </span>
          <h3 className="rpl-panel__title">{title}</h3>
        </div>
        <div className="rpl-panel__right">
          <span className="rpl-meta">{ids.length === 1 ? "1 machine" : `${ids.length} machines`}</span>
          {head}
        </div>
      </div>
      <div className="rpl-panel__body">
        {middle}
        <ol className="rpl-list rpl-list--flush" aria-label={`${first}'s ${slot}`}>
          {items}
        </ol>
        {planned.length > 0 && (
          <div className="abb-planned" aria-label={`Planned for ${title}`}>
            <p className="rpl-sheet__label">Planned for the routine</p>
            <ul className="rpl-list rpl-list--flush">
              {planned.map((id) => (
                <li key={id} className="abb-planned__row">
                  <span className="abb-planned__name">{nameOf(id)}</span>
                  <span className="rpl-actions">
                    {onPlannedNow && (
                      <Button variant="outline" onClick={() => onPlannedNow(id)} disabled={disabled} aria-label={`Add ${nameOf(id)} to ${title} now`}>
                        <Plus aria-hidden="true" />
                        Add now
                      </Button>
                    )}
                    {onPlannedOff && (
                      <Button variant="ghost" onClick={() => onPlannedOff(id)} disabled={disabled} aria-label={`Take ${nameOf(id)} off ${title}'s plan`}>
                        Not planned
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!onPlannedNow && <p className="rpl-meta">Save or undo this slot's changes to add a planned machine.</p>}
          </div>
        )}
        <div className="rpl-actions">
          <Button variant="outline" onClick={onAdd} disabled={disabled} aria-label={`Add a machine to slot ${letter}`}>
            <Plus aria-hidden="true" />
            Add machine
          </Button>
          <Button variant="outline" onClick={onStartFrom} disabled={disabled} aria-label={`Start slot ${letter} from a routine`}>
            <ClipboardList aria-hidden="true" />
            Start from…
          </Button>
        </div>
        <label className="rpl-sheet__section">
          <span className="rpl-sheet__label">What it's for · optional</span>
          <input
            className="rpl-field"
            value={purpose}
            maxLength={300}
            onChange={(e) => onPurpose(e.target.value)}
            placeholder={slot === "Routine A" ? "The core: whole body" : "Variety, or recovery"}
          />
        </label>
        {dirty && (
          <label className="rpl-sheet__section">
            <span className="rpl-sheet__label">Why the change · optional</span>
            <input className="rpl-field" value={why} maxLength={500} onChange={(e) => onWhy(e.target.value)} placeholder="It helps the next trainer" />
          </label>
        )}
        <div className="rpl-foot">
          <div className="rpl-actions">
            <Button className="hover:bg-primary" disabled={!canSave} onClick={onSave}>
              <Check aria-hidden="true" />
              {saveWords ?? `Save ${slot}`}
            </Button>
            {extra}
            {dirty && (
              <Button variant="ghost" onClick={onUndo}>
                <Undo2 aria-hidden="true" />
                Undo changes
              </Button>
            )}
            <Button variant="ghost" onClick={onSwapSlot} disabled={disabled} aria-label={`Change what is in slot ${letter}`}>
              <ArrowLeftRight aria-hidden="true" />
              Change
            </Button>
            {onRename && (
              <Button variant="ghost" onClick={onRename} disabled={disabled} aria-label={`Rename ${title}`}>
                <Pencil aria-hidden="true" />
                Rename
              </Button>
            )}
            {onSaveAsMine && !dirty && (
              <Button variant="ghost" onClick={onSaveAsMine} disabled={disabled} aria-label={`Save ${title} as my routine`}>
                <BookmarkPlus aria-hidden="true" />
                Save as mine
              </Button>
            )}
            {onChanges && (
              <Button variant="ghost" onClick={onChanges}>
                <History aria-hidden="true" />
                Changes
              </Button>
            )}
          </div>
          {foot}
        </div>
      </div>
    </section>
  );
}
