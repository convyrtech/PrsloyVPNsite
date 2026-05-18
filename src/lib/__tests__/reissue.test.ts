import { beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  buildReissueRequestEmail,
  createReissueRequest,
  listReissueRequests,
  markReissueHandled,
  ReissueError,
} from "@/lib/reissue";

const redis = installFakeRedis();

beforeEach(() => redis.reset());

const OPEN_INDEX = "access:reissue:index";
const HANDLED_LIST = "access:reissue:handled";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    email: "user@example.com",
    vpnSlug: "slug1",
    subscriptionUrl: "vless://token@host:443",
    ...overrides,
  };
}

describe("createReissueRequest", () => {
  it("stores an open request with a hashed, not raw, subscription URL", async () => {
    const rec = await createReissueRequest(baseInput());

    expect(rec.status).toBe("open");
    expect(rec.subscriptionUrlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rec)).not.toContain("vless://");
    expect(redis.store.sets.get(OPEN_INDEX)?.has(rec.requestId)).toBe(true);
  });

  it("trims a reason and nulls a blank one", async () => {
    const withReason = await createReissueRequest(baseInput({ reason: "  please  " }));
    const blank = await createReissueRequest(baseInput({ reason: "   " }));

    expect(withReason.reason).toBe("please");
    expect(blank.reason).toBeNull();
  });
});

describe("markReissueHandled", () => {
  it("moves an open request to the handled list and out of the open index", async () => {
    const rec = await createReissueRequest(baseInput());

    const updated = await markReissueHandled(rec.requestId);

    expect(updated.status).toBe("handled");
    expect(updated.handledAt).toBeTruthy();
    expect(redis.store.sets.get(OPEN_INDEX)?.has(rec.requestId)).toBe(false);
    expect(redis.store.lists.get(HANDLED_LIST)).toContain(rec.requestId);
  });

  it("is idempotent on an already-handled request", async () => {
    const rec = await createReissueRequest(baseInput());
    const first = await markReissueHandled(rec.requestId);
    const second = await markReissueHandled(rec.requestId);

    expect(second.handledAt).toBe(first.handledAt);
  });

  it("throws ReissueError(not_found) for an unknown id", async () => {
    await expect(markReissueHandled("missing")).rejects.toBeInstanceOf(ReissueError);
  });
});

describe("listReissueRequests", () => {
  it("returns open and handled requests split by status", async () => {
    const open = await createReissueRequest(baseInput({ userId: "open" }));
    const done = await createReissueRequest(baseInput({ userId: "done" }));
    await markReissueHandled(done.requestId);

    const all = await listReissueRequests();
    const byId = new Map(all.map((r) => [r.requestId, r]));

    expect(byId.get(open.requestId)?.status).toBe("open");
    expect(byId.get(done.requestId)?.status).toBe("handled");
  });

  it("lazily migrates a handled request still sitting in the open index", async () => {
    const rec = await createReissueRequest(baseInput());
    // simulate the pre-split state: status flipped, never moved indexes
    redis.store.strings.set(
      `access:reissue:${rec.requestId}`,
      JSON.stringify({ ...rec, status: "handled", handledAt: new Date().toISOString() })
    );

    await listReissueRequests();

    expect(redis.store.sets.get(OPEN_INDEX)?.has(rec.requestId)).toBe(false);
    expect(redis.store.lists.get(HANDLED_LIST)).toContain(rec.requestId);
  });

  it("skips a corrupt request record without throwing", async () => {
    const ok = await createReissueRequest(baseInput());
    redis.store.sets.get(OPEN_INDEX)?.add("corrupt");
    redis.store.strings.set("access:reissue:corrupt", "{not json");

    const all = await listReissueRequests();

    expect(all.map((r) => r.requestId)).toEqual([ok.requestId]);
  });
});

describe("buildReissueRequestEmail", () => {
  it("carries the hash but never the raw URL, and escapes HTML in the reason", async () => {
    const rec = await createReissueRequest(baseInput({ reason: "<script>x</script>" }));

    const email = buildReissueRequestEmail(rec);

    expect(email.text).not.toContain("vless://");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
