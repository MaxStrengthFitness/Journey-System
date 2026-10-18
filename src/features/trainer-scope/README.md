# The trainer scope — an iPad holds its own studios' trainers

The trainer lock, Oct 18 2026 (`docs/rounds/2026-10-18-trainer-lock.md`;
AJ: "1a 2a 3a"). Until it, `useTrainers` subscribed to the whole `trainers`
collection, the boot read it a second time, and the rules let any signed-in
account read any trainer record: a person's name, email, role, photo,
studios and Kaizen Roster (clients' names with a reason and a note), on every
iPad in the company. The Gemini review of Oct 18 flagged it (AJ: "3a").

## The rule, in words

Two people read each other's record when they **share a studio**, in any of
the ways a person is tied to one: home, also works at, a guest, owns, the
grant. The company tier (`Admin`, `Founder`, `Overseer`) reads everyone. A
person reads their own record always. A signed-in account with no record
reads one thing: a profile made for them in advance, by their own sign-in
email, so they can claim it (AJ's 1a: nothing else, so a Microsoft account
whose sign-in carries no email uses Request Access instead). Demo Mode's
studio is everyone's, so its practice trainers are in every scope.

A leader sees the studios they run, not their group (AJ's 2a): the corporate
group rule waits for the bookings lock. `firestore.rules`'
`trainerRecordReadable` asks the same question of every document.

## The files

| File | What |
| --- | --- |
| `scope.ts` | `trainerScopeFor(record)`: `all`, or the studios (`readableStudioIds` plus the grant plus `demo-studio`, capped at 30). `scopeKey` for effects. `inScope` for a screen with an id in hand. `SCOPE_FIELDS`, the five fields |
| `read.ts` | `trainerQueriesFor(scope)`: the five queries, written out so the index guard reads each; `readTrainers(scope, "cache" \| "server")` for a one-off read; `uniqueDocs` |
| `merge.ts` | `mergeAnswers`: one list from several listeners, nothing until every one has answered, from the cache while any is; `inListOrder`, the app's order (`order`, then the name) |
| `names.ts` | `trainerNameFor`, `trainerShortNameFor`, `trainerInitialsFor`: the record's name, else the name the document carries, else "A trainer from another studio" (`ANOTHER_STUDIOS_TRAINER`), never nothing |
| `src/hooks/useTrainers.ts` | the live listeners, one per query, restarted only when the studios change |
| `src/hooks/useAuthInitialization.ts` | the boot's read of the list, the same queries, the iPad's copy first |
| `src/AppContent.tsx` | the scope from the signed-in record (`useMemo`), and the Operations / Admins refresh |
| `admin/provisional/mergeClient.ts` | the merge's Kaizen Roster repoint reads the merging person's scope, never the whole collection |

## The five queries and their indexes

| Reads | Query | Index (`firestore.indexes.json`) |
| --- | --- | --- |
| People homed at my studios | `primaryHomeStudioId in S` | `(primaryHomeStudioId, fullName)` |
| People who also work at one | `accessibleStudioIds array-contains-any S` | `(accessibleStudioIds CONTAINS, fullName)` |
| Guests at one | `activeGuestStudioIds array-contains-any S` | `(activeGuestStudioIds CONTAINS, fullName)` |
| The owner of one | `ownedStudioIds array-contains-any S` | `(ownedStudioIds CONTAINS, fullName)` |
| Someone with the grant at one | `managedStudioIds array-contains-any S` | `(managedStudioIds CONTAINS, fullName)` |

Proved on the emulator before the round was built: the rules engine proves
an `in` filter against the rule's `in` test and an `array-contains-any`
filter against `hasAny`, so each query is accepted whole; the unfiltered
list, and another studio's, are refused.

## Why five listeners and not one field

A denormalised `studioIds` list on every record would make this one query,
one index and one rule clause, at the price of a new field every writer (the
app's five editors, the staff webhook, the seeder, four scripts) must keep,
and a backfill. Five small listeners cost nothing at a team's size and change
no document. Worth revisiting only if they show in the boot report.

## What a screen does with a name it can't find

A session carries the name Start stamped on it, so history still reads "with
Sam" after Sam moves studio. Where a screen needs the record itself (a photo,
a profile) for an id outside the scope, it says **"a trainer from another
studio"** rather than nothing. The round document's phase 3 lists each place.

## Tests

`scope.test.ts`, `merge.test.ts`; `src/lib/firestore-indexes.test.ts` holds
the five indexes; `tests/firestore.rules.test.ts`, "the trainer lock", holds
the rule.
