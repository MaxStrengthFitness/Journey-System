/**
 * PROGRAMMING — what this client is supposed to do.
 *
 * Routines and Equipment were two tabs answering one question. A trainer
 * checking "what is Judy on today, and is the Leg Press set up for her" had
 * to visit both, and the two screens already spoke the same visual language —
 * the Routines round deliberately rebuilt the prescription rows in the
 * Equipment rail's vocabulary. Two tabs for one sentence.
 *
 * One tab now, three segments (the routine builder round, Oct 19 2026: A
 * and B were two segments until then; AJ: "we dont even need Routine B to
 * have its own tab"):
 *
 *   ROUTINES       Routine A and Routine B in one builder (features/ab-builder),
 *                  the switch that turns B on, and Routine A's plan under it
 *   ALL MACHINES   the roster — every machine, its settings, its history
 *   SETUP          every machine's settings on ONE list: check them, fill them
 *                  in from what similar clients use, or copy a FileMaker chart
 *                  (machine fit round, Sep 2026 — features/machine-fit)
 *
 * Three decisions worth stating:
 *
 *   1. IT OPENS ON TODAY'S ROUTINE. `defaultProgrammingView` picks the
 *      prescription the client is actually training, which is the screen the
 *      trainer wanted before they knew they wanted it. The old tab opened on
 *      "both" and made them read which one was today.
 *
 *   2. ONE AT A TIME IS DENSER, NOT SPARSER. Side by side, each routine had
 *      half of a 1024px screen and eight machines ran past the fold. One at a
 *      time, the whole list fits, and the segment to see the other one is
 *      48px away in a fixed position. The density problem is solved by
 *      *removing* the second column, not by shrinking rows.
 *
 *   3. THE ROSTER STAYS MOUNTED. The Equipment pane holds a selected machine,
 *      a search and a drill-in position, and rebuilding it on every toggle
 *      would turn a free switch into a reload. It is hidden, not unmounted.
 *      The two routine panels are cheap and are unmounted normally.
 *
 *   4. SO DOES SETUP, for a stronger reason: it holds UNSAVED DRAFTS. A
 *      trainer half way down a FileMaker chart who glances at Routine A must
 *      find the chart where they left it. It reads nothing until it is first
 *      opened (its own `active` gate), so an unopened Setup costs nothing.
 *
 * All the Firestore writes still belong to ClientProfileView. This shell owns
 * one piece of state — which segment is showing — and it does not even own
 * that: the profile's nav reducer does, so the choice survives a trip to the
 * Journey grid and back.
 */
import { rosterCoverage } from "./programming-summary";
import { floorWithHistoryMachines } from "../../lib/floor-machines";
import { neverTriedPhrase, type HistoryCoverage } from "../../lib/prior-history";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Client,
  ClientMachineSetting,
  ExerciseLog,
  Machine,
  Routine,
  RoutineAdjustment,
  Trainer,
  WorkoutSession,
} from "../../types";
import { EquipmentTab } from "../equipment";
import { bStatus, isBPlan, swapsOf } from "../routine-plan/b-routine";
import { planProgress, runsDayOne } from "../routine-plan/plan";
import type { PlanHost } from "../routine-plan/ui/host";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import type { MachineMenuHost } from "../machine-menu/useMachineMenuData";
import { SetupView } from "../machine-fit/ui/SetupView";
import { RoutinesTab } from "../routines";
import { relativeTime, type RoutineName } from "../routines/routine-rows";
import { useRoutinesModel } from "../routines/useRoutinesModel";
import { ProfileSubnav, type SubnavItem } from "./ProfileSubnav";
import { RoutineBuilder } from "../ab-builder/ui/RoutineBuilder";
import { savedRoutineA } from "../routine-plan/ui/host";
import type { ProgrammingView } from "./profile-nav";
import "./profile-nav.css";

