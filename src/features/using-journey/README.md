# features/using-journey — the Using Journey shelf

The pure half of the trainers' guide to the app. The pages, the rules for writing them and AJ's answers are in `docs/using-journey/README.md`; start there.

| File | What it is |
| --- | --- |
| `shelf.ts` | `readPage` (a page's header and words), `wordCount`, `codeWords` (anything that reads like code), `fingerprint` (FNV-1a of the words, eight hex digits), `isApprovedAsWritten` |
| `shelf.test.ts` | The functions, and every page on the shelf held to its shape. It never fails on a screen's change or a reworded approved page (AJ's 3b): `scripts/using-journey-check.ts` reminds instead |

Nothing here imports React or Firebase, so the check script, a later build step and Ask the Academy's server can all use it.
