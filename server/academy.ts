/**
 * The server's half of Ask the Academy: the API client and the Academy's
 * pages, made once, and the `ask` that server/academy-routes.ts calls.
 *
 * Null when ANTHROPIC_API_KEY isn't set, so the route says it isn't switched
 * on rather than failing. The key is read here and never sent anywhere but
 * Anthropic. The pages are the Academy a trainer can open in Learning (about
 * a megabyte of JSON, bundled into the server by esbuild); they are built on
 * the first question, not at boot, so a server that is never asked never
 * holds them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { academyFiles } from "../src/features/ask-academy/academy-files.ts";
import { askAcademy } from "../src/features/ask-academy/ask.ts";
import { academyPages, type AcademyPage } from "../src/features/ask-academy/pages.ts";

export function academyAsker(): ((question: string) => ReturnType<typeof askAcademy>) | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // Two tries on a busy or failed request, and no answer after a minute: the trainer is waiting.
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  let pages: AcademyPage[] | null = null;
  return (question) => {
    pages ??= academyPages(academyFiles());
    return askAcademy(client, question, pages);
  };
}
