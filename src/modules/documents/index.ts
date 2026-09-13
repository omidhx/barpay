/**
 * Public interface for documents module.
 */
export type DocumentType =
  | "WAYBILL_PDF"
  | "PAYMENT_RECEIPT"
  | "DRIVER_COMMITMENT"
  | "SIGNATURE"
  | "OTHER";

export type MatchingStatus =
  | "AUTO_MATCHED"
  | "MANUALLY_ATTACHED"
  | "UNMATCHED"
  | "REPLACED";

export interface DocumentRecord {
  id: string;
  organizationId: string;
  waybillId?: string | null;
  documentType: DocumentType;
  storageKey: string;
  sha256Hash: string;
  matchingStatus: MatchingStatus;
}

// Module export boundary
export * from "./pdf-parser";
export * from "./matching-service";
