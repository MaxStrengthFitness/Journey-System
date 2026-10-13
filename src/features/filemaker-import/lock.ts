/**
 * WHETHER A RUN MAY WRITE TO THE REAL DATABASE.
 *
 * The full import is switched off (`PRODUCTION_IMPORT_READY` in the script)
 * until the pre-launch reset has run, the full export with the trainer per
 * visit is here, and AJ says go. Before that, a TRIAL may write a handful of
 * clients, to see how imported history looks on real records (AJ, Oct 12
 * 2026: "can i import just one clients data to see how it looks?", then
 * "Lets do all 3"). A trial is asked for by name (`--trial`) and refused past
 * TRIAL_MAX_CLIENTS, so a whole studio's export can never go in by accident.
 * The emulator is never locked.
 */

/** The most clients a trial writes. */
export const TRIAL_MAX_CLIENTS = 5;

export interface WriteLock {
  /** The full import is switched on. */
  ready: boolean;
  emulator: boolean;
  /** `--trial` was given. */
  trial: boolean;
  /** Clients this run would write at least one session for. */
  clientsToWrite: number;
}

/** Why a commit is refused, or null when it may go ahead. */
export function writeRefusal(lock: WriteLock): string | null {
  if (lock.emulator) return null;
  if (lock.trial && lock.clientsToWrite > TRIAL_MAX_CLIENTS) {
    return `a trial writes at most ${TRIAL_MAX_CLIENTS} clients, and this run would write ${lock.clientsToWrite}. Give it fewer clients' files.`;
  }
  if (lock.ready || lock.trial) return null;
  return (
    "writing to the real database is switched off until:\n" +
    "  1. the pre-launch reset has run (after an import it would zero imported clients' counts);\n" +
    "  2. the full export is here, with the trainer per visit;\n" +
    "  3. AJ says go (PRODUCTION_IMPORT_READY in the script).\n" +
    `Rehearse on the emulator meanwhile (--emulator), or write a trial of at most ${TRIAL_MAX_CLIENTS} clients (--trial).`
  );
}
