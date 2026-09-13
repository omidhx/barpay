import { describe, it, expect } from "vitest";
import {
  deriveWaybillPhase,
  WaybillStatusAxes,
  WAYBILL_PHASE_LABELS,
} from "@/lib/waybills/phase";

describe("deriveWaybillPhase — Derived Phase state machine (state-transitions.md §3)", () => {
  const baseAxes: WaybillStatusAxes = {
    shipmentStatus: "IMPORTED",
    documentStatus: "NOT_UPLOADED",
    paymentStatus: "NOT_SUBMITTED",
    commitmentStatus: "NOT_REQUIRED",
    releaseStatus: "BLOCKED",
  };

  it("identifies terminal shipment status CANCELLED with top priority", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "CANCELLED",
      paymentStatus: "APPROVED",
      releaseStatus: "RELEASED",
    });
    expect(phase).toBe("CANCELLED");
  });

  it("identifies terminal shipment status ARCHIVED with top priority", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "ARCHIVED",
    });
    expect(phase).toBe("ARCHIVED");
  });

  it("identifies terminal shipment status COMPLETED", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "COMPLETED",
    });
    expect(phase).toBe("COMPLETED");
  });

  it("identifies RELEASED when release_status is RELEASED", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "RELEASED",
    });
    expect(phase).toBe("RELEASED");
  });

  it("identifies READY_FOR_RELEASE when commitment is ACCEPTED and release is ELIGIBLE", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "VERIFIED",
      paymentStatus: "APPROVED",
      commitmentStatus: "ACCEPTED",
      releaseStatus: "ELIGIBLE",
    });
    expect(phase).toBe("READY_FOR_RELEASE");
  });

  it("identifies REFUND_SETTLED and REFUND_RECORDED", () => {
    expect(
      deriveWaybillPhase({
        ...baseAxes,
        paymentStatus: "REFUND_SETTLED",
      })
    ).toBe("REFUND_SETTLED");

    expect(
      deriveWaybillPhase({
        ...baseAxes,
        paymentStatus: "REFUND_RECORDED",
      })
    ).toBe("REFUND_RECORDED");
  });

  it("identifies RESIDUAL_PAYMENT when payment_status is RESIDUAL_DUE", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "DRIVER_VIEWED",
      paymentStatus: "RESIDUAL_DUE",
    });
    expect(phase).toBe("RESIDUAL_PAYMENT");
  });

  it("identifies PAYMENT_REJECTED and PAYMENT_UNDER_REVIEW", () => {
    expect(
      deriveWaybillPhase({
        ...baseAxes,
        paymentStatus: "REJECTED",
      })
    ).toBe("PAYMENT_REJECTED");

    expect(
      deriveWaybillPhase({
        ...baseAxes,
        paymentStatus: "SUBMITTED",
      })
    ).toBe("PAYMENT_UNDER_REVIEW");

    expect(
      deriveWaybillPhase({
        ...baseAxes,
        paymentStatus: "UNDER_REVIEW",
      })
    ).toBe("PAYMENT_UNDER_REVIEW");
  });

  describe("v2.5 Pre-payment Driver Commitment Chain (Decision 19)", () => {
    it("derives AWAITING_COMMITMENT when driver viewed/notified and commitment is PENDING", () => {
      const phase = deriveWaybillPhase({
        ...baseAxes,
        shipmentStatus: "DRIVER_NOTIFIED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "PENDING",
      });
      expect(phase).toBe("AWAITING_COMMITMENT");
    });

    it("derives AWAITING_COMMITMENT when driver viewed and commitment was DECLINED", () => {
      const phase = deriveWaybillPhase({
        ...baseAxes,
        shipmentStatus: "DRIVER_VIEWED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "DECLINED",
      });
      expect(phase).toBe("AWAITING_COMMITMENT");
    });

    it("derives AWAITING_PAYMENT only after commitment is ACCEPTED (or NOT_REQUIRED)", () => {
      const phaseAccepted = deriveWaybillPhase({
        ...baseAxes,
        shipmentStatus: "DRIVER_VIEWED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "ACCEPTED",
      });
      expect(phaseAccepted).toBe("AWAITING_PAYMENT");

      const phaseNotReq = deriveWaybillPhase({
        ...baseAxes,
        shipmentStatus: "DRIVER_NOTIFIED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "NOT_REQUIRED",
      });
      expect(phaseNotReq).toBe("AWAITING_PAYMENT");
    });
  });

  it("identifies PDF_ATTACHED when document is VERIFIED and shipment is READY_FOR_DRIVER", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "READY_FOR_DRIVER",
      documentStatus: "VERIFIED",
    });
    expect(phase).toBe("PDF_ATTACHED");
  });

  it("identifies initial IMPORTED phase", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "IMPORTED",
      documentStatus: "NOT_UPLOADED",
    });
    expect(phase).toBe("IMPORTED");
  });

  it("returns NEEDS_ATTENTION for undefined/unexpected status combinations", () => {
    const phase = deriveWaybillPhase({
      ...baseAxes,
      shipmentStatus: "READY_FOR_DRIVER",
      documentStatus: "NOT_UPLOADED",
      paymentStatus: "NOT_SUBMITTED",
      commitmentStatus: "NOT_REQUIRED",
      releaseStatus: "BLOCKED",
    });
    expect(phase).toBe("NEEDS_ATTENTION");
  });

  it("has a Persian label defined for every possible WaybillPhase", () => {
    const testPhases: Array<keyof typeof WAYBILL_PHASE_LABELS> = [
      "IMPORTED",
      "PDF_ATTACHED",
      "AWAITING_COMMITMENT",
      "AWAITING_PAYMENT",
      "PAYMENT_UNDER_REVIEW",
      "PAYMENT_REJECTED",
      "RESIDUAL_PAYMENT",
      "REFUND_RECORDED",
      "REFUND_SETTLED",
      "READY_FOR_RELEASE",
      "RELEASED",
      "COMPLETED",
      "CANCELLED",
      "ARCHIVED",
      "NEEDS_ATTENTION",
    ];

    for (const p of testPhases) {
      expect(WAYBILL_PHASE_LABELS[p]).toBeDefined();
      expect(typeof WAYBILL_PHASE_LABELS[p]).toBe("string");
      expect(WAYBILL_PHASE_LABELS[p].length).toBeGreaterThan(0);
    }
  });
});
