import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// The one-page sheet on a page of its own, for the print check (check.mjs).
// It draws the app's real ReportSheet from the sample reports; it never ships.
const here = import.meta.dirname;
const root = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: "@", replacement: root }] },
  server: { port: 5197, strictPort: true, fs: { allow: [root, path.resolve(root, "../../..")] } },
  logLevel: "warn",
});
