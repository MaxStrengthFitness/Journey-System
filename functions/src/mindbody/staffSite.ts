/**
 * STAFF SITE — which trainer a Mindbody staff event may belong to, by SITE.
 *
 * Pure: no Firestore, no clock. `staffResolver.ts` does the reads and hands
 * the documents here; `scripts/check-staff-sites.ts` reads the same rule.
 *
 * WHY A SITE
 * ----------
 * Each Mindbody site numbers its own staff (westlake, Strongsville and
 * Willoughby share site 29068; Solon is 5746957), exactly as it numbers its
 * own clients. Staff id 100000012 on one site and 100000012 on the other can
 * be two different people. Until Oct 12 2026 a staff event was matched on the
 * number alone, so one site's update could land on the other site's trainer:
 * their name, email, photo, "inactive in Mindbody", and `mindbody.siteId`,
 * which the Hub, the Calendar and Openings use to place bookings
 * (docs/rounds/2026-10-12-staff-webhook.md).
 *
 * WHERE A TRAINER'S STAFF ID COMES FROM
 * -------------------------------------
 * Journey keeps one staff id per trainer and does not record which site it
 * came from. Both pickers link from a studio's Mindbody staff list: Edit
 * Trainer from the home studio's site, the staff editor from the site of the
 * studio being viewed, for anyone who works there. So the site is inferred
 * from where the trainer works, and only when that is ONE site:
 *
 *   - the sites of their studios (home, also works at, owns) -> exactly one
 *     is their staff site; none or two-plus is "can't tell";
 *   - the veto: when the webhook's own echo (`mindbody.staffId` equal to the
 *     current staff id) names another site, "can't tell" too.
 *
 * The echo is never used to MATCH: it was written by the old number-only rule,
 * and trusting it would lock in a past wrong write. It can only turn a match
 * into a park. Every doubt here parks the event in Limbo with the whole
 * payload: a delayed refresh of a display map, never another person's name.
 */

/** A studio and its Mindbody site (index.ts's cached studio list). */
export type StudioSite = { id: string; siteId: string };

/** A trainer document as the staff lookups read it, from the query's own snapshot. */
export type StaffCandidate = {
  id: string;
  fullName: string;
  /** The staff id on the document, as a trimmed string ("" when none). */
  staffId: string;
  primaryHomeStudioId?: string;
  accessibleStudioIds: string[];
  ownedStudioIds: string[];
  /** `mindbody.staffId`: the staff id of the last staff event matched to them. */
  echoStaffId?: string;
  /** `mindbody.siteId`: the site of that event. */
  echoSiteId?: string;
};

/**
 * A document merged into another one (a claimed placeholder, a migrated
 * record): it keeps the staff id and the studios it had, and is never anyone.
 * The app's own test (`admin/provisional/reconcile.ts` `isMergedAway`).
 */
export function isMergedAway(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  return !!(data.supersededById || data.supersededByUid || data.migratedTo);
}

/** A staff id as a trimmed string: "" for anything that is not a string or a finite number. */
export function staffIdKey(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * The forms to query a staff id in: the trimmed string, and the number when it
 * round-trips. Firestore's `==` is type-strict and older trainer documents hold
 * the number (staffResolver.ts, resolveTrainerByStaffId).
 */
export function staffIdForms(staffId: string | number): (string | number)[] {
  const asString = String(staffId).trim();
  if (!asString) return [];
  const forms: (string | number)[] = [asString];
  const asNumber = Number(asString);
  if (Number.isFinite(asNumber) && String(asNumber) === asString) forms.push(asNumber);
  return forms;
}

function stringOr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    : [];
}

/** A snapshot's document as a candidate, or null for a merged-away document. */
export function candidateOf(id: string, data: Record<string, unknown> | undefined): StaffCandidate | null {
  const d = data ?? {};
  if (isMergedAway(d)) return null;
  const mindbody =
    d.mindbody && typeof d.mindbody === "object" ? (d.mindbody as Record<string, unknown>) : {};
  const echoStaffId = staffIdKey(mindbody.staffId);
  const echoSiteId = staffIdKey(mindbody.siteId);
  return {
    id,
    fullName: typeof d.fullName === "string" ? d.fullName.trim() : "",
    staffId: staffIdKey(d.mindbodyStaffId),
    primaryHomeStudioId: stringOr(d.primaryHomeStudioId),
    accessibleStudioIds: stringsOf(d.accessibleStudioIds),
    ownedStudioIds: stringsOf(d.ownedStudioIds),
    echoStaffId: echoStaffId || undefined,
    echoSiteId: echoSiteId || undefined,
  };
}

export type StaffSiteWhy =
  /** Every studio they work at is on one site: that site. */
  | "linked"
  /** None of their studios is linked to a Mindbody site. */
  | "no-site"
  /** They work at studios on two or more sites: linked from either. */
  | "several-sites"
  /** Their studios are on one site, but the last event matched to them came from another. */
  | "echo-differs";

