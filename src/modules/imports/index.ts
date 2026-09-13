/**
 * Public interface for imports module.
 */
export type ImportBatchStatus =
  | "PENDING"
  | "PROCESSING"
  | "VALIDATED"
  | "COMMITTING"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";

export interface ImportBatchSummary {
  id: string;
  organizationId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  status: ImportBatchStatus;
}

// Module export boundary
export * from "./schema";
export * from "./excel-parser";
export * from "./import-service";
