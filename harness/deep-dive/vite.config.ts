import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// The Kaizen Deep Dive on a page of its own, for its screenshots (shots.mjs).
// It draws the app's real Deep Dive from a made-up client; it never ships.
const here = import.meta.dirname;
const root = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: "@", replacement: root }] },
  server: { port: 5198, strictPort: true, fs: { allow: [root, path.resolve(root, "../../..")] } },
  logLevel: "warn",
});
