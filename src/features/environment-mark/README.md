# The PC build's mark

One line at the top of every screen of a development build: **"PC build · live data"** (the pre-launch round, Oct 10 2026, `docs/rounds/2026-10-10-prelaunch.md`). `npm run dev` on AJ's PC talks to production (`CLAUDE.md`, Environments), so once trainers are on the app a test on the PC, or on an iPad pointed at the PC, writes real client records. This line says so, the Active Session included.

`EnvironmentMark.tsx` is the whole feature; `AppContent.tsx` draws it in the shell, beside the Demo Mode strip under the status-bar strip.

## The rules

- **Never in a production build.** `import.meta.env.DEV` is false there and Vite replaces it at build time, so the words are not in the bundle. The perf lab's build is a production build too, and `environmentWords` returns nothing for it.
- **It covers nothing.** It is a line in the shell's flow, so the screen below is one line shorter; it pays no safe-area inset (`src/features/home-screen/`).
- **Nothing to tap.** No button and no dismiss: a mark you can close is a mark you forget.
- **Plum, the caution colour** (the Navy Frame): `--eq-warn` words on `--eq-warn-fill`, 12px bold.
- **The words follow the project the build talks to**: "PC build · live data" for the live project (`LIVE_PROJECT_ID`), "PC build · test data" for any other.

`EnvironmentMark.render.test.tsx` mounts it and holds the words, the plum tokens and the absence of anything to tap.
