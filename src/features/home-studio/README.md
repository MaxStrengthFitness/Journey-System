# Booked here, filed at another studio

*Oct 20 2026. AJ: "allow studio leaders, head trainers and admins to ... see \"booked here but home studio x\" notice and allow them to pull the data over." The decision is `docs/DECISIONS.md#home-studio-notice`.*

## Why it exists

westlake, Strongsville and Willoughby share Mindbody site 29068. A client event on a shared site names no location, so a new client's home studio comes from Mindbody's **Home location** field, and Journey never moves an established client by itself (the home studio decides who may read the clinical record). Meg Pauly's Home location said westlake while she trained at Strongsville: she was filed at westlake, missing from Strongsville's directory, and her record was closed to Strongsville's leaders. Only an administrator could fix it.

## What it does

A quiet row on **Operations → Today**: "Booked here, filed at another studio: 2", the names, and on **Show** each client with where she is filed and her bookings here. **Move to {studio}** asks once more, then files her at this studio. Drawn only for people who may act and only when there is someone to move. A failed read draws nothing.

## Where the work is done

The rules stop a leader opening or editing a client filed elsewhere, on purpose, and are unchanged. So the work is two callable Cloud Functions on the Admin SDK (`functions/src/homeStudio.ts`, the rules in `functions/src/home-studio-logic.ts`, both with tests):

- `homeStudioNotices({ studioId })`: names, counts and dates only.
- `moveClientHome({ studioId, clientId })`: re-checks the evidence, then writes `homeStudioId` and nothing else.

Both accept an administrator, or a head trainer, studio leader, studio owner or franchise owner of that studio, or a trainer with the grant. `home-studio.ts` here mirrors who is offered the row (`maySeeHomeStudioNotice`); the server decides.

## Rules this keeps

- **Evidence, not a guess.** Live bookings here in the last 30 days (or ahead), none at her filed studio, same Mindbody site. Also left alone: a client who trains at both, a visitor already approved to train here (`approvedCrossTrainStudioIds`), Demo Mode, a site Journey can't tell.
- **Nothing automatic.** No timer, no ping, no Mindbody call. One ask per visit to Today, kept half an hour (`useHomeStudioNotices.ts`; the server reads a month of the studio's bookings), forgotten at sign-out.
- **Mindbody is unchanged.** The row's (i) says to ask the front desk to set her Home location there too.

## Files

- `HomeStudioNotice.tsx` (+ `.render.test.tsx`): the row, mounted in `TodayBrief.tsx`.
- `useHomeStudioNotices.ts`: the two callables, the half-hour memory.
- `home-studio.ts` (+ `.test.ts`): who is offered it, the words.
- `scripts/find-wrong-home-studio.ts`: read-only sweep of the shared-site studios for this case (`--days N`). `scripts/set-home-studio.ts`: one client, dry run by default, `--commit` writes, prints how to undo.

## Deploying it

Cloud Functions deploy with the Firebase CLI, separately from Render: `firebase deploy --only functions:homeStudioNotices,functions:moveClientHome`. The screen ships with the next Render deploy; until the functions are live the row simply doesn't appear.
