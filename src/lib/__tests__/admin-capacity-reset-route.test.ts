import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { getCapacity, incrementPayingCounter } from "@/lib/capacity";

const redis = installFakeRedis();
const SECRET = "admin-capreset-secret-1234567890";

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
});

async function importRoute() {
  return await import("@/app/api/admin/capacity-reset/route");
}

function req(opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true;
  return new Request("http://localhost/api/admin/capacity-reset", {
    method: "POST",
    headers: auth ? { authorization: `Bearer ${SECRET}` } : {},
  });
}

describe("POST /api/admin/capacity-reset", () => {
  it("returns 404 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const { POST } = await importRoute();
    expect((await POST(req({ auth: false }))).status).toBe(404);
  });

  it("returns 401 without a Bearer token", async () => {
    const { POST } = await importRoute();
    expect((await POST(req({ auth: false }))).status).toBe(401);
  });

  it("resets the paying counter to 0", async () => {
    await incrementPayingCounter();
    await incrementPayingCounter();
    expect((await getCapacity()).paying).toBe(2);

    const { POST } = await importRoute();
    const res = await POST(req());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.capacity.paying).toBe(0);
    expect((await getCapacity()).paying).toBe(0);
  });
});
