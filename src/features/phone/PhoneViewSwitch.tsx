/**
 * THE PHONE'S ONE SWITCH (the phone minimalist round, Oct 19 2026):
 * My day · Everyone · My week. It replaces the Focus switch the phone drew
 * under the week (Me | Everyone, hub-schedule/DayHeader's DaySummary) and
 * adds the week, so the phone's Schedule has one row of choices and nothing
 * else under the strip.
 *
 * With no column of your own on the day there is no "my" to narrow to
 * (focus.ts): the switch is then Day · Week, everyone's.
 *
 * The segmented control is the Hub's own (hd-seg, day-header.css): the firm
 * 3:1 edge, blue for the choice made, 40px tall.
 */
import type { HubFocus, HubRange } from "../hub-schedule/focus";
import "../hub-schedule/day-header.css";
import "./phone.css";

export type PhoneView = "me" | "everyone" | "week";

export function phoneViewOf(focus: HubFocus, range: HubRange): PhoneView {
  return range === "week" ? "week" : focus;
}

export function PhoneViewSwitch({ value, hasColumn, onChange }: { value: PhoneView; hasColumn: boolean; onChange: (next: PhoneView) => void }) {
  const choices: Array<{ id: PhoneView; label: string }> = hasColumn
    ? [
        { id: "me", label: "My day" },
        { id: "everyone", label: "Everyone" },
        { id: "week", label: "My week" },
      ]
    : [
        { id: "everyone", label: "Day" },
        { id: "week", label: "Week" },
      ];
  return (
    <div className="ph-view">
      <div className="hd-seg ph-view__seg" role="group" aria-label="What the list shows">
        {choices.map((c) => (
          <button key={c.id} type="button" className="hd-seg-btn" aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
