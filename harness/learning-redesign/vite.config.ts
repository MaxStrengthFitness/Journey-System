import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type Plugin } from "vite";

// Learning on a page of its own, for the redesign's screenshots (shots.mjs):
// the app's real LearningView (today's Learning and the three prototype
// designs) for a made-up studio (sample.ts). It never ships, and it never
// reaches a database: every import of the app's src/firebase and of
// firebase/firestore is answered by stubs/ instead. (The local .env points at
// production; the real src/firebase.ts would open it.)
//
// The port is LH_PORT (default 5251), so two runs can go side by side, each
// with its own pre-bundle cache inside this folder (never the main
// checkout's shared node_modules/.vite).
const here = import.meta.dirname;
const root = path.resolve(here, "../..");
const stubs = path.resolve(here, "stubs");
const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
const port = Number(process.env.LH_PORT) || 5251;

function previewStubs(): Plugin {
  const appFirebase = norm(path.resolve(root, "src/firebase"));
  const stubDir = norm(stubs);
  return {
    name: "learning-redesign-preview-stubs",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const from = norm(importer);
      if (source === "firebase/firestore" && !from.startsWith(stubDir)) return path.join(stubs, "firestore.ts");
      if (source === "@/firebase") return path.join(stubs, "firebase.ts");
      if (/(^|[\\/])firebase(\.ts)?$/.test(source)) {
        // Relative ("../../firebase"), or already absolute once the @ alias ran.
        const abs = source.startsWith(".") ? path.resolve(path.dirname(importer.split("?")[0]), source) : source;
        if (norm(abs).replace(/\.ts$/, "") === appFirebase) return path.join(stubs, "firebase.ts");
      }
      return null;
    },
  };
}

export default defineConfig({
  root: here,
  cacheDir: path.resolve(here, `.vite-cache-${port}`),
  plugins: [previewStubs(), react(), tailwindcss()],
  // `@` is src (the Learning graph imports @/components/ui/*, @/lib/utils).
  resolve: { alias: [{ find: "@", replacement: path.resolve(root, "src") }] },
  define: { __APP_BUILD__: JSON.stringify("preview") },
  server: {
    port,
    strictPort: true,
    // root/../../.. is the main checkout, where a worktree's node_modules junction points.
    fs: { allow: [root, path.resolve(root, "../../..")] },
    // No watching by default: a photograph run is a snapshot, and other
    // sessions edit src while it runs; every save would reload the page under
    // the camera. LH_WATCH=1 watches (for a person editing with it open),
    // never an output folder in here: Chrome's profile files are locked while
    // it runs, and watching them crashes Vite (EBUSY).
    watch: process.env.LH_WATCH === "1" ? { ignored: ["**/out/**", "**/chrome-profile/**"] } : null,
  },
  logLevel: "warn",
});
