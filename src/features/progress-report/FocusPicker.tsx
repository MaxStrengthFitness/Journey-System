/**
 * Why this client trains: the report's focus (Oct 13 2026; AJ: "not
 * everyone is training for the same reason"). Picked on the first step; it
 * decides what leads the printed page and what is ticked to start with, and
 * the report saves it onto the client too, so the next report, the profile
 * and the briefing know it. Their own goal is said in the trainer's words.
 * The client is the first name, else the pronoun from the gender on the
 * record (`pronounsFor`, Oct 15 2026).
 */
import { agree, type Pronouns } from "../client-codex/kit/pronouns";
import { cap } from "../client-codex/kit/text";
import { FOCUS_KINDS, FOCUS_LABELS, FOCUS_LEADS, focusLine, type FocusKind, type TrainingFocus } from "./report-page";

export function FocusPicker({
  value,
  onChange,
  firstName,
  pronouns: p,
  fallback = null,
}: {
  value: TrainingFocus | null;
  onChange: (next: TrainingFocus) => void;
  firstName: string;
  /** he, she or they: `pronounsFor(client)`. */
  pronouns: Pronouns;
  /** What the page follows while "their own goal" has no words: the client's own focus, if they have one. */
  fallback?: TrainingFocus | null;
}) {
  const pick = (kind: FocusKind) => onChange(kind === "custom" ? { kind, words: value?.kind === "custom" ? value.words : "" } : { kind });
  return (
    <div className="pr-focus" role="group" aria-labelledby="pr-focus-title">
      <p id="pr-focus-title" className="pr-focus__title">
        {firstName ? `Why ${firstName} trains` : `Why ${p.subject} ${agree(p, "trains", "train")}`}
      </p>
      <p className="pr-focus__hint">It leads the printed page, and the next report starts from it.</p>
      <div className="pr-focus__choices">
        {FOCUS_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="pr-focus__choice"
            aria-pressed={value?.kind === kind}
            onClick={() => pick(kind)}
          >
            <span className="pr-focus__label">{FOCUS_LABELS[kind]}</span>
            <span className="pr-focus__lead">{FOCUS_LEADS[kind]}</span>
          </button>
        ))}
      </div>
      {value?.kind === "custom" && (
        <label className="pr-focus__words">
          <span className="pr-focus__words-label">{`${cap(p.possessive)} goal, in your words`}</span>
          <input
            type="text"
            value={value.words ?? ""}
            maxLength={120}
            placeholder="e.g. Hike the Camino in May"
            onChange={(e) => onChange({ kind: "custom", words: e.target.value })}
          />
          {!value.words?.trim() && (
            <span className="pr-focus__hint">
              {fallback
                ? `Type ${p.possessive} goal to use it: until then the page follows ${p.possessive} focus on file, ${focusLine(fallback)}.`
                : `Type ${p.possessive} goal to use it: until then the page follows A goal to hit's order and prints no focus.`}
            </span>
          )}
        </label>
      )}
    </div>
  );
}
