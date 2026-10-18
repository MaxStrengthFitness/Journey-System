/**
 * The Wrap-up's next-session weight, one machine at a time (the Atlas
 * answers, Oct 2 2026; on each of today's rows since the Wrap-up round, AJ,
 * Oct 18 2026, "1a": "Today's machines once").
 *
 * The weight the next session will load starts at what she lifted today (the
 * app's rule until now: "currently our app uses the last sessions weight"),
 * with − and + in the machine's step and the number itself to type into. Each
 * change is written the moment it is made (a tap) or the field is left
 * (typing), onto her settings for that machine, so the next session — by any
 * trainer, at any studio — starts from it and says who set it (next-weight.ts).
 *
 * It sits on the row that already says today's weight, so it says nothing
 * of its own unless the screen can't show it: the number's edge turns blue
 * once it differs from today, a tick says it was saved, and only a failed
 * write is said in words. "Up 4 lb from today" stays for a screen reader.
 *
 * The app never suggests a weight. Nothing here proposes a number or a
 * direction; it shows what the trainer set.
 */
import { useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import type { TodayLine } from "../../lib/post-session";
import { useUnsavedChanges } from "../unsaved-changes";
import { DEFAULT_WEIGHT_STEP_LB, bumpWeight, nextWeightChangeLine, parseWeightEntry } from "./next-weight";

export type SaveNextWeight = (machineId: string, weight: number, today: number | null) => void | boolean | Promise<void | boolean>;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** True when a row has a next weight to set: performed, with a weight. */
export function takesNextWeight(line: Pick<TodayLine, "outcome" | "weight">): boolean {
  return line.outcome === "performed" && line.weight !== null;
}

export function NextWeightStepper({ line, onSave, step = DEFAULT_WEIGHT_STEP_LB }: { line: TodayLine; onSave: SaveNextWeight; step?: number }) {
  const today = line.weight;
  const [weight, setWeight] = useState<number>(today ?? 0);
  const [text, setText] = useState<string>(fmt(today ?? 0));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const seq = useRef(0);

  const typedDirty = parseWeightEntry(text) !== weight;
  useUnsavedChanges(typedDirty, `the next session's weight on ${line.name}`, {
    onDiscard: () => setText(fmt(weight)),
  });

  const save = (w: number) => {
    setWeight(w);
    setText(fmt(w));
    setState("saving");
    const mine = ++seq.current;
    Promise.resolve(onSave(line.machineId, w, today)).then(
      (ok) => mine === seq.current && setState(ok === false ? "failed" : "saved"),
      () => mine === seq.current && setState("failed"),
    );
  };

  const commitTyped = () => {
    const n = parseWeightEntry(text);
    if (n === null) {
      setText(fmt(weight));
      return;
    }
    if (n !== weight) save(n);
  };

  const change = nextWeightChangeLine(weight, today);
  const changed = today !== null && weight !== today;
  const btn =
    "min-h-11 min-w-11 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) transition-transform text-ink-d1 flex items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)";

  return (
    <div className="flex flex-col items-end gap-0.5" data-testid="next-weight-row" data-machine={line.machineId}>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} aria-label={`Lower ${line.name}'s next weight by ${step} lb`} onClick={() => save(bumpWeight(weight, -1, step))}>
          <Minus size={16} strokeWidth={2.5} />
        </button>
        {/* Its edge turns blue once the weight differs from today (data-changed). */}
        <label className="flex items-center gap-1 min-h-11 rounded-xl border border-input bg-(--well) shadow-(--elev-0) px-2 data-changed:border-(--eq-live)" data-changed={changed ? "" : undefined}>
          <input
            type="text"
            inputMode="decimal"
            className={`w-14 bg-transparent text-center font-mono tabular-nums text-[17px] font-bold outline-none ${changed ? "text-(--eq-live-text)" : "text-ink-d1"}`}
            aria-label={`${line.name}: next session's weight in pounds`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />
        </label>
        <button type="button" className={btn} aria-label={`Raise ${line.name}'s next weight by ${step} lb`} onClick={() => save(bumpWeight(weight, 1, step))}>
          <Plus size={16} strokeWidth={2.5} />
        </button>
        {/* A fixed slot, so the tick arriving moves nothing. */}
        <span className="w-4 flex items-center justify-center" aria-hidden="true">
          {state === "saved" && <Check size={14} strokeWidth={3} className="text-(--eq-ok)" />}
        </span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" data-testid="next-weight-state">
        {state === "saved" ? `${change ? `${change}. ` : ""}Saved for next time` : ""}
      </span>
      {state === "failed" && <span className="text-[12px] font-bold text-(--eq-warn)">Not saved. Set it again.</span>}
    </div>
  );
}
