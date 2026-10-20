/**
 * WHETHER A STUDIO CAN MARK LEARNING YET (the Mix for everyone, Oct 20 2026).
 *
 * AJ, Oct 20 2026: "markup hidden until its own Firestore round". Every
 * line action waits:
 *
 *   - crossing a line out, a note on a line, and "Tell head office" have
 *     nowhere to be kept: the sandbox store (markup-store.ts) lives in
 *     memory and a reload empties it, so a trainer's note would vanish
 *     without a word. Keeping them is their own round (README, "What it
 *     would take to keep the marks"), and a Firestore structure change
 *     needs AJ's explicit OK;
 *   - "Ask in Teams" builds a Learning link that the live app cannot open
 *     until the Teams link round (features/deep-link) ships.
 *
 * Off, a page's lines are plain reading: no tap, no "Tap a line to …" hint,
 * no gutter, no version switch (both versions read the same), and no head
 * office queue. Whether a studio may cross out the Academy's own words is
 * decided with that round.
 *
 * VaultProvider's `markup` is required, so no mount can forget it; the
 * vault's own tests pass it on, so the parts stay held for the day this
 * turns on.
 *
 * PURE MODULE: one constant.
 */
export const MARKUP_ON = false;
