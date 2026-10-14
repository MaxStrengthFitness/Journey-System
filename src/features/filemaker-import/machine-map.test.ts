import { describe, expect, it } from "vitest";
import { draftMap, machineResolver, mapFromCsv, mapToCsv, movementOfName, suggest, tableProblems, type FloorUnit, type MapRow } from "./machine-map";

describe("FileMaker's machine names, as the twenty movements", () => {
  it("knows every name the Oct 12 samples used", () => {
    const cases: [string, string, boolean][] = [
      ["Comp. Row", "m-compound-row", true],
      ["Hip ADD", "m-hip-add", true],
      ["Hip ABD", "m-hip-abd", true],
      ["Leg Curl", "m-leg-curl", true],
      ["Leg Ext.", "m-ext", true],
      ["Leg Press", "m-leg-press", true],
      ["Chest fly", "m-chest-fly", true],
      ["Chest Fly", "m-chest-fly", true],
      ["Chest Press", "m-chest-press", true],
      ["Seated Dip", "m-dip", true],
      ["Pullover", "m-pullover", true],
      ["Pulldown", "m-pulldown", true],
      ["Bicep", "m-bicep", true],
      ["Simple Row", "m-simple-row", true],
      ["Lateral Raise", "m-lateral-raise", true],
      ["Overhead", "m-overhead-press", true],
      ["Lumbar", "m-lumbar", true],
      ["Abs", "m-abs", true],
      ["Torso Rotation", "m-torso-rotation", true],
      // A movement's name and more: a vendor's unit, never a sure match.
      ["Leg Press Imag.", "m-leg-press", false],
      ["Leg Press Hoist", "m-leg-press", false],
      ["Overhead SSS", "m-overhead-press", false],
      ["Pulldown Nt", "m-pulldown", false],
    ];
    for (const [fm, movement, exact] of cases) expect([fm, movementOfName(fm)]).toEqual([fm, { movement, exact }]);
  });

  it("knows the Academy's codes, and says nothing about a name it does not know", () => {
    expect(movementOfName("PO")).toEqual({ movement: "m-pullover", exact: true });
    expect(movementOfName("Rear Delt Hoist")).toBe(null);
    expect(movementOfName("")).toBe(null);
  });
});

