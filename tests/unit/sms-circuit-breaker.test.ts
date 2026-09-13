import { describe, it, expect } from "vitest";
import {
  CircuitBreaker,
  FailoverSmsProvider,
  MockSmsProvider,
} from "@/modules/notifications/sms-provider";

describe("SMS Provider & Circuit Breaker (sms-providers.md §رفتار ارسال)", () => {
  it("circuit breaker starts CLOSED and transitions to OPEN after 3 failures", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, cooldownMs: 10_000 });
    expect(cb.getState()).toBe("CLOSED");

    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");

    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");

    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.isOpen()).toBe(true);
  });

  it("failover switches to secondary provider when primary fails", async () => {
    const primary = new MockSmsProvider("FARAZ_MOCK");
    primary.shouldFail = true; // Primary fails

    const secondary = new MockSmsProvider("MELI_MOCK");

    const failover = new FailoverSmsProvider(primary, secondary);
    const res = await failover.send("09121234567", "کد ورود: ۱۲۳۴۵۶", "msg-1");

    expect(res.provider).toBe("MELI_MOCK");
    expect(res.accepted).toBe(true);
    expect(secondary.sentMessages.length).toBe(1);
  });

  it("circuit breaker bypasses primary directly to secondary when OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100_000 });
    cb.recordFailure();
    cb.recordFailure(); // Now OPEN

    const primary = new MockSmsProvider("PRIMARY");
    const secondary = new MockSmsProvider("SECONDARY");

    const failover = new FailoverSmsProvider(primary, secondary, cb);
    const res = await failover.send("09129876543", "تست", "msg-2");

    expect(res.provider).toBe("SECONDARY");
    expect(primary.sentMessages.length).toBe(0); // Primary wasn't even called
    expect(secondary.sentMessages.length).toBe(1);
  });
});