export interface ProgrammingTabProps {
  client: Client | null | undefined;
  clientId: string;
  routines: Routine[];
  machines: Machine[];
  /**
   * THIS studio's floor, its own machines included, in the studio's order
   * (Oct 2 2026, AJ: before beta; "the standard list is to help new studios
   * adopt and study material for the machines"). All Machines, Setup and
   * their counts read it; the routines keep `machines`, so a routine machine
   * the floor no longer has still has its name. Left out: `machines`.
   */
  floorMachines?: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  clientBodyWeight?: number;
  allLogs: ExerciseLog[];
  sessions: WorkoutSession[];
  adjustments: RoutineAdjustment[];
  trainers: Trainer[];
  /**
   * The studio roster the app already holds. Setup joins the studio's
   * machine-fit rows to it, so "clients built like her" costs no client reads.
   */
  studioClients?: readonly Client[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  selectedRoutineTodayId: string | null;
  isBActive: boolean;
  /**
   * How much of this client's story Journey holds. Decides whether a lifetime
   * figure may be quoted at all, and whether a machine with no rows reads
   * "never attempted" (a fact about her) or "nothing recorded" (a fact about
   * our records). See lib/prior-history.ts.
   */
  coverage?: HistoryCoverage;
  view: ProgrammingView;
  onViewChange: (view: ProgrammingView) => void;
  onEdit: (name: RoutineName) => void;
  onToggleB: (checked: boolean) => void;
  /** A refused save on Routines, in a sentence (the profile's toast). */
  onError?: (message: string) => void;
  /** A save worth saying (Save as my routine). */
  onNotice?: (message: string) => void;
  onSelectMachine?: (machineId: string) => void;
  /**
   * The machine menu's door on the profile (ClientProfileView builds it):
   * All Machines draws the menu's body inline for the machine picked in its list.
   */
  machineMenuHost?: MachineMenuHost;
  disabled?: boolean;
  /**
   * Routine A's plan (the first-session design round, Oct 8 2026): what the
   * profile hands down so Routine A can show Start a plan, the Lineup and
   * Add a plan. The profile owns the read and every write.
   */
  plan?: PlanHost | null;
}

export function ProgrammingTab({
  client,
  clientId,
  routines,
  machines,
  floorMachines,
  clientSettings,
  clientBodyWeight,
  allLogs,
  sessions,
  adjustments,
  trainers,
  studioClients = [],
  authTrainer,
  activeStudioId,
  selectedRoutineTodayId,
  isBActive,
  coverage: historyCoverage = "unknown",
  view,
  onViewChange,
  onEdit,
  onToggleB,
  onError,
  onNotice,
  onSelectMachine,
  machineMenuHost,
  disabled = false,
  plan = null,
}: ProgrammingTabProps) {
  /*
   * Routine A and B are unmounted when hidden, and Routine A's plan holds
   * typing (a starting lineup not yet kept, a purpose, a reason). So a move
   * to another segment asks first about what is typed in them, and only
   * them: All Machines and Setup are kept mounted, so they sit outside this
   * scope and a move never asks about Setup's drafts.
   */
  const segments = useLeaveScope();
  // "routine-b" is a door from before the routine builder round: it opens Routines too.
  const routinesView = view === "routine-a" || view === "routine-b";
  const changeView = (next: ProgrammingView) => {
    if (next === view || (routinesView && next === "routine-a")) return;
    segments.guard(() => onViewChange(next));
  };
  const aSaved = savedRoutineA(routines);
  const aHasPlan = !!aSaved?.plan;
  // Routine A's plan under the builder: open by itself while Routine A is empty and the plan runs day one.
  const [planOpenState, setPlanOpen] = useState<boolean | null>(null);
  const planOpen = planOpenState ?? (aHasPlan && (aSaved?.machineIds.length ?? 0) === 0);
  /*
   * A client with no routine and no plan who is starting out at the studio
   * (or whom Journey can't place yet) keeps Start a plan: the starting
   * lineup, day one and the consult (routine-plan/ui/StartPlanPanel). A
   * client who trained here before Journey gets the builder, which is the
   * A builder AJ liked with B beside it.
   */
  const starting =
    !!plan &&
    plan.status === "ready" &&
    !aHasPlan &&
    (aSaved?.machineIds.length ?? 0) === 0 &&
    !routines.some((r) => r.machineIds.length > 0) &&
    plan.kind.kind !== "new-to-journey";
  /*
   * The roster is mounted the first time it is opened and never unmounted
   * after that — "keep alive from first use". Mounting it up front would cost
   * a machine-catalog subscription on every profile open for a pane most
   * visits never reach; unmounting it on every toggle would throw away the
   * selected machine and the search, which are the trainer's place in it.
   * A new client resets both, the same way EquipmentTab already does.
   */
  const [rosterSeen, setRosterSeen] = useState(view === "machines");
  useEffect(() => {
    if (view === "machines") setRosterSeen(true);
  }, [view]);
  // Setup keeps the same "alive from first use" rule (decision 4). It is NOT
  // reset on a new client: SetupView drops its own drafts when the client
  // changes, and unmounting it here would only cost the catalog listener twice.
  const [setupSeen, setSetupSeen] = useState(view === "setup");
  useEffect(() => {
    if (view === "setup") setSetupSeen(true);
  }, [view]);
  /** Settings worth a look, reported by Setup once it has loaded. Null until then. */
  const [toReview, setToReview] = useState<number | null>(null);

  const lastClient = useRef(clientId);
  if (lastClient.current !== clientId) {
    lastClient.current = clientId;
    if (rosterSeen && view !== "machines") setRosterSeen(false);
    if (toReview !== null) setToReview(null);
  }

  // The machines a routine's rows are named from: this floor's own version
  // first (its name, a studio-built machine included), then every other
  // machine the app knows, so a routine machine the floor no longer has
  // keeps its name (the studio machines round, Oct 13 2026: a routine
  // holding Strongsville's Hoist leg press said "Unknown machine" here and
  // its row couldn't be opened).
  const routineMachines = useMemo(
    () => (floorMachines ? floorWithHistoryMachines(floorMachines, machines, machines.map((m) => m.id ?? "")) : machines),
    [floorMachines, machines],
  );

  // Computed here and handed down, so the context line and the routine panel
  // are the same numbers from the same walk of the logs.
  const model = useRoutinesModel({
    client,
    clientId,
    routines,
    machines: routineMachines,
    clientSettings,
    allLogs,
    sessions,
    adjustments,
    trainers,
    selectedRoutineTodayId,
    isBActive,
    coverage: historyCoverage,
  });

  const floor = floorMachines ?? machines;
  const coverage = useMemo(
    () => rosterCoverage(floor, client, historyCoverage),
    [floor, client, historyCoverage],
  );
  const prescribedWatch = useMemo(() => {
    const ids = new Set<string>();
    for (const r of [...model.rowsA, ...(isBActive ? model.rowsB : [])]) {
      if (r.watchOuts.length > 0) ids.add(r.machineId);
    }
    return ids.size;
  }, [model, isBActive]);

  // How much of the floor has any setting saved — from what the profile
  // already holds, so the segment can say it before Setup is ever opened.
  const setup = useMemo(() => {
    const has = (id?: string) => {
      const saved = id ? clientSettings[id]?.settings : undefined;
      return !!saved && Object.values(saved).some((v) => String(v ?? "").trim() !== "");
    };
    const prescribedIds = new Set<string>();
    for (const r of [...model.rowsA, ...(isBActive ? model.rowsB : [])]) prescribedIds.add(r.machineId);
    return {
      total: floor.length,
      done: floor.filter((m) => has(m.id)).length,
      prescribedMissing: [...prescribedIds].filter((id) => !has(id)).length,
    };
  }, [floor, clientSettings, model, isBActive]);

  // Routine A with a plan says how far along it is: "3 of 6 planned", or "day one planned" while Routine A is empty.
  const aPlan = model.a.plan;
  const aPlanMeta = aPlan
    ? runsDayOne({ routine: model.a.machineIds, plan: aPlan })
      ? "day one planned"
      : (() => {
          const p = planProgress(aPlan, model.a.machineIds);
          return `${p.have} of ${p.of} planned${model.todayName === "Routine A" ? " · today" : ""}`;
        })()
    : null;

  // Routine B with a plan of swaps says how far it is: "2 of 5 swaps" (Round 2, B molded in).
  const bPlan = model.b.plan;
  const bPlanMeta = isBPlan(bPlan)
    ? (() => {
        const st = bStatus(swapsOf(bPlan), model.b.machineIds);
        return `${st.made} of ${st.of} swaps${model.todayName === "Routine B" ? " · today" : ""}`;
      })()
    : null;

  const items = useMemo<SubnavItem<ProgrammingView>[]>(
    () => [
      {
        // Routine A and Routine B, one builder (the routine builder round,
        // Oct 19 2026). The id stays "routine-a", and "routine-b" opens the
        // same segment, so every door and stored place still lands here.
        id: "routine-a",
        label: "Routines",
        meta:
          // A read that hasn't answered, or failed, never says "not set up".
          plan?.status === "loading"
            ? "reading"
            : plan?.status === "failed"
              ? "can't tell"
              : [
                  `A ${aPlanMeta && model.rowsA.length === 0 ? "day one" : model.rowsA.length}`,
                  `B ${isBActive ? (bPlanMeta ?? model.rowsB.length) : "off"}`,
                  ...(model.todayName ? [`${model.todayName.slice(-1)} today`] : []),
                ].join(" · "),
        // The dot is "there is something here to deal with", and the only
        // thing on a prescription that qualifies is a machine with no load.
        flag: model.rowsA.some((r) => r.weight === null) || (isBActive && model.rowsB.some((r) => r.weight === null)),
      },
      {
        id: "machines",
        label: "All Machines",
        // "Total transparency": how much of the floor this client has used.
        meta:
          coverage.performed === null
            ? `${coverage.total} on roster`
            : `${coverage.performed} of ${coverage.total} performed`,
        flag: false,
      },
      {
        id: "setup",
        label: "Setup",
        // The check is PASSIVE: what it found is said quietly here, in words,
        // and nowhere else in the app. The dot is kept for the one thing that
        // is a job to do — a machine she is prescribed with no settings saved.
        meta:
          `${setup.done} of ${setup.total} set up` +
          (toReview !== null && toReview > 0 ? ` \u00b7 ${toReview} to review` : ""),
        flag: setup.prescribedMissing > 0,
      },
    ],
    [model, isBActive, coverage, setup, toReview, aPlanMeta, bPlanMeta, plan?.status],
  );

  // On Routines the slots show what is prescribed and which runs next (the
  // routine library round, §2): the line keeps only what they don't say.
  const builderShown = routinesView && !!plan && !starting;
  const parts: { key: string; node: ReactNode }[] = [
    ...(!builderShown
      ? [{ key: "total", node: <span><b>{model.total}</b> {model.total === 1 ? "machine" : "machines"} prescribed</span> }]
      : []),
    ...(model.total > 0 && model.setUp < model.total
      ? [{ key: "load", node: <span><b>{model.total - model.setUp}</b> with no load yet</span> }]
      : []),
    ...(!builderShown
      ? [{ key: "today", node: <span>{model.todayName ? <><b>{model.todayName}</b> today</> : "No routine chosen for today"}</span> }]
      : []),
    ...(coverage.neverTried !== null && coverage.neverTried > 0
      ? [{ key: "never", node: <span><b>{coverage.neverTried}</b> {neverTriedPhrase(coverage.neverTried, coverage.coverage)}</span> }]
      : []),
    ...(prescribedWatch > 0
      ? [{ key: "watch", node: <span className="psub-context__watch"><b>{prescribedWatch}</b> with a clinical watch-out</span> }]
      : []),
    ...(model.newest
      ? [{ key: "newest", node: <span>last change <b>{relativeTime(model.newest.when)}</b> by {model.newest.trainerInitials}</span> }]
      : []),
  ];
  const context = (
    <>
      {parts.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 && <span className="psub-context__dot" aria-hidden="true" />}
          {p.node}
        </Fragment>
      ))}
    </>
  );

  const routineProps = {
    client,
    clientId,
    routines,
    machines: routineMachines,
    clientSettings,
    allLogs,
    sessions,
    adjustments,
    trainers,
    selectedRoutineTodayId,
    isBActive,
    onEdit,
    onToggleB,
    onSelectMachine,
    disabled,
    hideSummary: true,
    model,
  };

  return (
    <div className="ptab">
      <ProfileSubnav
        label="Programming views"
        items={items}
        value={routinesView ? "routine-a" : view}
        onChange={changeView}
        context={context}
      />

      <UnsavedChangesScope scope={segments}>
        {routinesView && (starting || !plan) && <RoutinesTab {...routineProps} view={plan ? "Routine A" : "both"} plan={plan} />}
        {routinesView && plan && !starting && (
          <>
            <RoutineBuilder
              host={plan}
              client={client}
              clientId={clientId}
              routines={routines}
              machines={routineMachines}
              isBActive={isBActive}
              trainers={trainers}
              adjustments={adjustments}
              authTrainer={authTrainer}
              activeStudioId={activeStudioId}
              nextRoutineId={selectedRoutineTodayId}
              sessions={sessions}
              onToggleB={onToggleB}
              onError={onError}
              onNotice={onNotice}
              disabled={disabled}
            />
            {aHasPlan && (
              <section className="abb-plan">
                <button
                  type="button"
                  className="abb-plan__head"
                  aria-expanded={planOpen}
                  onClick={() => setPlanOpen(!planOpen)}
                >
                  <span className="abb-plan__title">Routine A's plan</span>
                  <span className="abb-plan__meta">On deck, can't do, weak area and the plan's changes</span>
                </button>
                {planOpen && <RoutinesTab {...routineProps} view="Routine A" plan={plan} withoutB />}
              </section>
            )}
          </>
        )}
      </UnsavedChangesScope>

      {/* Mounted from the first time the roster is opened, hidden after that.
          See decision 3 in the header: this pane owns a selection and a
          search, and both are the trainer's place in it. */}
      {rosterSeen && (
      <div className="ptab-pane" hidden={view !== "machines"}>
        <EquipmentTab
          client={client}
          clientId={clientId}
          machines={floor}
          clientSettings={clientSettings}
          clientBodyWeight={clientBodyWeight}
          allLogs={allLogs}
          sessions={sessions}
          activeStudioId={activeStudioId}
          authTrainer={authTrainer}
          coverage={historyCoverage}
          menuHost={machineMenuHost}
        />
      </div>
      )}

      {/* Mounted from the first time Setup is opened, hidden after that:
          it holds unsaved drafts (decision 4 in the header). */}
      {setupSeen && (
        <div className="ptab-pane" hidden={view !== "setup"}>
          <SetupView
            client={client}
            clientId={clientId}
            machines={floor}
            clientSettings={clientSettings}
            routines={routines}
            isBActive={isBActive}
            studioClients={studioClients}
            authTrainer={authTrainer}
            activeStudioId={activeStudioId}
            active={view === "setup"}
            onReviewCount={setToReview}
          />
        </div>
      )}
    </div>
  );
}