describe("suggesting a studio's unit", () => {
  const floor: FloorUnit[] = [
    { id: "m-compound-row", name: "COMPOUND ROW", movement: "m-compound-row" },
    { id: "m-leg-press", name: "LEG PRESS", movement: "m-leg-press" },
    { id: "sm-strongsville-leg-press-hoist", name: "Leg Press (Hoist)", movement: "m-leg-press" },
    { id: "sm-strongsville-cx", name: "Cx", movement: null },
  ];

  it("is sure of the same name on the floor, and of a movement's own name with one unit of it", () => {
    expect(suggest("Cx", floor)).toMatchObject({ machineId: "sm-strongsville-cx", sure: true });
    expect(suggest("Comp. Row", floor)).toMatchObject({ machineId: "m-compound-row", sure: true });
  });

  it("never chooses between two of a studio's units", () => {
    const s = suggest("Leg Press Imag.", floor);
    expect(s.machineId).toBe(null);
    expect(s.note).toMatch(/the studio has 2/);
  });

  it("offers the only unit for a vendor's name, without being sure of it", () => {
    expect(suggest("Leg Press Imag.", floor.slice(0, 2))).toMatchObject({ machineId: "m-leg-press", sure: false });
  });

  it("says when the movement is not on this floor", () => {
    expect(suggest("Bicep", floor)).toMatchObject({ machineId: null, note: expect.stringMatching(/not on this studio's floor/) });
  });
});

describe("the machine table", () => {
  const floors = new Map<string, FloorUnit[]>([
    ["S1", [{ id: "m-compound-row", name: "COMPOUND ROW", movement: "m-compound-row" }, { id: "m-leg-press", name: "LEG PRESS", movement: "m-leg-press" }]],
  ]);
  const seen = [
    { studio: "S1", fmName: "Comp. Row", day: "2026-03-01" },
    { studio: "S1", fmName: "Comp. Row", day: "2026-03-05" },
    { studio: "S1", fmName: "Leg Press Imag.", day: "2026-03-01" },
  ];

  it("drafts one row per studio and name, fills in only what it is sure of, and counts the uses", () => {
    const rows = draftMap(seen, floors);
    expect(rows.map((r) => [r.fmName, r.machineId, r.suggested, r.uses, r.firstUsed, r.lastUsed])).toEqual([
      ["Comp. Row", "m-compound-row", "m-compound-row", 2, "2026-03-01", "2026-03-05"],
      ["Leg Press Imag.", null, "m-leg-press", 1, "2026-03-01", "2026-03-01"],
    ]);
  });

  it("goes to CSV and back, with the studio's name for the reader only", () => {
    const rows = draftMap(seen, floors);
    const csv = mapToCsv(rows, new Map([["S1", "Strongsville"]]));
    expect(csv.split("\r\n")[0]).toBe("Studio,Studio name,Client,Client name,FileMaker machine,Journey machine,From,Until,Uses,First used,Last used,Suggested,Note");
    expect(csv).toContain("S1,Strongsville,,,Comp. Row,m-compound-row");
    const back = mapFromCsv(csv);
    expect(back.problems).toEqual([]);
    expect(back.rows.map((r) => [r.studio, r.fmName, r.machineId])).toEqual([
      ["S1", "Comp. Row", "m-compound-row"],
      ["S1", "Leg Press Imag.", null],
    ]);
  });

  it("keeps what a person settled when it drafts again", () => {
    const settled: MapRow[] = [
      { studio: "S1", fmName: "Leg Press Imag.", machineId: "m-leg-press", from: null, until: null, uses: 9, firstUsed: null, lastUsed: null, suggested: null, note: "checked by AJ" },
    ];
    const rows = draftMap(seen, floors, settled);
    expect(rows.find((r) => r.fmName === "Leg Press Imag.")).toMatchObject({ machineId: "m-leg-press", note: "checked by AJ", uses: 1 });
  });

  it("splits one FileMaker name into two machines by date, and refuses a day two rows both claim", () => {
    const rows: MapRow[] = [
      { studio: "S1", fmName: "Pullover", machineId: "sm-s1-pullover-old", from: null, until: "2024-10-13", uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
      { studio: "S1", fmName: "Pullover", machineId: "m-pullover", from: "2024-10-14", until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
      { studio: "S1", fmName: "Abs", machineId: "m-abs", from: null, until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
      { studio: "S1", fmName: "abs", machineId: "sm-s1-abs", from: null, until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
      { studio: "S1", fmName: "PO", machineId: "skip", from: null, until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
    ];
    const resolve = machineResolver(rows);
    expect(resolve("S1", "Pullover", "2024-09-30")).toBe("sm-s1-pullover-old");
    expect(resolve("S1", "Pullover", "2024-10-14")).toBe("m-pullover");
    expect(resolve("S1", "Abs", "2024-10-14")).toBe(null);
    expect(resolve("S1", "PO", "2024-10-14")).toBe("skip");
    expect(resolve("S2", "Pullover", "2024-10-14")).toBe(null);
    // And the check before an import names the clash.
    expect(tableProblems(rows, () => true)).toEqual(['Abs (S1): two rows claim the same days ("m-abs" and "sm-s1-abs"); give them From and Until']);
  });

  it("reports a date it can't read in a person's table, a day that isn't real, and From after Until, and never guesses one", () => {
    const { rows, problems } = mapFromCsv(
      "Studio,FileMaker machine,Journey machine,From,Until\nS1,Pullover,m-pullover,Oct 14,\nS1,Abs,m-abs,10/14/2024,\nS1,Bicep,m-bicep,13/45/2024,\nS1,Lumbar,m-lumbar,2024-05-01,2024-04-01\n",
    );
    expect(problems).toEqual([
      'Line 2: "From" should be a real day like 2024-10-14 (it says "Oct 14")',
      'Line 4: "From" should be a real day like 2024-10-14 (it says "13/45/2024")',
      'Line 5: "From" 2024-05-01 is after "Until" 2024-04-01',
    ]);
    expect(rows.map((r) => r.from)).toEqual([null, "2024-10-14", null, "2024-05-01"]);
  });

  it("reads skip in any capitals", () => {
    expect(mapFromCsv("Studio,FileMaker machine,Journey machine\nS1,PO,Skip\n").rows[0].machineId).toBe("skip");
  });

  it("refuses a Journey machine that isn't on the studio's floor, so a typo is never written into sets", () => {
    const rows = mapFromCsv("Studio,FileMaker machine,Journey machine\nS1,Lumbar,m-lumbr\nS1,Abs,m-abs\n").rows;
    expect(tableProblems(rows, (_s, id) => id === "m-abs")).toEqual(["Lumbar (S1): \"m-lumbr\" is not a machine on that studio's floor"]);
  });

  it("keeps two rows a person wrote that disagree, so the clash stays in view", () => {
    const settled: MapRow[] = [
      { studio: "S1", fmName: "Chest Fly", machineId: "m-chest-fly", from: null, until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
      { studio: "S1", fmName: "chest  fly", machineId: "m-other", from: null, until: null, uses: 0, firstUsed: null, lastUsed: null, suggested: null, note: null },
    ];
    expect(draftMap([{ studio: "S1", fmName: "Chest fly", day: "2026-01-01" }], new Map(), settled).map((r) => r.machineId).sort()).toEqual(["m-chest-fly", "m-other"]);
  });
});

describe("one client's own rows (Allan Boike's export, Oct 13 2026)", () => {
  const row = (fmName: string, machineId: string, extra: Partial<MapRow> = {}): MapRow => ({
    studio: "S1",
    fmName,
    machineId,
    from: null,
    until: null,
    uses: 0,
    firstUsed: null,
    lastUsed: null,
    suggested: null,
    note: null,
    ...extra,
  });
  // The studio's names, and one client whose export named two machines wrongly from Aug 24 2024.
  const rows: MapRow[] = [
    row("Abs", "m-abs"),
    row("Chest fly", "m-chest-fly"),
    row("Abs", "m-chest-fly", { client: "C1", from: "2024-08-24" }),
    row("Chest fly", "m-pulldown", { client: "C1", from: "2024-08-24" }),
  ];

  it("answers for that client on the days it claims, and the studio's row everywhere else", () => {
    const resolve = machineResolver(rows);
    expect(resolve("S1", "Abs", "2024-08-24", "C1")).toBe("m-chest-fly");
    expect(resolve("S1", "Chest fly", "2026-10-10", "C1")).toBe("m-pulldown");
    expect(resolve("S1", "Abs", "2024-08-20", "C1")).toBe("m-abs");
    expect(resolve("S1", "Abs", "2024-08-24", "C2")).toBe("m-abs");
    expect(resolve("S1", "Abs", "2024-08-24")).toBe("m-abs");
  });

  it("holds an entry back when two of the client's own rows claim the day, and says so before an import", () => {
    const clash = [...rows, row("Abs", "m-lumbar", { client: "C1", from: "2025-01-01" })];
    expect(machineResolver(clash)("S1", "Abs", "2025-02-01", "C1")).toBe(null);
    expect(tableProblems(clash, () => true)).toEqual(['Abs (S1, client C1): two rows claim the same days ("m-chest-fly" and "m-lumbar"); give them From and Until']);
    // The client's row over the studio's is what it is for, never a clash.
    expect(tableProblems(rows, () => true)).toEqual([]);
  });

  it("goes to CSV and back with the client's name for the reader only, and reads a table that has no Client column", () => {
    const csv = mapToCsv(rows, new Map([["S1", "Strongsville"]]), new Map([["C1", "Allan Boike"]]));
    expect(csv).toContain("S1,Strongsville,C1,Allan Boike,Abs,m-chest-fly,2024-08-24");
    expect(mapFromCsv(csv).rows.map((r) => [r.client, r.fmName, r.machineId, r.from])).toEqual([
      [null, "Abs", "m-abs", null],
      [null, "Chest fly", "m-chest-fly", null],
      ["C1", "Abs", "m-chest-fly", "2024-08-24"],
      ["C1", "Chest fly", "m-pulldown", "2024-08-24"],
    ]);
    expect(mapFromCsv("Studio,FileMaker machine,Journey machine\nS1,Abs,m-abs\n").rows[0].client).toBe(null);
  });

  it("counts a client's use on the client's row when it claims the day, and keeps the rows apart in the draft", () => {
    const drafted = draftMap(
      [
        { studio: "S1", fmName: "Abs", day: "2024-08-20", client: "C1" },
        { studio: "S1", fmName: "Abs", day: "2024-09-01", client: "C1" },
        { studio: "S1", fmName: "Abs", day: "2024-09-01", client: "C2" },
      ],
      new Map(),
      rows,
    );
    expect(drafted.filter((r) => r.fmName === "Abs").map((r) => [r.client ?? null, r.uses])).toEqual([
      [null, 2],
      ["C1", 1],
    ]);
  });
});
