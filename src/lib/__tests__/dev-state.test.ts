import { afterEach, describe, expect, it, vi } from "vitest";
import { getDevState, getForcedError, getForcedState } from "@/lib/dev-state";

// vitest env is "node" (no jsdom), so stub a minimal window. The production
// guard is the load-bearing assertion — a prod bundle must never honour ?__state.
function setWindow(search: string) {
  (globalThis as Record<string, unknown>).window = {
    location: { search: search ? `?${search}` : "" },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>).window;
});

describe("getDevState", () => {
  it("returns the query value in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    setWindow("__state=pool-full");
    expect(getDevState("__state")).toBe("pool-full");
  });

  it("returns null in production even when the flag is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    setWindow("__state=pool-full");
    expect(getDevState("__state")).toBeNull();
  });

  it("returns null when there is no window (SSR)", () => {
    vi.stubEnv("NODE_ENV", "development");
    // no window set
    expect(getDevState("__state")).toBeNull();
  });

  it("returns null when the key is absent", () => {
    vi.stubEnv("NODE_ENV", "development");
    setWindow("__error=email_exists");
    expect(getDevState("__state")).toBeNull();
  });

  it("getForcedState / getForcedError read the conventional keys", () => {
    vi.stubEnv("NODE_ENV", "development");
    setWindow("__state=blocked&__error=credentials");
    expect(getForcedState()).toBe("blocked");
    expect(getForcedError()).toBe("credentials");
  });
});
