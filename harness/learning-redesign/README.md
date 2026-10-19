# The Learning redesign harness (Oct 19 2026)

Learning on a page of its own, photographed. It mounts the app's **real**
`LearningView` (today's Learning, the prototype bar, and the three prototype
designs of the Learning vault redesign) inside a stand-in of the app's shell
(the navy header, `<main>`, the real bottom bar), for a made-up Solon with one
signed-in person, Sam Lee. Nothing reaches a database: every import of
`src/firebase` and `firebase/firestore` is answered by `stubs/` (the local
`.env` points at production, so this matters). It never ships, and it is not
part of the typecheck or the test suite.

## Photograph it

From the worktree's root (Windows PowerShell or Git Bash, Node 22+, Chrome
installed at the usual place):

```
node harness/learning-redesign/shots.mjs current          # today's Learning
node harness/learning-redesign/shots.mjs codex            # one design
node harness/learning-redesign/shots.mjs all              # codex, vault, course, current
node harness/learning-redesign/shots.mjs vault --only machine
node harness/learning-redesign/shots.mjs course --only step-
node harness/learning-redesign/shots.mjs codex --port 5261 --out C:\Users\austi\Desktop\shots
```

- **Where the PNGs go:** `%TEMP%\journey-learning\<design>\` (for AJ's PC,
  `C:\Users\austi\AppData\Local\Temp\journey-learning\`), unless `--out`
  says otherwise. Chrome's own profile is `<out>\chrome-profile` and is wiped
  at every run. Keep `--out` outside this folder.
- **What it shoots, per design:** `home`, `catalog`, `machine` (Leg Press,
  opened through a jump), `topic` (Gradual Load-up), `glossary`, `cueing`,
  and `quiz` (the design's own way in, from `steps.mjs`; not for current).
  Each as `<page>-portrait-light.png` (820x1180) plus
  `<page>-portrait-light-tall.png` (the whole page), `-portrait-dark`,
  `-landscape-light` (1180x820) and `-phone-light` (390x844). Then the
  interactions in `steps.mjs`, as `step-<name>.png` and `step-<name>-tall.png`.
- **What it prints:** each PNG with its size, how many rows the prototype bar
  took, `SIDEWAYS SCROLL` if the page scrolls sideways, any tap that found
  nothing, and every page error at the end.
- `--only <text>` keeps the shots whose name includes the text.
- `--port` (or `LH_PORT`) picks the Vite port, default **5251**; two runs on
  two ports can go side by side (each keeps its own `.vite-cache-<port>`).

A run of one design takes about a minute and a half. The first run after a
fresh checkout is slower (Vite pre-bundles; a page that reloads itself under
the camera is opened again).

## Add an interaction (design agents)

`steps.mjs` is yours: `steps.<design>` is a list of
`{ name, query, actions }`, and `quiz.<design>` says how your design opens its
quiz. Actions: `{ tap: "words" }`, `{ tapSelector: "css" }`,
`{ type: "words", into: "css" }`, `{ press: "Escape" }`, `{ wait: ms }`. The
file's header has the detail. Nothing in `shots.mjs` needs touching.

## Open it in a browser

```
$env:LH_WATCH = "1"; npx vite --config harness/learning-redesign/vite.config.ts
```

then open `http://localhost:5251/?design=codex&view=machine-anatomy&machine=m-leg-press`.
`LH_WATCH=1` reloads on a save; without it the server never watches (a
photograph run is a snapshot, and other sessions edit `src` while it runs).

The address takes:

| Parameter | Values | Default |
| --- | --- | --- |
| `design` | `codex`, `vault`, `course`, `current` | the one last picked here, else `current` |
| `view` | `learning` (Overview), `machine-anatomy` (Catalog), `academy` | `learning` |
| `theme` | `light`, `dark` | `light` |
| `role` | `leader` (Studio Leader), `trainer` (Life Transformer), `admin` (head office) | `leader` |
| `viewAs` | `trainer`, `leader`, `head-office` (the bar's View as) | the real role |
| `machine` | a machine id, `m-leg-press` | none |
| `ref` | a Learning link as url-encoded JSON, e.g. `{"kind":"academy-topic","id":"performance-gradual-load-up"}` | none |
| `empty=1`, `flag=0` | no roster; no flagged machine | |

`machine` and `ref` are set as Learning's `jump` just after the first render,
the way a link from the bell arrives. `window.__ready` is true once mounted,
`window.__view` is the section, `window.__writes` lists anything the page
tried to write (nothing leaves it).

## Files

| File | What it is |
| --- | --- |
| `index.html`, `main.tsx` | The page: providers (`ToastProvider` > `ActiveStudioProvider` > `UnsavedChangesProvider`), the shell, the real `LearningView` |
| `preview.css` | The app's stylesheet, with Tailwind told to read `src` |
| `sample.ts` | Solon, Sam Lee, the 20 catalog machines on Solon's floor, one flag, one page; what the Firestore stub answers |
| `stubs/firebase.ts`, `stubs/firestore.ts` | The database, answered from `sample.ts`; writes kept on `window.__writes` |
| `vite.config.ts` | The stub plugin, `@` = `src`, the port, the cache, the watcher |
| `shots.mjs`, `steps.mjs` | The photographer (Chrome over `../perf-lab/cdp.mjs`) and its interactions |

## Traps

- The whole of `harness/` is ignored by git, twice (`.gitignore` and
  `.git/info/exclude`). To commit this folder, add its files by name:
  `git add -f harness/learning-redesign/*.* harness/learning-redesign/.gitignore harness/learning-redesign/stubs`.
  **`git add -f harness/learning-redesign/` would also add `.vite-cache-*`**:
  `-f` overrides this folder's own `.gitignore` too.
- Chrome's profile, or any folder Chrome writes into, must not be inside the
  Vite root while the server watches it (EBUSY). The default `--out` is outside.
- Never run `chrome.exe --version` from a shell on Windows: it starts a GUI
  process that never exits.
- A new Firestore read shows as empty until `sample.ts` answers its path. A
  document read always answers "not found".
