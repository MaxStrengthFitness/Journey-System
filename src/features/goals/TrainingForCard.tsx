/**
 * TRAINING FOR — why this client trains (Oct 13 2026; AJ: "studios need to
 * know the goals of their clients ... not everyone is training for the same
 * reason"). One of five: everyday strength and independence, pain-free
 * movement, body composition, a goal to hit, or their own goal in words.
 *
 * It is the client's `trainingFocus`: set here through the shell's ONE record
 * form (the Save bar saves it), or from a progress report, which leads its
 * printed page with it. The briefing says it in a line. The app describes;
 * the trainer decides: nothing here suggests a focus. Tapping the chosen one
 * again clears it.
 */
import { Compass } from "lucide-react";
import type { Client } from "../../types";
import { CardHead, Chip, EditButton, EmptyLine, Lede, Meta, Pick, Source, TextInput, anchorProps, cap, cls, useReadEdit, type Pronouns } from "../client-codex/kit";
import type { RecordAnchor } from "../client-profile/profile-nav";
import { FOCUS_KINDS, FOCUS_LABELS, FOCUS_LEADS, focusLine, focusOf, type FocusKind, type TrainingFocus } from "../progress-report/report-page";
import "./goals.css";

export interface TrainingForCardProps {
  /** The focus as the form holds it (trainingFocus), raw: a custom goal being typed may have no words yet. */
  value: TrainingFocus | null | undefined;
  updateField: (key: keyof Client, value: unknown) => void;
  canEdit: boolean;
  dirty: boolean;
  revision: number;
  pronouns: Pronouns;
  id?: RecordAnchor;
  className?: string;
}

export function TrainingForCard({ value, updateField, canEdit, dirty, revision, pronouns: p, id = "goals-training", className }: TrainingForCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });
  const saved = focusOf(value);
  const set = (next: TrainingFocus | null) => updateField("trainingFocus", next);
  const pick = (kind: FocusKind) => {
    if (value?.kind === kind) return set(null);
    set(kind === "custom" ? { kind, words: "" } : { kind });
  };

  return (
    <section className={cls("cx-card", className)} data-editing={open ? "" : undefined} {...anchorProps(id)}>
      <CardHead
        eyebrow="Training for"
        icon={Compass}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label="Training for" /> : null}
      />
      {open ? (
        <div className="gf-edit">
          <div className="cx-picks__list" role="group" aria-label="Training for">
            {FOCUS_KINDS.map((kind) => (
              <Pick key={kind} pressed={value?.kind === kind} hint={FOCUS_LEADS[kind]} onClick={() => pick(kind)}>
                {FOCUS_LABELS[kind]}
              </Pick>
            ))}
          </div>
          {value?.kind === "custom" && (
            <TextInput
              label={`${cap(p.possessive)} goal, in your words`}
              value={value.words ?? ""}
              maxLength={120}
              placeholder="e.g. Hike the Camino in May"
              onChange={(words) => set({ kind: "custom", words })}
              hint={value.words?.trim() ? undefined : "Type their goal to choose it: with no words it is saved as not chosen."}
            />
          )}
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      ) : saved ? (
        <>
          <Lede>{focusLine(saved)}</Lede>
          <Source>
            {saved.kind === "custom"
              ? `${cap(p.possessive)} own goal, in the trainer's words. It leads ${p.possessive} progress report, and the briefing says it.`
              : `It leads ${p.possessive} progress report, and the briefing says it.`}
          </Source>
        </>
      ) : (
        <EmptyLine action={canEdit ? { label: "Choose it", onClick: () => setOpen(true) } : undefined}>
          Not chosen yet. Why they train: everyday strength, pain-free movement, body composition, or a goal to hit.
        </EmptyLine>
      )}
    </section>
  );
}
