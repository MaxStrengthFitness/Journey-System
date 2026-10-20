/**
 * WHICH EMAIL SIGNS IN AS WHICH PERSON (the sign-in email round, Oct 20 2026).
 *
 * AJ: "i need to be able to easily assign and switch which email is
 * associated with which trainer account so that way when users start
 * requesting sign ins with the microsoft maxstrengthfitness email they are
 * assigned to the correct account and it doesnt make them a new one that
 * isnt assigned to the mindbody id."
 *
 * Sign-in finds a person by trainers/{uid}, then by the `email` stored on a
 * record (useAuthInitialization). Most records were made in August under an
 * auto-id with no email, so a first Microsoft sign-in matched nobody, became
 * a request, and approving it made a second record with no Mindbody staff id.
 *
 * Everything here is pure; StaffEditor writes what it returns.
 *
 *   - One address, one person. Sign-in takes the first record carrying the
 *     address, so a second holder is a coin toss. Setting an address another
 *     record holds MOVES it (`emailWrites`): one batch sets it here and clears
 *     it there.
 *   - A record nobody has signed in as (`neverSignedIn`) gets `pendingClaim`
 *     with its address, so the first sign-in moves it to the person's uid
 *     (trainer-identity/claim.ts) with its role, studios and Mindbody id. The
 *     rules only know the signed-in person at trainers/{uid}; an email alone
 *     on an auto-id record would open a profile holding no studio.
 *   - Nothing is guessed onto a record. Mindbody's address is shown beside it
 *     and copied only by a tap (AJ: an address may be first name or first
 *     initial and last name, "mine wouldnt be austin@ ... it would be
 *     ajurgens@"). `likelyPeople` orders the "Who is this?" list; a person
 *     still picks.
 */

import type { Trainer } from "../../types";

/** The one spelling an address is stored and compared in. */
export function normalEmail(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Enough of an address to sign in with: something@something.something, no spaces. */
export function looksLikeEmail(raw: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail(raw));
}

type Person = Pick<Trainer, "id" | "fullName" | "email" | "authUid" | "pendingClaim" | "supersededByUid"> & {
  isDemo?: boolean;
};

/** A tombstone or one of Demo Mode's own: never a holder, never offered. */
function isGone(t: Person): boolean {
  return Boolean(t.supersededByUid) || t.isDemo === true || t.id.startsWith("demo-trainer-");
}

/**
 * Nobody has signed in as this record: an auto-id (20 characters; a sign-in
 * uid is 28) with no authUid. The rules' leaderLinksASignIn asks the same.
 */
export function neverSignedIn(t: Person): boolean {
  return t.id.length === 20 && !t.authUid && !isGone(t);
}

/** The other live records carrying this address. */
export function holdersOf(email: string, people: readonly Person[], exceptId?: string): Person[] {
  const want = normalEmail(email);
  if (!want) return [];
  return people.filter((t) => t.id !== exceptId && !isGone(t) && normalEmail(t.email) === want);
}

export interface EmailWrite {
  id: string;
  name: string;
  patch: Record<string, unknown>;
}

/**
 * What saving `email` on `target` writes: the target first, then each other
 * holder cleared. Empty when nothing changes. A blank address clears it and
 * opens nothing.
 */
export function emailWrites(target: Person, email: string, people: readonly Person[]): EmailWrite[] {
  const next = normalEmail(email);
  const had = normalEmail(target.email);
  const opens = Boolean(next) && neverSignedIn(target) && target.pendingClaim !== true;
  if (next === had && !opens) return [];
  const patch: Record<string, unknown> = {};
  if (next !== had) patch.email = next;
  if (opens) patch.pendingClaim = true;
  const writes: EmailWrite[] = [{ id: target.id, name: target.fullName, patch }];
  for (const other of holdersOf(next, people, target.id)) {
    writes.push({ id: other.id, name: other.fullName, patch: { email: "" } });
  }
  return writes;
}

/* ---- Who is this? ------------------------------------------------------ */

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function nameParts(fullName: string | null | undefined): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: letters(parts[0] ?? ""), last: letters(parts.length > 1 ? parts[parts.length - 1] : "") };
}

/**
 * Why this address could be this person's, or null. The company's two
 * patterns first (AJ, Oct 20 2026): first name, first initial and last name.
 */
export function addressFits(email: string, fullName: string | null | undefined): string | null {
  const local = letters(normalEmail(email).split("@")[0] ?? "");
  const { first, last } = nameParts(fullName);
  if (!local || !first) return null;
  if (last && local === first[0] + last) return "first initial and last name";
  if (local === first) return "first name";
  if (last && (local === first + last || local === last + first)) return "first and last name";
  if (last && local === first + last[0]) return "first name and last initial";
  if (last && local === last) return "last name";
  return null;
}

/**
 * One answer to "Who is this?": a Journey record nobody has signed in as
 * (linking writes the address on it and opens its claim), or someone on
 * Mindbody's staff list with no record yet (approving makes the account with
 * their Mindbody staff id on it).
 */
export type WhoChoice =
  | { kind: "record"; key: string; id: string; name: string; why: string | null }
  | { kind: "mindbody"; key: string; staffId: string; name: string; why: string | null };

/**
 * Everyone a sign-in request could be, the likeliest first: how well the
 * address and the name the person typed fit, then by name. Records nobody
 * has signed in as come before Mindbody staff at the same fit.
 */
export function whoIsThis(
  request: { email?: string | null; fullName?: string | null },
  records: readonly Person[],
  mindbodyStaff: readonly { id: string; fullName?: string | null; displayName?: string | null }[] = [],
): WhoChoice[] {
  const typed = nameParts(request.fullName);
  const judge = (fullName: string) => {
    const fit = request.email ? addressFits(request.email, fullName) : null;
    const theirs = nameParts(fullName);
    const sameName = Boolean(typed.first && typed.first === theirs.first && (!typed.last || typed.last === theirs.last));
    return {
      score: (fit ? 2 : 0) + (sameName ? 1 : 0),
      why: fit ? `the address is their ${fit}` : sameName ? "the same name" : null,
    };
  };
  const scored = [
    ...records.filter(neverSignedIn).map((t) => {
      const name = t.fullName ?? "";
      return { choice: { kind: "record" as const, key: `t:${t.id}`, id: t.id, name, ...judge(name) }, rank: 0 };
    }),
    ...mindbodyStaff.map((s) => {
      const name = (s.fullName || s.displayName || "").trim();
      return { choice: { kind: "mindbody" as const, key: `mb:${s.id}`, staffId: s.id, name, ...judge(name) }, rank: 1 };
    }),
  ];
  return scored
    .sort((a, b) => b.choice.score - a.choice.score || a.rank - b.rank || a.choice.name.localeCompare(b.choice.name))
    .map(({ choice: { score: _score, ...c } }) => c);
}
