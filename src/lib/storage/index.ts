import { StorageProvider } from "./storage-provider";
import { LocalStorageProvider } from "./local-storage";

export * from "./storage-provider";
export * from "./local-storage";

let defaultProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!defaultProvider) {
    defaultProvider = new LocalStorageProvider();
  }
  return defaultProvider;
}

export function setStorageProvider(provider: StorageProvider): void {
  defaultProvider = provider;
}
