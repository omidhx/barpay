/**
 * Unified PaymentProvider interface and adapter registry.
 * Follows payment-gateways.md and master-spec Appendix C.
 */

export * from "./types";
export * from "./registry";

// Auto-register all official adapters
import "./zarinpal";
import "./zibal";
import "./sep";
import "./bpm";
import "./pasargad";
import "./sadad";
