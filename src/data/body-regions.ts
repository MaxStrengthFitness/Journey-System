/**
 * Canonical body regions for the pre-session check-in body state tracker.
 * Order matters — this is the display order in the picker.
 */
export const BODY_REGIONS = [
  // A headache (the briefing round, Oct 17 2026; AJ's F20 note). Recorded like
  // any spot; nothing reads it as a reason to change a machine.
  'Head',
  'Neck',
  'Shoulders',
  'Upper Back',
  'Chest',
  'Lower Back',
  'Core',
  'Hips',
  'Glutes',
  'Quads',
  'Hamstrings',
  'Knees',
  'Calves',
  'Ankles',
  'Wrists / Forearms',
] as const;

export type BodyRegion = typeof BODY_REGIONS[number];
