/**
 * Phasing Routine B in, on B's card and in its sheet (the routine builder
 * round, Oct 19 2026). AJ: "the reason why i want to be able to plan the
 * phase out if we want is if we want to plan it out as an individual or as a
 * team so i can make sure the plan is followed".
 *
 * `PhasePanel` is B's line while a plan runs and its steps, each ticked by a
 * person (a tick is B's machines changing, written at once); Change the
 * plan, Finish now, and Stop phasing (B left as it stands). `PhaseSheet`
 * makes or changes the plan: each step's week and owner (Anyone or a named
 * trainer, people in name order), Spread one a week, and one Save. Anyone
 * makes, changes or drops a plan (AJ's "2a"). Nothing pings anyone, and
 * nothing makes a step by itself.
 */
import { useMemo, useState } from "react";
import { CalendarClock, Check, CircleSlash, FastForward, Pencil } from "lucide-react";
import type { Trainer } from "../../../types";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "../../unsaved-changes";
import type { Who } from "../../routine-plan/lineup";
import { PlanSheet, TickRow } from "../../routine-plan/ui/parts";
import {
  dayWords,
  finishedNow,
  isDone,
  ownerWords,
  phaseLine,
  phaseStatus,
  spreadWeekly,
  stepWords,
  tickedStep,
  weekOf,
  type PhasePlan,
  type PhaseStep,
} from "../phase";

/** A step's line under its words: when, who, and whether it is due or behind. */
export function stepSub(step: PhaseStep, todayYmd: string): string {
  if (isDone(step)) return `Done ${dayWords(step.doneAt as string)}${step.doneByName ? ` · ${step.doneByName}` : ""}`;
  const thisWeek = weekOf(todayYmd);
  const when = step.week < thisWeek ? "behind" : step.week === thisWeek ? "due this week" : null;
  return [`Week of ${dayWords(step.week)}`, ownerWords(step), ...(when ? [when] : [])].join(" · ");
}

