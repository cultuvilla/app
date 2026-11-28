// municipalityService against the real Firestore emulator: village search,
// the lookups behind the village screens, and the barrio/place lifecycle.
//
// The module's risks are the ones a fake store cannot see — a field name the
// query filters on that the builders never write, and a bare-`doc()` update
// that leaves a document the strict read converter then rejects. So every case
// seeds through the real builders and reads back through the real converters.
import { afterEach, describe, expect, it, vi } from "vitest";
import { doc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { useRulesTestEnv } from "../helpers/rulesTestEnv";
import { asAdmin, asAnon, asUser, firestoreOf, seed } from "../helpers/roles";
import {
  makeMunicipality,
  makeActiveCommunity,
} from "../factories/villageFactory";
import {
  municipalityBarrioDoc,
  municipalityDoc,
  municipalityPlaceDoc,
} from "../../src/firebase/refs/client";
import {
  buildBarrioData,
  buildMunicipalityData,
  buildPlaceData,
  buildVillageCommunity,
  type MunicipalityData,
} from "../../src/models/municipality/MunicipalityDataModel";
import {
  createBarrio,
  createPlace,
  deleteBarrio,
  deletePlace,
  getActiveCommunities,
  getBarrio,
  getBarrios,
  getMunicipality,
  getPlace,
  getPlaces,
  getVillagesWhereAmbassador,
  listMunicipalitiesPage,
  newBarrioId,
  newPlaceId,
  searchMunicipalities,
  updateBarrio,
  updateMunicipality,
  updatePlace,
  watchBarrio,
  watchBarrios,
  watchMunicipality,
  watchPlace,
  watchPlaces,
} from "../../src/services/municipalityService";
import * as firebaseModule from "../../src/firebase";

const getEnv = useRulesTestEnv();

afterEach(() => {
  vi.restoreAllMocks();
});

const VILLAGE = "m-village";
const MEMBER = "vecina";

function useDb(db: Firestore): void {
  vi.spyOn(firebaseModule, "getDb").mockReturnValue(db);
}

async function seedMunicipality(
  id: string,
  data: MunicipalityData,
): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    await setDoc(municipalityDoc(firestoreOf(ctx), id), data);
  });
}

/** Seed by name, through the real builder, so `nameLower` and `searchPrefixes`
 *  are what production writes for that name — the factory's `name` override
 *  would leave them built from its placeholder. */
async function seedMunicipalities(
  rows: Record<string, { name: string; nameAliases?: string[] }>,
): Promise<void> {
  for (const [id, { name, nameAliases }] of Object.entries(rows)) {
    await seedMunicipality(
      id,
      buildMunicipalityData({
        name,
        nameAliases,
        province: "Segovia",
        comunidadAutonoma: "Castilla y León",
        codigoINE: id,
        slug: id,
      }),
    );
  }
}

/** A village with `MEMBER` as an ordinary member — the actor of user-made content. */
async function seedVillageWithMember(): Promise<void> {
  await seedMunicipality(VILLAGE, makeActiveCommunity({ name: "Matabuena" }));
  await seed(getEnv(), async (ctx) => {
    await setDoc(
      doc(firestoreOf(ctx), `municipalities/${VILLAGE}/members/${MEMBER}`),
      {
        userId: MEMBER,
        role: "user",
        joinedAt: new Date(),
        profileAnswers: {},
        profileCompletedAt: null,
      },
    );
  });
}

/** Moderation hides content through a function; here the seeder plays it. */
async function hide(path: string): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    await updateDoc(doc(firestoreOf(ctx), path), {
      status: "hidden",
      hiddenBy: "moderator",
      hiddenAt: new Date(),
      hiddenReason: "spam",
    });
  });
}

function emissions<T>(): {
  all: T[];
  push: (value: T) => void;
  nth: (n: number) => Promise<T>;
} {
  const all: T[] = [];
  return {
    all,
    push: (value) => all.push(value),
    nth: (n) =>
      vi.waitFor(
        () => {
          if (all.length < n)
            throw new Error(`waiting for emission ${String(n)}`);
          return all[n - 1];
        },
        { timeout: 5000, interval: 25 },
      ),
  };
}

function failOnError(error: Error): never {
  throw error;
}

