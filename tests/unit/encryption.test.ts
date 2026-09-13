import { describe, it, expect } from "vitest";
import { encryptCredentials, decryptCredentials } from "@/lib/crypto/encryption";

describe("AES-256-GCM Encryption & Decryption (master-spec §7.3 & payment-gateways.md)", () => {
  it("encrypts credentials and decrypts back to identical object", () => {
    const sensitiveData = {
      terminalId: "12345678",
      transactionKey: "SECRET_KEY_ABC_123",
      merchantId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const encrypted = encryptCredentials(sensitiveData);

    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();
    // Ciphertext must not contain plaintext values
    expect(encrypted.ciphertext).not.toContain("SECRET_KEY_ABC_123");

    const decrypted = decryptCredentials<typeof sensitiveData>(encrypted);
    expect(decrypted).toEqual(sensitiveData);
  });

  it("produces different ciphertext and IV for identical input data (CSPRNG IV)", () => {
    const data = { apiKey: "same-key-each-time" };
    const enc1 = encryptCredentials(data);
    const enc2 = encryptCredentials(data);

    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);

    expect(decryptCredentials(enc1)).toEqual(data);
    expect(decryptCredentials(enc2)).toEqual(data);
  });

  it("fails to decrypt if authTag or ciphertext is tampered with", () => {
    const data = { secret: "do-not-modify" };
    const enc = encryptCredentials(data);

    // Tamper with ciphertext
    const tampered = {
      ...enc,
      ciphertext: enc.ciphertext.slice(0, -2) + "ff",
    };

    expect(() => decryptCredentials(tampered)).toThrow();
  });
});
