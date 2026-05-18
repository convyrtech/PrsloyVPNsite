import { describe, expect, it } from "vitest";
import { isValidEmail, MAX_EMAIL_LENGTH } from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts a well-formed address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.example.co")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("spaces in@example.com")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
  });

  it("rejects an address longer than the max length", () => {
    const longLocal = "a".repeat(MAX_EMAIL_LENGTH);
    expect(isValidEmail(`${longLocal}@example.com`)).toBe(false);
  });
});
