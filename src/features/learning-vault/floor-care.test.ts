import { describe, expect, it } from "vitest";
import { floorCareOf, hasFloorStatus, type CareRead, type FloorUnit } from "./floor-care";

const JESS = { name: "Jess Moreno" };
const AT = Date.UTC(2026, 9, 18, 12, 52);
const ISO = new Date(AT).toISOString();

const KNOWN: CareRead = { byMachineId: {}, loading: false, error: null };

const UNITS: FloorUnit[] = [
  { id: "m-leg-press", rosterStatus: "active" },
  {
    id: "m-neck",
    rosterStatus: "maintenance",
    outOfService: { reason: "A new cable is on order", by: { uid: "u-g", name: "Glorfindel Hale" }, at: AT },
  },
  { id: "m-abs", rosterStatus: "maintenance" },
  { id: "m-dip", rosterStatus: "inactive" },
];

describe("floorCareOf — unknown is never all fine", () => {
  it("is null with no studio, while either read loads, and when either failed", () => {
    expect(floorCareOf({ studioId: null, floorState: "ready", units: UNITS, care: KNOWN })).toBeNull();
    expect(floorCareOf({ studioId: "solon", floorState: "loading", units: UNITS, care: KNOWN })).toBeNull();
    expect(floorCareOf({ studioId: "solon", floorState: "unreadable", units: UNITS, care: KNOWN })).toBeNull();
    expect(floorCareOf({ studioId: "solon", floorState: "ready", units: UNITS, care: { ...KNOWN, loading: true } })).toBeNull();
    expect(
      floorCareOf({ studioId: "solon", floorState: "ready", units: UNITS, care: { ...KNOWN, error: "Couldn't load" } }),
    ).toBeNull();
  });

  it("is an empty record when both were read and nothing is wrong", () => {
    const care = floorCareOf({ studioId: "solon", floorState: "ready", units: [{ id: "m-leg-press", rosterStatus: "active" }], care: KNOWN });
    expect(care).toEqual({});
  });
});

describe("floorCareOf — what the Catalog says", () => {
  it("says Out of service for a unit in maintenance, with the leader's reason where there is one", () => {
    const care = floorCareOf({ studioId: "solon", floorState: "ready", units: UNITS, care: KNOWN })!;
    expect(care["m-neck"]).toEqual({
      outOfService: true,
      outOfServiceWhy: { text: "A new cable is on order", by: "Glorfindel Hale", at: ISO },
    });
    // Out of service from before reasons existed: the words alone, nothing guessed.
    expect(care["m-abs"]).toEqual({ outOfService: true });
    // Active and inactive units have nothing to say.
    expect(care["m-leg-press"]).toBeUndefined();
    expect(care["m-dip"]).toBeUndefined();
  });

  it("says Flagged from Relay's care record, with the note, who and when", () => {
    const care = floorCareOf({
      studioId: "solon",
      floorState: "ready",
      units: UNITS,
      care: {
        ...KNOWN,
        byMachineId: {
          "m-leg-press": { flag: { note: " Left pad sticks at the bottom ", by: JESS, at: AT } },
          "m-neck": { flag: { note: "Cable frayed", by: { name: "" }, at: 0 } },
          "m-dip": { flag: null },
        },
      },
    })!;
    expect(care["m-leg-press"]).toEqual({
      outOfService: false,
      flag: { text: "Left pad sticks at the bottom", by: "Jess Moreno", at: ISO },
    });
    // Both at once, and a flag with no name or time keeps only what it has.
    expect(care["m-neck"].outOfService).toBe(true);
    expect(care["m-neck"].flag).toEqual({ text: "Cable frayed" });
    expect(care["m-dip"]).toBeUndefined();
  });

  it("on a floor read as empty: no unit is out of service, but a flag still counts", () => {
    const care = floorCareOf({
      studioId: "solon",
      floorState: "empty",
      units: UNITS, // the MSF standard standing in, never this floor
      care: { ...KNOWN, byMachineId: { "m-leg-press": { flag: { note: "", by: JESS, at: AT } } } },
    })!;
    expect(Object.keys(care)).toEqual(["m-leg-press"]);
    expect(care["m-leg-press"].flag).toEqual({ text: "", by: "Jess Moreno", at: ISO });
  });

  it("holds nothing undefined (Firestore-clean)", () => {
    const care = floorCareOf({
      studioId: "solon",
      floorState: "ready",
      units: UNITS,
      care: { ...KNOWN, byMachineId: { "m-abs": { flag: { note: "x", by: { name: "" }, at: Number.NaN } } } },
    })!;
    const undefinedIn = (v: unknown): boolean =>
      v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(undefinedIn));
    expect(undefinedIn(care)).toBe(false);
  });
});

describe("hasFloorStatus", () => {
  it("is true only for a machine out of service or flagged", () => {
    expect(hasFloorStatus(null)).toBe(false);
    expect(hasFloorStatus(undefined)).toBe(false);
    expect(hasFloorStatus({ outOfService: false })).toBe(false);
    expect(hasFloorStatus({ outOfService: true })).toBe(true);
    expect(hasFloorStatus({ outOfService: false, flag: { text: "" } })).toBe(true);
  });
});
