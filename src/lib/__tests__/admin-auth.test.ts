import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";

const SECRET = "correct-horse-battery-staple-admin-secret";

function request(authorization?: string): Request {
  return new Request("http://test.local/api/admin/users", {
    headers: authorization ? { authorization } : {},
  });
}

describe("admin-auth", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.ADMIN_SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = original;
  });

  describe("isAdminConfigured", () => {
    it("is false when ADMIN_SECRET is unset or blank", () => {
      delete process.env.ADMIN_SECRET;
      expect(isAdminConfigured()).toBe(false);
      process.env.ADMIN_SECRET = "   ";
      expect(isAdminConfigured()).toBe(false);
    });

    it("is true when ADMIN_SECRET is set", () => {
      process.env.ADMIN_SECRET = SECRET;
      expect(isAdminConfigured()).toBe(true);
    });
  });

  describe("isAdminAuthorized", () => {
    it("rejects every request when ADMIN_SECRET is unset", () => {
      delete process.env.ADMIN_SECRET;
      expect(isAdminAuthorized(request(`Bearer ${SECRET}`))).toBe(false);
    });

    it("accepts a correct Bearer token", () => {
      process.env.ADMIN_SECRET = SECRET;
      expect(isAdminAuthorized(request(`Bearer ${SECRET}`))).toBe(true);
    });

    it("rejects a wrong token, a missing Bearer prefix and a missing header", () => {
      process.env.ADMIN_SECRET = SECRET;
      expect(isAdminAuthorized(request("Bearer wrong-secret"))).toBe(false);
      expect(isAdminAuthorized(request(SECRET))).toBe(false);
      expect(isAdminAuthorized(request())).toBe(false);
    });
  });
});
