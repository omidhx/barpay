import { GatewayProviderCode, PaymentProvider } from "./types";

export const gatewayAdapters: Partial<Record<GatewayProviderCode, PaymentProvider>> = {};

export function registerGatewayAdapter(adapter: PaymentProvider): void {
  gatewayAdapters[adapter.code] = adapter;
}

export function getGatewayAdapter(code: GatewayProviderCode): PaymentProvider {
  const adapter = gatewayAdapters[code];
  if (!adapter) {
    throw new Error(`GATEWAY_ADAPTER_NOT_FOUND: No adapter registered for code ${code}`);
  }
  return adapter;
}
