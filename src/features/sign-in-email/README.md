# Sign-in email

Which address signs in as which person (the sign-in email round, Oct 20 2026). The decision, with AJ's words, is `docs/DECISIONS.md#sign-in-email`.

## The problem

Sign-in finds a person by `trainers/{uid}`, then by the `email` stored on a record (`hooks/useAuthInitialization.ts`). Most real trainer records were made in August under an auto-id with no email, so a first Microsoft sign-in matched nobody, became a request, and approving it made a **second** record with no Mindbody staff id. My Studio → Team showed Mindbody's FirstName@ address under each name, which looked like the sign-in address and wasn't.

## What it does

| Where | What |
| --- | --- |
| **Signs in as** (the person editor, `admin/staff/StaffEditor.tsx`) | Journey's address. "Mindbody has …" beside it, copied only by **Use this**. |
| **Move this address?** | Saving an address another live record holds moves it in one batch: set here, cleared there (`emailWrites`). |
| **A record nobody has signed in as** | The address also turns on `pendingClaim`, so the first sign-in moves the record to the person's uid with its role, studios and Mindbody id (`trainer-identity/claim.ts`). |
| **Who is this?** (a sign-in request) | Link an existing record, approve someone on Mindbody's staff list (the account carries `mindbodyStaffId`), or a new person. The likeliest answer is suggested, never assumed (`whoIsThis`). |

## Files

- `sign-in-email.ts`: pure. `normalEmail`, `looksLikeEmail`, `neverSignedIn` (an auto-id of 20 characters, no `authUid`, not a tombstone or a Demo Mode trainer: the same test as the rules), `holdersOf`, `emailWrites`, `addressFits` (first initial and last name, first name, and three rarer patterns), `whoIsThis`.
- `sign-in-email.test.ts`: the above.
- The screen is `admin/staff/StaffEditor.tsx` (its render test has a "who signs in as whom" block); `admin/staff/roster.ts` gives `mindbodyOnly` and no longer shows Mindbody's address as a row's email.
- `merge.ts`: Merge (the kept record's patch, the tombstone) for Admins → Team and `scripts/merge-trainer-records.ts`, which also moves every stored reference. `merge.test.ts`.
- The Team screen is `admins/studios/StudioTeam.tsx` and `team-board.ts`; the Hub reads a merged record's bookings as the kept one's (`hub-schedule/columns.ts` `mergedAliases`).

## Why it is shaped this way

- **The rules know you only at `trainers/{uid}`** (`callerTrainer`). An email written on an auto-id record would let the person open it but hold no studio, so linking always goes through the claim.
- **Only when the address changes.** A save that only changes initials never sends `pendingClaim`, so it never reaches for the email's rule, which is stricter (every studio the person works at must be one you run).
- **Who can be linked** is whoever's address this viewer may set (`staffEditLimits`: not read-only, email not locked), so the list never offers what the rules would refuse.
- **One address, one person** is checked against the people this iPad can see. A leader can't see another studio's trainers (the trainer lock), so a holder there isn't found; sign-in still takes the first record by id.
- **Administrators only.** AJ, the same afternoon: "Read-only for leaders". My Studio → Team shows the editor with `lockedReason` (nothing saves, nothing is approved); Admins → Studios → a studio → Team is where people are changed, merged and let in. The rules were left as master's: an administrator already may do all of it.
- **Merge moves no bookings from the screen.** A booking stores its trainer's record id when synced; the Hub reads a merged record's id as the kept one's (`mergedAliases`), and the next sync rewrites today onward. The script moves them all, for a record with history.
- **A suggestion is a reason, not a guess.** "Who is this?" starts on a person only when the address or the typed name fits them, and says which; otherwise it starts on "A new person".

## AJ's own records

`scripts/aj-accounts-oct20.ts` (dry run by default; `--commit --expect 4`): jurgensaj@gmail.com is Admin with no Mindbody id, ajurgens@maxstrengthfitness.com is the trainer with 100000012, and the two leftovers at Solon are switched off.
