import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetBeaconDedupeForTest, sendBeacon } from "@/lib/beacon";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetBeaconDedupeForTest();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe("sendBeacon", () => {
  it("posts a pageview to /api/track with the path", () => {
    sendBeacon("/ru", "");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/track");
    expect((init as RequestInit).method).toBe("POST");
    expect(lastBody()).toEqual({ name: "pageview", path: "/ru" });
  });

  it("includes utmSource when present in the query string", () => {
    sendBeacon("/ru", "?utm_source=telegram&utm_medium=ad");
    expect(lastBody()).toEqual({
      name: "pageview",
      path: "/ru",
      utmSource: "telegram",
    });
  });

  it("dedupes a repeated call with the same pathname+search (StrictMode case)", () => {
    sendBeacon("/ru", "");
    sendBeacon("/ru", "");
    sendBeacon("/ru", "");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires again when the pathname changes", () => {
    sendBeacon("/ru", "");
    sendBeacon("/ru/pricing", "");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fires again when the search string changes (different utm)", () => {
    sendBeacon("/ru", "?utm_source=tg");
    sendBeacon("/ru", "?utm_source=instagram");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fires again when navigating back to a previously seen path", () => {
    sendBeacon("/ru", "");
    sendBeacon("/ru/pricing", "");
    sendBeacon("/ru", "");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not throw when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(() => sendBeacon("/ru", "")).not.toThrow();
    // Let the rejected promise settle so we don't leak an unhandled rejection.
    await new Promise((r) => setTimeout(r, 0));
  });

  it("uses keepalive so the request survives navigation away", () => {
    sendBeacon("/ru", "");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.keepalive).toBe(true);
  });

  it("omits utmSource for an empty utm_source param", () => {
    sendBeacon("/ru", "?utm_source=");
    expect(lastBody()).toEqual({ name: "pageview", path: "/ru" });
  });
});
