import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { getCapacity, incrementPayingCounter } from "@/lib/capacity";

const redis = installFakeRedis();

const SAVED_ENV = {
  PRICING_COUNTER_OFFSET: process.env.PRICING_COUNTER_OFFSET,
  PRICING_TARGET: process.env.PRICING_TARGET,
};

beforeEach(() => {
  redis.reset();
  delete process.env.PRICING_COUNTER_OFFSET;
  delete process.env.PRICING_TARGET;
});

afterEach(() => {
  process.env.PRICING_COUNTER_OFFSET = SAVED_ENV.PRICING_COUNTER_OFFSET;
  process.env.PRICING_TARGET = SAVED_ENV.PRICING_TARGET;
});

describe("getCapacity", () => {
  it("defaults to target=300, offset=47 when env unset", async () => {
    const cap = await getCapacity();
    expect(cap.paying).toBe(0);
    expect(cap.target).toBe(300);
    expect(cap.offset).toBe(47);
    expect(cap.display).toBe(47);
    expect(cap.remaining).toBe(253);
    expect(cap.full).toBe(false);
  });

  it("respects PRICING_COUNTER_OFFSET=0 (explicit zero, not fallback)", async () => {
    process.env.PRICING_COUNTER_OFFSET = "0";
    const cap = await getCapacity();
    expect(cap.offset).toBe(0);
    expect(cap.display).toBe(0);
  });

  it("respects PRICING_TARGET override", async () => {
    process.env.PRICING_TARGET = "100";
    const cap = await getCapacity();
    expect(cap.target).toBe(100);
    expect(cap.remaining).toBe(100 - 47); // default offset still applies
  });

  it("falls back gracefully when env contains garbage", async () => {
    process.env.PRICING_COUNTER_OFFSET = "not-a-number";
    process.env.PRICING_TARGET = "garbage";
    const cap = await getCapacity();
    expect(cap.offset).toBe(47);
    expect(cap.target).toBe(300);
  });

  it("display = paying + offset", async () => {
    await incrementPayingCounter();
    await incrementPayingCounter();
    await incrementPayingCounter();
    const cap = await getCapacity();
    expect(cap.paying).toBe(3);
    expect(cap.display).toBe(3 + 47);
    expect(cap.remaining).toBe(300 - 50);
  });

  it("marks full when display reaches target", async () => {
    process.env.PRICING_COUNTER_OFFSET = "0";
    process.env.PRICING_TARGET = "3";
    await incrementPayingCounter();
    await incrementPayingCounter();
    await incrementPayingCounter();
    const cap = await getCapacity();
    expect(cap.full).toBe(true);
    expect(cap.remaining).toBe(0);
  });

  it("remaining clamps at 0 when display exceeds target", async () => {
    process.env.PRICING_COUNTER_OFFSET = "0";
    process.env.PRICING_TARGET = "2";
    await incrementPayingCounter();
    await incrementPayingCounter();
    await incrementPayingCounter();
    const cap = await getCapacity();
    expect(cap.full).toBe(true);
    expect(cap.remaining).toBe(0);
  });
});

describe("incrementPayingCounter", () => {
  it("returns the new count after INCR", async () => {
    expect(await incrementPayingCounter()).toBe(1);
    expect(await incrementPayingCounter()).toBe(2);
    expect(await incrementPayingCounter()).toBe(3);
  });
});
