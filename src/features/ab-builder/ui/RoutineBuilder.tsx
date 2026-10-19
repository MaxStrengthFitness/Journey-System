/**
 * PROGRAMMING → ROUTINES: one builder for Routine A and Routine B (the
 * routine builder round, Oct 19 2026; docs/rounds/2026-10-19-routine-builder.md).
 *
 * AJ: "the A routine builder is very intuitive and easy. I think that is a
 * great foundation to build off of", and "we dont even need Routine B to have
 * its own tab if you can come up with a design that allows us to choose what
 * machines are on A or B routine in one selector".
 *
 * This studio's floor on one side, as the A builder drew it; Routine A and
 * Routine B beside it, each its own list with What it's for and its own
 * Save. Add to (Routine A · Routine B · Both) says which routine a tap goes
 * into; every tile carries a small mark of the routines that hold it.
 *
 * - Routine B is built whole: Save makes it live (B turned on with it), and
 *   nothing moves it after that but a person. Copy A into B is the start for
 *   a B a machine or two different.
 * - Phase it in is a choice (AJ: "IF WE WANT TO, not automatic"): the
 *   difference between B as it stands and the B on screen becomes steps, a
 *   week and an owner each, ticked by a person (`PhasePanel`).
 * - Start from… lays a studio's, head office's or the client's own routine
 *   into the routine being built into; nothing is saved until Save.
 *
 * Every save is one batch, issued and never awaited (`../store.ts`); a
 * refusal comes back through `onError`. What is typed and not saved is
 * registered as unsaved work.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ClipboardList, Copy, History, Layers, Undo2 } from "lucide-react";
import type { Client, Machine, Routine, RoutineAdjustment, Trainer } from "../../../types";
import { db } from "../../../firebase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChanges } from "../../unsaved-changes";
import { cantDoActive } from "../../routine-plan/cant-do";
import { effectsAbove, floorByFamily } from "../../routine-plan/lineup";
import { floorMachinesOf, machineNamer, savedRoutineA, savedRoutineB, type PlanHost } from "../../routine-plan/ui/host";
import { Chip, LineupRow, OrderNote, PlanSheet } from "../../routine-plan/ui/parts";
import { PlanChangesList } from "../../routine-plan/ui/PlanChangesList";
import { StartFromRoutineSheet } from "../../routine-plan/ui/StartFromRoutineSheet";
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
  TARGET_WORDS,
  type Draft,
  type Target,
} from "../builder";
import { appliedStep, isDone, phaseOf, phasePlanOf, type PhasePlan } from "../phase";
import { commitPhaseSave, commitRoutineSave, phaseSaveOf, routineSaveOf, saveChanges, type Slot } from "../store";
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
  /** The profile's B switch: the reason asked, never required. */
  onToggleB: (on: boolean) => void;
  /** A refused save, in a sentence. */
  onError?: (message: string) => void;
  disabled?: boolean;
}

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
  onToggleB,
  onError,
  disabled = false,
}: RoutineBuilderProps) {
  const first = client?.firstName?.trim() || "the client";
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const nameOf = useMemo(() => machineNamer(host.floor, machines), [host.floor, machines]);
  const savedA = savedRoutineA(routines);
  const savedB = savedRoutineB(routines);
  const studioId = client?.homeStudioId || activeStudioId || host.studioId || "";
  const who = host.who;
  const ready = host.status === "ready";

  const [target, setTarget] = useState<Target>("A");
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
  const [startFrom, setStartFrom] = useState(false);
  const [phaseDraft, setPhaseDraft] = useState<PhasePlan | null>(null);
  const [changesOf, setChangesOf] = useState<Slot | null>(null);

  // Another client is another builder: nothing carries over.
  const lastClient = useRef(clientId);
  useEffect(() => {
    if (lastClient.current === clientId) return;
    lastClient.current = clientId;
    setTarget("A");
    setDraftA(null);
    setDraftB(null);
    setPurposeA(null);
    setPurposeB(null);
    setWhyA("");
    setWhyB("");
    setPendingA(null);
    setPendingB(null);
    setStartFrom(false);
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
      trainerId: authTrainer?.id || "unknown",
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

  // Where B starts phasing in from: B as saved, or a copy of Routine A as saved when B has nothing (never A's unsaved draft).
  const phaseBase = savedB && savedB.machineIds.length > 0 ? savedB.machineIds : (savedA?.machineIds ?? []);
  const canPhase = !phase && phaseBase.length > 0 && draft.b.length > 0 && !sameList(phaseBase, draft.b) && dirtyB;

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
      trainerId: authTrainer?.id || "unknown",
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

  const families = floorByFamily(floor);
  const signIn = !who ? <p className="rpl-meta">Sign in again to save a routine.</p> : null;

  return (
    <div className="rpl abb" data-disabled={disabled || undefined}>
      <div className="abb-top">
        <div className="abb-target" role="group" aria-label="Add machines to">
          <span className="abb-target__label">Add to</span>
          {(["A", "B", "both"] as const).map((t) => (
            <Chip key={t} on={target === t} onClick={() => setTarget(t)}>
              {TARGET_WORDS[t]}
            </Chip>
          ))}
        </div>
        <Button variant="outline" onClick={() => setStartFrom(true)} disabled={disabled}>
          <ClipboardList aria-hidden="true" />
          Start from…
        </Button>
      </div>

      <div className="abb-grid">
        <section className="rpl-panel abb-floor" aria-label="This studio's floor">
          <div className="rpl-panel__head">
            <h3 className="rpl-panel__title">This studio's floor</h3>
          </div>
          {families.length === 0 ? (
            <p className="rpl-meta">This studio's floor has no machines listed yet.</p>
          ) : (
            <div className="rpl-floor">
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
                      const inTarget = target === "A" ? draft.a.includes(id) : target === "B" ? draft.b.includes(id) : mark === "AB";
                      const said = markWords(mark);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="rpl-tile"
                          aria-pressed={inTarget}
                          aria-label={said ? `${nameOf(id)}, ${said}` : nameOf(id)}
                          onClick={() => apply(tapFloor(draft, id, target))}
                          disabled={disabled}
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
          )}
        </section>

        <RoutineCard
          slot="Routine A"
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
          onChanges={savedA?.id ? () => setChangesOf("Routine A") : undefined}
          foot={signIn}
        />

        <RoutineCard
          slot="Routine B"
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
          onChanges={savedB?.id ? () => setChangesOf("Routine B") : undefined}
          saveWords={!isBActive && draft.b.length > 0 ? "Save and turn B on" : undefined}
          head={
            // B's switch whenever there is something to switch: B with machines, or B on with nothing in it (the way to turn it off).
            (savedB && savedB.machineIds.length > 0) || isBActive ? (
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
                onChange={() => setPhaseDraft(phase)}
              />
            ) : null
          }
          extra={
            canPhase ? (
              <Button
                variant="outline"
                onClick={() => who && setPhaseDraft(phasePlanOf({ base: phaseBase, target: draft.b, todayYmd: host.todayYmd, who }))}
                disabled={!who || disabled}
              >
                <Layers aria-hidden="true" />
                Phase it in
              </Button>
            ) : null
          }
          foot={signIn}
        />
      </div>

      {startFrom && (
        <StartFromRoutineSheet
          onClose={() => setStartFrom(false)}
          studioId={host.studioId}
          studioName={host.studioName}
          floor={floor}
          nameOf={nameOf}
          todayYmd={host.todayYmd}
          clientRoutines={routines}
          firstName={client?.firstName ?? null}
          onLay={(ids) => {
            apply(laidFrom(draft, ids, target));
            setStartFrom(false);
          }}
        />
      )}

      {phaseDraft && (
        <PhaseSheet
          initial={phaseDraft}
          isNew={!phase}
          nameOf={nameOf}
          trainers={trainers}
          todayYmd={host.todayYmd}
          first={first}
          onClose={() => setPhaseDraft(null)}
          onSave={(next) => {
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
              savePhase(next, `Phasing B in: ${next.steps.length} ${next.steps.length === 1 ? "step" : "steps"}`, { kind: "start" });
            }
            setPhaseDraft(null);
            if (!phase) {
              resetB();
              if (!dirtyA) unsaved.release();
            }
          }}
        />
      )}

      <PlanSheet open={changesOf !== null} title={`${changesOf ?? ""} · changes`} onClose={() => setChangesOf(null)}>
        {changesOf && (changesOf === "Routine A" ? savedA?.id : savedB?.id) ? (
          <PlanChangesList
            routineId={(changesOf === "Routine A" ? savedA?.id : savedB?.id) as string}
            adjustments={adjustments}
            trainers={trainers}
            nameOf={nameOf}
            firstName={client?.firstName ?? undefined}
            todayYmd={host.todayYmd}
            read={host.actions.readChanges}
            routineName={changesOf}
          />
        ) : null}
      </PlanSheet>
    </div>
  );
}

/* ── One routine ──────────────────────────────────────────────────────── */

function RoutineCard({
  slot,
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
  onChanges,
  saveWords,
  head,
  empty,
  middle,
  extra,
  foot,
  held = [],
}: {
  slot: Slot;
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
  onChanges?: () => void;
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
  const letter = slot === "Routine A" ? "A" : "B";
  const items: ReactNode[] = [];
  if (ids.length === 0) {
    items.push(
      <li key="e" className="abb-empty">
        <p className="rpl-meta">
          {slot === "Routine A"
            ? `Tap the machines ${first} does, in the order ${first} does them.`
            : `Pick Routine B on Add to, then tap B's machines. Saving it makes it live.`}
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
        <h3 className="rpl-panel__title">
          {first}'s {slot}
        </h3>
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
