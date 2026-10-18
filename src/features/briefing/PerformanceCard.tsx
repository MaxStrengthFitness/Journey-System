/**
 * HOW HAVE THEY BEEN DOING? — the briefing's question 3 (the briefing round,
 * Oct 17 2026; AJ's handoff). Brief by default: how last time went, in a few
 * lines (a machine short of the client's usual, a skip and why). Behind one
 * tap, the last sessions on today's machines as FileMaker's grid of numbers,
 * newest first; behind a quieter one, every other machine done in them.
 *
 * The grid is the handoff's placeholder ("build the data and placeholder,
 * then design the visualization in its own round"): plain numbers, no chart,
 * nothing coloured as good or bad, nothing that suggests a weight.
 * performance.ts is the pure half.
 */
import { useMemo, useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import type { ExerciseLog, Machine, WorkoutSession } from "../../types";
import { PERFORMANCE_SESSIONS, otherMachinesDone, performanceGrid } from "./performance";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (day: string | null) => (day ? `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}` : "—");

export interface PerformanceCardProps {
  /** How last time went, in sentences (stack.ts `lastTimeLines`). */
  lines: readonly { key: string; text: string; kind?: string }[];
  /** Today's machines, in order. */
  today: readonly string[];
  logs: readonly ExerciseLog[];
  sessions: readonly WorkoutSession[];
  machines: readonly Machine[];
  nameOf: (id: string) => string;
}

export function PerformanceCard({ lines, today, logs, sessions, machines, nameOf }: PerformanceCardProps) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const others = useMemo(() => otherMachinesDone(logs, today), [logs, today]);
  const anyToday = useMemo(() => performanceGrid({ machineIds: today, logs, sessions, machines }).columns.length > 0, [today, logs, sessions, machines]);
  const grid = useMemo(
    () => (open ? performanceGrid({ machineIds: all ? [...today, ...others] : today, logs, sessions, machines }) : null),
    [open, all, today, others, logs, sessions, machines],
  );

  // A client with nothing recorded in Journey and nothing to say about last time: no card.
  if (lines.length === 0 && !anyToday && others.length === 0) return null;

  return (
    <section className="br-card br-perf" aria-label="How they've been doing">
      <span className="br__label">
        <TrendingUp className="w-3.5 h-3.5" aria-hidden />
        How they've been doing
      </span>

      {lines.length > 0 && (
        <ul className="br-since__lines" data-testid="briefing-last-time">
          {lines.map((line) => (
            <li key={line.key} className="br-since__line" data-kind={line.kind}>
              {line.text}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="br-perf__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="briefing-perf-toggle"
      >
        The last {PERFORMANCE_SESSIONS} sessions
        <ChevronDown className="w-4 h-4" aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && grid && (
        <>
          {grid.columns.length === 0 ? (
            <p className="br-perf__none">Nothing recorded in Journey on today's machines yet.</p>
          ) : (
            <div className="br-perf__scroll">
              <table className="br-perf__table" data-testid="briefing-perf-grid">
                <thead>
                  <tr>
                    <th scope="col" className="br-perf__machine">
                      <span className="sr-only">Machine</span>
                    </th>
                    {grid.columns.map((c, i) => (
                      <th key={c.sessionId} scope="col" data-newest={i === 0 || undefined}>
                        {shortDay(c.day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.machineId}>
                      <th scope="row" className="br-perf__machine">
                        {nameOf(row.machineId)}
                      </th>
                      {row.cells.map((cell, i) => (
                        <td key={grid.columns[i].sessionId} data-newest={i === 0 || undefined}>
                          {cell ? (
                            <>
                              <b>{cell.weight ?? "—"}</b>
                              <span>{cell.reps === null ? "—" : `${cell.reps}${cell.unit === "sec" ? "s" : ""}`}</span>
                            </>
                          ) : (
                            <span className="br-perf__gap" aria-label="Not done">
                              ·
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {others.length > 0 && (
            <button type="button" className="br__more" onClick={() => setAll((v) => !v)} data-testid="briefing-perf-all">
              {all ? "Today's machines only" : "View all machines"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
