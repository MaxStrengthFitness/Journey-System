/**
 * HOW THE CODEX REFERS TO A CLIENT — "How to coach him", "Her why", "Their why".
 *
 * Client codex, Sep 2026. The approved mockup writes she and her throughout,
 * and clients are not all women. The header prints the client's name once and
 * owns it (commit 1642a75), so the pages' own copy uses a pronoun instead of
 * repeating the name.
 *
 * The pronoun follows the gender Mindbody holds (AJ, Oct 15 2026: "We
 * defiently need to read client gender"): Male is he, Female is she, and
 * anything else (blank, missing, "Other", "Prefer not to say", Mindbody's
 * "None") is they. `pronounsFor` is the ONE place a client's gender becomes a
 * pronoun; `pronouns.test.ts` fails if another source file does it. A wrong
 * gender is fixed in Mindbody and Journey takes it on the next sync; Journey
 * adds no editor of its own. The first name is a word a sentence may use
 * instead of "they"; it is never read to guess a gender.
 *
 * History: Sep 24 2026 Female was she and Male was he; Oct 3 2026 that went
 * and every client was they (AJ, on a man's row: "it says her when its a
 * man" — text hard-coded as "her", not the app reading gender); Oct 15 2026
 * the gender came back, with they for the rest. Where a sentence reads as
 * well without a pronoun, it keeps none.
 *
 * Grammar: "they" takes the plural verb ("they are", "they say"), so pass both
 * forms to `agree` rather than adding an "s": `agree(p, "says", "say")`.
 */

export interface Pronouns {
  /** she · he · they */
  subject: "she" | "he" | "they";
  /** her · him · them */
  object: "her" | "him" | "them";
  /** Before a noun: her · his · their ("their why"). */
  possessive: "her" | "his" | "their";
  /** On its own: hers · his · theirs ("the choice is theirs"). */
  possessiveAlone: "hers" | "his" | "theirs";
  /** herself · himself · themselves */
  reflexive: "herself" | "himself" | "themselves";
  /** True for "they": the verb that follows is the plural form. */
  plural: boolean;
}

/** they, them, their: a client whose gender Mindbody doesn't give as Male or Female, and the default. */
export const CLIENT_PRONOUNS: Pronouns = Object.freeze<Pronouns>({
  subject: "they",
  object: "them",
  possessive: "their",
  possessiveAlone: "theirs",
  reflexive: "themselves",
  plural: true,
});

const HE: Pronouns = Object.freeze<Pronouns>({
  subject: "he",
  object: "him",
  possessive: "his",
  possessiveAlone: "his",
  reflexive: "himself",
  plural: false,
});

const SHE: Pronouns = Object.freeze<Pronouns>({
  subject: "she",
  object: "her",
  possessive: "her",
  possessiveAlone: "hers",
  reflexive: "herself",
  plural: false,
});

/**
 * A client's pronouns, from the gender on their record (Mindbody's, or the one
 * typed for a client Mindbody doesn't hold): "Male" (or "M") is he, "Female"
 * (or "F") is she, trimmed and in any case; anything else is they. Always one
 * of three shared objects, so a memo that depends on it stays put.
 */
export function pronounsFor(client: { gender?: unknown } | null | undefined): Pronouns {
  const g = typeof client?.gender === "string" ? client.gender.trim().toLowerCase() : "";
  if (g === "male" || g === "m") return HE;
  if (g === "female" || g === "f") return SHE;
  return CLIENT_PRONOUNS;
}

/** The verb form that agrees with the pronoun: `agree(p, "is", "are")`. */
export function agree(p: Pronouns, singular: string, pluralForm: string): string {
  return p.plural ? pluralForm : singular;
}
