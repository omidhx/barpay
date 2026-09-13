/**
 * Public interface for delivery module.
 * Central authority for canRelease and download authorizations.
 */
export interface ReleaseCheckResult {
  canRelease: boolean;
  unmetConditions: string[];
}

// Module export boundary
