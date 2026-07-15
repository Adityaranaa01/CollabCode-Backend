import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword, sha256, safeCompare } from "../../src/utils/hash.js";

describe("hashPassword + comparePassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const password = "MySecureP@ssword123";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format

    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    const isValid = await comparePassword("wrong-password", hash);
    expect(isValid).toBe(false);
  });

  it("produces different hashes for the same password (unique salts)", async () => {
    const password = "SamePassword";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2); // Different salts → different hashes
  });
});

describe("sha256", () => {
  it("produces a consistent 64-character hex hash", () => {
    const hash = sha256("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for the same input (deterministic)", () => {
    expect(sha256("test-input")).toBe(sha256("test-input"));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("input-a")).not.toBe(sha256("input-b"));
  });
});

describe("safeCompare", () => {
  it("returns true for identical hex strings", () => {
    const hash = sha256("test");
    expect(safeCompare(hash, hash)).toBe(true);
  });

  it("returns false for different hex strings of same length", () => {
    const hashA = sha256("input-a");
    const hashB = sha256("input-b");
    expect(safeCompare(hashA, hashB)).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeCompare("abcd", "abcdef")).toBe(false);
  });
});
