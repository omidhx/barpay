/**
 * Public interface for delivery module.
 * Central authority for canRelease and download authorizations.
 */
export interface ReleaseCheckResult {
  canRelease: boolean;
  unmetConditions: string[];
}

export * from "./release-service";