describe("searchMunicipalities", () => {
  async function seedNames(): Promise<void> {
    await seedMunicipalities({
      vm: { name: "Villanueva de las Manzanas" },
      av: { name: "Ávila" },
      ss: { name: "San Sebastián", nameAliases: ["Donostia"] },
      vs: { name: "Villasexmir" },
      mb: { name: "Matabuena" },
    });
  }

  it("finds a multi-word name by its distinctive word", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    expect((await searchMunicipalities("manzanas")).map((m) => m.id)).toEqual([
      "vm",
    ]);
  });

  it("ignores accents and case in either direction", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    expect((await searchMunicipalities("AVILA")).map((m) => m.id)).toEqual([
      "av",
    ]);
    expect((await searchMunicipalities("sebastian")).map((m) => m.id)).toEqual([
      "ss",
    ]);
  });

  it("matches a co-official alias", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    expect((await searchMunicipalities("donos")).map((m) => m.id)).toEqual([
      "ss",
    ]);
  });

  it("orders matches by name and respects the limit", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    expect((await searchMunicipalities("villa")).map((m) => m.name)).toEqual([
      "Villanueva de las Manzanas",
      "Villasexmir",
    ]);
    expect((await searchMunicipalities("villa", 1)).map((m) => m.id)).toEqual([
      "vm",
    ]);
  });

  it("returns the first ones alphabetically for an empty or blank query", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    const expected = ["Ávila", "Matabuena"];
    expect((await searchMunicipalities("", 2)).map((m) => m.name)).toEqual(
      expected,
    );
    expect((await searchMunicipalities("   ", 2)).map((m) => m.name)).toEqual(
      expected,
    );
  });

  it("returns nothing for a word in no name", async () => {
    await seedNames();
    useDb(asAnon(getEnv()));
    expect(await searchMunicipalities("zaragoza")).toEqual([]);
  });

  it("pages the same search across a cursor, as the discovery screen does", async () => {
    await seedMunicipalities({
      v1: { name: "Villalba" },
      v2: { name: "Villamayor" },
      v3: { name: "Villanueva" },
      x: { name: "Matabuena" },
    });
    useDb(asAnon(getEnv()));

    const first = await listMunicipalitiesPage({ search: "villa", limit: 2 });
    expect(first.items.map((m) => m.id)).toEqual(["v1", "v2"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await listMunicipalitiesPage({
      search: "villa",
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((m) => m.id)).toEqual(["v3"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("municipality lookups", () => {
  it("getActiveCommunities returns only active villages, by name", async () => {
    await seedMunicipality("b", makeActiveCommunity({ name: "Brieva" }));
    await seedMunicipality("a", makeActiveCommunity({ name: "Arcones" }));
    await seedMunicipality(
      "dormant",
      makeMunicipality({ name: "Aldealengua" }),
    );
    useDb(asAnon(getEnv()));

    expect((await getActiveCommunities()).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("getVillagesWhereAmbassador returns the villages whose Embajador is the user", async () => {
    const withOrganizer = (
      organizerId: string | null,
    ): Partial<MunicipalityData> => ({
      community: buildVillageCommunity({ description: "Pueblo", organizerId }),
      communityActive: true,
    });
    await seedMunicipality("mine", makeMunicipality(withOrganizer("ana")));
    await seedMunicipality("theirs", makeMunicipality(withOrganizer("bea")));
    await seedMunicipality("wiki", makeMunicipality(withOrganizer(null)));
    useDb(asAnon(getEnv()));

    expect((await getVillagesWhereAmbassador("ana")).map((m) => m.id)).toEqual([
      "mine",
    ]);
    expect(await getVillagesWhereAmbassador("nobody")).toEqual([]);
  });

  it("watchMunicipality delivers the doc, then an updateMunicipality patch that still parses", async () => {
    await seedMunicipality(VILLAGE, makeActiveCommunity({ name: "Matabuena" }));
    useDb(await asAdmin(getEnv(), "sadmin"));

    const seen = emissions<(MunicipalityData & { id: string }) | null>();
    const unwatch = watchMunicipality(VILLAGE, seen.push, failOnError);
    try {
      expect((await seen.nth(1))?.locationLabel).toBeNull();

      await updateMunicipality(VILLAGE, {
        locationLabel: "Sierra de Ayllón",
        mapZoom: 14,
        coordinates: { lat: 41.1, lng: -3.76 },
      });

      const patched = await seen.nth(2);
      expect(patched).toMatchObject({
        id: VILLAGE,
        name: "Matabuena",
        locationLabel: "Sierra de Ayllón",
        mapZoom: 14,
        coordinates: { lat: 41.1, lng: -3.76 },
      });
      expect(await getMunicipality(VILLAGE)).toMatchObject({
        locationLabel: "Sierra de Ayllón",
      });
    } finally {
      unwatch();
    }
  });

  it("watchMunicipality emits null for a municipality that does not exist", async () => {
    useDb(asAnon(getEnv()));
    const seen = emissions<(MunicipalityData & { id: string }) | null>();
    const unwatch = watchMunicipality("nowhere", seen.push, failOnError);
    try {
      expect(await seen.nth(1)).toBeNull();
    } finally {
      unwatch();
    }
  });
});

describe("barrios", () => {
  it("a member creates one, and every read sees it", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));

    const id = newBarrioId(VILLAGE);
    expect(
      await createBarrio(
        VILLAGE,
        { name: "El Arrabal", municipalityId: VILLAGE, proposedBy: MEMBER },
        id,
      ),
    ).toBe(id);

    expect(await getBarrio(VILLAGE, id)).toMatchObject({
      id,
      name: "El Arrabal",
      municipalityId: VILLAGE,
      kind: "barrio",
      source: "user",
      status: "active",
      proposedBy: MEMBER,
    });
    expect((await getBarrios(VILLAGE)).map((b) => b.id)).toEqual([id]);
  });

  it("lists every kind by name and drops one moderation hid", async () => {
    await seedVillageWithMember();
    // A pedanía is seeded by startVillage, never created by a user.
    await seed(getEnv(), async (ctx) => {
      await setDoc(
        municipalityBarrioDoc(firestoreOf(ctx), VILLAGE, "pedania"),
        buildBarrioData({
          name: "Cardeñosa",
          municipalityId: VILLAGE,
          kind: "pedania",
          source: "osm",
        }),
      );
    });
    useDb(asUser(getEnv(), MEMBER));
    const plaza = await createBarrio(VILLAGE, {
      name: "La Plaza",
      municipalityId: VILLAGE,
      proposedBy: MEMBER,
    });
    const arrabal = await createBarrio(VILLAGE, {
      name: "El Arrabal",
      municipalityId: VILLAGE,
      proposedBy: MEMBER,
    });

    const seen = emissions<{ id: string; kind: string }[]>();
    const unwatch = watchBarrios(VILLAGE, seen.push, failOnError);
    try {
      // The client's own writes are in its local cache, so a first emission can
      // come from there before the server's answer adds the seeded pedanía.
      await vi.waitFor(
        () => {
          if ((seen.all.at(-1) ?? []).length !== 3)
            throw new Error("waiting for all three barrios");
        },
        { timeout: 5000, interval: 25 },
      );
      expect((seen.all.at(-1) ?? []).map((b) => [b.id, b.kind])).toEqual([
        ["pedania", "pedania"],
        [arrabal, "barrio"],
        [plaza, "barrio"],
      ]);

      await hide(`municipalities/${VILLAGE}/barrios/${plaza}`);

      await vi.waitFor(
        () => {
          if ((seen.all.at(-1) ?? []).length !== 2)
            throw new Error("waiting for the hidden barrio to drop");
        },
        { timeout: 5000, interval: 25 },
      );
      expect((seen.all.at(-1) ?? []).map((b) => b.id)).toEqual([
        "pedania",
        arrabal,
      ]);
    } finally {
      unwatch();
    }
    expect((await getBarrios(VILLAGE)).map((b) => b.id)).toEqual([
      "pedania",
      arrabal,
    ]);
  });

  it("a partial updateBarrio leaves a doc the read converter still parses", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));
    const id = await createBarrio(VILLAGE, {
      name: "El Arrabal",
      municipalityId: VILLAGE,
      proposedBy: MEMBER,
    });

    await updateBarrio(VILLAGE, id, {
      name: "Barrio del Arrabal",
      images: ["https://example.test/a.jpg"],
    });

    expect(await getBarrio(VILLAGE, id)).toMatchObject({
      name: "Barrio del Arrabal",
      images: ["https://example.test/a.jpg"],
      kind: "barrio",
      status: "active",
    });
  });

  it("watchBarrio follows the doc and emits null once deleteBarrio removes it", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));
    const id = await createBarrio(VILLAGE, {
      name: "El Arrabal",
      municipalityId: VILLAGE,
      proposedBy: MEMBER,
    });

    const seen = emissions<{ name: string } | null>();
    const unwatch = watchBarrio(VILLAGE, id, seen.push, failOnError);
    try {
      expect((await seen.nth(1))?.name).toBe("El Arrabal");
      await deleteBarrio(VILLAGE, id);
      await vi.waitFor(
        () => {
          if (seen.all.at(-1) !== null)
            throw new Error("waiting for the deletion");
        },
        { timeout: 5000, interval: 25 },
      );
    } finally {
      unwatch();
    }
    expect(await getBarrio(VILLAGE, id)).toBeNull();
    expect(await getBarrios(VILLAGE)).toEqual([]);
  });
});

describe("places", () => {
  it("a member creates one, and every read sees it", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));

    const id = newPlaceId(VILLAGE);
    expect(
      await createPlace(
        VILLAGE,
        {
          name: "Cementerio",
          kind: "cemetery",
          municipalityId: VILLAGE,
          proposedBy: MEMBER,
        },
        id,
      ),
    ).toBe(id);

    expect(await getPlace(VILLAGE, id)).toMatchObject({
      id,
      name: "Cementerio",
      kind: "cemetery",
      municipalityId: VILLAGE,
      status: "active",
      proposedBy: MEMBER,
    });
    expect((await getPlaces(VILLAGE)).map((p) => p.id)).toEqual([id]);
  });

  it("lists by name, filters by kind, and drops one moderation hid", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));
    const add = (name: string, kind: "cemetery" | "church" | "hermitage") =>
      createPlace(VILLAGE, {
        name,
        kind,
        municipalityId: VILLAGE,
        proposedBy: MEMBER,
      });
    const ermita = await add("Ermita de San Roque", "hermitage");
    const iglesia = await add("Iglesia de San Pedro", "church");
    const cementerio = await add("Cementerio", "cemetery");

    expect((await getPlaces(VILLAGE, "church")).map((p) => p.id)).toEqual([
      iglesia,
    ]);

    const seen = emissions<{ id: string }[]>();
    const unwatch = watchPlaces(VILLAGE, seen.push, failOnError);
    try {
      expect((await seen.nth(1)).map((p) => p.id)).toEqual([
        cementerio,
        ermita,
        iglesia,
      ]);

      await hide(`municipalities/${VILLAGE}/places/${ermita}`);

      await vi.waitFor(
        () => {
          if ((seen.all.at(-1) ?? []).length !== 2)
            throw new Error("waiting for the hidden place to drop");
        },
        { timeout: 5000, interval: 25 },
      );
      expect((seen.all.at(-1) ?? []).map((p) => p.id)).toEqual([
        cementerio,
        iglesia,
      ]);
    } finally {
      unwatch();
    }
    expect(await getPlaces(VILLAGE, "hermitage")).toEqual([]);
  });

  it("a partial updatePlace leaves a doc the read converter still parses", async () => {
    await seedVillageWithMember();
    useDb(asUser(getEnv(), MEMBER));
    const id = await createPlace(VILLAGE, {
      name: "Iglesia",
      kind: "church",
      municipalityId: VILLAGE,
      proposedBy: MEMBER,
    });

    await updatePlace(VILLAGE, id, {
      description: "Románica, siglo XII",
      coordinates: { lat: 41.1, lng: -3.76 },
      locationLabel: "Plaza Mayor",
    });

    expect(await getPlace(VILLAGE, id)).toMatchObject({
      name: "Iglesia",
      kind: "church",
      description: "Románica, siglo XII",
      coordinates: { lat: 41.1, lng: -3.76 },
      locationLabel: "Plaza Mayor",
      status: "active",
    });
  });

  it("watchPlace follows the doc and emits null once deletePlace removes it", async () => {
    await seedVillageWithMember();
    await seed(getEnv(), async (ctx) => {
      await setDoc(
        municipalityPlaceDoc(firestoreOf(ctx), VILLAGE, "plaza"),
        buildPlaceData({
          name: "Plaza Mayor",
          kind: "plaza",
          municipalityId: VILLAGE,
          proposedBy: MEMBER,
        }),
      );
    });
    useDb(asUser(getEnv(), MEMBER));

    const seen = emissions<{ name: string } | null>();
    const unwatch = watchPlace(VILLAGE, "plaza", seen.push, failOnError);
    try {
      expect((await seen.nth(1))?.name).toBe("Plaza Mayor");
      await updatePlace(VILLAGE, "plaza", { name: "Plaza de la Villa" });
      await vi.waitFor(
        () => {
          if (seen.all.at(-1)?.name !== "Plaza de la Villa")
            throw new Error("waiting for the rename");
        },
        { timeout: 5000, interval: 25 },
      );
      await deletePlace(VILLAGE, "plaza");
      await vi.waitFor(
        () => {
          if (seen.all.at(-1) !== null)
            throw new Error("waiting for the deletion");
        },
        { timeout: 5000, interval: 25 },
      );
    } finally {
      unwatch();
    }
    expect(await getPlace(VILLAGE, "plaza")).toBeNull();
  });
});
