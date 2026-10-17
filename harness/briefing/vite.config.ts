import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// The briefing's list for today on a page of its own, for its screenshots (shots.mjs).
// It draws the app's real TodayList from made-up data; it never ships.
const here = import.meta.dirname;
const root = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: "@", replacement: path.resolve(root, "src") }] },
  server: { port: 5197, strictPort: true, fs: { allow: [root, path.resolve(root, "../../..")] } },
  logLevel: "warn",
});
