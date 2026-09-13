/**
 * Public interface for commitments module.
 */
export interface CommitmentTemplateVariable {
  key: string;
  label: string;
  description?: string;
}

export type CommitmentEnforcementMode = "OFF" | "SHADOW" | "ENFORCED";

export * from "./commitment-service";
