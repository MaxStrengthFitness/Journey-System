import { describe, expect, it } from "vitest";
import { columnKey, fileKindOf, parseDay, parseNumber, readProfiles, readWorkoutLines, tidyName } from "./records";

describe("columns", () => {
  it("finds a column by its name, the table prefix, case, spaces and underscores dropped", () => {
    expect(columnKey("workoutlines|Workouts::DateofWorkout")).toBe("dateofworkout");
    expect(columnKey("workoutlines__Machines::MachineName")).toBe("machinename");
    expect(columnKey("__ID_Client")).toBe("idclient");
    expect(columnKey("_MindBodyID")).toBe("mindbodyid");
    expect(columnKey("Date of Workout")).toBe("dateofworkout");
  });

  it("tells a profile file from a workouts file, and neither from anything else", () => {
    expect(fileKindOf(["__ID_Client", "NameFull", "_MindBodyID"])).toBe("profile");
    expect(fileKindOf(["Workouts::DateofWorkout", "Clients::NameFull", "Machines::MachineName"])).toBe("workouts");
    // Plain CSV from FileMaker has no names on its first row: it is neither.
    expect(fileKindOf(["2026-02-20", "Test Client", "Leg Curl"])).toBe(null);
  });
});

describe("values", () => {
  it("reads a day however FileMaker wrote it, and refuses one that loses the century", () => {
    expect(parseDay("2026-02-20").value).toBe("2026-02-20");
    expect(parseDay("2026-02-20T00:00:00").value).toBe("2026-02-20");
    expect(parseDay("10/9/2026").value).toBe("2026-10-09");
    expect(parseDay("46073").value).toBe("2026-02-20");
    expect(parseDay("").value).toBe(null);
    expect(parseDay("9/2/26").problem).toMatch(/two-digit year/);
    expect(parseDay("2/30/2026").problem).toMatch(/not a real day/);
    expect(parseDay("soon").problem).toMatch(/not a date/);
  });

  it("holds a day in a year before 2000: Tom Reddy's 12/12/0205 is 2025 mistyped, never session #1 in the year 205", () => {
    expect(parseDay("12/12/0205").problem).toMatch(/year before 2000/);
    expect(parseDay("0205-12-12").problem).toMatch(/year before 2000/);
    expect(parseDay("1999-12-31").problem).toMatch(/year before 2000/);
    expect(parseDay("2000-01-01").value).toBe("2000-01-01");
  });

  it("reads numbers, a thousands comma included, and puts Excel's float noise back to what was typed", () => {
    expect(parseNumber("1,220").value).toBe(1220);
    // A comma anywhere else is a problem, never a guess: "7,6" is not 76.
    expect(parseNumber("7,6").problem).toMatch(/not a number/);
    expect(parseNumber("10,10").problem).toMatch(/not a number/);
    expect(parseNumber("0x10").problem).toMatch(/not a number/);
    expect(parseNumber("50%").problem).toMatch(/not a number/);
    expect(parseNumber("7.6000000000000005").value).toBe(7.6);
    expect(parseNumber(" ").value).toBe(null);
    expect(parseNumber("X").problem).toMatch(/not a number/);
  });

  it("tidies a machine's name: stray spaces and a typed return", () => {
    expect(tidyName("Chest fly ")).toBe("Chest fly");
    expect(tidyName("Leg Press Hoist\n")).toBe("Leg Press Hoist");
    expect(tidyName("Comp.\u00a0 Row")).toBe("Comp. Row");
  });
});

describe("workout lines", () => {
  const table = [
    ["workoutlines|Workouts::DateofWorkout", "workoutlines|Clients::NameFull", "workoutlines__Machines::MachineName", "WorkoutOrder", "Reps", "Weight", "NextSet"],
    ["2026-03-19", "Test Client", "Leg Press Imag.", "3", "86", "80", "12"],
    ["2026-03-19", "Test Client", "Comp. Row ", "4", null, "26", null],
    [null, null, null, null, null, null, null],
    ["soon", "Test Client", "Abs", "x", null, "40", "8"],
  ];

  it("reads FileMaker's NextSet as the reps and its Reps as next time's weight (the swap)", () => {
    const { records } = readWorkoutLines(table, "w.xlsx");
    expect(records[0]).toMatchObject({ day: "2026-03-19", machine: "Leg Press Imag.", order: 3, weight: 80, reps: 12, nextWeight: 86, row: 2 });
    expect(records[1]).toMatchObject({ machine: "Comp. Row", weight: 26, reps: null, nextWeight: null });
  });

  it("skips blank rows, keeps the sheet's row numbers, and says which cells can't be read", () => {
    const { records } = readWorkoutLines(table, "w.xlsx");
    expect(records).toHaveLength(3);
    expect(records[2].row).toBe(5);
    expect(records[2].problems).toEqual(['date: not a date ("soon")', 'order: not a number ("x")']);
  });

  it("names the columns it expected and did not find", () => {
    const { missing } = readWorkoutLines([["DateofWorkout", "MachineName", "Weight"]], "w.csv");
    expect(missing).toEqual(["order", "reps", "nextWeight"]);
  });
});

describe("profiles", () => {
  it("reads the few columns Journey uses, and never the JSON column", () => {
    const table = [
      ["__ID_Client", "NameFull", "NameFirst", "NameLast", "_ID_Franchise", "_MindBodyID", "JSON", "WorkoutCount", "WorkoutNotes", "FirstAppt", "SITEID"],
      ["FM-1", "Test Client", "Test", "Client", "FR-1", "100000001", '{"ClientCreditCard":{"LastFour":"0000"}}', "60", "Left shoulder", "2026-02-20T00:00:00", "29068"],
    ];
    const { records, missing } = readProfiles(table, "p.xlsx");
    expect(missing).toEqual([]);
    expect(records[0]).toEqual({
      file: "p.xlsx",
      row: 2,
      fmClientId: "FM-1",
      mindbodyClientId: "100000001",
      siteId: "29068",
      fmStudioId: "FR-1",
      name: "Test Client",
      firstName: "Test",
      lastName: "Client",
      workoutNotes: "Left shoulder",
      workoutCount: 60,
      firstAppointment: "2026-02-20",
      homeLocation: null,
    });
    expect(JSON.stringify(records)).not.toContain("LastFour");
  });

  it("names a missing Mindbody id or site, the two things Journey finds her by", () => {
    expect(readProfiles([["__ID_Client", "NameFull"]], "p.csv").missing).toEqual(["mindbodyClientId", "siteId"]);
  });
});
