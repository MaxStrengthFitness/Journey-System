import { describe, expect, it } from "vitest";
import {
  countPair,
  countWords,
  ftIn,
  gapWords,
  lengthWords,
  listWords,
  mmFromFtIn,
  parseFtIn,
  sizeLine,
  sqFtOf,
  sqFtWords,
} from "./units";

describe("lengths in feet and inches", () => {
  it("round-trips every inch from 1 in to 20 ft", () => {
    for (let n = 1; n <= 240; n++) {
      const back = ftIn(mmFromFtIn(0, n));
      expect(back.ft * 12 + back.in).toBe(n);
    }
  });

  it("says 24 in as 2 ft, 1177 mm as 3 ft 10 in, and rolls 11.99 in over to 1 ft", () => {
    expect(lengthWords(mmFromFtIn(0, 24))).toBe("2 ft");
    expect(lengthWords(1177)).toBe("3 ft 10 in");
    expect(lengthWords(11.99 * 25.4)).toBe("1 ft");
    expect(lengthWords(127)).toBe("5 in");
    expect(lengthWords(406)).toBe("1 ft 4 in");
    expect(lengthWords(2)).toBe("1 in");
  });

  it("rounds a gap down, so a gap that fails the spacing never prints the spacing", () => {
    expect(gapWords(609)).toBe("1 ft 11 in");
    expect(gapWords(610)).toBe("2 ft");
    expect(gapWords(4)).toBeNull();
    expect(gapWords(20)).toBe("less than an inch");
  });

  it("reads a tape: inches alone, a decimal, a fraction", () => {
    expect(parseFtIn("", "83 1/2")).toEqual({ mm: 2121 });
    expect(parseFtIn("", "83.5")).toEqual({ mm: 2121 });
    expect(parseFtIn("6", "11 1/2")).toEqual({ mm: 2121 });
    expect(parseFtIn("", "3/4")).toEqual({ mm: 19 });
    expect(parseFtIn("5", "")).toEqual({ mm: 1524 });
    expect(parseFtIn("", "")).toEqual({ problem: "Type a length." });
    expect(parseFtIn("", "83 1/0")).toEqual({ problem: "Feet are whole numbers; inches can be 83, 83.5 or 83 1/2." });
    expect(parseFtIn("5.5", "")).toEqual({ problem: "Feet are whole numbers; inches can be 83, 83.5 or 83 1/2." });
    expect(parseFtIn("", "eighty")).toEqual({ problem: "Feet are whole numbers; inches can be 83, 83.5 or 83 1/2." });
  });

  it("rolls inches of 12 or more into feet", () => {
    const r = parseFtIn("0", "83 1/2");
    expect("mm" in r && lengthWords(r.mm)).toBe("7 ft");
    expect(ftIn(mmFromFtIn(0, 18))).toEqual({ ft: 1, in: 6 });
  });

  it("says a size in one line, tall only with a height", () => {
    expect(sizeLine({ lengthMm: 1594, widthMm: 1227, heightMm: 1850 })).toBe("5 ft 3 in long × 4 ft wide × 6 ft 1 in tall");
    expect(sizeLine({ lengthMm: 1594, widthMm: 1227, heightMm: null })).toBe("5 ft 3 in long × 4 ft wide");
    expect(sizeLine({ lengthMm: 1594, widthMm: 1227 })).toBe("5 ft 3 in long × 4 ft wide");
  });

  it("counts in words to nine, and keeps a pair alike", () => {
    expect(countWords(0)).toBe("no");
    expect(countWords(9)).toBe("nine");
    expect(countWords(12)).toBe("12");
    expect(countPair(3, 9)).toEqual(["three", "nine"]);
    expect(countPair(3, 12)).toEqual(["3", "12"]);
    expect(listWords(["A"])).toBe("A");
    expect(listWords(["A", "B"])).toBe("A and B");
    expect(listWords(["A", "B", "C"])).toBe("A, B and C");
  });

  it("never says a metric unit", () => {
    const outputs: string[] = [];
    for (let mm = 1; mm < 7000; mm += 37) {
      outputs.push(lengthWords(mm), gapWords(mm) ?? "", sizeLine({ lengthMm: mm, widthMm: mm + 13, heightMm: mm + 101 }));
    }
    for (const o of outputs) expect(o).not.toMatch(/\b(mm|cm|m)\b/);
  });
});
