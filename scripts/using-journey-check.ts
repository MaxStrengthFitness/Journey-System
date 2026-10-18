/**
 * The Using Journey reminder (AJ, Oct 18 2026, "3b": a reminder, nothing fails).
 *
 *   npx tsx scripts/using-journey-check.ts
 *       Lists, for the round's wrap-up: pages waiting for AJ, approved pages
 *       whose words changed since he approved them, and approved pages whose
 *       screens have changed since (from git). Writes nothing; always exits 0.
 *
 *   npx tsx scripts/using-journey-check.ts --approve <page.md> [--on yyyy-mm-dd]
 *       DRY RUN: prints the header line AJ's yes would write.
 *   ... --approve <page.md> --commit
 *       Writes it: status approved, and today's date (or --on) with the
 *       fingerprint of the page's words as they are now. Run it only after AJ
 *       approved those exact words (his tap on the review page).
 *
 * Nothing here reads or writes Firebase or Mindbody.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fingerprint, isApprovedAsWritten, readPage } from "../src/features/using-journey/shelf";
import { studioTodayKey } from "../src/lib/studio-time";

const SHELF = join(process.cwd(), "docs", "using-journey");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

function approve(file: string) {
  const path = join(SHELF, basename(file));
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const { page, problems } = readPage(text);
  if (!page) {
    console.error(`${basename(file)}: ${problems.join("; ")}`);
    process.exit(1);
  }
  const on = flag("--on") ?? studioTodayKey();
  const line = `approved: ${on} · ${fingerprint(page.body)}`;
  const header = text.slice(0, text.indexOf("\n---", 3));
  let next = header
    .replace(/^status: .*$/m, "status: approved")
    .replace(/^approved:.*$/m, line);
  if (!/^approved:/m.test(next)) next += `\n${line}`;
  const out = next + text.slice(header.length);
  if (!args.includes("--commit")) {
    console.log(`DRY RUN. ${basename(file)} would read:\n  status: approved\n  ${line}\nAdd --commit to write it.`);
    return;
  }
  writeFileSync(path, out, "utf8");
  console.log(`${basename(file)}: approved ${on}.`);
}

function changedSince(day: string, paths: string[]): string[] {
  try {
    const out = execFileSync("git", ["--no-optional-locks", "log", `--since=${day}T23:59:59`, "--format=%h %s", "--", ...paths], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return ["(git couldn't be read, so this page's screens can't be checked)"];
  }
}

function report() {
  const files = readdirSync(SHELF).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  const waiting: string[] = [];
  const reworded: string[] = [];
  const moved: string[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    const { page, problems } = readPage(readFileSync(join(SHELF, file), "utf8"));
    if (!page) {
      unreadable.push(`${file}: ${problems.join("; ")}`);
      continue;
    }
    if (page.header.status === "draft") {
      waiting.push(`${file} (${page.header.title})`);
      continue;
    }
    if (!isApprovedAsWritten(page)) reworded.push(`${file}: its words changed since AJ approved them on ${page.header.approvedOn}`);
    const commits = changedSince(page.header.approvedOn!, page.header.covers);
    if (commits.length) moved.push(`${file}: its screens changed since ${page.header.approvedOn}:\n      ${commits.slice(0, 5).join("\n      ")}`);
  }
  console.log(`Using Journey: ${files.length} pages.`);
  const say = (title: string, rows: string[]) => {
    if (rows.length) console.log(`\n${title}\n  ${rows.join("\n  ")}`);
  };
  say("Can't be read:", unreadable);
  say("Waiting for AJ:", waiting);
  say("Reworded since AJ's yes (the app keeps showing the approved words):", reworded);
  say("Screens changed since AJ's yes — read the page against them:", moved);
  if (!unreadable.length && !waiting.length && !reworded.length && !moved.length) console.log("All pages approved and current.");
}

const toApprove = flag("--approve");
if (toApprove) approve(toApprove);
else report();
