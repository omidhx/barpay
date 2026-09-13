import { describe, it, expect } from "vitest";
import { evaluateReleaseConditions } from "@/modules/delivery/release-service";

describe("Document Release Pure Condition Evaluation (canRelease) — state-transitions.md §5 & invariants.md I-1, I-2", () => {
  it("grants release when all conditions are satisfied", () => {
    const result = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "AUTHORIZED",
      hasActiveSession: true,
    });

    expect(result.canRelease).toBe(true);
    expect(result.unmetConditions).toEqual([]);
  });

  it("permits release when payment or commitment are NOT_REQUIRED", () => {
    const result = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "NOT_REQUIRED",
      commitmentStatus: "NOT_REQUIRED",
      releaseStatus: "AUTHORIZED",
      hasActiveSession: true,
    });

    expect(result.canRelease).toBe(true);
    expect(result.unmetConditions).toEqual([]);
  });

  it("permits re-download when releaseStatus is already RELEASED", () => {
    const result = evaluateReleaseConditions({
      shipmentStatus: "COMPLETED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "RELEASED",
      hasActiveSession: true,
    });

    expect(result.canRelease).toBe(true);
    expect(result.unmetConditions).toEqual([]);
  });

  it("blocks release on CANCELLED or ARCHIVED waybill (Invariant I-2)", () => {
    const resultCancelled = evaluateReleaseConditions({
      shipmentStatus: "CANCELLED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "AUTHORIZED",
    });

    expect(resultCancelled.canRelease).toBe(false);
    expect(resultCancelled.unmetConditions).toContain("WAYBILL_NOT_ACTIVE");

    const resultArchived = evaluateReleaseConditions({
      shipmentStatus: "ARCHIVED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "AUTHORIZED",
    });

    expect(resultArchived.canRelease).toBe(false);
    expect(resultArchived.unmetConditions).toContain("WAYBILL_NOT_ACTIVE");
  });

  it("blocks release when document is not VERIFIED", () => {
    const result = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "NOT_UPLOADED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "AUTHORIZED",
    });

    expect(result.canRelease).toBe(false);
    expect(result.unmetConditions).toContain("DOCUMENT_NOT_VERIFIED");
  });

  it("blocks release when payment is not settled (SUBMITTED, RESIDUAL_DUE, REJECTED)", () => {
    const statuses = ["SUBMITTED", "UNDER_REVIEW", "RESIDUAL_DUE", "REJECTED", "DISCREPANCY_REVIEW"] as const;

    for (const status of statuses) {
      const result = evaluateReleaseConditions({
        shipmentStatus: "DRIVER_VIEWED",
        documentStatus: "VERIFIED",
        paymentStatus: status,
        commitmentStatus: "ACCEPTED",
        releaseStatus: "AUTHORIZED",
      });

      expect(result.canRelease).toBe(false);
      expect(result.unmetConditions).toContain("PAYMENT_NOT_SETTLED");
    }
  });

  it("blocks release when commitment is not accepted", () => {
    const resultPending = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "PENDING",
      releaseStatus: "AUTHORIZED",
    });

    expect(resultPending.canRelease).toBe(false);
    expect(resultPending.unmetConditions).toContain("COMMITMENT_NOT_ACCEPTED");

    const resultDeclined = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "DECLINED",
      releaseStatus: "AUTHORIZED",
    });

    expect(resultDeclined.canRelease).toBe(false);
    expect(resultDeclined.unmetConditions).toContain("COMMITMENT_NOT_ACCEPTED");
  });

  it("blocks release when release is BLOCKED or REVOKED", () => {
    const resultBlocked = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "BLOCKED",
    });

    expect(resultBlocked.canRelease).toBe(false);
    expect(resultBlocked.unmetConditions).toContain("RELEASE_NOT_AUTHORIZED");

    const resultRevoked = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "REVOKED",
    });

    expect(resultRevoked.canRelease).toBe(false);
    expect(resultRevoked.unmetConditions).toContain("RELEASE_NOT_AUTHORIZED");
  });

  it("collects multiple unmet conditions together without early exit", () => {
    const result = evaluateReleaseConditions({
      shipmentStatus: "CANCELLED",
      documentStatus: "NOT_UPLOADED",
      paymentStatus: "SUBMITTED",
      commitmentStatus: "PENDING",
      releaseStatus: "BLOCKED",
      hasActiveSession: false,
    });

    expect(result.canRelease).toBe(false);
    expect(result.unmetConditions).toContain("WAYBILL_NOT_ACTIVE");
    expect(result.unmetConditions).toContain("DOCUMENT_NOT_VERIFIED");
    expect(result.unmetConditions).toContain("PAYMENT_NOT_SETTLED");
    expect(result.unmetConditions).toContain("COMMITMENT_NOT_ACCEPTED");
    expect(result.unmetConditions).toContain("RELEASE_NOT_AUTHORIZED");
    expect(result.unmetConditions).toContain("UNAUTHORIZED_SESSION");
  });
});
