/**
 * ONE NAME FOR EACH CUE MOMENT.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (wave A integration).
 *
 * The phrasebook's headings (cues.json) carry their whole machine list inside
 * the heading ("Upper Turnaround (movements without an end stop and include a
 * squeeze - ex. row, chest flye, …)"), so every place that names a moment
 * shortens it. Three parts did that three ways: the map's node said "Upper
 * Turnaround: without an end stop and include a squeeze", the cueing page's
 * section said "Upper turnaround with a squeeze", and the peek's crumb said
 * the page's words. A trainer who taps the node and lands on the section
 * should meet one name, so the graph (graph.ts cueLabel) and the pages
 * (pages.ts) both read this.
 *
 * The words match the machine page's own cue sections (rep-phases CUE_TITLES)
 * wherever the phrasebook means the same moment; the two beginnings keep the
 * phrasebook's "pushing" and "pulling", and the two lower turns say they are
 * cued before the turn ("Before a lower turn where the stack touches").
 *
 * PURE MODULE: no React, no imports, so graph.ts and pages.ts can both read it
 * without importing each other.
 */

/** "Speed of Motion" -> "Speed of motion": the first word capitalised, codes kept. */
function sentenceCase(head: string): string {
  const words = head.split(/\s+/).filter(Boolean);
  const calm = words.map((w, i) => (i === 0 || /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
  return calm.replace(/^([^A-Za-z]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/**
 * A moment's heading, short enough to read as a section title or a node's
 * label. The full heading stays as the section's note on the cueing page.
 */
export function cueMomentLabel(moment: string): string {
  const m = moment.trim();
  if (/^lower turnaround/i.test(m)) {
    // The phrasebook says these lines are "most effectively used during the
    // eccentric", before the turn, so the name says when (rep-phases CUE_TITLES).
    if (/does not touch|doesn.t touch/i.test(m)) return "Before a lower turn where the stack does not touch";
    if (/touches/i.test(m)) return "Before a lower turn where the stack touches";
    return "Lower turnaround";
  }
  if (/^upper turnaround/i.test(m)) {
    if (/without an end stop|include a squeeze/i.test(m)) return "Upper turnaround with a squeeze";
    if (/end stop/i.test(m)) return "Upper turnaround at the end stop";
    return "Upper turnaround";
  }
  if (/^to begin/i.test(m)) {
    if (/pull/i.test(m)) return "To begin: a pulling movement";
    if (/push/i.test(m)) return "To begin: a pushing movement";
    return "To begin";
  }
  if (/apparent task failure/i.test(m)) return "At apparent task failure";
  return sentenceCase(m.split(/\s\(|\s[-–—]\s/)[0].trim());
}
