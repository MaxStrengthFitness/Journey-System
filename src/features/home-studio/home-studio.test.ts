import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import { bookingsWord, maySeeHomeStudioNotice, noticeHeading, noticeSentence } from "./home-studio";

const STRONG = "BVDDRe5AqQZFihRLW0vK";
const WEST = "A4uvDltWoJuCas0hqEkG";
const person = (p: Partial<Trainer>) => ({ id: "t1", fullName: "T", initials: "T", role: "LifeTransformer", primaryHomeStudioId: STRONG, ...p }) as Trainer;

describe("maySeeHomeStudioNotice", () => {
  it("shows to a head trainer, studio leader, studio owner and franchise owner of this studio", () => {
    for (const role of ["HeadTrainer", "StudioLeader", "StudioOwner", "FranchiseOwner"] as const) {
      expect(maySeeHomeStudioNotice(person({ role }), STRONG)).toBe(true);
    }
  });

  it("shows to administrators at any studio", () => {
    for (const role of ["Admin", "Founder"] as const) expect(maySeeHomeStudioNotice(person({ role, primaryHomeStudioId: WEST }), STRONG)).toBe(true);
  });

  it("shows to a trainer given the grant for this studio, and to nobody else", () => {
    expect(maySeeHomeStudioNotice(person({ managedStudioIds: [STRONG] }), STRONG)).toBe(true);
    expect(maySeeHomeStudioNotice(person({}), STRONG)).toBe(false);
  });

  it("does not show to a leader of another studio", () => {
    expect(maySeeHomeStudioNotice(person({ role: "HeadTrainer", primaryHomeStudioId: WEST }), STRONG)).toBe(false);
  });

  it("never shows in Demo Mode, or with no one or no studio", () => {
    expect(maySeeHomeStudioNotice(person({ role: "Admin" }), "demo-studio")).toBe(false);
    expect(maySeeHomeStudioNotice(null, STRONG)).toBe(false);
    expect(maySeeHomeStudioNotice(person({ role: "Admin" }), null)).toBe(false);
  });
});

describe("the words", () => {
  it("says where she is filed, how many bookings here, and the latest", () => {
    expect(noticeSentence({ here: 4, homeStudioName: "westlake" }, "Oct 18")).toBe("Filed at westlake. 4 bookings here lately, the latest Oct 18.");
  });

  it("says so when she is filed nowhere, and drops a missing date", () => {
    expect(noticeSentence({ here: 1, homeStudioName: null }, null)).toBe("Not filed at any studio yet. 1 booking here lately.");
  });

  it("counts in the singular and plural", () => {
    expect(bookingsWord(1)).toBe("1 booking");
    expect(bookingsWord(3)).toBe("3 bookings");
    expect(noticeHeading(2)).toBe("Booked here, filed at another studio: 2");
  });
});
