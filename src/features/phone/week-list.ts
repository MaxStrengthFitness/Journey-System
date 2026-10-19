/**
 * MY WEEK on a phone: the pure half (the phone minimalist round, Oct 19
 * 2026; AJ: make mobile "useful for trainers to use at home to plan their
 * week and know their schedules easy").
 *
 * The next seven days in one scroll, a heading per day, each day's bookings
 * as the same rows the day list draws. It is the Hub's own window
 * (hub-window.ts: the strip's seven days are already read for the week
 * strip's counts), so no new read, no new Mindbody call and no new index.
 * Each day is laid out the way the Hub lays out the day on screen: the
 * same column plan (a booking finds its trainer by id, never by name), the
 * same list order (day-list.ts), the Now line on today only.
 *
 *   - My week is YOUR bookings (your column) on each day; with no column of
 *     your own it is everyone's, as the day list is (focus.ts).
 *   - A day with nothing booked is still a heading: a free day is what a
 *     trainer planning the week wants to see, never a day gone missing.
 *   - A day whose bookings aren't read yet says so under its heading, as
 *     the day list does (a failed read is unknown, never a quiet day).
 */
import { safeToDate } from "../../lib/utils";
import { studioDayBoundsForKey, zonedHM } from "../../lib/studio-time";
import { planDayList, type DayBlock } from "./day-list";

/** The booking fields the Hub reads a start and an end from. */
export interface WeekBooking {
  id?: unknown;
  mindbodyAppointmentId?: unknown;
  startTime?: unknown;
  StartDateTime?: unknown;
  date?: unknown;
  endTime?: unknown;
  EndDateTime?: unknown;
  status?: unknown;
}

/** Minutes since the studio's midnight: where a booking sits on the grid (the Hub's own). */
function studioMinutes(date: Date): number {
  const hm = zonedHM(date);
  return hm ? hm.hour * 60 + hm.minute : 0;
}

const startOf = (b: WeekBooking) => safeToDate((b.startTime || b.StartDateTime || b.date) as never);

/**
 * The bookings that start on a studio day, not cancelled, earliest first:
 * the Hub's own filter for the day on screen (ClientsView's
 * `todaysSchedules`), for any day of the strip.
 */
export function bookingsOnDay<T extends WeekBooking>(bookings: ReadonlyArray<T>, dayKey: string): T[] {
  const { start, end } = studioDayBoundsForKey(dayKey);
  return bookings
    .filter((b) => {
      if (!b || b.status === "Cancelled") return false;
      const at = startOf(b);
      return !!at && at >= start && at <= end;
    })
    .sort((a, b) => (startOf(a)?.getTime() ?? 0) - (startOf(b)?.getTime() ?? 0));
}

export interface WeekBlock<T extends WeekBooking = WeekBooking> extends DayBlock {
  booking: T;
}

/**
 * A day's bookings as list blocks, in the Hub's own shape (HubGrid's
 * GridBlock plus `staff`): the key the Hub keys its peek on, the column the
 * plan put it in, its span in studio minutes (a missing or backwards end is
 * half an hour, as on the grid). A booking the plan left out (no column) or
 * with no readable start is no block.
 */
export function blocksOf<T extends WeekBooking>(
  bookings: ReadonlyArray<T>,
  columnOf: ReadonlyArray<string | null>,
  isStaff: (b: T) => boolean,
): WeekBlock<T>[] {
  const out: WeekBlock<T>[] = [];
  bookings.forEach((b, i) => {
    const columnId = columnOf[i] ?? null;
    if (columnId === null) return;
    const start = startOf(b);
    if (!start) return;
    const end = safeToDate((b.endTime || b.EndDateTime) as never);
    const from = studioMinutes(start);
    let to = end ? studioMinutes(end) : from + 30;
    if (to <= from) to = from + 30;
    out.push({
      key: String(b.id || b.mindbodyAppointmentId || `${columnId}-${from}-${i}`),
      columnId,
      span: { from, to },
      booking: b,
      staff: isStaff(b),
    });
  });
  return out;
}

export interface WeekDayInput<B extends DayBlock> {
  key: string;
  blocks: B[];
  /** The day's column ids in the grid's left-to-right order. */
  columnOrder: string[];
}

export interface WeekDay<B extends DayBlock> {
  key: string;
  rows: B[];
  /** Where the Now line goes on today (day-list.ts); null on any other day. */
  nowBefore: number | null;
}

/** The week, day by day, each laid out as the day list lays out a day. */
export function planWeekList<B extends DayBlock>({
  days,
  mineOnly,
  todayKey,
  nowMin,
}: {
  days: ReadonlyArray<WeekDayInput<B>>;
  mineOnly: string | null;
  todayKey: string;
  /** Minutes into the studio day right now, for today's Now line. */
  nowMin: number | null;
}): WeekDay<B>[] {
  return days.map((d) => {
    const plan = planDayList({ blocks: d.blocks, columnOrder: d.columnOrder, mineOnly, nowMin: d.key === todayKey ? nowMin : null });
    return { key: d.key, rows: plan.rows, nowBefore: plan.nowBefore };
  });
}

/**
 * A day's heading: "Today · Mon 19", "Tomorrow · Tue 20", then "Wed 21".
 * Read at noon UTC so the key's own calendar day holds whatever the phone's
 * zone (hub-day.ts's dayTitle does the same).
 */
export function dayHeading(key: string, todayKey: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const words = `${date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d}`;
  if (key === todayKey) return `Today · ${words}`;
  const [ty, tm, td] = todayKey.split("-").map(Number);
  if (ty && tm && td) {
    const tomorrow = new Date(Date.UTC(ty, tm - 1, td + 1, 12));
    if (tomorrow.getTime() === date.getTime()) return `Tomorrow · ${words}`;
  }
  return words;
}

/** "3 booked", "1 booked", "Nothing booked": the count a heading says. */
export function countWords(n: number): string {
  if (n === 0) return "Nothing booked";
  return `${n} booked`;
}
