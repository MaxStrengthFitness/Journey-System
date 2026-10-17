import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type Plugin } from "vite";

// The briefing on a page of its own, for its screenshots (shots.mjs): the
// app's real BriefingScreen and TodayList from made-up data (sample.ts). It
// never ships, and it never reaches a database: every import of the app's
// src/firebase and of firebase/firestore is answered by stubs/ instead.
const here = import.meta.dirname;
const root = path.resolve(here, "../..");
const stubs = path.resolve(here, "stubs");
const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();

function previewStubs(): Plugin {
  const appFirebase = norm(path.resolve(root, "src/firebase"));
  const stubDir = norm(stubs);
  return {
    name: "briefing-preview-stubs",
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
  plugins: [previewStubs(), react(), tailwindcss()],
  resolve: { alias: [{ find: "@", replacement: path.resolve(root, "src") }] },
  define: { __APP_BUILD__: JSON.stringify("preview") },
  server: { port: 5197, strictPort: true, fs: { allow: [root, path.resolve(root, "../../..")] } },
  logLevel: "warn",
});
