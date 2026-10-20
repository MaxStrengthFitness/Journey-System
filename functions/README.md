# Cloud Functions

`functions/src/` holds Journey's Firebase Cloud Functions: the small programs that run on Google's side when something is written to the database, when Mindbody sends a webhook, or on a schedule. `functions/src/index.ts` is the list of everything exported. They deploy separately from the web server and the cron jobs, with the Firebase CLI. Don't change the Mindbody integration or the Cloud Functions without AJ's explicit OK.

## What is here

- **`mindbodyWebhook`** (`functions/src/mindbody/`) receives Mindbody's webhook messages.
  - **Its idempotency record is a claim, not a finished record** (speed round, Oct 5 2026, `idempotency.ts`). It is a document with a 2-minute expiry, and it is marked done only after the work has committed. A message whose attempts all stopped without finishing is dead-lettered after four attempts, so a person sees it (`dlq.ts`).
  - **A staff number is matched by site** (the staff webhook, Oct 12 2026, `docs/rounds/2026-10-12-staff-webhook.md`; AJ: "2 and 3 I will trust your decision please be sure!"). Each Mindbody site numbers its own staff. A staff update is written onto a trainer only when Journey can place that trainer's number on the update's site (worked out from the sites of the studios they work at); two possible holders, a trainer Journey can't place, or a site no studio is linked to goes to Limbo with a sentence saying why and what to do. A booking's trainer is looked up among the trainers at the booking's studio, no longer company-wide. A claimed (merged) placeholder profile is ignored. The webhook still writes only a trainer's Mindbody details and never creates a trainer. It came with one index on `trainers` (staff number, then "also works at") that the index guard does not hold in place: don't remove it. `scripts/check-staff-sites.ts` is the read-only check.
- **Trainer rollups** (`trainerRollups.ts`): `recalcTrainerWindows` runs nightly and rewrites the rolling windows. `onSessionRollup` and `backfillTrainerRollups` are the other two exports in that file.
- **Staff photos** (`mindbody/staffImage.ts`) are exported but not deployed.
- **Home studio notice** (`homeStudio.ts`, rules in `home-studio-logic.ts`; Oct 20 2026): `homeStudioNotices` and `moveClientHome`, two callables that list and file a client booked at one studio and filed at another on a shared Mindbody site. They run on the Admin SDK because the rules stop a leader opening that client. `docs/DECISIONS.md#home-studio-notice`.
- **Role claims** (`claims.ts`, with the rule in `claims-logic.ts`): `syncTrainerClaims` copies a trainer's role onto their sign-in token.

## What was deleted

`onBookingReminderWrite` and `sendDailySummary` were deleted on Oct 5 2026 (speed round). **Removing an export does not delete a deployed function.** `firebase functions:delete` does, and the ship script runs it.