export type StaffSiteReading = {
  /** The site their staff id is on, or null when Journey can't tell. */
  site: string | null;
  why: StaffSiteWhy;
  /** The distinct sites of the studios they work at, in the order met. */
  sites: string[];
  /** Their echo's site, when it is for the staff id they hold now. */
  echoSite?: string;
};

/** Which site this trainer's staff id belongs to, and why (header). */
export function readStaffSite(t: StaffCandidate, studios: readonly StudioSite[]): StaffSiteReading {
  const siteByStudio = new Map<string, string>();
  for (const s of studios) {
    const site = s.siteId.trim();
    if (site) siteByStudio.set(s.id, site);
  }
  const sites: string[] = [];
  const studioIds = [
    ...(t.primaryHomeStudioId ? [t.primaryHomeStudioId] : []),
    ...t.accessibleStudioIds,
    ...t.ownedStudioIds,
  ];
  for (const id of studioIds) {
    const site = siteByStudio.get(id);
    if (site && sites.indexOf(site) === -1) sites.push(site);
  }
  const echoSite =
    t.echoSiteId && t.echoStaffId && t.staffId && t.echoStaffId === t.staffId ? t.echoSiteId : undefined;
  const base = echoSite ? { sites, echoSite } : { sites };
  if (sites.length === 0) return { ...base, site: null, why: "no-site" };
  if (sites.length > 1) return { ...base, site: null, why: "several-sites" };
  if (echoSite && echoSite !== sites[0]) return { ...base, site: null, why: "echo-differs" };
  return { ...base, site: sites[0], why: "linked" };
}

/** The site this trainer's staff id belongs to, or null when Journey can't tell. */
export function staffSiteOf(t: StaffCandidate, studios: readonly StudioSite[]): string | null {
  return readStaffSite(t, studios).site;
}

function siteValue(source: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const v = staffIdKey(source[key]);
    if (v) return v;
  }
  return "";
}

/**
 * The Mindbody site a staff event is from, or "" when it names none: the
 * event's own data first (`siteId`, `SiteId`), then the envelope's. The ONE
 * site the staff branch tests for "no site", matches on and writes.
 */
export function staffEventSite(parsed: Record<string, unknown>): string {
  const data =
    (parsed.eventData as Record<string, unknown> | undefined) ||
    (parsed.eventInstance as Record<string, unknown> | undefined) ||
    undefined;
  return siteValue(data, "siteId", "SiteId") || siteValue(parsed, "siteId", "SiteId");
}

/** A name for comparing: accents off, lower case, single spaces. */
export function normName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The names a staff event gives its person, normalised (none for a bare deactivation). */
export function staffEventNames(parsed: Record<string, unknown>): string[] {
  const data =
    (parsed.eventData as Record<string, unknown> | undefined) ||
    (parsed.eventInstance as Record<string, unknown> | undefined) ||
    parsed;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const names = [
    text("displayName"),
    text("DisplayName"),
    text("name"),
    text("Name"),
    `${text("firstName") || text("FirstName")} ${text("lastName") || text("LastName")}`,
  ]
    .map(normName)
    .filter((n) => n !== "");
  return names.filter((n, i) => names.indexOf(n) === i);
}

export type StaffTrainerNote = { id: string; name: string };
export type CantTellNote = StaffTrainerNote & {
  why: StaffSiteWhy;
  /** True when one of their studios, or their echo, is on the event's site. */
  tied: boolean;
  sites: string[];
  echoSite?: string;
};

export type SiteStaffResolution =
  | { kind: "matched"; trainerId: string; by: "site" | "name" }
  /** No studio in Journey is linked to the event's site. Nothing is read. */
  | { kind: "unmapped-site" }
  /** Nobody's staff id is, or may be, on this site; `elsewhere` are on other sites. */
  | { kind: "unlinked"; elsewhere: number }
  /** Two or more trainers' staff ids are, or may be, on this site. */
  | { kind: "ambiguous"; trainers: StaffTrainerNote[] }
  /** Nobody is known to be on this site, and some candidates can't be judged. */
  | { kind: "cant-tell"; trainers: CantTellNote[] };

const nameOf = (t: StaffCandidate) => t.fullName || "a trainer with no name";

/**
 * The decision for a staff event from `siteId` (trimmed, non-blank).
 *
 *   on S       their staff site is S
 *   maybe      can't tell, but one of their studios (or their echo) is on S
 *   loose      can't tell, and nothing ties them to S
 *   elsewhere  their staff site is another site
 *
 * One on S and no maybe: matched. Two on S, or one plus a maybe: ambiguous.
 * None on S and exactly one maybe whose Journey name is the event's: matched by
 * name. Any other maybe or loose: can't tell. Only elsewhere, or nobody: unlinked.
 */
