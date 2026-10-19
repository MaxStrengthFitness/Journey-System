import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  setDoc,
  getDoc,
  doc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  deleteField,
  FieldPath,
} from "firebase/firestore";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import * as fs from "fs";
import { claimedProfile, tombstone } from "../src/features/trainer-identity/claim";
import { addMachineTotalsWrite } from "../src/features/machine-totals/store";
import { splitMachineTotalsUpdates } from "../src/features/machine-totals/totals";
import { assignSessionPatch } from "../src/features/open-session/assign";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Initialize testing environment
  const rules = fs.readFileSync("firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-ai-studio",
    firestore: {
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Setup standard base data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "studios", "studioA"), { name: "Studio A" });
    await setDoc(doc(db, "studios", "studioB"), { name: "Studio B" });

    // Trainer A (Studio A)
    await setDoc(doc(db, "trainers", "trainerA"), {
      fullName: "Trainer A",
      initials: "TA",
      role: "LifeTransformer",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    });

    // Trainer A's Secret
    await setDoc(doc(db, "trainers", "trainerA", "secrets", "account"), {
      pinHash: "xyz",
    });

    // Trainer B (Studio B)
    await setDoc(doc(db, "trainers", "trainerB"), {
      fullName: "Trainer B",
      initials: "TB",
      role: "LifeTransformer",
      primaryHomeStudioId: "studioB",
      accessibleStudioIds: ["studioB"],
    });

    // StudioOwner A (Studio A)
    await setDoc(doc(db, "trainers", "ownerA"), {
      fullName: "Owner A",
      initials: "OA",
      role: "StudioOwner",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    });

    // Session in Studio A
    await setDoc(doc(db, "sessions", "sessionA"), {
      hostedAtStudioId: "studioA",
      clientId: "clientA",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore Security Rules", () => {
  // (a) A regular Trainer reads the trainers of their own studios, never the
  // whole collection (the trainer lock, Oct 18 2026; until it,
  // getDocs(collection('trainers')) succeeded for any signed-in account).
  it("lets a regular Trainer read their studio's trainers, and refuses the whole collection", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = trainerContext.firestore();
    await assertSucceeds(getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", ["studioA", "demo-studio"]))));
    await assertFails(getDocs(collection(db, "trainers")));
  });

  // (b) cross-studio session read FAILS
  it("denies cross-studio session read", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "sessions", "sessionA"));
    await assertFails(p);
  });

  // (c) cross-studio session create FAILS
  it("denies cross-studio session create", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = setDoc(doc(db, "sessions", "sessionA_new"), {
      hostedAtStudioId: "studioA",
      clientId: "clientA",
    });
    await assertFails(p);
  });

  // (d) same-studio session read SUCCEEDS
  it("allows same-studio session read", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "sessions", "sessionA"));
    await assertSucceeds(p);
  });

  // (e) trainer-B reading trainers/trainer-A/secrets/account FAILS
  it("denies trainer reading another trainers secret account", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "trainers", "trainerA", "secrets", "account"));
    await assertFails(p);
  });

  // (f) access_requests (privacy, Oct 10 2026). A request holds a stranger's
  // name, email and phone, and anyone with a Google account can sign in. It
  // used to be created by anyone, signed in or not, under any id, and read by
  // every signed-in user. Now a Type 1 request is created signed in, at the
  // sender's own uid (front-door/my-request.ts), and read by its sender and
  // by the people who let people in (features/admin/staff/request-readers.ts).
  describe("access_requests", () => {
    const request = (uid: string, extra: Record<string, unknown> = {}) => ({
      fullName: "Nia New",
      email: "nia@example.com",
      phone: "555-0100",
      roleRequested: "Trainer",
      requestedStudioId: "studioA",
      reason: "",
      status: "Pending",
      userId: uid,
      ...extra,
    });
    const seed = async () =>
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "access_requests", "nia"), request("nia"));
        await setDoc(doc(db, "access_requests", "picker1"), {
          type: "studio_access",
          trainerId: "trainerA",
          fullName: "Trainer A",
          studioId: "studioB",
          status: "Pending",
        });
        await setDoc(doc(db, "trainers", "adminX"), { fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "studioB" });
        // The franchise partition (Oct 2026): a franchise owner OF studioA.
        await setDoc(doc(db, "trainers", "franchiseX"), { fullName: "Fran Owner", initials: "FO", role: "FranchiseOwner", primaryHomeStudioId: "studioB", ownedStudioIds: ["studioA"] });
        await setDoc(doc(db, "trainers", "grantX"), {
          fullName: "Gus Grant",
          initials: "GG",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioB",
          managedStudioIds: ["studioB"],
        });
      });
    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();
    const pending = (db: ReturnType<typeof as>) => getDocs(query(collection(db, "access_requests"), where("status", "==", "Pending")));
    // The query a leader's or owner's list makes (useStaffRoster.ts, the
    // franchise partition): the status, and the studios they run. A helper
    // over the field name lives here only; the app names each field literally.
    const pendingFor = (db: ReturnType<typeof as>, field: string, ids: string[]) =>
      getDocs(query(collection(db, "access_requests"), where("status", "==", "Pending"), where(field, "in", ids)));

    it("refuses a request from someone who isn't signed in", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(anon, "access_requests", "nobody"), request("nobody")));
      await assertFails(addDoc(collection(anon, "access_requests"), { fullName: "Test User", email: "test@example.com", status: "Pending" }));
    });

    it("lets a signed-in person send their own request, at their own uid only", async () => {
      const nia = as("nia");
      await assertSucceeds(setDoc(doc(nia, "access_requests", "nia"), request("nia")));
      // Under someone else's id, or a random one, or naming another account to approve.
      await assertFails(setDoc(doc(nia, "access_requests", "someoneElse"), request("nia")));
      await assertFails(addDoc(collection(nia, "access_requests"), request("nia")));
      await assertFails(setDoc(doc(as("raj"), "access_requests", "raj"), request("trainerB")));
      // Still the old field checks: no email, no request.
      const { email: _email, ...noEmail } = request("raj");
      await assertFails(setDoc(doc(as("raj"), "access_requests", "raj"), noEmail));
    });

    it("lets the sender read their own request, and find none before sending", async () => {
      await seed();
      await assertSucceeds(getDoc(doc(as("nia"), "access_requests", "nia")));
      await assertSucceeds(getDoc(doc(as("raj"), "access_requests", "raj")));
    });

    it("keeps everyone else out: another signed-in stranger, a trainer, and their list of every request", async () => {
      await seed();
      await assertFails(getDoc(doc(as("raj"), "access_requests", "nia")));
      await assertFails(getDoc(doc(as("trainerB"), "access_requests", "nia")));
      await assertFails(getDoc(doc(as("trainerB"), "access_requests", "picker1")));
      await assertFails(pending(as("trainerB")));
      await assertFails(pending(as("raj")));
    });

    it("lets the people who run the studio a request names read it, through a query that names the studio", async () => {
      await seed();
      // studioA's leader and its franchise owner: nia names studioA.
      for (const uid of ["ownerA", "franchiseX"]) {
        await assertSucceeds(getDoc(doc(as(uid), "access_requests", "nia")));
        await assertSucceeds(pendingFor(as(uid), "requestedStudioId", ["studioA"]));
        // The status-only list is administrators' now (the franchise partition).
        await assertFails(pending(as(uid)));
      }
      // The grant at studioB: the studio-access request naming B, not nia.
      await assertSucceeds(getDoc(doc(as("grantX"), "access_requests", "picker1")));
      await assertFails(getDoc(doc(as("grantX"), "access_requests", "nia")));
      await assertSucceeds(pendingFor(as("grantX"), "studioId", ["studioB"]));
      // An administrator reads every one.
      await assertSucceeds(getDoc(doc(as("adminX"), "access_requests", "nia")));
      await assertSucceeds(pending(as("adminX")));
    });

    it("keeps the studio picker's own query working, for the person it names only", async () => {
      await seed();
      const mine = (db: ReturnType<typeof as>, uid: string) =>
        getDocs(
          query(
            collection(db, "access_requests"),
            where("trainerId", "==", uid),
            where("type", "==", "studio_access"),
            where("status", "==", "Pending"),
          ),
        );
      await assertSucceeds(mine(as("trainerA"), "trainerA"));
      await assertFails(mine(as("trainerB"), "trainerA"));
      // The franchise partition (second review): a studio-access request
      // sits at sa_{uid}_{studioId}, never at an auto-id.
      await assertSucceeds(
        setDoc(doc(as("trainerA"), "access_requests", "sa_trainerA_studioB"), { type: "studio_access", trainerId: "trainerA", studioId: "studioB", status: "Pending" }),
      );
      await assertFails(
        addDoc(collection(as("trainerA"), "access_requests"), { type: "studio_access", trainerId: "trainerA", studioId: "studioB", status: "Pending" }),
      );
    });

    it("keeps approval working, and stops anyone rewriting another person's studio request by naming themselves", async () => {
      await seed();
      await assertSucceeds(updateDoc(doc(as("ownerA"), "access_requests", "nia"), { status: "Approved", approvedTrainerId: "nia" }));
      await assertFails(updateDoc(doc(as("trainerB"), "access_requests", "picker1"), { trainerId: "trainerB" }));
    });
  });

  it("allows a StudioOwner of studioA to read trainers/trainerA/secrets/account", async () => {
    const ownerContext = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ownerContext.firestore();
    const p = getDoc(doc(db, "trainers", "trainerA", "secrets", "account"));
    await assertSucceeds(p);
  });

  it("denies trainerB from updating trainerA with privilege escalation", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = updateDoc(doc(db, "trainers", "trainerA"), {
      pinHash: "",
      role: "Founder",
    });
    await assertFails(p);
  });

  it("denies trainer creation with a non-empty pinHash on the main doc", async () => {
    const ownerContext = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ownerContext.firestore();
    const p = setDoc(doc(db, "trainers", "trainerC"), {
      fullName: "Trainer C",
      initials: "TC",
      primaryHomeStudioId: "studioA",
      role: "Trainer",
      pinHash: "some-hash",
    });
    await assertFails(p);
  });

  // Add Client is a temporary profile any trainer can start (Oct 2 2026).
  const temporaryClient = (studioId: string) => ({
    firstName: "Walk",
    lastName: "In",
    isActive: true,
    remainingSessions: 0,
    homeStudioId: studioId,
    requiresConsultation: true,
    provisional: true,
    provisionalSince: "2026-10-02T14:00:00.000Z",
    provisionalBy: "trainerB",
    provisionalReason: "New client, not in Mindbody yet",
  });

  it("lets a Life Transformer start a temporary profile at their own studio", async () => {
    const db = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertSucceeds(addDoc(collection(db, "clients"), temporaryClient("studioB")));
  });

  it("refuses a temporary profile at a studio the trainer does not work at", async () => {
    const db = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(addDoc(collection(db, "clients"), temporaryClient("studioA")));
  });

  // Cross-studio client tests
  it("denies trainerB from reading clientA if no cross-studio approval exists", async () => {
    // Client A is in studioA
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "clients", "clientA"));
    await assertFails(p);
  });

  it("allows trainerB from reading clientA if trainerB's primary studio is in clientA's approved list", async () => {
    // Client A has studioB in approved list
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "clients", "clientA"));
    await assertSucceeds(p);
  });

  it("denies trainerB from updating clientA even if trainerB's primary studio is in clientA's approved list", async () => {
    // Client A has studioB in approved list
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = updateDoc(doc(db, "clients", "clientA"), {
      firstName: "Updated Name",
    });
    await assertFails(p);
  });
  // ── STUDIO MACHINE NOTES (Catalog Redesign, Sep 2026) ─────────────────
  //
  // These exist because the Catalog wrote its "Studio Notes" box to
  // machines/{machineId} — the GLOBAL catalog document every studio reads —
  // with no studioId in the write at all. The tests that matter are that a
  // trainer CAN write their own studio's notes (or the feature is useless)
  // and that the global catalog stays closed to them (or the leak is back).

  it("allows a trainer to write their own studio's machine notes", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "machineNotes", "m-hip-abd"), {
        studioId: "studioA",
        machineId: "m-hip-abd",
        notes: "Left thigh pad sticks — pull it apart before the client sits.",
      }),
    );
  });

  it("keeps one studio's machine notes out of the global catalog doc", async () => {
    // The exact write the old handleSaveTip made.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "machines", "m-hip-abd"), {
        trainerTips: "Left thigh pad sticks",
      }),
    );
  });

  it("denies a trainer overriding the roster, which carries safety content", async () => {
    // Why machine notes are a sibling collection rather than a field on the
    // roster entry: a roster entry's `overrides` can rewrite clinicalWarnings.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "studios", "studioA", "roster", "m-hip-abd"), {
        source: "catalog",
        basedOn: "m-hip-abd",
        overrides: { clinicalWarnings: [] },
      }),
    );
  });

  // ── STUDIO TASKS (Studio To-Do, Sep 2026) ────────────────────────────
  //
  // The split that matters: authoring the checklist is a management act,
  // completing an item is the trainer's job. If either half is wrong the
  // feature is either useless or unsafe.

  it("allows a trainer to complete a task instance", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "studios", "studioA", "taskInstances", "wipe__2026-09-04__am__m-ext"),
        {
          studioId: "studioA",
          templateId: "wipe",
          localDate: "2026-09-04",
          shift: "am",
          machineId: "m-ext",
          status: "done",
          title: "Wipe down",
          category: "cleaning",
          kind: "machine",
        },
      ),
    );
  });

  it("denies a trainer authoring a task template", async () => {
    // Templates set the standard the floor is held to.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "studios", "studioA", "taskTemplates", "wipe"), {
        studioId: "studioA",
        title: "Wipe down",
        kind: "machine",
        category: "cleaning",
        target: { kind: "machine", machineIds: "all" },
        recurrence: { type: "daily" },
        active: true,
      }),
    );
  });

  it("allows a studio owner to author a task template", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "taskTemplates", "wipe"), {
        studioId: "studioA",
        title: "Wipe down",
        kind: "machine",
        category: "cleaning",
        target: { kind: "machine", machineIds: "all" },
        recurrence: { type: "daily" },
        active: true,
      }),
    );
  });

  it("denies a trainer deleting task history", async () => {
    // A wrong tick is re-opened, not erased — the audit trail survives.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      deleteDoc(
        doc(db, "studios", "studioA", "taskInstances", "wipe__2026-09-04__am"),
      ),
    );
  });

  // ── SELF-CREATED TRAINER DOCUMENTS (Admin Overhaul, Sep 2026) ─────────
  //
  // `allow create` has a bootstrap clause letting a signed-in person own
  // trainers/{their uid} — the claim at first sign-in depends on it. But
  // isValidTrainer placed no constraint on `role`, so any authenticated
  // Google account could create a trainer document for ITSELF with role
  // "Admin" and become a system administrator. The UPDATE rule has always
  // refused that escalation; create never did.
  //
  // These four are the whole contract: the escalation is closed, and the two
  // legitimate paths through that same clause still work.

  it("denies a signed-in account making itself an Admin", async () => {
    const ctx = testEnv.authenticatedContext("newguy", {
      email: "newguy@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        fullName: "New Guy",
        initials: "NG",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      }),
    );
  });

  it("denies a signed-in account making itself a Founder or Overseer", async () => {
    const db = testEnv
      .authenticatedContext("newguy", { email: "newguy@test.com" })
      .firestore();
    const base = {
      fullName: "New Guy",
      initials: "NG",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    };
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), { ...base, role: "Founder" }),
    );
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), { ...base, role: "Overseer" }),
    );
  });

  // ── WHO A SELF-MADE PROFILE MAY BE (Oct 3 2026) ──────────────────────
  //
  // The role ceiling above never looked at the studios, so a stranger could
  // create trainers/{own uid} at any real studio and skip the leader's
  // approval. A self-create is now the owner's bootstrap or a claim of a
  // placeholder someone else set up, and nothing else.
  // docs/rounds/2026-10-03-trainer-self-create.md.

  it("denies a stranger giving themselves a real studio", async () => {
    const db = testEnv
      .authenticatedContext("newguy", { email: "newguy@test.com" })
      .firestore();
    const base = { fullName: "New Guy", initials: "NG" };
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        ...base,
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      }),
    );
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        ...base,
        role: "StudioOwner",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA", "studioB"],
        ownedStudioIds: ["studioA", "studioB"],
        managedStudioIds: ["studioA"],
      }),
    );
    // No role at all reads as LifeTransformer to every rule.
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        ...base,
        primaryHomeStudioId: "studioB",
        activeGuestStudioIds: ["studioA"],
      }),
    );
  });

  it("denies a stranger a profile with no studios too", async () => {
    // Any trainers/{uid} makes isAnyAuthenticatedTrainer() true, and no
    // screen writes one, so "no studios" is not a door either.
    const db = testEnv
      .authenticatedContext("newguy", { email: "newguy@test.com" })
      .firestore();
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        fullName: "New Guy",
        initials: "NG",
        role: "LifeTransformer",
        primaryHomeStudioId: "system",
        accessibleStudioIds: [],
        activeGuestStudioIds: [],
      }),
    );
  });

  describe("claiming a placeholder at first sign-in", () => {
    // Shaped as mintProvisionalTrainer writes one (features/admin/provisional).
    const placeholder = {
      fullName: "Jane Smith",
      initials: "JS",
      role: "LifeTransformer",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
      activeGuestStudioIds: [],
      managedStudioIds: ["studioA"],
      mindbodyLinked: false,
      pendingClaim: true,
      email: "jane@test.com",
      provisional: true,
      createdAt: "2026-10-01T12:00:00.000Z",
    };
    const seed = (id: string, data: Record<string, unknown>) =>
      testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "trainers", id), data);
      });
    const jane = () =>
      testEnv
        .authenticatedContext("jane-uid", { email: "jane@test.com" })
        .firestore();
    // The app's own payload, so this fails if claim.ts and the rule drift.
    const claimOf = (fromId: string, data: Record<string, unknown>) =>
      claimedProfile({ ...data, id: fromId }, "jane-uid", "2026-10-03T09:00:00.000Z");

    it("still lets the person a placeholder was set up for claim it", async () => {
      await seed("ph-jane", placeholder);
      await assertSucceeds(
        setDoc(doc(jane(), "trainers", "jane-uid"), claimOf("ph-jane", placeholder)),
      );
      // And the tombstone the claim leaves on the placeholder, which she may
      // write as its owner by email (ownsTrainerDoc).
      await assertSucceeds(
        updateDoc(doc(jane(), "trainers", "ph-jane"), tombstone("jane-uid", "2026-10-03T09:00:01.000Z")),
      );
    });

    it("refuses a claim that changes the studios or the role", async () => {
      await seed("ph-jane", placeholder);
      const claimed = claimOf("ph-jane", placeholder);
      const db = jane();
      await assertFails(
        setDoc(doc(db, "trainers", "jane-uid"), {
          ...claimed,
          accessibleStudioIds: ["studioA", "studioB"],
        }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "jane-uid"), { ...claimed, primaryHomeStudioId: "studioB" }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "jane-uid"), { ...claimed, ownedStudioIds: ["studioA"] }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "jane-uid"), { ...claimed, role: "StudioOwner" }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "jane-uid"), { ...claimed, authUid: "someone-else" }),
      );
    });

    it("refuses a claim of someone else's placeholder", async () => {
      await seed("ph-jane", placeholder);
      const db = testEnv
        .authenticatedContext("newguy", { email: "newguy@test.com" })
        .firestore();
      await assertFails(
        setDoc(
          doc(db, "trainers", "newguy"),
          claimedProfile({ ...placeholder, id: "ph-jane" }, "newguy", "2026-10-03T09:00:00.000Z"),
        ),
      );
    });

    it("refuses a claim of a placeholder already claimed, or of a real profile", async () => {
      await seed("ph-jane", { ...placeholder, supersededByUid: "earlier-uid" });
      await assertFails(
        setDoc(doc(jane(), "trainers", "jane-uid"), claimOf("ph-jane", placeholder)),
      );

      // A colleague's working profile is not a placeholder, whatever the email.
      const { pendingClaim: _pending, ...colleague } = placeholder;
      await seed("colleague", colleague);
      await assertFails(
        setDoc(doc(jane(), "trainers", "jane-uid"), claimOf("colleague", colleague)),
      );

      // A claim naming no placeholder, or one that does not exist.
      const { claimedFromId: _drop, ...unnamed } = claimOf("ph-jane", placeholder);
      await assertFails(setDoc(doc(jane(), "trainers", "jane-uid"), unnamed));
      await assertFails(
        setDoc(doc(jane(), "trainers", "jane-uid"), claimOf("no-such-doc", placeholder)),
      );
    });
  });

  it("still allows the owner's own bootstrap to mint an Admin profile", async () => {
    // Exempted by email, mirroring the hard-coded bootstrap in
    // useAuthInitialization.ts -- the exact document it writes.
    const ctx = testEnv.authenticatedContext("ownerBootstrap", {
      email: "jurgensaj@gmail.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "trainers", "ownerBootstrap"), {
        id: "ownerBootstrap",
        fullName: "System Admin",
        initials: "SA",
        role: "Admin",
        email: "jurgensaj@gmail.com",
        primaryHomeStudioId: "system",
        accessibleStudioIds: ["system"],
        activeGuestStudioIds: [],
      }),
    );
  });

  // ── EQUIPMENT UPKEEP LOG (Admin Overhaul, Sep 2026) ───────────────────
  //
  // Any trainer may log work — the person who cleans the machine is the
  // person on the floor. Nobody may rewrite an entry afterwards: an
  // accountability log that can be edited is not one.

  it("allows a trainer to log equipment upkeep", async () => {
    const db = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "upkeepLog", "u1"), {
        machineId: "m-ext",
        kind: "deep-clean",
        at: "2026-09-06T14:00:00.000Z",
        byId: "trainerA",
        byName: "Trainer A",
      }),
    );
  });

  it("denies rewriting an upkeep entry after the fact", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "studios", "studioA", "upkeepLog", "u1"),
        { machineId: "m-ext", kind: "clean", at: "2026-09-06T14:00:00.000Z" },
      );
    });
    const db = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertFails(
      updateDoc(doc(db, "studios", "studioA", "upkeepLog", "u1"), {
        kind: "deep-clean",
      }),
    );
  });

  it("denies a trainer deleting an upkeep entry, but allows a studio owner", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "studios", "studioA", "upkeepLog", "u1"),
        { machineId: "m-ext", kind: "clean", at: "2026-09-06T14:00:00.000Z" },
      );
    });
    const trainerDb = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertFails(
      deleteDoc(doc(trainerDb, "studios", "studioA", "upkeepLog", "u1")),
    );

    const ownerDb = testEnv
      .authenticatedContext("ownerA", { email: "ownera@test.com" })
      .firestore();
    await assertSucceeds(
      deleteDoc(doc(ownerDb, "studios", "studioA", "upkeepLog", "u1")),
    );
  });

  // ── BUG REPORTS (Admin Overhaul R2 Phase 3) ──────────────────────
  //
  // useMyFeedback queries bug_reports filtered to the signed-in user so a
  // trainer can see what became of their reports. The read rule was
  // superadmin-only, so that listener was denied for everyone but the owner.
  it("lets a trainer read their own bug report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "mine"), {
        userId: "trainerA",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "bug_reports", "mine")));
  });

  it("denies a trainer reading somebody else's bug report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "theirs"), {
        userId: "someone-else",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertFails(getDoc(doc(ctx.firestore(), "bug_reports", "theirs")));
  });

  it("denies a trainer changing the status on their own report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "mine"), {
        userId: "trainerA",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), "bug_reports", "mine"), {
        status: "fixed",
      }),
    );
  });

  // ── CROSS-STUDIO TENANCY (Sep 2026) ──────────────────────────────────
  //
  // clients and sessions were both `allow read: if isAuthenticated()`. These
  // cover the policy that replaced it: your own studios, plus a client who
  // has approved cross-training at one of them; and a session you may read
  // if you may read its client, whatever studio it was hosted at.

  it("lets a trainer read a client at their own studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "mine"), {
        firstName: "Home",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "clients", "mine")));
  });

  it("denies a trainer editing a client at another studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "theirs"), {
        firstName: "Their",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), "clients", "theirs"), {
        firstName: "Edited",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      }),
    );
  });

  it("lets a trainer read a session whose client they can read, at another studio", async () => {
    // The point of scoping sessions by CLIENT rather than by studio: a
    // cross-train client's history has to stay whole.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "crossClient"), {
        firstName: "Cross",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
      await setDoc(doc(db, "sessions", "sessionAtA"), {
        hostedAtStudioId: "studioA",
        clientId: "crossClient",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "sessionAtA")));
  });

  it("denies a session whose client they cannot read", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "privateClient"), {
        firstName: "Private",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
      await setDoc(doc(db, "sessions", "privateSession"), {
        hostedAtStudioId: "studioA",
        clientId: "privateClient",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), "sessions", "privateSession")),
    );
  });

  it("lets a trainer read their own session after moving studios", async () => {
    // trainerB coached this at studioA and no longer works there.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions", "myOldSession"), {
        hostedAtStudioId: "studioA",
        clientId: "someoneElse",
        trainerId: "trainerB",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "myOldSession")));
  });

  it("does not fall over on a legacy session with no studio and no client", async () => {
    // Imports wrote sessions with hostedAtStudioId "" and no clientId. The
    // rule must DENY these rather than erroring on a malformed document path.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions", "legacySession"), {
        hostedAtStudioId: "",
        clientId: "",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(getDoc(doc(ctx.firestore(), "sessions", "legacySession")));
  });

  it("lets an owner read across their studio", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "sessionA")));
  });

  // ── RENEWALS: studio settings (Renewals round, Sep 2026) ──────────────
  //
  // studios/{s}/config/renewals: the studio's leaders write it, everyone who
  // works there reads it, nobody else sees it. config/renewalsSeen belongs to
  // the nightly job (Admin SDK) and cannot be written from the app.

  const validRenewalSettings = (uid: string) => ({
    conversationAtSessionsLeft: 12,
    breakDays: 14,
    payAsYouGoCountsAs: "retained",
    packages: [{ key: "committed", label: "Committed", sessions: 96, payments: 12 }],
    updatedBy: uid,
  });

  it("lets a studio's owner save its renewal settings", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA")),
    );
  });

  it("lets a trainer read their own studio's renewal settings but not change them", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA"));
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, validRenewalSettings("trainerA")));
  });

  it("keeps one studio's renewal settings from another studio's trainers", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA"));
    });
    const ctx = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" });
    await assertFails(getDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewals")));
  });

  it("refuses settings outside their ranges, or signed by someone else", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertFails(setDoc(ref, { ...validRenewalSettings("ownerA"), breakDays: 3 }));
    await assertFails(setDoc(ref, validRenewalSettings("trainerA")));
    await assertFails(setDoc(ref, { ...validRenewalSettings("ownerA"), surprise: true }));
  });

  // Auto-renewal (Sep 25 2026): whether the studio's packages renew by
  // themselves — on at the franchise studios, off at the corporate ones, on
  // by default. A yes or a no, set by the studio's leaders.
  it("lets a studio's owner answer whether its packages renew by themselves, either way", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertSucceeds(setDoc(ref, { ...validRenewalSettings("ownerA"), packagesRenewAutomatically: false }));
    await assertSucceeds(setDoc(ref, { packagesRenewAutomatically: true, updatedBy: "ownerA" }, { merge: true }));
  });

  it("refuses an auto-renewal answer that isn't a yes or a no", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertFails(setDoc(ref, { ...validRenewalSettings("ownerA"), packagesRenewAutomatically: "no" }));
  });

  it("keeps the auto-renewal answer from a trainer who doesn't lead the studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA"));
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertFails(setDoc(ref, { packagesRenewAutomatically: false, updatedBy: "trainerA" }, { merge: true }));
  });

  it("keeps the nightly job's names list read-only from the app", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    await assertFails(
      setDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewalsSeen"), { names: {} }),
    );
  });

  // ── RENEWALS: the snapshot is the nightly job's alone ─────────────────

  const renewalClient = {
    firstName: "Renewal",
    lastName: "Client",
    isActive: true,
    remainingSessions: 0,
    homeStudioId: "studioA",
    renewal: { situation: "on-track", sessionsLeft: 9 },
  };

  it("lets a trainer edit their client without touching the renewal snapshot", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    await assertSucceeds(updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), { globalNotes: "Prefers mornings" }));
  });

  it("denies anyone in the app rewriting the renewal snapshot", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    for (const uid of ["trainerA", "ownerA"]) {
      const ctx = testEnv.authenticatedContext(uid, { email: `${uid}@test.com` });
      await assertFails(
        updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), { renewal: { situation: "lapsed" } }),
      );
    }
  });

  // The profile's auto-renewal box (Sep 25 2026): a trainer's mark for one
  // contract, Journey's own field beside `renewal`, never inside it.
  const autoRenewMark = {
    renews: false,
    contractId: "c1",
    setAt: "2026-09-25T14:00:00.000Z",
    setById: "trainerA",
    setByName: "Trainer A",
  };

  it("lets a trainer at the client's studio mark auto-renewal, and clear the mark", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const ref = doc(ctx.firestore(), "clients", "renewalClient");
    await assertSucceeds(updateDoc(ref, { autoRenewMark, lastUpdatedBy: "trainerA" }));
    await assertSucceeds(updateDoc(ref, { autoRenewMark: null, lastUpdatedBy: "trainerA" }));
  });

  it("refuses another studio's trainer the auto-renewal mark", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    const ctx = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" });
    await assertFails(updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), { autoRenewMark }));
  });

  it("refuses an auto-renewal mark that rides along with a change to the renewal snapshot", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    await assertFails(
      updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), {
        autoRenewMark,
        renewal: { situation: "on-track", sessionsLeft: 9, autoRenews: false },
      }),
    );
  });

  it("denies creating a client that arrives with a renewal snapshot", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    await assertFails(setDoc(doc(ctx.firestore(), "clients", "newWithRenewal"), renewalClient));
  });

  // ── RENEWALS: conversations and cycles ─────────────────────────────────
  //
  // Trainers at the studio log conversations (a touch, plus the cycle's
  // latest-of-each fields); only leaders set stage, lead and outcome.

  const touch = (uid: string) => ({
    clientId: "c1",
    authorId: uid,
    authorName: "Trainer A",
    at: serverTimestamp(),
    leaning: "unsure",
    concerns: ["price"],
    interestedIn: null,
    note: "Worried about cost",
    needsLeader: true,
  });

  const cyclePatch = (uid: string) => ({
    clientId: "c1",
    clientName: "Client One",
    cycleKey: "9001",
    packageKey: "committed",
    chargeDate: "2026-11-14",
    latestLeaning: "unsure",
    latestConcerns: ["price"],
    latestInterestedIn: null,
    needsLeader: true,
    lastTouchBy: uid,
    lastTouchByName: "Trainer A",
    lastTouchAt: serverTimestamp(),
    touchCount: increment(1),
  });

  it("lets a trainer log a renewal conversation at their studio", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    const batch = writeBatch(db);
    batch.set(doc(collection(cycle, "touches")), touch("trainerA"));
    batch.set(cycle, cyclePatch("trainerA"), { merge: true });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(cycle));
  });

  it("keeps another studio's trainers out of its renewals", async () => {
    const ctx = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(cycle, cyclePatch("trainerB"), { merge: true }));
    await assertFails(getDoc(cycle));
  });

  it("denies a trainer setting the stage or the outcome", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), stage: "decided" }, { merge: true }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), outcome: "renewed" }, { merge: true }));
  });

  it("denies a backdated conversation, or a count bumped by more than one", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(doc(collection(cycle, "touches")), { ...touch("trainerA"), at: new Date("2026-01-01") }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), touchCount: increment(5) }, { merge: true }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), lastTouchAt: new Date("2026-01-01") }, { merge: true }));
  });

  it("denies a conversation signed with someone else's name", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(doc(collection(cycle, "touches")), touch("ownerA")));
    await assertFails(setDoc(cycle, cyclePatch("ownerA"), { merge: true }));
  });

  it("lets the studio's owner set stage and outcome", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertSucceeds(
      setDoc(
        cycle,
        { clientId: "c1", clientName: "Client One", cycleKey: "9001", stage: "decided", outcome: "upgraded", updatedBy: "ownerA" },
        { merge: true },
      ),
    );
  });

  it("lets the owner record an outcome with its closing day, even on a cycle the nightly job wrote", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Every field the job writes (server/renewals-job.ts).
      await setDoc(doc(context.firestore(), "studios", "studioA", "renewals", "9001"), {
        clientId: "c1",
        clientName: "Client One",
        cycleKey: "9001",
        packageKey: "committed",
        outcome: "lost",
        outcomeBy: "job",
        outcomeAt: new Date(),
        nextCycleKey: null,
        nextPackageKey: null,
        closedOn: "2026-07-20",
        primaryTrainerId: "trainerA",
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const cycle = doc(owner, "studios", "studioA", "renewals", "9001");
    await assertSucceeds(
      setDoc(
        cycle,
        { outcome: "pay-as-you-go", outcomeBy: "ownerA", closedOn: "2026-07-20", nextCycleKey: null, nextPackageKey: null, updatedBy: "ownerA" },
        { merge: true },
      ),
    );
    await assertFails(setDoc(cycle, { closedOn: "last July" }, { merge: true }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "renewals", "9001"), { closedOn: "2026-08-01" }, { merge: true }));
  });

  it("never lets a conversation be edited, and lets only a leader delete one", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "renewals", "9001", "touches", "t1"), {
        ...touch("trainerA"),
        at: new Date(),
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const path = ["studios", "studioA", "renewals", "9001", "touches", "t1"] as const;
    await assertFails(updateDoc(doc(trainer, ...path), { note: "rewritten" }));
    await assertFails(deleteDoc(doc(trainer, ...path)));
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── INBODY SCANS: health data, scoped like sessions ─────────────────────
  //
  // Every scan write is a batch with the client's inbodySummary, so each test
  // writes both halves the way the app does.

  const inbodyClient = {
    firstName: "InBody",
    lastName: "Client",
    isActive: true,
    remainingSessions: 0,
    homeStudioId: "studioA",
  };

  const scanData = (uid: string) => ({
    testedAt: "2026-09-02",
    device: "InBody 270S",
    source: "manual",
    studioId: "studioA",
    enteredBy: uid,
    enteredByName: "Trainer A",
    createdAt: serverTimestamp(),
    weightLb: 172.4,
    skeletalMuscleMassLb: 68.1,
    bodyFatMassLb: 53.8,
    percentBodyFat: 31.2,
    bmi: 27.8,
    totalBodyWaterLb: null,
    dryLeanMassLb: null,
    fatFreeMassLb: null,
    basalMetabolicRateKcal: null,
    smi: null,
    phaseAngle: null,
    segmentalLean: null,
  });

  const summary = { scanCount: 1, firstTestedAt: "2026-09-02", latestTestedAt: "2026-09-02" };

  async function seedInBody(withScan = false) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "inbodyClient"), inbodyClient);
      if (withScan) {
        await setDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "s1"), {
          ...scanData("trainerA"),
          createdAt: new Date(),
        });
      }
      // A second trainer at studio A, who did not enter the scan.
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
  }

  it("lets a trainer at the client's studio add a scan and its summary, and read them", async () => {
    await seedInBody();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "clients", "inbodyClient", "inbodyScans", "new1"), scanData("trainerA"));
    batch.update(doc(db, "clients", "inbodyClient"), { inbodySummary: summary, weight: "172" });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(db, "clients", "inbodyClient", "inbodyScans")));
  });

  it("keeps another studio's trainers from reading or adding scans", async () => {
    await seedInBody(true);
    const db = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "s1")));
    await assertFails(getDocs(collection(db, "clients", "inbodyClient", "inbodyScans")));
    await assertFails(setDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "new1"), scanData("trainerB")));
  });

  it("denies a scan signed with someone else's name, or with impossible numbers", async () => {
    await seedInBody();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "clients", "inbodyClient", "inbodyScans", "new1");
    await assertFails(setDoc(ref, scanData("ownerA")));
    await assertFails(setDoc(ref, { ...scanData("trainerA"), skeletalMuscleMassLb: 130 }));
    await assertFails(setDoc(ref, { ...scanData("trainerA"), visceralFat: 9 }));
  });

  it("lets a correction be signed, but never changes who entered a scan", async () => {
    await seedInBody(true);
    const db = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    const ref = doc(db, "clients", "inbodyClient", "inbodyScans", "s1");
    await assertSucceeds(
      updateDoc(ref, { bodyFatMassLb: 53.6, updatedBy: "trainerA2", updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(ref, { enteredBy: "trainerA2", updatedBy: "trainerA2", updatedAt: serverTimestamp() }),
    );
  });

  it("lets only whoever entered a scan, or a leader, remove it", async () => {
    await seedInBody(true);
    const path = ["clients", "inbodyClient", "inbodyScans", "s1"] as const;
    const other = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(deleteDoc(doc(other, ...path)));
    await assertSucceeds(deleteDoc(doc(author, ...path)));
  });

  it("lets the studio's owner remove a scan someone else entered", async () => {
    await seedInBody(true);
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "clients", "inbodyClient", "inbodyScans", "s1")));
  });

  // ── PLANNER NOTES: private by path; a shared copy reads like InBody ─────
  //
  // Round: Learning + Planner, Sep 2026. A share is a batch: the private
  // note (sharedWith set) and the copy on the client's record, together.

  const noteData = (over: Record<string, unknown> = {}) => ({
    title: "Knee plan",
    body: "No deep flexion on the leg press until the physio clears it.",
    kind: "injury",
    folderId: null,
    clientIds: ["notesClient"],
    clientNames: { notesClient: "Notes Client" },
    pinned: false,
    sharedWith: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  });

  const sharedData = (uid: string, over: Record<string, unknown> = {}) => ({
    clientId: "notesClient",
    title: "Knee plan",
    body: "No deep flexion on the leg press until the physio clears it.",
    kind: "injury",
    authorId: uid,
    authorName: "Trainer A",
    updatedAt: serverTimestamp(),
    ...over,
  });

  async function seedNotes() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "notesClient"), {
        firstName: "Notes",
        lastName: "Client",
        isActive: true,
        remainingSessions: 0,
        homeStudioId: "studioA",
      });
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      const at = new Date();
      // n1: shared, with its copy on the record.
      await setDoc(doc(db, "trainers", "trainerA", "notes", "n1"), {
        ...noteData({ sharedWith: "notesClient" }),
        createdAt: at,
        updatedAt: at,
      });
      await setDoc(doc(db, "clients", "notesClient", "sharedNotes", "n1"), { ...sharedData("trainerA"), updatedAt: at });
      // n2: says it is shared, but a leader already took the copy off.
      await setDoc(doc(db, "trainers", "trainerA", "notes", "n2"), {
        ...noteData({ sharedWith: "notesClient" }),
        createdAt: at,
        updatedAt: at,
      });
    });
  }

  it("keeps a trainer's notes and folders to that trainer alone", async () => {
    await seedNotes();
    const mine = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(mine, "trainers", "trainerA", "notes", "new1"), noteData()));
    await assertSucceeds(
      setDoc(doc(mine, "trainers", "trainerA", "noteFolders", "f1"), {
        name: "Rehab",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDocs(collection(mine, "trainers", "trainerA", "notes")));

    // Not a colleague at the same studio, not its owner, not another studio.
    for (const [uid, email] of [
      ["trainerA2", "trainera2@test.com"],
      ["ownerA", "ownera@test.com"],
      ["trainerB", "trainerb@test.com"],
    ]) {
      const other = testEnv.authenticatedContext(uid, { email }).firestore();
      await assertFails(getDoc(doc(other, "trainers", "trainerA", "notes", "n1")));
      await assertFails(getDocs(collection(other, "trainers", "trainerA", "notes")));
      await assertFails(getDocs(collection(other, "trainers", "trainerA", "noteFolders")));
      await assertFails(setDoc(doc(other, "trainers", "trainerA", "notes", "planted"), noteData()));
    }
  });

  /* The briefing round's "just for me" (Oct 17 2026, phase 4): a note the
     trainer marks just for them is a jot in this notebook. Its writer reads
     their own notes about one client (the briefing's one query, clientIds
     array-contains); nobody else does, an administrator included. */
  it("keeps a just-for-me note to its writer alone, an administrator included", async () => {
    await seedNotes();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminJfm"), { fullName: "Ada Admin", initials: "AA", role: "Admin" });
    });
    const mine = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      getDocs(query(collection(mine, "trainers", "trainerA", "notes"), where("clientIds", "array-contains", "notesClient"))),
    );
    const admin = testEnv.authenticatedContext("adminJfm", { email: "adminjfm@test.com", role: "Admin" }).firestore();
    await assertFails(getDoc(doc(admin, "trainers", "trainerA", "notes", "n1")));
    await assertFails(
      getDocs(query(collection(admin, "trainers", "trainerA", "notes"), where("clientIds", "array-contains", "notesClient"))),
    );
  });

  it("refuses a note the Planner could not read back", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "trainers", "trainerA", "notes", "bad");
    await assertFails(setDoc(ref, noteData({ title: "" })));
    await assertFails(setDoc(ref, noteData({ kind: "diagnosis" })));
    await assertFails(setDoc(ref, noteData({ extra: "field" })));
    await assertFails(setDoc(ref, noteData({ clientIds: Array.from({ length: 11 }, (_, i) => `c${i}`) })));
    // Shared means about exactly that one client.
    await assertFails(setDoc(ref, noteData({ sharedWith: "notesClient", clientIds: ["notesClient", "other"] })));
    await assertFails(setDoc(ref, noteData({ sharedWith: "other" })));
  });

  it("accepts research notes with sources and a working log, within their limits (Planner rework)", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "trainers", "trainerA", "notes", "r1");
    const jot = { id: "j1", at: 1, text: "pinch at the top", clientId: null };
    await assertSucceeds(
      setDoc(ref, noteData({ kind: "research", links: [{ url: "https://x.org/", title: "Review" }], log: [jot] })),
    );
    // A jot is one arrayUnion; the rest of the note is untouched and still valid.
    await assertSucceeds(
      updateDoc(ref, { log: arrayUnion({ ...jot, id: "j2", at: 2 }), updatedAt: serverTimestamp() }),
    );
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ ...jot, id: `j${i}` }));
    await assertFails(setDoc(doc(db, "trainers", "trainerA", "notes", "r2"), noteData({ log: tooMany })));
    const links = Array.from({ length: 11 }, (_, i) => ({ url: `https://s${i}.org/`, title: "" }));
    await assertFails(setDoc(doc(db, "trainers", "trainerA", "notes", "r3"), noteData({ links })));
    // The shared copy may carry sources, not the log.
    const batch = writeBatch(db);
    batch.set(ref, noteData({ kind: "research", sharedWith: "notesClient" }));
    batch.set(
      doc(db, "clients", "notesClient", "sharedNotes", "r1"),
      sharedData("trainerA", { kind: "research", links: [{ url: "https://x.org/", title: "Review" }] }),
    );
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(db, "clients", "notesClient", "sharedNotes", "r1"), sharedData("trainerA", { log: [jot] })),
    );
  });

  // ── NOTES SHARED WITH COLLEAGUES (Planner rework) ──────────────────────
  const shareData = (uid: string, over: Record<string, unknown> = {}) => ({
    noteId: "t1",
    studioId: "studioA",
    authorId: uid,
    authorName: "Trainer A",
    title: "Knee plan",
    body: "Week 2: add lumbar at 50%.",
    kind: "plan",
    links: [],
    clientIds: ["notesClient"],
    clientNames: { notesClient: "Notes Client" },
    audience: "people",
    audienceIds: ["trainerA2"],
    expiresOn: "2026-09-30",
    message: "Covering my Tuesdays",
    updatedAt: serverTimestamp(),
    ...over,
  });
  const marker = { studioId: "studioA", studioName: "Studio A", audience: "people", people: [{ id: "trainerA2", name: "A2" }], expiresOn: null, message: "" };

  it("shares a note with named colleagues, readable by them and not by others", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(a);
    batch.set(doc(a, "trainers", "trainerA", "notes", "t1"), noteData({ teamShare: marker }));
    batch.set(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA"));
    await assertSucceeds(batch.commit());

    const named = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(
      getDocs(query(collection(named, "studios", "studioA", "noteShares"), where("audienceIds", "array-contains", "trainerA2"))),
    );
    // A colleague who wasn't named, at the same studio, can't list or read it.
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(getDoc(doc(owner, "studios", "studioA", "noteShares", "t1")));
    const teamList = await getDocs(
      query(collection(owner, "studios", "studioA", "noteShares"), where("audience", "==", "team")),
    );
    expect(teamList.docs.map((d) => d.id)).not.toContain("t1");
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "noteShares", "t1")));
  });

  it("shares a note with the whole studio team, and nobody outside it", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA", { audience: "team", audienceIds: [] })),
    );
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(
      getDocs(query(collection(colleague, "studios", "studioA", "noteShares"), where("audience", "==", "team"))),
    );
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      getDocs(query(collection(elsewhere, "studios", "studioA", "noteShares"), where("audience", "==", "team"))),
    );
  });

  it("won't share in someone else's name, at another studio, or with nobody", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(a, "studios", "studioA", "noteShares", "t1");
    await assertFails(setDoc(ref, shareData("trainerA2")));
    await assertFails(setDoc(ref, shareData("trainerA", { audienceIds: [] })));
    await assertFails(setDoc(ref, shareData("trainerA", { log: [] })));
    await assertFails(setDoc(ref, shareData("trainerA", { noteId: "other" })));
    await assertFails(
      setDoc(doc(a, "studios", "studioB", "noteShares", "t1"), shareData("trainerA", { studioId: "studioB" })),
    );
  });

  it("lets only the author change a colleague copy, and the author or a leader take it down", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA")));
    const named = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(
      setDoc(doc(named, "studios", "studioA", "noteShares", "t1"), shareData("trainerA2", { title: "Mine now" })),
    );
    await assertFails(deleteDoc(doc(named, "studios", "studioA", "noteShares", "t1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "noteShares", "t1")));
    // The author's later unshare still succeeds with the copy already gone.
    const unshare = writeBatch(a);
    unshare.set(doc(a, "trainers", "trainerA", "notes", "t1"), noteData({ teamShare: null }));
    unshare.delete(doc(a, "studios", "studioA", "noteShares", "t1"));
    await assertSucceeds(unshare.commit());
  });

  it("shares a note onto the client's record in one batch, readable by the client's studio only", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "trainers", "trainerA", "notes", "n3"), noteData({ sharedWith: "notesClient" }));
    batch.set(doc(db, "clients", "notesClient", "sharedNotes", "n3"), sharedData("trainerA"));
    await assertSucceeds(batch.commit());

    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(colleague, "clients", "notesClient", "sharedNotes")));
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(elsewhere, "clients", "notesClient", "sharedNotes")));
    await assertFails(getDoc(doc(elsewhere, "clients", "notesClient", "sharedNotes", "n1")));
  });

  it("won't put a note on a record in someone else's name, or from another studio", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(a, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerA2")));
    await assertFails(
      setDoc(doc(a, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerA", { clientIds: ["x"] })),
    );
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(b, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerB")));
  });

  it("lets only the author rewrite a shared note", async () => {
    await seedNotes();
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(
      setDoc(doc(colleague, "clients", "notesClient", "sharedNotes", "n1"), sharedData("trainerA2", { title: "Mine now" })),
    );
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(author, "clients", "notesClient", "sharedNotes", "n1"), sharedData("trainerA", { title: "Knee plan, week 3" })),
    );
  });

  it("lets the author unshare or delete even when a leader already took the copy off", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, "trainers", "trainerA", "notes", "n2"));
    batch.delete(doc(db, "clients", "notesClient", "sharedNotes", "n2"));
    await assertSucceeds(batch.commit());

    const unshare = writeBatch(db);
    unshare.set(doc(db, "trainers", "trainerA", "notes", "n1"), noteData({ sharedWith: null }));
    unshare.delete(doc(db, "clients", "notesClient", "sharedNotes", "n1"));
    await assertSucceeds(unshare.commit());
  });

  it("lets the studio's leaders take a shared note off the record, not other trainers", async () => {
    await seedNotes();
    const path = ["clients", "notesClient", "sharedNotes", "n1"] as const;
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(deleteDoc(doc(colleague, ...path)));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── TEAM JOBS: leaders post, the studio's floor does the work ───────────
  //
  // Round: Planner rework, Sep 2026.

  const jobData = (over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    title: "Deep clean",
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [{ id: "trainerA", name: "Trainer A" }],
    assigneeIds: ["trainerA"],
    openToAll: true,
    parts: { p01: { id: "p01", label: "Mirrors", order: 0, refId: null, doneBy: null } },
    dueOn: null,
    requiresNote: false,
    notifyOnDone: true,
    status: "open",
    closingNote: null,
    completedBy: null,
    closedOn: null,
    createdBy: { id: "ownerA", name: "Owner A" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  });

  async function seedJobs() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioA", "teamJobs", "j1"), jobData());
    });
  }

  it("lets a studio's leader post a team job, and nobody else", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "teamJobs", "new"), jobData()));
    // In someone else's name, or at a studio they don't lead.
    await assertFails(
      setDoc(doc(owner, "studios", "studioA", "teamJobs", "n2"), jobData({ createdBy: { id: "trainerA", name: "A" } })),
    );
    await assertFails(setDoc(doc(owner, "studios", "studioB", "teamJobs", "n3"), jobData({ studioId: "studioB" })));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(
      setDoc(doc(trainer, "studios", "studioA", "teamJobs", "n4"), jobData({ createdBy: { id: "trainerA", name: "A" } })),
    );
    // Shape: a studio mismatch, or too many parts.
    const tooMany = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`p${i}`, { label: "x", order: i }]));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "teamJobs", "n5"), jobData({ parts: tooMany })));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "teamJobs", "n6"), jobData({ studioId: "studioB" })));
  });

  it("keeps team jobs to the studio's own people", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(trainer, "studios", "studioA", "teamJobs")));
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "teamJobs")));
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "teamJobs", "j1")));
  });

  it("lets the floor tick parts, join, leave and close — but not rewrite or cancel the job", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "teamJobs", "j1");
    await assertSucceeds(
      updateDoc(ref, { "parts.p01.doneBy": { id: "trainerA", name: "Trainer A" }, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(ref, {
        status: "done",
        closedOn: "2026-09-16",
        closingNote: "All clean",
        completedBy: { id: "trainerA", name: "Trainer A" },
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(ref, { status: "open", closedOn: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { title: "Something else", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdBy: { id: "trainerA", name: "A" } }));

    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      updateDoc(doc(elsewhere, "studios", "studioA", "teamJobs", "j1"), {
        "parts.p01.doneBy": { id: "trainerB", name: "Trainer B" },
      }),
    );

    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { title: "Deep clean (Sat)" }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { status: "cancelled" }));
    // A job a leader called off stays off for the floor.
    await assertFails(updateDoc(ref, { status: "open", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { status: "open" }));
  });

  it("lets the poster or a leader delete a team job, not the floor", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(deleteDoc(doc(trainer, "studios", "studioA", "teamJobs", "j1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "teamJobs", "j1")));
  });

  // ── MACHINE CARE (Relay, Sep 2026) ───────────────────────────────────────
  //
  // studios/{s}/machineCare/{machineId}: written from the Floor Map by
  // anyone who works at the studio, read by anyone signed in.

  const careData = (over: Record<string, unknown> = {}) => ({
    machineId: "m-leg-press",
    lastWipedAt: 1_758_000_000_000,
    lastWipedBy: { id: "trainerA", name: "Trainer A" },
    updatedAt: serverTimestamp(),
    ...over,
  });

  it("lets the studio's people record care, and nobody else", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineCare", "m-leg-press");
    await assertSucceeds(setDoc(ref, careData(), { merge: true }));
    await assertSucceeds(
      setDoc(ref, { machineId: "m-leg-press", lastDeepCleanAt: 1_758_000_100_000, lastDeepCleanBy: { id: "trainerA", name: "Trainer A" }, updatedAt: serverTimestamp() }, { merge: true }),
    );
    // Wrong machine in the body, a stray key, a non-numeric time.
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-row"), careData()));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", status: "broken" })));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", lastWipedAt: "yesterday" })));
    // Someone from another studio.
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(elsewhere, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", lastWipedBy: { id: "trainerB", name: "B" } })));
    await assertSucceeds(getDoc(doc(elsewhere, "studios", "studioA", "machineCare", "m-leg-press")));
  });

  it("signs a new flag with the caller, and lets a wipe merge over someone else's flag", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineCare", "m-leg-press");
    const flag = { note: "Pad torn", by: { id: "trainerA", name: "Trainer A" }, at: 1_758_000_200_000 };
    await assertSucceeds(setDoc(ref, { machineId: "m-leg-press", flag, updatedAt: serverTimestamp() }, { merge: true }));
    // In someone else's name, or with no note.
    await assertFails(setDoc(ref, { machineId: "m-leg-press", flag: { ...flag, by: { id: "ownerA", name: "O" } }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(ref, { machineId: "m-leg-press", flag: { ...flag, note: "" }, updatedAt: serverTimestamp() }, { merge: true }));
    // The owner wipes it: the merged document still carries A's flag, untouched.
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press"), { machineId: "m-leg-press", lastWipedAt: 1_758_000_300_000, lastWipedBy: { id: "ownerA", name: "Owner A" }, updatedAt: serverTimestamp() }, { merge: true }),
    );
    // Anyone at the studio may clear a flag; the floor may not delete the record.
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press"), { machineId: "m-leg-press", flag: null, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(deleteDoc(ref));
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press")));
  });

  // ── MACHINE FIT (Sep 2026) ───────────────────────────────────────────────
  //
  // studios/{s}/machineFit/{machineId}: who at the studio is set to what, one
  // row per client. Written the way the app writes it: one row, by field path.

  const fitWrite = (clientId: string, row: unknown, over: Record<string, unknown> = {}) => ({
    data: { machineId: "m-leg-press", studioId: "studioA", rows: { [clientId]: row }, updatedAt: serverTimestamp(), ...over },
    options: { mergeFields: ["machineId", "studioId", "updatedAt", new FieldPath("rows", clientId)] },
  });
  const fitRow = (seat: string) => ({ s: { seat, gap: "0" }, t: 1_758_000_000_000 });

  it("lets the studio's people keep the machine-fit index, one row at a time", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-leg-press");
    const first = fitWrite("clientA", fitRow("4"));
    await assertSucceeds(setDoc(ref, first.data, first.options));
    // A second client's row leaves the first alone, and a row can be replaced and removed.
    const second = fitWrite("clientB", fitRow("6"));
    await assertSucceeds(setDoc(ref, second.data, second.options));
    const moved = fitWrite("clientA", { ...fitRow("5"), src: { seat: "suggested" } });
    await assertSucceeds(setDoc(ref, moved.data, moved.options));
    const gone = fitWrite("clientB", deleteField());
    await assertSucceeds(setDoc(ref, gone.data, gone.options));
    const snap = await getDoc(ref);
    expect(Object.keys(snap.data()?.rows ?? {})).toEqual(["clientA"]);
    expect(snap.data()?.rows.clientA.s.seat).toBe("5");

    // "Right for this client": one review copied onto her row, by nested path
    // (fit-store ackFitRow). It touches one row, so the same rule allows it —
    // and the rest of the row is left exactly as it was.
    await assertSucceeds(updateDoc(ref, new FieldPath("rows", "clientA", "a", "seat"), "5", "updatedAt", serverTimestamp()));
    const reviewed = (await getDoc(ref)).data();
    expect(reviewed?.rows.clientA.a).toEqual({ seat: "5" });
    expect(reviewed?.rows.clientA.s.seat).toBe("5");
    expect(reviewed?.rows.clientA.src).toEqual({ seat: "suggested" });
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      updateDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press"), new FieldPath("rows", "clientA", "a", "seat"), "1", "updatedAt", serverTimestamp()),
    );
  });

  it("lets a client's row be removed from a machine that has no index document yet", async () => {
    // Clearing every setting on a machine nobody has indexed: the app writes a
    // delete for her row, which creates the document with no `rows` at all.
    // Refusing it used to fail the Setup screen's whole index batch.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-never-indexed");
    const gone = fitWrite("clientA", deleteField(), { machineId: "m-never-indexed" });
    await assertSucceeds(setDoc(ref, gone.data, gone.options));
    // …and the next real row lands on that document like on any other.
    const row = fitWrite("clientB", fitRow("4"), { machineId: "m-never-indexed" });
    await assertSucceeds(setDoc(ref, row.data, row.options));
    expect(Object.keys((await getDoc(ref)).data()?.rows ?? {})).toEqual(["clientB"]);
  });

  it("refuses a machine-fit write that touches more than one row, names the wrong place, or adds a field", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineFit", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        rows: { clientA: fitRow("4"), clientB: fitRow("6") },
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-leg-press");
    // The whole map at once: every row would be "affected".
    await assertFails(setDoc(ref, { machineId: "m-leg-press", studioId: "studioA", rows: {}, updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(ref, { machineId: "m-leg-press", studioId: "studioA", rows: { clientA: fitRow("1"), clientB: fitRow("1") }, updatedAt: serverTimestamp() }),
    );
    // A new document arriving with a studio's worth of rows.
    await assertFails(
      setDoc(doc(trainer, "studios", "studioA", "machineFit", "m-row"), {
        machineId: "m-row",
        studioId: "studioA",
        rows: { clientA: fitRow("1"), clientB: fitRow("1") },
        updatedAt: serverTimestamp(),
      }),
    );
    // The wrong machine or studio in the body, and a stray field (body data does not belong here).
    const wrongMachine = fitWrite("clientC", fitRow("4"), { machineId: "m-row" });
    await assertFails(setDoc(ref, wrongMachine.data, wrongMachine.options));
    const wrongStudio = fitWrite("clientC", fitRow("4"), { studioId: "studioB" });
    await assertFails(setDoc(ref, wrongStudio.data, wrongStudio.options));
    await assertFails(setDoc(ref, { ...fitWrite("clientC", fitRow("4")).data, heights: { clientC: 67 } }, { merge: true }));
    // The floor cannot delete the index; it is rebuilt by script.
    await assertFails(deleteDoc(ref));
  });

  it("keeps a studio's machine-fit index to that studio's people", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineFit", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        rows: { clientA: fitRow("4") },
      });
      await setDoc(doc(context.firestore(), "trainers", "adminFit"), { fullName: "Admin", initials: "AD", role: "Admin" });
    });
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press")));
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "machineFit")));
    const write = fitWrite("clientZ", fitRow("4"));
    await assertFails(setDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press"), write.data, write.options));

    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(trainer, "studios", "studioA", "machineFit")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "machineFit", "m-leg-press")));
    const admin = testEnv.authenticatedContext("adminFit", { email: "adminfit@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(admin, "studios", "studioA", "machineFit")));
    await assertSucceeds(deleteDoc(doc(admin, "studios", "studioA", "machineFit", "m-leg-press")));
  });

  it("keeps the company Kaizen report to administrators, and nobody writes it from the app", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "kaizenReports", "m-leg-press"), { machineId: "m-leg-press", clients: 40 });
      await setDoc(doc(context.firestore(), "trainers", "adminFit"), { fullName: "Admin", initials: "AD", role: "Admin" });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(getDoc(doc(owner, "kaizenReports", "m-leg-press")));
    const admin = testEnv.authenticatedContext("adminFit", { email: "adminfit@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(admin, "kaizenReports", "m-leg-press")));
    await assertSucceeds(getDocs(collection(admin, "kaizenReports")));
    await assertFails(setDoc(doc(admin, "kaizenReports", "m-leg-press"), { clients: 1 }));
  });

  // ── THE VAULT (Relay, Sep 2026) ──────────────────────────────────────────

  it("keeps the vault to the studio's leaders", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const entry = { studioId: "studioA", kind: "incident", title: "Slip by the water cooler", body: "", onDate: "2026-09-16", people: "", status: "open", createdBy: { id: "ownerA", name: "Owner A" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "vault", "v1"), entry));
    await assertSucceeds(getDocs(collection(owner, "studios", "studioA", "vault")));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "vault", "v1"), { status: "closed", updatedAt: serverTimestamp() }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(getDocs(collection(trainer, "studios", "studioA", "vault")));
    await assertFails(getDoc(doc(trainer, "studios", "studioA", "vault", "v1")));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "vault", "v2"), { ...entry, createdBy: { id: "trainerA", name: "A" } }));
    // A leader of another studio is the floor here.
    await assertFails(getDocs(collection(owner, "studios", "studioB", "vault")));
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "vault", "v1")));
  });

  // ── THE MSF MACHINE DATABASE: studio content, sharing, and the lists ────
  //
  // Round: Learning + Planner, Sep 2026. Also closes the hole where any
  // signed-in trainer could write another studio's machine notes, upkeep
  // log, playbook and wiki.

  async function seedMachineDb() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioA", "roster", "sm-studioA-sled"), {
        machineId: "sm-studioA-sled",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Sled Push" },
      });
      await setDoc(doc(db, "studios", "studioA", "roster", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        source: "catalog",
        basedOn: "m-leg-press",
        status: "active",
      });
      await setDoc(doc(db, "studios", "studioA", "playbook", "tipShared"), {
        studioId: "studioA",
        title: "Knees on the leg press",
        situation: "Knee pain at the bottom",
        worked: "Seat one notch back",
        machineIds: ["m-leg-press"],
        tags: [],
        authorId: "trainerA",
        authorName: "Trainer A",
        shared: true,
        sharedKeys: ["m-leg-press"],
        studioName: "Studio A",
      });
      await setDoc(doc(db, "studios", "studioA", "playbook", "tipPrivate"), {
        studioId: "studioA",
        title: "Not shared",
        situation: "",
        worked: "Stays here",
        machineIds: ["m-leg-press"],
        tags: [],
        authorId: "trainerA",
        authorName: "Trainer A",
      });
    });
  }

  it("keeps a studio's machine notes, upkeep, tips and notes to the people who work there", async () => {
    await seedMachineDb();
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(outsider, "studios", "studioA", "machineNotes", "m-leg-press"), { notes: "Mine now" }));
    await assertFails(setDoc(doc(outsider, "studios", "studioA", "upkeepLog", "u1"), { machineId: "m-leg-press", kind: "clean" }));
    await assertFails(
      setDoc(doc(outsider, "studios", "studioA", "playbook", "p1"), {
        title: "Planted",
        worked: "x",
        authorId: "trainerB",
      }),
    );
    await assertFails(
      setDoc(doc(outsider, "studios", "studioA", "wiki", "machine__m-leg-press"), {
        kind: "overlay",
        title: "Leg Press",
        authorId: "trainerB",
        blocks: [],
      }),
    );

    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "machineNotes", "m-leg-press"), { notes: "Pad sticks" }));
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "upkeepLog", "u1"), { machineId: "m-leg-press", kind: "clean" }));
    // Sharing waits for an administrator (Sep 28 2026): a trainer OFFERS a
    // note to every studio, and can't publish it there themselves.
    const note = {
      kind: "overlay",
      title: "Leg Press",
      authorId: "trainerA",
      blocks: [{ kind: "para", text: "Two notches lower here." }],
      sharedKeys: ["m-leg-press"],
      studioName: "Studio A",
    };
    await assertFails(setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shared: true }));
    await assertFails(
      setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shareStatus: "approved" }),
    );
    await assertSucceeds(
      setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shareStatus: "pending" }),
    );
  });

  // ── THE FLOOR'S NOTES ON A MACHINE (notes round, Oct 3 2026, AJ's 2A) ──
  const floorNote = (over: Record<string, unknown> = {}) => ({
    machineId: "m-leg-press",
    body: "The left pad sticks — use the footstool.",
    threadId: null,
    authorId: "trainerA",
    authorName: "Trainer A",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
    isArchived: false,
    ...over,
  });

  it("keeps the floor's notes on a machine to the people who work there, signed by the writer, never naming a client", async () => {
    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n1"), floorNote()));
    await assertSucceeds(getDoc(doc(insider, "studios", "studioA", "floorNotes", "n1")));
    // Another studio neither reads nor writes it.
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "floorNotes", "n1")));
    await assertFails(setDoc(doc(outsider, "studios", "studioA", "floorNotes", "n2"), floorNote({ authorId: "trainerB" })));
    // Signed by the person writing it; never a client on it; never empty; never deleted.
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n3"), floorNote({ authorId: "ownerA" })));
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n4"), { ...floorNote(), clientId: "clientA" }));
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n5"), floorNote({ body: "" })));
    await assertFails(deleteDoc(doc(insider, "studios", "studioA", "floorNotes", "n1")));
    // It may carry the machine's name and say which earlier note it copies, and nothing else.
    await assertSucceeds(
      setDoc(
        doc(insider, "studios", "studioA", "floorNotes", "n6"),
        floorNote({ machineName: "Leg Press", copiedFrom: "unit-note" }),
      ),
    );
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n7"), floorNote({ copiedFrom: "somewhere" })));
    // A new note is never already offered or shared: offering is a change to one.
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n8"), floorNote({ shareStatus: "pending" })));
    await assertFails(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n9"), floorNote({ shared: true })));
  });

  it("lets anyone there close a floor note, and only its author or a leader change its words", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "T2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(author, "studios", "studioA", "floorNotes", "n1"), floorNote()));
    const teammate = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    // A teammate closes it ("Fixed") ...
    await assertSucceeds(
      updateDoc(doc(teammate, "studios", "studioA", "floorNotes", "n1"), {
        resolvedAt: serverTimestamp(),
        resolvedBy: { id: "trainerA2", name: "Trainer A2" },
        updatedAt: serverTimestamp(),
      }),
    );
    // ... but doesn't rewrite someone else's words, or move it to another machine.
    await assertFails(updateDoc(doc(teammate, "studios", "studioA", "floorNotes", "n1"), { body: "Rewritten" }));
    await assertFails(updateDoc(doc(author, "studios", "studioA", "floorNotes", "n1"), { machineId: "m-row" }));
    // The author may; so may a leader.
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "floorNotes", "n1"), { body: "The left pad sticks." }));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "floorNotes", "n1"), { body: "Fixed on Oct 3." }));
    // Anyone opens it again; "closed by" names the person closing, never someone else.
    await assertSucceeds(
      updateDoc(doc(teammate, "studios", "studioA", "floorNotes", "n1"), { resolvedAt: null, resolvedBy: null }),
    );
    await assertFails(
      updateDoc(doc(teammate, "studios", "studioA", "floorNotes", "n1"), {
        resolvedAt: serverTimestamp(),
        resolvedBy: { id: "trainerA", name: "Trainer A" },
      }),
    );
    // Taking it off the list is its author's or a leader's, as changing its words is (the review, Oct 3 2026).
    await assertFails(updateDoc(doc(teammate, "studios", "studioA", "floorNotes", "n1"), { isArchived: true }));
    await assertSucceeds(setDoc(doc(author, "studios", "studioA", "floorNotes", "n2"), floorNote()));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "floorNotes", "n2"), { isArchived: true }));
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "floorNotes", "n1"), { isArchived: true }));
  });

  it("lets a studio offer a floor note to every MSF studio, and only an administrator shares it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminFloor"), { fullName: "Admin", initials: "AD", role: "Admin" });
    });
    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "floorNotes", "n1"), floorNote()));
    await assertFails(updateDoc(doc(insider, "studios", "studioA", "floorNotes", "n1"), { shared: true }));
    await assertSucceeds(
      updateDoc(doc(insider, "studios", "studioA", "floorNotes", "n1"), {
        shareStatus: "pending",
        sharedKeys: ["m-leg-press"],
        studioName: "Studio A",
        shareRequestedAt: serverTimestamp(),
        shareRequestedBy: "trainerA",
      }),
    );
    // Another studio sees nothing of it until it is shared, and can't list unshared notes at all ...
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    const sharedOnly = () =>
      getDocs(query(collectionGroup(outsider, "floorNotes"), where("shared", "==", true), where("sharedKeys", "array-contains", "m-leg-press")));
    expect((await assertSucceeds(sharedOnly())).size).toBe(0);
    await assertFails(getDocs(query(collectionGroup(outsider, "floorNotes"), where("shareStatus", "==", "pending"))));
    const admin = testEnv.authenticatedContext("adminFloor", { email: "adminfloor@test.com" }).firestore();
    await assertSucceeds(getDocs(query(collectionGroup(admin, "floorNotes"), where("shareStatus", "==", "pending"))));
    await assertSucceeds(
      updateDoc(doc(admin, "studios", "studioA", "floorNotes", "n1"), {
        shared: true,
        shareStatus: "approved",
        shareReviewedBy: "adminFloor",
        shareReviewedAt: serverTimestamp(),
      }),
    );
    // ... and then reads the shared one.
    expect((await assertSucceeds(sharedOnly())).size).toBe(1);
  });

  it("lets a studio's leaders offer their own machine to the database, and nothing else", async () => {
    await seedMachineDb();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    // Offered, for an administrator to decide (Sep 28 2026) ...
    await assertSucceeds(
      updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), {
        shareStatus: "pending",
        sharedStudioName: "Studio A",
      }),
    );
    // ... never listed by the studio itself.
    await assertFails(
      updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true, sharedStudioName: "Studio A" }),
    );
    // An MSF machine is already in the database.
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "m-leg-press"), { shareStatus: "pending" }));
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "m-leg-press"), { shared: true }));
    // A copy of another studio's machine is listed by its original.
    await assertFails(
      setDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-rope"), {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        adoptedFrom: { studioId: "studioB", machineId: "sm-studioB-rope", studioName: "Studio B" },
        shareStatus: "pending",
      }),
    );
    // Trainers do not decide what the studio publishes.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "studios", "studioA", "roster", "sm-studioA-sled"), { shareStatus: "pending" }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true }));
  });

  // -- SHARING WAITS FOR AN ADMINISTRATOR (AJ, Sep 28 2026) -----------------
  //
  // "it should submit to admins first for review, we can review in admin
  // dashboard". A studio offers (shareStatus "pending"); only an
  // administrator publishes (shared true) and decides the offer.

  async function seedAdmin() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
  }

  it("lets only an administrator publish an offer, decide it and list what waits", async () => {
    await seedMachineDb();
    await seedAdmin();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, "studios", "studioA", "roster", "sm-studioA-sled"), { shareStatus: "pending" });
      await updateDoc(doc(db, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "pending", sharedKeys: ["m-leg-press"] });
    });
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    // What waits, across every studio.
    await assertSucceeds(getDocs(query(collectionGroup(admin, "roster"), where("shareStatus", "==", "pending"))));
    await assertSucceeds(getDocs(query(collectionGroup(admin, "playbook"), where("shareStatus", "==", "pending"))));
    await assertSucceeds(getDocs(query(collectionGroup(admin, "wiki"), where("shareStatus", "==", "pending"))));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(query(collectionGroup(other, "playbook"), where("shareStatus", "==", "pending"))));
    // Deciding: an administrator publishes a machine and a tip they didn't write, or declines with a note.
    await assertSucceeds(
      updateDoc(doc(admin, "studios", "studioA", "roster", "sm-studioA-sled"), {
        shared: true,
        shareStatus: "approved",
        shareReviewedBy: "adminX",
        shareReviewedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(admin, "studios", "studioA", "playbook", "tipPrivate"), {
        shareStatus: "declined",
        shareReviewNote: "Say which seat notch, and we will share it.",
        shareReviewedBy: "adminX",
        shareReviewedAt: serverTimestamp(),
      }),
    );
    // A studio can't write the decision itself.
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareReviewNote: "Fine by me" }));
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "approved" }));
    // It may offer again after a decline, and take a shared tip back.
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "pending" }));
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "playbook", "tipShared"), { shared: false, sharedKeys: [] }));
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipShared"), { shared: true }));
  });

  it("keeps a studio's roster and machine notes with the people who work there; a shared machine reads everywhere", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineNotes", "m-leg-press"), {
        studioId: "studioA",
        machineId: "m-leg-press",
        notes: "Left pad sticks.",
      });
    });
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(outsider, "studios", "studioA", "roster")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "roster", "sm-studioA-sled")));
    await assertFails(getDocs(collection(outsider, "studios", "studioA", "machineNotes")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "machineNotes", "m-leg-press")));
    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "roster")));
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "machineNotes")));
    // Once an administrator shares a studio's own machine, anyone may read that one document.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true });
    });
    await assertSucceeds(getDoc(doc(outsider, "studios", "studioA", "roster", "sm-studioA-sled")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "roster", "m-leg-press")));
  });

  it("lets a studio's own people read its machine set-up, and only its leaders change it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studioMachineSettings", "studioA_m-leg-press"), {
        studioId: "studioA",
        machineId: "m-leg-press",
        settingOptions: { seat: ["1", "2", "3"] },
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const byStudio = (db: typeof trainer, studioId: string) =>
      getDocs(query(collection(db, "studioMachineSettings"), where("studioId", "==", studioId)));
    await assertSucceeds(byStudio(trainer, "studioA"));
    await assertFails(byStudio(outsider, "studioA"));
    await assertSucceeds(byStudio(outsider, "studioB"));
    await assertFails(getDoc(doc(outsider, "studioMachineSettings", "studioA_m-leg-press")));
    // Writes: the studio's leaders, on their own studio, under the id the document names.
    const edit = { studioId: "studioA", machineId: "m-leg-press", settingOptions: { seat: ["1", "2"] } };
    await assertFails(setDoc(doc(trainer, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertFails(setDoc(doc(outsider, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertSucceeds(setDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertFails(setDoc(doc(owner, "studioMachineSettings", "studioB_m-leg-press"), { ...edit, studioId: "studioB" }));
    await assertFails(setDoc(doc(owner, "studioMachineSettings", "studioA_m-row"), edit));
    await assertFails(updateDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press"), { studioId: "studioB" }));
    await assertFails(deleteDoc(doc(trainer, "studioMachineSettings", "studioA_m-leg-press")));
    await assertSucceeds(deleteDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press")));
  });

  it("lists what studios shared to every trainer, and nothing they did not", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true });
    });
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertSucceeds(getDocs(query(collectionGroup(other, "roster"), where("shared", "==", true))));
    await assertFails(getDocs(collectionGroup(other, "roster")));
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(other, "playbook"),
          where("shared", "==", true),
          where("sharedKeys", "array-contains", "m-leg-press"),
        ),
      ),
    );
    await assertFails(getDocs(query(collectionGroup(other, "playbook"), where("sharedKeys", "array-contains", "m-leg-press"))));
    await assertSucceeds(getDocs(query(collectionGroup(other, "wiki"), where("shared", "==", true))));
  });

  it("keeps unshared tips and notes with their studio, while shared ones stay readable", async () => {
    await seedMachineDb();
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(other, "studios", "studioA", "playbook")));
    await assertFails(getDoc(doc(other, "studios", "studioA", "playbook", "tipPrivate")));
    await assertSucceeds(getDoc(doc(other, "studios", "studioA", "playbook", "tipShared")));
    await assertFails(getDocs(collection(other, "studios", "studioA", "wiki")));

    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "playbook")));
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "wiki")));
  });

  it("keeps an adopted copy a copy, and a roster entry at its own studio", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-rope"), {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        adoptedFrom: { studioId: "studioB", machineId: "sm-studioB-rope", studioName: "Studio B" },
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const copy = doc(owner, "studios", "studioA", "roster", "sm-studioA-rope");
    // Dropping the lineage and listing it in one write is still listing a copy.
    await assertFails(
      setDoc(copy, {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        shared: true,
      }),
    );
    // Switching it off and on is fine.
    await assertSucceeds(updateDoc(copy, { status: "inactive" }));
    await assertSucceeds(updateDoc(copy, { status: "active" }));
    // A roster entry names the studio its path names.
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), { studioId: "studioB" }));
  });

  it("checks the shape of the share fields, and lets a tip's author offer it", async () => {
    await seedMachineDb();
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(author, "studios", "studioA", "playbook", "tipPrivate");
    await assertFails(updateDoc(ref, { shared: "yes" }));
    await assertFails(updateDoc(ref, { shareStatus: "pending", sharedKeys: "m-leg-press" }));
    await assertFails(updateDoc(ref, { shareStatus: "maybe", sharedKeys: ["m-leg-press"] }));
    // Offered for an administrator's review (Sep 28 2026); publishing it is theirs.
    await assertFails(updateDoc(ref, { shared: true, sharedKeys: ["m-leg-press"], studioName: "Studio A" }));
    await assertSucceeds(updateDoc(ref, { shareStatus: "pending", sharedKeys: ["m-leg-press"], studioName: "Studio A" }));
    // A colleague who did not write it cannot publish it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(updateDoc(doc(colleague, "studios", "studioA", "playbook", "tipShared"), { shared: false, sharedKeys: [] }));
  });

  // ── COMMENTS ON LEARNING PAGES: the studio's own, read and written there ─

  const commentData = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    targetKey: "machine:m-leg-press",
    target: { kind: "machine", id: "m-leg-press", title: "Leg Press" },
    body: "Seat pin sticks again — @Trainer A2 can you look?",
    authorId: uid,
    authorName: "Trainer A",
    mentions: [{ id: "trainerA2", name: "Trainer A2" }],
    createdAt: serverTimestamp(),
    ...over,
  });

  async function seedComments() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "studios", "studioA", "comments", "c1"), { ...commentData("trainerA"), createdAt: new Date() });
    });
  }

  it("lets the people at a studio read and post its comments, and nobody else", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "studios", "studioA", "comments", "c2"), commentData("trainerA")));
    await assertSucceeds(
      getDocs(query(collection(a, "studios", "studioA", "comments"), where("targetKey", "==", "machine:m-leg-press"))),
    );

    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(b, "studios", "studioA", "comments", "c1")));
    await assertFails(getDocs(collection(b, "studios", "studioA", "comments")));
    await assertFails(setDoc(doc(b, "studios", "studioA", "comments", "c3"), commentData("trainerB", { authorName: "B" })));
  });

  it("refuses a comment in someone else's name, with a back-dated time, or carrying a client", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(a, "studios", "studioA", "comments", "c4");
    await assertFails(setDoc(ref, commentData("trainerA2")));
    await assertFails(setDoc(ref, commentData("trainerA", { createdAt: new Date("2026-01-01") })));
    await assertFails(setDoc(ref, commentData("trainerA", { clientId: "notesClient" })));
    await assertFails(setDoc(ref, commentData("trainerA", { body: "" })));
  });

  it("lets only the author correct a comment, and only its words and tags", async () => {
    await seedComments();
    const path = ["studios", "studioA", "comments", "c1"] as const;
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(author, ...path), { body: "Fixed now.", mentions: [], editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(author, ...path), { targetKey: "machine:m-other", editedAt: serverTimestamp() }));
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(updateDoc(doc(colleague, ...path), { body: "Not yours", editedAt: serverTimestamp() }));
  });

  it("lets the author or a studio leader take a comment down", async () => {
    await seedComments();
    const path = ["studios", "studioA", "comments", "c1"] as const;
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(deleteDoc(doc(colleague, ...path)));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── ANNOUNCEMENTS: posted by the people the app offers the composer to ──

  const announcement = (over: Record<string, unknown> = {}) => ({
    title: "New in Learning",
    shortContent: "Read the Leg Press card before Monday.",
    longContent: "",
    authorId: "adminX",
    authorName: "Admin X",
    studioId: "all",
    targetScope: "universal",
    targetId: "",
    isActive: true,
    priority: "low",
    readBy: [],
    learningLink: { kind: "academy-card", id: "card-leg-press", title: "Leg Press" },
    ...over,
  });

  async function seedAnnouncements() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "hub_announcements", "a1"), announcement());
    });
  }

  it("lets administrators post an announcement that links a Learning page, and nobody else", async () => {
    await seedAnnouncements();
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(admin, "hub_announcements", "a2"), announcement()));
    await assertFails(
      setDoc(doc(admin, "hub_announcements", "a3"), announcement({ learningLink: { kind: "client", id: "123" } })),
    );

    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "hub_announcements", "a4"), announcement({ authorId: "trainerA" })));
    await assertFails(updateDoc(doc(trainer, "hub_announcements", "a1"), { title: "Rewritten" }));
  });

  it("lets a studio owner post from the Franchise hub and take the notice down", async () => {
    await seedAnnouncements();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const mine = announcement({
      authorId: "ownerA",
      authorName: "Owner A",
      studioId: "studioA",
      targetScope: "studio",
      targetId: "studioA",
    });
    await assertSucceeds(setDoc(doc(owner, "hub_announcements", "o1"), mine));
    await assertSucceeds(updateDoc(doc(owner, "hub_announcements", "o1"), { isActive: false }));
  });

  it("posts announcements as their author, and keeps every-studio notices to administrators", async () => {
    await seedAnnouncements();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // The franchise partition (Oct 2026): a franchise owner OF studioA.
      await setDoc(doc(context.firestore(), "trainers", "franchiseX"), {
        fullName: "Franchise X",
        initials: "FX",
        role: "FranchiseOwner",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA", "studioB"],
        ownedStudioIds: ["studioA"],
      });
    });
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    // Nobody posts under someone else's name.
    await assertFails(
      setDoc(doc(admin, "hub_announcements", "imp"), announcement({ authorId: "ownerA", authorName: "Owner A" })),
    );

    const franchise = testEnv.authenticatedContext("franchiseX", { email: "franchisex@test.com" }).firestore();
    // A franchise owner no longer posts to everyone (the franchise partition)...
    await assertFails(
      setDoc(doc(franchise, "hub_announcements", "f1"), announcement({ authorId: "franchiseX", authorName: "Franchise X" })),
    );
    // ...but posts to a studio they run.
    await assertSucceeds(
      setDoc(
        doc(franchise, "hub_announcements", "f2"),
        announcement({
          authorId: "franchiseX",
          authorName: "Franchise X",
          targetScope: "studio",
          targetId: "studioA",
          studioId: "studioA",
          targetStudioIds: ["studioA"],
        }),
      ),
    );

    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    // The Franchise hub never offers "everyone".
    await assertFails(
      setDoc(doc(owner, "hub_announcements", "o-all"), announcement({ authorId: "ownerA", authorName: "Owner A" })),
    );
    // And a studio owner changes only their own notices.
    await assertFails(updateDoc(doc(owner, "hub_announcements", "a1"), { isActive: false }));
    // An administrator's every-studio notice is taken down by administrators only.
    await assertFails(updateDoc(doc(franchise, "hub_announcements", "a1"), { isActive: false }));
    await assertSucceeds(updateDoc(doc(admin, "hub_announcements", "a1"), { isActive: false }));
  });

  it("marks a notice read even when it was written without a readBy list", async () => {
    await seedAnnouncements();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const bare: Record<string, unknown> = announcement();
      delete bare.readBy;
      await setDoc(doc(context.firestore(), "hub_announcements", "bare"), bare);
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "hub_announcements", "bare"), { readBy: ["trainerA"] }));
  });

  it("lets anyone mark an announcement read for themselves, and only themselves", async () => {
    await seedAnnouncements();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "hub_announcements", "a1"), { readBy: ["trainerA"] }));
    await assertFails(updateDoc(doc(trainer, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerB"] }));
    // Nobody adds someone else, or takes anyone off.
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerC"] }));
    await assertFails(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: [] }));
    await assertSucceeds(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerB"] }));
  });

  it("lets a tag ring the tagged person's bell", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(a, "trainers", "trainerA2", "notifications", "n1"), {
        kind: "comment-mention",
        title: "Trainer A tagged you on Leg Press",
        studioId: "studioA",
        link: { view: "machine-anatomy", learning: { kind: "machine", id: "m-leg-press", title: "Leg Press" } },
        actor: { id: "trainerA", name: "Trainer A" },
        createdAt: serverTimestamp(),
        readAt: null,
      }),
    );
  });

  // Cost round (Sep 2026): machineTrends is written by the weekly job's service
  // account and holds aggregates only, so it reads like exerciseLogs.
  it("lets any signed-in trainer read machineTrends and nobody but an admin write it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "machineTrends", "compound-row"), { machineId: "compound-row", clients: 12, sets: 40 });
    });
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(a, "machineTrends", "compound-row")));
    await assertSucceeds(getDoc(doc(a, "machineTrends", "_summary")));
    await assertFails(setDoc(doc(a, "machineTrends", "compound-row"), { machineId: "compound-row", clients: 1 }));
    const nobody = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(nobody, "machineTrends", "compound-row")));
  });

  // Cost round (Sep 2026): the self-edit hole. A trainer may still edit their
  // own document, but not the fields that decide what they may do and where.
  it("lets a trainer edit their own profile but not their own role or studios", async () => {
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(a, "trainers", "trainerA"), { bio: "Loves the leg press" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { role: "StudioLeader" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { role: "FranchiseOwner" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { accessibleStudioIds: ["studioA", "studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { ownedStudioIds: ["studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { activeGuestStudioIds: ["studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { primaryHomeStudioId: "studioB" }));
    // Their studio's leader can't hand them another studio either: a second
    // studio is an administrator's (Admins → a studio's Team → Studios; the
    // franchise partition, Oct 2026).
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { accessibleStudioIds: ["studioA", "studioB"] }));
    // Their role, within the leader's reach, still can.
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { role: "HeadTrainer" }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { accessibleStudioIds: ["studioA"], role: "LifeTransformer" });
    });
  });

  // Second studio (Oct 1 2026): Admins → Studios → a studio → Team → Studios
  // writes only the lists that change, with arrayUnion / arrayRemove. No rule
  // changed for it: these pin what the control relies on.
  it("lets an administrator give a trainer a second studio and take them off it, and nobody else at that studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "adminZ"), {
        fullName: "Admin Z",
        initials: "AZ",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(ctx.firestore(), "trainers", "leaderB"), {
        fullName: "Leader B",
        initials: "LB",
        role: "StudioLeader",
        primaryHomeStudioId: "studioB",
        accessibleStudioIds: ["studioB"],
      });
    });
    const admin = testEnv.authenticatedContext("adminZ", { email: "adminz@test.com" }).firestore();
    const self = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const leaderB = testEnv.authenticatedContext("leaderB", { email: "leaderb@test.com" }).firestore();
    const trainerA = doc(admin, "trainers", "trainerA");

    // Nobody adds themselves, and another studio's leader can't add them either.
    await assertFails(updateDoc(doc(self, "trainers", "trainerA"), { accessibleStudioIds: arrayUnion("studioB") }));
    await assertFails(updateDoc(doc(leaderB, "trainers", "trainerA"), { accessibleStudioIds: arrayUnion("studioB") }));
    // The administrator can.
    await assertSucceeds(updateDoc(trainerA, { accessibleStudioIds: arrayUnion("studioB") }));
    // Studio B's leader, whose studio it is, still can't take a person whose home is A off it:
    // that stays with administrators.
    await assertFails(updateDoc(doc(leaderB, "trainers", "trainerA"), { accessibleStudioIds: arrayRemove("studioB") }));
    // The administrator takes them off, the grant with it; the home studio and the record stay.
    await assertSucceeds(updateDoc(trainerA, { accessibleStudioIds: arrayRemove("studioB"), managedStudioIds: arrayRemove("studioB") }));
    let after: Record<string, unknown> | undefined;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      after = (await getDoc(doc(ctx.firestore(), "trainers", "trainerA"))).data();
    });
    expect(after?.accessibleStudioIds).toEqual(["studioA"]);
    expect(after?.primaryHomeStudioId).toBe("studioA");
  });

  // Cost round (Sep 2026): a role claim on the token is read before the
  // document, so an Admin claim with no trainer document is still an admin,
  // and a LifeTransformer claim never reaches admin-only writes.
  it("reads the role from the token claim before the trainer document", async () => {
    const claimedAdmin = testEnv.authenticatedContext("claim-admin", { email: "ca@test.com", role: "Admin" }).firestore();
    await assertSucceeds(setDoc(doc(claimedAdmin, "machineTrends", "claim-test"), { machineId: "claim-test" }));
    const claimedTrainer = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com", role: "LifeTransformer" }).firestore();
    await assertFails(setDoc(doc(claimedTrainer, "machineTrends", "claim-test-2"), { machineId: "claim-test-2" }));
  });

  // ── HISTORY EDITING (Sep 17 2026) ───────────────────────────────────────
  // Taking a machine off a session that already happened deletes its set, and
  // correcting a past session logged onto the wrong client deletes the session.
  // Both were super-admin-and-owner only, so the History tab's own buttons
  // failed for every trainer who would ever press them.
  it("lets a trainer delete an exercise log — removing a machine from a past session", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "exerciseLogs", "logToDrop"), {
        sessionId: "sessionA",
        machineId: "chest-press",
        clientId: "clientA",
      });
    });
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(a, "exerciseLogs", "logToDrop")));
  });

  it("refuses an exercise log delete to a signed-in user who is not a trainer", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "exerciseLogs", "logToKeep"), {
        sessionId: "sessionA",
        machineId: "chest-press",
        clientId: "clientA",
      });
    });
    const stranger = testEnv.authenticatedContext("no-trainer-doc", { email: "nobody@test.com" }).firestore();
    await assertFails(deleteDoc(doc(stranger, "exerciseLogs", "logToKeep")));
  });

  it("lets a trainer of the session's studio delete the session, and refuses one from another studio", async () => {
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(deleteDoc(doc(b, "sessions", "sessionA")));
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(a, "sessions", "sessionA")));
  });

  // ── MY STUDIO (Sep 19 2026) ─────────────────────────────────────────────
  // A studio is written by its own leaders (a role there, or the grant),
  // franchise owners and administrators — never by any trainer anywhere, which
  // is the hole CLAUDE.md carried since Sep 12. The one thing every iPad still
  // writes is the schedule sync's lease.
  it("lets a studio's own leader edit the studio, and refuses a trainer and another studio's leader", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A — West", journeyCutoverDate: "2026-09-01" }));
    await assertFails(updateDoc(doc(owner, "studios", "studioB"), { name: "Not mine" }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { name: "Renamed by a trainer" }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { mindbodySiteId: "999" }));
  });

  it("keeps how often a studio asks Mindbody to administrators (AJ, Sep 28 2026)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { autoSyncEnabled: false }));
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { syncIntervalMinutes: 15 }));
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A", syncIntervalMinutes: 15 }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A (West)" }));
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(admin, "studios", "studioA"), { autoSyncEnabled: false, syncIntervalMinutes: 60 }));
  });

  it("still lets any trainer's iPad write the schedule sync lease, and nothing beside it", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "studios", "studioA"), { lastScheduleSyncAt: 1, scheduleSyncFailures: 0 }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { lastScheduleSyncAt: 2, name: "Sneaked in" }));
    // The lean sync (Sep 25 2026): when the last whole-month pull succeeded.
    await assertSucceeds(updateDoc(doc(trainer, "studios", "studioA"), { lastDeepScheduleSyncAt: 3 }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { lastDeepScheduleSyncAt: 4, autoSyncEnabled: false }));
  });

  // The cost plan (Sep 26 2026, D3b): the lease moved to its own document so
  // a stamp is no longer sent to every iPad in the company.
  it("lets any trainer's iPad claim the sync lease document, with the three numbers and nothing else", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const lease = doc(trainer, "studios", "studioA", "sync", "lease");
    await assertSucceeds(setDoc(lease, { lastScheduleSyncAt: 1 }, { merge: true }));
    await assertSucceeds(setDoc(lease, { scheduleSyncFailures: 0, lastScheduleSyncAt: 2 }, { merge: true }));
    await assertSucceeds(setDoc(lease, { lastDeepScheduleSyncAt: 3 }, { merge: true }));
    await assertSucceeds(getDoc(lease));
    await assertFails(setDoc(lease, { lastScheduleSyncAt: 4, name: "Sneaked in" }, { merge: true }));
    await assertFails(setDoc(lease, { lastScheduleSyncAt: "yesterday" }, { merge: true }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "sync", "other"), { lastScheduleSyncAt: 1 }));
    await assertFails(deleteDoc(lease));
  });

  // The Mindbody savings round (Oct 12 2026): what the near pull found that
  // the webhook had not, one small document a day.
  it("lets a trainer's iPad count the day's near pulls, three numbers and nothing else", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const day = doc(trainer, "studios", "studioA", "sync", "near-2026-10-12");
    await assertSucceeds(setDoc(day, { checks: increment(1), finds: increment(0), rows: increment(0) }, { merge: true }));
    await assertSucceeds(setDoc(day, { checks: increment(1), finds: increment(1), rows: increment(3) }, { merge: true }));
    await assertSucceeds(getDoc(day));
    await assertFails(setDoc(day, { checks: 1, clientName: "Alice" }, { merge: true }));
    await assertFails(setDoc(day, { checks: "many" }, { merge: true }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "sync", "near-today"), { checks: 1 }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "sync", "near-2026-10-12"), { lastScheduleSyncAt: 1 }, { merge: true }));
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(b, "studios", "studioA", "sync", "near-2026-10-12"), { checks: increment(1) }, { merge: true }));
    await assertFails(deleteDoc(day));
  });

  it("refuses the sync lease to someone signed in who is not a trainer", async () => {
    const stranger = testEnv.authenticatedContext("stranger", { email: "stranger@test.com" }).firestore();
    await assertFails(setDoc(doc(stranger, "studios", "studioA", "sync", "lease"), { lastScheduleSyncAt: 1 }));
    // The franchise partition (second review): a trainer at another studio
    // can't park this studio's sync either, on the lease or the old fields.
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(b, "studios", "studioA", "sync", "lease"), { lastScheduleSyncAt: 9e15 }));
    await assertFails(updateDoc(doc(b, "studios", "studioA"), { lastScheduleSyncAt: 9e15 }));
  });

  it("lets anyone signed in read a trainer's counters, and nobody write them from the app (the cost plan, D3c)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 12 });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "trainers", "trainerA", "stats", "rollups")));
    await assertFails(setDoc(doc(trainer, "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 999 }));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(setDoc(doc(owner, "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 999 }));
  });

  it("keeps a person's announcement read-marks to themselves (the cost plan, D5)", async () => {
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "announcementReads", "trainerA"), { ids: { n1: true } }, { merge: true }));
    await assertSucceeds(getDoc(doc(a, "announcementReads", "trainerA")));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerB"), { ids: { n1: true } }));
    await assertFails(getDoc(doc(a, "announcementReads", "trainerB")));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerA"), { ids: { n1: true }, role: "Admin" }, { merge: true }));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerA"), { ids: "everything" }));
  });

  it("lets anyone signed in read the webhook watch, and nobody write it (the cost plan, A7)", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "system", "mindbodyWebhook")));
    await assertFails(setDoc(doc(trainer, "system", "mindbodyWebhook"), { active: true }));
  });

  it("refuses a studio create to anyone below a franchise owner", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(setDoc(doc(owner, "studios", "studioC"), { name: "Studio C", ownerId: "ownerA", timezone: "America/New_York" }));
  });

  it("counts the grant: a trainer given managedStudioIds leads that studio in the rules", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { managedStudioIds: ["studioA"] });
    });
    const granted = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(granted, "studios", "studioA"), { name: "Studio A, run by a trainer" }));
    await assertFails(updateDoc(doc(granted, "studios", "studioB"), { name: "Not granted here" }));
    // The grant reaches the other leader-only writes too: a team job.
    await assertSucceeds(
      setDoc(doc(granted, "studios", "studioA", "teamJobs", "g1"), {
        studioId: "studioA",
        title: "Deep clean",
        createdBy: { id: "trainerA", name: "Trainer A" },
        createdAt: serverTimestamp(),
        status: "open",
        parts: { p1: { label: "Leg press", order: 1 } },
        // jobFields() always writes both (features/relay/jobs); teamJobValid
        // requires them, and `people` was never a field on a team job.
        assignees: [],
        assigneeIds: [],
      }),
    );
  });

  it("never lets a trainer grant themselves, and lets their studio's leader grant them", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "trainers", "trainerA"), { managedStudioIds: ["studioA"] }));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayUnion("studioA") }));
    // The grant is for the leader's OWN studio: a studio they do not run may
    // neither enter nor leave the list.
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayUnion("studioB") }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: ["studioA", "studioB"] }));
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayRemove("studioA") }));
  });

  it("caps what an approval hands out: a studio's leader mints a trainer or a leader, never an owner or an administrator", async () => {
    // The franchise partition (second review): a non-administrator's create
    // approves a real, pending sign-up at that uid naming their studio, so
    // each hire has one -- every refusal below is for the reason it names.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      for (const id of ["hire1", "hire2", "hire3", "hire4", "hire5"]) {
        await setDoc(doc(ctx.firestore(), "access_requests", id), {
          status: "Pending",
          userId: id,
          requestedStudioId: "studioA",
          email: "new@test.com",
          fullName: "New Hire",
        });
      }
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const fresh = (role: string, extra: Record<string, unknown> = {}) => ({
      fullName: "New Hire",
      initials: "NH",
      role,
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
      activeGuestStudioIds: [],
      email: "new@test.com",
      ...extra,
    });
    await assertSucceeds(setDoc(doc(owner, "trainers", "hire1"), fresh("LifeTransformer")));
    await assertSucceeds(setDoc(doc(owner, "trainers", "hire2"), fresh("StudioLeader", { managedStudioIds: ["studioA"] })));
    await assertFails(setDoc(doc(owner, "trainers", "hire3"), fresh("Owner")));
    await assertFails(setDoc(doc(owner, "trainers", "hire4"), fresh("Admin")));
    // A grant for a studio the new person is not joining.
    await assertFails(setDoc(doc(owner, "trainers", "hire5"), fresh("LifeTransformer", { managedStudioIds: ["studioB"] })));
  });

  it("caps a role change the same way", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { role: "HeadTrainer" }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { role: "FranchiseOwner" }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { role: "Admin" }));
  });

  it("lets a studio's leader mark an access request approved", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "access_requests", "req1"), {
        fullName: "New Hire",
        email: "new@test.com",
        status: "Pending",
        userId: "hire1",
        requestedStudioId: "studioA",
      });
      await setDoc(doc(ctx.firestore(), "access_requests", "req2"), {
        fullName: "Other Hire",
        email: "other@test.com",
        status: "Pending",
        userId: "hire2",
        requestedStudioId: "studioB",
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    // An approval changes the status and its stamps, and nothing else (the
    // franchise partition, second review).
    await assertFails(updateDoc(doc(owner, "access_requests", "req1"), { userId: "adminX" }));
    await assertSucceeds(updateDoc(doc(owner, "access_requests", "req1"), { status: "Approved", approvedTrainerId: "hire1" }));
    // A request naming another studio is that studio's.
    await assertFails(updateDoc(doc(owner, "access_requests", "req2"), { status: "Approved", approvedTrainerId: "hire2" }));
    const trainer = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "access_requests", "req1"), { status: "Approved" }));
  });

  it("lets a studio's leader post a notice to their own studio, and nothing wider", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const notice = (extra: Record<string, unknown>) => ({
      title: "Deep clean Friday",
      shortContent: "Floor closes at 3.",
      longContent: "",
      authorId: "ownerA",
      authorName: "Owner A",
      isActive: true,
      priority: "normal",
      ...extra,
    });
    await assertSucceeds(
      addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "studio", targetId: "studioA", studioId: "studioA", targetStudioIds: ["studioA"] })),
    );
    await assertFails(
      addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "studio", targetId: "studioB", studioId: "studioB", targetStudioIds: ["studioB"] })),
    );
    await assertFails(addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "universal", targetId: "", studioId: "all", targetStudioIds: [] })));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(
      addDoc(collection(trainer, "hub_announcements"), notice({ authorId: "trainerA", targetScope: "studio", targetId: "studioA", studioId: "studioA", targetStudioIds: ["studioA"] })),
    );
  });

  // ── OPERATIONS (Sep 19 2026) ────────────────────────────────────────────
  it("lets the studio's people read the weekly performance watch, refuses another studio's trainer, and lets nobody write it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "watch", "performance"), {
        version: 1,
        studioId: "studioA",
        builtAt: "2026-09-20T07:00:00.000Z",
        rows: [{ clientId: "clientA", machineId: "m-leg-press", weight: 100, reps: 4, medianReps: 10, priorSets: 5, day: "2026-09-19", drop: 0.6 }],
        clients: 1,
      });
      // Openings' usual week (Sep 27 2026), written by the same Sunday job, the Demo studio's too.
      const openings = { v: 1, builtAt: "2026-09-27T07:00:00.000Z", tz: "America/New_York", row: 30, since: null, weeks: [], who: {}, agreed: {}, cells: {} };
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "watch", "openings"), openings);
      await setDoc(doc(ctx.firestore(), "studios", "demo-studio", "watch", "openings"), openings);
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "studios", "studioA", "watch", "performance")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "watch", "performance")));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(other, "studios", "studioA", "watch", "performance")));
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "watch", "performance"), { rows: [] }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "watch", "anything"), { rows: [] }));
    // watch/openings: the studio's people read it, another studio's trainer doesn't, the Demo studio's is everyone's, and nobody writes it.
    await assertSucceeds(getDoc(doc(trainer, "studios", "studioA", "watch", "openings")));
    await assertFails(getDoc(doc(other, "studios", "studioA", "watch", "openings")));
    await assertSucceeds(getDoc(doc(other, "studios", "demo-studio", "watch", "openings")));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "watch", "openings"), { cells: {} }));
  });

  it("lets a studio's leader offer one of its machines to the catalog, as themselves, pending — and only withdraw it afterwards", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const offer = (extra: Record<string, unknown> = {}) => ({
      studioId: "studioA",
      studioName: "Studio A",
      machineId: "sm-studioA-sled",
      definition: { name: "Sled" },
      basedOn: "m-leg-press",
      submittedBy: "ownerA",
      submittedByName: "Owner A",
      note: "Everyone loves it.",
      status: "pending",
      submittedAt: serverTimestamp(),
      ...extra,
    });
    await assertSucceeds(setDoc(doc(owner, "catalogSubmissions", "sub1"), offer()));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub2"), offer({ status: "published" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub3"), offer({ submittedBy: "someone-else" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub4"), offer({ studioId: "studioB" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub5"), offer({ extra: "field" })));
    // Corporate decides: the studio may withdraw, never publish.
    await assertFails(updateDoc(doc(owner, "catalogSubmissions", "sub1"), { status: "published" }));
    await assertSucceeds(updateDoc(doc(owner, "catalogSubmissions", "sub1"), { status: "withdrawn" }));
    // A trainer at the studio may not offer.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "catalogSubmissions", "sub6"), offer({ submittedBy: "trainerA" })));
    // The studio reads its own; another studio's leader does not.
    await assertSucceeds(getDoc(doc(owner, "catalogSubmissions", "sub1")));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "ownerB"), {
        fullName: "Owner B",
        initials: "OB",
        role: "StudioOwner",
        primaryHomeStudioId: "studioB",
        accessibleStudioIds: ["studioB"],
      });
    });
    const ownerB = testEnv.authenticatedContext("ownerB", { email: "ownerb@test.com" }).firestore();
    await assertFails(getDoc(doc(ownerB, "catalogSubmissions", "sub1")));
  });

  // ── OPERATIONS OVERHAUL (Sep 19 2026) ───────────────────────────────────
  it("the watchlist: the studio's leader snoozes, dismisses and clears a client; a trainer only reads; another studio's trainer reads nothing", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const ref = (db: typeof owner) => doc(db, "studios", "studioA", "watchlist", "clientA");
    await assertSucceeds(
      setDoc(ref(owner), {
        clientId: "clientA",
        snoozedUntil: "2026-10-01",
        dismissedAt: null,
        dismissedBy: null,
        dismissedByName: null,
        lastVisitAtDismissal: null,
        nextBookingAtDismissal: null,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(ref(owner), { snoozedUntil: null, dismissedAt: "2026-09-19", dismissedBy: "ownerA", dismissedByName: "Owner A" }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(ref(trainer)));
    await assertFails(updateDoc(ref(trainer), { snoozedUntil: "2026-12-01" }));
    await assertFails(deleteDoc(ref(trainer)));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(ref(other)));
    await assertSucceeds(deleteDoc(ref(owner)));
  });

  it("acknowledgements: anyone who works at the studio may acknowledge, only as themselves, and nobody deletes one", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ack = (by: string) => ({
      sourceKind: "incident",
      clientId: "clientA",
      acknowledgedAt: serverTimestamp(),
      acknowledgedBy: by,
      acknowledgedByName: "Trainer A",
    });
    await assertSucceeds(setDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc1"), ack("trainerA")));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc2"), ack("ownerA")));
    await assertFails(deleteDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "acknowledgements", "incident:inc1")));
    await assertFails(deleteDoc(doc(owner, "studios", "studioA", "acknowledgements", "incident:inc1")));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(other, "studios", "studioA", "acknowledgements", "incident:inc1")));
    await assertFails(setDoc(doc(other, "studios", "studioA", "acknowledgements", "incident:inc3"), ack("trainerB")));
  });

  // ---------------------------------------------------------------------
  // Claude Experiment, Sep 20 2026 — the two rules lines that read as typos.
  //
  // Both were `if isAuthenticated()`, which in this codebase means "any
  // signed-in Google account", NOT "a trainer": a person sitting in
  // AccessRequestView with no trainers/{uid} document passes it. These two
  // tests pin the distinction, because it is the one the old rules lost.
  // ---------------------------------------------------------------------

  it("clientMachineSettings: a trainer may delete, a signed-in non-trainer may not", async () => {
    const settingId = "clientA_m-leg-press";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Since Oct 12 2026 a client's settings are written by whoever can reach the client.
      await setDoc(doc(context.firestore(), "clients", "clientA"), { firstName: "Ann", lastName: "A", homeStudioId: "studioA" });
      await setDoc(doc(context.firestore(), "clientMachineSettings", settingId), {
        clientId: "clientA",
        machineId: "m-leg-press",
        settings: { Seat: "4" },
      });
    });

    // Someone with a Google account but no trainer profile: read is open by
    // design (a known deferral), but deleting another studio's client's
    // set-up must not be.
    const stranger = testEnv
      .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
      .firestore();
    await assertFails(deleteDoc(doc(stranger, "clientMachineSettings", settingId)));

    // A trainer at another studio may not (the sessions round's attack, Oct 12 2026).
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(deleteDoc(doc(elsewhere, "clientMachineSettings", settingId)));

    // A real trainer still may — this is floor work, and the floor is never
    // blocked.
    const trainer = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(deleteDoc(doc(trainer, "clientMachineSettings", settingId)));
  });

  it("settingHistory: a trainer appends, nobody rewrites or erases, a non-trainer cannot write at all", async () => {
    const history = (db: any) =>
      collection(db, "machines", "m-leg-press", "settingHistory");

    const trainer = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(
      addDoc(history(trainer), {
        clientId: "clientA",
        changes: [{ label: "Seat", from: "3", to: "4" }],
        reason: "taller shoe",
        authorId: "trainerA",
        at: serverTimestamp(),
      }),
    );

    // Seed a row directly so the update/delete assertions are about the rule,
    // not about the row's existence.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "machines", "m-leg-press", "settingHistory", "row1"),
        { clientId: "clientA", authorId: "trainerA", reason: "original" },
      );
    });

    const row = (db: any) =>
      doc(db, "machines", "m-leg-press", "settingHistory", "row1");

    // The trail is append-only: not even its own author may revise it.
    await assertSucceeds(getDoc(row(trainer)));
    await assertFails(updateDoc(row(trainer), { reason: "rewritten" }));
    await assertFails(deleteDoc(row(trainer)));

    const stranger = testEnv
      .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
      .firestore();
    await assertFails(addDoc(history(stranger), { clientId: "clientA" }));
    await assertFails(updateDoc(row(stranger), { reason: "rewritten" }));
    await assertFails(deleteDoc(row(stranger)));
  });

  /* ================================================================== *
   * DEMO MODE (Sep 20 2026)
   *
   * `demo-studio` is a real studio full of people who do not exist, and
   * every signed-in trainer has the run of it. These assertions are the
   * other half of src/features/demo-mode/access.ts: the app must never
   * offer a button the database refuses, and — the direction that matters
   * more — widening the demo studio must not have widened anything else.
   * Every "denies" below is a test that the blast radius is one studio.
   * ================================================================== */
  describe("Note dismissals", () => {
    // "No need to remind me" is one trainer saying what they already know.
    // It is private by construction: a document per uid, and the rule is the
    // only thing standing between that and a colleague reading it.
    it("lets a trainer keep their own dismissals and nobody else's", async () => {
      const mine = testEnv
        .authenticatedContext("trainerA", { email: "trainera@test.com" })
        .firestore();
      const theirs = testEnv
        .authenticatedContext("trainerB", { email: "trainerb@test.com" })
        .firestore();

      await assertSucceeds(
        setDoc(doc(mine, "noteDismissals", "trainerA"), { threads: { thread1: serverTimestamp() } }),
      );
      await assertSucceeds(getDoc(doc(mine, "noteDismissals", "trainerA")));

      // Nobody reads anybody else's, whatever their role.
      await assertFails(getDoc(doc(theirs, "noteDismissals", "trainerA")));
      await assertFails(
        setDoc(doc(theirs, "noteDismissals", "trainerA"), { threads: {} }),
      );
    });

    it("denies a signed-out reader entirely", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, "noteDismissals", "trainerA")));
    });
  });

  describe("Demo Mode", () => {
    const DEMO = "demo-studio";

    /** trainerB is a plain LifeTransformer whose home is studioB. */
    const plainTrainer = () =>
      testEnv
        .authenticatedContext("trainerB", { email: "trainerb@test.com" })
        .firestore();

    it("lets any signed-in trainer create the demo studio, and no other", async () => {
      const db = plainTrainer();
      await assertSucceeds(
        setDoc(doc(db, "studios", DEMO), { name: "Demo Mode", isDemo: true }),
      );
      // The id is a literal in the rule, so this grants exactly one studio.
      await assertFails(
        setDoc(doc(db, "studios", "studioC"), { name: "Somewhere Real" }),
      );
      await assertFails(
        setDoc(doc(db, "studios", "demo-studio-2"), { name: "Nearly", isDemo: true }),
      );
    });

    it("lets a plain trainer run the demo studio, and still not their neighbour's", async () => {
      const db = plainTrainer();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), "studios", DEMO), { name: "Demo Mode", isDemo: true });
      });
      await assertSucceeds(updateDoc(doc(db, "studios", DEMO), { sessionMinutes: 30 }));
      // studioA is somebody else's studio and stays somebody else's.
      await assertFails(updateDoc(doc(db, "studios", "studioA"), { sessionMinutes: 30 }));
    });

    it("lets the seeder lay down its three trainers", async () => {
      const db = plainTrainer();
      const payload = {
        fullName: "Hob Hayward",
        initials: "HH",
        role: "StudioLeader",
        primaryHomeStudioId: DEMO,
        accessibleStudioIds: [DEMO],
        activeGuestStudioIds: [],
        pendingClaim: true,
        isDemo: true,
      };
      await assertSucceeds(setDoc(doc(db, "trainers", "demo-trainer-hob"), payload));
      // Re-seeding rewrites the same document whole.
      await assertSucceeds(setDoc(doc(db, "trainers", "demo-trainer-hob"), payload));
    });

    it("refuses a demo trainer that reaches outside the demo studio", async () => {
      const db = plainTrainer();
      const base = {
        fullName: "Not Really",
        initials: "NR",
        role: "LifeTransformer",
        primaryHomeStudioId: DEMO,
        accessibleStudioIds: [DEMO],
        isDemo: true,
      };
      // An elevated role.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, role: "Admin" }),
      );
      // Access to a real studio, by any of the three doors.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), {
          ...base,
          accessibleStudioIds: [DEMO, "studioA"],
        }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, ownedStudioIds: ["studioA"] }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, managedStudioIds: ["studioA"] }),
      );
      // Unflagged, or named as if it were a real person's document.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, isDemo: false }),
      );
      await assertFails(setDoc(doc(db, "trainers", "someone-else"), base));
    });

    it("never lets a real trainer document be turned into a demo one", async () => {
      const db = plainTrainer();
      // trainerA exists and is not a demo document; the id does not match
      // either, so both halves of the update clause refuse it.
      await assertFails(updateDoc(doc(db, "trainers", "trainerA"), { isDemo: true }));
    });

    it("lets a plain trainer work with demo clients and sessions", async () => {
      const db = plainTrainer();
      await assertSucceeds(
        setDoc(doc(db, "clients", "demo-client-elanor"), {
          firstName: "Elanor",
          lastName: "Gardner",
          isActive: true,
          remainingSessions: 54,
          homeStudioId: DEMO,
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "sessions", "demo-session-elanor-001"), {
          clientId: "demo-client-elanor",
          hostedAtStudioId: DEMO,
          clientHomeStudioId: DEMO,
          date: "2026-09-01",
          sessionNumber: 1,
          trainerInitials: "HH",
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "exerciseLogs", "demo-session-elanor-001_m-leg-press"), {
          sessionId: "demo-session-elanor-001",
          machineId: "m-leg-press",
          clientId: "demo-client-elanor",
          studioId: DEMO,
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "clientMachineSettings", "demo-client-elanor_m-leg-press"), {
          clientId: "demo-client-elanor",
          machineId: "m-leg-press",
          settings: { Gap: "4" },
          isDemo: true,
        }),
      );
    });

    it("does not let the demo flag carry a client into a real studio", async () => {
      // The thing that would make all of this worthless: `isDemo: true`
      // must never be a key. The studio id is what decides, always.
      const db = plainTrainer();
      await assertFails(
        setDoc(doc(db, "clients", "sneaky"), {
          firstName: "Not",
          lastName: "Yours",
          isActive: true,
          remainingSessions: 1,
          homeStudioId: "studioA",
          isDemo: true,
        }),
      );
    });

    it("still refuses the renewal snapshot on a demo client", async () => {
      // Demo Mode widens who may act; it does not change what anybody may
      // write. `renewal` belongs to the nightly job, everywhere.
      const db = plainTrainer();
      await assertFails(
        setDoc(doc(db, "clients", "demo-client-rosie"), {
          firstName: "Rosie",
          lastName: "Cotton",
          isActive: true,
          remainingSessions: 3,
          homeStudioId: DEMO,
          isDemo: true,
          renewal: { version: 1, situation: "on-track" },
        }),
      );
    });

    it("gives nobody anything when they are not signed in", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, "studios", DEMO), { name: "Demo Mode" }));
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-hob"), {
          fullName: "Hob Hayward",
          initials: "HH",
          role: "StudioLeader",
          primaryHomeStudioId: DEMO,
          accessibleStudioIds: [DEMO],
          isDemo: true,
        }),
      );
    });

    it("gives nothing to a signed-in user with no trainer profile", async () => {
      // Every demo clause goes through isAnyAuthenticatedTrainer(), so a bare
      // Auth account is not enough — the same bar as the rest of the app.
      const db = testEnv
        .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
        .firestore();
      await assertFails(setDoc(doc(db, "studios", DEMO), { name: "Demo Mode" }));
      await assertFails(
        setDoc(doc(db, "clients", "demo-client-x"), {
          firstName: "X",
          lastName: "Y",
          isActive: true,
          remainingSessions: 1,
          homeStudioId: DEMO,
          isDemo: true,
        }),
      );
    });
  });

  /* ================================================================== *
   * FORD — WHO CAN READ HER LIFE (client codex, phase 1, Sep 24 2026)
   *
   * Written against the rules AS THEY ARE: the round changes no rule. The
   * read rule tests resource.data.studioId, so a LIST is only allowed when
   * the query itself pins the studio. useClientFord listed the client's FORD
   * with no filter from Sep 15 until this round, which is why every trainer
   * below franchise owner saw an empty FORD. The app now filters on the
   * client's home studio (useClientFord.ts, `fordStudioIdOf`); these pin that
   * the filtered query works for everyone who should read it, that the
   * unfiltered one does not, and that a cross-train visitor — who CAN read
   * the client document — cannot read their FORD.
   * ================================================================== */
  describe("FORD — who can read her life (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** The app's exact query (useClientFord.ts): equality on studioId, a cap, no orderBy. */
    const appQuery = (db: ReturnType<typeof as>, clientId = "clientA", studioId = "studioA") =>
      query(collection(db, "clients", clientId, "ford"), where("studioId", "==", studioId), limit(500));

    const person = (role: string, home: string, extra: Record<string, unknown> = {}) => ({
      fullName: `${role} ${home}`,
      initials: "XX",
      role,
      primaryHomeStudioId: home,
      accessibleStudioIds: [home],
      ...extra,
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "studios", "studioC"), { name: "Studio C" });
        // Carol's home is studio A; she has approved cross-training at B.
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        await setDoc(doc(db, "clients", "clientA", "ford", "f1"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "family",
          body: "Wife is Karen.",
          isPinned: true,
          authorId: "trainerA",
          isArchived: false,
        });
        await setDoc(doc(db, "trainers", "trainerC"), person("LifeTransformer", "studioC"));
        // THE GRANT: helps run studio A, whatever their own home.
        await setDoc(
          doc(db, "trainers", "granted"),
          person("LifeTransformer", "studioC", { managedStudioIds: ["studioA"] }),
        );
        // A guest pass at studio A.
        await setDoc(
          doc(db, "trainers", "guest"),
          person("LifeTransformer", "studioC", { activeGuestStudioIds: ["studioA"] }),
        );
        // The franchise partition (Oct 2026): the franchise owner OF studio A,
        // and one who owns nothing.
        await setDoc(doc(db, "trainers", "franchise"), person("FranchiseOwner", "studioC", { ownedStudioIds: ["studioA"] }));
        await setDoc(doc(db, "trainers", "franchiseElsewhere"), person("FranchiseOwner", "studioC"));
        await setDoc(doc(db, "trainers", "admin"), person("Admin", "studioC"));
        // A Demo Mode client: every signed-in trainer has the run of it.
        await setDoc(doc(db, "clients", "demo-client-x"), {
          firstName: "Demo",
          lastName: "Client",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "demo-studio",
          isDemo: true,
        });
        await setDoc(doc(db, "clients", "demo-client-x", "ford", "d1"), {
          clientId: "demo-client-x",
          studioId: "demo-studio",
          pillar: null,
          body: "Off to Italy in May",
          authorId: "trainerA",
          isArchived: false,
        });
      });
    });

    it("lets the home studio's trainer read a detail and list with the app's filtered query", async () => {
      const db = as("trainerA");
      await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertSucceeds(getDocs(appQuery(db)));
    });

    it("refuses the same trainer the list WITHOUT the studio filter — the bug this round fixed", async () => {
      // Every document in the list is readable by trainerA one by one; the
      // list is still refused, because rules are not filters: Firestore will
      // not run a query it cannot prove stays inside a studio the caller
      // trains at. This is why useClientFord must name the studio.
      const db = as("trainerA");
      await assertFails(getDocs(collection(db, "clients", "clientA", "ford")));
      await assertFails(getDocs(query(collection(db, "clients", "clientA", "ford"), limit(500))));
    });

    it("counts the grant and a guest pass at the client's studio", async () => {
      for (const uid of ["granted", "guest"]) {
        const db = as(uid);
        await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
        await assertSucceeds(getDocs(appQuery(db)));
      }
    });

    it("lets the franchise owner of her studio and an administrator read it too", async () => {
      for (const uid of ["franchise", "admin"]) {
        const db = as(uid);
        await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
        await assertSucceeds(getDocs(appQuery(db)));
      }
      // A franchise owner of no studio of hers reads none of it (the franchise partition).
      const elsewhere = as("franchiseElsewhere");
      await assertFails(getDoc(doc(elsewhere, "clients", "clientA", "ford", "f1")));
      await assertFails(getDocs(appQuery(elsewhere)));
    });

    it("refuses a cross-train visitor her FORD, although they can read her client record", async () => {
      // trainerB works at studio B, which Carol approved for cross-training:
      // the client document is theirs to read (so she is trainable there),
      // her home life is not. This is why 'In one line' and every other FORD
      // text stays off the client document.
      const db = as("trainerB");
      await assertSucceeds(getDoc(doc(db, "clients", "clientA")));
      await assertFails(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertFails(getDocs(appQuery(db)));
    });

    it("refuses a trainer at a studio with no tie to her at all", async () => {
      const db = as("trainerC");
      await assertFails(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertFails(getDocs(appQuery(db)));
    });

    it("lets any trainer read a Demo Mode client's FORD with the same query", async () => {
      const db = as("trainerB");
      await assertSucceeds(getDocs(appQuery(db, "demo-client-x", "demo-studio")));
    });
  });

  /* ================================================================== *
   * FORD'S NEW FIELDS — IN ONE LINE AND FOLLOW UP NEXT TIME (client
   * codex, phase 11, AJ's decision 3). NO rules change: both ride on the
   * ford block as it is.
   *
   *   - In one line is a FORD document with the fixed id `one-line`
   *     (src/features/ford/one-line.ts), stamped with the client's studio
   *     and the Auth uid, stored archived with no pillar. saveFordOneLine
   *     sends the whole document the first time (setDoc) and only the words
   *     and who wrote them after (updateDoc). It keeps FORD's read scope —
   *     which is why it is not on the client document, where a cross-train
   *     studio could read it.
   *   - Follow up next time is three fields on a detail (followUp,
   *     followUpAt, followUpBy); the ford block has no allowed-keys list,
   *     so an update adding or clearing them passes the rule every edit
   *     passes.
   *   - The delete rule lets the AUTHOR delete a pillar-null document of
   *     their own — the one-line document included. No screen offers it
   *     (the sweep's discard only lists unfiled captures, and the line is
   *     archived, so it is never one); pinned here so nobody is surprised.
   * ================================================================== */
  describe("FORD — In one line and Follow up next time (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    const lineRef = (db: ReturnType<typeof as>) => doc(db, "clients", "clientA", "ford", "one-line");

    /** saveFordOneLine's create, exactly (ford-write.ts). */
    const firstLine = (uid: string, body = "Retired hygienist, pickleball regular") => ({
      kind: "one-line",
      clientId: "clientA",
      studioId: "studioA",
      pillar: null,
      body,
      subject: null,
      isPinned: true,
      eventDate: null,
      recurrence: "none",
      effectiveFrom: null,
      effectiveUntil: null,
      repeat: null,
      reviewedAt: null,
      opportunity: null,
      followUp: null,
      followUpAt: null,
      followUpBy: null,
      occurredAt: new Date(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      authorId: uid,
      authorName: `Name ${uid}`,
      authorInitials: "XX",
      origin: "profile",
      sessionId: null,
      isArchived: true,
    });

    /** saveFordOneLine's rewrite, exactly: the words and who wrote them. */
    const rewrite = (uid: string, body: string) => ({
      body,
      authorId: uid,
      authorName: `Name ${uid}`,
      authorInitials: "XX",
      occurredAt: new Date(),
      updatedAt: serverTimestamp(),
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        // A second trainer at the client's home studio: the line is the team's.
        await setDoc(doc(db, "trainers", "trainerA2"), {
          fullName: "Trainer A2",
          initials: "A2",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
        await setDoc(doc(db, "clients", "clientA", "ford", "f1"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "recreation",
          body: "New hiking boots for the Camino",
          isPinned: false,
          authorId: "trainerA",
          isArchived: false,
        });
      });
    });

    it("lets a home trainer write the first line as themselves, and no one as someone else", async () => {
      await assertFails(setDoc(lineRef(as("trainerA")), firstLine("trainerA2")));
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
    });

    it("refuses a first line stamped with another studio, or with no words", async () => {
      await assertFails(setDoc(lineRef(as("trainerA")), { ...firstLine("trainerA"), studioId: "studioB" }));
      await assertFails(setDoc(lineRef(as("trainerA")), firstLine("trainerA", "")));
    });

    it("lets anyone on the home team rewrite it, and clear it — but never walk it to another studio or client", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA2")), rewrite("trainerA2", "Walking the Camino with Tom in May")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA2")), rewrite("trainerA2", "")));
      await assertFails(updateDoc(lineRef(as("trainerA2")), { ...rewrite("trainerA2", "x"), studioId: "studioB" }));
      await assertFails(updateDoc(lineRef(as("trainerA2")), { ...rewrite("trainerA2", "x"), clientId: "clientB" }));
    });

    it("takes the create again as a rewrite over a cleared line — saveFordOneLine's fallback when none is showing", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA")), rewrite("trainerA", "")));
      await assertSucceeds(setDoc(lineRef(as("trainerA2")), firstLine("trainerA2", "A new line")));
    });

    it("arrives in the app's one FORD query, for the home team", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      const snap = await assertSucceeds(
        getDocs(query(collection(as("trainerA2"), "clients", "clientA", "ford"), where("studioId", "==", "studioA"), limit(500))),
      );
      expect(snap.docs.map((d) => d.id).sort()).toEqual(["f1", "one-line"]);
    });

    it("refuses a cross-train visitor the line, to read or to write — although they can read her client record", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      const visitor = as("trainerB");
      await assertSucceeds(getDoc(doc(visitor, "clients", "clientA")));
      await assertFails(getDoc(lineRef(visitor)));
      await assertFails(updateDoc(lineRef(visitor), rewrite("trainerB", "Not theirs to write")));
      await assertFails(setDoc(lineRef(visitor), firstLine("trainerB")));
    });

    it("lets its last author delete it (no screen offers that) and refuses everyone else", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertFails(deleteDoc(lineRef(as("trainerA2"))));
      await assertFails(deleteDoc(lineRef(as("trainerB"))));
      await assertSucceeds(deleteDoc(lineRef(as("trainerA"))));
    });

    it("lets a home trainer add a follow-up to a detail, and clear it", async () => {
      const f1 = doc(as("trainerA2"), "clients", "clientA", "ford", "f1");
      await assertSucceeds(
        updateDoc(f1, {
          followUp: "How did the new boots do on the long walk?",
          followUpAt: new Date(),
          followUpBy: "Trainer A2",
          updatedAt: serverTimestamp(),
        }),
      );
      await assertSucceeds(updateDoc(f1, { followUp: null, followUpAt: null, followUpBy: null, updatedAt: serverTimestamp() }));
      // A cross-train visitor may not touch it.
      await assertFails(
        updateDoc(doc(as("trainerB"), "clients", "clientA", "ford", "f1"), { followUp: "Theirs?", updatedAt: serverTimestamp() }),
      );
    });

    it("lets a new detail carry its follow-up from the start", async () => {
      await assertSucceeds(
        addDoc(collection(as("trainerA"), "clients", "clientA", "ford"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "family",
          body: "Sister visiting from Arizona in April",
          followUp: "Did her sister make it?",
          followUpAt: new Date(),
          followUpBy: "Trainer A",
          authorId: "trainerA",
          isArchived: false,
        }),
      );
    });
  });

  /* ================================================================== *
   * BODY & PULSE READS (client codex, phase 1). Existing policy, pinned:
   * the record reads a client's newest sessions from the journal's own
   * listener (useClientJournal, `recentSessions`) and her InBody scans, and
   * both are scoped by CLIENT, so an approved cross-train visitor reads them
   * where they could not read her FORD.
   * ================================================================== */
  describe("Body & Pulse reads (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** useClientJournal's sessions listener, exactly. */
    const newestSessions = (db: ReturnType<typeof as>) =>
      query(collection(db, "sessions"), where("clientId", "==", "clientA"), orderBy("date", "desc"), limit(40));

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        await setDoc(doc(db, "sessions", "sA1"), {
          clientId: "clientA",
          hostedAtStudioId: "studioA",
          trainerId: "trainerA",
          date: "2026-09-01",
        });
        await setDoc(doc(db, "clients", "clientA", "inbodyScans", "scan1"), {
          clientId: "clientA",
          studioId: "studioA",
          testedAt: "2026-09-02",
        });
        await setDoc(doc(db, "trainers", "trainerC"), {
          fullName: "Trainer C",
          initials: "TC",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioC",
          accessibleStudioIds: ["studioC"],
        });
      });
    });

    it("lets the home trainer and an approved cross-trainer list her 40 newest sessions, and nobody else", async () => {
      await assertSucceeds(getDocs(newestSessions(as("trainerA"))));
      await assertSucceeds(getDocs(newestSessions(as("trainerB"))));
      await assertFails(getDocs(newestSessions(as("trainerC"))));
    });

    it("lets an approved cross-trainer read her InBody scans", async () => {
      await assertSucceeds(getDocs(collection(as("trainerB"), "clients", "clientA", "inbodyScans")));
      await assertFails(getDocs(collection(as("trainerC"), "clients", "clientA", "inbodyScans")));
    });
  });

  /* ================================================================== *
   * STUDIO INBODY VARIATION (client codex, phase 2). NO rules change:
   * `studios/{id}.inbodyVariation` rides on the existing studio update rule,
   * which already lets a studio's own leaders (a leader role there, or the
   * grant), franchise owners and administrators write it — and nobody else.
   * These pin that, with the exact writes InBodyVariationPanel sends: the
   * whole map signed with the Auth uid, and deleteField() for "back to Max
   * Strength's defaults". Everyone signed in may read a studio already.
   * ================================================================== */
  describe("Studio InBody variation (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** InBodyVariationPanel's save, via features/inbody/variation.ts variationWrite. */
    const ownNumbers = (uid: string) => ({
      inbodyVariation: {
        skeletalMuscleMassLb: 2,
        bodyFatMassLb: 4,
        percentBodyFat: 2,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      },
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const person = (role: string, home: string, extra: Record<string, unknown> = {}) => ({
          fullName: `${role} ${home}`,
          initials: "XX",
          role,
          primaryHomeStudioId: home,
          accessibleStudioIds: [home],
          ...extra,
        });
        await setDoc(doc(db, "trainers", "granted"), person("LifeTransformer", "studioB", { managedStudioIds: ["studioA"] }));
        // The franchise partition (Oct 2026): the franchise owner OF studio A,
        // and one who owns nothing.
        await setDoc(doc(db, "trainers", "franchise"), person("FranchiseOwner", "studioB", { ownedStudioIds: ["studioA"] }));
        await setDoc(doc(db, "trainers", "franchiseBare"), person("FranchiseOwner", "studioB"));
        await setDoc(doc(db, "trainers", "admin"), person("Admin", "studioB"));
      });
    });

    it("lets the studio's own leader set its numbers and go back to the defaults", async () => {
      const db = as("ownerA");
      await assertSucceeds(updateDoc(doc(db, "studios", "studioA"), ownNumbers("ownerA")));
      await assertSucceeds(updateDoc(doc(db, "studios", "studioA"), { inbodyVariation: deleteField() }));
    });

    it("counts the grant, and a franchise owner and an administrator", async () => {
      for (const uid of ["granted", "franchise", "admin"]) {
        await assertSucceeds(updateDoc(doc(as(uid), "studios", "studioA"), ownNumbers(uid)));
      }
      // A franchise owner who doesn't own studio A doesn't run it (the franchise partition).
      await assertFails(updateDoc(doc(as("franchiseBare"), "studios", "studioA"), ownNumbers("franchiseBare")));
    });

    it("refuses a trainer, and a leader on another studio", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "studios", "studioA"), ownNumbers("trainerA")));
      // Removing numbers a studio HAS is refused too. (Removing a field that
      // is not there changes nothing, so the rule's sync-lease clause — "only
      // these keys changed" — lets that no-op through; that is harmless.)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "studios", "studioA"), ownNumbers("ownerA"));
      });
      await assertFails(updateDoc(doc(as("trainerA"), "studios", "studioA"), { inbodyVariation: deleteField() }));
      await assertFails(updateDoc(doc(as("ownerA"), "studios", "studioB"), ownNumbers("ownerA")));
      // The grant is for studio A only.
      await assertFails(updateDoc(doc(as("granted"), "studios", "studioB"), ownNumbers("granted")));
    });

    it("lets any trainer read the numbers, as every studio document already is", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "studios", "studioA"), { inbodyVariation: { skeletalMuscleMassLb: 2 } });
      });
      await assertSucceeds(getDoc(doc(as("trainerB"), "studios", "studioA")));
    });
  });
});

// ── A CROSS-TRAIN VISITOR FINISHES A SESSION (Sep 24 2026) ──────────────
//
// A trainer at studio A, whose client (home studio B) is approved to train at
// A, could open the client and log every set, but Finish was refused in full:
// the finish batch moves the client's totals, and only the home studio could
// change the client. These replay the batch as completeWorkoutSession writes
// it (src/lib/sync-utils.ts), at a real session's size, and check the visitor
// can move the session's totals and nothing else.
describe("a cross-train visitor's session", () => {
  const CLIENT = "visitorClient";
  const SESSION = "visitSession";
  const MACHINES = ["m-leg-press", "m-pulldown", "m-chest-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-hip-add", "m-neck"];

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // trainerA works at studioA; the client's home is studioB, approved for A.
      await setDoc(doc(db, "clients", CLIENT), {
        firstName: "Casey", lastName: "Visitor", isActive: true, remainingSessions: 10,
        homeStudioId: "studioB", approvedCrossTrainStudioIds: ["studioA"],
        completedSessions: 40, sessionCount: 40,
      });
      await setDoc(doc(db, "sessions", SESSION), {
        clientId: CLIENT, trainerId: "trainerA", hostedAtStudioId: "studioA",
        homeStudioId: "studioB", clientHomeStudioId: "studioB",
        status: "In Progress", sessionNumber: 41, date: "2026-09-24", trainerInitials: "TA",
      });
      for (const m of MACHINES) {
        await setDoc(doc(db, "exerciseLogs", `${SESSION}_${m}`), {
          sessionId: SESSION, machineId: m, clientId: CLIENT, weight: "180", reps: "9", studioId: "studioA",
        });
      }
      // A trainer at studio C, which the client is NOT approved for.
      await setDoc(doc(db, "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
    });
  });

  const totals = (uid: string): Record<string, unknown> => {
    const u: Record<string, unknown> = {
      completedSessions: increment(1),
      sessionCount: 41,
      lastSessionDate: "2026-09-24",
      updatedAt: serverTimestamp(),
      lifetimeReps: increment(72),
      lifetimeWeight: increment(12960),
      consultationCompleted: true,
      [`trainerTally.${uid}`]: increment(1),
      topTrainerId: uid,
      topTrainerName: "Trainer A",
      topTrainerSessions: 1,
      trainerTallyUpdatedAt: serverTimestamp(),
    };
    for (const m of MACHINES) {
      u[`currentMachineMetrics.${m}`] = { weight: "180", reps: "9", settings: {}, lastPerformedSessionNumber: 41, lastSessionId: SESSION };
      u[`machineStats.${m}.timesPerformed`] = increment(1);
      u[`machineStats.${m}.lastPerformedDate`] = "2026-09-24";
      u[`machineStats.${m}.lastWeight`] = 180;
    }
    return u;
  };

  const finishBatch = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>, uid: string) => {
    const b = writeBatch(db);
    b.update(doc(db, "sessions", SESSION), {
      status: "Completed", endTime: serverTimestamp(), trainerId: uid, trainerName: "Trainer A", trainerInitials: "TA",
      clientId: CLIENT, homeStudioId: "studioB", clientHomeStudioId: "studioB", hostedAtStudioId: "studioA",
    });
    for (const m of MACHINES) {
      b.set(doc(db, "exerciseLogs", `${SESSION}_${m}`), {
        sessionId: SESSION, machineId: m, weight: "180", reps: "9", clientId: CLIENT,
        homeStudioId: "studioB", clientHomeStudioId: "studioB", studioId: "studioA", updatedAt: serverTimestamp(),
      }, { merge: true });
      b.set(doc(db, "clientMachineSettings", `${CLIENT}_${m}`), {
        clientId: CLIENT, homeStudioId: "studioB", clientHomeStudioId: "studioB", machineId: m,
        settings: {}, updatedBy: uid, currentWeight: 180, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    return b;
  };

  it("lets the visitor finish an eight-machine session: the session, the sets, the settings, then the totals", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    // The session and its sets land first, as Finish now commits them.
    await assertSucceeds(finishBatch(db, "trainerA").commit());
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), totals("trainerA")));
  });

  it("lets the whole finish go in one batch too, within the rules' budget", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const b = finishBatch(db, "trainerA");
    b.update(doc(db, "clients", CLIENT), totals("trainerA"));
    await assertSucceeds(b.commit());
  });

  /* A finish is counted once (the sessions round, Oct 12 2026): the app
     sends TWO batches, in order. The session batch creates
     sessions/{id}/finish/once; the totals batch moves the client's counters
     and her machine totals document and marks the finish counted. B3 is the
     visitor's finish exactly as sent; B4 the totals batch at its fullest. */
  const marker = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>) =>
    doc(db, "sessions", SESSION, "finish", "once");

  const visitorTotalsBatch = (
    db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>,
    uid: string,
    finishId: string,
    machines: readonly string[] = MACHINES,
  ) => {
    const u = totals(uid);
    for (const k of Object.keys(u)) if (k.startsWith("currentMachineMetrics.") || k.startsWith("machineStats.")) delete u[k];
    // The session's number is added at Finish now, never set (#8).
    u.sessionCount = increment(1);
    for (const m of machines) {
      u[`currentMachineMetrics.${m}`] = { weight: "180", reps: "9", settings: {}, lastPerformedSessionNumber: 41, lastSessionId: SESSION };
      u[`machineStats.${m}.timesPerformed`] = increment(1);
      u[`machineStats.${m}.lastPerformedDate`] = "2026-09-24";
      u[`machineStats.${m}.lastWeight`] = 180;
    }
    const { client, totals: maps } = splitMachineTotalsUpdates(u);
    const b = writeBatch(db);
    b.update(doc(db, "clients", CLIENT), client);
    addMachineTotalsWrite(b, db as never, CLIENT, maps);
    b.update(marker(db), { countedAt: serverTimestamp(), countedBy: finishId });
    return b;
  };

  it("B3: the visitor's finish as the app sends it, two batches in order: the session with its marker, then the totals marked counted", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const b = finishBatch(db, "trainerA");
    b.set(marker(db), { finishId: "fv1", by: "trainerA", at: serverTimestamp(), clientId: CLIENT });
    await assertSucceeds(b.commit());
    await assertSucceeds(visitorTotalsBatch(db, "trainerA", "fv1").commit());
    const m = await getDoc(marker(db));
    expect(m.data()?.countedBy).toBe("fv1");
  });

  it("B4 (ship blocker): the visitor's totals batch at its fullest, twenty machines and the counted mark, within the budget", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const b = finishBatch(db, "trainerA");
    b.set(marker(db), { finishId: "fv2", by: "trainerA", at: serverTimestamp(), clientId: CLIENT });
    await assertSucceeds(b.commit());
    const twenty = Array.from({ length: 20 }, (_, i) => `m-visit-${i + 1}`);
    await assertSucceeds(visitorTotalsBatch(db, "trainerA", "fv2", twenty).commit());
  });

  it("lets the visitor's Start mark Routine B and the first session", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { isRoutineBActive: true }));
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { firstSessionDate: serverTimestamp() }));
  });

  it("lets the visitor's finished Pulse update the client's Pulse summary, and nothing with it", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const subjectiveSnapshot = {
      reportId: "pulse1", date: "2026-09-24", overallStatus: "red", overallPercent: 42,
      proteinStatus: "amber", hydrationStatus: "green", redCategories: ["pain"], flags: ["new-pain"],
    };
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { subjectiveSnapshot }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { subjectiveSnapshot, medicalHistory: "x" }));
  });

  it("lets the visitor give the counts back when a completed session is deleted from History", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "clients", CLIENT), {
        completedSessions: increment(-1),
        sessionCount: increment(-1),
        "trainerTally.trainerA": increment(-1),
        "machineStats.m-leg-press.timesPerformed": increment(-1),
      }),
    );
  });

  it("refuses the visitor anything beyond a session's totals", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { firstName: "Renamed" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { ...totals("trainerA"), homeStudioId: "studioA" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { ...totals("trainerA"), approvedCrossTrainStudioIds: ["studioA", "studioC"] }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { completedSessions: increment(1), medicalHistory: "x" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { completedSessions: increment(1), renewal: { situation: "on-track" } }));
    // The profile's auto-renewal box is the home studio's to mark (Sep 25 2026).
    await assertFails(
      updateDoc(doc(db, "clients", CLIENT), {
        autoRenewMark: { renews: false, contractId: "c1", setAt: "2026-09-25T14:00:00.000Z", setById: "trainerA" },
      }),
    );
    await assertFails(
      updateDoc(doc(db, "clients", CLIENT), {
        ...totals("trainerA"),
        autoRenewMark: { renews: false, contractId: "c1", setAt: "2026-09-25T14:00:00.000Z", setById: "trainerA" },
      }),
    );
  });

  it("refuses a trainer at a studio the client is not approved for", async () => {
    const db = testEnv.authenticatedContext("trainerC").firestore();
    await assertFails(updateDoc(doc(db, "clients", CLIENT), totals("trainerC")));
  });

  it("leaves the client's own studio free to edit the client, as before", async () => {
    // The existing rule for the client's own studio is unchanged: trainerB, at
    // studio B, may edit the client as always.
    const db = testEnv.authenticatedContext("trainerB").firestore();
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { firstName: "Casey" }));
  });
});

// ── MY PROFILE → YOUR WEEK'S READ (Openings round, phase 11, Sep 27 2026) ─
//
// Your week reads the studio's sessions the way Operations → Insights → Hours
// does (features/admin/sessions-range.ts: hostedAtStudioId ==, a createdAt
// range, newest first, capped) and keeps the trainer's own in memory. Naming
// the studio is what lets the rules allow it (trainerWorksAt): a query on
// trainerId alone is allowed only when the sessions carry the reader's
// sign-in uid, and an older account's sessions carry its trainer document id
// instead. No rules change; these hold the read to the rules as they stand.
describe("Your week's read", () => {
  const since = new Date("2026-09-20T04:00:00Z");
  const yourWeekQuery = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>, studioId: string) =>
    query(
      collection(db, "sessions"),
      where("hostedAtStudioId", "==", studioId),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(1500),
    );

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Signed in as authA2; the sessions this person ran carry the trainer
      // document id they had before, trainerDocA2 — the two differ.
      await setDoc(doc(db, "trainers", "authA2"), {
        fullName: "Trainer A Two",
        initials: "T2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
        claimedFromId: "trainerDocA2",
      });
      for (const [id, day] of [["yw1", "2026-09-22"], ["yw2", "2026-09-29"]]) {
        await setDoc(doc(db, "sessions", id), {
          hostedAtStudioId: "studioA",
          clientId: "clientYW",
          trainerId: "trainerDocA2",
          trainerInitials: "T2",
          status: "Completed",
          date: day,
          createdAt: new Date(`${day}T12:00:00Z`),
        });
      }
    });
  });

  it("lets a trainer whose sign-in id and trainer document id differ read their studio's sessions", async () => {
    const db = testEnv.authenticatedContext("authA2").firestore();
    const snap = await assertSucceeds(getDocs(yourWeekQuery(db, "studioA")));
    const ids = snap.docs.filter((d) => d.data().trainerId === "trainerDocA2").map((d) => d.id).sort();
    expect(ids).toEqual(["yw1", "yw2"]);
  });

  it("refuses that same trainer a read by trainerId alone, which is why Your week names the studio", async () => {
    const db = testEnv.authenticatedContext("authA2").firestore();
    await assertFails(
      getDocs(query(collection(db, "sessions"), where("trainerId", "==", "trainerDocA2"), orderBy("createdAt", "desc"), limit(50))),
    );
  });

  it("lets the studio's leader make the same read", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await assertSucceeds(getDocs(yourWeekQuery(db, "studioA")));
  });

  it("refuses someone from another studio", async () => {
    const db = testEnv.authenticatedContext("trainerB").firestore();
    await assertFails(getDocs(yourWeekQuery(db, "studioA")));
  });
});

// ── THE STANDING WEEK (voice-review round, Sep 27 2026) ─────────────────
//
// studios/{s}/standingWeeks/{uid}: a trainer's usual week at a studio. The
// trainer proposes it (the proposal fields only), a leader agrees it, and the
// studio's people read it. docs/rounds/2026-09-27-standing-week.md.
describe("the standing week", () => {
  const week = (over: Record<string, unknown> = {}) => ({
    hours: [{ weekday: 1, from: "07:00", to: "13:00" }],
    regulars: [{ id: "r1", weekday: 1, start: "08:00", clientId: "clientA", clientName: "Judy Smith" }],
    ...over,
  });
  const proposal = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    trainerUid: uid,
    trainerId: uid,
    trainerName: "Trainer A",
    proposed: week(),
    proposedAt: serverTimestamp(),
    proposedBy: { id: uid, name: "Trainer A" },
    ...over,
  });
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const weekRef = (db: ReturnType<typeof as>, studioId: string, uid: string) => doc(db, "studios", studioId, "standingWeeks", uid);
  const agreement = (by: string, over: Record<string, unknown> = {}) => ({
    final: week(),
    finalAt: serverTimestamp(),
    finalBy: { id: by, name: "Owner A" },
    ...over,
  });

  async function seedAgreed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "standingWeeks", "trainerA"), {
        ...proposal("trainerA", { proposedAt: new Date("2026-09-20T12:00:00Z") }),
        final: week(),
        finalAt: new Date("2026-09-21T12:00:00Z"),
        finalBy: { id: "ownerA", name: "Owner A" },
      });
    });
  }

  it("lets a trainer propose their own week, and read the studio's weeks", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA"), { merge: true }));
    await assertSucceeds(getDoc(weekRef(db, "studioA", "trainerA")));
    await assertSucceeds(getDocs(collection(db, "studios", "studioA", "standingWeeks")));
    // Proposing again, and taking the proposal back.
    await assertSucceeds(
      setDoc(weekRef(db, "studioA", "trainerA"), { proposed: week({ note: "Mornings only" }), proposedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { proposed: null, proposedAt: serverTimestamp() }));
  });

  it("never lets a trainer agree a week, or write someone else's", async () => {
    const db = as("trainerA");
    // Their own week, agreed by themselves.
    await assertFails(setDoc(weekRef(db, "studioA", "trainerA"), { ...proposal("trainerA"), ...agreement("trainerA") }));
    // Someone else's week, and a studio they don't work at.
    await assertFails(setDoc(weekRef(db, "studioA", "ownerA"), proposal("ownerA", { proposedBy: { id: "trainerA", name: "Trainer A" } })));
    await assertFails(setDoc(weekRef(db, "studioB", "trainerA"), proposal("trainerA", { studioId: "studioB" })));
    // Once agreed, the agreement stays the leader's; the proposal stays theirs.
    await seedAgreed();
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { final: week({ regulars: [] }) }));
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { finalBy: { id: "trainerA", name: "Trainer A" } }));
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { final: null, finalAt: null, finalBy: null }));
    await assertSucceeds(
      updateDoc(weekRef(db, "studioA", "trainerA"), {
        proposed: week({ regulars: [] }),
        proposedAt: serverTimestamp(),
        proposedBy: { id: "trainerA", name: "Trainer A" },
      }),
    );
    await assertFails(deleteDoc(weekRef(db, "studioA", "trainerA")));
  });

  it("keeps the weeks to the studio's own people", async () => {
    await seedAgreed();
    const elsewhere = as("trainerB");
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "standingWeeks")));
    await assertFails(getDoc(weekRef(elsewhere, "studioA", "trainerA")));
    await assertFails(getDoc(weekRef(testEnv.unauthenticatedContext().firestore(), "studioA", "trainerA")));
  });

  it("lets the studio's leader agree, change and remove a week, signed in their own name", async () => {
    const owner = as("ownerA");
    // A leader may set a week nobody proposed; they never sign a proposal in the trainer's name.
    await assertFails(setDoc(weekRef(owner, "studioA", "trainerA"), { ...proposal("trainerA"), ...agreement("ownerA") }));
    await assertSucceeds(setDoc(weekRef(owner, "studioA", "trainerA"), { ...proposal("trainerA", { proposedBy: null }), ...agreement("ownerA") }));
    // Agreed as somebody else, or backdated.
    await assertFails(updateDoc(weekRef(owner, "studioA", "trainerA"), agreement("trainerA")));
    await assertFails(updateDoc(weekRef(owner, "studioA", "trainerA"), agreement("ownerA", { finalAt: new Date("2026-01-01T12:00:00Z") })));
    // Changed and agreed again; the proposal brought into line with it.
    await assertSucceeds(
      updateDoc(weekRef(owner, "studioA", "trainerA"), { ...agreement("ownerA", { final: week({ regulars: [] }) }), proposed: week({ regulars: [] }) }),
    );
    // Not at a studio they don't run.
    await assertFails(setDoc(weekRef(owner, "studioB", "trainerB"), { ...proposal("trainerB", { studioId: "studioB" }), ...agreement("ownerA") }));
    await assertSucceeds(deleteDoc(weekRef(owner, "studioA", "trainerA")));
  });

  it("counts the grant: a trainer who runs the studio may agree a colleague's week", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { managedStudioIds: ["studioA"] });
    });
    const granted = as("trainerA");
    await assertSucceeds(
      setDoc(weekRef(granted, "studioA", "ownerA"), {
        ...proposal("ownerA", { proposedBy: null, trainerName: "Owner A" }),
        ...agreement("trainerA"),
      }),
    );
  });

  it("holds the week's shape", async () => {
    const owner = as("ownerA");
    const bad = [
      { studioId: "studioB" },
      { trainerUid: "someoneElse" },
      { trainerId: "" },
      { colour: "blue" },
      { proposed: week({ note: "x".repeat(501) }) },
      // Three blocks a day, 21 a week (Openings round): a 22nd is refused.
      { proposed: week({ hours: Array.from({ length: 22 }, () => ({ weekday: 1, from: "07:00", to: "08:00" })) }) },
      { final: week({ hours: Array.from({ length: 22 }, () => ({ weekday: 1, from: "07:00", to: "08:00" })) }) },
      { proposed: week({ regulars: Array.from({ length: 81 }, (_, i) => ({ id: `r${i}`, weekday: 1, start: "08:00", clientId: "c", clientName: "C" })) }) },
      { proposed: { hours: [], regulars: [], extra: true } },
      { proposed: "Mondays" },
    ];
    for (const over of bad) {
      await assertFails(setDoc(weekRef(owner, "studioA", "trainerA"), proposal("trainerA", { proposedBy: null, ...over })));
    }
    // A trainer's proposal, backdated.
    await assertFails(setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), proposal("trainerA", { proposedAt: new Date("2026-01-01T12:00:00Z") })));
  });

  // Three blocks a day (Openings round, Sep 27 2026): 21 a week are accepted,
  // proposed by the trainer and agreed by a leader.
  it("takes three blocks a day, 21 a week", async () => {
    const blocks = Array.from({ length: 21 }, (_, i) => ({
      weekday: i % 7,
      from: ["06:00", "10:00", "15:00"][Math.floor(i / 7)],
      to: ["09:00", "13:00", "19:00"][Math.floor(i / 7)],
    }));
    await assertSucceeds(setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), proposal("trainerA", { proposed: week({ hours: blocks }) })));
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { ...agreement("ownerA", { final: week({ hours: blocks }) }), proposed: week({ hours: blocks }) }, { merge: true }),
    );
  });

  // Who agrees (voice review follow-up): every leader the docs name, and
  // nobody else. Seeded only where a test needs them.
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      // The franchise partition (Oct 2026): the franchise owner OF studio A.
      await person("franchiseX", "FranchiseOwner", "studioB", { ownedStudioIds: ["studioA"] });
      await person("adminX", "Admin", "studioB");
      await person("headA", "HeadTrainer", "studioA");
      await person("leaderA", "StudioLeader", "studioA");
      await person("headB", "HeadTrainer", "studioB");
      await person("colleagueA", "LifeTransformer", "studioA");
    });
  }
  const agreeAs = (uid: string) =>
    setDoc(weekRef(as(uid), "studioA", "trainerA"), { ...agreement(uid, { finalBy: { id: uid, name: uid } }), proposed: week() }, { merge: true });

  it("lets a franchise owner, an administrator, a head trainer and a studio leader agree", async () => {
    await seedPeople();
    for (const uid of ["franchiseX", "adminX", "headA", "leaderA"]) {
      await seedAgreed();
      await assertSucceeds(agreeAs(uid));
    }
  });

  it("refuses a head trainer from another studio, and a colleague at this one", async () => {
    await seedPeople();
    await seedAgreed();
    await assertFails(agreeAs("headB"));
    await assertFails(agreeAs("colleagueA"));
    // A colleague may read the week, but never change it: not the proposal, not the days away.
    const colleague = as("colleagueA");
    await assertSucceeds(getDoc(weekRef(colleague, "studioA", "trainerA")));
    await assertFails(
      updateDoc(weekRef(colleague, "studioA", "trainerA"), { proposed: week({ regulars: [] }), proposedAt: serverTimestamp(), proposedBy: { id: "colleagueA", name: "colleagueA" } }),
    );
    await assertFails(updateDoc(weekRef(colleague, "studioA", "trainerA"), { away: [{ id: "a1", from: "2026-10-05", to: "2026-10-09" }] }));
    await assertFails(deleteDoc(weekRef(colleague, "studioA", "trainerA")));
  });

  it("never lets a trainer point their week at another trainer's bookings", async () => {
    await seedAgreed();
    const db = as("trainerA");
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { trainerId: "trainerB" }));
    await assertFails(
      setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA", { trainerId: "trainerB", proposed: week({ regulars: [] }) }), { merge: true }),
    );
    // The same write with their own trainer id is theirs to make.
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA", { proposed: week({ regulars: [] }) }), { merge: true }));
    // A leader may still set it from the roster as they agree.
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { trainerId: "trainerA2" }));
  });

  // Away (voice review follow-up): the days a trainer is away. No agreement,
  // so the trainer writes it too, with or without a proposal.
  const owned = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    trainerUid: uid,
    trainerId: uid,
    trainerName: "Trainer A",
    ...over,
  });
  const range = (over: Record<string, unknown> = {}) => ({ id: "a1", from: "2026-10-05", to: "2026-10-09", note: "Vacation", ...over });

  it("lets a trainer set the days they are away, with no proposal, and change them", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: [range()] }), { merge: true }));
    await assertSucceeds(
      setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: [range(), range({ id: "a2", from: "2026-11-02", to: "2026-11-02" })] }), { merge: true }),
    );
    // Proposing after, and clearing the days away.
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA"), { merge: true }));
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { away: [] }));
    // On an agreed week too: the agreement stays the leader's.
    await seedAgreed();
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { away: [range()] }));
    // Never someone else's, nor at a studio they don't work at.
    await assertFails(setDoc(weekRef(db, "studioA", "ownerA"), owned("ownerA", { away: [range()] })));
    await assertFails(setDoc(weekRef(as("trainerB"), "studioA", "trainerB"), owned("trainerB", { away: [range()] })));
  });

  it("lets the studio's leader set a trainer's days away", async () => {
    await assertSucceeds(setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), owned("trainerA", { away: [range()] }), { merge: true }));
    await seedAgreed();
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { away: [] }));
  });

  it("holds the shape of the days away", async () => {
    const db = as("trainerA");
    const bad = [
      "October",
      [range({ from: "2026-10-09", to: "2026-10-05" })],
      [range({ from: "Oct 5" })],
      [range({ to: 20261009 })],
      [range({ note: "x".repeat(201) })],
      [range({ id: "" })],
      [range({ colour: "blue" })],
      ["2026-10-05"],
      Array.from({ length: 7 }, (_, i) => range({ id: `a${i}` })),
      // The sixth place is checked as well as the first.
      [...Array.from({ length: 5 }, (_, i) => range({ id: `a${i}` })), range({ id: "a5", from: "2026-12-31", to: "2026-12-01" })],
    ];
    for (const away of bad) {
      await assertFails(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away })));
    }
    // Six, each checked, fit the rules' budget of expressions for a trainer and a leader alike.
    const six = Array.from({ length: 6 }, (_, i) => range({ id: `a${i}` }));
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: six })));
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { away: [...six].reverse() }));
  });

  // The expensive writes (review of the follow-up): every write re-checks the
  // stored days away, so the fullest real writes must fit the budget too -- a
  // leader agreeing, and the trainer proposing, on a week that already holds
  // six ranges and both a proposed and an agreed week. If either fails, lower
  // MAX_AWAY in week.ts and the six in standingWeekAwayValid together.
  // The week is the fullest the app writes: 21 blocks, three a day every day
  // (Openings round, Sep 27 2026; it was 14), and 80 regulars.
  it("fits a leader's agreement and a trainer's proposal on a week holding six days away", async () => {
    const full = week({
      hours: Array.from({ length: 21 }, (_, i) => ({
        weekday: i % 7,
        from: ["06:00", "10:00", "15:00"][Math.floor(i / 7)],
        to: ["09:00", "13:00", "20:00"][Math.floor(i / 7)],
      })),
      regulars: Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, weekday: (i % 6) + 1, start: "08:00", clientId: `c${i}`, clientName: `Client ${i}` })),
      note: "Mornings, and two evenings",
    });
    const six = Array.from({ length: 6 }, (_, i) => range({ id: `a${i}`, from: `2026-1${i % 3}-0${i + 1}`, to: `2026-1${i % 3}-2${i}` }));
    const seedFull = (uid = "trainerA") =>
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "studios", "studioA", "standingWeeks", uid), {
          ...proposal(uid, { proposed: full, proposedAt: new Date("2026-09-20T12:00:00Z") }),
          final: full,
          finalAt: new Date("2026-09-21T12:00:00Z"),
          finalBy: { id: "ownerA", name: "Owner A" },
          away: six,
        });
      });
    // What the app writes (store.ts): whose week it is, then the agreement or the proposal.
    const owner = { studioId: "studioA", trainerUid: "trainerA", trainerId: "trainerA", trainerName: "Trainer A" };
    const changed = week({ ...full, note: "Agreed: mornings" });
    await seedFull();
    // A leader agrees a changed week: final, proposed and both stamps at once.
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { ...owner, proposed: changed, ...agreement("ownerA", { final: changed }) }, { merge: true }),
    );
    // The trainer proposes a change: the proposal and its stamps, where they work.
    await seedFull();
    await assertSucceeds(
      setDoc(
        weekRef(as("trainerA"), "studioA", "trainerA"),
        proposal("trainerA", { proposed: week({ ...full, note: "Evenings only" }) }),
        { merge: true },
      ),
    );
    // And both again, each changing the days away in the same write.
    await seedFull();
    await assertSucceeds(
      setDoc(
        weekRef(as("ownerA"), "studioA", "trainerA"),
        { ...owner, proposed: changed, ...agreement("ownerA", { final: changed }), away: [...six].reverse() },
        { merge: true },
      ),
    );
    await seedFull();
    await assertSucceeds(
      setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), { ...proposal("trainerA", { proposed: changed }), away: [...six].reverse() }, { merge: true }),
    );

    // ownerA is the cheapest leader: trainerLeads answers on its first two
    // tests. The costlier ones go further through it before it says yes
    // (measured Sep 27 2026, voice review follow-up's final review): a
    // trainer with the grant, a head trainer who runs the studio through
    // ownedStudioIds, a studio leader based elsewhere with the grant here,
    // and a leader agreeing their OWN week, where the trainer's branch runs
    // its diff first and then falls through to the leader's. Each agrees
    // the full week, with and without rewriting the days away.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "trainers", "grantA"), {
        fullName: "Grant A", initials: "GA", role: "LifeTransformer",
        primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"], managedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "trainers", "headA"), {
        fullName: "Head A", initials: "HA", role: "HeadTrainer",
        primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB", "studioA"], ownedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "trainers", "leadB"), {
        fullName: "Lead B", initials: "LB", role: "StudioLeader",
        primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB", "studioA"], managedStudioIds: ["studioA"],
      });
    });
    for (const leader of ["grantA", "headA", "leadB"]) {
      await seedFull();
      await assertSucceeds(
        setDoc(weekRef(as(leader), "studioA", "trainerA"), { ...owner, proposed: changed, ...agreement(leader, { final: changed }) }, { merge: true }),
      );
      await seedFull();
      await assertSucceeds(
        setDoc(
          weekRef(as(leader), "studioA", "trainerA"),
          { ...owner, proposed: changed, ...agreement(leader, { final: changed }), away: [...six].reverse() },
          { merge: true },
        ),
      );
    }
    const own = { studioId: "studioA", trainerUid: "ownerA", trainerId: "ownerA", trainerName: "Owner A" };
    await seedFull("ownerA");
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "ownerA"), { ...own, proposed: changed, ...agreement("ownerA", { final: changed }) }, { merge: true }),
    );
    await seedFull("ownerA");
    await assertSucceeds(
      setDoc(
        weekRef(as("ownerA"), "studioA", "ownerA"),
        { ...own, proposed: changed, ...agreement("ownerA", { final: changed }), away: [...six].reverse() },
        { merge: true },
      ),
    );
  });
});

// ── THE WHOLE-READ RECORD (Sep 27 2026) ─────────────────────────────────
//
// studios/{s}/scheduleCoverage/{yyyy-mm}: the studio days a pull that
// Mindbody answered in full read, as { days: [...] }. The iPad that pulled
// adds them with an add-to-list merge (src/features/openings/coverage-record.ts);
// anyone who works at the studio may, and nobody may take a day away or
// delete a month from the app. docs/rounds/2026-09-27-coverage-record.md.
describe("the whole-read record", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const monthRef = (db: ReturnType<typeof as>, studioId: string, month: string) => doc(db, "studios", studioId, "scheduleCoverage", month);
  /** The first n days of a month, as the app writes them. */
  const daysOf = (month: string, n: number) => Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const add = (db: ReturnType<typeof as>, studioId: string, month: string, days: string[]) =>
    setDoc(monthRef(db, studioId, month), { days: arrayUnion(...days) }, { merge: true });
  const seed = (studioId: string, month: string, days: string[]) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", studioId, "scheduleCoverage", month), { days });
    });

  // Seeded only where a test needs them: every kind of writer the docs name,
  // and the costliest path through writesForStudio (a guest, whose studio is
  // found last, with no role claim on the token, so the role is read from
  // the trainer document).
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      // The franchise partition (Oct 2026): the franchise owner OF studio A.
      await person("franchiseX", "FranchiseOwner", "studioB", { ownedStudioIds: ["studioA"] });
      await person("adminX", "Admin", "studioB");
      await person("guestA", "LifeTransformer", "studioB", { activeGuestStudioIds: ["studioA"] });
      await person("grantA", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
    });
  }

  it("lets a trainer at the studio add the days a pull read, again and again, and read them", async () => {
    const db = as("trainerA");
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-27", "2026-09-28"]));
    // The next day's pull: only tomorrow is new; a day already there is no change.
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-29"]));
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-28", "2026-09-29"]));
    const snap = await assertSucceeds(getDoc(monthRef(db, "studioA", "2026-09")));
    expect(snap.data()).toEqual({ days: ["2026-09-27", "2026-09-28", "2026-09-29"] });
  });

  it("writes a month's end as two documents in one batch", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.set(monthRef(db, "studioA", "2026-09"), { days: arrayUnion("2026-09-30") }, { merge: true });
    b.set(monthRef(db, "studioA", "2026-10"), { days: arrayUnion("2026-10-01") }, { merge: true });
    await assertSucceeds(b.commit());
  });

  it("lets a leader, a trainer with the grant, a guest, a franchise owner and an administrator add days", async () => {
    await seedPeople();
    for (const uid of ["ownerA", "grantA", "guestA", "franchiseX", "adminX"]) {
      await assertSucceeds(add(as(uid), "studioA", "2026-08", daysOf("2026-08", 3)));
      await assertSucceeds(getDoc(monthRef(as(uid), "studioA", "2026-08")));
    }
  });

  it("refuses a trainer from another studio, reading or writing, and anyone signed out", async () => {
    await seed("studioA", "2026-09", ["2026-09-27"]);
    const elsewhere = as("trainerB");
    await assertFails(add(elsewhere, "studioA", "2026-09", ["2026-09-28"]));
    await assertFails(add(elsewhere, "studioA", "2026-10", ["2026-10-01"]));
    await assertFails(getDoc(monthRef(elsewhere, "studioA", "2026-09")));
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "scheduleCoverage")));
    const out = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(monthRef(out, "studioA", "2026-09")));
    await assertFails(setDoc(monthRef(out, "studioA", "2026-10"), { days: ["2026-10-01"] }));
    // Their own studio is theirs.
    await assertSucceeds(add(elsewhere, "studioB", "2026-09", ["2026-09-27"]));
  });

  it("never lets a day be taken away, or a month deleted, by anyone in the app", async () => {
    await seedPeople();
    await seed("studioA", "2026-09", ["2026-09-26", "2026-09-27", "2026-09-28"]);
    for (const uid of ["trainerA", "ownerA", "adminX"]) {
      const db = as(uid);
      await assertFails(updateDoc(monthRef(db, "studioA", "2026-09"), { days: arrayRemove("2026-09-27") }));
      await assertFails(setDoc(monthRef(db, "studioA", "2026-09"), { days: ["2026-09-28", "2026-09-29"] }));
      await assertFails(updateDoc(monthRef(db, "studioA", "2026-09"), { days: [] }));
      await assertFails(deleteDoc(monthRef(db, "studioA", "2026-09")));
    }
    // Writing the whole list back with a day more is still only an add.
    await assertSucceeds(setDoc(monthRef(as("trainerA"), "studioA", "2026-09"), { days: ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"] }));
  });

  it("holds the record's shape", async () => {
    const db = as("trainerA");
    const refused: [string, Record<string, unknown>][] = [
      // Not a month.
      ["2026-13", { days: ["2026-13-01"] }],
      ["2026-9", { days: ["2026-9-01"] }],
      ["september", { days: ["september-01"] }],
      // Another month's day, or not a day.
      ["2026-09", { days: ["2026-10-01"] }],
      ["2026-09", { days: ["2026-09-27", "2026-09-32"] }],
      ["2026-09", { days: ["someday"] }],
      ["2026-09", { days: [20260927] }],
      // A day twice, no day, or not a list.
      ["2026-09", { days: ["2026-09-27", "2026-09-27"] }],
      ["2026-09", { days: [] }],
      ["2026-09", { days: "2026-09-27" }],
      ["2026-09", { days: { "2026-09-27": true } }],
      // Anything beside the days.
      ["2026-09", { days: ["2026-09-27"], by: "trainerA" }],
      ["2026-09", { days: ["2026-09-27"], at: serverTimestamp() }],
      ["2026-09", {}],
    ];
    for (const [month, data] of refused) {
      await assertFails(setDoc(monthRef(db, "studioA", month), data));
    }
    // Thirty-two can't be written: a month has 31 days, and none may come twice.
    await assertFails(setDoc(monthRef(db, "studioA", "2026-10"), { days: [...daysOf("2026-10", 31), "2026-10-01"] }));
  });

  // The 1,000-expression budget (a request that runs out comes back
  // PERMISSION_DENIED, like a refusal). The costliest writes the app can
  // make: a whole month in one write (a back-read), the 31st day added to
  // 30, and two full months in one batch, each by every kind of writer,
  // none with a role on the token, so each reads its role from its trainer
  // document. Written with writesForStudio itself, the guest's writes ran
  // out here (Sep 27 2026); the rule resolves the caller once instead
  // (coverageWriterAllowed), and the measured numbers are beside it.
  it("fits a full month, and two in one batch, inside the rules' budget for every writer", async () => {
    for (const uid of ["guestA", "grantA", "trainerA", "ownerA", "franchiseX", "adminX"]) {
      await testEnv.clearFirestore();
      await seedPeople();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "trainers", "trainerA"), { fullName: "Trainer A", initials: "TA", role: "LifeTransformer", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
        await setDoc(doc(db, "trainers", "ownerA"), { fullName: "Owner A", initials: "OA", role: "StudioOwner", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
      });
      const db = as(uid);
      // A whole month, created in one write.
      await assertSucceeds(add(db, "studioA", "2026-10", daysOf("2026-10", 31)));
      // The 31st day added to 30: the update checks the new list and keeps the old.
      await seed("studioA", "2026-12", daysOf("2026-12", 30));
      await assertSucceeds(add(db, "studioA", "2026-12", ["2026-12-31"]));
      // Two full months in one batch, each adding its 31st day.
      await seed("studioA", "2027-01", daysOf("2027-01", 30));
      await seed("studioA", "2027-03", daysOf("2027-03", 30));
      const b = writeBatch(db);
      b.set(monthRef(db, "studioA", "2027-01"), { days: arrayUnion("2027-01-31") }, { merge: true });
      b.set(monthRef(db, "studioA", "2027-03"), { days: arrayUnion("2027-03-31") }, { merge: true });
      await assertSucceeds(b.commit());
      // And a back-read's first write: two whole months at once.
      const c = writeBatch(db);
      c.set(monthRef(db, "studioA", "2027-05"), { days: arrayUnion(...daysOf("2027-05", 31)) }, { merge: true });
      c.set(monthRef(db, "studioA", "2027-07"), { days: arrayUnion(...daysOf("2027-07", 31)) }, { merge: true });
      await assertSucceeds(c.commit());
    }
  });
});

// ── MARKS ON A TIME (Openings round, Sep 27 2026) ───────────────────────
//
// studios/{s}/openingsMarks/{weekday-HHMM}: a person's word on a time of the
// usual week, "full" (Always full) or "room" (Usually has room), with a short
// note. Anyone who works at the studio (and franchise owners and
// administrators) sets, changes, keeps or removes one, always as themselves
// and at the server's time. The app writes it through
// src/features/openings/ui/marks-store.ts (`markForWrite` in marks.ts).
// docs/rounds/2026-09-27-openings.md, "Marks: how a person disagrees".
describe("marks on a time", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const markRef = (db: ReturnType<typeof as>, studioId: string, key: string) => doc(db, "studios", studioId, "openingsMarks", key);
  /** What the app writes: the time, the word, the note when there is one, who, and the server's time. */
  const mark = (uid: string, over: Record<string, unknown> = {}) => ({
    weekday: 1,
    time: "08:00",
    mark: "full",
    note: "The rotation's regulars",
    by: { id: uid, name: `Person ${uid}` },
    at: serverTimestamp(),
    ...over,
  });
  const without = (data: Record<string, unknown>, key: string) => {
    const out = { ...data };
    delete out[key];
    return out;
  };
  const seedMark = (studioId: string, key: string, data: Record<string, unknown>) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", studioId, "openingsMarks", key), data);
    });
  /** Owner A's mark on Monday 8:00, set two months ago: the one a colleague changes, keeps or removes. */
  const seedOld = (studioId = "studioA") =>
    seedMark(studioId, "1-0800", {
      weekday: 1,
      time: "08:00",
      mark: "full",
      note: "Always taken",
      by: { id: "ownerA", name: "Owner A" },
      at: new Date("2026-07-20T12:00:00Z"),
    });

  // Every kind of person the docs name, seeded only where a test needs them.
  // None has a role claim on the token, so each reads its role from its
  // trainer document: the costliest path through the rules.
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      // The franchise partition (Oct 2026): the franchise owner OF studio A.
      await person("franchiseX", "FranchiseOwner", "studioB", { ownedStudioIds: ["studioA"] });
      await person("adminX", "Admin", "studioB");
      await person("headA", "HeadTrainer", "studioA");
      await person("leaderA", "StudioLeader", "studioA");
      await person("guestA", "LifeTransformer", "studioB", { activeGuestStudioIds: ["studioA"] });
      await person("grantA", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
      await person("headB", "HeadTrainer", "studioB");
    });
  }

  it("lets a trainer at the studio set a mark, read the studio's marks, change it and remove it", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA")));
    const snap = await assertSucceeds(getDoc(markRef(db, "studioA", "1-0800")));
    expect(snap.data()?.mark).toBe("full");
    await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
    // Changed to the other word, the note taken out: the write replaces the mark.
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), without(mark("trainerA", { mark: "room" }), "note")));
    await assertSucceeds(deleteDoc(markRef(db, "studioA", "1-0800")));
  });

  it("lets anyone who works there change, keep or remove a colleague's mark, signing it as themselves", async () => {
    const db = as("trainerA");
    // Keep at the review: the same word and note, signed again by the person keeping it, today.
    await seedOld();
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { note: "Always taken" })));
    // Changed by a colleague.
    await seedOld();
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { mark: "room", note: "Two regulars moved to 7:00" })));
    // Removed by a colleague.
    await seedOld();
    await assertSucceeds(deleteDoc(markRef(db, "studioA", "1-0800")));
  });

  it("never lets a mark be written in someone else's name, or left signed by its old author", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { by: { id: "ownerA", name: "Owner A" } })));
    // A colleague's mark, changed but still carrying their name and date.
    await seedOld();
    await assertFails(updateDoc(markRef(db, "studioA", "1-0800"), { mark: "room" }));
    await assertFails(updateDoc(markRef(db, "studioA", "1-0800"), { note: "Changed under their name", at: serverTimestamp() }));
    // A change that signs it again is theirs to make.
    await assertSucceeds(updateDoc(markRef(db, "studioA", "1-0800"), { mark: "room", by: { id: "trainerA", name: "Trainer A" }, at: serverTimestamp() }));
  });

  it("never lets a mark be backdated or dated ahead", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2026-01-01T12:00:00Z") })));
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2030-01-01T12:00:00Z") })));
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: "today" })));
    // Kept, but backdated so it stays fresh for longer.
    await seedOld();
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2026-07-20T12:00:00Z") })));
  });

  it("holds the id to the time the mark is about", async () => {
    const db = as("trainerA");
    const refused: [string, Record<string, unknown>][] = [
      // The id names another time than the fields.
      ["1-0800", { weekday: 2 }],
      ["1-0830", {}],
      ["2-0800", {}],
      ["1-800", { time: "8:00" }],
      ["mon-0800", {}],
      // Not a weekday of the usual week (Sundays are left out), or not one at all.
      ["0-0800", { weekday: 0 }],
      ["7-0800", { weekday: 7 }],
      ["1-0800", { weekday: 1.5 }],
      ["1-0800", { weekday: "1" }],
      // Not a half-hour.
      ["1-0815", { time: "08:15" }],
      ["1-2400", { time: "24:00" }],
      ["1-0800", { time: 800 }],
    ];
    for (const [key, over] of refused) {
      await assertFails(setDoc(markRef(db, "studioA", key), mark("trainerA", over)));
    }
    // The last half-hour of a Saturday is a time like any other.
    await assertSucceeds(setDoc(markRef(db, "studioA", "6-2330"), mark("trainerA", { weekday: 6, time: "23:30" })));
  });

  it("holds the mark's shape", async () => {
    const db = as("trainerA");
    const refused: Record<string, unknown>[] = [
      mark("trainerA", { mark: "closed" }),
      mark("trainerA", { mark: "a regular" }),
      mark("trainerA", { note: "x".repeat(201) }),
      mark("trainerA", { note: 42 }),
      mark("trainerA", { note: null }),
      mark("trainerA", { by: "trainerA" }),
      mark("trainerA", { by: { id: "trainerA" } }),
      mark("trainerA", { by: { id: "trainerA", name: "x".repeat(121) } }),
      mark("trainerA", { by: { id: "trainerA", name: "Trainer A", role: "Admin" } }),
      // Nothing about a client, and nothing else beside the mark.
      mark("trainerA", { clientName: "Judy Smith" }),
      mark("trainerA", { expiresOn: "2026-12-01" }),
      without(mark("trainerA"), "by"),
      without(mark("trainerA"), "at"),
      without(mark("trainerA"), "mark"),
      without(mark("trainerA"), "weekday"),
      without(mark("trainerA"), "time"),
    ];
    for (const data of refused) {
      await assertFails(setDoc(markRef(db, "studioA", "1-0800"), data));
    }
    // A note of exactly 200 characters, and no note at all, are both fine.
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { note: "x".repeat(200) })));
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), without(mark("trainerA"), "note")));
  });

  it("refuses a trainer or a leader from another studio, reading or writing, and anyone signed out", async () => {
    await seedPeople();
    await seedOld();
    for (const uid of ["trainerB", "headB"]) {
      const elsewhere = as(uid);
      await assertFails(getDoc(markRef(elsewhere, "studioA", "1-0800")));
      await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "openingsMarks")));
      await assertFails(setDoc(markRef(elsewhere, "studioA", "1-0800"), mark(uid)));
      await assertFails(setDoc(markRef(elsewhere, "studioA", "2-0800"), mark(uid, { weekday: 2 })));
      await assertFails(deleteDoc(markRef(elsewhere, "studioA", "1-0800")));
    }
    const out = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(markRef(out, "studioA", "1-0800")));
    await assertFails(setDoc(markRef(out, "studioA", "2-0800"), mark("nobody", { weekday: 2 })));
    await assertFails(deleteDoc(markRef(out, "studioA", "1-0800")));
    // Their own studio's marks are theirs.
    await assertSucceeds(setDoc(markRef(as("trainerB"), "studioB", "1-0800"), mark("trainerB")));
  });

  // Who: a trainer, the studio's leaders (a studio owner, a head trainer, a
  // studio leader, a trainer with the grant), a guest trainer, a franchise
  // owner and an administrator, each on create, update and delete.
  it("lets everyone who works there, runs it, or is above it set, change and remove a mark", async () => {
    await seedPeople();
    for (const uid of ["trainerA", "ownerA", "headA", "leaderA", "grantA", "guestA", "franchiseX", "adminX"]) {
      const db = as(uid);
      await assertSucceeds(setDoc(markRef(db, "studioA", "3-1030"), mark(uid, { weekday: 3, time: "10:30" })));
      await assertSucceeds(setDoc(markRef(db, "studioA", "3-1030"), mark(uid, { weekday: 3, time: "10:30", mark: "room" })));
      await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
      await assertSucceeds(deleteDoc(markRef(db, "studioA", "3-1030")));
    }
  });

  it("follows Demo Mode's own rule: everyone signed in has the run of the practice studio", async () => {
    const db = as("trainerB");
    await assertSucceeds(setDoc(markRef(db, "demo-studio", "1-0800"), mark("trainerB")));
    await assertSucceeds(getDocs(collection(db, "studios", "demo-studio", "openingsMarks")));
    await assertSucceeds(deleteDoc(markRef(db, "demo-studio", "1-0800")));
  });

  // The 1,000-expression budget (a request that runs out comes back
  // PERMISSION_DENIED, like a refusal). The costliest marks the app writes:
  // the longest note and name, over a colleague's mark that already holds
  // both (an update checks the new document whole), by every kind of writer,
  // none with a role on the token; a new mark; a removal; and the read of the
  // whole collection.
  it("fits the fullest mark, set, changed and removed, inside the rules' budget for every writer", async () => {
    await seedPeople();
    for (const uid of ["guestA", "grantA", "headA", "leaderA", "trainerA", "ownerA", "franchiseX", "adminX"]) {
      const db = as(uid);
      const fullest = mark(uid, { weekday: 6, time: "19:30", mark: "room", note: "y".repeat(200), by: { id: uid, name: "n".repeat(120) } });
      await seedMark("studioA", "6-1930", {
        weekday: 6,
        time: "19:30",
        mark: "full",
        note: "z".repeat(200),
        by: { id: "ownerA", name: "o".repeat(120) },
        at: new Date("2026-07-20T12:00:00Z"),
      });
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-1930"), fullest));
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-1930"), { ...fullest, mark: "full" }));
      await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
      await assertSucceeds(deleteDoc(markRef(db, "studioA", "6-1930")));
      // A new mark on a time nobody has marked.
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-0530"), mark(uid, { weekday: 6, time: "05:30", note: "q".repeat(200) })));
    }
  });

  // -- THE STUDIO SETTINGS (Sep 28 2026, AJ: "let the admins assign the
  // default within the app"): Max Strength's defaults are administrators',
  // a studio's own are its leaders', and each document holds one `values`
  // map, who saved it and when.
  describe("the studio settings", () => {
    const settingsBy = (uid: string, values: Record<string, unknown>) => ({
      values,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    async function seedSettingsAdmin() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "trainers", "adminX"), {
          fullName: "Admin X",
          initials: "AX",
          role: "Admin",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
      });
    }

    it("lets only an administrator set Max Strength's defaults, and everyone signed in read them", async () => {
      await seedSettingsAdmin();
      const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
      await assertSucceeds(setDoc(doc(admin, "system", "studioDefaults"), settingsBy("adminX", { quietFloorSessions: 3 })));
      await assertSucceeds(getDoc(doc(trainer, "system", "studioDefaults")));
      await assertFails(setDoc(doc(trainer, "system", "studioDefaults"), settingsBy("trainerA", { quietFloorSessions: 1 })));
      await assertFails(setDoc(doc(owner, "system", "studioDefaults"), settingsBy("ownerA", { quietFloorSessions: 1 })));
      // Signed as someone else, or with anything beside the three fields.
      await assertFails(setDoc(doc(admin, "system", "studioDefaults"), settingsBy("trainerA", { quietFloorSessions: 3 })));
      await assertFails(
        setDoc(doc(admin, "system", "studioDefaults"), { ...settingsBy("adminX", { quietFloorSessions: 3 }), note: "extra" }),
      );
      await assertFails(deleteDoc(doc(admin, "system", "studioDefaults")));
    });

    it("lets a studio's leaders set its own settings, and the people who work there read them", async () => {
      const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
      const ref = (db: typeof owner, studio: string) => doc(db, "studios", studio, "config", "settings");
      await assertSucceeds(setDoc(ref(owner, "studioA"), settingsBy("ownerA", { lapsedDays: 60 })));
      await assertSucceeds(setDoc(ref(owner, "studioA"), settingsBy("ownerA", { lapsedDays: 60, quietFloorSessions: 1 }), { merge: true }));
      await assertSucceeds(getDoc(ref(trainer, "studioA")));
      await assertFails(getDoc(ref(outsider, "studioA")));
      await assertFails(setDoc(ref(trainer, "studioA"), settingsBy("trainerA", { lapsedDays: 30 })));
      await assertFails(setDoc(ref(owner, "studioB"), settingsBy("ownerA", { lapsedDays: 30 })));
      // Any other config document keeps its own rule: nothing but renewals and settings.
      await assertFails(setDoc(doc(owner, "studios", "studioA", "config", "other"), settingsBy("ownerA", {})));
    });
  });

  // WAVE 2 HUB: the Hub's reads for Get to know and All stars (Sep 28 2026,
  // docs/rounds/2026-09-28-hub-2.md). No rule changes: each read rides on
  // the rules as they are, and these pin what the Hub relies on.
  describe("wave 2 hub", () => {
    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

    // WAVE 2 HUB: the Hub's one FORD read, exactly as src/features/ford/hub-read.ts
    // makes it: ONE collection group query, the studio, then the three reasons
    // (an annual day, a one-off day in the strip's two weeks, noted lately).
    // `and` and `or` are imported here, so the file's imports stay as they were.
    const WINDOW = {
      datedFrom: new Date("2026-09-27T04:00:00Z"),
      datedUntil: new Date("2026-10-12T04:00:00Z"),
      notedFrom: new Date("2026-09-14T04:00:00Z"),
    };
    async function hubFordQuery(db: ReturnType<typeof as>, studioId: string | null) {
      const { and, or } = await import("firebase/firestore");
      const reasons = or(
        where("recurrence", "==", "annual"),
        and(where("eventDate", ">=", WINDOW.datedFrom), where("eventDate", "<", WINDOW.datedUntil)),
        where("occurredAt", ">=", WINDOW.notedFrom),
      );
      return studioId === null
        ? query(collectionGroup(db, "ford"), reasons, limit(1000))
        : query(collectionGroup(db, "ford"), and(where("studioId", "==", studioId), reasons), limit(1000));
    }

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        // WAVE 2 HUB: an administrator at another studio, and the grant at studio A.
        await setDoc(doc(db, "trainers", "adminHub"), {
          fullName: "Admin Hub",
          initials: "AH",
          role: "Admin",
          primaryHomeStudioId: "studioB",
          accessibleStudioIds: ["studioB"],
        });
        await setDoc(doc(db, "trainers", "grantedHub"), {
          fullName: "Granted Hub",
          initials: "GH",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioB",
          accessibleStudioIds: ["studioB"],
          managedStudioIds: ["studioA"],
        });
        const detail = (clientId: string, studioId: string, over: Record<string, unknown> = {}) => ({
          clientId,
          studioId,
          pillar: "family",
          body: "A detail",
          isPinned: false,
          eventDate: null,
          recurrence: "none",
          occurredAt: new Date("2026-06-01T14:00:00Z"),
          authorId: "trainerA",
          isArchived: false,
          ...over,
        });
        const ford = (clientId: string, id: string) => doc(db, "clients", clientId, "ford", id);
        await setDoc(ford("clientHubA", "annual"), detail("clientHubA", "studioA", { recurrence: "annual", eventDate: new Date("2019-10-01T04:00:00Z") }));
        await setDoc(ford("clientHubA", "dated"), detail("clientHubA", "studioA", { eventDate: new Date("2026-10-03T04:00:00Z") }));
        await setDoc(ford("clientHubA", "news"), detail("clientHubA", "studioA", { occurredAt: new Date("2026-09-25T14:00:00Z") }));
        await setDoc(ford("clientHubA", "standing"), detail("clientHubA", "studioA", { isPinned: true }));
        await setDoc(ford("clientHubA", "past"), detail("clientHubA", "studioA", { eventDate: new Date("2026-08-01T04:00:00Z") }));
        await setDoc(ford("clientHubB", "elsewhere"), detail("clientHubB", "studioB", { recurrence: "annual", eventDate: new Date("2020-10-02T04:00:00Z") }));
      });
    });

    // WAVE 2 HUB: the people who work at the studio (home, the grant),
    // its leaders and administrators may make it; it brings the three
    // reasons and nothing else — not a standing fact, not a past day, not
    // another studio's.
    it("lets the people who work at the studio make the Hub's one FORD read, and it asks only for the three reasons", async () => {
      for (const uid of ["trainerA", "ownerA", "grantedHub", "adminHub"]) {
        const snap = await assertSucceeds(getDocs(await hubFordQuery(as(uid), "studioA")));
        expect(snap.docs.map((d) => d.id).sort()).toEqual(["annual", "dated", "news"]);
      }
    });

    // WAVE 2 HUB: rules are not filters. Another studio's trainer is refused,
    // and so is the read without the studio, even for a trainer who works there.
    it("refuses it to a trainer at another studio, and refuses it without the studio", async () => {
      await assertFails(getDocs(await hubFordQuery(as("trainerB"), "studioA")));
      await assertFails(getDocs(await hubFordQuery(as("trainerA"), null)));
    });

    // WAVE 2 HUB: All stars. The nightly renewals job writes
    // studios/{s}/watch/hubMarks (the Admin SDK, past the rules); the Hub
    // reads it by id. The existing `match /watch/{watchId}` covers it — read
    // by the studio's people, franchise owners and administrators, written
    // by nobody in the app — so no rule was added for it here.
    it("lets the studio's people read its nightly marks, and nobody write them", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", "studioA", "watch", "hubMarks"), {
          allStars: [{ clientId: "clientHubA", weeksWithVisit: 25, perWeek: 2 }],
          computedAt: new Date("2026-09-28T07:10:00Z"),
        });
      });
      const marks = (uid: string) => doc(as(uid), "studios", "studioA", "watch", "hubMarks");
      for (const uid of ["trainerA", "ownerA", "grantedHub", "adminHub"]) {
        await assertSucceeds(getDoc(marks(uid)));
      }
      await assertFails(getDoc(marks("trainerB")));
      await assertFails(setDoc(marks("trainerA"), { allStars: [], computedAt: new Date() }));
      await assertFails(setDoc(marks("adminHub"), { allStars: [], computedAt: new Date() }));
    });
  });

  // -- WAVE 2 ADMINS (the Admins room's second wave, Sep 28 2026; AJ "all
  // yes" to its new data): the Activity record, a studio's setup checklist,
  // a reply on a bug report, and Home's Take it / Snooze / Dismiss.
  // docs/rounds/2026-09-28-admins-2.md.
  describe("wave 2 admins", () => {
    const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

    // Nobody here has a role claim on the token, so every role is read from
    // the trainer document: the costliest path through the rules.
    async function seedWave2People() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
          setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
        await person("adminW", "Admin", "studioA");
        await person("founderW", "Founder", "studioB");
        await person("franchiseW", "FranchiseOwner", "studioB");
        await person("leaderW", "StudioLeader", "studioA");
        await person("grantW", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
      });
    }

    // ---- The Activity record: activity/{id} ------------------------------
    const entry = (uid: string, over: Record<string, unknown> = {}) => ({
      at: serverTimestamp(),
      by: { uid, name: `Person ${uid}` },
      studioId: "studioA",
      kind: "assisted-change",
      what: "Changed Studio A's phone.",
      before: { Phone: null },
      after: { Phone: "440-555-0101" },
      ...over,
    });

    it("lets an administrator add a signed entry to the Activity record, and nobody else", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertSucceeds(addDoc(collection(admin, "activity"), entry("adminW")));
      await assertSucceeds(addDoc(collection(ctx("founderW"), "activity"), entry("founderW", { studioId: null, kind: "admin-grant", what: "Made Owner A a System Administrator (was Studio Owner)." })));
      // A company entry with no before or after.
      await assertSucceeds(addDoc(collection(admin, "activity"), { at: serverTimestamp(), by: { uid: "adminW", name: "Admin W" }, studioId: null, kind: "setting-default", what: "Set Max Strength's default for A quiet floor to 3." }));
      // Everyone below an administrator is refused, a studio's leader included.
      for (const uid of ["trainerA", "ownerA", "leaderW", "grantW", "franchiseW"]) {
        await assertFails(addDoc(collection(ctx(uid), "activity"), entry(uid)));
      }
    });

    it("refuses an entry signed as someone else, backdated, of an unknown kind, or with fields of its own", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { by: { uid: "founderW", name: "Founder W" } })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { at: new Date("2026-09-01T12:00:00Z") })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { kind: "gossip" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { what: "" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { note: "extra" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { studioId: 42 })));
      // studioId is always said: a studio's id, or null for the company.
      const noStudio: Record<string, unknown> = { ...entry("adminW") };
      delete noStudio.studioId;
      await assertFails(addDoc(collection(admin, "activity"), noStudio));
    });

    it("keeps the Activity record append-only: no edit and no delete, for anyone", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "activity", "a1"), { ...entry("adminW"), at: new Date() });
      });
      const admin = ctx("adminW");
      await assertFails(updateDoc(doc(admin, "activity", "a1"), { what: "Changed nothing." }));
      await assertFails(deleteDoc(doc(admin, "activity", "a1")));
      await assertFails(deleteDoc(doc(ctx("founderW"), "activity", "a1")));
    });

    it("lets administrators read the whole record, and a studio's leaders only their own studio's entries", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "activity", "atA"), { ...entry("adminW"), at: new Date() });
        await setDoc(doc(db, "activity", "atB"), { ...entry("adminW", { studioId: "studioB", what: "Changed Studio B's phone." }), at: new Date() });
        await setDoc(doc(db, "activity", "grant"), { ...entry("adminW", { studioId: null, kind: "admin-grant", what: "Made Leader W a System Administrator (was Studio Leader)." }), at: new Date() });
      });
      const admin = ctx("adminW");
      await assertSucceeds(getDoc(doc(admin, "activity", "grant")));
      await assertSucceeds(getDocs(query(collection(admin, "activity"), where("kind", "in", ["admin-grant", "assisted-change"]), orderBy("at", "desc"), limit(100))));
      await assertSucceeds(getDocs(query(collection(admin, "activity"), where("studioId", "==", "studioB"), orderBy("at", "desc"), limit(50))));
      // Studio A's leaders: a leader role at home, a studio owner, the grant.
      for (const uid of ["leaderW", "ownerA", "grantW"]) {
        const db = ctx(uid);
        await assertSucceeds(getDoc(doc(db, "activity", "atA")));
        await assertSucceeds(getDocs(query(collection(db, "activity"), where("studioId", "==", "studioA"), orderBy("at", "desc"), limit(50))));
        await assertFails(getDoc(doc(db, "activity", "atB")));
        await assertFails(getDoc(doc(db, "activity", "grant")));
        await assertFails(getDocs(query(collection(db, "activity"), where("studioId", "==", "studioB"), orderBy("at", "desc"), limit(50))));
        await assertFails(getDocs(query(collection(db, "activity"), where("kind", "in", ["admin-grant"]), orderBy("at", "desc"), limit(100))));
      }
      // A trainer who works there reads none of it.
      await assertFails(getDoc(doc(ctx("trainerA"), "activity", "atA")));
      await assertFails(getDocs(query(collection(ctx("trainerA"), "activity"), where("studioId", "==", "studioA"), orderBy("at", "desc"), limit(50))));
      // A franchise owner reads their own studio's Activity, as its leaders
      // do (the franchise partition): franchiseW's home is B.
      await assertSucceeds(getDoc(doc(ctx("franchiseW"), "activity", "atB")));
      await assertFails(getDoc(doc(ctx("franchiseW"), "activity", "atA")));
    });

    // ---- Opening a studio: its stage, its opening day, studios/{s}/setupItems
    const item = (uid: string | null, over: Record<string, unknown> = {}) => ({
      block: "floor",
      title: "Each unit's name and starting settings checked",
      dueOn: "2026-11-03",
      doneAt: uid ? serverTimestamp() : null,
      doneBy: uid ? { uid, name: `Person ${uid}` } : null,
      ...over,
    });
    const itemRef = (db: ReturnType<typeof ctx>, studioId: string, id: string) => doc(db, "studios", studioId, "setupItems", id);

    it("lets an administrator set a studio's stage and opening day, the studio rule unchanged", async () => {
      await seedWave2People();
      await assertSucceeds(updateDoc(doc(ctx("adminW"), "studios", "studioA"), { stage: "setting-up", openingDay: "2027-01-12" }));
      await assertSucceeds(updateDoc(doc(ctx("adminW"), "studios", "studioA"), { stage: deleteField(), openingDay: deleteField() }));
      await assertFails(updateDoc(doc(ctx("trainerA"), "studios", "studioA"), { stage: "running" }));
    });

    it("lets an administrator tick, skip, add and remove setup items, signed as themselves", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      // Ticked, then skipped with a reason, then put back (a template item's document removed).
      await assertSucceeds(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW")));
      await assertSucceeds(setDoc(itemRef(admin, "studioA", "staff-linked"), item("adminW", { block: "people", title: "Everyone on the team linked to Mindbody staff", doneAt: null, skipReason: "Two trainers aren't on Mindbody yet." })));
      await assertSucceeds(deleteDoc(itemRef(admin, "studioA", "staff-linked")));
      // An item an administrator adds, with no due date.
      await assertSucceeds(setDoc(itemRef(admin, "studioA", "custom-k2x9ab"), item(null, { block: "first-week", title: "Order the chalk", dueOn: null })));
      // Another administrator edits a ticked item and keeps who ticked it.
      await assertSucceeds(setDoc(itemRef(ctx("founderW"), "studioA", "floor-names"), { ...item("adminW"), doneAt: new Date(), dueOn: "2026-11-10" }));
      await assertSucceeds(deleteDoc(itemRef(admin, "studioA", "custom-k2x9ab")));
    });

    it("refuses a setup item signed as someone else, in a block that isn't one, or with fields of its own", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("founderW")));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { block: "the-bar" })));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { owner: "adminW" })));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { dueOn: "next week" })));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { title: "" })));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { skipReason: "" })));
      await assertFails(setDoc(itemRef(admin, "studioA", "floor-names"), item("adminW", { skipReason: "s".repeat(201) })));
    });

    it("lets a studio's leaders read its checklist, and nobody else below an administrator write or read it", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", "studioA", "setupItems", "floor-names"), { ...item("adminW"), doneAt: new Date() });
        await setDoc(doc(context.firestore(), "studios", "studioB", "setupItems", "floor-names"), { ...item("adminW"), doneAt: new Date() });
      });
      for (const uid of ["leaderW", "ownerA", "grantW"]) {
        const db = ctx(uid);
        await assertSucceeds(getDoc(itemRef(db, "studioA", "floor-names")));
        await assertSucceeds(getDocs(collection(db, "studios", "studioA", "setupItems")));
        await assertFails(getDocs(collection(db, "studios", "studioB", "setupItems")));
        await assertFails(setDoc(itemRef(db, "studioA", "floor-names"), item(uid)));
        await assertFails(deleteDoc(itemRef(db, "studioA", "floor-names")));
      }
      await assertFails(getDocs(collection(ctx("trainerA"), "studios", "studioA", "setupItems")));
      await assertFails(setDoc(itemRef(ctx("franchiseW"), "studioB", "floor-names"), item("franchiseW")));
      await assertSucceeds(getDocs(collection(ctx("adminW"), "studios", "studioB", "setupItems")));
    });

    // ---- A reply on a bug report -----------------------------------------
    async function seedReport(over: Record<string, unknown> = {}) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "bug_reports", "rep1"), {
          userId: "trainerA",
          userName: "Trainer A",
          description: "The timer froze after the Wrap-up.",
          status: "open",
          ...over,
        });
      });
    }
    const reply = (uid: string, over: Record<string, unknown> = {}) => ({ text: "Fixed in today's version.", by: { uid, name: `Person ${uid}` }, at: serverTimestamp(), ...over });

    it("lets an administrator reply to a report, signed and dated, and the reporter read it", async () => {
      await seedWave2People();
      await seedReport();
      const admin = ctx("adminW");
      await assertSucceeds(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("adminW"), status: "fixed" }));
      // A status set later, with the reply untouched.
      await assertSucceeds(updateDoc(doc(ctx("founderW"), "bug_reports", "rep1"), { status: "investigating" }));
      // Replaced by another administrator's reply, signed as them.
      await assertSucceeds(updateDoc(doc(ctx("founderW"), "bug_reports", "rep1"), { reply: reply("founderW", { text: "Looking again." }) }));
      const mine = await assertSucceeds(getDoc(doc(ctx("trainerA"), "bug_reports", "rep1")));
      expect(mine.data()?.reply?.text).toBe("Looking again.");
      await assertFails(getDoc(doc(ctx("trainerB"), "bug_reports", "rep1")));
      await assertSucceeds(deleteDoc(doc(admin, "bug_reports", "rep1")));
    });

    it("refuses a reply signed as someone else, backdated, empty or too long, and any reply but an administrator's", async () => {
      await seedWave2People();
      await seedReport();
      const admin = ctx("adminW");
      await assertFails(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("founderW") }));
      await assertFails(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("adminW", { at: new Date("2026-09-01T12:00:00Z") }) }));
      await assertFails(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("adminW", { text: "" }) }));
      await assertFails(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("adminW", { text: "x".repeat(1001) }) }));
      await assertFails(updateDoc(doc(admin, "bug_reports", "rep1"), { reply: reply("adminW", { cc: "everyone" }) }));
      // The reporter, and a studio's leader, never write one.
      await assertFails(updateDoc(doc(ctx("trainerA"), "bug_reports", "rep1"), { reply: reply("trainerA") }));
      await assertFails(updateDoc(doc(ctx("leaderW"), "bug_reports", "rep1"), { reply: reply("leaderW") }));
      // And a report is never filed with a reply already on it.
      await assertFails(setDoc(doc(ctx("trainerB"), "bug_reports", "rep2"), { userId: "trainerB", description: "x", status: "open", reply: reply("trainerB") }));
      await assertSucceeds(setDoc(doc(ctx("trainerB"), "bug_reports", "rep3"), { userId: "trainerB", description: "x", status: "open" }));
    });

    // ---- Home's Take it / Snooze / Dismiss: adminHome/{itemKey} -------------
    const mark = (uid: string, over: Record<string, unknown> = {}) => ({ state: "taken", by: { uid, name: `Person ${uid}` }, at: serverTimestamp(), ...over });
    const markRef = (db: ReturnType<typeof ctx>, key: string) => doc(db, "adminHome", key);

    it("lets an administrator take, snooze and dismiss a Home item, signed as themselves, and clear it", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertSucceeds(setDoc(markRef(admin, "bugs--1x2y3z"), mark("adminW")));
      await assertSucceeds(setDoc(markRef(ctx("founderW"), "bugs--1x2y3z"), mark("founderW", { state: "snoozed", until: "2026-09-29" })));
      await assertSucceeds(setDoc(markRef(admin, "limbo--9q8w7e"), mark("adminW", { state: "dismissed", reason: "Someone else has it" })));
      await assertSucceeds(getDocs(collection(admin, "adminHome")));
      await assertSucceeds(deleteDoc(markRef(admin, "bugs--1x2y3z")));
    });

    it("refuses a snooze with no day, a dismiss with no reason, a mark in someone else's name or backdated", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { state: "snoozed" })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { state: "snoozed", until: "tomorrow" })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { state: "dismissed" })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { state: "dismissed", reason: "" })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("founderW")));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { at: new Date("2026-09-01T12:00:00Z") })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { state: "ignored" })));
      await assertFails(setDoc(markRef(admin, "bugs--a"), mark("adminW", { note: "extra" })));
    });

    it("keeps Home's marks to administrators: nobody else reads or writes them", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "adminHome", "bugs--1x2y3z"), { state: "taken", by: { uid: "adminW", name: "Admin W" }, at: new Date() });
      });
      for (const uid of ["trainerA", "ownerA", "leaderW", "franchiseW"]) {
        const db = ctx(uid);
        await assertFails(getDoc(markRef(db, "bugs--1x2y3z")));
        await assertFails(getDocs(collection(db, "adminHome")));
        await assertFails(setDoc(markRef(db, "bugs--other"), mark(uid)));
        await assertFails(deleteDoc(markRef(db, "bugs--1x2y3z")));
      }
    });
  });

  // -- WAVE 2 OPERATIONS (Sep 28 2026; AJ: "all yes"). Each part of the
  // wave's Operations data, written the way the app writes it, by every kind
  // of person the rules name. Nobody here has a role claim on the token, so
  // each reads its role from its trainer document: the costliest path.
  describe("wave 2 operations", () => {
    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
    type Db = ReturnType<typeof as>;

    async function seedPeople() {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
          setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
        // The franchise partition (Oct 2026): the franchise owner OF studio A.
        await person("franchiseX", "FranchiseOwner", "studioB", { ownedStudioIds: ["studioA"] });
        await person("adminX", "Admin", "studioB");
        await person("headA", "HeadTrainer", "studioA");
        await person("leaderA", "StudioLeader", "studioA");
        await person("guestA", "LifeTransformer", "studioB", { activeGuestStudioIds: ["studioA"] });
        await person("grantA", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
        await person("headB", "HeadTrainer", "studioB");
      });
    }

    const LEADERS = ["ownerA", "headA", "leaderA", "grantA", "franchiseX", "adminX"];

    // -- A leader's "didn't come" on a booking nobody logged.
    describe("booking marks", () => {
      const markRef = (db: Db, studioId: string, bookingId: string) => doc(db, "studios", studioId, "bookingMarks", bookingId);
      /** What the app writes (attention/booking-marks.ts markDoc). */
      const mark = (uid: string, over: Record<string, unknown> = {}) => ({
        noShow: true,
        clientId: "client-eowyn",
        day: "2026-09-28",
        markedBy: { id: uid, name: `Person ${uid}` },
        markedAt: serverTimestamp(),
        ...over,
      });

      it("lets the studio's leaders, franchise owners and administrators mark, read and take back", async () => {
        await seedPeople();
        for (const uid of LEADERS) {
          const db = as(uid);
          await assertSucceeds(setDoc(markRef(db, "studioA", `b-${uid}`), mark(uid)));
          await assertSucceeds(getDoc(markRef(db, "studioA", `b-${uid}`)));
          await assertSucceeds(getDocs(query(collection(db, "studios", "studioA", "bookingMarks"), where("day", ">=", "2026-09-21"), where("day", "<=", "2026-09-28"))));
          await assertSucceeds(deleteDoc(markRef(db, "studioA", `b-${uid}`)));
        }
      });

      it("lets everyone who works there read the marks and mark a late cancel; only a leader changes another's, and the marker or a leader takes it back (Oct 2 2026)", async () => {
        await seedPeople();
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), "studios", "studioA", "bookingMarks", "b1"), { ...mark("ownerA"), markedAt: new Date() });
        });
        for (const uid of ["trainerA", "guestA"]) {
          const db = as(uid);
          await assertSucceeds(getDoc(markRef(db, "studioA", "b1")));
          await assertSucceeds(getDocs(collection(db, "studios", "studioA", "bookingMarks")));
          // Anyone at the studio marks a late cancel, signed as themselves...
          await assertSucceeds(setDoc(markRef(db, "studioA", `b2-${uid}`), mark(uid)));
          // ...and never as someone else.
          await assertFails(setDoc(markRef(db, "studioA", `b3-${uid}`), mark("ownerA")));
          // A leader's mark is the leader's: not changed, not taken back.
          await assertFails(setDoc(markRef(db, "studioA", "b1"), mark(uid)));
          await assertFails(deleteDoc(markRef(db, "studioA", "b1")));
          // Their own slip, they take back.
          await assertSucceeds(deleteDoc(markRef(db, "studioA", `b2-${uid}`)));
        }
        // A leader takes back anyone's.
        await assertSucceeds(setDoc(markRef(as("trainerA"), "studioA", "b4"), mark("trainerA")));
        await assertSucceeds(deleteDoc(markRef(as("leaderA"), "studioA", "b4")));
        for (const uid of ["trainerB", "headB"]) {
          const db = as(uid);
          await assertFails(getDoc(markRef(db, "studioA", "b1")));
          await assertFails(setDoc(markRef(db, "studioA", "b2"), mark(uid)));
          await assertFails(deleteDoc(markRef(db, "studioA", "b1")));
        }
        const out = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(markRef(out, "studioA", "b1")));
      });

      it("holds the mark's shape, and signs it as the person marking, now", async () => {
        const db = as("ownerA");
        const refused: Record<string, unknown>[] = [
          mark("ownerA", { markedBy: { id: "headA", name: "Head A" } }),
          mark("ownerA", { markedBy: { id: "ownerA" } }),
          mark("ownerA", { markedBy: { id: "ownerA", name: "x".repeat(121) } }),
          mark("ownerA", { markedBy: { id: "ownerA", name: "Owner A", role: "Admin" } }),
          mark("ownerA", { noShow: false }),
          mark("ownerA", { noShow: "yes" }),
          mark("ownerA", { clientId: "" }),
          mark("ownerA", { clientId: 7 }),
          mark("ownerA", { day: "28/09/2026" }),
          mark("ownerA", { day: "2026-13-01" }),
          mark("ownerA", { markedAt: new Date("2026-01-01T12:00:00Z") }),
          mark("ownerA", { note: "she texted" }),
          { noShow: true, clientId: "client-eowyn", day: "2026-09-28", markedBy: { id: "ownerA", name: "Owner A" } },
        ];
        for (const data of refused) await assertFails(setDoc(markRef(db, "studioA", "b1"), data));
        await assertSucceeds(setDoc(markRef(db, "studioA", "b1"), mark("ownerA")));
      });

      it("follows Demo Mode's rule: everyone signed in leads the practice studio", async () => {
        const db = as("trainerB");
        await assertSucceeds(setDoc(markRef(db, "demo-studio", "b1"), mark("trainerB")));
        await assertSucceeds(deleteDoc(markRef(db, "demo-studio", "b1")));
      });
    });

    // -- A client's case: the leaders' to open and run; its owner may change
    // the next step, the due day, the outcome and the reason.
    describe("cases", () => {
      const caseRef = (db: Db, studioId: string, clientId: string) => doc(db, "studios", studioId, "cases", clientId);
      /** What the app writes when a leader opens a case (journey/case-store.ts newCaseDoc). */
      const opened = (uid: string, over: Record<string, unknown> = {}) => ({
        clientId: "eowyn",
        clientName: "Éowyn Rohan",
        owner: { id: "trainerA", name: "Trainer A" },
        nextStep: "Phone her after Thursday's shift.",
        dueOn: "2026-10-01",
        outcome: "open",
        openedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...over,
      });
      /** A case a leader opened last week, owned by Trainer A. */
      const seedCase = (studioId = "studioA", over: Record<string, unknown> = {}) =>
        testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), "studios", studioId, "cases", "eowyn"), {
            clientId: "eowyn",
            clientName: "Éowyn Rohan",
            owner: { id: "trainerA", name: "Trainer A" },
            nextStep: "Ask Trainer A",
            dueOn: "2026-09-30",
            outcome: "open",
            openedAt: new Date("2026-09-21T12:00:00Z"),
            updatedAt: new Date("2026-09-21T12:00:00Z"),
            updatedBy: "ownerA",
            ...over,
          });
        });
      /** Only what changed, stamped (case-store.ts saveCase). */
      const stamped = (uid: string, over: Record<string, unknown>) => ({ ...over, updatedAt: serverTimestamp(), updatedBy: uid });

      it("lets the studio's leaders, franchise owners and administrators open, read, change and reopen a case", async () => {
        await seedPeople();
        for (const uid of LEADERS) {
          const db = as(uid);
          await assertSucceeds(setDoc(caseRef(db, "studioA", "eowyn"), opened(uid)));
          await assertSucceeds(getDoc(caseRef(db, "studioA", "eowyn")));
          await assertSucceeds(getDocs(collection(db, "studios", "studioA", "cases")));
          // Hand it to someone else, close it with a reason, and take the reason back out.
          await assertSucceeds(updateDoc(caseRef(db, "studioA", "eowyn"), stamped(uid, { owner: { id: "headA", name: "Head A" } })));
          await assertSucceeds(updateDoc(caseRef(db, "studioA", "eowyn"), stamped(uid, { outcome: "lost", reason: "Moved to Minas Tirith" })));
          await assertSucceeds(updateDoc(caseRef(db, "studioA", "eowyn"), stamped(uid, { outcome: "paused", reason: deleteField() })));
          // Reopened: a new owner, step and openedAt.
          await assertSucceeds(setDoc(caseRef(db, "studioA", "eowyn"), opened(uid, { owner: { id: "trainerA", name: "Trainer A" } })));
          await assertFails(deleteDoc(caseRef(db, "studioA", "eowyn")));
        }
      });

      it("lets the case's owner read theirs, find it by owner.id, and change the step, the day, the outcome and the reason — nothing else", async () => {
        await seedCase();
        const db = as("trainerA");
        await assertSucceeds(getDoc(caseRef(db, "studioA", "eowyn")));
        await assertSucceeds(getDocs(query(collection(db, "studios", "studioA", "cases"), where("owner.id", "==", "trainerA"))));
        await assertSucceeds(getDocs(query(collection(db, "studios", "studioA", "cases"), where("owner.id", "==", "trainerA"), where("outcome", "==", "open"))));
        await assertSucceeds(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("trainerA", { nextStep: "Called her: back Tuesday", dueOn: null })));
        await assertSucceeds(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("trainerA", { outcome: "paused", reason: "Knee surgery, back in November" })));
        // Never the owner, the name or when it opened; never unsigned; never a new case; never a delete.
        await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("trainerA", { owner: { id: "trainerB", name: "Trainer B" } })));
        await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("trainerA", { clientName: "Someone else" })));
        await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("trainerA", { openedAt: serverTimestamp() })));
        await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), { nextStep: "unsigned" }));
        await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), stamped("ownerA", { nextStep: "signed as someone else" })));
        await assertFails(setDoc(caseRef(db, "studioA", "faramir"), opened("trainerA", { clientId: "faramir" })));
        await assertFails(deleteDoc(caseRef(db, "studioA", "eowyn")));
      });

      it("keeps a case from anyone else: a colleague who doesn't own it, another studio, or someone signed out", async () => {
        await seedPeople();
        await seedCase();
        for (const uid of ["guestA", "trainerB", "headB"]) {
          const db = as(uid);
          await assertFails(getDoc(caseRef(db, "studioA", "eowyn")));
          await assertFails(getDocs(collection(db, "studios", "studioA", "cases")));
          await assertFails(updateDoc(caseRef(db, "studioA", "eowyn"), stamped(uid, { nextStep: "Mine now" })));
          await assertFails(setDoc(caseRef(db, "studioA", "faramir"), opened(uid, { clientId: "faramir" })));
        }
        // Trainer A reads only their own: not the studio's whole list.
        await assertFails(getDocs(collection(as("trainerA"), "studios", "studioA", "cases")));
        const out = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(caseRef(out, "studioA", "eowyn")));
      });

      it("holds the case's shape", async () => {
        const db = as("ownerA");
        const refused: Record<string, unknown>[] = [
          opened("ownerA", { clientId: "faramir" }),
          opened("ownerA", { clientName: "x".repeat(121) }),
          opened("ownerA", { owner: { id: "", name: "Nobody" } }),
          opened("ownerA", { owner: { id: "trainerA" } }),
          opened("ownerA", { owner: { id: "trainerA", name: "Trainer A", role: "Admin" } }),
          opened("ownerA", { nextStep: "x".repeat(501) }),
          opened("ownerA", { dueOn: "next week" }),
          opened("ownerA", { outcome: "won" }),
          opened("ownerA", { reason: "y".repeat(301) }),
          opened("ownerA", { updatedBy: "trainerA" }),
          opened("ownerA", { updatedAt: new Date("2026-01-01T12:00:00Z") }),
          opened("ownerA", { openedAt: new Date("2026-01-01T12:00:00Z") }),
          opened("ownerA", { notes: "extra" }),
        ];
        for (const data of refused) await assertFails(setDoc(caseRef(db, "studioA", "eowyn"), data));
        await assertSucceeds(setDoc(caseRef(db, "studioA", "eowyn"), opened("ownerA", { dueOn: null, reason: "Asked by the front desk" })));
      });

      it("fits the fullest case inside the rules' budget, for the owner and for every leader", async () => {
        await seedPeople();
        const fullest = { nextStep: "n".repeat(500), dueOn: "2026-12-31", outcome: "paused", reason: "r".repeat(300) };
        await seedCase("studioA", { clientName: "c".repeat(120), owner: { id: "grantA", name: "g".repeat(120) } });
        await assertSucceeds(updateDoc(caseRef(as("grantA"), "studioA", "eowyn"), stamped("grantA", fullest)));
        for (const uid of LEADERS) {
          await assertSucceeds(setDoc(caseRef(as(uid), "studioA", "eowyn"), opened(uid, { ...fullest, clientName: "c".repeat(120), owner: { id: "grantA", name: "g".repeat(120) } })));
        }
      });
    });

    // -- What the nightly job writes: client states and the Journey summary for
    // the studio's leaders; All stars (and the older watch documents) for
    // everyone who works there. Nobody writes any of it from the app.
    describe("the night's states", () => {
      async function seedNight() {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          const db = ctx.firestore();
          await setDoc(doc(db, "studios", "studioA", "clientStates", "eowyn"), { state: "drifting", since: "2026-09-24", reasons: ["a", "b"] });
          await setDoc(doc(db, "studios", "studioA", "watch", "journey"), { v: 1, asOf: "2026-09-28", counts: { drifting: 1 } });
          await setDoc(doc(db, "studios", "studioA", "watch", "hubMarks"), { allStars: [{ clientId: "eomer", weeksWithVisit: 26, perWeek: 2 }] });
          await setDoc(doc(db, "studios", "studioA", "watch", "openings"), { v: 1 });
        });
      }

      it("lets the studio's leaders read the client states and the summary, and nobody write them", async () => {
        await seedPeople();
        await seedNight();
        for (const uid of LEADERS) {
          const db = as(uid);
          await assertSucceeds(getDocs(collection(db, "studios", "studioA", "clientStates")));
          await assertSucceeds(getDoc(doc(db, "studios", "studioA", "watch", "journey")));
          await assertFails(setDoc(doc(db, "studios", "studioA", "clientStates", "eowyn"), { state: "steady" }));
          await assertFails(setDoc(doc(db, "studios", "studioA", "watch", "journey"), { v: 1 }));
        }
      });

      it("keeps the states and the summary from a trainer, while All stars and the other watch documents stay theirs to read", async () => {
        await seedPeople();
        await seedNight();
        for (const uid of ["trainerA", "guestA"]) {
          const db = as(uid);
          await assertFails(getDoc(doc(db, "studios", "studioA", "clientStates", "eowyn")));
          await assertFails(getDocs(collection(db, "studios", "studioA", "clientStates")));
          await assertFails(getDoc(doc(db, "studios", "studioA", "watch", "journey")));
          await assertSucceeds(getDoc(doc(db, "studios", "studioA", "watch", "hubMarks")));
          await assertSucceeds(getDoc(doc(db, "studios", "studioA", "watch", "openings")));
          await assertFails(setDoc(doc(db, "studios", "studioA", "watch", "hubMarks"), { allStars: [] }));
        }
        for (const uid of ["trainerB", "headB"]) {
          await assertFails(getDoc(doc(as(uid), "studios", "studioA", "watch", "hubMarks")));
          await assertFails(getDoc(doc(as(uid), "studios", "studioA", "watch", "journey")));
        }
      });
    });

    // -- The inactive round (Oct 1 2026): a leader's inactive mark. Leaders
    // mark, change and take back; everyone who works there reads.
    describe("inactive marks", () => {
      const markRef = (db: Db, studioId: string, clientId: string) => doc(db, "studios", studioId, "inactiveMarks", clientId);
      /** What the app writes (journey/inactive.ts inactiveMarkDoc). */
      const mark = (uid: string, over: Record<string, unknown> = {}) => ({
        clientId: "eowyn",
        reason: "moved",
        note: "Moved to Denver",
        day: "2026-10-01",
        markedBy: { id: uid, name: `Person ${uid}` },
        markedAt: serverTimestamp(),
        ...over,
      });

      it("lets the studio's leaders, franchise owners and administrators mark, change, read and take back", async () => {
        await seedPeople();
        for (const uid of LEADERS) {
          const db = as(uid);
          await assertSucceeds(setDoc(markRef(db, "studioA", "eowyn"), mark(uid)));
          await assertSucceeds(setDoc(markRef(db, "studioA", "eowyn"), mark(uid, { reason: "cost" })));
          await assertSucceeds(getDoc(markRef(db, "studioA", "eowyn")));
          await assertSucceeds(getDocs(collection(db, "studios", "studioA", "inactiveMarks")));
          await assertSucceeds(deleteDoc(markRef(db, "studioA", "eowyn")));
        }
      });

      it("lets everyone who works there read the marks, and no one but a leader mark or take one back", async () => {
        await seedPeople();
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), "studios", "studioA", "inactiveMarks", "eowyn"), { ...mark("ownerA"), markedAt: new Date() });
        });
        for (const uid of ["trainerA", "guestA"]) {
          const db = as(uid);
          await assertSucceeds(getDoc(markRef(db, "studioA", "eowyn")));
          await assertSucceeds(getDocs(collection(db, "studios", "studioA", "inactiveMarks")));
          await assertFails(setDoc(markRef(db, "studioA", "theodred"), mark(uid, { clientId: "theodred" })));
          await assertFails(setDoc(markRef(db, "studioA", "eowyn"), mark(uid)));
          await assertFails(deleteDoc(markRef(db, "studioA", "eowyn")));
        }
        // A leader of another studio is a stranger here.
        for (const uid of ["trainerB", "headB"]) {
          const db = as(uid);
          await assertFails(getDoc(markRef(db, "studioA", "eowyn")));
          await assertFails(getDocs(collection(db, "studios", "studioA", "inactiveMarks")));
          await assertFails(setDoc(markRef(db, "studioA", "theodred"), mark(uid, { clientId: "theodred" })));
          await assertFails(deleteDoc(markRef(db, "studioA", "eowyn")));
        }
        const out = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(markRef(out, "studioA", "eowyn")));
      });

      it("holds the mark's shape, and signs it as the person marking, now", async () => {
        const db = as("ownerA");
        const refused: Record<string, unknown>[] = [
          mark("ownerA", { markedBy: { id: "headA", name: "Head A" } }),
          mark("ownerA", { markedBy: { id: "ownerA" } }),
          mark("ownerA", { markedBy: { id: "ownerA", name: "x".repeat(121) } }),
          mark("ownerA", { reason: "bored" }),
          mark("ownerA", { reason: "" }),
          mark("ownerA", { note: "" }),
          mark("ownerA", { note: "x".repeat(301) }),
          mark("ownerA", { note: 7 }),
          mark("ownerA", { clientId: "theodred" }),
          mark("ownerA", { day: "10/01/2026" }),
          mark("ownerA", { day: "2026-13-01" }),
          mark("ownerA", { markedAt: new Date("2026-01-01T12:00:00Z") }),
          mark("ownerA", { state: "inactive" }),
          { clientId: "eowyn", reason: "moved", day: "2026-10-01", markedBy: { id: "ownerA", name: "Owner A" } },
        ];
        for (const data of refused) await assertFails(setDoc(markRef(db, "studioA", "eowyn"), data));
        await assertSucceeds(setDoc(markRef(db, "studioA", "eowyn"), mark("ownerA")));
        const { note: _note, ...withoutNote } = mark("ownerA");
        await assertSucceeds(setDoc(markRef(db, "studioA", "eowyn"), withoutNote));
      });

      it("follows Demo Mode's rule: everyone signed in leads the practice studio", async () => {
        const db = as("trainerB");
        await assertSucceeds(setDoc(markRef(db, "demo-studio", "eowyn"), mark("trainerB")));
        await assertSucceeds(deleteDoc(markRef(db, "demo-studio", "eowyn")));
      });
    });
  });

  // -- WAVE 2 CODEX (Sep 28 2026; AJ approved the Machine Codex's new data
  // "all yes"). The model record (machineModels/{id}), the unit's model on a
  // roster entry, a studio removing a safety line only with a reason (the
  // Sep 21 rule), and a catalog machine's change log.
  describe("wave 2 codex", () => {
    async function seedCodexPeople() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "trainers", "adminCodex"), {
          fullName: "Galadriel",
          initials: "GA",
          role: "Admin",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
        await setDoc(doc(db, "studios", "studioA", "roster", "m-leg-press"), {
          machineId: "m-leg-press",
          studioId: "studioA",
          source: "catalog",
          basedOn: "m-leg-press",
          status: "active",
        });
      });
    }

    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    const model = (uid: string, extra: Record<string, unknown> = {}) => ({
      brand: "Hoist",
      model: "ROC-IT Leg Press",
      movementId: "m-leg-press",
      dials: [
        { key: "gap", label: "Gap", letter: "G" },
        { key: "seat-distance", label: "Seat Distance", letter: "S", default: "7" },
      ],
      notes: "An 18 lb accessory stack.",
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      ...extra,
    });

    it("lets an administrator write a model whole, and everyone signed in read it", async () => {
      await seedCodexPeople();
      const admin = as("adminCodex");
      await assertSucceeds(setDoc(doc(admin, "machineModels", "mm-hoist-roc-it-leg-press"), model("adminCodex")));
      // Written again, whole, with the notes and dials taken out.
      const { dials: _d, notes: _n, ...bare } = model("adminCodex");
      await assertSucceeds(setDoc(doc(admin, "machineModels", "mm-hoist-roc-it-leg-press"), bare));
      await assertSucceeds(getDoc(doc(as("trainerA"), "machineModels", "mm-hoist-roc-it-leg-press")));
      await assertSucceeds(getDocs(collection(as("trainerB"), "machineModels")));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "machineModels", "mm-hoist-roc-it-leg-press")));
    });

    it("refuses a model from anyone else, signed as someone else, or outside its shape, and never deletes one", async () => {
      await seedCodexPeople();
      const ref = (db: ReturnType<typeof as>) => doc(db, "machineModels", "mm-hoist-roc-it-leg-press");
      await assertFails(setDoc(ref(as("ownerA")), model("ownerA")));
      await assertFails(setDoc(ref(as("trainerA")), model("trainerA")));
      const admin = as("adminCodex");
      await assertFails(setDoc(ref(admin), model("ownerA")));
      await assertFails(setDoc(ref(admin), model("adminCodex", { colour: "red" })));
      await assertFails(setDoc(ref(admin), model("adminCodex", { movementId: "" })));
      await assertFails(setDoc(ref(admin), model("adminCodex", { brand: "" })));
      await assertFails(
        setDoc(ref(admin), model("adminCodex", { dials: Array.from({ length: 21 }, (_, i) => ({ key: `d${i}`, label: `D${i}` })) })),
      );
      await assertFails(setDoc(ref(admin), model("adminCodex", { notes: "n".repeat(2001) })));
      const { movementId: _m, ...noMovement } = model("adminCodex");
      await assertFails(setDoc(ref(admin), noMovement));
      await assertSucceeds(setDoc(ref(admin), model("adminCodex")));
      await assertFails(deleteDoc(ref(admin)));
    });

    it("lets a studio's leaders name their unit's model, and refuses a model id that is not one", async () => {
      await seedCodexPeople();
      const owner = as("ownerA");
      const entry = doc(owner, "studios", "studioA", "roster", "m-leg-press");
      await assertSucceeds(updateDoc(entry, { modelId: "mm-hoist-roc-it-leg-press" }));
      await assertSucceeds(updateDoc(entry, { modelId: deleteField() }));
      await assertFails(updateDoc(entry, { modelId: "" }));
      await assertFails(updateDoc(entry, { modelId: 42 }));
      await assertFails(updateDoc(entry, { modelId: "m".repeat(101) }));
      // A trainer still cannot write the roster at all.
      await assertFails(updateDoc(doc(as("trainerA"), "studios", "studioA", "roster", "m-leg-press"), { modelId: "mm-hoist-roc-it-leg-press" }));
    });

    // The Sep 21 rule: a studio may take one of the catalog's safety lines
    // off its own copy, and a removed line without a reason is refused.
    const removal = (uid: string, extra: Record<string, unknown> = {}) => ({
      field: "clinicalWarnings",
      line: "Knees never lock out at the end stop.",
      reason: "This unit has no end stop to lock against.",
      by: { uid, name: "Théoden" },
      at: "2026-09-28T15:00:00.000Z",
      ...extra,
    });

    it("lets a studio's leaders take a catalog safety line off their copy only with a reason", async () => {
      await seedCodexPeople();
      const entry = doc(as("ownerA"), "studios", "studioA", "roster", "m-leg-press");
      await assertSucceeds(updateDoc(entry, { overrides: { removedSafety: [removal("ownerA")] } }));
      await assertFails(updateDoc(entry, { overrides: { removedSafety: [removal("ownerA", { reason: "" })] } }));
      await assertFails(updateDoc(entry, { overrides: { removedSafety: [removal("ownerA", { reason: "  x  " })] } }));
      await assertFails(updateDoc(entry, { overrides: { removedSafety: [removal("ownerA", { reason: "r".repeat(301) })] } }));
      const { reason: _r, ...noReason } = removal("ownerA");
      await assertFails(updateDoc(entry, { overrides: { removedSafety: [noReason] } }));
      // A second, good record beside a bad one is still refused.
      await assertFails(
        updateDoc(entry, { overrides: { removedSafety: [removal("ownerA"), removal("ownerA", { line: "Breathe freely.", reason: "" })] } }),
      );
      // An administrator inside the studio follows the same record.
      await assertSucceeds(
        updateDoc(doc(as("adminCodex"), "studios", "studioA", "roster", "m-leg-press"), {
          overrides: { removedSafety: [removal("adminCodex")] },
        }),
      );
      // Putting every line back leaves no record.
      await assertSucceeds(updateDoc(entry, { overrides: {} }));
    });

    it("checks the first ten removed safety lines' reasons, inside the rules' budget", async () => {
      await seedCodexPeople();
      const entry = doc(as("ownerA"), "studios", "studioA", "roster", "m-leg-press");
      const ten = Array.from({ length: 10 }, (_, i) =>
        removal("ownerA", { line: `Warning ${i}`, reason: `Reason ${i}: `.padEnd(300, "y") }),
      );
      // The fullest write the app makes, by a studio owner with no role on the token.
      await assertSucceeds(updateDoc(entry, { modelId: "mm-hoist-roc-it-leg-press", overrides: { removedSafety: ten } }));
      // No count limit since Oct 2 2026 (AJ): an eleventh is not refused for being the eleventh.
      await assertSucceeds(updateDoc(entry, { overrides: { removedSafety: [...ten, removal("ownerA", { line: "Warning 10" })] } }));
      // The tenth place is checked too.
      await assertFails(
        updateDoc(entry, { overrides: { removedSafety: [...ten.slice(0, 9), removal("ownerA", { line: "Warning 9", reason: "" })] } }),
      );
    });

    it("lets an administrator read every studio's copy of a machine for Compare, and nobody else", async () => {
      await seedCodexPeople();
      const byLineage = (db: ReturnType<typeof as>) =>
        getDocs(query(collectionGroup(db, "roster"), where("basedOn", "==", "m-leg-press")));
      await assertSucceeds(byLineage(as("adminCodex")));
      await assertFails(byLineage(as("ownerA")));
      await assertFails(byLineage(as("trainerA")));
    });
  });

  // -- WAVE 2 OF THE MACHINE CATALOG ROOM (Sep 28 2026, AJ: "all yes"):
  // "Standard machine" on a machine's own page (administrators only, the
  // catalog's existing rule), a reason on Out of service, head office's
  // aliases. docs/rounds/2026-09-28-catalog-2.md.
  describe("wave 2 catalog", () => {
    async function seedWave2() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "trainers", "adminW2"), {
          fullName: "Elrond Peredhel",
          initials: "EP",
          role: "Admin",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
        await setDoc(doc(db, "trainers", "leaderA"), {
          fullName: "Glorfindel of the Golden Flower",
          initials: "GG",
          role: "StudioLeader",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
        await setDoc(doc(db, "machines", "m-leg-press"), {
          id: "m-leg-press",
          name: "LEG PRESS",
          status: "active",
          inStandardSet: true,
          defaultOrder: 10,
          schemaVersion: 1,
        });
      });
    }

    const stamp = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

    it("lets only an administrator mark a machine as a standard machine", async () => {
      await seedWave2();
      const admin = testEnv.authenticatedContext("adminW2", { email: "adminw2@test.com" }).firestore();
      const leader = testEnv.authenticatedContext("leaderA", { email: "leadera@test.com" }).firestore();
      const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const machine = (db: typeof admin) => doc(db, "machines", "m-leg-press");
      // A studio's leaders, its owner and its trainers can't set it, either way.
      await assertFails(updateDoc(machine(leader), { inStandardSet: false, ...stamp("leaderA") }));
      await assertFails(updateDoc(machine(owner), { inStandardSet: false, ...stamp("ownerA") }));
      await assertFails(updateDoc(machine(trainer), { inStandardSet: false, ...stamp("trainerA") }));
      await assertFails(setDoc(machine(leader), { inStandardSet: true }, { merge: true }));
      // An administrator takes it out and puts it back.
      await assertSucceeds(updateDoc(machine(admin), { inStandardSet: false, ...stamp("adminW2") }));
      await assertSucceeds(updateDoc(machine(admin), { inStandardSet: true, ...stamp("adminW2") }));
      // Everyone signed in still reads it.
      await assertSucceeds(getDoc(machine(trainer)));
    });

    async function seedRosterEntry() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", "studioA", "roster", "m-leg-press"), {
          machineId: "m-leg-press",
          studioId: "studioA",
          source: "catalog",
          basedOn: "m-leg-press",
          status: "active",
        });
      });
    }

    /** What the floor editor writes to take a machine out of service. */
    const outOfService = (uid: string, reason = "A new cable is on order") => ({
      status: "maintenance",
      outOfService: { reason, by: { uid, name: "Glorfindel of the Golden Flower" }, at: serverTimestamp() },
      ...stamp(uid),
    });

    it("takes a machine out of service with a reason signed by the leader writing it, keeps it through other writes, and takes it off", async () => {
      await seedWave2();
      await seedRosterEntry();
      const leader = testEnv.authenticatedContext("leaderA", { email: "leadera@test.com" }).firestore();
      const entry = doc(leader, "studios", "studioA", "roster", "m-leg-press");
      await assertSucceeds(updateDoc(entry, outOfService("leaderA")));
      // The walking order and any other write leave the record as it was.
      await assertSucceeds(updateDoc(entry, { order: 3, ...stamp("leaderA") }));
      await assertSucceeds(setDoc(entry, { order: 4, updatedAt: serverTimestamp() }, { merge: true }));
      // Back in service: the record comes off with it.
      await assertSucceeds(updateDoc(entry, { status: "active", outOfService: deleteField(), ...stamp("leaderA") }));
      // And a reason as long as the floor editor allows.
      await assertSucceeds(updateDoc(entry, outOfService("leaderA", "x".repeat(140))));
    });

    it("refuses a reason signed as someone else, stamped with another time, empty, too long, or carrying more", async () => {
      await seedWave2();
      await seedRosterEntry();
      const leader = testEnv.authenticatedContext("leaderA", { email: "leadera@test.com" }).firestore();
      const entry = doc(leader, "studios", "studioA", "roster", "m-leg-press");
      await assertFails(updateDoc(entry, outOfService("trainerA")));
      await assertFails(
        updateDoc(entry, {
          status: "maintenance",
          outOfService: { reason: "Cable", by: { uid: "leaderA", name: "Glorfindel" }, at: new Date("2026-09-01T12:00:00Z") },
        }),
      );
      await assertFails(updateDoc(entry, outOfService("leaderA", "")));
      await assertFails(updateDoc(entry, outOfService("leaderA", "x".repeat(141))));
      await assertFails(
        updateDoc(entry, {
          status: "maintenance",
          outOfService: { reason: "Cable", by: { uid: "leaderA", name: "Glorfindel" }, at: serverTimestamp(), note: "more" },
        }),
      );
      await assertFails(
        updateDoc(entry, { status: "maintenance", outOfService: { reason: "Cable", by: { uid: "leaderA" }, at: serverTimestamp() } }),
      );
      // A record made while creating the entry is held to the same.
      await assertFails(
        setDoc(doc(leader, "studios", "studioA", "roster", "m-lumbar"), {
          machineId: "m-lumbar",
          studioId: "studioA",
          source: "catalog",
          basedOn: "m-lumbar",
          ...outOfService("trainerA"),
        }),
      );
      await assertSucceeds(
        setDoc(doc(leader, "studios", "studioA", "roster", "m-lumbar"), {
          machineId: "m-lumbar",
          studioId: "studioA",
          source: "catalog",
          basedOn: "m-lumbar",
          ...outOfService("leaderA"),
        }),
      );
    });

    it("still lets only the studio's leaders and administrators take a machine out of service", async () => {
      await seedWave2();
      await seedRosterEntry();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
      const admin = testEnv.authenticatedContext("adminW2", { email: "adminw2@test.com" }).firestore();
      const entry = (db: typeof admin) => doc(db, "studios", "studioA", "roster", "m-leg-press");
      await assertFails(updateDoc(entry(trainer), outOfService("trainerA")));
      await assertFails(updateDoc(entry(outsider), outOfService("trainerB")));
      await assertSucceeds(updateDoc(entry(admin), outOfService("adminW2")));
    });

    it("lets only an administrator add head office's names to a catalog machine, and everyone read them", async () => {
      await seedWave2();
      const admin = testEnv.authenticatedContext("adminW2", { email: "adminw2@test.com" }).firestore();
      const leader = testEnv.authenticatedContext("leaderA", { email: "leadera@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      await assertFails(updateDoc(doc(leader, "machines", "m-leg-press"), { aliases: arrayUnion("The Sled"), ...stamp("leaderA") }));
      await assertFails(updateDoc(doc(trainer, "machines", "m-leg-press"), { aliases: arrayUnion("The Sled"), ...stamp("trainerA") }));
      await assertSucceeds(updateDoc(doc(admin, "machines", "m-leg-press"), { aliases: arrayUnion("The Sled"), ...stamp("adminW2") }));
      await assertSucceeds(updateDoc(doc(admin, "machines", "m-leg-press"), { aliases: arrayRemove("The Sled"), ...stamp("adminW2") }));
      await assertSucceeds(getDoc(doc(trainer, "machines", "m-leg-press")));
    });
  });

  // -- WAVE 2 RELAY (Sep 28 2026, AJ: "all yes"): the Relay room's second
  // wave. Each block in firestore.rules headed "WAVE 2 RELAY:" is held here.
  describe("wave 2 relay", () => {
    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

    // -- the last-seen marker: studios/{s}/lastSeen/{uid}, the person's own.
    describe("the last-seen marker", () => {
      const marker = () => ({ at: serverTimestamp(), updatedAt: serverTimestamp() });

      it("lets a trainer set and read their own marker, at a studio, and nobody else's", async () => {
        const mine = as("trainerA");
        const ref = doc(mine, "studios", "studioA", "lastSeen", "trainerA");
        await assertSucceeds(setDoc(ref, marker()));
        await assertSucceeds(getDoc(ref));
        await assertSucceeds(setDoc(ref, marker()));
        // Someone else's: neither read nor written, even at their own studio.
        const other = as("trainerB");
        await assertFails(getDoc(doc(other, "studios", "studioA", "lastSeen", "trainerA")));
        await assertFails(setDoc(doc(other, "studios", "studioA", "lastSeen", "trainerA"), marker()));
        await assertFails(getDocs(collection(other, "studios", "studioA", "lastSeen")));
      });

      it("holds the two server times and nothing else", async () => {
        const mine = as("trainerA");
        const ref = doc(mine, "studios", "studioA", "lastSeen", "trainerA");
        await assertFails(setDoc(ref, { at: new Date("2026-01-01T12:00:00Z"), updatedAt: serverTimestamp() }));
        await assertFails(setDoc(ref, { ...marker(), studioId: "studioA" }));
        await assertFails(setDoc(ref, { at: serverTimestamp() }));
      });
    });

    // -- a cover ask keeps its time: `coverAt` on studios/{s}/taskRequests.
    // No rule changed (the ask restricts no keys); held here so a later
    // tightening of that rule remembers the field.
    describe("a cover ask that keeps its time", () => {
      const coverAsk = (over: Record<string, unknown> = {}) => ({
        studioId: "studioA",
        kind: "cover",
        title: "Cover Hamfast Gamgee at 4:00 PM",
        sessionDate: "2026-09-28",
        coverAt: Date.parse("2026-09-28T16:00:00-04:00"),
        dueOn: "2026-09-28",
        createdBy: { id: "trainerA", name: "Trainer A" },
        createdAt: serverTimestamp(),
        claimedBy: null,
        claimedAt: null,
        status: "open",
        replyCount: 0,
        priority: "urgent",
        expiresAt: new Date("2026-09-28T20:00:00Z"),
        ...over,
      });

      it("lets a trainer post a cover with its time, and a teammate take it", async () => {
        const mine = as("trainerA");
        await assertSucceeds(setDoc(doc(mine, "studios", "studioA", "taskRequests", "cover1"), coverAsk()));
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "trainers", "trainerA2"), {
            fullName: "Trainer A2",
            initials: "A2",
            role: "LifeTransformer",
            primaryHomeStudioId: "studioA",
            accessibleStudioIds: ["studioA"],
          });
        });
        const teammate = as("trainerA2");
        await assertSucceeds(
          updateDoc(doc(teammate, "studios", "studioA", "taskRequests", "cover1"), {
            claimedBy: { id: "trainerA2", name: "Trainer A2" },
            claimedAt: serverTimestamp(),
          }),
        );
        // Still posted as yourself only.
        await assertFails(
          setDoc(doc(teammate, "studios", "studioA", "taskRequests", "cover2"), coverAsk({ createdBy: { id: "trainerA", name: "Trainer A" } })),
        );
      });
    });

    // -- the Journal's notes: trainers/{uid}/notes may carry noteType,
    // fields and hunch beside everything a note always held.
    describe("the Journal's notes", () => {
      const journalNote = (over: Record<string, unknown> = {}) => ({
        title: "Pullover",
        body: "",
        kind: "note",
        folderId: null,
        clientIds: [],
        clientNames: {},
        pinned: false,
        sharedWith: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...over,
      });
      const hunch = (over: Record<string, unknown> = {}) => ({
        claim: "The Leg Curl stalls when the seat is set from memory.",
        how: "6 sessions set from memory, checked against the card.",
        need: 6,
        unit: "sessions",
        ...over,
      });

      it("lets a trainer write typed notes and hunches of their own, and nobody else", async () => {
        const mine = as("trainerA");
        const ref = (id: string) => doc(mine, "trainers", "trainerA", "notes", id);
        await assertSucceeds(
          setDoc(ref("m1"), journalNote({ noteType: "machine", fields: { machine: "Pullover", noticed: "Shorter arms reach better.", setting: "Seat pin 4." } })),
        );
        await assertSucceeds(setDoc(ref("t1"), journalNote({ title: "Leg Curl", noteType: "trend", fields: {}, hunch: hunch() })));
        // Evidence goes on one piece at a time, and a hunch can be retired.
        await assertSucceeds(
          updateDoc(ref("t1"), { "hunch.evidence": arrayUnion({ id: "e1", at: 1, text: "Tuesday", clientId: null }), updatedAt: serverTimestamp() }),
        );
        await assertSucceeds(updateDoc(ref("t1"), { "hunch.retiredAt": Date.now(), updatedAt: serverTimestamp() }));
        // A note written before the Journal still saves as it always did.
        await assertSucceeds(setDoc(ref("old"), journalNote({ kind: "injury", title: "Knee plan" })));
        // Someone else's tree, never.
        const other = as("trainerB");
        await assertFails(setDoc(doc(other, "trainers", "trainerA", "notes", "planted"), journalNote({ noteType: "personal", fields: { what: "x" } })));
      });

      it("keeps the shape: six types, three answers, a hunch's own keys and its limits", async () => {
        const ref = (id: string) => doc(as("trainerA"), "trainers", "trainerA", "notes", id);
        await assertFails(setDoc(ref("b1"), journalNote({ noteType: "diary" })));
        await assertFails(setDoc(ref("b2"), journalNote({ noteType: "client", fields: { a: "1", b: "2", c: "3", d: "4" } })));
        await assertFails(setDoc(ref("b3"), journalNote({ noteType: "trend", hunch: hunch({ need: 0 }) })));
        await assertFails(setDoc(ref("b4"), journalNote({ noteType: "trend", hunch: hunch({ unit: "weeks" }) })));
        await assertFails(setDoc(ref("b5"), journalNote({ noteType: "trend", hunch: { ...hunch(), secret: true } })));
        await assertFails(setDoc(ref("b6"), journalNote({ noteType: "machine", extra: "not a note field" })));
      });
    });

    // -- the day log: studios/{s}/dayLogs/{uid}_{day}, the trainer's own.
    describe("the day log", () => {
      const dayLog = (uid: string, over: Record<string, unknown> = {}) => ({
        uid,
        studioId: "studioA",
        day: "2026-09-28",
        carry: ["Slow down at the door"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...over,
      });

      it("lets a trainer keep and read their own day's log, and list their own, and nobody else", async () => {
        const mine = as("trainerA");
        const ref = doc(mine, "studios", "studioA", "dayLogs", "trainerA_2026-09-28");
        await assertSucceeds(setDoc(ref, dayLog("trainerA")));
        await assertSucceeds(
          setDoc(
            ref,
            {
              uid: "trainerA",
              studioId: "studioA",
              day: "2026-09-28",
              facts: ["Monday, September 28.", "5 sessions on your schedule today."],
              line: { what: "Covered Rosie", soWhat: "", nowWhat: "Leave the same kind of notes" },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        );
        await assertSucceeds(getDoc(ref));
        // A day with no log yet reads as nothing there, not a refusal.
        await assertSucceeds(getDoc(doc(mine, "studios", "studioA", "dayLogs", "trainerA_2026-09-29")));
        await assertSucceeds(getDocs(query(collection(mine, "studios", "studioA", "dayLogs"), where("uid", "==", "trainerA"))));
        // Nobody else: not a leader, not a colleague.
        const owner = as("ownerA");
        await assertFails(getDoc(doc(owner, "studios", "studioA", "dayLogs", "trainerA_2026-09-28")));
        await assertFails(getDocs(collection(owner, "studios", "studioA", "dayLogs")));
        await assertFails(setDoc(doc(owner, "studios", "studioA", "dayLogs", "trainerA_2026-09-28"), dayLog("trainerA")));
      });

      it("pins the id to the person and the day, and keeps the shape", async () => {
        const mine = as("trainerA");
        const at = (id: string) => doc(mine, "studios", "studioA", "dayLogs", id);
        await assertFails(setDoc(at("trainerA_2026-09-27"), dayLog("trainerA")));
        await assertFails(setDoc(at("trainerB_2026-09-28"), dayLog("trainerB")));
        await assertFails(setDoc(at("trainerA_2026-09-28"), dayLog("trainerA", { studioId: "studioB" })));
        await assertFails(setDoc(at("trainerA_2026-09-28"), dayLog("trainerA", { carry: ["1", "2", "3", "4"] })));
        await assertFails(setDoc(at("trainerA_2026-09-28"), dayLog("trainerA", { line: { what: "x", mood: "y" } })));
        await assertFails(setDoc(at("trainerA_2026-09-28"), dayLog("trainerA", { updatedAt: new Date("2026-01-01T00:00:00Z") })));
        await assertFails(setDoc(at("trainerA_2026-09-28"), dayLog("trainerA", { score: 9 })));
      });
    });
  });
  describe("relay's third wave", () => {
    const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

    // -- a claim on a team job: claims.{uid}, the floor's own stamp of when it took it.
    describe("claim times on team jobs", () => {
      const seedJob = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "studios", "studioA", "teamJobs", "claimed"), {
            studioId: "studioA",
            title: "Deep clean",
            detail: "",
            category: "ops",
            about: { kind: "facility" },
            assignees: [],
            assigneeIds: [],
            openToAll: true,
            parts: {},
            dueOn: null,
            requiresNote: false,
            notifyOnDone: true,
            status: "open",
            closingNote: null,
            completedBy: null,
            closedOn: null,
            createdBy: { id: "ownerA", name: "Owner A" },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      };

      it("lets the floor stamp its claim when it joins, and remove it when it steps off", async () => {
        await seedJob();
        const trainer = as("trainerA");
        const ref = doc(trainer, "studios", "studioA", "teamJobs", "claimed");
        await assertSucceeds(
          updateDoc(ref, {
            assignees: arrayUnion({ id: "trainerA", name: "Trainer A" }),
            assigneeIds: arrayUnion("trainerA"),
            "claims.trainerA": { name: "Trainer A", trainerId: "trainerA", at: serverTimestamp() },
            updatedAt: serverTimestamp(),
          }),
        );
        await assertSucceeds(
          updateDoc(ref, {
            assignees: arrayRemove({ id: "trainerA", name: "Trainer A" }),
            assigneeIds: arrayRemove("trainerA"),
            "claims.trainerA": deleteField(),
            updatedAt: serverTimestamp(),
          }),
        );
        // A claim is still not a way to rewrite the job.
        await assertFails(updateDoc(ref, { "claims.trainerA": { name: "Trainer A", at: serverTimestamp() }, title: "Other", updatedAt: serverTimestamp() }));
        // Nor can someone from another studio stamp one.
        const elsewhere = as("trainerB");
        await assertFails(
          updateDoc(doc(elsewhere, "studios", "studioA", "teamJobs", "claimed"), {
            "claims.trainerB": { name: "Trainer B", at: serverTimestamp() },
            updatedAt: serverTimestamp(),
          }),
        );
      });
    });

    // -- "I've read it": announcementReads/{uid}.acks, the person's own, beside their read-marks.
    describe("announcements that ask \"I've read it\"", () => {
      it("lets a person say they've read a notice in their own record, as a merge beside their read-marks, and nobody else's", async () => {
        const mine = as("trainerA");
        const ref = doc(mine, "announcementReads", "trainerA");
        await assertSucceeds(setDoc(ref, { ids: { n1: true }, updatedAt: serverTimestamp() }, { merge: true }));
        await assertSucceeds(setDoc(ref, { acks: { n1: serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true }));
        await assertSucceeds(setDoc(ref, { acks: { n2: serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true }));
        await assertSucceeds(getDoc(ref));
        // Someone else's record: neither.
        await assertFails(setDoc(doc(mine, "announcementReads", "trainerB"), { acks: { n1: serverTimestamp() } }, { merge: true }));
        await assertFails(getDoc(doc(mine, "announcementReads", "trainerB")));
        // The shape: a map, and nothing beyond ids, acks and updatedAt.
        await assertFails(setDoc(ref, { acks: "n1" }, { merge: true }));
        await assertFails(setDoc(ref, { acks: { n1: serverTimestamp() }, count: 1 }, { merge: true }));
      });

      it("keeps a notice's own document free of any reader's answer: only the poster's fields change", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "hub_announcements", "asks1"), {
            title: "Read the new closing checklist",
            shortContent: "On the wall by the desk.",
            longContent: "",
            authorId: "ownerA",
            authorName: "Owner A",
            studioId: "studioA",
            targetScope: "studio",
            isActive: true,
            priority: "low",
            asksRead: true,
            createdAt: serverTimestamp(),
          });
        });
        const reader = as("trainerA");
        await assertSucceeds(getDoc(doc(reader, "hub_announcements", "asks1")));
        await assertFails(updateDoc(doc(reader, "hub_announcements", "asks1"), { ackedBy: ["trainerA"] }));
        await assertFails(updateDoc(doc(reader, "hub_announcements", "asks1"), { asksRead: false }));
      });
    });
  });
});

// ---- Catalog wave 3 (Sep 29 2026): the standard's change log ---------------
// machines/{id}/changes/{changeId}, written by the catalog editor's save
// (features/machine-codex/change-log-store.ts recordMachineChange), read on
// the machine's Catalog page by anyone signed in, never edited or removed.
// docs/rounds/2026-09-29-catalog-3.md.
describe("catalog wave 3: a machine's change log", () => {
  const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      await person("adminC3", "Admin", "studioA");
      await person("founderC3", "Founder", "studioB");
      await person("leaderC3", "StudioLeader", "studioA");
      await person("ownerC3", "FranchiseOwner", "studioB");
      await person("trainerC3", "LifeTransformer", "studioA");
      await setDoc(doc(db, "machines", "m-leg-press"), { id: "m-leg-press", name: "LEG PRESS", status: "active", schemaVersion: 1 });
      await setDoc(doc(db, "machines", "m-leg-press", "changes", "c0"), {
        at: new Date("2026-09-29T14:00:00Z"),
        by: { uid: "adminC3", name: "adminC3" },
        kind: "created",
        fields: [],
      });
    });
  }

  const entry = (uid: string, over: Record<string, unknown> = {}) => ({
    at: serverTimestamp(),
    by: { uid, name: `Person ${uid}` },
    kind: "edited",
    fields: ["stopRules", "baselineLoad"],
    ...over,
  });
  const changes = (db: ReturnType<typeof ctx>) => collection(db, "machines", "m-leg-press", "changes");

  it("lets an administrator or the founder append a signed entry, and nobody else", async () => {
    await seed();
    await assertSucceeds(addDoc(changes(ctx("adminC3")), entry("adminC3")));
    await assertSucceeds(addDoc(changes(ctx("founderC3")), entry("founderC3", { kind: "created", fields: [] })));
    await assertFails(addDoc(changes(ctx("leaderC3")), entry("leaderC3")));
    await assertFails(addDoc(changes(ctx("ownerC3")), entry("ownerC3")));
    await assertFails(addDoc(changes(ctx("trainerC3")), entry("trainerC3")));
  });

  it("is read by anyone signed in, whole", async () => {
    await seed();
    for (const uid of ["trainerC3", "leaderC3", "ownerC3", "adminC3"]) {
      await assertSucceeds(getDocs(changes(ctx(uid))));
      await assertSucceeds(getDoc(doc(ctx(uid), "machines", "m-leg-press", "changes", "c0")));
    }
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), "machines", "m-leg-press", "changes")));
  });

  it("pins the entry to the signed-in person and the server's time, and keeps the shape", async () => {
    await seed();
    const admin = ctx("adminC3");
    await assertFails(addDoc(changes(admin), entry("adminC3", { by: { uid: "founderC3", name: "Founder" } })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { at: new Date("2026-01-01T00:00:00Z") })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { kind: "moved" })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { fields: "stopRules" })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { fields: Array.from({ length: 81 }, () => "name") })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { by: { uid: "adminC3", name: "" } })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { by: { uid: "adminC3", name: "A", email: "a@b.c" } })));
    await assertFails(addDoc(changes(admin), entry("adminC3", { before: { baselineLoad: 40 } })));
    const { fields: _dropped, ...noFields } = entry("adminC3");
    void _dropped;
    await assertFails(addDoc(changes(admin), noFields));
  });

  it("is never edited or removed, not even by an administrator", async () => {
    await seed();
    const ref = doc(ctx("adminC3"), "machines", "m-leg-press", "changes", "c0");
    await assertFails(updateDoc(ref, { fields: ["name"] }));
    await assertFails(setDoc(ref, entry("adminC3")));
    await assertFails(deleteDoc(ref));
  });
});

/* OCT 2 2026 (the Atlas answers, team branch): Get to know reads a "Follow up
   next time" question too. The Hub's one FORD read gains a fourth branch,
   followUpAt since sixty days back, still inside the studio. Kept in its own
   block so other branches' rules edits merge cleanly. */
describe("oct2 team: the Hub's FORD read with follow-ups", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const base = { pillar: "family", body: "A detail", isPinned: false, eventDate: null, recurrence: "none", occurredAt: new Date("2026-06-01T14:00:00Z"), authorId: "trainerA", isArchived: false };
      await setDoc(doc(db, "clients", "clientFuA", "ford", "asked"), { ...base, clientId: "clientFuA", studioId: "studioA", followUp: "How did it go?", followUpAt: new Date("2026-09-20T14:00:00Z") });
      await setDoc(doc(db, "clients", "clientFuA", "ford", "quiet"), { ...base, clientId: "clientFuA", studioId: "studioA" });
      await setDoc(doc(db, "clients", "clientFuB", "ford", "elsewhere"), { ...base, clientId: "clientFuB", studioId: "studioB", followUp: "And?", followUpAt: new Date("2026-09-20T14:00:00Z") });
    });
  });

  async function readWithFollowUps(db: ReturnType<typeof as>, studioId: string) {
    const { and, or } = await import("firebase/firestore");
    return query(
      collectionGroup(db, "ford"),
      and(
        where("studioId", "==", studioId),
        or(
          where("recurrence", "==", "annual"),
          and(where("eventDate", ">=", new Date("2026-09-20T04:00:00Z")), where("eventDate", "<", new Date("2026-10-12T04:00:00Z"))),
          where("occurredAt", ">=", new Date("2026-09-14T04:00:00Z")),
          where("followUpAt", ">=", new Date("2026-07-30T04:00:00Z")),
        ),
      ),
      limit(1000),
    );
  }

  it("lets the studio's trainer read the follow-ups, and only the studio's", async () => {
    const snap = await assertSucceeds(getDocs(await readWithFollowUps(as("trainerA"), "studioA")));
    expect(snap.docs.map((d) => d.id)).toEqual(["asked"]);
  });

  it("refuses it to a trainer at another studio", async () => {
    await assertFails(getDocs(await readWithFollowUps(as("trainerB"), "studioA")));
  });
});

/* OCT 2 2026 (the Atlas answers, team branch): franchise owners name people,
   assign and add studio tasks on their studios' shifts, as they post team
   jobs (teamJobLeaderAllowed). Kept in its own block so other branches'
   rules edits merge cleanly. */
describe("oct2 team: franchise owners on a studio's shift", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "franchiseOct2"), {
        fullName: "Frances Owner",
        initials: "FO",
        role: "Owner",
        primaryHomeStudioId: "studioB",
        accessibleStudioIds: ["studioB"],
        ownedStudioIds: ["studioA", "studioB"],
      });
      await setDoc(doc(db, "studios", "studioA", "taskInstances", "inst1"), { templateId: "tpl1", status: "open", localDate: "2026-10-02" });
    });
  });

  const template = { title: "Wipe the leg press", cadence: "daily", category: "cleaning", createdAt: new Date() };
  const assignee = { assignedTo: { id: "trainerA", name: "Trainer A" }, assignedBy: { id: "franchiseOct2", name: "Frances Owner" }, assignedAt: new Date() };

  it("lets a franchise owner add a studio task and name someone on one", async () => {
    const db = as("franchiseOct2");
    await assertSucceeds(setDoc(doc(db, "studios", "studioA", "taskTemplates", "tplOwner"), template));
    await assertSucceeds(updateDoc(doc(db, "studios", "studioA", "taskInstances", "inst1"), assignee));
    await assertSucceeds(setDoc(doc(db, "studios", "studioA", "taskInstances", "inst2"), { templateId: "tpl1", status: "open", localDate: "2026-10-02", ...assignee }));
  });

  it("still refuses a trainer naming someone or adding a studio task", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(doc(db, "studios", "studioA", "taskTemplates", "tplTrainer"), template));
    await assertFails(updateDoc(doc(db, "studios", "studioA", "taskInstances", "inst1"), assignee));
    // Ticking it off stays open to the floor.
    await assertSucceeds(updateDoc(doc(db, "studios", "studioA", "taskInstances", "inst1"), { status: "done" }));
  });
});

/* OCT 2 2026 (the Atlas answers, team branch): who has read a notice. A
   reader writes their own hub_announcements/{id}/acks/{uid}; the poster, the
   studio's leaders, franchise owners and administrators read them. Kept in
   its own block so other branches' rules edits merge cleanly. */
describe("oct2 team: who has read a notice", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "leadAckA"), {
        fullName: "Lead A",
        initials: "LA",
        role: "StudioLeader",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "hub_announcements", "noticeA"), {
        title: "Read the new waiver",
        shortContent: "Please read it",
        longContent: "",
        authorId: "posterA",
        authorName: "Poster",
        studioId: "studioA",
        targetScope: "studio",
        targetId: "studioA",
        isActive: true,
        priority: "medium",
        asksRead: true,
        createdAt: new Date(),
      });
      await setDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerB"), { at: new Date(), name: "Trainer B" });
    });
  });

  it("lets a reader write their own answer, stamped with the server's time, and nobody else's", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerA"), { at: serverTimestamp(), name: "Trainer A" }));
    await assertFails(setDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerB"), { at: serverTimestamp(), name: "Trainer B" }));
    await assertFails(setDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerA"), { at: new Date("2020-01-01"), name: "Trainer A" }));
    await assertFails(setDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerA"), { at: serverTimestamp(), name: "Trainer A", extra: 1 }));
    await assertFails(deleteDoc(doc(db, "hub_announcements", "noticeA", "acks", "trainerB")));
  });

  it("lets the poster and the studio's leaders count them, and not a trainer", async () => {
    await assertSucceeds(getDocs(collection(as("posterA"), "hub_announcements", "noticeA", "acks")));
    await assertSucceeds(getDocs(collection(as("leadAckA"), "hub_announcements", "noticeA", "acks")));
    await assertFails(getDocs(collection(as("trainerA"), "hub_announcements", "noticeA", "acks")));
  });
});

/* OCT 2 2026 (the Atlas answers, team branch): a leader's Journal note about
   a team member is an ordinary private note with noteType 'team'. Its own
   block so other branches' rules edits merge cleanly. */
describe("oct2 team: a note about a team member", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const note = {
    title: "Sam: late twice",
    body: "",
    kind: "note",
    folderId: null,
    clientIds: [],
    clientNames: {},
    pinned: false,
    sharedWith: null,
    noteType: "team",
    fields: { who: "Sam Gamgee", what: "Late twice this week", next: "Talk on Friday" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("saves on the author's own path, and nobody else reads it", async () => {
    await assertSucceeds(setDoc(doc(as("trainerA"), "trainers", "trainerA", "notes", "teamNote"), note));
    await assertFails(getDoc(doc(as("trainerB"), "trainers", "trainerA", "notes", "teamNote")));
    await assertFails(setDoc(doc(as("trainerB"), "trainers", "trainerA", "notes", "teamNote2"), note));
  });
});

describe("oct 2: a studio's own machine is retired, never deleted", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "adminR1"), {
        fullName: "adminR1", initials: "XX", role: "Admin", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"],
      });
      await setDoc(doc(db, "studios", "studioA", "roster", "sm-studioA-bench"), {
        machineId: "sm-studioA-bench", studioId: "studioA", source: "custom", status: "active",
        definition: { name: "Bench" },
      });
      await setDoc(doc(db, "studios", "studioA", "roster", "m-leg-press"), {
        machineId: "m-leg-press", studioId: "studioA", source: "catalog", basedOn: "m-leg-press", status: "active",
      });
    });
  }

  it("refuses deleting the studio's own machine, even for an administrator, and lets a leader switch it off and on", async () => {
    await seed();
    await assertFails(deleteDoc(doc(as("ownerA"), "studios", "studioA", "roster", "sm-studioA-bench")));
    await assertFails(deleteDoc(doc(as("adminR1"), "studios", "studioA", "roster", "sm-studioA-bench")));
    await assertSucceeds(
      updateDoc(doc(as("ownerA"), "studios", "studioA", "roster", "sm-studioA-bench"), {
        status: "inactive",
        updatedAt: serverTimestamp(),
        updatedBy: "ownerA",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("ownerA"), "studios", "studioA", "roster", "sm-studioA-bench"), { status: "active" }),
    );
  });

  it("still lets a leader delete a copy of an MSF machine, and never a trainer", async () => {
    await seed();
    await assertFails(deleteDoc(doc(as("trainerA"), "studios", "studioA", "roster", "m-leg-press")));
    await assertSucceeds(deleteDoc(doc(as("ownerA"), "studios", "studioA", "roster", "m-leg-press")));
  });
});

describe("oct 2: switching a former trainer's account off", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminR8"), {
        fullName: "adminR8", initials: "XX", role: "Admin", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"],
      });
    });
  }

  it("lets an administrator switch an account off and back on", async () => {
    await seed();
    const ref = doc(as("adminR8"), "trainers", "trainerA");
    await assertSucceeds(
      updateDoc(ref, {
        isActive: false,
        switchedOffAt: "2026-10-02T15:00:00.000Z",
        switchedOffBy: { uid: "adminR8", name: "adminR8" },
      }),
    );
    await assertSucceeds(updateDoc(ref, { isActive: true, switchedOffAt: deleteField(), switchedOffBy: deleteField() }));
  });

  it("never lets a trainer switch their own account off or back on; their profile edits are as before", async () => {
    await seed();
    const own = doc(as("trainerA"), "trainers", "trainerA");
    await assertSucceeds(updateDoc(own, { fullName: "Trainer A, still here" }));
    await assertFails(updateDoc(own, { isActive: false }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "trainers", "trainerA"), { isActive: false, switchedOffAt: "2026-10-02T15:00:00.000Z" });
    });
    await assertFails(updateDoc(own, { isActive: true }));
    await assertFails(updateDoc(own, { switchedOffAt: deleteField() }));
  });

  it("never lets a studio's leader switch a colleague off: administrators only (the franchise partition)", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(as("ownerA"), "trainers", "trainerA"), {
        isActive: false,
        switchedOffAt: "2026-10-02T15:00:00.000Z",
        switchedOffBy: { uid: "ownerA", name: "Owner A" },
      }),
    );
  });
});

// ── SPEED ROUND, PROFILE AND LEADER SCREENS GROUP (Oct 5 2026) ─────────────
describe("speed round: the night's month tally for Hours and Insights", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const hours = { v: 1, month: "2026-10", throughDay: "2026-10-04", liveFromMs: 1, lateIds: [], trainers: [], unattributed: 0, open: 0 };
  const lines = { v: 1, month: "2026-10", throughDay: "2026-10-04", liveFromMs: 1, lateIds: [], trainers: [], clients: [], machines: [], rows: [], count: 0 };

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "trainers", "adminSpeed"), {
        fullName: "Admin Speed", initials: "AS", role: "Admin", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"],
      });
      for (const studio of ["studioA", "demo-studio"]) {
        await setDoc(doc(db, "studios", studio, "watch", "hours-2026-10"), hours);
        await setDoc(doc(db, "studios", studio, "watch", "sessions-2026-10"), lines);
      }
      await setDoc(doc(db, "studios", "studioA", "watch", "hubMarks"), { v: 1, clients: {} });
    });
  }

  it("lets the studio's leaders and an administrator read it, and not the studio's trainers or another studio's", async () => {
    await seed();
    for (const id of ["hours-2026-10", "sessions-2026-10"]) {
      await assertSucceeds(getDoc(doc(as("ownerA"), "studios", "studioA", "watch", id)));
      await assertSucceeds(getDoc(doc(as("adminSpeed"), "studios", "studioA", "watch", id)));
      await assertFails(getDoc(doc(as("trainerA"), "studios", "studioA", "watch", id)));
      await assertFails(getDoc(doc(as("trainerB"), "studios", "studioA", "watch", id)));
    }
    // Everything else on the watch is still everyone's who works here.
    await assertSucceeds(getDoc(doc(as("trainerA"), "studios", "studioA", "watch", "hubMarks")));
  });

  it("is everyone's inside Demo Mode, as the practice studio's Operations is", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as("trainerB"), "studios", "demo-studio", "watch", "hours-2026-10")));
  });

  it("is written by nobody in the app, an administrator included", async () => {
    await seed();
    await assertFails(setDoc(doc(as("ownerA"), "studios", "studioA", "watch", "hours-2026-10"), hours));
    await assertFails(setDoc(doc(as("adminSpeed"), "studios", "studioA", "watch", "sessions-2026-11"), lines));
    await assertFails(updateDoc(doc(as("adminSpeed"), "studios", "studioA", "watch", "hours-2026-10"), { open: 1 }));
  });
});

// ===============================================================
// SPEED ROUND, BOOT GROUP (Oct 5 2026; R16). The new read shapes the bell
// and the boot use: the newest hundred notices, the newest fifty
// notifications and the unread ones. No rule changed; these hold that the
// shapes are allowed to the people who use them and no one else.
// ===============================================================
describe("speed round (boot): the bell's new read shapes", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "hub_announcements", "n1"), {
        title: "Holiday hours", studioId: "studioA", targetScope: "studio", targetId: "studioA",
        authorId: "ownerA", isActive: true, priority: "medium", createdAt: new Date("2026-10-01T12:00:00Z"),
      });
      // An older notice with no isActive field: the read must not need one.
      await setDoc(doc(db, "hub_announcements", "n0"), {
        title: "Old", studioId: "all", authorId: "ownerA", priority: "low", createdAt: new Date("2026-01-01T12:00:00Z"),
      });
      await setDoc(doc(db, "trainers", "trainerA", "notifications", "x1"), {
        kind: "task_done", title: "Done", studioId: "studioA", actor: { id: "trainerB", name: "B" },
        createdAt: new Date("2026-10-04T12:00:00Z"), readAt: null,
      });
      await setDoc(doc(db, "trainers", "trainerA", "notifications", "x2"), {
        kind: "task_done", title: "Read", studioId: "studioA", actor: { id: "trainerB", name: "B" },
        createdAt: new Date("2026-10-03T12:00:00Z"), readAt: new Date("2026-10-03T13:00:00Z"),
      });
    });
  }

  it("lets anyone signed in read the newest hundred notices, isActive or not", async () => {
    await seed();
    const snap = await assertSucceeds(
      getDocs(query(collection(as("trainerA"), "hub_announcements"), orderBy("createdAt", "desc"), limit(100))),
    );
    expect(snap.docs.map((d) => d.id)).toEqual(["n1", "n0"]);
    await assertFails(getDocs(query(collection(testEnv.unauthenticatedContext().firestore(), "hub_announcements"), orderBy("createdAt", "desc"), limit(100))));
  });

  it("lets a trainer read their own newest fifty and their unread ones, and nobody else's", async () => {
    await seed();
    const mine = collection(as("trainerA"), "trainers", "trainerA", "notifications");
    const list = await assertSucceeds(getDocs(query(mine, orderBy("createdAt", "desc"), limit(50))));
    expect(list.docs.map((d) => d.id)).toEqual(["x1", "x2"]);
    const unread = await assertSucceeds(getDocs(query(mine, where("readAt", "==", null), orderBy("createdAt", "desc"), limit(100))));
    expect(unread.docs.map((d) => d.id)).toEqual(["x1"]);
    const theirs = collection(as("trainerB"), "trainers", "trainerA", "notifications");
    await assertFails(getDocs(query(theirs, orderBy("createdAt", "desc"), limit(50))));
    await assertFails(getDocs(query(theirs, where("readAt", "==", null), orderBy("createdAt", "desc"), limit(100))));
  });

  it("still refuses a notification written without readAt: null, so the unread read finds every unread one", async () => {
    await seed();
    const ref = collection(as("trainerB"), "trainers", "trainerA", "notifications");
    await assertFails(addDoc(ref, { kind: "task_done", title: "No readAt", studioId: "studioA", actor: { id: "trainerB", name: "B" }, createdAt: serverTimestamp() }));
    await assertSucceeds(addDoc(ref, { kind: "task_done", title: "With readAt", studioId: "studioA", actor: { id: "trainerB", name: "B" }, createdAt: serverTimestamp(), readAt: null }));
  });

  it("lets anyone signed in read the Mindbody health document the Operations page now watches", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "system", "health"), { status: "healthy" });
    });
    await assertSucceeds(getDoc(doc(as("trainerA"), "system", "health")));
  });
});

// ---------------------------------------------------------------------------
// SPEED ROUND, the live session group (Oct 5 2026; R9). Start is ONE batch:
// the session, its routine when one has to be made, and the prefilled sets,
// with ids made on the iPad. The client's own fields are a separate write, so
// one refused client field never rolls the session back. Discard is one batch
// of deletes, ids the session MAY have written included.
// ---------------------------------------------------------------------------
describe("speed round (live session): the Start and Discard batches", () => {
  const CLIENT = "speedClient";
  const MACHINES = ["m-leg-press", "m-pulldown", "m-torso-rotation"];
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Home studio B; approved for cross-training at A (trainerA's studio).
      await setDoc(doc(db, "clients", CLIENT), {
        firstName: "Sam", lastName: "Speed", isActive: true, remainingSessions: 10,
        homeStudioId: "studioB", approvedCrossTrainStudioIds: ["studioA"],
        completedSessions: 0, sessionCount: 0,
      });
    });
  });

  const startBatch = (
    db: ReturnType<typeof as>,
    uid: string,
    hostedAt: string,
    opts: { newRoutine?: boolean } = {},
  ) => {
    const b = writeBatch(db);
    const sessionRef = doc(collection(db, "sessions"));
    const routineRef = opts.newRoutine ? doc(collection(db, "routines")) : null;
    if (routineRef) {
      b.set(routineRef, { clientId: CLIENT, name: "Routine A", machineIds: MACHINES, createdAt: serverTimestamp(), studioId: "studioB" });
    }
    b.set(sessionRef, {
      clientId: CLIENT, clientName: "Sam Speed", homeStudioId: "studioB", clientHomeStudioId: "studioB",
      hostedAtStudioId: hostedAt, routineId: routineRef ? routineRef.id : null, sessionType: "Standard",
      sessionNumber: 1, date: "2026-10-05", isCrossTrain: hostedAt !== "studioB",
      trainerInitials: "TA", trainerName: "Trainer", trainerId: uid, startedByTrainerId: uid,
      lastHeartbeatAt: serverTimestamp(), status: "In-Progress", sessionMachineIds: MACHINES,
      pausedAt: null, totalPausedMs: 0, clientStartTime: "2026-10-05T13:00:00.000Z",
      startTime: serverTimestamp(), createdAt: serverTimestamp(),
    });
    for (const id of [`${sessionRef.id}_m-leg-press`, `${sessionRef.id}_m-torso-rotation_Left`, `${sessionRef.id}_m-torso-rotation_Right`]) {
      b.set(doc(db, "exerciseLogs", id), {
        sessionId: sessionRef.id, clientId: CLIENT, homeStudioId: "studioB", clientHomeStudioId: "studioB",
        studioId: hostedAt, machineId: id.includes("torso") ? "m-torso-rotation" : "m-leg-press",
        machineSettings: {}, createdAt: serverTimestamp(), weight: "120",
      }, { merge: true });
    }
    return { batch: b, sessionId: sessionRef.id };
  };

  it("lets a cross-train visitor's Start batch through: the session, a new routine and the prefilled sets together", async () => {
    const { batch } = startBatch(as("trainerA"), "trainerA", "studioA", { newRoutine: true });
    await assertSucceeds(batch.commit());
  });

  it("lets the home studio's trainer's Start batch through", async () => {
    const { batch } = startBatch(as("trainerB"), "trainerB", "studioB");
    await assertSucceeds(batch.commit());
  });

  it("the visitor's client fields are their own write: allowed alone, and a refused one cannot take the session with it", async () => {
    const db = as("trainerA");
    const { batch, sessionId } = startBatch(db, "trainerA", "studioA");
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { isRoutineBActive: true, firstSessionDate: serverTimestamp() }));
    // A client field the visitor may not change is refused, and the session stands.
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { goals: "x" }));
    await assertSucceeds(getDoc(doc(db, "sessions", sessionId)));
  });

  it("would refuse the whole Start if a refused client field rode in the same batch (why it never does)", async () => {
    const db = as("trainerA");
    const { batch } = startBatch(db, "trainerA", "studioA");
    batch.update(doc(db, "clients", CLIENT), { goals: "x" });
    await assertFails(batch.commit());
  });

  it("lets the follow-up write the routine it decided once the routines were read", async () => {
    const db = as("trainerA");
    const { batch, sessionId } = startBatch(db, "trainerA", "studioA");
    await assertSucceeds(batch.commit());
    const follow = writeBatch(db);
    const routineRef = doc(collection(db, "routines"));
    follow.set(routineRef, { clientId: CLIENT, name: "Routine A", machineIds: [], createdAt: serverTimestamp(), studioId: "studioB" });
    follow.update(doc(db, "sessions", sessionId), { routineId: routineRef.id, sessionMachineIds: MACHINES, lastHeartbeatAt: serverTimestamp() });
    await assertSucceeds(follow.commit());
  });

  it("lets the visitor Discard in one batch, deletes of sets that were never written included", async () => {
    const db = as("trainerA");
    const { batch, sessionId } = startBatch(db, "trainerA", "studioA");
    await assertSucceeds(batch.commit());
    const discard = writeBatch(db);
    for (const id of [
      `${sessionId}_m-leg-press`,
      `${sessionId}_m-pulldown`, // never written: the machine had nothing to seed
      `${sessionId}_m-torso-rotation_Left`,
      `${sessionId}_m-torso-rotation_Right`,
    ]) {
      discard.delete(doc(db, "exerciseLogs", id));
    }
    discard.delete(doc(db, "sessions", sessionId));
    await assertSucceeds(discard.commit());
  });

  it("refuses the Discard batch to a trainer the session is nothing to", async () => {
    const { batch, sessionId } = startBatch(as("trainerA"), "trainerA", "studioA");
    await assertSucceeds(batch.commit());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
    });
    const db = as("trainerC");
    const discard = writeBatch(db);
    discard.delete(doc(db, "exerciseLogs", `${sessionId}_m-leg-press`));
    discard.delete(doc(db, "sessions", sessionId));
    await assertFails(discard.commit());
  });
});

// A CLIENT'S MACHINE TOTALS (the iPad round, Oct 6 2026). currentMachineMetrics,
// machineStats and the backfill's marker moved off clients/{id} into
// clients/{id}/machineTotals/current (src/features/machine-totals). The rule is
// the client document's own access for those fields: read by whoever reads the
// client, written by whoever updates it (an approved cross-train visitor, the
// two maps only), deleted by administrators.
describe("a client's machine totals document", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const HOME = "totalsHomeClient";
  const VISITING = "totalsVisitingClient";
  const totalsDoc = (db: any, clientId: string, id = "current") => doc(db, "clients", clientId, "machineTotals", id);
  const finishWrite = (sessionId: string) => ({
    currentMachineMetrics: { "m-leg-press": { weight: "180", reps: "9", settings: {}, lastSessionId: sessionId } },
    machineStats: { "m-leg-press": { timesPerformed: increment(1), lastPerformedDate: "2026-10-06", lastWeight: 180 } },
    updatedAt: serverTimestamp(),
  });
  const finishFields = ["currentMachineMetrics.m-leg-press", "machineStats.m-leg-press.timesPerformed", "machineStats.m-leg-press.lastPerformedDate", "machineStats.m-leg-press.lastWeight", "updatedAt"];

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", HOME), {
        firstName: "Hana", lastName: "Home", isActive: true, remainingSessions: 10, homeStudioId: "studioA",
      });
      await setDoc(doc(db, "clients", VISITING), {
        firstName: "Vic", lastName: "Visitor", isActive: true, remainingSessions: 10,
        homeStudioId: "studioB", approvedCrossTrainStudioIds: ["studioA"],
      });
      await setDoc(totalsDoc(db, HOME), {
        machineStats: { "m-leg-press": { timesPerformed: 40, lastPerformedDate: "2026-09-20", lastWeight: 170 } },
      });
      await setDoc(doc(db, "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
      await setDoc(doc(db, "trainers", "adminTotals"), { fullName: "Admin", initials: "AD", role: "Admin" });
      // The franchise partition (Oct 2026): the franchise owner OF the home
      // client's studio, and one who owns nothing.
      await setDoc(doc(db, "trainers", "ownerTotals"), {
        fullName: "Franchise", initials: "FO", role: "FranchiseOwner", primaryHomeStudioId: "studioB",
        ownedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "trainers", "ownerElsewhere"), {
        fullName: "Franchise Elsewhere", initials: "FE", role: "FranchiseOwner", primaryHomeStudioId: "studioB",
      });
    });
  });

  it("is read by whoever reads the client, and refused to anyone else", async () => {
    await assertSucceeds(getDoc(totalsDoc(as("trainerA"), HOME)));
    await assertSucceeds(getDoc(totalsDoc(as("ownerA"), HOME)));
    await assertSucceeds(getDoc(totalsDoc(as("adminTotals"), HOME)));
    await assertSucceeds(getDoc(totalsDoc(as("ownerTotals"), HOME)));
    await assertFails(getDoc(totalsDoc(as("ownerElsewhere"), HOME)));
    await assertFails(getDoc(totalsDoc(as("trainerB"), HOME)));
    await assertFails(getDoc(totalsDoc(as("trainerC"), HOME)));
    // A cross-train visitor reads the client, so reads its totals (missing or not).
    await assertSucceeds(getDoc(totalsDoc(as("trainerA"), VISITING)));
    await assertFails(getDoc(totalsDoc(testEnv.unauthenticatedContext().firestore(), HOME)));
  });

  it("lets the client's studio write a Finish's totals, creating the document the first time", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(totalsDoc(db, HOME), finishWrite("s1"), { mergeFields: finishFields }));
    // A client with no totals document yet: the same write creates it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "totalsNewClient"), {
        firstName: "New", lastName: "Client", isActive: true, remainingSessions: 10, homeStudioId: "studioA",
      });
    });
    await assertSucceeds(setDoc(totalsDoc(db, "totalsNewClient"), finishWrite("s2"), { mergeFields: finishFields }));
  });

  it("lets the backfill replace machineStats and its marker, as the client allowed", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.set(totalsDoc(db, HOME), { machineStats: { "m-leg-press": { timesPerformed: 41 } }, machineStatsBackfilledAt: serverTimestamp(), updatedAt: serverTimestamp() }, { mergeFields: ["machineStats", "machineStatsBackfilledAt", "updatedAt"] });
    b.update(doc(db, "clients", HOME), { machineStats: deleteField(), machineStatsBackfilledAt: deleteField() });
    await assertSucceeds(b.commit());
  });

  it("refuses the old version's backfill onto the client (the marker set there), and allows taking the marker off", async () => {
    // An iPad still on the old version backfills by writing a whole-history
    // machineStats and the marker onto the client; summed with the totals
    // document it would double every count. Refused whole, for everyone.
    const oldBackfill = { machineStats: { "m-leg-press": { timesPerformed: 40 } }, machineStatsBackfilledAt: serverTimestamp() };
    await assertFails(updateDoc(doc(as("trainerA"), "clients", HOME), oldBackfill));
    await assertFails(updateDoc(doc(as("adminTotals"), "clients", HOME), oldBackfill));
    await assertFails(updateDoc(doc(as("trainerA"), "clients", HOME), { machineStatsBackfilledAt: serverTimestamp() }));
    // A client that still carries a marker from before: other writes go
    // through, and the new app's replace may delete it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "clients", HOME), { machineStatsBackfilledAt: "2026-09-01" });
    });
    await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", HOME), { completedSessions: increment(1) }));
    await assertFails(updateDoc(doc(as("trainerA"), "clients", HOME), { machineStatsBackfilledAt: "2026-10-06" }));
    await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", HOME), { machineStats: deleteField(), machineStatsBackfilledAt: deleteField() }));
  });

  it("refuses a write from a studio the client isn't at", async () => {
    await assertFails(setDoc(totalsDoc(as("trainerB"), HOME), finishWrite("s1"), { mergeFields: finishFields }));
    await assertFails(setDoc(totalsDoc(as("trainerC"), VISITING), finishWrite("s1"), { mergeFields: finishFields }));
    // The franchise owner of the client's studio leads it, so writes its
    // totals as its leaders do (the franchise partition); one of another
    // studio does not.
    await assertSucceeds(setDoc(totalsDoc(as("ownerTotals"), HOME), finishWrite("s1"), { mergeFields: finishFields }));
    await assertFails(setDoc(totalsDoc(as("ownerElsewhere"), HOME), finishWrite("s1"), { mergeFields: finishFields }));
  });

  it("lets an approved cross-train visitor move the two maps, and nothing else", async () => {
    const db = as("trainerA");
    // trainerA works at studioA; VISITING's home is studioB, approved for A.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerB2"), {
        fullName: "Trainer B2", initials: "TB", role: "LifeTransformer",
        primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"],
      });
    });
    await assertSucceeds(setDoc(totalsDoc(db, VISITING), finishWrite("s1"), { mergeFields: finishFields }));
    await assertFails(
      setDoc(totalsDoc(db, VISITING), { machineStatsBackfilledAt: serverTimestamp() }, { merge: true }),
    );
    // The client's own studio may set the marker.
    await assertSucceeds(
      setDoc(totalsDoc(as("trainerB2"), VISITING), { machineStatsBackfilledAt: serverTimestamp() }, { merge: true }),
    );
  });

  it("refuses any other field, any other document id, and a client that does not exist", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(totalsDoc(db, HOME), { firstName: "x" }, { merge: true }));
    await assertFails(setDoc(totalsDoc(db, HOME), { machineStats: {}, renewal: {} }, { merge: true }));
    await assertFails(setDoc(totalsDoc(db, HOME, "other"), { machineStats: {} }));
    await assertFails(getDoc(totalsDoc(db, HOME, "other")));
    await assertFails(setDoc(totalsDoc(db, "noSuchClient"), finishWrite("s1"), { mergeFields: finishFields }));
  });

  it("is deleted by administrators only", async () => {
    await assertFails(deleteDoc(totalsDoc(as("trainerA"), HOME)));
    await assertSucceeds(deleteDoc(totalsDoc(as("adminTotals"), HOME)));
  });

  it("takes a whole Finish: the client's counters and the totals in one batch", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.update(doc(db, "clients", HOME), { completedSessions: increment(1), lastSessionDate: "2026-10-06", "trainerTally.trainerA": increment(1) });
    b.set(totalsDoc(db, HOME), finishWrite("s1"), { mergeFields: finishFields });
    await assertSucceeds(b.commit());
  });
});

// Demo Mode's seed writes each demo client's machine totals, flagged isDemo
// like every document it writes, after the clients themselves (seed-write.ts).
describe("a demo client's machine totals", () => {
  it("are written by any trainer, as the rest of the demo studio is, and read the same way", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "demo-client-arwen"), {
        firstName: "Arwen", lastName: "Demo", isActive: true, remainingSessions: 10, homeStudioId: "demo-studio", isDemo: true,
      });
    });
    const db = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    const ref = doc(db, "clients", "demo-client-arwen", "machineTotals", "current");
    await assertSucceeds(
      setDoc(ref, { currentMachineMetrics: { "m-a": { weight: "40", settings: {} } }, machineStats: { "m-a": { timesPerformed: 8 } }, updatedAt: serverTimestamp(), isDemo: true }),
    );
    await assertSucceeds(getDoc(ref));
  });
});

// ── RENEWALS: the renewal plan (the renewals dashboard, Oct 7 2026) ───────
//
// AJ: "allow in app response", and for studios without auto-renew "mark if
// a client is set to renew or not". Anyone who works at the studio sets the
// cycle's plan with one touch of kind "plan" in the same batch
// (features/renewals/useRenewalCycle.ts saveRenewalPlan); it never touches
// the outcome, and a leader's write keeps it to the same shape.
describe("the renewal plan", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const cycleOf = (db: ReturnType<typeof as>, studio = "studioA") => doc(db, "studios", studio, "renewals", "9001");

  const plan = (uid: string, over: Record<string, unknown> = {}) => ({
    choice: "renew-same",
    packageKey: "committed",
    note: "Renewing in January",
    byUid: uid,
    byName: "Trainer A",
    at: serverTimestamp(),
    ...over,
  });
  const planTouch = (uid: string, over: Record<string, unknown> = {}) => ({
    clientId: "c1",
    authorId: uid,
    authorName: "Trainer A",
    at: serverTimestamp(),
    leaning: "renewing",
    concerns: [],
    interestedIn: "same",
    note: "Renewing in January",
    needsLeader: false,
    kind: "plan",
    plan: { choice: "renew-same", packageKey: "committed" },
    ...over,
  });
  const cycleWrite = (uid: string, planOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
    clientId: "c1",
    clientName: "Client One",
    cycleKey: "9001",
    packageKey: "committed",
    chargeDate: "2026-11-14",
    plan: plan(uid, planOver),
    touchCount: increment(1),
    ...over,
  });
  const save = (db: ReturnType<typeof as>, uid: string, planOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => {
    const cycle = cycleOf(db);
    const batch = writeBatch(db);
    batch.set(doc(collection(cycle, "touches")), planTouch(uid));
    batch.set(cycle, cycleWrite(uid, planOver, over), { merge: true });
    return batch.commit();
  };

  it("lets a trainer at the studio set the plan, with its touch, in one batch", async () => {
    const db = as("trainerA");
    await assertSucceeds(save(db, "trainerA"));
    const snap = await getDoc(cycleOf(db));
    expect(snap.get("plan.choice")).toBe("renew-same");
    expect(snap.get("touchCount")).toBe(1);
    // And change it later, on the cycle it wrote.
    await assertSucceeds(save(db, "trainerA", { choice: "not-renewing", packageKey: null, note: "" }));
  });

  it("lets a trainer set the plan on a cycle the nightly job decided, and never the outcome", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "renewals", "9001"), {
        clientId: "c1", clientName: "Client One", cycleKey: "9001", packageKey: "committed",
        outcome: "lost", outcomeBy: "job", outcomeAt: new Date(), closedOn: "2026-07-20",
        nextCycleKey: null, nextPackageKey: null, primaryTrainerId: "trainerA",
      });
    });
    const db = as("trainerA");
    await assertSucceeds(save(db, "trainerA", { choice: "pay-as-you-go", packageKey: null }));
    await assertFails(save(db, "trainerA", {}, { outcome: "renewed" }));
    await assertFails(save(db, "trainerA", {}, { stage: "decided" }));
    expect((await getDoc(cycleOf(db))).get("outcome")).toBe("lost");
  });

  it("refuses a plan signed by someone else, backdated, of an unknown choice, or with a stray key", async () => {
    const db = as("trainerA");
    await assertFails(save(db, "trainerA", { byUid: "ownerA" }));
    await assertFails(save(db, "trainerA", { at: new Date("2026-01-01") }));
    await assertFails(save(db, "trainerA", { choice: "maybe" }));
    await assertFails(save(db, "trainerA", { score: 5 }));
    await assertFails(save(db, "trainerA", { byName: "" }));
    await assertFails(save(db, "trainerA", { note: "x".repeat(501) }));
    await assertFails(save(db, "trainerA", {}, { touchCount: increment(2) }));
  });

  it("refuses a plan touch without its plan, or of another kind", async () => {
    const db = as("trainerA");
    const touches = collection(cycleOf(db), "touches");
    const { plan: _omit, ...noPlan } = planTouch("trainerA");
    await assertFails(setDoc(doc(touches), noPlan));
    await assertFails(setDoc(doc(touches), planTouch("trainerA", { kind: "note" })));
    await assertFails(setDoc(doc(touches), planTouch("trainerA", { plan: { choice: "maybe" } })));
    await assertSucceeds(setDoc(doc(touches), planTouch("trainerA")));
  });

  it("keeps another studio's trainers out", async () => {
    const db = as("trainerB");
    await assertFails(save(db, "trainerB"));
  });

  it("lets a leader set it, and a leader's later write on a cycle with a plan still goes through", async () => {
    const owner = as("ownerA");
    await assertSucceeds(save(owner, "ownerA", { byName: "Owner A" }));
    await assertSucceeds(
      setDoc(cycleOf(owner), { stage: "decided", updatedBy: "ownerA", updatedAt: serverTimestamp() }, { merge: true }),
    );
    // A merge deepens into the stored plan: a changed field must keep the whole plan valid.
    await assertFails(setDoc(cycleOf(owner), { plan: { choice: "maybe" }, updatedBy: "ownerA" }, { merge: true }));
    await assertFails(setDoc(cycleOf(owner), { plan: { byUid: "trainerA" }, updatedBy: "ownerA" }, { merge: true }));
  });

  it("leaves a trainer's conversation working on a cycle that has a plan", async () => {
    await assertSucceeds(save(as("trainerA"), "trainerA"));
    const db = as("trainerA");
    await assertSucceeds(
      setDoc(
        cycleOf(db),
        {
          clientId: "c1", clientName: "Client One", cycleKey: "9001", packageKey: "committed", chargeDate: "2026-11-14",
          latestLeaning: "leaning-yes", latestConcerns: [], latestInterestedIn: null,
          lastTouchBy: "trainerA", lastTouchByName: "Trainer A", lastTouchAt: serverTimestamp(), touchCount: increment(1),
        },
        { merge: true },
      ),
    );
  });
});

/* OCT 7 2026 (first session and routines): a routine's plan is `plan` on the
   routine, and each change to it is appended to routines/{id}/planChanges by
   any trainer, signed and timed, never edited or removed. Its own block so
   other branches' rules edits merge cleanly. */
describe("oct7 first session: a routine's plan and its changes", () => {
  const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const person = (id: string, role: string, home: string) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home] });
      await person("trainerP7", "LifeTransformer", "studioA");
      await person("otherP7", "LifeTransformer", "studioB");
      await setDoc(doc(db, "routines", "r1"), { clientId: "c1", name: "Routine A", machineIds: ["m-leg-press"], studioId: "studioA" });
      await setDoc(doc(db, "routines", "r1", "planChanges", "c0"), {
        kind: "start", machineIds: ["m-leg-press", "m-compound-row"], byUid: "trainerP7", at: new Date("2026-10-07T14:00:00Z"),
      });
    });
  }

  const change = (uid: string, over: Record<string, unknown> = {}) => ({
    kind: "swap",
    machineIds: ["m-dip", "m-overhead-press"],
    reason: "Delts weak",
    byUid: uid,
    byName: `Trainer ${uid}`,
    at: serverTimestamp(),
    ...over,
  });
  const changes = (db: ReturnType<typeof ctx>) => collection(db, "routines", "r1", "planChanges");

  it("lets any trainer write the plan, the routine and its change in one batch", async () => {
    await seed();
    for (const uid of ["trainerP7", "otherP7"]) {
      const db = ctx(uid);
      const batch = writeBatch(db);
      batch.update(doc(db, "routines", "r1"), {
        plan: { purpose: "Learning the protocol", intended: ["m-leg-press", "m-compound-row", "m-lumbar"], building: true, madeByUid: "trainerP7" },
        machineIds: ["m-leg-press", "m-compound-row"],
      });
      batch.set(doc(changes(db)), { kind: "add", machineIds: ["m-compound-row"], byUid: uid, at: serverTimestamp() });
      await assertSucceeds(batch.commit());
    }
  });

  it("pins the change to the signed-in person and the server's time, and keeps the shape", async () => {
    await seed();
    const db = ctx("trainerP7");
    await assertSucceeds(addDoc(changes(db), change("trainerP7")));
    await assertSucceeds(addDoc(changes(db), change("trainerP7", { kind: "building", machineIds: [], value: "off", reason: "Routine settled" })));
    await assertFails(addDoc(changes(db), change("otherP7")));
    await assertFails(addDoc(changes(db), change("trainerP7", { at: new Date("2026-01-01T00:00:00Z") })));
    await assertFails(addDoc(changes(db), change("trainerP7", { kind: "rename" })));
    await assertFails(addDoc(changes(db), change("trainerP7", { machineIds: "m-dip" })));
    await assertFails(addDoc(changes(db), change("trainerP7", { machineIds: Array.from({ length: 31 }, () => "m-dip") })));
    await assertFails(addDoc(changes(db), change("trainerP7", { reason: "x".repeat(501) })));
    await assertFails(addDoc(changes(db), change("trainerP7", { extra: true })));
    const { machineIds: _m, ...noMachines } = change("trainerP7");
    void _m;
    await assertFails(addDoc(changes(db), noMachines));
  });

  // Oct 8 2026 (the first-session screens): can't do, reopened, a re-plan and
  // the Academy sheet's column are changes too, appended the same way.
  it("accepts the four kinds the first-session screens write, and still refuses a kind it doesn't know", async () => {
    await seed();
    const db = ctx("otherP7");
    await assertSucceeds(addDoc(changes(db), change("otherP7", { kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared" })));
    await assertSucceeds(addDoc(changes(db), change("otherP7", { kind: "cando", machineIds: ["m-dip"], reason: "Cleared by the surgeon" })));
    await assertSucceeds(
      addDoc(changes(db), change("otherP7", { kind: "replan", machineIds: ["m-leg-press", "m-compound-row"], value: "Surgery coming up" })),
    );
    await assertSucceeds(addDoc(changes(db), change("otherP7", { kind: "column", machineIds: [], value: "male-novice" })));
    await assertFails(addDoc(changes(db), change("otherP7", { kind: "delete", machineIds: [] })));
    await assertFails(addDoc(changes(db), change("otherP7", { kind: "cantDo", machineIds: ["m-dip"] })));
  });

  it("is read by anyone signed in, and by nobody signed out", async () => {
    await seed();
    await assertSucceeds(getDocs(changes(ctx("otherP7"))));
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), "routines", "r1", "planChanges")));
  });

  it("is never edited or removed", async () => {
    await seed();
    const ref = doc(ctx("trainerP7"), "routines", "r1", "planChanges", "c0");
    await assertFails(updateDoc(ref, { reason: "changed my mind" }));
    await assertFails(deleteDoc(ref));
  });

  it("keeps someone with no trainer record out", async () => {
    await seed();
    await assertFails(addDoc(changes(ctx("strangerP7")), change("strangerP7")));
  });
});

/* OCT 8 2026 (the first-session screens, AJ's "1a"): starting routines.
   Head office's are routine presets with a `start` part, on the
   routinePresets rules as they are; each studio's choice is
   studios/{s}/config/startingRoutines, written by its leaders and read by
   everyone who works there (src/features/routine-plan/starting-store.ts).
   Its own block, as the oct7 one above. */
describe("oct8 first session: starting routines and a studio's choice", () => {
  const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const person = (id: string, role: string, home: string) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home] });
      await person("adminP8", "Admin", "studioA");
      await person("leaderP8", "StudioLeader", "studioA");
      await person("trainerP8", "LifeTransformer", "studioA");
      await person("otherLeaderP8", "StudioLeader", "studioB");
      await person("otherTrainerP8", "LifeTransformer", "studioB");
    });
  }

  const choiceRef = (db: ReturnType<typeof ctx>, studio = "studioA") => doc(db, "studios", studio, "config", "startingRoutines");
  const choice = (uid: string, over: Record<string, unknown> = {}) => ({
    use: ["academy-knee", "academy-low-back"],
    defaultId: "academy-knee",
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    ...over,
  });

  it("lets a studio's leaders write its choice, and everyone who works there read it", async () => {
    await seed();
    const leader = ctx("leaderP8");
    await assertSucceeds(setDoc(choiceRef(leader), choice("leaderP8")));
    // "All of head office's" is null; an empty list is "none ticked".
    await assertSucceeds(setDoc(choiceRef(leader), choice("leaderP8", { use: null, defaultId: null })));
    await assertSucceeds(setDoc(choiceRef(leader), choice("leaderP8", { use: [] })));
    await assertSucceeds(getDoc(choiceRef(ctx("trainerP8"))));
    // Someone who works at another studio, trainer or leader, doesn't read it; nor does a stranger.
    await assertFails(getDoc(choiceRef(ctx("otherTrainerP8"))));
    await assertFails(getDoc(choiceRef(ctx("otherLeaderP8"))));
    await assertFails(getDoc(choiceRef(ctx("strangerP8"))));
    await assertFails(setDoc(choiceRef(ctx("trainerP8")), choice("trainerP8")));
    await assertFails(setDoc(choiceRef(ctx("otherLeaderP8")), choice("otherLeaderP8")));
    await assertFails(deleteDoc(choiceRef(leader)));
  });

  it("holds the choice to its shape, signed by the person and the server's time", async () => {
    await seed();
    const db = ctx("leaderP8");
    await assertFails(setDoc(choiceRef(db), choice("trainerP8")));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { updatedAt: new Date("2026-01-01T00:00:00Z") })));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { extra: true })));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { use: "academy-knee" })));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { use: Array.from({ length: 81 }, (_, i) => `r-${i}`) })));
    await assertSucceeds(setDoc(choiceRef(db), choice("leaderP8", { use: Array.from({ length: 80 }, (_, i) => `r-${i}`) })));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { defaultId: 7 })));
    await assertFails(setDoc(choiceRef(db), choice("leaderP8", { defaultId: "x".repeat(201) })));
    const { defaultId: _d, ...noDefault } = choice("leaderP8");
    void _d;
    await assertFails(setDoc(choiceRef(db), noDefault));
  });

  const startingPreset = (over: Record<string, unknown> = {}) => ({
    name: "Knee issues",
    description: "For a client with a knee problem.",
    machineIds: ["m-leg-curl", "m-leg-press", "m-compound-row"],
    scope: "global",
    tier: "company",
    start: { dayOne: ["m-leg-curl", "m-leg-press"], matchWords: ["knee"], default: false, kind: "condition", source: "The Academy" },
    createdAt: serverTimestamp(),
    createdBy: "adminP8",
    ...over,
  });

  it("lets only an administrator write head office's starting routine, start part and all", async () => {
    await seed();
    await assertSucceeds(setDoc(doc(ctx("adminP8"), "routinePresets", "academy-knee"), startingPreset()));
    await assertFails(setDoc(doc(ctx("trainerP8"), "routinePresets", "academy-core"), startingPreset({ createdBy: "trainerP8" })));
    await assertFails(setDoc(doc(ctx("leaderP8"), "routinePresets", "academy-core"), startingPreset({ createdBy: "leaderP8" })));
    // Nor can a trainer make it head office's default by editing its start part.
    await assertFails(updateDoc(doc(ctx("trainerP8"), "routinePresets", "academy-knee"), { "start.default": true }));
    await assertSucceeds(updateDoc(doc(ctx("adminP8"), "routinePresets", "academy-knee"), { "start.default": true }));
  });

  it("lets a studio's leaders write their own studio's starting routine, and every trainer read them by Start a plan's queries", async () => {
    await seed();
    const own = (uid: string) => startingPreset({ tier: "studio", scope: "studioA", studioId: "studioA", createdBy: uid });
    await assertSucceeds(setDoc(doc(ctx("leaderP8"), "routinePresets", "a-walkin"), own("leaderP8")));
    await assertFails(setDoc(doc(ctx("otherLeaderP8"), "routinePresets", "b-walkin"), own("otherLeaderP8")));
    const db = ctx("trainerP8");
    await assertSucceeds(getDocs(query(collection(db, "routinePresets"), where("tier", "==", "company"), where("scope", "==", "global"))));
    await assertSucceeds(getDocs(query(collection(db, "routinePresets"), where("tier", "==", "studio"), where("scope", "==", "studioA"))));
  });

  // Exactly what store.ts's startPlan sends for a client with no Routine A
  // (`routineId: null`): the routine made with its plan, and the plan's first
  // change, named for the starting routine, in one batch. Routine A is made
  // EMPTY and the plan carries day one, because the consult is not Routine A
  // (AJ, Oct 8 2026: "this also counts with the consult visit, sometimes the
  // consult machines will not be the same as their a routine").
  it("lets a trainer keep a starting lineup: an empty Routine A made with its plan and its first change, in one batch", async () => {
    await seed();
    const db = ctx("trainerP8");
    const intended = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"];
    const batch = writeBatch(db);
    const routineRef = doc(collection(db, "routines"));
    batch.set(routineRef, {
      clientId: "c-new",
      name: "Routine A",
      machineIds: [],
      plan: {
        purpose: "Learning the protocol: the starting routine",
        purposeKinds: ["core"],
        intended,
        dayOne: ["m-leg-press", "m-compound-row"],
        building: true,
        templateId: "academy-low-back",
        madeByUid: "trainerP8",
        madeByName: "trainerP8",
        madeAt: "2026-10-08",
      },
      createdAt: serverTimestamp(),
      studioId: "studioA",
    });
    batch.set(doc(collection(db, "routines", routineRef.id, "planChanges")), {
      kind: "start",
      machineIds: intended,
      value: "Low back issues",
      byUid: "trainerP8",
      byName: "trainerP8",
      at: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());

    // Signed as someone else, the same batch is refused whole.
    const forged = writeBatch(db);
    const forgedRef = doc(collection(db, "routines"));
    forged.set(forgedRef, { clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press"], studioId: "studioA" });
    forged.set(doc(collection(db, "routines", forgedRef.id, "planChanges")), {
      kind: "start", machineIds: ["m-leg-press"], byUid: "leaderP8", at: serverTimestamp(),
    });
    await assertFails(forged.commit());
  });
});

// WHO'S THIS? (the open session round, Oct 9 2026). An open session's sets
// carry no client; naming the client is ONE batch that gives the session its
// client and every set the same one (src/features/open-session/assign.ts).
// The set rule kept a set's client fixed, so Assign moved the session and
// its sets were refused, silently. Now a set with no client may take the
// client its own session is given in the same batch, while that session is
// still open, and nothing else about a set's client may change.
describe("open session: Who's this? gives the session and its sets one client", () => {
  const OPEN = "openSess";
  const CLIENT = "assignClient";
  const SETS = [
    { id: `${OPEN}_m-leg-press`, machineId: "m-leg-press" },
    { id: `${OPEN}_m-pulldown`, machineId: "m-pulldown" },
    { id: `${OPEN}_m-torso-rotation_Left`, machineId: "m-torso-rotation", side: "Left" },
    { id: `${OPEN}_m-torso-rotation_Right`, machineId: "m-torso-rotation", side: "Right" },
  ];
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", CLIENT), {
        firstName: "Sam", lastName: "Open", isActive: true, homeStudioId: "studioA", sessionCount: 4,
      });
      // As Open session starts one: no client, an empty list, run by trainerA at studio A.
      await setDoc(doc(db, "sessions", OPEN), {
        isUnassigned: true, sessionType: "Standard", sessionNumber: 0, date: "2026-10-09",
        hostedAtStudioId: "studioA", clientHomeStudioId: null, isCrossTrain: false,
        sessionMachineIds: ["m-leg-press", "m-pulldown", "m-torso-rotation"],
        trainerInitials: "TA", trainerName: "Trainer A", trainerId: "trainerA", startedByTrainerId: "trainerA",
        status: "In-Progress", pausedAt: null, totalPausedMs: 0,
      });
      // Its sets, as the tracker writes them with no client: no clientId field at all.
      for (const s of SETS) {
        await setDoc(doc(db, "exerciseLogs", s.id), {
          sessionId: OPEN, machineId: s.machineId, ...(s.side ? { side: s.side } : {}),
          weight: "100", reps: "10", machineSettings: {}, studioId: "studioA", homeStudioId: "", clientHomeStudioId: "",
        });
      }
    });
  });

  /** The assign batch as the tracker builds it. */
  const assignBatch = (
    db: ReturnType<typeof as>,
    client = CLIENT,
    setClient = client,
    sets: { id: string; machineId: string }[] = SETS,
  ) => {
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), {
      clientId: client, isUnassigned: false, mindbodyClientId: null, clientName: "Sam Open",
      homeStudioId: "studioA", clientHomeStudioId: "studioA", isCrossTrain: false, sessionNumber: 5,
      lastHeartbeatAt: serverTimestamp(),
    });
    for (const s of sets) {
      b.set(doc(db, "exerciseLogs", s.id), {
        sessionId: OPEN, machineId: s.machineId, clientId: setClient, homeStudioId: "studioA", clientHomeStudioId: "studioA",
      }, { merge: true });
    }
    return b;
  };

  it("passes for the session's trainer: the session and every set get the client in one batch", async () => {
    const db = as("trainerA");
    await assertSucceeds(assignBatch(db).commit());
    const after = await getDoc(doc(db, "exerciseLogs", SETS[2].id));
    expect(after.data()?.clientId).toBe(CLIENT);
    expect(after.data()?.weight).toBe("100");
  });

  /* The review (Oct 9 2026): each set's rule reads the trainer, the session
     before the write and the session after it, against a limit of 20
     document reads a batch. Four sets could not tell whether repeated reads
     of the same documents are counted once, so this assigns a whole
     FileMaker-floor session: the four above and eight more machines on both
     sides, twenty sets in one batch with the session. */
  it("passes for a whole floor's session: twenty sets and the session in one batch", async () => {
    const more = Array.from({ length: 8 }, (_, i) => `m-floor-${i + 1}`).flatMap((machineId) =>
      (["Left", "Right"] as const).map((side) => ({ id: `${OPEN}_${machineId}_${side}`, machineId, side })),
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const s of more) {
        await setDoc(doc(db, "exerciseLogs", s.id), {
          sessionId: OPEN, machineId: s.machineId, side: s.side,
          weight: "80", reps: "9", machineSettings: {}, studioId: "studioA", homeStudioId: "", clientHomeStudioId: "",
        });
      }
    });
    const all = [...SETS, ...more];
    expect(all).toHaveLength(20);
    const db = as("trainerA");
    await assertSucceeds(assignBatch(db, CLIENT, CLIENT, all).commit());
    const last = await getDoc(doc(db, "exerciseLogs", all[19].id));
    expect(last.data()?.clientId).toBe(CLIENT);
    expect(last.data()?.reps).toBe("9");
  });

  it("a set that has a client can't be moved, even in the assign batch", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "exerciseLogs", SETS[0].id), { clientId: "someoneElse" });
    });
    await assertFails(assignBatch(as("trainerA")).commit());
  });

  it("a set can't take a client its session doesn't get", async () => {
    await assertFails(assignBatch(as("trainerA"), CLIENT, "someoneElse").commit());
  });

  it("a set can't take a client on its own, with the session left open", async () => {
    const db = as("trainerA");
    await assertFails(
      setDoc(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", clientId: CLIENT }, { merge: true }),
    );
  });

  it("once the session has its client, a set left behind can't follow on its own", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), { clientId: CLIENT, isUnassigned: false });
    b.set(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", clientId: CLIENT }, { merge: true });
    await assertSucceeds(b.commit());
    await assertFails(
      setDoc(doc(db, "exerciseLogs", SETS[1].id), { sessionId: OPEN, machineId: "m-pulldown", clientId: CLIENT }, { merge: true }),
    );
    // ...while a set that has the client is written as before.
    await assertSucceeds(
      setDoc(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", reps: "11" }, { merge: true }),
    );
  });

  it("a set can't change sessions on the way", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), { clientId: CLIENT, isUnassigned: false });
    b.set(doc(db, "exerciseLogs", SETS[0].id), { sessionId: "sessionA", machineId: "m-leg-press", clientId: CLIENT }, { merge: true });
    await assertFails(b.commit());
  });

  it("a trainer the session is nothing to is refused the batch", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
    });
    await assertFails(assignBatch(as("trainerC")).commit());
  });

  /* SETTINGS HELD ON THE SESSION (the open session round, Oct 9 2026; AJ's
     "3a"). Before its client is chosen, the machine card keeps what was
     typed on the session, `heldSetup.{machineId}` (it went to the ghost
     `clientMachineSettings/_{machineId}`); Assign saves each machine to the
     client in its own batch and deletes `heldSetup` in the session's write
     (src/features/open-session/held-store.ts). No rule changed: the
     sessions update rule already lets the session's trainer write it. */
  it("lets the session's trainer keep a set-up on the open session, one machine at its own path", async () => {
    const db = as("trainerA");
    await assertSucceeds(
      updateDoc(doc(db, "sessions", OPEN), {
        "heldSetup.m-leg-press": { values: { Seat: "12" }, at: serverTimestamp(), byUid: "trainerA" },
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, "sessions", OPEN), {
        // A value taken from a suggestion keeps its source beside it (the review, Oct 9 2026).
        "heldSetup.m-pulldown": { values: { "Back pad": "3" }, sources: { "Back pad": "suggested" }, at: serverTimestamp(), byUid: "trainerA" },
      }),
    );
    const after = await getDoc(doc(db, "sessions", OPEN));
    expect(after.data()?.heldSetup?.["m-leg-press"]?.values).toEqual({ Seat: "12" });
    expect(after.data()?.heldSetup?.["m-pulldown"]?.values).toEqual({ "Back pad": "3" });
    expect(after.data()?.heldSetup?.["m-pulldown"]?.sources).toEqual({ "Back pad": "suggested" });
    expect(after.data()?.isUnassigned).toBe(true);
  });

  it("refuses a held set-up from a trainer the session is nothing to", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
    });
    await assertFails(
      updateDoc(doc(as("trainerC"), "sessions", OPEN), {
        "heldSetup.m-leg-press": { values: { Seat: "12" }, at: serverTimestamp(), byUid: "trainerC" },
      }),
    );
  });

  it("passes the assign batch that saves the held set-up to the client and clears it from the session", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "sessions", OPEN), {
        heldSetup: { "m-leg-press": { values: { Seat: "12" }, sources: { Seat: "suggested" }, byUid: "trainerA" } },
      });
      // What the client already has on the machine: the move writes only the dial it set.
      await setDoc(doc(context.firestore(), "clientMachineSettings", `${CLIENT}_m-leg-press`), {
        clientId: CLIENT, machineId: "m-leg-press", settings: { Seat: "4", "Back pad": "3" },
      });
    });
    const db = as("trainerA");
    // As the tracker builds it: the session's write names its client and deletes what it held, in one update.
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), {
      clientId: CLIENT, isUnassigned: false, mindbodyClientId: null, clientName: "Sam Open",
      homeStudioId: "studioA", clientHomeStudioId: "studioA", isCrossTrain: false, sessionNumber: 5,
      lastHeartbeatAt: serverTimestamp(), heldSetup: deleteField(),
    });
    for (const st of SETS) {
      b.set(doc(db, "exerciseLogs", st.id), {
        sessionId: OPEN, machineId: st.machineId, clientId: CLIENT, homeStudioId: "studioA", clientHomeStudioId: "studioA",
      }, { merge: true });
    }
    b.set(
      doc(db, "clientMachineSettings", `${CLIENT}_m-leg-press`),
      { clientId: CLIENT, machineId: "m-leg-press", settings: { Seat: "12" }, sources: { Seat: "suggested" }, updatedAt: new Date(), updatedBy: "trainerA" },
      { merge: true },
    );
    b.set(doc(collection(db, "machines", "m-leg-press", "settingHistory")), {
      clientId: CLIENT, timestamp: new Date().toISOString(), trainerId: "trainerA", trainerName: "Trainer A",
      changeType: "SETTINGS", oldValue: "Seat: 4", newValue: "Seat: 12", reason: "Settings update",
    });
    await assertSucceeds(b.commit());
    const session = await getDoc(doc(db, "sessions", OPEN));
    expect(session.data()?.heldSetup).toBeUndefined();
    expect(session.data()?.clientId).toBe(CLIENT);
    const setting = await getDoc(doc(db, "clientMachineSettings", `${CLIENT}_m-leg-press`));
    expect(setting.data()?.settings).toEqual({ Seat: "12", "Back pad": "3" });
    expect(setting.data()?.sources).toEqual({ Seat: "suggested" });
  });

  /* THE WHOLE-BRANCH REVIEW (Oct 9 2026). */
  it("gives an open session only a client on record: a refused New client refuses the assign with it", async () => {
    const db = as("trainerA");
    // New client's own write was refused, so the client isn't there: the session and its sets can't name them.
    await assertFails(assignBatch(db, "ghostClient").commit());
    await assertFails(updateDoc(doc(db, "sessions", OPEN), { clientId: "ghostClient", isUnassigned: false }));
    // The client written in the same batch is on record once it lands.
    const b = assignBatch(db, "brandNew");
    b.set(doc(db, "clients", "brandNew"), { firstName: "Bo", lastName: "New", homeStudioId: "studioA", isActive: true, remainingSessions: 0 });
    await assertSucceeds(b.commit());
  });

  it("the write that gives a set its client must close the session: one left open with a client lets no set follow on its own", async () => {
    const db = as("trainerA");
    // The session named, but left open: refused.
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), { clientId: CLIENT });
    b.set(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", clientId: CLIENT }, { merge: true });
    await assertFails(b.commit());
    // A session already open WITH a client (as a Finish before this round could leave one): a set can't take it alone.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "sessions", OPEN), { clientId: CLIENT });
    });
    await assertFails(
      setDoc(doc(db, "exerciseLogs", SETS[1].id), { sessionId: OPEN, machineId: "m-pulldown", clientId: CLIENT }, { merge: true }),
    );
  });

  it("a Finish that lands after a refused Who's this? closes the session and names its client on every set", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.update(doc(db, "sessions", OPEN), {
      status: "Completed", endTime: serverTimestamp(), clientId: CLIENT, isUnassigned: false,
      homeStudioId: "studioA", clientHomeStudioId: "studioA", hostedAtStudioId: "studioA",
      trainerId: "trainerA", trainerName: "Trainer A", trainerInitials: "TA",
    });
    for (const st of SETS) {
      b.set(doc(db, "exerciseLogs", st.id), { sessionId: OPEN, machineId: st.machineId, clientId: CLIENT, homeStudioId: "studioA" }, { merge: true });
    }
    await assertSucceeds(b.commit());
  });

  it("after a refused assign, a set of the still-open session may let go of the client it was typed with", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Typed after Who's this? was tapped: created with the client while the assign was on its way, then refused.
      await updateDoc(doc(context.firestore(), "exerciseLogs", SETS[0].id), { clientId: CLIENT });
    });
    const db = as("trainerA");
    await assertSucceeds(
      setDoc(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", clientId: deleteField() }, { merge: true }),
    );
    expect((await getDoc(doc(db, "exerciseLogs", SETS[0].id))).data()?.clientId).toBeUndefined();
    // ...and then the client chosen next takes it in the assign.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "otherClient"), { firstName: "Other", lastName: "One", isActive: true, homeStudioId: "studioA" });
    });
    await assertSucceeds(assignBatch(db, "otherClient").commit());
  });

  it("a set of a session that has its client can't let go of it", async () => {
    const db = as("trainerA");
    await assertSucceeds(assignBatch(db).commit());
    await assertFails(
      setDoc(doc(db, "exerciseLogs", SETS[0].id), { sessionId: OPEN, machineId: "m-leg-press", clientId: deleteField() }, { merge: true }),
    );
  });

  it("keeps heldSetup on an open session only: a client's session can't be given one", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "sessions", OPEN), { clientId: CLIENT, isUnassigned: false });
    });
    await assertFails(
      updateDoc(doc(as("trainerA"), "sessions", OPEN), {
        "heldSetup.m-leg-press": { values: { Seat: "12" }, at: serverTimestamp(), byUid: "trainerA" },
      }),
    );
    // Its other writes go on as before (a heartbeat).
    await assertSucceeds(updateDoc(doc(as("trainerA"), "sessions", OPEN), { lastHeartbeatAt: serverTimestamp() }));
  });
});

// ── THE FRANCHISE PARTITION (Gate B, Oct 2026) ──────────────────────────
// A franchise owner leads their home and owned studios (trainers/{uid}.
// ownedStudioIds, written by administrators only) exactly as a studio leader
// leads theirs, and nothing anywhere else. ROADMAP.md Gate B.
// Kept in its own block so other branches' rules edits merge cleanly.
describe("the franchise partition: an owner runs their own studios and no other", () => {
  const A = "studioA";
  const B = "studioB";
  const C = "studioC";
  const DEMO = "demo-studio";
  /** Contexts carry no role claim unless a test passes one: the costliest path. */
  const ctx = (uid: string, claims: Record<string, unknown> = {}) =>
    testEnv.authenticatedContext(uid, { email: `${uid}@test.com`, ...claims }).firestore();
  type Db = ReturnType<typeof ctx>;
  const nameOf = (id: string) => `Person ${id}`;
  const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) => ({
    fullName: nameOf(id),
    initials: "XX",
    role,
    primaryHomeStudioId: home,
    accessibleStudioIds: [home],
    email: `${id}@test.com`,
    ...over,
  });
  const client = (home: string, over: Record<string, unknown> = {}) => ({
    firstName: "Carol",
    lastName: `At ${home}`,
    isActive: true,
    remainingSessions: 10,
    homeStudioId: home,
    ...over,
  });
  const scan = (uid: string, studioId: string) => ({
    testedAt: "2026-09-02",
    device: "InBody 270S",
    source: "manual",
    studioId,
    enteredBy: uid,
    enteredByName: nameOf(uid),
    createdAt: serverTimestamp(),
    weightLb: 172.4,
    skeletalMuscleMassLb: 68.1,
    bodyFatMassLb: 53.8,
    percentBodyFat: 31.2,
    bmi: 27.8,
    totalBodyWaterLb: null,
    dryLeanMassLb: null,
    fatFreeMassLb: null,
    basalMetabolicRateKcal: null,
    smi: null,
    phaseAngle: null,
    segmentalLean: null,
  });
  const notice = (over: Record<string, unknown> = {}) => ({
    title: "Deep clean Friday",
    shortContent: "Floor closes at 3.",
    longContent: "",
    authorId: "adminP",
    authorName: "Head Office",
    studioId: "all",
    targetScope: "universal",
    targetId: "",
    isActive: true,
    priority: "low",
    readBy: [],
    ...over,
  });
  const studioNotice = (uid: string, studioId: string, over: Record<string, unknown> = {}) =>
    notice({ authorId: uid, authorName: nameOf(uid), studioId, targetScope: "studio", targetId: studioId, targetStudioIds: [studioId], ...over });
  const networkNotice = (uid: string, networkId: string, studioIds: string[], over: Record<string, unknown> = {}) =>
    notice({ authorId: uid, authorName: nameOf(uid), studioId: "", targetScope: "network", targetId: networkId, targetStudioIds: studioIds, ...over });
  const signUp = (id: string, studioId: string, over: Record<string, unknown> = {}) => ({
    fullName: "New Hire",
    email: `${id}@example.com`,
    status: "Pending",
    userId: id,
    requestedStudioId: studioId,
    ...over,
  });
  const hire = (role: string, home: string, over: Record<string, unknown> = {}) => ({
    fullName: "New Hire",
    initials: "NH",
    role,
    primaryHomeStudioId: home,
    accessibleStudioIds: [home],
    activeGuestStudioIds: [],
    email: "new@test.com",
    ...over,
  });
  const week = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [] };
  const renewalSettings = (uid: string) => ({
    conversationAtSessionsLeft: 12,
    breakDays: 14,
    payAsYouGoCountsAs: "retained",
    packages: [{ key: "committed", label: "Committed", sessions: 96, payments: 12 }],
    updatedBy: uid,
  });
  /** What focusWrite sends (admin/network/network-actions.ts): dot paths, signed, the server's time. */
  const focus = (uid: string, over: Record<string, unknown> = {}) => ({
    "relayFocus.note": "Slow turnarounds this quarter",
    "relayFocus.setBy": { id: uid, name: nameOf(uid) },
    "relayFocus.setAt": serverTimestamp(),
    ...over,
  });
  const pendingFor = (db: Db, field: string, ids: string[]) =>
    getDocs(query(collection(db, "access_requests"), where("status", "==", "Pending"), where(field, "in", ids)));
  const pendingAll = (db: Db) => getDocs(query(collection(db, "access_requests"), where("status", "==", "Pending")));

  // The budget (§A.8 of the design): set RULES_BUDGET_REPORT to a file path
  // to have each budget case's evaluations appended there, read off the
  // emulator's rule-coverage report before and after the one request (the
  // sum of every values[].count, children included: docs/KNOWN-TRAPS.md,
  // "writesForStudio is itself most of the budget"). The tests assert
  // success either way: a blown budget is PERMISSION_DENIED.
  const REPORT_FILE = process.env.RULES_BUDGET_REPORT ?? "";
  const REPORT = REPORT_FILE !== "";
  // The report carries the whole rules file and every count so far, so a
  // measured test reads it twice per case: time for that.
  const BUDGET_TIMEOUT = 120_000;
  async function coverageCount(): Promise<number> {
    const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
    const res = await fetch(`http://${host}/emulator/v1/projects/demo-ai-studio:ruleCoverage`);
    const body = (await res.json()) as { report?: unknown };
    let total = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key === "values" && Array.isArray(value)) {
            for (const item of value) {
              const count = (item as { count?: unknown } | null)?.count;
              if (typeof count === "number") total += count;
            }
          }
          walk(value);
        }
      }
    };
    walk(body.report ?? []);
    return total;
  }
  async function measured<T>(label: string, run: () => Promise<T>): Promise<T> {
    if (!REPORT) return run();
    const before = await coverageCount();
    const out = await run();
    const after = await coverageCount();
    fs.appendFileSync(REPORT_FILE, `[rules budget] ${label}: ${after - before}\n`);
    return out;
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const batch = writeBatch(db);
      const put = (path: string, data: Record<string, unknown>) => batch.set(doc(db, path), data);

      // Studios and networks (a studio has one network in real data; netAB is a fixture).
      put(`studios/${A}`, { name: "Studio A", networkId: "netA" });
      put(`studios/${B}`, { name: "Studio B", networkId: "netB" });
      put(`studios/${C}`, { name: "Studio C" });
      put(`studios/${DEMO}`, { name: "Practice", isDemo: true, mindbodyMode: "offline" });
      put("networks/netA", { name: "Net A", ownerIds: [], studioIds: [A] });
      put("networks/netB", { name: "Net B", ownerIds: [], studioIds: [B] });
      put("networks/netAB", { name: "Net AB", ownerIds: [], studioIds: [A, B] });

      // People.
      put("trainers/franchiseA", person("franchiseA", "FranchiseOwner", A, { ownedStudioIds: [A] }));
      put("trainers/franchiseB", person("franchiseB", "FranchiseOwner", B, { ownedStudioIds: [B] }));
      put("trainers/franchiseAB", person("franchiseAB", "FranchiseOwner", A, { ownedStudioIds: [A, B] }));
      put("trainers/legacyOwner", person("legacyOwner", "Owner", C, { ownedStudioIds: [B] }));
      put("trainers/franchiseBare", person("franchiseBare", "FranchiseOwner", C));
      put("trainers/grantA2", person("grantA2", "LifeTransformer", C, { managedStudioIds: [A] }));
      put("trainers/adminP", person("adminP", "Admin", C));
      put("trainers/leaderA", person("leaderA", "StudioLeader", A));
      put("trainers/demotedAdmin", person("demotedAdmin", "LifeTransformer", A));
      put("trainers/demotedLeader", person("demotedLeader", "LifeTransformer", A));
      put("trainers/promotedAdmin", person("promotedAdmin", "Admin", A));
      put("trainers/multiA", person("multiA", "LifeTransformer", A, { accessibleStudioIds: [A, B] }));
      put("trainers/adminAtA", person("adminAtA", "Admin", A));
      put("trainers/ownerAtA", person("ownerAtA", "StudioOwner", A));
      put("trainers/heldOwner", person("heldOwner", "LifeTransformer", A, { ownedStudioIds: [B] }));
      put("trainers/trainerC", person("trainerC", "LifeTransformer", C));
      // What the administrator's Owns control writes (design §C.24): owned B, and B under "also works at".
      put("trainers/ownerX", person("ownerX", "FranchiseOwner", C, { ownedStudioIds: [B], accessibleStudioIds: [C, B] }));
      put("trainers/ownerXBare", person("ownerXBare", "FranchiseOwner", C, { ownedStudioIds: [B] }));
      // claim-admin has NO trainer document: an account answered by its claim alone.

      // Clients, and what hangs off them.
      for (const [id, home] of [["clientA", A], ["clientB", B]] as const) {
        put(`clients/${id}`, client(home));
        put(`clients/${id}/ford/f1`, { clientId: id, studioId: home, pillar: "family", body: "Wife is Karen.", authorId: "trainerA", isArchived: false });
        put(`clients/${id}/inbodyScans/s1`, { ...scan("trainerA", home), createdAt: new Date() });
        put(`clients/${id}/sharedNotes/n1`, { clientId: id, title: "Plan", body: "Hips first", kind: "plan", authorId: "trainerA", authorName: "Trainer A", updatedAt: new Date() });
        put(`clients/${id}/machineTotals/current`, { machineStats: { "m-leg-press": { timesPerformed: 4 } } });
      }
      put("clients/clientCross", client(A, { approvedCrossTrainStudioIds: [B] }));
      put("clients/clientCross/machineTotals/current", { machineStats: { "m-leg-press": { timesPerformed: 2 } } });
      put("sessions/sA", { hostedAtStudioId: A, clientId: "clientA" });
      put("sessions/sB", { hostedAtStudioId: B, clientId: "clientB" });
      put("sessions/sCross", { hostedAtStudioId: C, clientId: "clientA" });
      for (const [suffix, clientId] of [["A", "clientA"], ["B", "clientB"]] as const) {
        put(`journalEntries/j${suffix}`, { clientId, body: "Knee better", authorId: "trainerA" });
        put(`routines/r${suffix}`, { clientId, name: "Routine A" });
        put(`progressReports/p${suffix}`, { clientId, trainerId: "trainerA" });
        put(`clientFocuses/cf${suffix}`, { clientId, trainerId: "trainerA", category: "Posture" });
      }

      // Each studio's own records.
      for (const s of [A, B]) {
        put(`studios/${s}/config/renewals`, { ...renewalSettings("ownerA"), updatedAt: new Date() });
        put(`studios/${s}/roster/m1`, { source: "catalog", basedOn: "m-leg-press" });
        put(`studios/${s}/vault/v1`, { studioId: s, kind: "incident", title: "Slip", status: "open" });
        put(`studios/${s}/clientStates/clientX`, { state: "drifting" });
        put(`studios/${s}/watch/journey`, { v: 1 });
      }
      put(`studios/${C}/config/renewals`, { ...renewalSettings("ownerA"), updatedAt: new Date() });
      for (const [s, uid] of [[A, "trainerA"], [B, "trainerB"]] as const) {
        put(`studios/${s}/standingWeeks/${uid}`, {
          studioId: s,
          trainerUid: uid,
          trainerId: uid,
          trainerName: nameOf(uid),
          proposed: week,
          proposedAt: new Date("2026-09-20T12:00:00Z"),
          proposedBy: { id: uid, name: nameOf(uid) },
        });
      }

      // Notices.
      put("hub_announcements/univ", notice());
      put("hub_announcements/noteA", studioNotice("adminP", A, { authorName: "Head Office" }));
      put("hub_announcements/noteB", studioNotice("franchiseB", B));
      put("hub_announcements/noteNet", networkNotice("franchiseA", "netA", [A], { asksRead: true }));
      put("hub_announcements/noteNetAB", networkNotice("adminP", "netAB", [A, B], { authorName: "Head Office" }));

      // Access requests, and a Pending sign-up for every new trainer
      // document a non-administrator creates below, so each refusal is for
      // the reason its line names (design §A.3.3).
      put("access_requests/reqA", signUp("reqA", A));
      put("access_requests/reqB", signUp("reqB", B));
      put("access_requests/reqNone", { fullName: "No Studio", email: "none@example.com", status: "Pending", userId: "reqNone" });
      put("access_requests/reqDemo", signUp("reqDemo", DEMO));
      put("access_requests/saA", { type: "studio_access", trainerId: "trainerB", fullName: "Trainer B", studioId: A, status: "Pending" });
      put("access_requests/saB", { type: "studio_access", trainerId: "trainerA", fullName: "Trainer A", studioId: B, status: "Pending" });
      for (const id of ["hireA", "hireA2", "hireA3", "hireA4", "hireA5", "hireA6", "hireA7", "hireA8", "hireOA1", "hireOA2", "hireOA3", "hireL1", "hireL2"]) {
        put(`access_requests/${id}`, signUp(id, A));
      }
      put("access_requests/hireB1", signUp("hireB1", B));
      put("access_requests/hireZ", signUp("hireZ", B));
      await batch.commit();
    });
  });

  // 1.
  it("lets a franchise owner read their own studio's client records, through the app's queries", async () => {
    const db = ctx("franchiseA");
    await assertSucceeds(getDoc(doc(db, "clients", "clientA")));
    await assertSucceeds(getDocs(query(collection(db, "clients"), where("homeStudioId", "==", A))));
    await assertSucceeds(getDocs(query(collection(db, "clients"), where("homeStudioId", "in", [A]))));
    await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
    await assertSucceeds(getDocs(query(collectionGroup(db, "ford"), where("studioId", "==", A))));
    await assertSucceeds(getDoc(doc(db, "clients", "clientA", "inbodyScans", "s1")));
    await assertSucceeds(getDoc(doc(db, "clients", "clientA", "sharedNotes", "n1")));
    await assertSucceeds(getDoc(doc(db, "clients", "clientA", "machineTotals", "current")));
    await assertSucceeds(getDoc(doc(db, "sessions", "sA")));
    await assertSucceeds(getDocs(query(collection(db, "sessions"), where("clientId", "==", "clientA"))));
    await assertSucceeds(getDocs(query(collection(db, "sessions"), where("hostedAtStudioId", "==", A))));
  });

  // 2.
  it("refuses a franchise owner another studio's client records, both ways round", async () => {
    for (const [uid, other, otherClient] of [["franchiseA", B, "clientB"], ["franchiseB", A, "clientA"]] as const) {
      const db = ctx(uid);
      const otherSession = other === B ? "sB" : "sA";
      await assertFails(getDoc(doc(db, "clients", otherClient)));
      await assertFails(getDocs(query(collection(db, "clients"), where("homeStudioId", "==", other))));
      await assertFails(getDocs(query(collection(db, "clients"), where("homeStudioId", "in", [other]))));
      await assertFails(getDoc(doc(db, "clients", otherClient, "ford", "f1")));
      await assertFails(getDocs(query(collectionGroup(db, "ford"), where("studioId", "==", other))));
      await assertFails(getDoc(doc(db, "clients", otherClient, "inbodyScans", "s1")));
      await assertFails(getDoc(doc(db, "clients", otherClient, "sharedNotes", "n1")));
      await assertFails(getDoc(doc(db, "clients", otherClient, "machineTotals", "current")));
      await assertFails(getDoc(doc(db, "sessions", otherSession)));
      await assertFails(getDocs(query(collection(db, "sessions"), where("clientId", "==", otherClient))));
      await assertFails(getDocs(query(collection(db, "sessions"), where("hostedAtStudioId", "==", other))));
      // Nor the whole collection, nor every FORD detail.
      await assertFails(getDocs(collection(db, "clients")));
      await assertFails(getDocs(collectionGroup(db, "ford")));
    }
  });

  // 3.
  it("answers the same with the production token's role claim", async () => {
    const db = ctx("franchiseA", { role: "FranchiseOwner" });
    await assertSucceeds(getDoc(doc(db, "clients", "clientA")));
    await assertFails(getDoc(doc(db, "clients", "clientB")));
    await assertFails(updateDoc(doc(db, "studios", B), { name: "Not mine" }));
  });

  // 4.
  it("counts the legacy role 'Owner' as a franchise owner of their owned studios", async () => {
    const db = ctx("legacyOwner");
    await assertSucceeds(getDoc(doc(db, "clients", "clientB")));
    await assertFails(getDoc(doc(db, "clients", "clientA")));
  });

  // 5.
  it("gives a franchise owner who owns nothing their home studio only", async () => {
    const db = ctx("franchiseBare");
    await assertFails(getDoc(doc(db, "clients", "clientA")));
    await assertFails(getDoc(doc(db, "clients", "clientB")));
    await assertSucceeds(getDoc(doc(db, "studios", C, "config", "renewals")));
    await assertFails(getDoc(doc(db, "studios", A, "config", "renewals")));
  });

  // 6.
  it("lets a franchise owner write their own studio's records as its leaders do, and no other studio's", async () => {
    const db = ctx("franchiseA");
    const uid = "franchiseA";
    const writes = (s: string, clientId: string, weekOf: string): (() => Promise<unknown>)[] => [
      () => updateDoc(doc(db, "clients", clientId), { phone: "555-0101" }),
      () => setDoc(doc(db, "clients", clientId, "inbodyScans", "new1"), scan(uid, s)),
      () => updateDoc(doc(db, "clients", clientId, "ford", "f1"), { body: "Wife is Karen; two boys." }),
      // The floor.
      () => updateDoc(doc(db, "studios", s, "roster", "m1"), { status: "inactive" }),
      () => setDoc(doc(db, "studios", s, "config", "renewals"), renewalSettings(uid)),
      () => setDoc(doc(db, "studios", s, "vault", "v2"), { studioId: s, kind: "incident", title: "Wet floor", status: "open", createdBy: { id: uid, name: nameOf(uid) }, createdAt: serverTimestamp() }),
      () => getDocs(collection(db, "studios", s, "vault")),
      () =>
        setDoc(doc(db, "studios", s, "watchlist", "clientX"), {
          clientId: "clientX", snoozedUntil: "2026-11-01", dismissedAt: null, dismissedBy: null, dismissedByName: null,
          lastVisitAtDismissal: null, nextBookingAtDismissal: null, updatedAt: serverTimestamp(),
        }),
      () =>
        setDoc(doc(db, "studios", s, "inactiveMarks", "eowyn"), {
          clientId: "eowyn", reason: "moved", note: "Moved to Denver", day: "2026-10-01",
          markedBy: { id: uid, name: nameOf(uid) }, markedAt: serverTimestamp(),
        }),
      () =>
        setDoc(doc(db, "studios", s, "bookingMarks", "bk1"), {
          noShow: true, clientId: "eowyn", day: "2026-09-28", markedBy: { id: uid, name: nameOf(uid) }, markedAt: serverTimestamp(),
        }),
      () =>
        setDoc(doc(db, "studios", s, "cases", "eowyn"), {
          clientId: "eowyn", clientName: "Eowyn Rohan", owner: { id: "trainerA", name: "Trainer A" },
          nextStep: "Phone her after Thursday.", dueOn: "2026-10-01", outcome: "open",
          openedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid,
        }),
      () =>
        setDoc(
          doc(db, "studios", s, "standingWeeks", weekOf),
          { final: week, finalAt: serverTimestamp(), finalBy: { id: uid, name: uid } },
          { merge: true },
        ),
      () =>
        setDoc(doc(db, "studios", s, "teamJobs", "j1"), {
          studioId: s, title: "Deep clean", createdBy: { id: uid, name: nameOf(uid) }, createdAt: serverTimestamp(),
          status: "open", parts: { p1: { label: "Leg press", order: 1 } }, assignees: [], assigneeIds: [],
        }),
      () => setDoc(doc(db, "studios", s, "scheduleCoverage", "2026-10"), { days: arrayUnion("2026-10-01", "2026-10-02") }, { merge: true }),
      () =>
        setDoc(doc(db, "studios", s, "openingsMarks", "1-0800"), {
          weekday: 1, time: "08:00", mark: "full", note: "The rotation's regulars", by: { id: uid, name: nameOf(uid) }, at: serverTimestamp(),
        }),
    ];
    for (const write of writes(A, "clientA", "trainerA")) await assertSucceeds(write());
    for (const write of writes(B, "clientB", "trainerB")) await assertFails(write());
    // The leaders' reads of the night's states.
    await assertSucceeds(getDocs(collection(db, "studios", A, "clientStates")));
    await assertSucceeds(getDoc(doc(db, "studios", A, "watch", "journey")));
    await assertFails(getDocs(collection(db, "studios", B, "clientStates")));
    await assertFails(getDoc(doc(db, "studios", B, "watch", "journey")));
  });

  // 7.
  it("keeps the deletes only owners and administrators could make to an owner's own studio, and never decides one from a clientId anyone can rewrite", async () => {
    // A studio leader gains nothing here: still refused.
    await assertFails(deleteDoc(doc(ctx("ownerA"), "journalEntries", "jA")));
    const db = ctx("franchiseA");
    await assertFails(deleteDoc(doc(db, "journalEntries", "jB")));
    await assertFails(deleteDoc(doc(db, "clientFocuses", "cfB")));
    await assertFails(deleteDoc(doc(db, "clients", "clientB", "ford", "f1")));
    await assertSucceeds(deleteDoc(doc(db, "journalEntries", "jA")));
    await assertSucceeds(deleteDoc(doc(db, "clientFocuses", "cfA")));
    await assertSucceeds(deleteDoc(doc(db, "clients", "clientA", "ford", "f1")));
    // Routines and progress reports: administrators only now (any trainer can rewrite their clientId).
    await assertFails(deleteDoc(doc(db, "routines", "rA")));
    await assertFails(deleteDoc(doc(db, "progressReports", "pA")));
    // The re-point: a B routine pointed at an A client is still not A's owner's to delete.
    const b = ctx("trainerB");
    await assertSucceeds(updateDoc(doc(b, "routines", "rB"), { clientId: "clientA" }));
    await assertFails(updateDoc(doc(b, "clientFocuses", "cfB"), { clientId: "clientA" }));
    await assertFails(deleteDoc(doc(db, "routines", "rB")));
    await assertSucceeds(deleteDoc(doc(ctx("adminP"), "routines", "rB")));
  });

  // 8.
  it("never lets a franchise owner change their own access fields", async () => {
    const db = ctx("franchiseA");
    const own = doc(db, "trainers", "franchiseA");
    await assertFails(updateDoc(own, { ownedStudioIds: arrayUnion(B) }));
    await assertFails(updateDoc(own, { accessibleStudioIds: arrayUnion(B) }));
    await assertFails(updateDoc(own, { primaryHomeStudioId: B }));
    await assertFails(updateDoc(own, { role: "Admin" }));
    await assertFails(updateDoc(own, { role: "StudioLeader" }));
    await assertFails(updateDoc(own, { managedStudioIds: [B] }));
    await assertSucceeds(updateDoc(own, { bio: "Runs Studio A" }));
  });

  // 9.
  it("never lets anyone but an administrator change anyone's ownedStudioIds", async () => {
    await assertFails(updateDoc(doc(ctx("franchiseAB"), "trainers", "trainerA"), { ownedStudioIds: [A] }));
    await assertFails(updateDoc(doc(ctx("ownerA"), "trainers", "trainerA"), { ownedStudioIds: [A] }));
  });

  // 10.
  it("lets a franchise owner change the people of their own studios, within them", async () => {
    const db = ctx("franchiseA");
    const ta = doc(db, "trainers", "trainerA");
    await assertSucceeds(updateDoc(ta, { role: "HeadTrainer" }));
    await assertSucceeds(updateDoc(ta, { role: "Owner" }));
    await assertFails(updateDoc(ta, { role: "Admin" }));
    await assertSucceeds(updateDoc(ta, { managedStudioIds: arrayUnion(A) }));
    await assertFails(updateDoc(ta, { accessibleStudioIds: arrayUnion(B) }));
    await assertFails(updateDoc(ta, { primaryHomeStudioId: B }));
    // Someone based at another studio: nothing.
    await assertFails(updateDoc(doc(db, "trainers", "trainerB"), { initials: "BB" }));
    await assertFails(updateDoc(doc(db, "trainers", "trainerB"), { role: "HeadTrainer" }));
    // An owner of A and B moves a person from one to the other.
    await assertSucceeds(updateDoc(doc(ctx("franchiseAB"), "trainers", "trainerA"), { primaryHomeStudioId: B, accessibleStudioIds: [B] }));
  });

  // 11.
  it("lets a franchise owner approve a new person into their studio, with the owner tier's ceiling and nothing beyond it", async () => {
    const db = ctx("franchiseA");
    const make = (id: string, data: Record<string, unknown>) => setDoc(doc(db, "trainers", id), data);
    await assertSucceeds(make("hireA", hire("LifeTransformer", A)));
    await assertSucceeds(make("hireA2", hire("Owner", A)));
    await assertFails(make("hireA3", hire("Admin", A)));
    await assertFails(make("hireA4", hire("LifeTransformer", A, { accessibleStudioIds: [A, B] })));
    await assertFails(make("hireA5", hire("LifeTransformer", A, { activeGuestStudioIds: [B] })));
    await assertFails(make("hireA6", hire("LifeTransformer", A, { ownedStudioIds: [A] })));
    await assertFails(make("hireA7", hire("LifeTransformer", A, { managedStudioIds: [B] })));
    await assertFails(make("hireB1", hire("LifeTransformer", B)));
  });

  // 12.
  it("closes a studio leader's own climb: their access fields, the grant's, and a hire's", async () => {
    const db = ctx("ownerA");
    const own = doc(db, "trainers", "ownerA");
    await assertFails(updateDoc(own, { ownedStudioIds: [B] }));
    await assertFails(updateDoc(own, { primaryHomeStudioId: B }));
    await assertFails(updateDoc(own, { accessibleStudioIds: [A, B] }));
    await assertFails(updateDoc(own, { managedStudioIds: [B] }));
    await assertSucceeds(updateDoc(own, { bio: "Runs the floor" }));
    await assertFails(updateDoc(doc(ctx("grantA2"), "trainers", "grantA2"), { managedStudioIds: arrayUnion(B) }));
    await assertFails(setDoc(doc(db, "trainers", "hireOA1"), hire("LifeTransformer", A, { ownedStudioIds: [B] })));
    await assertFails(setDoc(doc(db, "trainers", "hireOA2"), hire("LifeTransformer", A, { accessibleStudioIds: [A, B] })));
    await assertFails(updateDoc(doc(db, "trainers", "trainerA"), { accessibleStudioIds: arrayUnion(B) }));
  });

  // 13.
  it("keeps what a studio IS to administrators: its network, owner record, Mindbody link and practice flag", async () => {
    const f = ctx("franchiseA");
    await assertSucceeds(updateDoc(doc(f, "studios", A), { name: "Studio A (West)" }));
    await assertFails(updateDoc(doc(f, "studios", B), { name: "Not mine" }));
    for (const identity of [{ networkId: "netB" }, { mindbodySiteId: "999" }, { mindbodyLocationId: "9" }, { ownerId: "franchiseA" }, { isDemo: true }]) {
      await assertFails(updateDoc(doc(f, "studios", A), identity));
    }
    await assertFails(setDoc(doc(f, "studios", "studioZ"), { name: "Studio Z" }));
    const owner = ctx("ownerA");
    await assertFails(updateDoc(doc(owner, "studios", A), { mindbodySiteId: "999" }));
    await assertSucceeds(updateDoc(doc(owner, "studios", A), { journeyCutoverDate: "2026-10-01" }));
    const admin = ctx("adminP");
    for (const identity of [{ networkId: "netB" }, { mindbodySiteId: "999" }, { mindbodyLocationId: "9" }, { ownerId: "franchiseA" }, { isDemo: true }, { name: "Studio B" }]) {
      await assertSucceeds(updateDoc(doc(admin, "studios", B), identity));
    }
    await assertSucceeds(setDoc(doc(admin, "studios", "studioZ"), { name: "Studio Z" }));
  });

  it("lets anyone re-seed the practice studio, never with a Mindbody link, a network, or off offline", async () => {
    // What the seeder writes (demo-mode/seed-core.ts buildStudio), whole, by whoever presses Reset.
    const seeded = (by: string) => ({
      name: "Demo Studio",
      address: "Practice floor",
      timezone: "America/New_York",
      mindbodyMode: "offline",
      locationType: "corporate",
      journeyCutoverDate: "2025-09-05",
      sessionMinutes: 30,
      ownerId: by,
      isDemo: true,
      demoSeedVersion: 7,
      demoSeededAt: new Date("2026-10-10T12:00:00Z"),
      demoSeededBy: nameOf(by),
      createdAt: new Date("2025-09-05T12:00:00Z"),
    });
    await assertSucceeds(setDoc(doc(ctx("trainerA"), "studios", DEMO), seeded("trainerA")));
    const c = ctx("trainerC");
    for (const change of [
      { mindbodySiteId: "5746957" },
      { mindbodyLocationId: "1" },
      { networkId: "netAB" },
      { isDemo: false },
      { mindbodyMode: "linked" },
    ]) {
      await assertFails(updateDoc(doc(c, "studios", DEMO), change));
    }
    await assertFails(setDoc(doc(c, "studios", DEMO), { ...seeded("trainerC"), mindbodySiteId: "5746957" }));
    await assertSucceeds(updateDoc(doc(c, "studios", DEMO), { name: "Practice 2" }));
    // Laid down from nothing.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), "studios", DEMO));
    });
    await assertFails(setDoc(doc(c, "studios", DEMO), { ...seeded("trainerC"), mindbodySiteId: "5746957" }));
    await assertSucceeds(setDoc(doc(c, "studios", DEMO), seeded("trainerC")));
    // An administrator may.
    await assertSucceeds(updateDoc(doc(ctx("adminP"), "studios", DEMO), { mindbodySiteId: "5746957" }));
  });

  // 14.
  it("lets a franchise owner set the focus of a network holding their studio, that field alone, signed and in shape", async () => {
    const f = ctx("franchiseA");
    await assertSucceeds(updateDoc(doc(f, "networks", "netA"), focus("franchiseA")));
    await assertFails(updateDoc(doc(f, "networks", "netB"), focus("franchiseA")));
    await assertFails(updateDoc(doc(f, "networks", "netA"), { studioIds: [A, B] }));
    await assertFails(updateDoc(doc(f, "networks", "netA"), { ownerIds: ["franchiseA"] }));
    await assertFails(updateDoc(doc(f, "networks", "netA"), { ...focus("franchiseA"), name: "y" }));
    await assertFails(setDoc(doc(f, "networks", "netNew"), { name: "Mine", studioIds: [A], ownerIds: ["franchiseA"] }));
    // The focus's shape. Unsigned, on a network with no focus yet.
    await assertFails(updateDoc(doc(f, "networks", "netAB"), { "relayFocus.note": "x" }));
    await assertFails(updateDoc(doc(f, "networks", "netA"), focus("franchiseA", { "relayFocus.setBy": { id: "adminX", name: nameOf("franchiseA") } })));
    await assertFails(updateDoc(doc(f, "networks", "netA"), focus("franchiseA", { "relayFocus.setBy": { id: "franchiseA", name: "Head Office" } })));
    await assertFails(updateDoc(doc(f, "networks", "netA"), focus("franchiseA", { "relayFocus.setAt": 0 })));
    await assertFails(updateDoc(doc(f, "networks", "netA"), focus("franchiseA", { "relayFocus.note": "n".repeat(501) })));
    await assertFails(updateDoc(doc(f, "networks", "netA"), focus("franchiseA", { "relayFocus.extra": 1 })));
    // AJ, Sep 27 2026: every network that holds a studio in their scope.
    await assertSucceeds(updateDoc(doc(f, "networks", "netAB"), focus("franchiseA")));
    // A studio leader is not a franchise owner.
    await assertFails(updateDoc(doc(ctx("ownerA"), "networks", "netA"), focus("ownerA", { "relayFocus.setBy": { id: "ownerA", name: "Owner A" } })));
    const admin = ctx("adminP");
    await assertSucceeds(setDoc(doc(admin, "networks", "netNew"), { name: "New", studioIds: [A], ownerIds: [] }));
    await assertSucceeds(updateDoc(doc(admin, "networks", "netA"), { studioIds: [A, C] }));
  });

  // 15.
  it("lets a franchise owner post to their studios and their whole networks, under their own name, and afterwards only take a notice down", async () => {
    const f = ctx("franchiseA");
    const put = (db: Db, id: string, data: Record<string, unknown>) => setDoc(doc(db, "hub_announcements", id), data);
    await assertSucceeds(put(f, "fA1", studioNotice("franchiseA", A)));
    await assertFails(put(f, "fB1", studioNotice("franchiseA", B)));
    await assertFails(put(f, "fAll", notice({ authorId: "franchiseA", authorName: nameOf("franchiseA") })));
    await assertSucceeds(put(f, "fN1", networkNotice("franchiseA", "netA", [A])));
    await assertFails(put(f, "fN2", networkNotice("franchiseA", "netAB", [A, B])));
    await assertFails(put(f, "fN3", networkNotice("franchiseA", "netA", [A, B])));
    // A studio notice reaches its studio only.
    await assertFails(put(f, "fA2", studioNotice("franchiseA", A, { targetStudioIds: [A, B] })));
    await assertFails(put(ctx("ownerA"), "oA2", studioNotice("ownerA", A, { authorName: "Owner A", targetStudioIds: [A, B] })));
    // Afterwards: only taken down.
    const fA1 = doc(f, "hub_announcements", "fA1");
    await assertFails(updateDoc(fA1, { targetStudioIds: [A, B] }));
    await assertFails(updateDoc(fA1, { title: "Rewritten" }));
    await assertFails(updateDoc(fA1, { isActive: false, title: "x" }));
    await assertSucceeds(updateDoc(fA1, { isActive: false }));
    await assertFails(updateDoc(doc(f, "hub_announcements", "univ"), { isActive: false }));
    // Only administrators delete.
    await assertFails(deleteDoc(doc(f, "hub_announcements", "noteB")));
    await assertFails(deleteDoc(fA1));
    await assertSucceeds(deleteDoc(doc(ctx("adminP"), "hub_announcements", "fN1")));
    // The read count.
    await assertFails(getDocs(collection(f, "hub_announcements", "noteB", "acks")));
    await assertSucceeds(getDocs(collection(f, "hub_announcements", "fA1", "acks")));
    // An owner of A and B reaches the network of both.
    await assertSucceeds(put(ctx("franchiseAB"), "fAB1", networkNotice("franchiseAB", "netAB", [A, B])));
    // Administrators: everyone, and the words.
    const admin = ctx("adminP");
    await assertSucceeds(put(admin, "aAll", notice({ authorName: nameOf("adminP") })));
    await assertSucceeds(updateDoc(doc(admin, "hub_announcements", "noteA"), { title: "Deep clean Saturday" }));
  });

  it("signs a leader's notice with their own name, and leaves head office's words to head office", async () => {
    const owner = ctx("ownerA");
    const put = (id: string, data: Record<string, unknown>) => setDoc(doc(owner, "hub_announcements", id), data);
    await assertFails(put("oA1", studioNotice("ownerA", A, { authorName: "Max Strength Head Office" })));
    await assertSucceeds(put("oA2", studioNotice("ownerA", A, { authorName: "Owner A" })));
    await assertFails(updateDoc(doc(owner, "hub_announcements", "noteA"), { title: "Rewritten" }));
    await assertFails(updateDoc(doc(owner, "hub_announcements", "noteA"), { longContent: "Rewritten" }));
    // A leader takes a notice off their own studio.
    await assertSucceeds(updateDoc(doc(owner, "hub_announcements", "noteA"), { isActive: false }));
  });

  it("lets a notice's author take it down after the network grows, and nobody else who doesn't run all of it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "networks", "netA"), { studioIds: [A, B] });
    });
    await assertFails(updateDoc(doc(ctx("franchiseB"), "hub_announcements", "noteNet"), { isActive: false }));
    await assertSucceeds(updateDoc(doc(ctx("franchiseA"), "hub_announcements", "noteNet"), { isActive: false }));
  });

  it("never frees a notice's id for someone else to re-create, or its acks to be read", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "hub_announcements", "noteB", "acks", "trainerB"), { at: new Date(), name: "Trainer B" });
    });
    await assertFails(deleteDoc(doc(ctx("franchiseB"), "hub_announcements", "noteB")));
    const c = ctx("trainerC");
    await assertFails(setDoc(doc(c, "hub_announcements", "noteB"), studioNotice("trainerC", DEMO)));
    await assertFails(getDocs(collection(c, "hub_announcements", "noteB", "acks")));
  });

  // The attack round (Oct 2026): two app buttons the partition's rules
  // refuse. The rules are right under the model; the fix was in the app,
  // which no longer offers them (ProgressReportArchive's Delete and the
  // Pulse draft's Discard to administrators only; AdminAnnouncementsTab's
  // live list through reach.ts mayTakeDown). These hold the rules where
  // the app now stands, with and without the role claim.
  it("REGRESSION (attack round): a franchise owner deletes no progress report, not even a Pulse draft they started on a client at a studio they run; an administrator does", async () => {
    for (const claims of [{}, { role: "FranchiseOwner" }]) {
      const db = ctx("franchiseAB", claims);
      // OWNER-1: the Pulse draft's Discard (checkin-draft.ts discardCheckInDraft).
      const draft = await addDoc(collection(db, "progressReports"), {
        clientId: "clientB",
        trainerId: "franchiseAB",
        status: "Draft",
        isCheckInOnly: true,
        createdAt: serverTimestamp(),
      });
      await assertFails(deleteDoc(doc(db, "progressReports", draft.id)));
      // OWNER-2: the profile archive's Delete (ClientProfileView performReportDelete).
      await assertFails(deleteDoc(doc(db, "progressReports", "pB")));
      await assertSucceeds(deleteDoc(doc(ctx("adminP"), "progressReports", draft.id)));
    }
    await assertSucceeds(deleteDoc(doc(ctx("adminP"), "progressReports", "pB")));
  });

  it("REGRESSION (attack round): a franchise owner takes down only the notices of the studios and networks they run, never head office's to everyone or to a studio they don't run", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "hub_announcements", "noteC"), studioNotice("adminP", C, { authorName: "Head Office" }));
    });
    for (const claims of [{}, { role: "FranchiseOwner" }]) {
      const db = ctx("franchiseAB", claims);
      // OWNER-3: head office's notice to everyone.
      await assertFails(updateDoc(doc(db, "hub_announcements", "univ"), { isActive: false }));
      // Head office's notice to studio C, which they don't run.
      await assertFails(updateDoc(doc(db, "hub_announcements", "noteC"), { isActive: false }));
    }
    const db = ctx("franchiseAB", { role: "FranchiseOwner" });
    // A notice to B (owned), by someone else; and head office's to netAB, every studio theirs.
    await assertSucceeds(updateDoc(doc(db, "hub_announcements", "noteB"), { isActive: false }));
    await assertSucceeds(updateDoc(doc(db, "hub_announcements", "noteNetAB"), { isActive: false }));
    // A studio's leader: their own studio's, never another's or everyone's.
    const leader = ctx("leaderA");
    await assertFails(updateDoc(doc(leader, "hub_announcements", "univ"), { isActive: false }));
    await assertFails(updateDoc(doc(leader, "hub_announcements", "noteC"), { isActive: false }));
    await assertSucceeds(updateDoc(doc(leader, "hub_announcements", "noteA"), { isActive: false }));
  });

  // 16.
  it("lets whoever runs the studio a request names read and approve it, through queries that name the studio", async () => {
    for (const uid of ["ownerA", "franchiseA"]) {
      const db = ctx(uid);
      await assertSucceeds(getDoc(doc(db, "access_requests", "reqA")));
      await assertFails(getDoc(doc(db, "access_requests", "reqB")));
      await assertFails(getDoc(doc(db, "access_requests", "reqNone")));
      await assertSucceeds(pendingFor(db, "requestedStudioId", [A]));
      await assertSucceeds(pendingFor(db, "studioId", [A]));
      await assertFails(pendingAll(db));
    }
    await assertSucceeds(getDoc(doc(ctx("franchiseA"), "access_requests", "saA")));
    await assertFails(getDoc(doc(ctx("franchiseA"), "access_requests", "saB")));
    await assertSucceeds(pendingFor(ctx("franchiseAB"), "requestedStudioId", [A, B]));
    await assertSucceeds(getDoc(doc(ctx("grantA2"), "access_requests", "reqA")));
    // Never Demo Mode's id: everyone has the run of it.
    await assertFails(getDoc(doc(ctx("trainerA"), "access_requests", "reqDemo")));
    // Approving.
    const owner = ctx("ownerA");
    await assertFails(updateDoc(doc(owner, "access_requests", "reqB"), { status: "Approved" }));
    await assertFails(updateDoc(doc(owner, "access_requests", "reqA"), { status: "Approved", requestedStudioId: B }));
    await assertSucceeds(updateDoc(doc(owner, "access_requests", "reqA"), { status: "Approved" }));
    // Administrators: every request.
    const admin = ctx("adminP");
    await assertSucceeds(pendingAll(admin));
    await assertSucceeds(getDoc(doc(admin, "access_requests", "reqNone")));
    await assertSucceeds(deleteDoc(doc(admin, "access_requests", "reqB")));
  });

  it("lets an approval change the status and its stamps, and nothing else", async () => {
    const owner = ctx("ownerA");
    const reqA = doc(owner, "access_requests", "reqA");
    for (const change of [{ userId: "adminP" }, { trainerId: "x" }, { type: "studio_access" }, { email: "x@test.com" }]) {
      await assertFails(updateDoc(reqA, change));
    }
    await assertSucceeds(updateDoc(reqA, { status: "Approved", approvedTrainerId: "reqA", updatedAt: "2026-10-10T15:00:00.000Z" }));
  });

  it("keeps a studio-access request at its own id, naming one real studio, so nobody squats a stranger's sign-up", async () => {
    const a = ctx("trainerA");
    const ask = (studioId: string, over: Record<string, unknown> = {}) => ({ type: "studio_access", trainerId: "trainerA", studioId, status: "Pending", ...over });
    await assertFails(setDoc(doc(a, "access_requests", "trainerC"), ask(B)));
    await assertFails(setDoc(doc(a, "access_requests", "sa_trainerA_studioC"), ask(B)));
    await assertFails(setDoc(doc(a, "access_requests", "sa_trainerA_studioC"), ask(C, { userId: "trainerA" })));
    await assertFails(setDoc(doc(a, "access_requests", "sa_trainerA_studioC"), ask(C, { requestedStudioId: A })));
    await assertFails(setDoc(doc(a, "access_requests", `sa_trainerA_${DEMO}`), ask(DEMO)));
    const mine = doc(a, "access_requests", "sa_trainerA_studioB");
    await assertSucceeds(setDoc(mine, ask(B)));
    await assertFails(updateDoc(mine, { studioId: A }));
    await assertSucceeds(setDoc(mine, ask(B)));
    // The stranger's own sign-up still goes through.
    await assertSucceeds(
      setDoc(doc(ctx("trainerC"), "access_requests", "trainerC"), { fullName: "Trainer C", email: "trainerC@test.com", status: "Pending", userId: "trainerC" }),
    );
  });

  // 17.
  it("leaves a trainer's own studio work as it was", async () => {
    const a = ctx("trainerA");
    await assertSucceeds(getDoc(doc(a, "clients", "clientA")));
    await assertSucceeds(updateDoc(doc(a, "clients", "clientA"), { phone: "555-0102" }));
    await assertSucceeds(setDoc(doc(a, "sessions", "sNew"), { hostedAtStudioId: A, clientId: "clientA", trainerId: "trainerA" }));
    await assertSucceeds(
      setDoc(doc(a, "clients", "clientA", "ford", "f2"), { clientId: "clientA", studioId: A, pillar: null, body: "Off to Italy in May", authorId: "trainerA", isArchived: false }),
    );
    await assertSucceeds(setDoc(doc(a, "studios", A, "scheduleCoverage", "2026-10"), { days: arrayUnion("2026-10-03") }, { merge: true }));
    await assertFails(getDoc(doc(a, "clients", "clientB")));
  });

  // 18.
  it("leaves an administrator every studio, and ownership theirs to write", async () => {
    const admin = ctx("adminP");
    await assertSucceeds(getDoc(doc(admin, "clients", "clientB")));
    await assertSucceeds(getDoc(doc(admin, "sessions", "sB")));
    await assertSucceeds(getDocs(collection(admin, "studios", B, "vault")));
    await assertSucceeds(updateDoc(doc(admin, "studios", B, "roster", "m1"), { status: "inactive" }));
    await assertSucceeds(deleteDoc(doc(admin, "journalEntries", "jB")));
    await assertSucceeds(updateDoc(doc(admin, "trainers", "franchiseA"), { ownedStudioIds: arrayUnion(B) }));
    await assertSucceeds(updateDoc(doc(admin, "trainers", "adminP"), { ownedStudioIds: [C] }));
  });

  // 19.
  it("hands out nothing on a stale claim: the trainer document's role decides an authority write", async () => {
    const demoted = ctx("demotedAdmin", { role: "Admin" });
    await assertFails(updateDoc(doc(demoted, "trainers", "trainerB"), { role: "HeadTrainer" }));
    await assertFails(updateDoc(doc(demoted, "trainers", "franchiseA"), { ownedStudioIds: [B] }));
    await assertFails(setDoc(doc(demoted, "studios", "studioZ"), { name: "Studio Z" }));
    await assertFails(updateDoc(doc(demoted, "studios", A), { mindbodySiteId: "999" }));
    await assertFails(setDoc(doc(demoted, "networks", "netNew"), { name: "New", studioIds: [A], ownerIds: [] }));
    await assertFails(setDoc(doc(demoted, "trainers", "hireZ"), hire("LifeTransformer", B)));
    await assertFails(setDoc(doc(demoted, "hub_announcements", "dAll"), notice({ authorId: "demotedAdmin", authorName: nameOf("demotedAdmin") })));
    await assertFails(updateDoc(doc(demoted, "hub_announcements", "univ"), { isActive: false }));
    // Not an authority write: the claim answers, as it always has.
    await assertSucceeds(setDoc(doc(demoted, "machineTrends", "x"), { machineId: "x" }));
    // Promoted, with the old claim: the document wins.
    await assertSucceeds(updateDoc(doc(ctx("promotedAdmin", { role: "LifeTransformer" }), "trainers", "trainerB"), { role: "HeadTrainer" }));
    // No trainer document at all: the claim still answers.
    const claimOnly = ctx("claim-admin", { role: "Admin" });
    await assertSucceeds(updateDoc(doc(claimOnly, "trainers", "trainerB"), { initials: "TB" }));
    await assertSucceeds(setDoc(doc(claimOnly, "hub_announcements", "cAll"), notice({ authorId: "claim-admin", authorName: "Head Office" })));
    // A demoted leader.
    await assertFails(updateDoc(doc(ctx("demotedLeader", { role: "StudioLeader" }), "trainers", "trainerA"), { role: "HeadTrainer" }));
  });

  // 20.
  it("changes a person's role or email only when they are within the caller's reach", async () => {
    const owner = ctx("ownerA");
    await assertSucceeds(updateDoc(doc(owner, "trainers", "multiA"), { role: "HeadTrainer" }));
    await assertFails(updateDoc(doc(owner, "trainers", "multiA"), { email: "x@test.com" }));
    await assertSucceeds(updateDoc(doc(owner, "trainers", "multiA"), { initials: "MA" }));
    const leader = ctx("leaderA");
    await assertFails(updateDoc(doc(leader, "trainers", "adminAtA"), { role: "LifeTransformer" }));
    await assertFails(updateDoc(doc(leader, "trainers", "adminAtA"), { email: "x@test.com" }));
    await assertSucceeds(updateDoc(doc(leader, "trainers", "adminAtA"), { isVisibleOnCalendar: false }));
    await assertFails(updateDoc(doc(leader, "trainers", "ownerAtA"), { role: "LifeTransformer" }));
    const ab = ctx("franchiseAB");
    await assertFails(updateDoc(doc(ab, "trainers", "franchiseA"), { role: "LifeTransformer" }));
    await assertFails(updateDoc(doc(ab, "trainers", "franchiseA"), { email: "x@test.com" }));
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { email: "new@test.com" }));
  });

  // 21.
  it("never brings a leftover ownership back to life", async () => {
    const leader = ctx("leaderA");
    await assertFails(updateDoc(doc(leader, "trainers", "heldOwner"), { role: "HeadTrainer" }));
    await assertFails(updateDoc(doc(leader, "trainers", "heldOwner"), { role: "StudioLeader" }));
    await assertSucceeds(updateDoc(doc(ctx("adminP"), "trainers", "heldOwner"), { ownedStudioIds: [] }));
    await assertSucceeds(updateDoc(doc(leader, "trainers", "heldOwner"), { role: "HeadTrainer" }));
    await assertFails(getDoc(doc(ctx("heldOwner"), "studios", B, "config", "renewals")));
  });

  // 22.
  it("never opens a claim through an update", async () => {
    const owner = ctx("ownerA");
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { pendingClaim: true }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { pendingClaim: true, email: "accomplice@test.com" }));
    await assertFails(updateDoc(doc(ctx("trainerA"), "trainers", "trainerA"), { pendingClaim: true }));
    // The claim's own tombstone on the placeholder it claimed (claim.ts tombstone()).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "placeholderOfA"), {
        fullName: "Trainer A", initials: "TA", role: "LifeTransformer", primaryHomeStudioId: A,
        accessibleStudioIds: [A], pendingClaim: true, email: "trainerA@test.com",
      });
    });
    await assertSucceeds(updateDoc(doc(ctx("trainerA"), "trainers", "placeholderOfA"), tombstone("trainerA", "2026-10-10T15:00:00.000Z")));
    await assertSucceeds(updateDoc(doc(ctx("adminP"), "trainers", "trainerA"), { pendingClaim: true }));
  });

  // 23.
  it("keeps switching an account off or on to administrators", async () => {
    const off = { isActive: false, switchedOffAt: "2026-10-10T15:00:00.000Z", switchedOffBy: { uid: "x", name: "X" } };
    for (const uid of ["ownerA", "franchiseA", "grantA2"]) {
      await assertFails(updateDoc(doc(ctx(uid), "trainers", "trainerA"), { ...off, switchedOffBy: { uid, name: nameOf(uid) } }));
    }
    await assertSucceeds(updateDoc(doc(ctx("adminP"), "trainers", "trainerA"), { ...off, switchedOffBy: { uid: "adminP", name: nameOf("adminP") } }));
  });

  // 24.
  it("keeps a studio's schedule-sync lease to the people who work there", async () => {
    const c = ctx("trainerC");
    await assertFails(setDoc(doc(c, "studios", B, "sync", "lease"), { lastScheduleSyncAt: 9e15, scheduleSyncFailures: 99 }));
    await assertFails(updateDoc(doc(c, "studios", B), { lastScheduleSyncAt: 9e15 }));
    const b = ctx("trainerB");
    await assertSucceeds(setDoc(doc(b, "studios", B, "sync", "lease"), { lastScheduleSyncAt: 1, scheduleSyncFailures: 0 }));
    await assertSucceeds(updateDoc(doc(b, "studios", B), { lastScheduleSyncAt: 2 }));
    await assertSucceeds(setDoc(doc(c, "studios", DEMO, "sync", "lease"), { lastScheduleSyncAt: 3 }));
    await assertSucceeds(setDoc(doc(ctx("adminP"), "studios", B, "sync", "lease"), { lastScheduleSyncAt: 4 }));
  });

  // 25.
  it("never lets a non-administrator plant a trainer document at someone's uid", async () => {
    const leader = ctx("leaderA");
    const plant = hire("LifeTransformer", A);
    const asked = (data: Record<string, unknown>) =>
      testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "access_requests", "claim-admin"), data);
      });
    await assertFails(setDoc(doc(leader, "trainers", "claim-admin"), plant));
    await assertSucceeds(updateDoc(doc(ctx("claim-admin", { role: "Admin" }), "studios", B), { mindbodySiteId: "999" }));
    await asked(signUp("someone-else", A));
    await assertFails(setDoc(doc(leader, "trainers", "claim-admin"), plant));
    await asked(signUp("claim-admin", B));
    await assertFails(setDoc(doc(leader, "trainers", "claim-admin"), plant));
    await asked(signUp("claim-admin", A, { status: "Approved" }));
    await assertFails(setDoc(doc(leader, "trainers", "claim-admin"), plant));
    // The app's two documents: an approval of a real sign-up, and a placeholder at an auto-id.
    await assertSucceeds(setDoc(doc(leader, "trainers", "hireL1"), hire("LifeTransformer", A, { authUid: "hireL1" })));
    await assertFails(setDoc(doc(leader, "trainers", "hireL2"), hire("LifeTransformer", A, { authUid: "someone-else" })));
    await assertSucceeds(setDoc(doc(leader, "trainers", "p".repeat(20)), hire("LifeTransformer", A, { pendingClaim: true })));
    await assertFails(setDoc(doc(leader, "trainers", "q".repeat(28)), hire("LifeTransformer", A, { pendingClaim: true })));
    await assertFails(setDoc(doc(leader, "trainers", "r".repeat(20)), hire("LifeTransformer", A, { pendingClaim: true, authUid: "r".repeat(20) })));
  });

  // 26.
  it("keeps a client record made from an iPad honest: no cross-train list, no Mindbody number in the practice studio", async () => {
    const c = ctx("trainerC");
    await assertFails(setDoc(doc(c, "clients", "100000123"), client(DEMO)));
    await assertFails(setDoc(doc(c, "clients", "29068-100000123"), client(DEMO)));
    await assertSucceeds(setDoc(doc(c, "clients", "demo-client-zz"), client(DEMO)));
    await assertSucceeds(addDoc(collection(c, "clients"), client(DEMO)));
    const a = ctx("trainerA");
    await assertFails(setDoc(doc(a, "clients", "newA"), client(A, { approvedCrossTrainStudioIds: [B] })));
    await assertSucceeds(setDoc(doc(a, "clients", "newA"), client(A)));
    await assertSucceeds(setDoc(doc(ctx("adminP"), "clients", "newA2"), client(A, { approvedCrossTrainStudioIds: [B] })));
  });

  // 27.
  it("lets an owner read and finish a cross-train visitor at a studio they own and work at", async () => {
    const x = ctx("ownerX");
    await assertSucceeds(getDoc(doc(x, "clients", "clientCross")));
    const finish = writeBatch(x);
    finish.update(doc(x, "clients", "clientCross"), { completedSessions: increment(1), lastSessionDate: "2026-10-10", updatedAt: serverTimestamp() });
    finish.set(
      doc(x, "clients", "clientCross", "machineTotals", "current"),
      {
        currentMachineMetrics: { "m-leg-press": { weight: "180", reps: "9", settings: {}, lastSessionId: "s1" } },
        machineStats: { "m-leg-press": { timesPerformed: increment(1), lastPerformedDate: "2026-10-10", lastWeight: 180 } },
        updatedAt: serverTimestamp(),
      },
      { mergeFields: ["currentMachineMetrics.m-leg-press", "machineStats.m-leg-press.timesPerformed", "machineStats.m-leg-press.lastPerformedDate", "machineStats.m-leg-press.lastWeight", "updatedAt"] },
    );
    await assertSucceeds(measured("cross-train Finish by an owner (client + totals batch)", () => finish.commit()));
    // Owned, but not on "Also works at": fails closed for the visitor (the Owns control keeps them in step).
    await assertFails(getDoc(doc(ctx("ownerXBare"), "clients", "clientCross")));
  }, BUDGET_TIMEOUT);

  // 28.
  it("keeps a network notice's read count to its author and administrators", async () => {
    await assertSucceeds(setDoc(doc(ctx("trainerA"), "hub_announcements", "noteNet", "acks", "trainerA"), { at: serverTimestamp(), name: "Trainer A" }));
    await assertFails(getDocs(collection(ctx("franchiseAB"), "hub_announcements", "noteNet", "acks")));
    await assertSucceeds(getDocs(collection(ctx("franchiseA"), "hub_announcements", "noteNet", "acks")));
    await assertSucceeds(getDocs(collection(ctx("adminP"), "hub_announcements", "noteNet", "acks")));
  });

  // 29. The attack review (Oct 10 2026), finding 1: a trainer at A made a
  // record homed at A, re-homed it to B with A on its cross-train list, and
  // kept reading it -- a record that then vouched for B's Mindbody site in
  // the proxy's cross-train check (server/auth.ts readableClientSite). A
  // client's home is an administrator's to move: nobody else changes it,
  // through either field getStudioIdFromData reads, even someone who runs
  // both studios.
  it("REGRESSION (attack review): a client's home studio is an administrator's to move, never re-homed by the studio that made the record", async () => {
    const callers = [
      ["trainerA", {}],
      ["trainerA", { role: "LifeTransformer" }],
      ["leaderA", {}],
      ["grantA2", {}],
      ["franchiseAB", {}],
      ["franchiseAB", { role: "FranchiseOwner" }],
    ] as const;
    for (const [i, [uid, claims]] of callers.entries()) {
      const db = ctx(uid, claims);
      // The shared-number form the attack used: B's site, any Mindbody id.
      const id = `222-10000005${i}`;
      await assertSucceeds(setDoc(doc(db, "clients", id), client(A)));
      // The attack's own write, and each half of it.
      await assertFails(updateDoc(doc(db, "clients", id), { homeStudioId: B, approvedCrossTrainStudioIds: [A] }));
      await assertFails(updateDoc(doc(db, "clients", id), { homeStudioId: B }));
      await assertFails(updateDoc(doc(db, "clients", id), { homeStudioId: deleteField(), studioId: B }));
      await assertFails(updateDoc(doc(db, "clients", id), { homeStudioId: "" }));
      // The record stays A's, and the studio's ordinary edits still save.
      await assertSucceeds(updateDoc(doc(db, "clients", id), { phone: "555-0109" }));
      let home: unknown = null;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        home = (await getDoc(doc(context.firestore(), "clients", id))).data()?.homeStudioId;
      });
      expect(home).toBe(A);
    }
    // The older field: a record with only studioId at A is not given a home elsewhere.
    const a = ctx("trainerA");
    await assertSucceeds(setDoc(doc(a, "clients", "legacyHomeA"), { ...client(A), homeStudioId: deleteField(), studioId: A }, { merge: true }));
    await assertFails(updateDoc(doc(a, "clients", "legacyHomeA"), { homeStudioId: B }));
    // Writing the home it already has is no change, and saves.
    await assertSucceeds(updateDoc(doc(a, "clients", "legacyHomeA"), { homeStudioId: A }));
    // An administrator moves a home (Admins → Limbo's release).
    await assertSucceeds(updateDoc(doc(ctx("adminP"), "clients", "clientA"), { homeStudioId: B }));
  });

  // 30. The attack review (Oct 10 2026), finding 2: in Demo Mode, My Studio
  // → Team offered a demo trainer the grant ("helps run the studio"), and
  // every such save is refused below administrator: a demo trainer's
  // managedStudioIds is pinned empty (isDemoTrainerPayload) and no one's led
  // studios include 'demo-studio'. The rules are right; the app no longer
  // offers it (admin/staff/edit-limits.ts hides the grant on a demo
  // trainer). This holds the rules where the app now stands.
  it("REGRESSION (attack review): nobody below administrator gives a Demo Mode trainer the grant; their other fields still save", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "demo-trainer-lt"), {
        ...person("demo-trainer-lt", "LifeTransformer", DEMO),
        isDemo: true,
        managedStudioIds: [],
        ownedStudioIds: [],
      });
    });
    for (const [uid, claims] of [
      ["franchiseAB", {}],
      ["franchiseAB", { role: "FranchiseOwner" }],
      ["leaderA", {}],
      ["trainerA", {}],
    ] as const) {
      const db = ctx(uid, claims);
      const demo = doc(db, "trainers", "demo-trainer-lt");
      await assertFails(updateDoc(demo, { isVisibleOnCalendar: false, initials: "ZZ", managedStudioIds: arrayUnion(DEMO) }));
      await assertSucceeds(updateDoc(demo, { isVisibleOnCalendar: false, initials: "ZZ" }));
    }
  });

  // ── The budget (design §B.3): the costliest real writes, each asserting success.
  describe("inside the rules' budget", () => {
    it("fits an owner's every-field change of a colleague: home, three lists, role and email in one write", async () => {
      const everything = {
        primaryHomeStudioId: B,
        accessibleStudioIds: [B],
        activeGuestStudioIds: [],
        managedStudioIds: [B],
        role: "HeadTrainer",
        email: "moved@test.com",
      };
      await assertSucceeds(measured("trainers update: owner's every-field change", () => updateDoc(doc(ctx("franchiseAB"), "trainers", "trainerA"), everything)));
      // The same by an administrator holding a claim, on the document's path (authorityRole).
      await assertSucceeds(
        measured("trainers update: administrator with a claim", () =>
          updateDoc(doc(ctx("adminP", { role: "Admin" }), "trainers", "trainerB"), { ...everything, primaryHomeStudioId: A, accessibleStudioIds: [A], managedStudioIds: [A] }),
        ),
      );
    }, BUDGET_TIMEOUT);

    it("fits an owner's approval with every list present, and a leader's, through the sign-up", async () => {
      await assertSucceeds(
        measured("trainers create: owner's approval, every list", () =>
          setDoc(doc(ctx("franchiseA"), "trainers", "hireA8"), hire("HeadTrainer", A, { managedStudioIds: [A], ownedStudioIds: [] })),
        ),
      );
      await assertSucceeds(measured("trainers create: leader's approval", () => setDoc(doc(ctx("leaderA"), "trainers", "hireA"), hire("LifeTransformer", A))));
    }, BUDGET_TIMEOUT);

    it("fits an owner's network notice, created and taken down, and a take-down of head office's network notice", async () => {
      const ab = ctx("franchiseAB");
      await assertSucceeds(measured("hub_announcements create: network notice", () => setDoc(doc(ab, "hub_announcements", "nAB"), networkNotice("franchiseAB", "netAB", [A, B]))));
      await assertSucceeds(measured("hub_announcements update: author's take-down", () => updateDoc(doc(ab, "hub_announcements", "nAB"), { isActive: false })));
      await assertSucceeds(measured("hub_announcements update: non-author network take-down", () => updateDoc(doc(ab, "hub_announcements", "noteNetAB"), { isActive: false })));
      await assertSucceeds(measured("hub_announcements update: leader's studio take-down", () => updateDoc(doc(ctx("ownerA"), "hub_announcements", "noteA"), { isActive: false })));
    }, BUDGET_TIMEOUT);

    it("fits an owner's read of a client's sessions, one hosted at another studio among them", async () => {
      await assertSucceeds(
        measured("sessions list: owner by clientId with a cross-studio session", () =>
          getDocs(query(collection(ctx("franchiseA"), "sessions"), where("clientId", "==", "clientA"))),
        ),
      );
      await assertSucceeds(measured("sessions get: owner, cross-studio session", () => getDoc(doc(ctx("franchiseA"), "sessions", "sCross"))));
    }, BUDGET_TIMEOUT);

    // The client update's home branch, with the home-unchanged check the
    // attack review added (Oct 10 2026), by an owner of the second studio.
    it("fits an owner's edit of a client at the second studio they own, writing the home it already has", async () => {
      await assertSucceeds(
        measured("clients update: owner of two, home branch, home restated", () =>
          updateDoc(doc(ctx("franchiseAB"), "clients", "clientB"), { phone: "555-0110", homeStudioId: B }),
        ),
      );
    }, BUDGET_TIMEOUT);

    it("fits an owner's full focus, the three lines at their limits", async () => {
      await assertSucceeds(
        measured("networks update: owner's full focus", () =>
          updateDoc(
            doc(ctx("franchiseA"), "networks", "netA"),
            focus("franchiseA", { "relayFocus.mastery": "m".repeat(120), "relayFocus.machine": "c".repeat(120), "relayFocus.note": "n".repeat(500) }),
          ),
        ),
      );
    }, BUDGET_TIMEOUT);

    it("fits the access-request lists and a studio rename by an owner", async () => {
      await assertSucceeds(measured("access_requests list: owner of two, requestedStudioId in", () => pendingFor(ctx("franchiseAB"), "requestedStudioId", [A, B])));
      await assertSucceeds(measured("access_requests list: owner of two, studioId in", () => pendingFor(ctx("franchiseAB"), "studioId", [A, B])));
      await assertSucceeds(measured("studios update: owner's rename", () => updateDoc(doc(ctx("franchiseAB"), "studios", B), { name: "Studio B (East)" })));
    }, BUDGET_TIMEOUT);

    // The whole-read record's costliest write, measured at 907 before the
    // partition (the grant adding a month's 31st day; firestore.rules,
    // coverageWriterAllowed): the same scale, and a franchise owner beside it.
    it("fits the 31st day added to a month, by the grant and by an owner", async () => {
      const days = Array.from({ length: 30 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
      for (const uid of ["grantA2", "franchiseA"]) {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "studios", A, "scheduleCoverage", "2026-12"), { days });
        });
        await assertSucceeds(
          measured(`scheduleCoverage update: ${uid} adds the 31st day`, () =>
            setDoc(doc(ctx(uid), "studios", A, "scheduleCoverage", "2026-12"), { days: arrayUnion("2026-12-31") }, { merge: true }),
          ),
        );
      }
    }, BUDGET_TIMEOUT);

    // The standing week's fullest agreement (it ran out at ten days away
    // before; firestore.rules, standingWeekAwayValid), by a franchise owner.
    it("fits an owner's agreement of the fullest week, six days away", async () => {
      const full = {
        hours: Array.from({ length: 21 }, (_, i) => ({
          weekday: i % 7,
          from: ["06:00", "10:00", "15:00"][Math.floor(i / 7)],
          to: ["09:00", "13:00", "20:00"][Math.floor(i / 7)],
        })),
        regulars: Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, weekday: (i % 6) + 1, start: "08:00", clientId: `c${i}`, clientName: `Client ${i}` })),
        note: "Mornings, and two evenings",
      };
      const six = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, from: `2026-1${i % 3}-0${i + 1}`, to: `2026-1${i % 3}-2${i}`, note: "Vacation" }));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", A, "standingWeeks", "trainerA"), {
          studioId: A, trainerUid: "trainerA", trainerId: "trainerA", trainerName: "Trainer A",
          proposed: full, proposedAt: new Date("2026-09-20T12:00:00Z"), proposedBy: { id: "trainerA", name: "Trainer A" },
          final: full, finalAt: new Date("2026-09-21T12:00:00Z"), finalBy: { id: "ownerA", name: "Owner A" },
          away: six,
        });
      });
      const changed = { ...full, note: "Agreed: mornings" };
      await assertSucceeds(
        measured("standingWeeks update: owner agrees the fullest week", () =>
          setDoc(
            doc(ctx("franchiseA"), "studios", A, "standingWeeks", "trainerA"),
            { proposed: changed, final: changed, finalAt: serverTimestamp(), finalBy: { id: "franchiseA", name: nameOf("franchiseA") } },
            { merge: true },
          ),
        ),
      );
    }, BUDGET_TIMEOUT);
  });

  // -- THE STUDIO MAP (Oct 2026): a machine's size, on its model (head
  // office's) and on its unit (the studio's leaders, tape-measured), and the
  // roster's create and update in resolve-once form (rosterLeaderOnce).
  // The design's §A.6; the budget cases' counts go in the round document.
  describe("the studio map", () => {
    const LP = "m-leg-press";
    /** Ten removed safety lines, each with its reason: the most the rules check one by one. */
    const removedTen = Array.from({ length: 10 }, (_, i) => ({
      field: "clinicalWarnings",
      line: `Warning ${i}`,
      reason: `Reason ${i}: this unit has no end stop to lock against.`,
      by: { uid: "leaderA", name: "Person leaderA" },
      at: "2026-10-10T15:00:00.000Z",
    }));
    const entry = (studioId: string, machineId = LP, over: Record<string, unknown> = {}) => ({
      machineId,
      studioId,
      source: "catalog",
      basedOn: machineId.startsWith("m-") ? machineId : LP,
      status: "active",
      order: 1,
      overrides: { removedSafety: removedTen },
      ...over,
    });
    const unitSize = (uid: string, over: Record<string, unknown> = {}) => ({
      lengthMm: 2120,
      widthMm: 1260,
      heightMm: 1800,
      by: uid,
      at: serverTimestamp(),
      ...over,
    });
    const sizedModel = (uid: string, over: Record<string, unknown> = {}, size: Record<string, unknown> = {}) => ({
      brand: "Imagine Strength",
      model: "IS2019 Leg Press",
      movementId: LP,
      size: { lengthMm: 2120, widthMm: 1260, heightMm: 1800, source: "Imagine Strength brochure, 2026, page 2", ...size },
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      ...over,
    });
    const roster = (db: Db, studioId: string, machineId = LP) => doc(db, "studios", studioId, "roster", machineId);
    const MODEL = "mm-imagine-strength-is2019-leg-press";
    const twenty = Array.from({ length: 20 }, (_, i) => `sm-unit-${i}`);

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const batch = writeBatch(db);
        const put = (path: string, data: Record<string, unknown>) => batch.set(doc(db, path), data);
        // The partition block has none of these; the cases below need them.
        put("trainers/trainerA", person("trainerA", "LifeTransformer", A));
        put("trainers/guestA", person("guestA", "LifeTransformer", C, { activeGuestStudioIds: [A] }));
        put("trainers/guestGrantA", person("guestGrantA", "LifeTransformer", C, { activeGuestStudioIds: [A], managedStudioIds: [A] }));
        put("trainers/trainerB", person("trainerB", "LifeTransformer", B));
        put("trainers/demoTrainer", person("demoTrainer", "LifeTransformer", C));
        put("trainers/outsiderC", person("outsiderC", "LifeTransformer", C));
        for (const s of [A, B, DEMO]) put(`studios/${s}/roster/${LP}`, entry(s));
        for (const s of [A, B]) {
          twenty.forEach((id, i) => put(`studios/${s}/roster/${id}`, entry(s, id, { source: "custom", basedOn: LP, order: i + 2, overrides: {} })));
        }
        await batch.commit();
      });
    });

    describe("the roster's writers, resolved once, are the same people as before", () => {
      it("R1: lets leaderA, franchiseAB at B, grantA2 and adminP change the walking order", async () => {
        await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { order: 2 }));
        await assertSucceeds(updateDoc(roster(ctx("franchiseAB"), B), { order: 2 }));
        await assertSucceeds(updateDoc(roster(ctx("grantA2"), A), { order: 3 }));
        await assertSucceeds(updateDoc(roster(ctx("adminP"), A), { order: 4 }));
        // An administrator answered by the claim alone, with no trainer document.
        await assertSucceeds(updateDoc(roster(ctx("claim-admin", { role: "Admin" }), B), { order: 5 }));
      });

      it("R2: refuses trainerA, guestA, franchiseA at B and outsiderC at A", async () => {
        await assertFails(updateDoc(roster(ctx("trainerA"), A), { order: 2 }));
        await assertFails(updateDoc(roster(ctx("guestA"), A), { order: 2 }));
        await assertFails(updateDoc(roster(ctx("franchiseA"), B), { order: 2 }));
        await assertFails(updateDoc(roster(ctx("outsiderC"), A), { order: 2 }));
        await assertFails(updateDoc(roster(testEnv.unauthenticatedContext().firestore(), A), { order: 2 }));
      });

      it("R3: lets anyone with a trainer document run the Demo Mode floor, as before", async () => {
        await assertSucceeds(updateDoc(roster(ctx("demoTrainer"), DEMO), { status: "maintenance" }));
      });
    });

    describe("a model's size", () => {
      const model = (db: Db, id = MODEL) => doc(db, "machineModels", id);

      it("M1, M2: lets an administrator record a size, with a height, a null height or none", async () => {
        const admin = ctx("adminP");
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP", {}, { lengthMm: 1594, widthMm: 1227, heightMm: 1850 })));
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP", {}, { heightMm: null })));
        const { heightMm: _h, ...noHeight } = sizedModel("adminP").size;
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP", { size: noHeight })));
      });

      it("M3, M4, M5: refuses a size with no source, a length out of range or a key it doesn't know", async () => {
        const admin = ctx("adminP");
        const { source: _s, ...noSource } = sizedModel("adminP").size;
        await assertFails(setDoc(model(admin), sizedModel("adminP", { size: noSource })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { source: "" })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { lengthMm: 100 })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { widthMm: 7000 })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { lengthMm: "2120" })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { weightKg: 300 })));
        await assertFails(setDoc(model(admin), sizedModel("adminP", { size: null })));
      });

      it("M6: holds the note to 400 characters", async () => {
        const admin = ctx("adminP");
        await assertFails(setDoc(model(admin), sizedModel("adminP", {}, { note: "n".repeat(401) })));
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP", {}, { note: "n".repeat(400) })));
      });

      it("M7: refuses a size from a studio's leader, who isn't an administrator", async () => {
        await assertFails(setDoc(model(ctx("leaderA")), sizedModel("leaderA")));
      });

      it("M8: lets an administrator save a sized model again, its size kept and its notes changed", async () => {
        const admin = ctx("adminP");
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP")));
        await assertSucceeds(setDoc(model(admin), sizedModel("adminP", { notes: "An 18 lb accessory stack." })));
        await assertSucceeds(getDoc(model(ctx("trainerA"))));
      });
    });

    describe("a unit's size and its model", () => {
      it("U1-U5: takes a size signed by its writer at the server's time, in range, and takes it away", async () => {
        const leader = ctx("leaderA");
        await assertSucceeds(updateDoc(roster(leader, A), { "unit.size": unitSize("leaderA") }));
        await assertFails(updateDoc(roster(leader, A), { "unit.size": unitSize("leaderA", { lengthMm: 2121, by: "someoneElse" }) }));
        await assertFails(updateDoc(roster(leader, A), { "unit.size": unitSize("leaderA", { lengthMm: 2122, at: new Date() }) }));
        await assertFails(updateDoc(roster(leader, A), { "unit.size": unitSize("leaderA", { weightLb: 400 }) }));
        await assertFails(updateDoc(roster(leader, A), { "unit.size": unitSize("leaderA", { lengthMm: 100 }) }));
        await assertSucceeds(updateDoc(roster(leader, A), { "unit.size": deleteField() }));
        // No height is fine too.
        const { heightMm: _h, ...flat } = unitSize("leaderA");
        await assertSucceeds(updateDoc(roster(leader, A), { "unit.size": flat }));
      });

      it("U6: lets another write through with an old size signed by someone else left untouched", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await updateDoc(roster(context.firestore(), A), {
            "unit.size": { lengthMm: 2120, widthMm: 1260, by: "someoneElse", at: new Date("2026-10-01T12:00:00Z") },
            "unit.serialNumber": "IS-0042",
          });
        });
        await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { status: "maintenance" }));
        await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { "unit.serialNumber": "IS-0043" }));
      });

      it("U7, U8, U9: a size from the studio's leaders only, a franchise owner at the studios they own", async () => {
        await assertFails(updateDoc(roster(ctx("trainerA"), A), { "unit.size": unitSize("trainerA") }));
        await assertSucceeds(updateDoc(roster(ctx("franchiseAB"), B), { "unit.size": unitSize("franchiseAB") }));
        await assertFails(updateDoc(roster(ctx("franchiseA"), B), { "unit.size": unitSize("franchiseA") }));
      });

      it("U10, U11: takes Mark 20 as Imagine Strength in one batch, from leaderA, franchiseAB at B and grantA2, and its Undo", async () => {
        for (const [uid, studioId] of [["leaderA", A], ["franchiseAB", B], ["grantA2", A]] as const) {
          const db = ctx(uid);
          const mark = writeBatch(db);
          for (const id of twenty) mark.update(roster(db, studioId, id), { modelId: MODEL });
          await assertSucceeds(mark.commit());
        }
        const db = ctx("leaderA");
        const undo = writeBatch(db);
        for (const id of twenty) undo.update(roster(db, A, id), { modelId: deleteField() });
        await assertSucceeds(undo.commit());
      });

      it("U13: still takes a write to an entry whose stored unit is not a map (legacy data)", async () => {
        for (const unit of [null, "IS-0042"]) {
          await testEnv.withSecurityRulesDisabled(async (context) => {
            await updateDoc(roster(context.firestore(), A), { unit });
          });
          await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { status: "maintenance" }));
          await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { status: "active" }));
        }
      });

      it("U12: takes a model id no record carries (the app, not the rules, refuses a wrong model)", async () => {
        await assertSucceeds(updateDoc(roster(ctx("leaderA"), A), { modelId: "mm-does-not-exist" }));
      });
    });

    describe("the layout (floorPlans)", () => {
      const ft = (n: number) => Math.round(n * 304.8);
      const ROOM = {
        areaSqFt: 1800,
        boxes: [{ id: "bx-1", x: 0, y: 0, w: ft(60), h: ft(30) }],
        places: [
          { id: "pc-1", kind: "door", x: -76, y: ft(22), w: 152, h: ft(3) },
          { id: "pc-2", kind: "aed", x: 0, y: ft(20), w: 305, h: 305 },
        ],
      };
      const PLACED = [
        { machineId: LP, x: 3000, y: 3000, rotationDeg: 0 },
        { machineId: "sm-unit-0", x: 6000, y: 3000, rotationDeg: 90 },
      ];
      const plan = (uid: string, rev: number, over: Record<string, unknown> = {}) => ({
        v: 1,
        name: "The layout",
        room: ROOM,
        placements: PLACED,
        rev,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...over,
      });
      const fp = (db: Db, studioId: string, id = "current") => doc(db, "studios", studioId, "floorPlans", id);
      /** A layout already on file, written past the rules. */
      const seed = async (studioId: string, id: string, rev: number, over: Record<string, unknown> = {}) => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(fp(context.firestore(), studioId, id), { ...plan("seed", rev), updatedAt: new Date("2026-10-01T12:00:00Z"), ...over });
        });
      };

      it("P1, P2, P3: is read by everyone who works at the studio, and by no one else", async () => {
        await seed(A, "current", 1);
        for (const uid of ["trainerA", "guestA", "leaderA", "franchiseA", "adminP"]) {
          await assertSucceeds(getDoc(fp(ctx(uid), A)));
        }
        for (const uid of ["trainerB", "franchiseB"]) await assertFails(getDoc(fp(ctx(uid), A)));
        await assertFails(getDoc(fp(testEnv.unauthenticatedContext().firestore(), A)));
        await assertSucceeds(getDocs(collection(ctx("trainerA"), "studios", A, "floorPlans")));
      });

      it("P4, P5, P6: is created at rev 1 and moves up by exactly one a write, so a save from an old copy is refused", async () => {
        const leader = ctx("leaderA");
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 2)));
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 1)));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1)));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 3)));
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 2)));
        // Two saves from one base (rev 2): the first lands, the second is refused.
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 3, { name: "The layout" })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 3, { placements: [] })));
      });

      it("P7, P8, P9, P10: is written by the studio's leaders, an owner at their studios, the grant and an administrator", async () => {
        await assertFails(setDoc(fp(ctx("trainerA"), A), plan("trainerA", 1)));
        await seed(A, "current", 1);
        await assertFails(setDoc(fp(ctx("trainerA"), A), plan("trainerA", 2)));
        await assertSucceeds(setDoc(fp(ctx("franchiseAB"), B), plan("franchiseAB", 1)));
        await assertFails(setDoc(fp(ctx("franchiseB"), A), plan("franchiseB", 2)));
        await assertSucceeds(setDoc(fp(ctx("grantA2"), A), plan("grantA2", 2)));
        await assertSucceeds(setDoc(fp(ctx("adminP"), C), plan("adminP", 1)));
      });

      it("P11: holds 1 to 12 boxes, 40 places and 120 placements", async () => {
        const leader = ctx("leaderA");
        const box = (i: number) => ({ id: `bx-${i}`, x: 0, y: 0, w: 1000, h: 1000 });
        const place = (i: number) => ({ id: `pc-${i}`, kind: "pillar", x: 0, y: 0, w: 300, h: 300 });
        const unit = (i: number) => ({ machineId: `m-${i}`, x: 1000, y: 1000, rotationDeg: 0 });
        const room = (boxes: number, places: number) => ({ areaSqFt: 1800, boxes: Array.from({ length: boxes }, (_, i) => box(i + 1)), places: Array.from({ length: places }, (_, i) => place(i)) });
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { room: room(0, 0) })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { room: room(13, 0) })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { room: room(1, 41) })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { placements: Array.from({ length: 121 }, (_, i) => unit(i)) })));
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 1, { room: room(12, 40), placements: Array.from({ length: 120 }, (_, i) => unit(i)) })));
      });

      it("P12, P12a, P13: refuses a key it doesn't know, an old shape, a long name, another version, a rev that isn't a number, a square footage out of range, and a stamp it didn't set", async () => {
        const leader = ctx("leaderA");
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { ceilingMm: 3000 })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { room: { ...ROOM, outline: [{ x: 0, y: 0 }] } })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { name: "n".repeat(61) })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { v: 2 })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { rev: "1" })));
        for (const areaSqFt of [150, 25000, "1800", 1800.5, null]) {
          await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { room: { ...ROOM, areaSqFt } })));
        }
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { updatedBy: "x" })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 1, { updatedAt: new Date() })));
        const { areaSqFt: _a, ...noArea } = ROOM;
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 1, { room: noArea })));
      });

      it("P14: takes `current` and the five draft slots, and no other id", async () => {
        const leader = ctx("leaderA");
        await assertSucceeds(setDoc(fp(leader, A, "d-1"), plan("leaderA", 1, { name: "Remodel 1" })));
        await assertSucceeds(setDoc(fp(leader, A, "d-5"), plan("leaderA", 1, { name: "Remodel 5" })));
        for (const id of ["d-6", "d-0", "d-12", "d-lzx1a", "Bad Id", "x-1"]) {
          await assertFails(setDoc(fp(leader, A, id), plan("leaderA", 1, { name: "Remodel" })));
        }
      });

      it("P15: never deletes a layout or a draft", async () => {
        await seed(A, "current", 1);
        await seed(A, "d-1", 1, { name: "Remodel 1" });
        for (const uid of ["adminP", "leaderA"]) {
          await assertFails(deleteDoc(fp(ctx(uid), A)));
          await assertFails(deleteDoc(fp(ctx(uid), A, "d-1")));
        }
      });

      it("P16: retires a draft and brings it back, never retires `current`, and never by a trainer", async () => {
        const leader = ctx("leaderA");
        await seed(A, "current", 1);
        await seed(A, "d-1", 1, { name: "Remodel 1" });
        await assertFails(setDoc(fp(ctx("trainerA"), A, "d-1"), plan("trainerA", 2, { name: "Remodel 1", retired: true })));
        await assertSucceeds(setDoc(fp(leader, A, "d-1"), plan("leaderA", 2, { name: "Remodel 1", retired: true })));
        await assertSucceeds(setDoc(fp(leader, A, "d-1"), plan("leaderA", 3, { name: "Remodel 1" })));
        await assertFails(setDoc(fp(leader, A, "d-1"), plan("leaderA", 4, { name: "Remodel 1", retired: false })));
        await assertFails(setDoc(fp(leader, A), plan("leaderA", 2, { retired: true })));
      });

      // Make this the map (store.ts useThisLayout): one batch, every write at its document's rev + 1.
      const toBuy = (i: number) => ({ kind: "planned", id: `pm-${i}`, label: "Hip Abductor", movementId: "m-hip-abd", modelId: null, x: 9000 + i, y: 6000, rotationDeg: 0 });
      const DRAFTED = [{ machineId: LP, x: 4000, y: 4000, rotationDeg: 90 }];
      const read = async (id: string) => (await getDoc(fp(ctx("leaderA"), A, id))).data();

      it("P17: makes a plan with nothing to buy the map: the map at rev + 1, the plan's slot keeping the old map", async () => {
        await seed(A, "current", 3);
        await seed(A, "d-1", 2, { name: "Remodel 1", placements: DRAFTED });
        const db = ctx("leaderA");
        const b = writeBatch(db);
        b.set(fp(db, A), plan("leaderA", 4, { placements: DRAFTED }));
        b.set(fp(db, A, "d-1"), plan("leaderA", 3, { name: "Before Oct 12, 3:40 PM" }));
        await assertSucceeds(b.commit());
        expect((await read("current"))?.rev).toBe(4);
        expect((await read("current"))?.placements).toEqual(DRAFTED);
        expect((await read("d-1"))?.placements).toEqual(PLACED);
      });

      it("P17a: with machines still to buy: the map takes the floor's machines only, the plan keeps its own, a free slot keeps the old map", async () => {
        await seed(A, "current", 3);
        const drafted = [...DRAFTED, toBuy(1), toBuy(2)];
        await seed(A, "d-1", 2, { name: "Remodel 1", placements: drafted });
        const db = ctx("leaderA");
        const b = writeBatch(db);
        b.set(fp(db, A), plan("leaderA", 4, { placements: DRAFTED }));
        b.set(fp(db, A, "d-1"), plan("leaderA", 3, { name: "Remodel 1", placements: drafted }));
        b.set(fp(db, A, "d-2"), plan("leaderA", 1, { name: "Before Oct 12, 3:40 PM" }));
        await assertSucceeds(b.commit());
        expect((await read("current"))?.placements).toEqual(DRAFTED);
        expect((await read("d-1"))?.placements).toHaveLength(3);
        expect((await read("d-2"))?.rev).toBe(1);
      });

      it("P18: refuses the whole batch from a stale map, a plan saved in between, or a Before slot taken in between", async () => {
        const drafted = [...DRAFTED, toBuy(1)];
        const batch = (db: Db) => {
          const b = writeBatch(db);
          b.set(fp(db, A), plan("leaderA", 4, { placements: DRAFTED }));
          b.set(fp(db, A, "d-1"), plan("leaderA", 3, { name: "Remodel 1", placements: drafted }));
          b.set(fp(db, A, "d-2"), plan("leaderA", 1, { name: "Before Oct 12, 3:40 PM" }));
          return b.commit();
        };
        // Another leader saved the map in between (it stands at 4, not 3).
        await seed(A, "current", 4);
        await seed(A, "d-1", 2, { name: "Remodel 1", placements: drafted });
        await assertFails(batch(ctx("leaderA")));
        expect((await read("d-1"))?.rev).toBe(2);
        expect((await read("d-2"))).toBeUndefined();
        // The grant saved the plan in between.
        await seed(A, "current", 3);
        await assertSucceeds(setDoc(fp(ctx("grantA2"), A, "d-1"), plan("grantA2", 3, { name: "Remodel 1", placements: drafted })));
        await assertFails(batch(ctx("leaderA")));
        expect((await read("current"))?.rev).toBe(3);
        // Another leader took the free slot in between.
        await seed(A, "d-1", 2, { name: "Remodel 1", placements: drafted });
        await assertSucceeds(setDoc(fp(ctx("grantA2"), A, "d-2"), plan("grantA2", 1, { name: "Remodel 2" })));
        await assertFails(batch(ctx("leaderA")));
        expect((await read("current"))?.rev).toBe(3);
        expect((await read("d-1"))?.rev).toBe(2);
        expect((await read("d-2"))?.name).toBe("Remodel 2");
      });

      it("P23: a plan holds 30 machines still to buy beside 90 of the floor's", async () => {
        const units = Array.from({ length: 90 }, (_, i) => ({ machineId: `m-${i}`, x: 1000 + i, y: 1000, rotationDeg: 0 }));
        await assertSucceeds(
          setDoc(fp(ctx("leaderA"), A, "d-1"), plan("leaderA", 1, { name: "Remodel 1", placements: [...units, ...Array.from({ length: 30 }, (_, i) => toBuy(i))] })),
        );
      });

      it("P19, P20: lets anyone with a trainer document arrange the Demo Mode floor, in its slots only", async () => {
        const demo = ctx("demoTrainer");
        await assertSucceeds(setDoc(fp(demo, DEMO), plan("demoTrainer", 1)));
        await assertSucceeds(setDoc(fp(demo, DEMO), plan("demoTrainer", 2)));
        await assertFails(setDoc(fp(demo, DEMO, "d-6"), plan("demoTrainer", 1, { name: "Remodel" })));
      });

      it("P21: a stale copy can't delete a draft or write it again at rev 1", async () => {
        await seed(A, "d-2", 4, { name: "Remodel 2" });
        await assertFails(deleteDoc(fp(ctx("grantA2"), A, "d-2")));
        await assertFails(setDoc(fp(ctx("leaderA"), A, "d-2"), plan("leaderA", 1, { name: "Remodel 2" })));
      });

      it("P22: leaves what is inside the lists to the app (a path for a machine, a string coordinate, an unknown place, a machine still to buy)", async () => {
        const leader = ctx("leaderA");
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 1, { placements: [{ machineId: `studios/${B}/roster/${LP}`, x: 1, y: 1, rotationDeg: 0 }] })));
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 2, { room: { ...ROOM, boxes: [{ id: "bx-1", x: "0", y: 0, w: 1000, h: 1000 }] } })));
        await assertSucceeds(setDoc(fp(leader, A), plan("leaderA", 3, { room: { ...ROOM, places: [{ id: "pc-1", kind: "trampoline", x: 0, y: 0, w: 1, h: 1 }] } })));
        await assertSucceeds(
          setDoc(
            fp(leader, A),
            plan("leaderA", 4, { placements: [{ kind: "planned", id: "pm-1", label: "Hip Abductor", movementId: "m-hip-abd", modelId: null, x: 1, y: 1, rotationDeg: 0 }] }),
          ),
        );
      });
    });

    // THE CLEANING CHECKLIST (the studio map, phase 4): Mark all and Wiped
    // write only machineCare's existing fields and the wipe chore's
    // instances, the payload setManyTaskStatuses already writes, under the
    // rules as they are. These pin it; no rule changed (the lint pins
    // machineCareValid byte for byte as on master).
    describe("the cleaning checklist (machineCare, phase 4)", () => {
      const TODAY_KEY = "2026-10-12";
      const care = (db: Db, studioId: string, machineId: string) => doc(db, "studios", studioId, "machineCare", machineId);
      const inst = (db: Db, studioId: string, machineId: string) => doc(db, "studios", studioId, "taskInstances", `wipe__${TODAY_KEY}__pm__${machineId}`);
      const wipe = (uid: string, machineId: string) => ({
        machineId,
        lastWipedAt: Date.now(),
        lastWipedBy: { id: uid, name: `Person ${uid}` },
        updatedAt: serverTimestamp(),
      });
      const instance = (studioId: string, machineId: string, status: "done" | "open", uid: string) => ({
        studioId,
        scope: "studio",
        templateId: "wipe",
        localDate: TODAY_KEY,
        shift: "pm",
        machineId,
        status,
        completedAt: status === "done" ? serverTimestamp() : null,
        completedBy: status === "done" ? { id: uid, name: `Person ${uid}` } : null,
        title: "Wipe down every machine",
        category: "cleaning",
        kind: "machine",
        updatedAt: serverTimestamp(),
      });
      const markAll = (db: Db, uid: string, studioId: string, n: number) => {
        const b = writeBatch(db);
        for (let i = 0; i < n; i++) {
          const m = `m-unit-${i}`;
          b.set(care(db, studioId, m), wipe(uid, m), { merge: true });
          b.set(inst(db, studioId, m), instance(studioId, m, "done", uid), { merge: true });
        }
        return b;
      };

      it("C1: takes Mark all from a trainer at the studio: 20 wipes and 20 chore rows in one batch", async () => {
        await assertSucceeds(markAll(ctx("trainerA"), "trainerA", A, 20).commit());
      });

      it("C2: takes Mark all's Undo: each wipe back as it was (nulls, or someone else's), each row open again", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          const b = writeBatch(db);
          for (let i = 0; i < 20; i++) b.set(care(db, A, `m-unit-${i}`), wipe("trainerA", `m-unit-${i}`));
          await b.commit();
        });
        const db = ctx("trainerA");
        const undo = writeBatch(db);
        for (let i = 0; i < 20; i++) {
          const m = `m-unit-${i}`;
          undo.set(
            care(db, A, m),
            i % 2 === 0
              ? { machineId: m, lastWipedAt: null, lastWipedBy: null, updatedAt: serverTimestamp() }
              : { machineId: m, lastWipedAt: 1_760_000_000_000, lastWipedBy: { id: "leaderA", name: "Person leaderA" }, updatedAt: serverTimestamp() },
            { merge: true },
          );
          undo.set(inst(db, A, m), instance(A, m, "open", "trainerA"), { merge: true });
        }
        await assertSucceeds(undo.commit());
      });

      it("C3: takes a wipe merged over a standing flag someone else signed, the flag left as it was", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(care(context.firestore(), A, LP), { machineId: LP, flag: { note: "Torn pad", by: { id: "leaderA", name: "Person leaderA" }, at: 1_760_000_000_000 } });
        });
        await assertSucceeds(setDoc(care(ctx("trainerA"), A, LP), wipe("trainerA", LP), { merge: true }));
      });

      it("C4: refuses Mark all at studio A from trainerB and outsiderC (the machineCare half)", async () => {
        await assertFails(markAll(ctx("trainerB"), "trainerB", A, 20).commit());
        await assertFails(markAll(ctx("outsiderC"), "outsiderC", A, 20).commit());
      });

      it("C4b: still takes a chore row alone at another studio (pinned: docs/KNOWN-TRAPS.md:158, the taskInstances rule checks no studio, which is why the checklist counts machineCare only)", async () => {
        // If AJ OKs writesForStudio on the taskInstances rule, this flips to
        // assertFails, and B7 is measured again first (design §G).
        await assertSucceeds(setDoc(inst(ctx("trainerB"), A, "m-unit-0"), instance(A, "m-unit-0", "done", "trainerB"), { merge: true }));
      });

      it("C5: takes Mark all from a guest at the studio, as the care sheet's wipes always were", async () => {
        await assertSucceeds(markAll(ctx("guestA"), "guestA", A, 20).commit());
      });
    });

    describe("inside the rules' budget", () => {
      it("B3: fits the fullest layout the grant writes: 12 boxes, 40 places and 120 placements", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "studios", A, "floorPlans", "current"), {
            v: 1,
            name: "The layout",
            room: { boxes: [{ id: "bx-1", x: 0, y: 0, w: 1000, h: 1000 }], places: [] },
            placements: [],
            rev: 1,
            updatedAt: new Date("2026-10-01T12:00:00Z"),
            updatedBy: "seed",
          });
        });
        const full = {
          v: 1,
          name: "The layout",
          room: {
            areaSqFt: 20000,
            boxes: Array.from({ length: 12 }, (_, i) => ({ id: `bx-${i + 1}`, x: i * 3048, y: 0, w: 3048, h: 3048 })),
            places: Array.from({ length: 40 }, (_, i) => ({ id: `pc-${i}`, kind: "desk", x: i * 300, y: 300, w: 1000, h: 600, label: "l".repeat(40) })),
          },
          placements: Array.from({ length: 120 }, (_, i) => ({ machineId: `m-${"x".repeat(150)}-${i}`, x: i * 100, y: 2000, rotationDeg: 270 })),
          rev: 2,
          updatedAt: serverTimestamp(),
          updatedBy: "grantA2",
        };
        await assertSucceeds(
          measured("floorPlans update: grantA2, 12 boxes, 40 places, 120 placements", () => setDoc(doc(ctx("grantA2"), "studios", A, "floorPlans", "current"), full)),
        );
      }, BUDGET_TIMEOUT);

      it("B4: fits a guest's read of the layout (the guest list found last)", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "studios", A, "floorPlans", "current"), {
            v: 1,
            name: "The layout",
            room: { boxes: [{ id: "bx-1", x: 0, y: 0, w: 1000, h: 1000 }], places: [] },
            placements: [],
            rev: 1,
            updatedAt: new Date("2026-10-01T12:00:00Z"),
            updatedBy: "seed",
          });
        });
        await assertSucceeds(measured("floorPlans read: guestA", () => getDoc(doc(ctx("guestA"), "studios", A, "floorPlans", "current"))));
      }, BUDGET_TIMEOUT);

      it("B5: fits Make this the map at an owned studio, machines still to buy, the fullest documents (three writes)", async () => {
        const room = {
          areaSqFt: 20000,
          boxes: Array.from({ length: 12 }, (_, i) => ({ id: `bx-${i + 1}`, x: i * 3048, y: 0, w: 3048, h: 3048 })),
          places: Array.from({ length: 40 }, (_, i) => ({ id: `pc-${i}`, kind: "desk", x: i * 300, y: 300, w: 1000, h: 600, label: "l".repeat(40) })),
        };
        const units = Array.from({ length: 90 }, (_, i) => ({ machineId: `m-${"x".repeat(150)}-${i}`, x: i * 100, y: 2000, rotationDeg: 270 }));
        const toBuy = Array.from({ length: 30 }, (_, i) => ({
          kind: "planned",
          id: `pm-${"y".repeat(30)}${i}`,
          label: "p".repeat(60),
          movementId: "m-hip-abd",
          modelId: `mm-${"z".repeat(90)}`,
          lengthMm: 1500,
          widthMm: 1200,
          x: i * 100,
          y: 5000,
          rotationDeg: 90,
        }));
        const full = (rev: number, name: string, placements: unknown[], by = "franchiseAB") => ({
          v: 1,
          name,
          room,
          placements,
          rev,
          updatedAt: serverTimestamp(),
          updatedBy: by,
        });
        await testEnv.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          await setDoc(doc(db, "studios", B, "floorPlans", "current"), { ...full(1, "The layout", units, "seed"), updatedAt: new Date("2026-10-01T12:00:00Z") });
          await setDoc(doc(db, "studios", B, "floorPlans", "d-1"), { ...full(1, "Remodel 1", [...units, ...toBuy], "seed"), updatedAt: new Date("2026-10-01T12:00:00Z") });
        });
        const db = ctx("franchiseAB");
        const b = writeBatch(db);
        b.set(doc(db, "studios", B, "floorPlans", "current"), full(2, "The layout", units));
        b.set(doc(db, "studios", B, "floorPlans", "d-1"), full(2, "Remodel 1", [...units, ...toBuy]));
        b.set(doc(db, "studios", B, "floorPlans", "d-2"), full(1, "Before Oct 12, 3:40 PM", units));
        await assertSucceeds(measured("floorPlans batch: franchiseAB at B, Make this the map with 30 to buy (three writes)", () => b.commit()));
      }, BUDGET_TIMEOUT);

      /** The four writes the app sends to a roster entry, one kind at a time, each as its store sends it. */
      const writes = (uid: string) =>
        [
          ["unit.size", { "unit.size": unitSize(uid) }],
          [
            "Out of service",
            {
              status: "maintenance",
              outOfService: { reason: "The cable is frayed.", by: { uid, name: nameOf(uid) }, at: serverTimestamp() },
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            },
          ],
          ["modelId", { modelId: MODEL }],
        ] as const;

      // One case per leader: each measured write reads the coverage report
      // twice, and the report grows with the whole file's run.
      it.each([
        ["leaderA", A, "a leader at home"],
        ["franchiseAB", B, "an owner at a studio they own, not their home"],
        ["grantA2", A, "the grant"],
        ["guestGrantA", A, "a guest holding the grant"],
      ] as const)("B1: fits each roster write by %s at %s (%s), ten removed safety lines, no role claim", async (uid, studioId, _who) => {
        for (const [label, data] of writes(uid)) {
          await assertSucceeds(measured(`roster update, ${label}: ${uid} at ${studioId}, 10 removed lines`, () => updateDoc(roster(ctx(uid), studioId), data)));
        }
        // The walking order, as saveOrder sends it: an update of the order and the stamp.
        await assertSucceeds(
          measured(`roster update, order: ${uid} at ${studioId}, 10 removed lines`, () =>
            updateDoc(roster(ctx(uid), studioId), { order: 7, updatedAt: serverTimestamp(), updatedBy: uid }),
          ),
        );
        // And resetOrder: an update that deletes the order.
        await assertSucceeds(
          measured(`roster update, order reset: ${uid} at ${studioId}, 10 removed lines`, () =>
            updateDoc(roster(ctx(uid), studioId), { order: deleteField(), updatedAt: serverTimestamp() }),
          ),
        );
      }, BUDGET_TIMEOUT);

      it("B2: fits the walking-order drag by an owner at an owned studio that isn't their home", async () => {
        const db = ctx("franchiseAB");
        const order = writeBatch(db);
        order.update(roster(db, B), { order: 2, updatedAt: serverTimestamp(), updatedBy: "franchiseAB" });
        await assertSucceeds(measured("roster batch, order only: franchiseAB at B, 10 removed lines", () => order.commit()));
      }, BUDGET_TIMEOUT);

      it("B7: fits the largest batch the cleaning checklist sends: Mark all at the 120-machine cap (120 wipes and 120 chore rows), and 120 upkeep log entries apart, from a guest found last, no role claim", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "trainers", "guestLastA"), person("guestLastA", "LifeTransformer", C, { activeGuestStudioIds: ["studio-x", "studio-y", B, A] }));
        });
        const db = ctx("guestLastA");
        const mark = writeBatch(db);
        for (let i = 0; i < 120; i++) {
          const m = `m-unit-${i}`;
          mark.set(doc(db, "studios", A, "machineCare", m), { machineId: m, lastWipedAt: Date.now(), lastWipedBy: { id: "guestLastA", name: "Person guestLastA" }, updatedAt: serverTimestamp() }, { merge: true });
          mark.set(
            doc(db, "studios", A, "taskInstances", `wipe__2026-10-12__pm__${m}`),
            {
              studioId: A,
              scope: "studio",
              templateId: "wipe",
              localDate: "2026-10-12",
              shift: "pm",
              machineId: m,
              status: "done",
              completedAt: serverTimestamp(),
              completedBy: { id: "guestLastA", name: "Person guestLastA" },
              title: "Wipe down every machine",
              category: "cleaning",
              kind: "machine",
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        await assertSucceeds(measured("machineCare batch: guestLastA (guest found last), Mark all at 120 machines + 120 chore rows", () => mark.commit()));
        const log = writeBatch(db);
        for (let i = 0; i < 120; i++) {
          log.set(doc(collection(db, "studios", A, "upkeepLog")), {
            machineId: `m-unit-${i}`,
            kind: "clean",
            at: new Date().toISOString(),
            byId: "guestLastA",
            byName: "Person guestLastA",
            createdAt: serverTimestamp(),
          });
        }
        await assertSucceeds(measured("upkeepLog batch: guestLastA (guest found last), 120 clean entries", () => log.commit()));
      }, BUDGET_TIMEOUT);

      it("B6: fits the fullest model an administrator writes: 20 dials, 2,000 characters of notes, a size with a 400-character note", async () => {
        const full = sizedModel(
          "adminP",
          {
            dials: Array.from({ length: 20 }, (_, i) => ({ key: `dial-${i}`, label: `Dial ${i}`, letter: "D", default: "7", options: ["1", "2", "3"] })),
            notes: "n".repeat(2000),
          },
          { note: "m".repeat(400) },
        );
        await assertSucceeds(measured("machineModels create: the fullest model", () => setDoc(doc(ctx("adminP"), "machineModels", MODEL), full)));
      }, BUDGET_TIMEOUT);
    });
  });
});

// ── A FINISH IS COUNTED ONCE (the sessions round, Oct 12 2026) ──────────
//
// AJ: "Anyone can clear a session" and "2 and 3 I will trust your decision
// please be sure!". Finish sends two batches (src/lib/sync-utils.ts): the
// session batch (the session to Completed, its sets, its settings) creates
// sessions/{id}/finish/once, and the totals batch (the client's counters and
// her machine totals document) marks it counted. A second finish of the same
// session, from another iPad, the same trainer's second iPad or a second
// "Finish it as it was", is refused whole, and its counts with it. A FIRST
// finish of every shape the app makes must pass: #1, #11-#13, #15, B1-B4.
describe("a finish is counted once (Oct 12 2026)", () => {
  const K = "onceClient";
  const S = "onceSession";
  const MACHINES = ["m-leg-press", "m-pulldown", "m-chest-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-hip-add", "m-neck"];
  const as = (uid: string, claims?: Record<string, unknown>) => testEnv.authenticatedContext(uid, claims).firestore();
  type Db = ReturnType<typeof as>;
  const markerOf = (db: Db, sessionId = S) => doc(db, "sessions", sessionId, "finish", "once");
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const trainer = (id: string, studio: string, role = "LifeTransformer") =>
        setDoc(doc(db, "trainers", id), {
          fullName: `Trainer ${id}`, initials: id.slice(0, 2).toUpperCase(), role,
          primaryHomeStudioId: studio, accessibleStudioIds: [studio],
        });
      await trainer("t1", "studioA");
      await trainer("t2", "studioA");
      await trainer("leadL", "studioA", "StudioLeader");
      await trainer("trainerC", "studioC");
      await trainer("trainerH", "studioH");
      await trainer("trainerX", "studioX");
      await setDoc(doc(db, "clients", K), {
        firstName: "Kim", lastName: "Once", isActive: true, remainingSessions: 10,
        homeStudioId: "studioA", completedSessions: 11, sessionCount: 11,
      });
      // T1's session at studio A, left open three hours ago, with eight machines' sets.
      await setDoc(doc(db, "sessions", S), {
        clientId: K, clientName: "Kim Once", trainerId: "t1", trainerName: "Trainer t1", trainerInitials: "T1",
        startedByTrainerId: "t1", hostedAtStudioId: "studioA", homeStudioId: "studioA", clientHomeStudioId: "studioA",
        status: "In-Progress", sessionNumber: 12, date: "2026-10-12", sessionType: "Standard",
        lastHeartbeatAt: threeHoursAgo, createdAt: threeHoursAgo,
      });
      for (const m of MACHINES) {
        await setDoc(doc(db, "exerciseLogs", `${S}_${m}`), {
          sessionId: S, machineId: m, clientId: K, weight: "150", reps: "9", studioId: "studioA",
          homeStudioId: "studioA", clientHomeStudioId: "studioA",
        });
      }
    });
  });

  /** The session batch as completeWorkoutSession builds it, with or without the marker. */
  const sessionBatch = (
    db: Db,
    uid: string,
    o: {
      finishId?: string | null;
      sessionId?: string;
      clientId?: string;
      machines?: readonly string[];
      credit?: string;
      marker?: Record<string, unknown>;
      sessionExtra?: Record<string, unknown>;
    } = {},
  ) => {
    const sessionId = o.sessionId ?? S;
    const clientId = o.clientId ?? K;
    const machines = o.machines ?? MACHINES;
    const credit = o.credit ?? uid;
    const b = writeBatch(db);
    b.update(doc(db, "sessions", sessionId), {
      status: "Completed", endTime: serverTimestamp(), trainerId: credit, trainerName: `Trainer ${credit}`,
      trainerInitials: credit.slice(0, 2).toUpperCase(), clientId, homeStudioId: "studioA", clientHomeStudioId: "studioA",
      hostedAtStudioId: "studioA", ...(o.sessionExtra ?? {}),
    });
    for (const m of machines) {
      b.set(doc(db, "exerciseLogs", `${sessionId}_${m}`), {
        sessionId, machineId: m, weight: "150", reps: "9", clientId,
        homeStudioId: "studioA", clientHomeStudioId: "studioA", studioId: "studioA", updatedAt: serverTimestamp(),
      }, { merge: true });
      b.set(doc(db, "clientMachineSettings", `${clientId}_${m}`), {
        clientId, homeStudioId: "studioA", clientHomeStudioId: "studioA", machineId: m,
        settings: {}, updatedBy: uid, currentWeight: 150, nextWeight: deleteField(), updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    if (o.finishId !== null) {
      b.set(markerOf(db, sessionId), o.marker ?? { finishId: o.finishId ?? "f1", by: uid, at: serverTimestamp(), clientId });
    }
    return b;
  };

  /** The totals batch: the client's counters, her machine totals document and, unless left out, the counted mark. */
  const totalsBatch = (
    db: Db,
    uid: string,
    o: { finishId?: string | null; sessionId?: string; clientId?: string; machines?: readonly string[] } = {},
  ) => {
    const clientId = o.clientId ?? K;
    const machines = o.machines ?? MACHINES;
    const u: Record<string, unknown> = {
      completedSessions: increment(1),
      sessionCount: increment(1),
      lastSessionDate: "2026-10-12",
      updatedAt: serverTimestamp(),
      lifetimeReps: increment(72),
      lifetimeWeight: increment(10800),
      [`trainerTally.${uid}`]: increment(1),
      topTrainerId: uid,
      topTrainerName: `Trainer ${uid}`,
      topTrainerSessions: 1,
      trainerTallyUpdatedAt: serverTimestamp(),
    };
    for (const m of machines) {
      u[`currentMachineMetrics.${m}`] = { weight: "150", reps: "9", settings: {}, lastPerformedSessionNumber: 12, lastSessionId: o.sessionId ?? S };
      u[`machineStats.${m}.timesPerformed`] = increment(1);
      u[`machineStats.${m}.lastPerformedDate`] = "2026-10-12";
      u[`machineStats.${m}.lastWeight`] = 150;
    }
    const { client, totals } = splitMachineTotalsUpdates(u);
    const b = writeBatch(db);
    b.update(doc(db, "clients", clientId), client);
    addMachineTotalsWrite(b, db as never, clientId, totals);
    if (o.finishId !== null) {
      b.update(markerOf(db, o.sessionId ?? S), { countedAt: serverTimestamp(), countedBy: o.finishId ?? "f1" });
    }
    return b;
  };

  it("#1 (ship blocker): the session's trainer finishes, then the totals land, and the marker says counted", async () => {
    const db = as("t1");
    await assertSucceeds(sessionBatch(db, "t1", { finishId: "f1" }).commit());
    await assertSucceeds(totalsBatch(db, "t1", { finishId: "f1" }).commit());
    const m = (await getDoc(markerOf(db))).data();
    expect(m).toMatchObject({ finishId: "f1", by: "t1", clientId: K, countedBy: "f1" });
  });

  it("#2: another trainer's second finish of the same session is refused whole", async () => {
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertFails(sessionBatch(as("t2"), "t2", { finishId: "f2" }).commit());
    // Nothing of it landed: the credit is still T1's.
    const s = await getDoc(doc(as("t1"), "sessions", S));
    expect(s.data()?.trainerId).toBe("t1");
  });

  it("#3: the same session batch sent again (a lost answer) is refused, and the marker says it was this finish", async () => {
    const db = as("t1");
    await assertSucceeds(sessionBatch(db, "t1", { finishId: "f1" }).commit());
    await assertFails(sessionBatch(db, "t1", { finishId: "f1" }).commit());
    expect((await getDoc(markerOf(db))).data()?.finishId).toBe("f1");
  });

  it("#4: a second iPad's totals, tied to its own finish, are refused", async () => {
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertFails(totalsBatch(as("t2"), "t2", { finishId: "f2" }).commit());
  });

  it("#5: the totals sent again after they landed are refused", async () => {
    const db = as("t1");
    await assertSucceeds(sessionBatch(db, "t1", { finishId: "f1" }).commit());
    await assertSucceeds(totalsBatch(db, "t1", { finishId: "f1" }).commit());
    await assertFails(totalsBatch(db, "t1", { finishId: "f1" }).commit());
  });

  it("#6: totals before any session batch (no marker yet) are refused", async () => {
    await assertFails(totalsBatch(as("t1"), "t1", { finishId: "f1" }).commit());
  });

  it("#7: the marker alone, with the session left In-Progress, is refused", async () => {
    const db = as("t1");
    await assertFails(setDoc(markerOf(db), { finishId: "f1", by: "t1", at: serverTimestamp(), clientId: K }));
  });

  it("#8: a session an old-version iPad already finished takes no marker", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "sessions", S), { status: "Completed" });
    });
    await assertFails(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
  });

  it("#9: a marker that isn't exactly the finish's is refused", async () => {
    const db = as("t1");
    const base = { finishId: "f1", by: "t1", at: serverTimestamp(), clientId: K };
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, by: "t2" } }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, extra: true } }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, at: new Date() } }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, finishId: "x".repeat(65) } }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, finishId: "" } }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: { ...base, clientId: "someoneElse" } }).commit());
    const { at: _at, ...noAt } = base;
    await assertFails(sessionBatch(db, "t1", { marker: noAt }).commit());
    // ...and the exact one still passes.
    await assertSucceeds(sessionBatch(db, "t1", { marker: base }).commit());
  });

  it("#10: nobody changes the marker but the counted mark, and only administrators delete it", async () => {
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    for (const [uid, claims] of [["t1", undefined], ["leadL", undefined], ["adminA", { role: "Admin" }]] as const) {
      const db = as(uid, claims);
      await assertFails(updateDoc(markerOf(db), { countedAt: serverTimestamp(), countedBy: "f1", note: "x" }));
      await assertFails(updateDoc(markerOf(db), { finishId: "f9" }));
    }
    await assertFails(deleteDoc(markerOf(as("t1"))));
    await assertFails(deleteDoc(markerOf(as("leadL"))));
    await assertSucceeds(deleteDoc(markerOf(as("adminA", { role: "Admin" }))));
  });

  /* exerciseLogs and clientMachineSettings already refuse an administrator
     with no trainer document (they ask isAnyAuthenticatedTrainer), so such
     an administrator can only finish a session with no sets; that is the
     finish here. The point is the marker adds no "who" check of its own. */
  it("#11: an administrator with a role claim only finishes, marker and totals", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions", "adminSession"), {
        clientId: K, trainerId: "t1", hostedAtStudioId: "studioA", status: "In-Progress", sessionNumber: 12,
      });
    });
    const db = as("adminA", { role: "Admin" });
    await assertSucceeds(sessionBatch(db, "adminA", { sessionId: "adminSession", machines: [], finishId: "fa" }).commit());
    await assertSucceeds(totalsBatch(db, "adminA", { sessionId: "adminSession", machines: [], finishId: "fa" }).commit());
  });

  it("#12: Finish it as it was by a colleague counts once, crediting the starter; a second finish by a leader is refused", async () => {
    const t2 = as("t2");
    await assertSucceeds(sessionBatch(t2, "t2", { finishId: "f2", credit: "t1" }).commit());
    await assertSucceeds(totalsBatch(t2, "t2", { finishId: "f2" }).commit());
    await assertFails(sessionBatch(as("leadL"), "leadL", { finishId: "fL", credit: "t1" }).commit());
    await assertFails(totalsBatch(as("leadL"), "leadL", { finishId: "fL" }).commit());
  });

  it("#13: an open session, given its client by Who's this?, then finished with the marker", async () => {
    const OPEN = "onceOpen";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "sessions", OPEN), {
        isUnassigned: true, sessionType: "Standard", sessionNumber: 0, date: "2026-10-12",
        hostedAtStudioId: "studioA", clientHomeStudioId: null, trainerId: "t1", startedByTrainerId: "t1",
        trainerInitials: "T1", status: "In-Progress",
      });
      await setDoc(doc(db, "exerciseLogs", `${OPEN}_m-leg-press`), {
        sessionId: OPEN, machineId: "m-leg-press", weight: "100", reps: "10", studioId: "studioA",
      });
    });
    const db = as("t1");
    const assign = writeBatch(db);
    assign.update(doc(db, "sessions", OPEN), {
      clientId: K, isUnassigned: false, clientName: "Kim Once", homeStudioId: "studioA", clientHomeStudioId: "studioA", sessionNumber: 12,
    });
    assign.set(doc(db, "exerciseLogs", `${OPEN}_m-leg-press`), { sessionId: OPEN, machineId: "m-leg-press", clientId: K }, { merge: true });
    await assertSucceeds(assign.commit());
    await assertSucceeds(
      sessionBatch(db, "t1", { sessionId: OPEN, machines: ["m-leg-press"], finishId: "fo", sessionExtra: { isUnassigned: false } }).commit(),
    );
    await assertSucceeds(totalsBatch(db, "t1", { sessionId: OPEN, machines: ["m-leg-press"], finishId: "fo" }).commit());
  });

  it("#14: a trainer at another studio can't finish the session, marker or not", async () => {
    await assertFails(sessionBatch(as("trainerC"), "trainerC", { finishId: "fc" }).commit());
  });

  it("#15: an old-version finish (no marker, no counted mark) passes exactly as before", async () => {
    const db = as("t1");
    await assertSucceeds(sessionBatch(db, "t1", { finishId: null }).commit());
    await assertSucceeds(totalsBatch(db, "t1", { finishId: null }).commit());
  });

  it("#16: the Wrap-up's effort and History's edit on the finished session still pass", async () => {
    const db = as("t1");
    await assertSucceeds(sessionBatch(db, "t1", { finishId: "f1" }).commit());
    await assertSucceeds(updateDoc(doc(db, "sessions", S), { effort: 7, effortDefaulted: deleteField() }));
    await assertSucceeds(
      updateDoc(doc(db, "sessions", S), {
        editedAt: serverTimestamp(), editedById: "t1", editedByName: "Trainer t1", editedByInitials: "T1", editCount: increment(1),
      }),
    );
  });

  it("#17: the marker is read by whoever finished or can reach the session; a missing one too, never across studios", async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "sessions", S, "finish", "once")));
    // Missing, on the In-Progress session.
    await assertSucceeds(getDoc(markerOf(as("t1"))));
    await assertSucceeds(getDoc(markerOf(as("t2"))));
    await assertFails(getDoc(markerOf(as("trainerC"))));
    // Present.
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "sessions", S, "finish", "once")));
    await assertSucceeds(getDoc(markerOf(as("t1"))));
    await assertSucceeds(getDoc(markerOf(as("t2"))));
    await assertFails(getDoc(markerOf(as("trainerC"))));
  });

  it("#18: anyone at the studio takes over a left-open session (AJ: \"Anyone can clear a session\")", async () => {
    for (const uid of ["t2", "leadL"]) {
      await assertSucceeds(
        updateDoc(doc(as(uid), "sessions", S), {
          trainerId: uid, trainerName: `Trainer ${uid}`, trainerInitials: uid.slice(0, 2).toUpperCase(),
          startedByTrainerId: "t1", recordingDeviceId: `device-${uid}`, lastHeartbeatAt: serverTimestamp(),
        }),
      );
    }
  });

  it("#19: anyone at the studio discards a left-open session in one batch; a trainer elsewhere is refused only for the session", async () => {
    const discard = (db: Db) => {
      const b = writeBatch(db);
      for (const m of MACHINES) b.delete(doc(db, "exerciseLogs", `${S}_${m}`));
      b.delete(doc(db, "sessions", S));
      return b;
    };
    await assertFails(discard(as("trainerC")).commit());
    // Since the attack (Oct 12 2026) a set on its own is refused to them too (#22).
    await assertSucceeds(discard(as("t2")).commit());
  });

  it("#20: the session's trainer writes this iPad's id on it (Continue on this iPad)", async () => {
    await assertSucceeds(updateDoc(doc(as("t1"), "sessions", S), { recordingDeviceId: "device-2", lastHeartbeatAt: serverTimestamp() }));
  });

  it("#21: Hours' read of the studio's unfinished sessions: its people yes, another studio no", async () => {
    const hours = (db: Db) =>
      getDocs(
        query(
          collection(db, "sessions"),
          where("hostedAtStudioId", "==", "studioA"),
          where("status", "==", "In-Progress"),
          orderBy("createdAt", "desc"),
          limit(50),
        ),
      );
    await assertSucceeds(hours(as("leadL")));
    await assertSucceeds(hours(as("t1")));
    await assertFails(hours(as("trainerC")));
  });

  /* #22 was "a known gap, recorded as it stands": any signed-in trainer could
     delete one set. The attack (Oct 12 2026) showed the whole of it: a
     trainer at another studio could blank, rewrite or delete any studio's
     sets and overwrite a client's next-session weight. Closed
     (firestore.rules logSessionReach, machineSettingsClientOk). */
  it("#22 (the attack, Oct 12 2026): a trainer at another studio can't blank, rewrite, add or delete a set, or write a client's settings", async () => {
    const db = as("trainerC");
    await assertFails(updateDoc(doc(db, "exerciseLogs", `${S}_${MACHINES[0]}`), { weight: "", reps: "" }));
    await assertFails(updateDoc(doc(db, "exerciseLogs", `${S}_${MACHINES[1]}`), { weight: "999", reps: "1" }));
    await assertFails(deleteDoc(doc(db, "exerciseLogs", `${S}_${MACHINES[2]}`)));
    await assertFails(setDoc(doc(db, "exerciseLogs", `${S}_m-extra`), { sessionId: S, machineId: "m-extra", weight: "5", reps: "1" }));
    await assertFails(
      setDoc(doc(db, "clientMachineSettings", `${K}_${MACHINES[0]}`), { clientId: K, machineId: MACHINES[0], currentWeight: 5, settings: {} }, { merge: true }),
    );
    // ...nor by leaving the client off.
    await assertFails(setDoc(doc(db, "clientMachineSettings", `${K}_${MACHINES[0]}`), { machineId: MACHINES[0], currentWeight: 5 }, { merge: true }));
    await assertFails(updateDoc(doc(db, "sessions", S), { trainerId: "trainerC" }));
    await assertFails(deleteDoc(doc(db, "sessions", S)));
    // Nothing of it landed.
    expect((await getDoc(doc(as("t1"), "exerciseLogs", `${S}_${MACHINES[1]}`))).data()?.weight).toBe("150");
    // The studio's own trainers still write them, and a settings document can't be moved to another client.
    const t2 = as("t2");
    await assertSucceeds(updateDoc(doc(t2, "exerciseLogs", `${S}_${MACHINES[0]}`), { weight: "160", reps: "8" }));
    await assertSucceeds(
      setDoc(doc(t2, "clientMachineSettings", `${K}_${MACHINES[0]}`), { clientId: K, machineId: MACHINES[0], currentWeight: 160, settings: {} }, { merge: true }),
    );
    await assertFails(setDoc(doc(t2, "clientMachineSettings", `${K}_${MACHINES[0]}`), { clientId: "elsewhereClient" }, { merge: true }));
    await assertSucceeds(deleteDoc(doc(t2, "exerciseLogs", `${S}_${MACHINES[2]}`)));
  });

  it("#22b: a Start batch makes its session and its sets together, and a sweep clears sets whose session is gone", async () => {
    const NEW = "onceStartNew";
    const db = as("t1");
    const b = writeBatch(db);
    b.set(doc(db, "sessions", NEW), {
      clientId: K, trainerId: "t1", startedByTrainerId: "t1", hostedAtStudioId: "studioA", status: "In-Progress",
      sessionNumber: 13, date: "2026-10-12", lastHeartbeatAt: serverTimestamp(), createdAt: serverTimestamp(),
    });
    b.set(doc(db, "exerciseLogs", `${NEW}_m-leg-press`), { sessionId: NEW, machineId: "m-leg-press", clientId: K, weight: "150" }, { merge: true });
    await assertSucceeds(b.commit());
    // The session discarded; a set an offline iPad sent afterwards is an orphan, and a sweep clears it.
    await assertSucceeds(deleteDoc(doc(db, "sessions", NEW)));
    await assertSucceeds(setDoc(doc(db, "exerciseLogs", `${NEW}_m-pulldown`), { sessionId: NEW, machineId: "m-pulldown", weight: "90" }));
    await assertSucceeds(deleteDoc(doc(as("t2"), "exerciseLogs", `${NEW}_m-pulldown`)));
    await assertSucceeds(deleteDoc(doc(as("t2"), "exerciseLogs", `${NEW}_m-leg-press`)));
  });

  it("#23: someone else can't mark the finish counted first; the finisher's totals then land", async () => {
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertFails(updateDoc(markerOf(as("trainerC")), { countedAt: serverTimestamp(), countedBy: "f1" }));
    await assertFails(updateDoc(markerOf(as("t2")), { countedAt: serverTimestamp(), countedBy: "f1" }));
    await assertSucceeds(totalsBatch(as("t1"), "t1", { finishId: "f1" }).commit());
  });

  /* Measured on Oct 12 2026 against the rules as they stand: the home
     studio's trainer takes over and deletes; an approved studio's trainer
     deletes, and its take-over was refused only because the update rule ran
     out of its 1,000-expression budget on that path (an accident of cost,
     not a rule), and only with no role claim on the token: with one, as
     every trainer carries in production, it passed. Since privacy Round 0
     (Oct 14 2026) the update rule resolves the caller once
     (sessionIsReadable), so it passes either way, as the rule always said.
     The doors refuse both (a session hosted elsewhere is described, never
     cleared); tightening the rules is parked for AJ. */
  it("#24 (a parked gap, recorded as it stands): the client's home studio and an approved studio reach a session hosted elsewhere", async () => {
    const HS = "onceHomeH";
    const seed = async () =>
      testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientH"), {
          firstName: "Hal", lastName: "Home", isActive: true, homeStudioId: "studioH", approvedCrossTrainStudioIds: ["studioX"],
        });
        await setDoc(doc(db, "sessions", HS), {
          clientId: "clientH", trainerId: "t1", hostedAtStudioId: "studioA", homeStudioId: "studioH",
          status: "In-Progress", sessionNumber: 3, lastHeartbeatAt: threeHoursAgo,
        });
      });
    const takeOver = (uid: string) =>
      updateDoc(doc(as(uid), "sessions", HS), { trainerId: uid, trainerName: `Trainer ${uid}`, trainerInitials: "TX", startedByTrainerId: "t1" });
    await seed();
    await assertSucceeds(takeOver("trainerH"));
    await seed();
    await assertSucceeds(deleteDoc(doc(as("trainerH"), "sessions", HS)));
    await seed();
    await assertSucceeds(takeOver("trainerX"));
    await seed();
    await assertSucceeds(deleteDoc(doc(as("trainerX"), "sessions", HS)));
  });

  /* ── The attack (Oct 12 2026): each as a permanent regression test ────── */

  const marker = (uid: string, finishId: string, extra: Record<string, unknown> = {}) => ({
    finishId, by: uid, at: serverTimestamp(), clientId: K, ...extra,
  });
  const holdBy = (deviceId: string, minutesAgo: number) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "sessions", S), {
        recordingDeviceId: deviceId, lastHeartbeatAt: new Date(Date.now() - minutesAgo * 60_000),
      });
    });

  it("A1 (a stale claim): after a take-over, the iPad it was taken from can't finish it; the taker's own finish counts", async () => {
    await holdBy("dev-t1", 180);
    await assertSucceeds(
      updateDoc(doc(as("t2"), "sessions", S), {
        trainerId: "t2", trainerName: "Trainer t2", trainerInitials: "T2", recordingDeviceId: "dev-t2", lastHeartbeatAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(doc(as("t2"), "exerciseLogs", `${S}_${MACHINES[0]}`), { weight: "170", reps: "8" }));
    // T1's Finish, queued while its iPad was offline, lands: refused whole, with or without a device id.
    await assertFails(sessionBatch(as("t1"), "t1", { marker: marker("t1", "stale", { deviceId: "dev-t1" }) }).commit());
    await assertFails(sessionBatch(as("t1"), "t1", { finishId: "stale2" }).commit());
    await assertFails(totalsBatch(as("t1"), "t1", { finishId: "stale" }).commit());
    expect((await getDoc(doc(as("t1"), "exerciseLogs", `${S}_${MACHINES[0]}`))).data()?.weight).toBe("170");
    // The taker finishes, and it counts once, credited to the taker.
    await assertSucceeds(sessionBatch(as("t2"), "t2", { marker: marker("t2", "taker", { deviceId: "dev-t2" }) }).commit());
    await assertSucceeds(totalsBatch(as("t2"), "t2", { finishId: "taker" }).commit());
    expect((await getDoc(doc(as("t1"), "sessions", S))).data()?.trainerId).toBe("t2");
    expect((await getDoc(doc(as("t1"), "clients", K))).data()?.completedSessions).toBe(12);
  });

  // A session no device holds is #1; one left open an hour is A1c.
  it("A1b: a first finish is never blocked: the device holding it finishes, whenever it last saved", async () => {
    // The holder, saved a moment ago.
    await holdBy("dev-t1", 1);
    await assertSucceeds(sessionBatch(as("t1"), "t1", { marker: marker("t1", "h1", { deviceId: "dev-t1" }) }).commit());
  });

  it("A1b2: the session's own trainer on a device that can't keep an id is never locked out of its finish", async () => {
    await holdBy("dev-t1", 1);
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "no-device" }).commit());
    await assertSucceeds(totalsBatch(as("t1"), "t1", { finishId: "no-device" }).commit());
  });

  it("A1b3: someone else's device with no id can't finish a session another device holds and saved in", async () => {
    await holdBy("dev-t1", 1);
    await assertFails(sessionBatch(as("t2"), "t2", { credit: "t1", finishId: "no-device-t2" }).commit());
  });

  it("A1c: Finish it as it was on a session left open over an hour still succeeds from any device at the studio", async () => {
    await holdBy("dev-t1", 75);
    await assertSucceeds(
      sessionBatch(as("t2"), "t2", { credit: "t1", marker: marker("t2", "aiw", { deviceId: "dev-t2", asItWas: true }) }).commit(),
    );
    await assertSucceeds(totalsBatch(as("t2"), "t2", { finishId: "aiw" }).commit());
  });

  it("A1d: the marker's new keys are held to their shapes", async () => {
    const db = as("t1");
    await assertFails(sessionBatch(db, "t1", { marker: marker("t1", "m1", { deviceId: "x".repeat(65) }) }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: marker("t1", "m1", { deviceId: 7 }) }).commit());
    await assertFails(sessionBatch(db, "t1", { marker: marker("t1", "m1", { asItWas: false }) }).commit());
    await assertSucceeds(sessionBatch(db, "t1", { marker: marker("t1", "m1", { deviceId: "d-abc", asItWas: true }) }).commit());
  });

  it("A2 (a take-over of a finished session): refused, as are a late Continue and a late heartbeat; History's edits still pass", async () => {
    await assertSucceeds(sessionBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertSucceeds(totalsBatch(as("t1"), "t1", { finishId: "f1" }).commit());
    await assertFails(
      updateDoc(doc(as("t2"), "sessions", S), {
        trainerId: "t2", trainerName: "Trainer t2", trainerInitials: "T2", recordingDeviceId: "dev-t2", lastHeartbeatAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(as("t1"), "sessions", S), { recordingDeviceId: "dev-2", lastHeartbeatAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("t1"), "sessions", S), { lastHeartbeatAt: serverTimestamp() }));
    // An old-version second finish can't flip the credit either.
    await assertFails(sessionBatch(as("t2"), "t2", { finishId: null }).commit());
    const s = (await getDoc(doc(as("t1"), "sessions", S))).data();
    expect(s?.status).toBe("Completed");
    expect(s?.trainerId).toBe("t1");
    expect((await getDoc(doc(as("t1"), "clients", K))).data()?.trainerTally?.t2).toBeUndefined();
    await assertSucceeds(updateDoc(doc(as("t1"), "sessions", S), { effort: 6 }));
    await assertSucceeds(updateDoc(doc(as("t2"), "sessions", S), { notes: "Edited in History", editedById: "t2", editCount: increment(1) }));
  });

  it("A3 (Finish it as it was first): the real finish from the iPad that ran it goes in over it, and it counts once", async () => {
    await holdBy("dev-t1", 180);
    await assertSucceeds(
      sessionBatch(as("t2"), "t2", { credit: "t1", marker: marker("t2", "f-asitwas", { deviceId: "dev-t2", asItWas: true }) }).commit(),
    );
    await assertSucceeds(totalsBatch(as("t2"), "t2", { finishId: "f-asitwas" }).commit());
    const t1 = as("t1");
    // T1's iPad, offline with the real session, comes back: its own marked finish is refused whole.
    await assertFails(sessionBatch(t1, "t1", { marker: marker("t1", "f-offline", { deviceId: "dev-t1" }) }).commit());
    expect((await getDoc(markerOf(t1))).data()?.asItWas).toBe(true);
    // The app sends it again with no marker and no credit change: its sets, weights and note go in.
    const fix = writeBatch(t1);
    fix.update(doc(t1, "sessions", S), {
      status: "Completed", endTime: serverTimestamp(), clientId: K, homeStudioId: "studioA", clientHomeStudioId: "studioA",
      hostedAtStudioId: "studioA", notes: "Left knee: seat one notch back",
    });
    for (const m of MACHINES) {
      fix.set(doc(t1, "exerciseLogs", `${S}_${m}`), { sessionId: S, machineId: m, clientId: K, weight: "170", reps: "8", outcome: "performed" }, { merge: true });
      fix.set(doc(t1, "clientMachineSettings", `${K}_${m}`), { clientId: K, machineId: m, currentWeight: 170, updatedBy: "t1" }, { merge: true });
    }
    await assertSucceeds(fix.commit());
    // Its totals, tied to its own finish, are refused: it counts once.
    await assertFails(totalsBatch(t1, "t1", { finishId: "f-offline" }).commit());
    expect((await getDoc(doc(t1, "clients", K))).data()?.completedSessions).toBe(12);
    expect((await getDoc(doc(t1, "clientMachineSettings", `${K}_${MACHINES[0]}`))).data()?.currentWeight).toBe(170);
    const s = (await getDoc(doc(t1, "sessions", S))).data();
    expect(s?.notes).toBe("Left knee: seat one notch back");
    expect(s?.trainerId).toBe("t1");
  });

  /* The attack's remaining case, recorded as it stands: a Finish queued on
     an offline iPad is refused if the session was discarded first, and the
     rules can't tell that from a second finish. The doors carry it: someone
     else's session left open today is discarded only from the next studio
     day (src/features/session-record/discard.ts discardWaitsToday); today it
     can be taken over or finished as it was, which a late real finish still
     lands over (A3). Not refused at the rules: an older account's trainerId
     isn't its uid, so "discard only your own" would refuse a trainer's own
     Discard. */
  it("A4 (a residual, recorded as it stands): a session discarded before an offline Finish lands is gone, and the Finish is refused", async () => {
    const t2 = as("t2");
    const d = writeBatch(t2);
    for (const m of MACHINES) d.delete(doc(t2, "exerciseLogs", `${S}_${m}`));
    d.delete(doc(t2, "sessions", S));
    await assertSucceeds(d.commit());
    await assertFails(sessionBatch(as("t1"), "t1", { finishId: "f-offline" }).commit());
  });

  /* A franchise owner (or a grant holder) who runs the host studio but
     doesn't work there can't read a cross-train client whose home is
     elsewhere, so no door loads that client to finish its session. If one
     did, the finish is now refused whole (the client's settings ask for the
     client), never Completed and left uncounted. Widening who may count a
     cross-train client belongs with the client's read rule (the privacy
     round), not here. */
  it("A5 (a parked gap, recorded as it stands): a leader who runs the host studio but can't read a cross-train client can't finish its session, so it is never half counted", async () => {
    const SX = "onceCrossX";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "fo"), {
        fullName: "Franchise Owner", initials: "FO", role: "FranchiseOwner",
        primaryHomeStudioId: "studioZ", accessibleStudioIds: ["studioZ"], ownedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "clients", "clientX"), {
        firstName: "Xen", lastName: "Cross", isActive: true, homeStudioId: "studioB", approvedCrossTrainStudioIds: ["studioA"],
        completedSessions: 3, sessionCount: 3,
      });
      await setDoc(doc(db, "sessions", SX), {
        clientId: "clientX", trainerId: "t1", hostedAtStudioId: "studioA", homeStudioId: "studioB", status: "In-Progress",
        sessionNumber: 4, lastHeartbeatAt: threeHoursAgo, createdAt: threeHoursAgo,
      });
    });
    await assertFails(sessionBatch(as("fo"), "fo", { sessionId: SX, clientId: "clientX", machines: ["m-leg-press"], finishId: "ffo" }).commit());
    expect((await getDoc(doc(as("t1"), "sessions", SX))).data()?.status).toBe("In-Progress");
  });

  it("#25: one batch holding the marker and its counted mark together is refused", async () => {
    const db = as("t1");
    const b = sessionBatch(db, "t1", { finishId: "f1" });
    b.update(markerOf(db), { countedAt: serverTimestamp(), countedBy: "f1" });
    await assertFails(b.commit());
  });

  describe("inside the rules' budget", () => {
    it("B1: a twenty-machine finish in one batch: the session, twenty sets, twenty settings and the marker", async () => {
      const twenty = Array.from({ length: 20 }, (_, i) => `m-twenty-${i + 1}`);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        for (const m of twenty) {
          await setDoc(doc(db, "exerciseLogs", `${S}_${m}`), {
            sessionId: S, machineId: m, clientId: K, weight: "150", reps: "9", studioId: "studioA",
          });
        }
      });
      const db = as("t1");
      await assertSucceeds(sessionBatch(db, "t1", { machines: twenty, finishId: "f20" }).commit());
      await assertSucceeds(totalsBatch(db, "t1", { machines: twenty, finishId: "f20" }).commit());
    });

    it("B2: an open session finished with its client in the same batch: twenty sets take the client, and the marker", async () => {
      const OPEN = "onceOpen20";
      const sets = Array.from({ length: 10 }, (_, i) => `m-floor-${i + 1}`).flatMap((m) =>
        (["Left", "Right"] as const).map((side) => ({ id: `${OPEN}_${m}_${side}`, machineId: m, side })),
      );
      expect(sets).toHaveLength(20);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "sessions", OPEN), {
          isUnassigned: true, sessionType: "Standard", sessionNumber: 0, date: "2026-10-12",
          hostedAtStudioId: "studioA", clientHomeStudioId: null, trainerId: "t1", startedByTrainerId: "t1",
          trainerInitials: "T1", status: "In-Progress",
        });
        for (const s of sets) {
          await setDoc(doc(db, "exerciseLogs", s.id), {
            sessionId: OPEN, machineId: s.machineId, side: s.side, weight: "100", reps: "10", studioId: "studioA",
            homeStudioId: "", clientHomeStudioId: "",
          });
        }
      });
      const db = as("t1");
      const b = writeBatch(db);
      b.update(doc(db, "sessions", OPEN), {
        status: "Completed", endTime: serverTimestamp(), trainerId: "t1", trainerName: "Trainer t1", trainerInitials: "T1",
        clientId: K, homeStudioId: "studioA", clientHomeStudioId: "studioA", hostedAtStudioId: "studioA", isUnassigned: false,
      });
      for (const s of sets) {
        b.set(doc(db, "exerciseLogs", s.id), {
          sessionId: OPEN, machineId: s.machineId, side: s.side, weight: "100", reps: "10", clientId: K,
          homeStudioId: "studioA", clientHomeStudioId: "studioA", studioId: "studioA", updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      b.set(markerOf(db, OPEN), { finishId: "fo20", by: "t1", at: serverTimestamp(), clientId: K });
      await assertSucceeds(b.commit());
      await assertSucceeds(totalsBatch(db, "t1", { sessionId: OPEN, machines: sets.map((s) => s.machineId), finishId: "fo20" }).commit());
    });
  });
});

// ── PRIVACY ROUND 0: STRANGERS OUT (Oct 14 2026) ────────────────────────
// docs/rounds/2026-10-14-strangers-out.md. AJ: "Let's make sure that
// everything's strict and safe right now." A signed-in account with no
// trainer record (anyone can sign in with Google) reads nothing about a
// client or a studio's own work; everyone let in reads exactly as before.
// Each read below is the app's own shape, as a trainer (allowed) and as the
// stranger (refused). Kept in its own block so other branches merge cleanly.
describe("privacy Round 0: strangers out", () => {
  const as = (uid: string, token: Record<string, unknown> = {}) => testEnv.authenticatedContext(uid, token).firestore();
  const stranger = () => as("strangerP0", { email: "stranger@example.com" });
  const DAY = "2026-10-14";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "adminP0"), { fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "studioA" });
      await setDoc(doc(db, "clients", "clientA"), { firstName: "Cara", lastName: "A", isActive: true, remainingSessions: 0, homeStudioId: "studioA" });
      await setDoc(doc(db, "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 12 });
      await setDoc(doc(db, "clientMachineSettings", "clientA_m1"), { clientId: "clientA", machineId: "m1", settings: { Seat: "4" } });
      await setDoc(doc(db, "machines", "m1"), { name: "Leg Press", order: 1 });
      await setDoc(doc(db, "machines", "m1", "settingHistory", "h1"), { clientId: "clientA", trainerId: "trainerA" });
      await setDoc(doc(db, "machineSettingChanges", "c1"), { clientId: "clientA" });
      await setDoc(doc(db, "routines", "r1"), { clientId: "clientA", name: "Routine A" });
      await setDoc(doc(db, "routines", "r1", "planChanges", "p1"), { kind: "start", machineIds: [], byUid: "trainerA" });
      await setDoc(doc(db, "routineAdjustments", "a1"), { clientId: "clientA" });
      await setDoc(doc(db, "exerciseLogs", "l1"), { sessionId: "sessionA", machineId: "m1", clientId: "clientA", weight: "100" });
      await setDoc(doc(db, "schedules", "b1"), { studioId: "studioA", clientId: "clientA", startTime: `${DAY}T14:00:00.000Z` });
      await setDoc(doc(db, "sessionNotes", "n1"), { clientId: "clientA", body: "old" });
      await setDoc(doc(db, "trainerFocuses", "tf1"), { clientId: "clientA" });
      await setDoc(doc(db, "progressReports", "pr1"), { clientId: "clientA", createdAt: new Date() });
      await setDoc(doc(db, "focusRecords", "fr1"), { clientId: "clientA" });
      await setDoc(doc(db, "journalEntries", "j1"), { clientId: "clientA", body: "Knee pain", occurredAt: new Date(), studioId: "studioA", importance: "critical" });
      await setDoc(doc(db, "clientFocuses", "cf1"), { clientId: "clientA", trainerId: "trainerA" });
      await setDoc(doc(db, "studios", "studioA", "sync", "lease"), { lastScheduleSyncAt: 1 });
      await setDoc(doc(db, "studios", "studioA", "sync", `near-${DAY}`), { checks: 1, finds: 0, rows: 3 });
      await setDoc(doc(db, "studios", "studioA", "machineCare", "m1"), { machineId: "m1" });
      await setDoc(doc(db, "studios", "studioA", "upkeepLog", "u1"), { machineId: "m1" });
      await setDoc(doc(db, "studios", "studioA", "taskTemplates", "tt1"), { title: "Open" });
      await setDoc(doc(db, "studios", "studioA", "taskInstances", "ti1"), { localDate: DAY, kind: "machine" });
      await setDoc(doc(db, "studios", "studioA", "taskRequests", "q1"), { status: "open", title: "Cover?", createdBy: { id: "trainerA" } });
      await setDoc(doc(db, "studios", "studioA", "taskRequests", "q1", "replies", "rp1"), { body: "Yes", author: { id: "trainerA" } });
      await setDoc(doc(db, "studios", "studioA", "taskCategories", "tc1"), { name: "Floor" });
      await setDoc(doc(db, "clinicalIncidents", "ci1"), { clientId: "clientA", studioId: "studioA" });
      await setDoc(doc(db, "machineTrends", "m1"), { machineId: "m1" });
    });
  });

  /** The twenty-four reads, each in the shape the app asks it. */
  const READS: Array<[string, (db: ReturnType<typeof as>) => Promise<unknown>]> = [
    ["trainers/{id}/stats (useTrainerRollups)", (db) => getDoc(doc(db, "trainers", "trainerA", "stats", "rollups"))],
    ["clientMachineSettings by client", (db) => getDocs(query(collection(db, "clientMachineSettings"), where("clientId", "==", "clientA")))],
    ["machines/{m}/settingHistory by client", (db) => getDocs(query(collection(db, "machines", "m1", "settingHistory"), where("clientId", "==", "clientA")))],
    ["machineSettingChanges by client", (db) => getDocs(query(collection(db, "machineSettingChanges"), where("clientId", "==", "clientA")))],
    ["routines by client", (db) => getDocs(query(collection(db, "routines"), where("clientId", "==", "clientA")))],
    ["routines/{id}/planChanges", (db) => getDocs(collection(db, "routines", "r1", "planChanges"))],
    ["routineAdjustments by client", (db) => getDocs(query(collection(db, "routineAdjustments"), where("clientId", "==", "clientA")))],
    ["exerciseLogs, the sets window", (db) => getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "in", ["sessionA"])))],
    ["schedules, a studio's day", (db) => getDocs(query(collection(db, "schedules"), where("studioId", "==", "studioA"), where("startTime", ">=", `${DAY}T00:00:00.000Z`)))],
    ["sessionNotes by client", (db) => getDocs(query(collection(db, "sessionNotes"), where("clientId", "==", "clientA"), limit(50)))],
    ["trainerFocuses by client", (db) => getDocs(query(collection(db, "trainerFocuses"), where("clientId", "==", "clientA"), limit(200)))],
    ["progressReports by client", (db) => getDocs(query(collection(db, "progressReports"), where("clientId", "==", "clientA"), orderBy("createdAt", "desc"), limit(20)))],
    ["focusRecords by client", (db) => getDocs(query(collection(db, "focusRecords"), where("clientId", "==", "clientA"), limit(200)))],
    ["journalEntries by client", (db) => getDocs(query(collection(db, "journalEntries"), where("clientId", "==", "clientA"), orderBy("occurredAt", "desc"), limit(100)))],
    ["clientFocuses by client", (db) => getDocs(query(collection(db, "clientFocuses"), where("clientId", "==", "clientA"), limit(200)))],
    ["studios/{s}/sync/lease", (db) => getDoc(doc(db, "studios", "studioA", "sync", "lease"))],
    ["studios/{s}/sync/near-{day}", (db) => getDoc(doc(db, "studios", "studioA", "sync", `near-${DAY}`))],
    ["studios/{s}/machineCare", (db) => getDocs(collection(db, "studios", "studioA", "machineCare"))],
    ["studios/{s}/upkeepLog", (db) => getDocs(collection(db, "studios", "studioA", "upkeepLog"))],
    ["studios/{s}/taskTemplates", (db) => getDocs(collection(db, "studios", "studioA", "taskTemplates"))],
    ["studios/{s}/taskInstances, a day", (db) => getDocs(query(collection(db, "studios", "studioA", "taskInstances"), where("localDate", "==", DAY)))],
    ["studios/{s}/taskRequests", (db) => getDocs(collection(db, "studios", "studioA", "taskRequests"))],
    ["studios/{s}/taskRequests/{id}/replies", (db) => getDocs(collection(db, "studios", "studioA", "taskRequests", "q1", "replies"))],
    ["studios/{s}/taskCategories", (db) => getDocs(collection(db, "studios", "studioA", "taskCategories"))],
    ["clinicalIncidents by client", (db) => getDocs(query(collection(db, "clinicalIncidents"), where("clientId", "==", "clientA")))],
  ];

  it.each(READS)("%s: a trainer reads it, as before", async (_name, read) => {
    await assertSucceeds(read(as("trainerA")));
  });

  it.each(READS)("%s: a signed-in account with no trainer record is refused", async (_name, read) => {
    await assertFails(read(stranger()));
  });

  it("a trainer at another studio reads them as before (nothing changes between studios in Round 0)", async () => {
    for (const [, read] of READS) await assertSucceeds(read(as("trainerB")));
  });

  it("an administrator's role claim with no record still reads (the claim is someone let in)", async () => {
    await assertSucceeds(READS[13][1](as("adminClaimOnly", { role: "Admin" })));
    await assertSucceeds(READS[7][1](as("adminClaimOnly", { role: "Admin" })));
  });

  it("someone signed out is refused, as before", async () => {
    await assertFails(READS[13][1](testEnv.unauthenticatedContext().firestore()));
  });

  /* What the access screens read for a stranger (the round document lists
     them): their own trainer document and the email lookup (the claim), the
     studios (the request names one), and their own request. All still open. */
  it("leaves the stranger every read the access screens make", async () => {
    const db = stranger();
    await assertSucceeds(getDoc(doc(db, "trainers", "strangerP0")));
    await assertSucceeds(getDocs(query(collection(db, "trainers"), where("email", "==", "stranger@example.com"))));
    await assertSucceeds(getDocs(collection(db, "studios")));
    await assertSucceeds(getDoc(doc(db, "access_requests", "strangerP0")));
  });

  describe("machineTrends: one machine's document for anyone let in, the list for administrators", () => {
    it("lets a trainer read one machine's document and refuses the stranger", async () => {
      await assertSucceeds(getDoc(doc(as("trainerA"), "machineTrends", "m1")));
      await assertFails(getDoc(doc(stranger(), "machineTrends", "m1")));
    });

    it("lets only an administrator list them", async () => {
      await assertFails(getDocs(collection(as("trainerA"), "machineTrends")));
      await assertSucceeds(getDocs(collection(as("adminP0"), "machineTrends")));
    });
  });

  describe("the dead and write-open collections", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientA", "crossTrainAccess", "studioB"), { granted: true, grantedBy: "ownerA", grantedAt: new Date() });
        await setDoc(doc(db, "crossTrainRequests", "x1"), { requestingTrainerId: "trainerB", targetStudioId: "studioA", status: "pending" });
        await setDoc(doc(db, "aggregations", "g1"), { n: 1 });
        await setDoc(doc(db, "leaderboards", "lb1"), { clientA: 3 });
        await setDoc(doc(db, "auditLogs", "al1"), { what: "x" });
        await setDoc(doc(db, "notificationQueue", "nq1"), { to: "x" });
      });
    });

    const DEAD: Array<[string, string[]]> = [
      ["clients/{id}/crossTrainAccess", ["clients", "clientA", "crossTrainAccess", "studioB"]],
      ["crossTrainRequests", ["crossTrainRequests", "x1"]],
      ["aggregations", ["aggregations", "g1"]],
      ["leaderboards", ["leaderboards", "lb1"]],
    ];

    it.each(DEAD)("%s: administrators only, to read and to write", async (_name, path) => {
      const [c, ...rest] = path;
      for (const db of [as("trainerA"), as("ownerA"), stranger()]) {
        await assertFails(getDoc(doc(db, c, ...rest)));
        await assertFails(setDoc(doc(db, c, ...rest), { n: 2 }, { merge: true }));
      }
      const admin = as("adminP0");
      await assertSucceeds(getDoc(doc(admin, c, ...rest)));
      await assertSucceeds(setDoc(doc(admin, c, ...rest), { n: 2 }, { merge: true }));
    });

    it("a leader no longer writes crossTrainAccess, and a trainer no longer files a crossTrainRequest (nothing in the app does)", async () => {
      await assertFails(
        setDoc(doc(as("ownerA"), "clients", "clientA", "crossTrainAccess", "studioA"), {
          granted: true, grantedAt: new Date(), grantedBy: "ownerA",
        }),
      );
      await assertFails(
        setDoc(doc(as("trainerB"), "crossTrainRequests", "x2"), { requestingTrainerId: "trainerB", status: "pending", targetStudioId: "studioA" }),
      );
    });

    it("auditLogs and notificationQueue take no write from the app, an administrator's included; administrators still read them", async () => {
      for (const db of [as("trainerA"), stranger(), as("adminP0")]) {
        await assertFails(addDoc(collection(db, "auditLogs"), { what: "x" }));
        await assertFails(addDoc(collection(db, "notificationQueue"), { to: "x" }));
      }
      await assertSucceeds(getDoc(doc(as("adminP0"), "auditLogs", "al1")));
      await assertSucceeds(getDoc(doc(as("adminP0"), "notificationQueue", "nq1")));
    });

    it("clinicalIncidents: read by anyone let in, written by administrators only", async () => {
      await assertSucceeds(getDoc(doc(as("trainerA"), "clinicalIncidents", "ci1")));
      await assertFails(setDoc(doc(as("trainerA"), "clinicalIncidents", "ci2"), { clientId: "clientA", studioId: "studioA" }));
      await assertFails(updateDoc(doc(as("trainerA"), "clinicalIncidents", "ci1"), { clientId: "clientB" }));
      await assertFails(deleteDoc(doc(as("trainerA"), "clinicalIncidents", "ci1")));
      await assertSucceeds(setDoc(doc(as("adminP0"), "clinicalIncidents", "ci2"), { clientId: "clientA", studioId: "studioA" }));
    });
  });

  /* THE CLAIM DOOR. Nothing ever set a `studioId` token claim (claims-logic.ts
     mirrors `role` only and strips a stray one), but the rules honoured it as
     studio-leader access with no role check and no trainer record. Gone. */
  describe("a studioId token claim grants nothing", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", "studioA", "vault", "v1"), { title: "Alarm code" });
      });
    });

    it("not to a trainer at another studio, nor to an account with no record", async () => {
      await assertFails(getDoc(doc(as("trainerB", { studioId: "studioA" }), "studios", "studioA", "vault", "v1")));
      await assertFails(getDoc(doc(as("claimOnlyP0", { studioId: "studioA" }), "studios", "studioA", "vault", "v1")));
      await assertFails(getDocs(collection(as("claimOnlyP0", { studioId: "studioA" }), "studios", "studioA", "machineCare")));
      await assertFails(
        setDoc(doc(as("claimOnlyP0", { studioId: "studioA" }), "studioMachineSettings", "studioA_m1"), { studioId: "studioA", machineId: "m1" }),
      );
    });

    it("while the studio's own leader reads its vault as before", async () => {
      await assertSucceeds(getDoc(doc(as("ownerA"), "studios", "studioA", "vault", "v1")));
    });
  });
});

// ── PRIVACY ROUND 0: HONEST SESSIONS (Oct 14 2026) ──────────────────────
// sessionIsReadable trusts a session's host and client, so an update may no
// longer move either (sessionTenancyKept): the host stays, or a session with
// none is given its own client's home once; the client
// stays, or is named once on an open session, or is moved by the merge, to a
// client the caller can read, and never across the Demo Mode line. Every
// write the app makes to a session is here in its own shape and passes; the
// round document lists them with their file and line.
describe("privacy Round 0: honest sessions", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore();
  const S = "honestS";
  const OPEN = "honestOpen";
  const LEGACY = "honestLegacy";
  const hourAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "trainerA2"), { fullName: "Trainer A2", initials: "A2", role: "LifeTransformer", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
      await setDoc(doc(db, "trainers", "leaderA"), { fullName: "Lee Leader", initials: "LL", role: "StudioLeader", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
      await setDoc(doc(db, "trainers", "adminHS"), { fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "studioA" });
      const client = (home: string, extra: Record<string, unknown> = {}) => ({ firstName: "C", lastName: home, isActive: true, remainingSessions: 0, homeStudioId: home, ...extra });
      await setDoc(doc(db, "clients", "clientA"), client("studioA"));
      await setDoc(doc(db, "clients", "clientB"), client("studioB"));
      // Homed at A, approved to cross-train at B: trainerB reads her.
      await setDoc(doc(db, "clients", "clientV"), client("studioA", { approvedCrossTrainStudioIds: ["studioB"] }));
      // Homed at B, approved at A: a visitor in A's roster.
      await setDoc(doc(db, "clients", "visitorAtA"), client("studioB", { approvedCrossTrainStudioIds: ["studioA"] }));
      await setDoc(doc(db, "clients", "tempP"), client("studioA", { isProvisional: true }));
      await setDoc(doc(db, "clients", "demoClient"), client("demo-studio", { isDemo: true }));
      await setDoc(doc(db, "sessions", S), {
        clientId: "clientA", hostedAtStudioId: "studioA", homeStudioId: "studioA", clientHomeStudioId: "studioA",
        trainerId: "trainerA", startedByTrainerId: "trainerA", trainerName: "Trainer A", trainerInitials: "TA",
        status: "In-Progress", sessionNumber: 5, date: "2026-10-14", pausedAt: null, totalPausedMs: 0,
        sessionMachineIds: ["m1", "m2"], lastHeartbeatAt: hourAgo, createdAt: hourAgo,
      });
      await setDoc(doc(db, "sessions", OPEN), {
        isUnassigned: true, sessionType: "Standard", sessionNumber: 0, date: "2026-10-14", hostedAtStudioId: "studioA",
        clientHomeStudioId: null, isCrossTrain: false, sessionMachineIds: [], trainerId: "trainerA", startedByTrainerId: "trainerA",
        trainerName: "Trainer A", trainerInitials: "TA", status: "In-Progress", lastHeartbeatAt: hourAgo, createdAt: hourAgo,
      });
      // A legacy session written before hostedAtStudioId: no host at all.
      await setDoc(doc(db, "sessions", LEGACY), {
        clientId: "clientV", trainerId: "trainerB", trainerName: "Trainer B", trainerInitials: "TB",
        status: "In-Progress", sessionNumber: 3, date: "2026-10-01", createdAt: hourAgo,
      });
      await setDoc(doc(db, "exerciseLogs", `${S}_m1`), { sessionId: S, machineId: "m1", clientId: "clientA", weight: "100", reps: "10", studioId: "studioA" });
    });
  });

  describe("every write the app makes to a session still passes", () => {
    it("pause and resume (WorkoutTrackerView toggleSessionPause)", async () => {
      const db = as("trainerA");
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { pausedAt: new Date() }));
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { pausedAt: null, totalPausedMs: 120000 }));
    });

    it("resume a colleague's left-open session, and take over a watched one (takeOverPatch)", async () => {
      const patch = (uid: string, name: string, initials: string, device: string) => ({
        trainerId: uid, trainerName: name, trainerInitials: initials, recordingDeviceId: device,
        lastHeartbeatAt: serverTimestamp(),
      });
      await assertSucceeds(updateDoc(doc(as("trainerA2"), "sessions", S), patch("trainerA2", "Trainer A2", "A2", "dev-2")));
      await assertSucceeds(updateDoc(doc(as("ownerA"), "sessions", S), patch("ownerA", "Owner A", "OA", "dev-3")));
    });

    it("continue on this iPad, the heartbeat, and the session's own list", async () => {
      const db = as("trainerA");
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { recordingDeviceId: "dev-9", lastHeartbeatAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { lastHeartbeatAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { sessionMachineIds: ["m2", "m1", "m3"], lastHeartbeatAt: serverTimestamp() }));
    });

    it("Start's follow-up: the routine made and the session told, in one batch", async () => {
      const db = as("trainerA");
      const b = writeBatch(db);
      b.set(doc(db, "routines", "routineHS"), { clientId: "clientA", studioId: "studioA", name: "Routine A", machineIds: [] });
      b.update(doc(db, "sessions", S), { routineId: "routineHS", sessionMachineIds: ["m1", "m2"], lastHeartbeatAt: serverTimestamp() });
      await assertSucceeds(b.commit());
    });

    it("resume a colleague's left-open OPEN session, and keep a set-up on it", async () => {
      const db = as("trainerA2");
      await assertSucceeds(updateDoc(doc(db, "sessions", OPEN), {
        trainerId: "trainerA2", trainerName: "Trainer A2", trainerInitials: "A2", recordingDeviceId: "dev-2", lastHeartbeatAt: serverTimestamp(),
      }));
      await assertSucceeds(updateDoc(doc(db, "sessions", OPEN), { "heldSetup.m1": { values: { Seat: "3" }, at: serverTimestamp(), byUid: "trainerA2" } }));
    });

    it("Who's this?: the session's trainer names a client from the studio's roster, a visitor approved here included", async () => {
      const assign = (clientId: string, home: string) => ({
        clientId, isUnassigned: false, mindbodyClientId: null, clientName: "C", homeStudioId: home, clientHomeStudioId: home,
        isCrossTrain: home !== "studioA", sessionNumber: 1, lastHeartbeatAt: serverTimestamp(),
      });
      await assertSucceeds(updateDoc(doc(as("trainerA"), "sessions", OPEN), assign("visitorAtA", "studioB")));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "sessions", OPEN), { clientId: deleteField(), isUnassigned: true });
      });
      await assertSucceeds(updateDoc(doc(as("trainerA"), "sessions", OPEN), assign("clientA", "studioA")));
    });

    it("At End Session and back again (the endTime mark)", async () => {
      const db = as("trainerA");
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { endTime: serverTimestamp() }));
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { endTime: deleteField() }));
    });

    it("Finish, then the Wrap-up's effort Dial on the finished session", async () => {
      const db = as("trainerA");
      await assertSucceeds(updateDoc(doc(db, "sessions", S), {
        status: "Completed", endTime: serverTimestamp(), trainerId: "trainerA", trainerName: "Trainer A", trainerInitials: "TA",
        clientId: "clientA", homeStudioId: "studioA", clientHomeStudioId: "studioA", hostedAtStudioId: "studioA",
      }));
      await assertSucceeds(updateDoc(doc(db, "sessions", S), { effort: 7, effortDefaulted: deleteField() }));
    });

    it("Finish it as it was: a colleague finishes it under its own trainer, with the marker", async () => {
      const db = as("ownerA");
      const b = writeBatch(db);
      b.update(doc(db, "sessions", S), {
        status: "Completed", endTime: hourAgo, trainerId: "trainerA", trainerName: "Trainer A", trainerInitials: "TA",
        clientId: "clientA", homeStudioId: "studioA", clientHomeStudioId: "studioA", hostedAtStudioId: "studioA",
      });
      b.set(doc(db, "sessions", S, "finish", "once"), { finishId: "f-asit", by: "ownerA", at: serverTimestamp(), clientId: "clientA", deviceId: "dev-o", asItWas: true });
      await assertSucceeds(b.commit());
    });

    it("Finish of a session with no host fills it with the client's home, for a visitor who doesn't work there", async () => {
      await assertSucceeds(updateDoc(doc(as("trainerB"), "sessions", LEGACY), {
        status: "Completed", endTime: serverTimestamp(), trainerId: "trainerB", trainerName: "Trainer B", trainerInitials: "TB",
        clientId: "clientV", homeStudioId: "studioA", clientHomeStudioId: "studioA", hostedAtStudioId: "studioA",
      }));
    });

    /* The coordinator's edge (Oct 14 2026): Who's this? hands assignSessionPatch
       `session.hostedAtStudioId || contextActiveStudioId` (WorkoutTrackerView ~2961),
       but only to work out isCrossTrain; the patch never writes the host. So an open
       session with no host, named to a visitor approved at the caller's studio whose
       home is elsewhere, passes: the host is untouched. Finish then fills the host
       with the client's home (sync-utils), which the pin accepts. Open session itself
       always writes the iPad's studio (open-session/start.ts), so this host-less open
       session is a what-if, held here anyway. */
    it("Who's this? and Finish on an open session with no host, naming a visitor homed elsewhere, both pass", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "sessions", "hostlessOpen"), {
          isUnassigned: true, hostedAtStudioId: "", trainerId: "trainerA", status: "In-Progress", sessionNumber: 0, date: "2026-10-14",
        });
      });
      const db = as("trainerA");
      // As the tracker builds it: the session's (empty) host, else the iPad's studio.
      const sessionHost: string = "";
      const patch = assignSessionPatch({
        client: { id: "visitorAtA", firstName: "C", lastName: "studioB", homeStudioId: "studioB" },
        hostedAtStudioId: sessionHost || "studioA",
        stamp: serverTimestamp(),
      });
      expect(Object.keys(patch)).not.toContain("hostedAtStudioId");
      await assertSucceeds(updateDoc(doc(db, "sessions", "hostlessOpen"), patch));
      await assertSucceeds(updateDoc(doc(db, "sessions", "hostlessOpen"), {
        status: "Completed", endTime: serverTimestamp(), trainerId: "trainerA", trainerName: "Trainer A", trainerInitials: "TA",
        clientId: "visitorAtA", homeStudioId: "studioB", clientHomeStudioId: "studioB", hostedAtStudioId: "studioB", isUnassigned: false,
      }));
    });

    it("...and with nothing else, the caller's own studio included (the review: no app path writes it)", async () => {
      await assertFails(updateDoc(doc(as("trainerB"), "sessions", LEGACY), { hostedAtStudioId: "studioB" }));
    });

    it("History: edit a finished session hosted elsewhere, as a trainer at the client's home; and delete one", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "sessions", LEGACY), { status: "Completed", hostedAtStudioId: "studioB" });
      });
      const db = as("trainerA");
      await assertSucceeds(updateDoc(doc(db, "sessions", LEGACY), {
        notes: "Corrected", editedAt: serverTimestamp(), editedByUid: "trainerA", editedByName: "Trainer A", editedByInitials: "TA",
        editCount: increment(1), updatedAt: new Date(), sessionMachineIds: ["m1"],
      }));
      const b = writeBatch(db);
      b.delete(doc(db, "sessions", LEGACY));
      await assertSucceeds(b.commit());
    });

    it("Discard: the session and its sets in one batch", async () => {
      const db = as("trainerA");
      const b = writeBatch(db);
      b.delete(doc(db, "exerciseLogs", `${S}_m1`));
      b.delete(doc(db, "exerciseLogs", `${S}_m2`));
      b.delete(doc(db, "sessions", S));
      await assertSucceeds(b.commit());
    });

    it("the provisional merge: a leader moves a temporary client's sessions to a client in the studio's roster, a visitor included", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        for (let i = 0; i < 30; i += 1) {
          await setDoc(doc(db, "sessions", `merge${i}`), {
            clientId: "tempP", hostedAtStudioId: "studioA", trainerId: "trainerA", status: "Completed", sessionNumber: i + 1,
          });
        }
      });
      const db = as("leaderA");
      const b = writeBatch(db);
      for (let i = 0; i < 30; i += 1) b.update(doc(db, "sessions", `merge${i}`), { clientId: "visitorAtA" });
      await assertSucceeds(b.commit());
      expect((await getDoc(doc(db, "sessions", "merge29"))).data()?.clientId).toBe("visitorAtA");
    });

    it("an administrator merges across studios", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "sessions", "merge0"), { clientId: "tempP", hostedAtStudioId: "studioA", trainerId: "trainerA", status: "Completed" });
      });
      await assertSucceeds(updateDoc(doc(as("adminHS"), "sessions", "merge0"), { clientId: "clientB" }));
    });

    it("Demo Mode's reset writes its own sessions over again, whole", async () => {
      const demoSession = {
        clientId: "demoClient", clientName: "C demo-studio", hostedAtStudioId: "demo-studio", clientHomeStudioId: "demo-studio",
        homeStudioId: "demo-studio", status: "Completed", trainerId: "demo-trainer-ana", startedByTrainerId: "demo-trainer-ana",
        trainerName: "Ana Demo", trainerInitials: "AD", sessionNumber: 4, date: "2026-10-01", isDemo: true,
      };
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "sessions", "demo-session-1"), demoSession);
      });
      const db = as("trainerB");
      const b = writeBatch(db);
      b.set(doc(db, "sessions", "demo-session-1"), demoSession, { merge: false });
      await assertSucceeds(b.commit());
    });

    it("Start, Open session and Log past session create as before (the create rule is unchanged)", async () => {
      const db = as("trainerA");
      await assertSucceeds(setDoc(doc(db, "sessions", "startHS"), { clientId: "clientA", hostedAtStudioId: "studioA", status: "In-Progress", trainerId: "trainerA" }));
      await assertSucceeds(setDoc(doc(db, "sessions", "openHS"), { isUnassigned: true, hostedAtStudioId: "studioA", status: "In-Progress", trainerId: "trainerA" }));
      await assertSucceeds(setDoc(doc(db, "sessions", "pastHS"), { clientId: "clientA", hostedAtStudioId: "unknown", status: "Completed", trainerId: "trainerA", sessionNumber: 2 }));
    });
  });

  describe("what can no longer happen", () => {
    it("re-hosting a session, at Demo Mode, at another studio, for anyone, an administrator included", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { hostedAtStudioId: "demo-studio" }));
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { hostedAtStudioId: "studioB" }));
      await assertFails(updateDoc(doc(as("adminHS"), "sessions", S), { hostedAtStudioId: "studioB" }));
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { hostedAtStudioId: deleteField() }));
    });

    it("giving a session with no host a studio that isn't its client's home, or Demo Mode", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "studios", "studioC"), { name: "Studio C" });
      });
      await assertFails(updateDoc(doc(as("trainerB"), "sessions", LEGACY), { hostedAtStudioId: "studioC" }));
      await assertFails(updateDoc(doc(as("trainerB"), "sessions", LEGACY), { hostedAtStudioId: "demo-studio" }));
    });

    it("naming a client on an open session that the caller can't read", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", OPEN), { clientId: "clientB", isUnassigned: false }));
    });

    it("naming a Demo client on a real open session, or a real client on a Demo one", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", OPEN), { clientId: "demoClient", isUnassigned: false }));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "sessions", "demoOpen"), {
          isUnassigned: true, hostedAtStudioId: "demo-studio", trainerId: "trainerB", status: "In-Progress",
        });
      });
      await assertFails(updateDoc(doc(as("trainerB"), "sessions", "demoOpen"), { clientId: "clientB", isUnassigned: false }));
      // ...while Demo Mode's own open session takes a Demo client, as before.
      await assertSucceeds(updateDoc(doc(as("trainerB"), "sessions", "demoOpen"), { clientId: "demoClient", isUnassigned: false }));
    });

    it("re-pointing a client's session at a client the caller can't read, or at a Demo client", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { clientId: "clientB" }));
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { clientId: "demoClient" }));
      await assertFails(updateDoc(doc(as("adminHS"), "sessions", S), { clientId: "demoClient" }));
    });

    it("taking a session's client off it", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { clientId: "" }));
      await assertFails(updateDoc(doc(as("trainerA"), "sessions", S), { clientId: deleteField() }));
    });
  });

  describe("a real client's approvals never name Demo Mode", () => {
    it("is refused for a trainer, a leader and an administrator alike", async () => {
      for (const uid of ["trainerA", "ownerA", "adminHS"]) {
        await assertFails(updateDoc(doc(as(uid), "clients", "clientA"), { approvedCrossTrainStudioIds: ["studioB", "demo-studio"] }));
        await assertFails(updateDoc(doc(as(uid), "clients", "clientA"), { approvedCrossTrainStudioIds: arrayUnion("demo-studio") }));
      }
    });

    it("leaves every other approval as it was, and a Demo client's own", async () => {
      await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", "clientA"), { approvedCrossTrainStudioIds: ["studioB"] }));
      await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", "clientA"), { approvedCrossTrainStudioIds: [] }));
      await assertSucceeds(updateDoc(doc(as("trainerB"), "clients", "demoClient"), { approvedCrossTrainStudioIds: ["demo-studio"] }));
    });

    it("checks only what is added: a client already holding demo-studio can lose it, or gain another studio", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "clients", "clientA"), { approvedCrossTrainStudioIds: ["demo-studio"] });
      });
      await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", "clientA"), { approvedCrossTrainStudioIds: ["demo-studio", "studioB"] }));
      await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", "clientA"), { approvedCrossTrainStudioIds: ["studioB"] }));
    });

    it("Finish's totals on a client still land (the approvals aren't touched)", async () => {
      await assertSucceeds(updateDoc(doc(as("trainerA"), "clients", "clientA"), {
        completedSessions: increment(1), sessionCount: increment(1), lastSessionDate: "2026-10-14", updatedAt: serverTimestamp(),
      }));
      await assertSucceeds(updateDoc(doc(as("trainerB"), "clients", "clientV"), {
        completedSessions: increment(1), sessionCount: increment(1), lastSessionDate: "2026-10-14", updatedAt: serverTimestamp(),
      }));
    });
  });
});

// The sessions update rule asks who may update with the caller resolved once
// (sessionIsReadable, privacy Round 0): the same people as before, with or
// without a role claim on the token. Without one, the old test ran out of the
// 1,000-expression budget on the client branch (docs/ops/RULES-NOTES.md
// #sessiontenancykept, "THE BUDGET").
describe("privacy Round 0: the sessions update asks the same people, resolved once", () => {
  const ctx = (uid: string, claim: boolean) =>
    testEnv.authenticatedContext(uid, claim ? { role: "LifeTransformer" } : {}).firestore();
  const edit = { notes: "Corrected", editCount: increment(1), editedAt: serverTimestamp(), updatedAt: new Date() };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioC"), { name: "Studio C" });
      await setDoc(doc(db, "trainers", "trainerC"), { fullName: "Trainer C", initials: "TC", role: "LifeTransformer", primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"] });
      await setDoc(doc(db, "clients", "clientV"), { firstName: "Vi", lastName: "Visit", isActive: true, remainingSessions: 0, homeStudioId: "studioA", approvedCrossTrainStudioIds: ["studioB"] });
      await setDoc(doc(db, "sessions", "histV"), { clientId: "clientV", trainerId: "trainerA", hostedAtStudioId: "studioA", status: "Completed", sessionNumber: 4, date: "2026-10-02" });
    });
  });

  it.each([false, true])("an approved studio's trainer edits the client's session in History (role claim: %s)", async (claim) => {
    await assertSucceeds(updateDoc(doc(ctx("trainerB", claim), "sessions", "histV"), edit));
  });

  it.each([false, true])("the client's home studio's trainer and an administrator do too, and a trainer the session is nothing to doesn't (role claim: %s)", async (claim) => {
    await assertSucceeds(updateDoc(doc(ctx("trainerA", claim), "sessions", "histV"), edit));
    await assertFails(updateDoc(doc(ctx("trainerC", claim), "sessions", "histV"), edit));
    await assertSucceeds(updateDoc(doc(testEnv.authenticatedContext("adminClaimOnly", { role: "Admin" }).firestore(), "sessions", "histV"), edit));
    await assertFails(updateDoc(doc(testEnv.authenticatedContext("strangerS", {}).firestore(), "sessions", "histV"), edit));
  });
});

// ── THE TRAINER LOCK (Oct 18 2026) ──────────────────────────────────────
// docs/rounds/2026-10-18-trainer-lock.md; AJ: "1a 2a 3a". A trainer record
// is read by its owner, the company tier, the claim's email lookup, and
// anyone who shares a studio with it (docs/ops/RULES-NOTES.md
// #trainerrecordreadable). The app reads it through five queries
// (features/trainer-scope/read.ts), each run here in its own shape. Every
// context below carries NO role claim unless the test says so: the
// no-claim path is the expression budget's worst case.
describe("the trainer lock", () => {
  const as = (uid: string, token: Record<string, unknown> = { email: `${uid}@test.com` }) =>
    testEnv.authenticatedContext(uid, token).firestore();
  /** The five queries the app runs for the studios S, as the app writes them. */
  const scoped = (db: ReturnType<typeof as>, S: string[]) => [
    getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", S))),
    getDocs(query(collection(db, "trainers"), where("accessibleStudioIds", "array-contains-any", S))),
    getDocs(query(collection(db, "trainers"), where("activeGuestStudioIds", "array-contains-any", S))),
    getDocs(query(collection(db, "trainers"), where("ownedStudioIds", "array-contains-any", S))),
    getDocs(query(collection(db, "trainers"), where("managedStudioIds", "array-contains-any", S))),
  ];
  /** The ids the five queries return, merged, as the app merges them. */
  const idsOf = async (db: ReturnType<typeof as>, S: string[]) => {
    const snaps = await Promise.all(scoped(db, S));
    return [...new Set(snaps.flatMap((s) => s.docs.map((d) => d.id)))].sort();
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioC"), { name: "Studio C" });
      // Studio B's people tied to Studio A in each of the other four ways.
      await setDoc(doc(db, "trainers", "floaterB"), { fullName: "Flo B", initials: "FB", role: "LifeTransformer", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB", "studioA"] });
      await setDoc(doc(db, "trainers", "guestB"), { fullName: "Gus B", initials: "GB", role: "LifeTransformer", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"], activeGuestStudioIds: ["studioA"] });
      await setDoc(doc(db, "trainers", "grantB"), { fullName: "Gail B", initials: "GL", role: "LifeTransformer", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"], managedStudioIds: ["studioA"] });
      // The franchise owner of Studio A, homed at Studio C.
      await setDoc(doc(db, "trainers", "franchiseX"), { fullName: "Frank X", initials: "FX", role: "Owner", primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"], ownedStudioIds: ["studioA"] });
      // Studio C's leader: runs C, nothing to do with A or B.
      await setDoc(doc(db, "trainers", "leaderC"), { fullName: "Lee C", initials: "LC", role: "StudioLeader", primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"] });
      await setDoc(doc(db, "trainers", "adminZ"), { fullName: "Admin Z", initials: "AZ", role: "Admin", primaryHomeStudioId: "system", accessibleStudioIds: ["system"] });
      // Demo Mode's practice trainer, and a profile made in advance at Studio B.
      await setDoc(doc(db, "trainers", "demo-trainer-1"), { fullName: "Demo One", initials: "D1", role: "LifeTransformer", primaryHomeStudioId: "demo-studio", accessibleStudioIds: ["demo-studio"], isDemo: true, pendingClaim: true });
      await setDoc(doc(db, "trainers", "placeholderP"), { fullName: "Pat New", initials: "PN", role: "LifeTransformer", primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB"], email: "pat.new@example.com", pendingClaim: true });
    });
  });

  it("a trainer's five queries each pass, and together hold exactly the people tied to their studio", async () => {
    const db = as("trainerA");
    for (const read of scoped(db, ["studioA", "demo-studio"])) await assertSucceeds(read);
    expect(await idsOf(db, ["studioA", "demo-studio"])).toEqual(
      ["demo-trainer-1", "floaterB", "franchiseX", "grantB", "guestB", "ownerA", "trainerA"].sort(),
    );
  });

  it("the same with the role claim on the token, the production path", async () => {
    const db = as("trainerA", { email: "trainera@test.com", role: "LifeTransformer" });
    for (const read of scoped(db, ["studioA", "demo-studio"])) await assertSucceeds(read);
  });

  it("refuses the whole collection, another studio's queries, and another studio's record", async () => {
    const db = as("trainerA");
    await assertFails(getDocs(collection(db, "trainers")));
    await assertFails(getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", ["studioB"]))));
    await assertFails(getDocs(query(collection(db, "trainers"), where("accessibleStudioIds", "array-contains-any", ["studioB"]))));
    // One studio outside the scope poisons the whole list: the rules refuse a query if any document it could return fails.
    await assertFails(getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", ["studioA", "studioB"]))));
    await assertFails(getDoc(doc(db, "trainers", "trainerB")));
    await assertFails(getDoc(doc(db, "trainers", "leaderC")));
    await assertFails(getDoc(doc(db, "trainers", "placeholderP")));
  });

  it("reads their own record, a colleague's, the studio's owner's, and Demo Mode's", async () => {
    const db = as("trainerA");
    await assertSucceeds(getDoc(doc(db, "trainers", "trainerA")));
    await assertSucceeds(getDoc(doc(db, "trainers", "ownerA")));
    await assertSucceeds(getDoc(doc(db, "trainers", "floaterB")));
    await assertSucceeds(getDoc(doc(db, "trainers", "guestB")));
    await assertSucceeds(getDoc(doc(db, "trainers", "grantB")));
    await assertSucceeds(getDoc(doc(db, "trainers", "franchiseX")));
    await assertSucceeds(getDoc(doc(db, "trainers", "demo-trainer-1")));
    await assertSucceeds(getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", ["demo-studio"]))));
  });

  it("a floater, a guest and the grant each read both their studios' people", async () => {
    for (const uid of ["floaterB", "guestB", "grantB"]) {
      const db = as(uid);
      for (const read of scoped(db, ["studioB", "studioA", "demo-studio"])) await assertSucceeds(read);
      await assertSucceeds(getDoc(doc(db, "trainers", "trainerA")));
      await assertSucceeds(getDoc(doc(db, "trainers", "trainerB")));
      await assertFails(getDoc(doc(db, "trainers", "leaderC")));
    }
  });

  it("a franchise owner reads their home and the studios they own, as its leaders do, and nowhere else", async () => {
    const db = as("franchiseX");
    for (const read of scoped(db, ["studioC", "studioA", "demo-studio"])) await assertSucceeds(read);
    await assertSucceeds(getDoc(doc(db, "trainers", "trainerA")));
    await assertSucceeds(getDoc(doc(db, "trainers", "leaderC")));
    await assertFails(getDoc(doc(db, "trainers", "trainerB")));
    await assertFails(getDocs(query(collection(db, "trainers"), where("primaryHomeStudioId", "in", ["studioB"]))));
  });

  it("a studio leader reads the studios they run, not their group (AJ's 2a)", async () => {
    const db = as("leaderC");
    await assertSucceeds(getDoc(doc(db, "trainers", "franchiseX")));
    await assertFails(getDoc(doc(db, "trainers", "trainerA")));
    await assertFails(getDoc(doc(db, "trainers", "trainerB")));
    await assertFails(getDocs(collection(db, "trainers")));
  });

  it("a plain trainer's leftover owned studio opens nothing to them, while the record it names is theirs to be seen by", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { ownedStudioIds: ["studioB"] });
    });
    // The caller's owned studios count only for a role that runs its own (roleRunsOwnStudios).
    await assertFails(getDoc(doc(as("trainerA"), "trainers", "trainerB")));
    await assertFails(getDocs(query(collection(as("trainerA"), "trainers"), where("primaryHomeStudioId", "in", ["studioB"]))));
    // Studio B's people see a record naming their studio in ownedStudioIds: the
    // app's query returns it, and a list is refused whole otherwise.
    await assertSucceeds(getDoc(doc(as("trainerB"), "trainers", "trainerA")));
    await assertSucceeds(getDocs(query(collection(as("trainerB"), "trainers"), where("ownedStudioIds", "array-contains-any", ["studioB", "demo-studio"]))));
  });

  it("the company tier lists everyone, by the record or by the claim alone", async () => {
    await assertSucceeds(getDocs(collection(as("adminZ"), "trainers")));
    await assertSucceeds(getDoc(doc(as("adminZ"), "trainers", "placeholderP")));
    await assertSucceeds(getDocs(collection(as("adminClaimOnly", { email: "ac@test.com", role: "Admin" }), "trainers")));
    await assertSucceeds(getDocs(collection(as("founderClaimOnly", { email: "fc@test.com", role: "Founder" }), "trainers")));
  });

  it("a stranger reads a profile made for them by their own email, in any case, and nothing else", async () => {
    const pat = as("pat-uid", { email: "pat.new@example.com" });
    const found = await assertSucceeds(getDocs(query(collection(pat, "trainers"), where("email", "==", "pat.new@example.com"))));
    expect(found.docs.map((d) => d.id)).toEqual(["placeholderP"]);
    await assertSucceeds(getDoc(doc(pat, "trainers", "placeholderP")));
    // The app's uid-first lookup: their own id, before any record is there.
    await assertSucceeds(getDoc(doc(pat, "trainers", "pat-uid")));
    // Someone else's email, the whole list, a colleague-to-be's record: no.
    await assertFails(getDocs(query(collection(pat, "trainers"), where("email", "==", "trainera@test.com"))));
    await assertFails(getDocs(collection(pat, "trainers")));
    await assertFails(getDoc(doc(pat, "trainers", "trainerB")));
    // The sign-in's email in another case still matches the lower-cased record.
    const upper = as("pat-uid-2", { email: "Pat.New@Example.com" });
    await assertSucceeds(getDocs(query(collection(upper, "trainers"), where("email", "==", "pat.new@example.com"))));
  });

  it("a sign-in with no email on its token matches no profile (AJ's 1a)", async () => {
    const noEmail = testEnv.authenticatedContext("ms-no-email", {}).firestore();
    await assertFails(getDocs(query(collection(noEmail, "trainers"), where("email", "==", "pat.new@example.com"))));
    await assertFails(getDoc(doc(noEmail, "trainers", "placeholderP")));
    await assertSucceeds(getDoc(doc(noEmail, "trainers", "ms-no-email")));
  });

  it("a trainer let in may still read a profile carrying their email, the claim's own case", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "oldPlaceholderA"), { fullName: "Trainer A", initials: "TA", role: "LifeTransformer", primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"], email: "trainera@test.com", pendingClaim: true });
    });
    await assertSucceeds(getDocs(query(collection(as("trainerA"), "trainers"), where("email", "==", "trainera@test.com"))));
  });

  it("leaves a trainer's counters and a signed-out read as they were", async () => {
    // trainers/{id}/stats stays readable by anyone let in (not in this round's scope).
    await assertSucceeds(getDoc(doc(as("trainerB"), "trainers", "trainerA", "stats", "rollups")));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "trainers", "trainerA")));
    await assertFails(getDocs(query(collection(testEnv.unauthenticatedContext().firestore(), "trainers"), where("primaryHomeStudioId", "in", ["studioA"]))));
  });
});

// Ask the Academy, phase 3 (Oct 19 2026; AJ's 3a): head office's list of the
// questions the Academy can't answer and answers flagged wrong. Anyone who
// works at the studio adds one in exactly head-office.ts's shape, never who
// asked; only administrators read, mark or delete.
describe("academy_questions: head office's list", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const entry = (over: Record<string, unknown> = {}) => ({
    question: "The leg press squeaks. How do I fix it?",
    reason: "not_covered",
    studioId: "studioA",
    day: "2026-10-19",
    mark: "open",
    at: serverTimestamp(),
    ...over,
  });
  async function seedAdmin() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminQ"), { fullName: "Admin Q", initials: "AQ", role: "Admin", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
      await setDoc(doc(context.firestore(), "academy_questions", "q1"), { ...entry(), at: new Date("2026-10-19T12:00:00Z") });
    });
  }

  it("lets a trainer add a question for their own studio, and a flagged answer with its reason", async () => {
    await assertSucceeds(addDoc(collection(as("trainerA"), "academy_questions"), entry()));
    await assertSucceeds(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "flagged", why: "Wrong page.", answer: "Keep them breathing." })));
    await assertSucceeds(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "conflicting" })));
  });

  it("refuses another studio, a name or id, a mark, a backdate, an unknown reason, or a reason on an unflagged one", async () => {
    await assertFails(addDoc(collection(as("trainerB"), "academy_questions"), entry()));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ uid: "trainerA" })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ mark: "done" })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ at: new Date("2026-10-01T12:00:00Z") })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "gossip" })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ why: "nothing flagged" })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ question: "x".repeat(301) })));
    await assertFails(addDoc(collection(testEnv.unauthenticatedContext().firestore(), "academy_questions"), entry()));
  });

  it("lets a flagged answer carry its sender, only as the signed-in person, and never an unanswered question", async () => {
    await assertSucceeds(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "flagged", by: { uid: "trainerA", name: "Trainer A" } })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "flagged", by: { uid: "ownerA", name: "Owner A" } })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ by: { uid: "trainerA", name: "Trainer A" } })));
    await assertFails(addDoc(collection(as("trainerA"), "academy_questions"), entry({ reason: "flagged", by: { uid: "trainerA", name: "Trainer A", email: "a@x.com" } })));
  });

  it("lets only an administrator read, mark and delete", async () => {
    await seedAdmin();
    const listOpen = (db: ReturnType<typeof as>) => getDocs(query(collection(db, "academy_questions"), where("mark", "==", "open"), orderBy("at", "desc"), limit(300)));
    await assertFails(getDoc(doc(as("trainerA"), "academy_questions", "q1")));
    await assertFails(listOpen(as("ownerA")));
    await assertFails(updateDoc(doc(as("ownerA"), "academy_questions", "q1"), { mark: "done" }));
    await assertFails(deleteDoc(doc(as("trainerA"), "academy_questions", "q1")));
    await assertSucceeds(listOpen(as("adminQ")));
    await assertSucceeds(updateDoc(doc(as("adminQ"), "academy_questions", "q1"), { mark: "page" }));
    // A mark only, and only one of the three.
    await assertFails(updateDoc(doc(as("adminQ"), "academy_questions", "q1"), { mark: "lost" }));
    await assertFails(updateDoc(doc(as("adminQ"), "academy_questions", "q1"), { question: "Edited" }));
    await assertSucceeds(deleteDoc(doc(as("adminQ"), "academy_questions", "q1")));
  });
});
