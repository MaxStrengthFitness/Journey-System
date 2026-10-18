/**
 * THE NOTE BOX — one box for a note at the end of a session: the words, where
 * they go, what they are for, and one line saying where they land (the
 * Wrap-up round, AJ, Oct 18 2026: "easily made for a note for next time or
 * just a note to the profile and where its going to be filed to").
 *
 * Everything shows as soon as the box opens. Goes to is the one Loudness
 * control (Profile only · Next time · Critical) with Just for me beside it;
 * What it's for is the five filing categories, and a category moves a note
 * nobody has placed to its own default. Nothing is required: words with no
 * category file unfiled, and wait in To file. The rules are `note-box.ts`.
 *
 * Controlled: the host holds the value and files it.
 */
import { Lock } from "lucide-react";
import { Loudness } from "../rating";
import { NoteCategoryChips } from "./NoteCategoryChips";
import { FILING_CATEGORIES, type FilingCategory } from "./note-catalog";
import { whereItLands, withCategory, withImportance, type NoteBoxValue } from "./note-box";
import "./notes.css";

export interface NoteBoxProps {
  value: NoteBoxValue;
  onChange: (next: NoteBoxValue) => void;
  /** The client's first name, for the line ("Robbin's profile → Notes → …"). */
  firstName: string;
  /** The box's accessible name, when no <label> outside names it (`id`). */
  label?: string;
  /** The words' id, for a <label htmlFor> outside; the line under it describes them. */
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function NoteBox({ value, onChange, firstName, label, id, placeholder, autoFocus = false }: NoteBoxProps) {
  const whereId = id ? `${id}-where` : undefined;
  return (
    <div className="flex flex-col gap-2.5" data-testid="note-box">
      <textarea
        className="w-full bg-(--well) border border-input shadow-(--elev-0) rounded-[10px] p-2.5 px-3 min-h-16 text-[14px] text-ink-d1 placeholder:text-ink-d3 placeholder:italic resize-none outline-none focus:border-(--eq-focus-ring) transition-colors"
        id={id}
        aria-label={label}
        aria-describedby={whereId}
        placeholder={placeholder}
        value={value.text}
        autoFocus={autoFocus}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      {!value.justForMe && (
        <Loudness value={value.importance} onChange={(lvl) => onChange(withImportance(value, lvl))} hint={false} compact />
      )}
      {/* Just for me: the trainer's own notebook (the briefing round, phase 4), never the record. */}
      <button
        type="button"
        aria-pressed={value.justForMe}
        onClick={() => onChange({ ...value, justForMe: !value.justForMe })}
        className="self-start min-h-10 px-3.5 rounded-full border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-[14px] font-semibold text-ink-d1 inline-flex items-center gap-1.5 aria-pressed:border-(--eq-live) aria-pressed:bg-(--eq-live-fill) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
        data-testid="note-box-just-for-me"
      >
        <Lock size={14} aria-hidden="true" />
        Just for me
      </button>
      {!value.justForMe && (
        <div className="flex flex-col gap-1.5">
          <span className="nc-kicker">What it's for</span>
          <NoteCategoryChips
            value={value.category}
            options={FILING_CATEGORIES}
            label="What it's for"
            small
            onChange={(c) => onChange(withCategory(value, value.category === c ? null : (c as FilingCategory)))}
          />
        </div>
      )}
      <p id={whereId} className="text-[12px] text-ink-d2 break-words" role="status" aria-live="polite" data-testid="note-box-where">
        {whereItLands(value, firstName)}
      </p>
    </div>
  );
}
