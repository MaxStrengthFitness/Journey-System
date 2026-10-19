/**
 * A MACHINE'S NAME, AS THE QUIZ SAYS IT.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (the content review).
 *
 * Without a live catalog, the names Learning hands the quiz are the seed's
 * (src/data/machine-definitions.ts), written in capitals and not the
 * Academy's: "CX (4 WAY NECK)", "SEATED ABDOMINALS", "HIP ABDUCTION". The
 * written questions in the same deck say "Cervical Extension" and
 * "Abdominals", and the files a built question cites (Exercise Categories,
 * the scripts, the cards) use the Academy's names too. The Catalog's rule is
 * that a movement takes the Academy's name (CLAUDE.md, The Catalog;
 * src/features/catalog/names.ts), so the quiz asks with that name, and with
 * a calm-cased one for a machine the Academy does not name.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";

/**
 * A name written all in capitals, in calm case: "SEATED ABDOMINALS" reads
 * "Seated Abdominals", "CHEST/PEC FLY" reads "Chest/Pec Fly". A name with
 * any lower-case letter is left exactly as it was written.
 */
export function calmCase(name: string): string {
  const t = name.trim();
  if (!/[A-Z]/.test(t) || /[a-z]/.test(t)) return t;
  return t.toLowerCase().replace(/[a-z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** The Academy's name for a movement, else the given name in calm case, else the id. */
export function quizMachineName(machineId: string, names: (machineId: string) => string): string {
  const academy = ACADEMY_MOVEMENT_NAME[machineId];
  if (academy) return academy;
  const given = calmCase(names(machineId) ?? "");
  return given || machineId;
}
