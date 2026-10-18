/**
 * WHAT A SCREEN SAYS FOR A TRAINER IT CAN'T FIND (the trainer lock, Oct 18
 * 2026). The list an iPad holds is the people of the signed-in person's
 * studios, so an id on a record can point outside it: a trainer who moved
 * to Strongsville and coached this client last spring, a job posted by
 * someone who has since left the studio's lists. Such an id is not an
 * error and not nobody; it is a trainer from another studio.
 *
 * The order: the record's name when the list holds it; else the name the
 * document itself carries (Start stamps `trainerName` on every session, a
 * job carries its poster's name), which is what a client's history reads
 * after a coach moves; else the words below. Never an empty string, never
 * "Unknown", and never a guess by initials when the record carries an id:
 * two people share initials, and the one the list holds is not the one who
 * coached.
 *
 * PURE MODULE.
 */

/** The words for a trainer the list doesn't hold, as a name. */
export const ANOTHER_STUDIOS_TRAINER = "A trainer from another studio";

/** The same words inside a sentence ("Started by a trainer from another studio"). */
export const ANOTHER_STUDIOS_TRAINER_MID = "a trainer from another studio";

/** A trainer record as the names read it. */
export interface NamedLike {
  fullName?: string | null;
  nickname?: string | null;
  initials?: string | null;
}

/** A trainer record as the lookups read it: the document id, or an older account's sign-in uid. */
export interface IdLike {
  id?: string | null;
  authUid?: string | null;
}

/** A name that is really there: not blank, not whitespace. */
function said(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

/**
 * The record an id names: by document id, else by an older account's sign-in
 * uid (the two differ on older accounts). Undefined for a trainer the list
 * doesn't hold, which a screen reads as "from another studio", never as a
 * cue to match by initials.
 */
export function findTrainerRecord<T extends IdLike>(trainers: readonly T[], id: string | null | undefined): T | undefined {
  const key = said(id);
  if (!key) return undefined;
  return trainers.find((t) => t.id === key) ?? trainers.find((t) => t.authUid === key);
}

/**
 * The name to say for a trainer: the record's full name, else the name the
 * document carries, else "A trainer from another studio".
 */
export function trainerNameFor(record: NamedLike | null | undefined, stored?: string | null): string {
  return said(record?.fullName) ?? said(stored) ?? ANOTHER_STUDIOS_TRAINER;
}

/**
 * The short name (nickname, else first name) the same way; the stored name's
 * first word when the list doesn't hold the record.
 */
export function trainerShortNameFor(record: NamedLike | null | undefined, stored?: string | null): string {
  const own = said(record?.nickname) ?? said(record?.fullName);
  const fromStored = said(stored);
  const whole = own ?? fromStored;
  if (!whole) return ANOTHER_STUDIOS_TRAINER;
  return whole.split(/\s+/)[0];
}

/**
 * Initials the same way: the record's, else from the stored name, else "?"
 * (a mark for a chip or an avatar, where words don't fit).
 */
export function trainerInitialsFor(record: NamedLike | null | undefined, stored?: string | null): string {
  const own = said(record?.initials);
  if (own) return own;
  const name = said(record?.fullName) ?? said(stored);
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
