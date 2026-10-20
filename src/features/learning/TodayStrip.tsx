import { ArrowLeft } from "lucide-react";

/**
 * THE STRIP ON TODAY'S LEARNING (the Mix for everyone, Oct 20 2026).
 *
 * Learning is the Mix. Today's pages are opened from a Mix page's door, for
 * the studio's tools the Mix does not have yet (learning-redesign/
 * today-door.ts: the floor's notes, the set-up, the drawn floor, the
 * studio's own pages, comments). While they are on, this one strip above
 * the masthead says what this place is for and leads back. LearningView asks
 * the leave gate before it goes.
 */
export function TodayStrip({ onBack }: { onBack: () => void }) {
  return (
    <div className="lv__today" role="region" aria-label="Studio tools">
      <button type="button" className="lv__today-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden />
        Back to Learning
      </button>
      <span className="lv__today-words">Studio tools</span>
    </div>
  );
}
