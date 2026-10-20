import { describe, expect, it } from "vitest";
import { padKey, padText, padValue } from "./now-pad";

const w = (fresh: boolean) => ({ fresh, decimal: true });
const c = (fresh: boolean) => ({ fresh, decimal: false });

describe("padKey", () => {
  it("replaces the number on the first key, then adds to it", () => {
    expect(padKey("45", "5", w(true))).toBe("5");
    expect(padKey("5", "0", w(false))).toBe("50");
  });

  it("clears the whole number on a first backspace, one digit after", () => {
    expect(padKey("45", "back", w(true))).toBe("");
    expect(padKey("45", "back", w(false))).toBe("4");
    expect(padKey("", "back", w(false))).toBe("");
  });

  it("takes one point, on a weight only", () => {
    expect(padKey("62", ".", w(false))).toBe("62.");
    expect(padKey("62.", ".", w(false))).toBe("62.");
    expect(padKey("", ".", w(true))).toBe("0.");
    expect(padKey("12", ".", c(false))).toBe("12");
  });

  it("keeps one place after the point", () => {
    expect(padKey("62.", "5", w(false))).toBe("62.5");
    expect(padKey("62.5", "5", w(false))).toBe("62.5");
  });

  it("caps a count at three digits and a weight at five characters", () => {
    expect(padKey("120", "1", c(false))).toBe("120");
    expect(padKey("999.", "5", w(false))).toBe("999.5");
    expect(padKey("99999", "1", w(false))).toBe("99999");
  });

  it("never leads with a zero", () => {
    expect(padKey("0", "5", c(false))).toBe("5");
    expect(padKey("0", "0", c(false))).toBe("0");
  });
});

describe("padValue / padText", () => {
  it("reads nothing as null, never zero", () => {
    expect(padValue("")).toBeNull();
    expect(padValue(".")).toBeNull();
    expect(padValue("0")).toBe(0);
    expect(padValue("62.")).toBe(62);
    expect(padValue("62.5")).toBe(62.5);
  });

  it("starts a field from its stored number", () => {
    expect(padText(null)).toBe("");
    expect(padText(undefined)).toBe("");
    expect(padText(66)).toBe("66");
  });
});