export function PhasePanel({
  phase,
  nameOf,
  todayYmd,
  who,
  disabled,
  editing,
  onSave,
  onChange,
}: {
  phase: PhasePlan;
  nameOf: (id: string) => string;
  todayYmd: string;
  who: Who | null;
  disabled: boolean;
  /** B is being edited on screen: saving it whole ends the plan, and the screen says so. */
  editing: boolean;
  onSave: (next: PhasePlan | null, note: string) => void;
  onChange: () => void;
}) {
  const [stopping, setStopping] = useState(false);
  const st = phaseStatus(phase, todayYmd);
  const can = !!who && !disabled;
  return (
    <div className="abb-phase" aria-label="Phasing Routine B in">
      <p className="rpl-line rpl-line--icon">
        <CalendarClock size={16} aria-hidden="true" />
        {phaseLine(phase, todayYmd, nameOf)}
      </p>
      <div className="abb-phase__steps">
        {phase.steps.map((s, i) => (
          <TickRow
            key={`${s.from ?? ""}-${s.to ?? ""}-${i}`}
            on={isDone(s)}
            label={stepWords(s, nameOf)}
            sub={stepSub(s, todayYmd)}
            onChange={(on) => {
              if (!can || !who) return;
              onSave(tickedStep(phase, i, on, who, todayYmd), `${on ? "Phasing in" : "Phasing in, undone"}: ${stepWords(s, nameOf)}`);
            }}
          />
        ))}
      </div>
      {editing && <p className="rpl-meta">Saving Routine B as it is on screen ends this plan.</p>}
      {stopping ? (
        <div className="rpl-actions">
          <p className="rpl-meta">Stop phasing? Routine B stays as it is now.</p>
          <Button
            variant="outline"
            onClick={() => {
              onSave(null, "Stopped phasing Routine B in");
              setStopping(false);
            }}
            disabled={!can}
          >
            Stop phasing
          </Button>
          <Button variant="ghost" onClick={() => setStopping(false)}>
            Keep the plan
          </Button>
        </div>
      ) : (
        <div className="rpl-actions">
          <Button variant="outline" onClick={onChange} disabled={!can}>
            <Pencil aria-hidden="true" />
            Change the plan
          </Button>
          {!st.complete && (
            <Button
              variant="outline"
              onClick={() => who && onSave(finishedNow(phase, who, todayYmd), "Phased Routine B in: every step at once")}
              disabled={!can}
            >
              <FastForward aria-hidden="true" />
              Finish now
            </Button>
          )}
          <Button variant="ghost" onClick={() => setStopping(true)} disabled={!can}>
            <CircleSlash aria-hidden="true" />
            {st.complete ? "Clear the plan" : "Stop phasing"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PhaseSheet({
  initial,
  isNew,
  nameOf,
  trainers,
  todayYmd,
  first,
  onClose,
  onSave,
}: {
  initial: PhasePlan;
  isNew: boolean;
  nameOf: (id: string) => string;
  trainers: readonly Trainer[];
  todayYmd: string;
  first: string;
  onClose: () => void;
  onSave: (plan: PhasePlan) => void;
}) {
  const [steps, setSteps] = useState<PhaseStep[]>(initial.steps);
  const dirty = isNew || JSON.stringify(steps) !== JSON.stringify(initial.steps);
  const unsaved = useUnsavedChanges(dirty, `${first}'s phase-in plan`, { onDiscard: () => setSteps(initial.steps) });
  // People in name order, never ranked.
  const people = useMemo(
    () =>
      trainers
        .filter((t) => !!t.id && !!t.fullName?.trim())
        .map((t) => ({ id: t.id as string, name: (t.fullName as string).trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [trainers],
  );
  const set = (i: number, patch: Partial<PhaseStep>) =>
    setSteps((list) =>
      list.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...patch };
        if ("ownerId" in patch && !patch.ownerId) {
          delete next.ownerId;
          delete next.ownerName;
        }
        return next;
      }),
    );
  const close = () => unsaved.guard(onClose);

  return (
    <PlanSheet
      open
      title={isNew ? "Phase Routine B in" : "Change the phase-in plan"}
      meta={`Routine B changes one step at a time. A person ticks each step done; nothing changes by itself.`}
      onClose={close}
      footer={
        <div className="rpl-actions">
          <Button variant="outline" onClick={() => setSteps((list) => spreadWeekly(list, list[0]?.week ?? todayYmd))}>
            One a week
          </Button>
          <Button
            className="hover:bg-primary"
            disabled={steps.length === 0}
            onClick={() => {
              unsaved.release();
              onSave({ ...initial, steps });
            }}
          >
            <Check aria-hidden="true" />
            {isNew ? "Start phasing in" : "Save the plan"}
          </Button>
        </div>
      }
    >
      {steps.length === 0 ? (
        <p className="rpl-line">Routine B and its start hold the same machines, so there is nothing to phase in.</p>
      ) : (
        <ol className="abb-steps">
          {steps.map((s, i) => (
            <li key={`${s.from ?? ""}-${s.to ?? ""}-${i}`} className="abb-step">
              <p className="abb-step__name">
                {i + 1}. {stepWords(s, nameOf)}
              </p>
              {isDone(s) ? (
                <p className="rpl-meta">{stepSub(s, todayYmd)}</p>
              ) : (
                <div className="abb-step__fields">
                  <label className="rpl-sheet__section">
                    <span className="rpl-sheet__label">Week of</span>
                    <input
                      type="date"
                      className="rpl-field"
                      value={s.week}
                      onChange={(e) => e.target.value && set(i, { week: weekOf(e.target.value) })}
                    />
                  </label>
                  <label className="rpl-sheet__section">
                    <span className="rpl-sheet__label">Who</span>
                    <select
                      className="rpl-field"
                      value={s.ownerId ?? ""}
                      onChange={(e) => {
                        const p = people.find((x) => x.id === e.target.value);
                        set(i, p ? { ownerId: p.id, ownerName: p.name } : { ownerId: undefined });
                      }}
                    >
                      <option value="">Anyone</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </PlanSheet>
  );
}
