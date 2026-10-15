# Cloud Functions

`functions/src/` holds Journey's Firebase Cloud Functions: the small programs that run on Google's side when something is written to the database, when Mindbody sends a webhook, or on a schedule. `functions/src/index.ts` is the list of everything exported. They deploy separately from the web server and the cron jobs, with the Firebase CLI. Don't change the Mindbody integration or the Cloud Functions without AJ's explicit OK.

## What is here

- **`mindbodyWebhook`** (`functions/src/mindbody/`) receives Mindbody's webhook messages.
  - **Its idempotency record is a claim, not a finished record** (speed round, Oct 5 2026, `idempotency.ts`). It is a document with a 2-minute expiry, and it is marked done only after the work has committed. A message whose attempts all stopped without finishing is dead-lettered after four attempts, so a person sees it (`dlq.ts`).
- **Trainer rollups** (`trainerRollups.ts`): `recalcTrainerWindows` runs nightly and rewrites the rolling windows. `onSessionRollup` and `backfillTrainerRollups` are the other two exports in that file.
- **Staff photos** (`mindbody/staffImage.ts`) are exported but not deployed.
- **Role claims** (`claims.ts`, with the rule in `claims-logic.ts`): `syncTrainerClaims` copies a trainer's role onto their sign-in token.

## What was deleted

`onBookingReminderWrite` and `sendDailySummary` were deleted on Oct 5 2026 (speed round). **Removing an export does not delete a deployed function.** `firebase functions:delete` does, and the ship script runs it.
