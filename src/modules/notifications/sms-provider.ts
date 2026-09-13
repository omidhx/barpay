import { AppError } from "@/lib/errors/exceptions";

export interface SmsSendResult {
  messageId: string;
  accepted: boolean;
  provider: string;
}

export type SmsDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "UNKNOWN";

export interface SmsProvider {
  readonly name: string;
  send(mobile: string, text: string, messageKey: string): Promise<SmsSendResult>;
  checkDelivery(messageId: string): Promise<SmsDeliveryStatus>;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // default: 3
  windowMs?: number; // default: 60,000ms (1 minute)
  cooldownMs?: number; // default: 300,000ms (5 minutes)
  timeoutMs?: number; // default: 10,000ms (10 seconds)
}

export class CircuitBreaker {
  private failures: number[] = [];
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private lastStateChange: number = Date.now();

  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  public readonly timeoutMs: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.windowMs = options?.windowMs ?? 60_000;
    this.cooldownMs = options?.cooldownMs ?? 300_000;
    this.timeoutMs = options?.timeoutMs ?? 10_000;
  }

  public getState(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    const now = Date.now();
    if (this.state === "OPEN" && now - this.lastStateChange >= this.cooldownMs) {
      this.state = "HALF_OPEN";
      this.lastStateChange = now;
    }
    return this.state;
  }

  public recordSuccess(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.lastStateChange = Date.now();
  }

  public recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    // Keep failures within window
    this.failures = this.failures.filter((t) => now - t <= this.windowMs);

    if (this.failures.length >= this.failureThreshold) {
      this.state = "OPEN";
      this.lastStateChange = now;
    }
  }

  public isOpen(): boolean {
    return this.getState() === "OPEN";
  }
}

/**
 * In-memory Mock SMS Provider for local tests and development without external API credentials.
 */
export class MockSmsProvider implements SmsProvider {
  public readonly name: string;
  public sentMessages: Array<{ mobile: string; text: string; messageKey: string; messageId: string }> = [];
  public shouldFail: boolean = false;

  constructor(name: string = "MOCK_SMS") {
    this.name = name;
  }

  async send(mobile: string, text: string, messageKey: string): Promise<SmsSendResult> {
    if (this.shouldFail) {
      throw new AppError("SMS_PROVIDER_ERROR", `${this.name} connection failed`);
    }
    const messageId = `mock-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.sentMessages.push({ mobile, text, messageKey, messageId });
    return {
      messageId,
      accepted: true,
      provider: this.name,
    };
  }

  async checkDelivery(): Promise<SmsDeliveryStatus> {
    return "DELIVERED";
  }
}

/**
 * Faraz SMS adapter implementation (Edge / Node fetch compatible).
 */
export class FarazSmsProvider implements SmsProvider {
  public readonly name = "FARAZSMS";
  private apiKey?: string;
  private sender?: string;

  constructor(apiKey?: string, sender?: string) {
    this.apiKey = apiKey || process.env.FARAZSMS_API_KEY;
    this.sender = sender || process.env.FARAZSMS_SENDER;
  }

  async send(mobile: string, text: string, messageKey: string): Promise<SmsSendResult> {
    if (!this.apiKey) {
      throw new AppError("SMS_NOT_CONFIGURED", "اعتبارنامه سامانه فراز اس‌ام‌اس تنظیم نشده است.");
    }

    // Call Faraz SMS API with 10-second timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch("https://ippanel.com/services.jspd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "send",
          uname: this.apiKey,
          pass: "",
          message: text,
          from: this.sender || "3000",
          to: [mobile],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AppError("SMS_PROVIDER_HTTP_ERROR", `Faraz SMS returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as unknown;
      const resId = String(Array.isArray(data) ? data[0] : (data as { message_id?: string })?.message_id || messageKey);

      return {
        messageId: resId,
        accepted: true,
        provider: this.name,
      };
    } catch (err: unknown) {
      throw new AppError("SMS_SEND_FAILED", `خطا در ارسال پیامک از طریق فراز اس‌ام‌اس: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async checkDelivery(): Promise<SmsDeliveryStatus> {
    return "DELIVERED";
  }
}

/**
 * Meli Payamak adapter implementation (Secondary / Failover).
 */
export class MeliPayamakProvider implements SmsProvider {
  public readonly name = "MELIPAYAMAK";
  private apiKey?: string;
  private sender?: string;

  constructor(apiKey?: string, sender?: string) {
    this.apiKey = apiKey || process.env.MELLIPAYAMK_API_KEY;
    this.sender = sender || process.env.MELLIPAYAMK_SENDER;
  }

  async send(mobile: string, text: string, messageKey: string): Promise<SmsSendResult> {
    if (!this.apiKey) {
      throw new AppError("SMS_NOT_CONFIGURED", "اعتبارنامه سامانه ملی‌پیامک تنظیم نشده است.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.apiKey,
          password: "",
          text,
          to: mobile,
          from: this.sender || "5000",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AppError("SMS_PROVIDER_HTTP_ERROR", `Meli Payamak returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as { Value?: string; RetStatus?: number };
      return {
        messageId: data.Value || messageKey,
        accepted: true,
        provider: this.name,
      };
    } catch (err: unknown) {
      throw new AppError("SMS_SEND_FAILED", `خطا در ارسال پیامک از طریق ملی‌پیامک: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async checkDelivery(): Promise<SmsDeliveryStatus> {
    return "DELIVERED";
  }
}

/**
 * Failover SMS Provider with Circuit Breaker (sms-providers.md §رفتار ارسال)
 */
export class FailoverSmsProvider implements SmsProvider {
  public readonly name = "FAILOVER_SMS";
  public primary: SmsProvider;
  public secondary: SmsProvider;
  public circuitBreaker: CircuitBreaker;

  constructor(primary?: SmsProvider, secondary?: SmsProvider, circuitBreaker?: CircuitBreaker) {
    this.primary = primary || new FarazSmsProvider();
    this.secondary = secondary || new MeliPayamakProvider();
    this.circuitBreaker = circuitBreaker || new CircuitBreaker();
  }

  async send(mobile: string, text: string, messageKey: string): Promise<SmsSendResult> {
    // Check if primary circuit breaker is open
    if (this.circuitBreaker.isOpen()) {
      try {
        const res = await this.secondary.send(mobile, text, messageKey);
        return res;
      } catch (secErr) {
        throw new AppError(
          "ALL_SMS_PROVIDERS_DOWN",
          `هر دو سامانه پیامک اصلی و پشتیبان با خطا مواجه شدند: ${secErr instanceof Error ? secErr.message : String(secErr)}`
        );
      }
    }

    // Try primary
    try {
      const res = await this.primary.send(mobile, text, messageKey);
      this.circuitBreaker.recordSuccess();
      return res;
    } catch (primaryErr) {
      this.circuitBreaker.recordFailure();

      // Failover to secondary
      try {
        const secRes = await this.secondary.send(mobile, text, messageKey);
        return secRes;
      } catch (secondaryErr) {
        throw new AppError(
          "ALL_SMS_PROVIDERS_DOWN",
          `ارسال پیامک با شکست مواجه شد. سرویس اول (${this.primary.name}): ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)} | سرویس دوم (${this.secondary.name}): ${secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr)}`
        );
      }
    }
  }

  async checkDelivery(messageId: string): Promise<SmsDeliveryStatus> {
    try {
      return await this.primary.checkDelivery(messageId);
    } catch {
      return await this.secondary.checkDelivery(messageId);
    }
  }
}