export function decideStaffAtSite(
  candidates: readonly StaffCandidate[],
  siteId: string,
  studios: readonly StudioSite[],
  eventNames: readonly string[] = [],
): SiteStaffResolution {
  const site = siteId.trim();
  if (!studios.some((s) => s.siteId.trim() === site)) return { kind: "unmapped-site" };

  const onSite: StaffCandidate[] = [];
  const maybe: CantTellNote[] = [];
  const loose: CantTellNote[] = [];
  let elsewhere = 0;
  const seen = new Set<string>();
  for (const t of candidates) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const reading = readStaffSite(t, studios);
    if (reading.site === site) {
      onSite.push(t);
      continue;
    }
    if (reading.site !== null) {
      elsewhere += 1;
      continue;
    }
    const tied = reading.sites.indexOf(site) !== -1 || reading.echoSite === site;
    const note: CantTellNote = {
      id: t.id,
      name: nameOf(t),
      why: reading.why,
      tied,
      sites: reading.sites,
      ...(reading.echoSite ? { echoSite: reading.echoSite } : {}),
    };
    (tied ? maybe : loose).push(note);
  }

  if (onSite.length === 1 && maybe.length === 0) {
    return { kind: "matched", trainerId: onSite[0].id, by: "site" };
  }
  if (onSite.length >= 1) {
    return {
      kind: "ambiguous",
      trainers: [...onSite.map((t) => ({ id: t.id, name: nameOf(t) })), ...maybe.map(({ id, name }) => ({ id, name }))],
    };
  }
  if (maybe.length === 1) {
    const only = candidates.find((t) => t.id === maybe[0].id);
    const journeyName = only ? normName(only.fullName) : "";
    if (journeyName && eventNames.indexOf(journeyName) !== -1) {
      return { kind: "matched", trainerId: maybe[0].id, by: "name" };
    }
  }
  if (maybe.length + loose.length > 0) return { kind: "cant-tell", trainers: [...maybe, ...loose] };
  return { kind: "unlinked", elsewhere };
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The Limbo sentence for a staff event that was not written, in plain studio
 * English (Admins -> Machinery -> Limbo shows it as it is).
 */
export function staffLimboReason(
  resolution: Exclude<SiteStaffResolution, { kind: "matched" }>,
  staffId: string,
  siteId: string,
): string {
  const x = staffId;
  const s = siteId;
  switch (resolution.kind) {
    case "unmapped-site":
      return `This staff update came from Mindbody site ${s}, and no studio in Journey is linked to that site. Each site numbers its own staff, so staff id ${x} can't be matched to a trainer. Nothing was written. If this site is one of ours, set its Mindbody Site ID in Admins -> Studios.`;
    case "unlinked": {
      const first = `No trainer whose studio is on Mindbody site ${s} carries staff id ${x}. Link them in Edit Trainer -> Mindbody Staff ID; a webhook never creates a trainer account.`;
      if (resolution.elsewhere === 0) return first;
      const who =
        resolution.elsewhere === 1
          ? "A trainer at another site has"
          : `${resolution.elsewhere} trainers at other sites have`;
      return `${first} ${who} the same number. Each site numbers its own staff, so Journey can't tell it is the same person, and nothing was written to them.`;
    }
    case "ambiguous":
      return `Mindbody staff id ${x} on site ${s} could belong to more than one trainer (${resolution.trainers
        .map((t) => t.name)
        .join(", ")}). Fix the duplicate in Edit Trainer -> Mindbody Staff ID; nothing was written.`;
    case "cant-tell": {
      if (resolution.trainers.length > 1) {
        return `Mindbody staff id ${x} on site ${s} matches ${listNames(
          resolution.trainers.map((t) => t.name),
        )}, but Journey can't tell which of them, ${resolution.trainers.length === 2 ? "if either" : "if any"}, holds this site's number. Nothing was written. Check their staff ids in Edit Trainer -> Mindbody Staff ID.`;
      }
      const t = resolution.trainers[0];
      const because =
        t.why === "no-site"
          ? "none of their studios is linked to a Mindbody site"
          : t.why === "several-sites"
            ? "they work at studios on more than one Mindbody site, and each site numbers its own staff"
            : `their studios are on site ${t.sites[0] ?? "?"} while the last staff update Journey matched to them came from site ${t.echoSite ?? "?"}`;
      const hint =
        t.why === "no-site"
          ? " Give them a home studio that is linked to Mindbody (Edit Trainer), and the next staff update will match."
          : t.tied
            ? " An update that carries their name, spelled as it is in Journey, will match."
            : "";
      return `Mindbody staff id ${x} on site ${s} matches ${t.name}, but ${because}, so Journey can't tell whether this is the same person. Nothing was written.${hint}`;
    }
  }
}
