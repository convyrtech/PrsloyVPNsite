import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeStorage = Storage & { __throwOnWrite?: boolean };

function makeFakeStorage(throwOnWrite = false): FakeStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwOnWrite) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    __throwOnWrite: throwOnWrite,
  } as FakeStorage;
}

function stubWindow(opts: {
  search?: string;
  storage?: FakeStorage;
  noStorage?: boolean;
}) {
  const storage = opts.storage ?? makeFakeStorage();
  const win: {
    location: { search: string };
    sessionStorage?: Storage;
  } = {
    location: { search: opts.search ?? "" },
  };
  if (!opts.noStorage) win.sessionStorage = storage;
  vi.stubGlobal("window", win);
  return { storage };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importLib() {
  return await import("@/lib/client-utm");
}

describe("captureUtmFromUrl", () => {
  it("stores the utm_source from the URL into sessionStorage", async () => {
    const { storage } = stubWindow({ search: "?utm_source=telegram" });
    const { captureUtmFromUrl } = await importLib();

    const captured = captureUtmFromUrl();

    expect(captured).toBe("telegram");
    expect(storage.getItem("prsloy_utm_source")).toBe("telegram");
  });

  it("trims and length-caps the source", async () => {
    const long = "a".repeat(200);
    const { storage } = stubWindow({ search: `?utm_source=${long}` });
    const { captureUtmFromUrl } = await importLib();

    const captured = captureUtmFromUrl();

    expect(captured).toHaveLength(80);
    expect(storage.getItem("prsloy_utm_source")).toHaveLength(80);
  });

  it("returns undefined and does not store when utm_source is absent", async () => {
    const { storage } = stubWindow({ search: "?other=x" });
    const { captureUtmFromUrl } = await importLib();

    expect(captureUtmFromUrl()).toBeUndefined();
    expect(storage.getItem("prsloy_utm_source")).toBeNull();
  });

  it("returns undefined for empty utm_source", async () => {
    const { storage } = stubWindow({ search: "?utm_source=" });
    const { captureUtmFromUrl } = await importLib();

    expect(captureUtmFromUrl()).toBeUndefined();
    expect(storage.getItem("prsloy_utm_source")).toBeNull();
  });

  it("does not overwrite stored value when later URL has no utm_source", async () => {
    const storage = makeFakeStorage();
    stubWindow({ search: "?utm_source=telegram", storage });
    const lib = await importLib();
    lib.captureUtmFromUrl();
    expect(storage.getItem("prsloy_utm_source")).toBe("telegram");

    vi.unstubAllGlobals();
    stubWindow({ search: "", storage });
    const lib2 = await importLib();
    lib2.captureUtmFromUrl();

    expect(storage.getItem("prsloy_utm_source")).toBe("telegram");
  });

  it("returns the value even when sessionStorage write throws", async () => {
    const storage = makeFakeStorage(true);
    stubWindow({ search: "?utm_source=telegram", storage });
    const { captureUtmFromUrl } = await importLib();

    expect(captureUtmFromUrl()).toBe("telegram");
    expect(storage.getItem("prsloy_utm_source")).toBeNull();
  });
});

describe("readUtmSource", () => {
  it("prefers the stored value over the URL", async () => {
    const storage = makeFakeStorage();
    storage.setItem("prsloy_utm_source", "telegram");
    stubWindow({ search: "?utm_source=instagram", storage });
    const { readUtmSource } = await importLib();

    expect(readUtmSource()).toBe("telegram");
  });

  it("falls back to URL when sessionStorage is empty", async () => {
    stubWindow({ search: "?utm_source=instagram" });
    const { readUtmSource } = await importLib();

    expect(readUtmSource()).toBe("instagram");
  });

  it("returns undefined when both are empty", async () => {
    stubWindow({ search: "" });
    const { readUtmSource } = await importLib();

    expect(readUtmSource()).toBeUndefined();
  });

  it("trims and caps the URL fallback", async () => {
    const long = "z".repeat(200);
    stubWindow({ search: `?utm_source=${long}` });
    const { readUtmSource } = await importLib();

    const value = readUtmSource();
    expect(value).toBeDefined();
    expect(value!.length).toBe(80);
  });
});
