/**
 * THIS DEVICE (the sessions round, Oct 12 2026).
 *
 * A trainer signed in on two iPads is "the same trainer" to both
 * (lib/live-session.ts `isAnotherTrainersSession`), so both used to record
 * the same session and both could finish it. Each device now keeps an id of
 * its own, and a session carries `recordingDeviceId`, written at Start, at
 * Resume, at a take-over and at Continue on this iPad: a live session of this
 * trainer that another device is recording is watched here, or offered back
 * here, never recorded twice.
 *
 * The id lives in this browser's local storage, kept through a sign-out (it
 * belongs to the iPad, not to whoever is signed in: sign-out's DEVICE_KEYS).
 * The Home Screen app and a Safari tab on one iPad keep separate storage,
 * and cleared site data makes a new id, so nothing that reads it ever says
 * "your other iPad": "another device".
 *
 * Never a lock-out: an id that can't be stored and read back is null, and a
 * null id is never "another device". A session with no id (from before this
 * round) is recorded here as before.
 */
export const DEVICE_ID_KEY = "journey_device_id";

type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): DeviceStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const DEVICE_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

function newDeviceId(): string {
  let id = "d-";
  for (let i = 0; i < 16; i += 1) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
}

/**
 * This device's id: the one stored, else a new one, stored and read back.
 * Null whenever storage can't be read, written, or doesn't keep what was
 * written (a private window, blocked site data). Never undefined.
 */
export function thisDeviceId(storage: DeviceStorage | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    const known = storage.getItem(DEVICE_ID_KEY);
    // Only an id the finish marker's rules take (at most 64 letters, digits, - and _); anything else is made again.
    if (typeof known === "string" && DEVICE_ID_SHAPE.test(known)) return known;
    const made = newDeviceId();
    storage.setItem(DEVICE_ID_KEY, made);
    return storage.getItem(DEVICE_ID_KEY) === made ? made : null;
  } catch {
    return null;
  }
}
