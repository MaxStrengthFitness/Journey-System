/**
 * The Hub's day as a list, on a phone (Journey Lite, Oct 1 2026; rows since
 * the phone minimalist round, Oct 19 2026).
 *
 * Drawn in place of HubGrid when `usePhone()` says so; ClientsView keeps
 * every read, the top, the Peek and the cards (`renderCard` is the grid's
 * own, drawn dense), so a phone sees the same day an iPad does, one booking
 * under the next. The order and the Now line are `day-list.ts`.
 *
 * A row is the time, then the card, about a dozen to a screen (AJ, Oct 19
 * 2026: "the phone mode is the minimalist mode, we can get rid of a lot of
 * the features on the screen so that way we get more information on the
 * screen"). On Everyone, whose booking it is sits under the time, so the
 * card's line is the name's alone.
 */
import type { ReactNode } from "react";
import { clockWords } from "../hub-schedule/grid-model";
import { planDayList, type DayBlock } from "./day-list";
import "./phone.css";

/** One booking's row: the time (and whose, on Everyone), then the Hub's own card. */
export function PhoneRow<B extends DayBlock>({ block, card, withText }: { block: B; card: ReactNode; withText: string | null }) {
  const clock = clockWords(block.span.from);
  return (
    <li className="ph-day__row" data-block-key={block.key}>
      <div className="ph-day__time">
        <span>
          {clock.replace(/ ([AP]M)$/, "")}
          <small>{clock.slice(-2)}</small>
        </span>
        {withText && <em className="ph-day__with">{withText}</em>}
      </div>
      <div className="ph-day__card">{card}</div>
    </li>
  );
}

/** The Now line: where the day is, on today. */
export function NowLine({ nowMin }: { nowMin: number | null }) {
  return (
    <li className="ph-day__now" aria-label={`Now, ${nowMin !== null ? clockWords(nowMin) : ""}`}>
      Now
    </li>
  );
}

export function PhoneDayList<B extends DayBlock>({
  blocks,
  columnOrder,
  mineOnly,
  nowMin,
  renderCard,
  withWords,
  emptyWords,
  hidden,
}: {
  blocks: B[];
  columnOrder: string[];
  mineOnly: string | null;
  nowMin: number | null;
  /** The Hub's own card for a block. */
  renderCard: (block: B) => ReactNode;
  /** "with Sam" on Everyone, null when the card already says whose it is. */
  withWords: (block: B) => string | null;
  /** What an empty day says; null while it can't say yet. */
  emptyWords: string | null;
  hidden?: boolean;
}) {
  const { rows, nowBefore } = planDayList({ blocks, columnOrder, mineOnly, nowMin });
  return (
    <div className="ph-day" hidden={hidden}>
      {rows.length === 0 ? (
        emptyWords ? <p className="ph-day__empty">{mineOnly ? "Nobody booked with you on this day." : emptyWords}</p> : null
      ) : (
        <ol className="ph-day__list">
          {rows.map((block, i) => (
            <FragmentRow key={block.key} showNow={nowBefore === i} nowLine={<NowLine nowMin={nowMin} />}>
              <PhoneRow block={block} card={renderCard(block)} withText={withWords(block)} />
            </FragmentRow>
          ))}
          {nowBefore === rows.length && <NowLine nowMin={nowMin} />}
        </ol>
      )}
    </div>
  );
}

function FragmentRow({ showNow, nowLine, children }: { showNow: boolean; nowLine: ReactNode; children: ReactNode }) {
  return (
    <>
      {showNow && nowLine}
      {children}
    </>
  );
}
