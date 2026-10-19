/**
 * MY WEEK on a phone (the phone minimalist round, Oct 19 2026; AJ's "3a":
 * the seven days in one scroll, headings between them).
 *
 * The strip's seven days, each a heading with its count, each booking a row
 * exactly as the day list draws one (PhoneRow), the Now line on today. The
 * pure half is week-list.ts; ClientsView hands over each day's blocks from
 * the Hub's own window and the same card. A tap on a day in the strip
 * scrolls to that day's heading (`scrollTo`).
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { DayReadState } from "../../lib/schedule-window";
import type { DayBlock } from "./day-list";
import { NowLine, PhoneRow } from "./PhoneDayList";
import { countWords, dayHeading, type WeekDay } from "./week-list";
import "./phone.css";

export function PhoneWeekList<B extends DayBlock>({
  days,
  todayKey,
  nowMin,
  mineOnly,
  readState,
  renderCard,
  withWords,
  scrollTo,
  hidden,
}: {
  days: ReadonlyArray<WeekDay<B>>;
  todayKey: string;
  /** Minutes into the studio day right now, for today's Now line. */
  nowMin: number | null;
  /** Whether the list is your own bookings (the empty line says whose). */
  mineOnly: boolean;
  /** Whether a day's bookings were read: "loading" and "failed" are said under the heading. */
  readState: (dayKey: string) => DayReadState;
  renderCard: (block: B, dayKey: string) => ReactNode;
  withWords: (block: B) => string | null;
  /** The day to bring into view when it changes (a tap on the strip). */
  scrollTo: string | null;
  hidden?: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollTo || hidden) return;
    const el = host.current?.querySelector<HTMLElement>(`[data-day="${scrollTo}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scrollTo, hidden]);

  return (
    <div className="ph-day ph-week" hidden={hidden} ref={host}>
      {days.map((d) => {
        const read = readState(d.key);
        const empty = d.rows.length === 0;
        return (
          <section key={d.key} className="ph-week__day" data-day={d.key} data-today={d.key === todayKey ? "true" : undefined} aria-label={dayHeading(d.key, todayKey)}>
            <h2 className="ph-week__head">
              <span>{dayHeading(d.key, todayKey)}</span>
              <small>{read === "ready" ? countWords(d.rows.length) : read === "failed" ? "Couldn’t load the bookings" : "Reading…"}</small>
            </h2>
            {empty ? (
              read === "ready" && mineOnly ? <p className="ph-week__free">Nobody booked with you.</p> : null
            ) : (
              <ol className="ph-day__list">
                {d.rows.map((block, i) => (
                  <Row key={block.key} showNow={d.nowBefore === i} nowMin={nowMin}>
                    <PhoneRow block={block} card={renderCard(block, d.key)} withText={withWords(block)} />
                  </Row>
                ))}
                {d.nowBefore === d.rows.length && <NowLine nowMin={nowMin} />}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ showNow, nowMin, children }: { showNow: boolean; nowMin: number | null; children: ReactNode }) {
  return (
    <>
      {showNow && <NowLine nowMin={nowMin} />}
      {children}
    </>
  );
}
