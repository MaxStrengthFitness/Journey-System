/**
 * This device's id (the sessions round, Oct 12 2026): stable, and null
 * whenever it can't be kept, so a trainer is never locked out.
 */
import { describe, expect, it } from "vitest";
import { DEVICE_ID_KEY, thisDeviceId } from "./device";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
};

describe("thisDeviceId", () => {
  it("is made once and the same on every later call", () => {
    const s = memory();
    const a = thisDeviceId(s);
    expect(a).toMatch(/^d-[a-z0-9]{16}$/);
    expect(thisDeviceId(s)).toBe(a);
    expect(s.m.get(DEVICE_ID_KEY)).toBe(a);
  });

  it("reads the one already stored", () => {
    const s = memory();
    s.setItem(DEVICE_ID_KEY, "d-known");
    expect(thisDeviceId(s)).toBe("d-known");
  });

  it("is null on a storage that throws on read", () => {
    expect(
      thisDeviceId({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      }),
    ).toBeNull();
  });

  it("is null when reading works and writing throws", () => {
    expect(
      thisDeviceId({
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toBeNull();
  });

  it("is null when what was written doesn't read back (a storage that forgets)", () => {
    expect(thisDeviceId({ getItem: () => null, setItem: () => {} })).toBeNull();
  });

  it("is null with no storage at all, and never undefined", () => {
    expect(thisDeviceId(null)).toBeNull();
    for (const s of [memory(), null]) expect(thisDeviceId(s)).not.toBeUndefined();
  });
});
