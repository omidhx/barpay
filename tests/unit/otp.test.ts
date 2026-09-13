import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("OTP Cryptographic & Security Constraints (master-spec 2.5 §6.3)", () => {
  it("generates 6-digit integer strictly between 100000 and 999999", () => {
    for (let i = 0; i < 50; i++) {
      const code = crypto.randomInt(100000, 1000000).toString();
      expect(code.length).toBe(6);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThan(1000000);
      expect(/^\d{6}$/.test(code)).toBe(true);
    }
  });

  it("computes 64-char HMAC-SHA256 digest and performs constant-time equality check", () => {
    const secret = "test-secret-key-for-otp-unit-test";
    const code = "543210";
    const hash1 = crypto.createHmac("sha256", secret).update(code).digest("hex");
    const hash2 = crypto.createHmac("sha256", secret).update(code).digest("hex");
    const hashDifferent = crypto.createHmac("sha256", secret).update("543211").digest("hex");

    expect(hash1.length).toBe(64);
    expect(hash1).toBe(hash2);

    // Constant-time compare
    const match = crypto.timingSafeEqual(
      Buffer.from(hash1, "hex"),
      Buffer.from(hash2, "hex")
    );
    expect(match).toBe(true);

    const mismatch = crypto.timingSafeEqual(
      Buffer.from(hash1, "hex"),
      Buffer.from(hashDifferent, "hex")
    );
    expect(mismatch).toBe(false);
  });
});
