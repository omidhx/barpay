-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DataRetentionPolicy" AS ENUM ('KEEP_1Y', 'KEEP_10Y', 'KEEP_CUSTOM', 'KEEP_FOREVER');

-- CreateEnum
CREATE TYPE "CommitmentEnforcementMode" AS ENUM ('OFF', 'SHADOW', 'ENFORCED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'SUPERVISOR', 'OPERATOR', 'TECH_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'IMPORTED', 'VALIDATION_FAILED', 'READY_FOR_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_VIEWED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_UPLOADED', 'UPLOADED', 'MATCHED', 'MISMATCHED', 'PENDING_REVIEW', 'VERIFIED', 'REPLACEMENT_PENDING', 'CORRUPTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISCREPANCY_REVIEW', 'RESIDUAL_DUE', 'REFUND_RECORDED', 'REFUND_SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'DECLINED', 'RE_ACCEPT_REQUIRED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('BLOCKED', 'ELIGIBLE', 'AUTHORIZED', 'RELEASED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WaybillAmountSource" AS ENUM ('EXCEL_CALCULATED', 'OPERATOR_ENTERED', 'OPERATOR_CORRECTION');

-- CreateEnum
CREATE TYPE "WaybillAmountStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'VALIDATED', 'COMMITTING', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'IMPORTED', 'SKIPPED_PREVIOUSLY_CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('WAYBILL_PDF', 'PAYMENT_RECEIPT', 'DRIVER_COMMITMENT', 'SIGNATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "MatchingMethod" AS ENUM ('FILENAME', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchingStatus" AS ENUM ('AUTO_MATCHED', 'MANUALLY_ATTACHED', 'UNMATCHED', 'REPLACED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PRIVATE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_TO_CARD', 'POS', 'CASH', 'BANK_TRANSFER', 'GATEWAY', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionActorType" AS ENUM ('DRIVER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "PaymentReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('RECORDED', 'SUPERVISOR_APPROVED', 'REJECTED', 'REFUND_SETTLED');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('SEP', 'BPM', 'PASARGAD', 'SADAD', 'ZARINPAL', 'ZIBAL');

-- CreateEnum
CREATE TYPE "GatewayMode" AS ENUM ('LIVE', 'SANDBOX');

-- CreateEnum
CREATE TYPE "GatewayTransactionStatus" AS ENUM ('INITIATED', 'RETURNED', 'VERIFIED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommitmentVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DocumentAccessType" AS ENUM ('DOWNLOAD', 'VIEW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'DRIVER', 'SYSTEM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "national_id" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "organization_id" TEXT NOT NULL,
    "round_multiple" BIGINT NOT NULL DEFAULT 50000,
    "surcharge_amount" BIGINT NOT NULL DEFAULT 700000,
    "apply_surcharge_default" BOOLEAN NOT NULL DEFAULT true,
    "data_retention_policy" "DataRetentionPolicy" NOT NULL DEFAULT 'KEEP_10Y',
    "sms_daily_cap" INTEGER NOT NULL DEFAULT 2000,
    "commitment_enforcement" "CommitmentEnforcementMode" NOT NULL DEFAULT 'OFF',
    "signed_url_download" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "excel_column_mappings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mapping_name" TEXT NOT NULL,
    "column_mappings_json" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excel_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted_by" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "full_name" TEXT,
    "national_id" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybills" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_number" TEXT NOT NULL,
    "waybill_year" INTEGER,
    "waybill_year_key" INTEGER GENERATED ALWAYS AS (COALESCE("waybill_year", 0)) STORED,
    "driver_id" TEXT,
    "driver_name_raw" TEXT NOT NULL,
    "driver_mobile_raw" TEXT NOT NULL,
    "plate_number_raw" TEXT,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "gross_amount" BIGINT,
    "commission_amount" BIGINT,
    "deductions_amount" BIGINT,
    "net_amount" BIGINT,
    "current_amount_id" TEXT,
    "shipment_status" "ShipmentStatus" NOT NULL DEFAULT 'IMPORTED',
    "document_status" "DocumentStatus" NOT NULL DEFAULT 'NOT_UPLOADED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "commitment_status" "CommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "release_status" "ReleaseStatus" NOT NULL DEFAULT 'BLOCKED',
    "source_import_id" TEXT,
    "created_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybill_amounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "raw_excel_amount" BIGINT NOT NULL,
    "rounded_amount" BIGINT NOT NULL,
    "surcharge_amount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "source" "WaybillAmountSource" NOT NULL DEFAULT 'EXCEL_CALCULATED',
    "reason" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "status" "WaybillAmountStatus" NOT NULL DEFAULT 'APPROVED',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waybill_amounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "import_batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data_json" JSONB NOT NULL,
    "normalized_data_json" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'VALID',
    "error_details_json" JSONB,
    "waybill_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT,
    "document_type" "DocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256_hash" TEXT NOT NULL,
    "extracted_waybill_number" TEXT,
    "extracted_waybill_year" INTEGER,
    "matching_method" "MatchingMethod",
    "matching_status" "MatchingStatus" NOT NULL DEFAULT 'UNMATCHED',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "parent_payment_id" TEXT,
    "is_residual" BOOLEAN NOT NULL DEFAULT false,
    "waybill_amount_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "method" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "tracking_number" TEXT,
    "payout_card_id" TEXT,
    "gateway_provider" "GatewayProvider",
    "gateway_transaction_id" TEXT,
    "auto_verified_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "receipt_document_id" TEXT,
    "submitted_by_type" "SubmissionActorType" NOT NULL DEFAULT 'DRIVER',
    "submitted_by_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reviews" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "decision" "PaymentReviewDecision" NOT NULL,
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'RECORDED',
    "recorded_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateways" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "credentials_json" JSONB NOT NULL,
    "mode" "GatewayMode" NOT NULL DEFAULT 'LIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_health_check_at" TIMESTAMP(3),
    "last_health_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "payment_gateway_id" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "provider_reference" TEXT,
    "state" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "waybill_amount_id" TEXT NOT NULL,
    "status" "GatewayTransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "error_code" TEXT,
    "init_payload_json" JSONB,
    "callback_payload_json" JSONB,
    "verify_payload_json" JSONB,
    "inquiry_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_cards" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "holder_first_name" TEXT NOT NULL,
    "holder_last_name" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "account_number" TEXT,
    "iban" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_access_links" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "is_single_use" BOOLEAN NOT NULL DEFAULT false,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "driver_access_link_id" TEXT NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "waybill_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "locked_until" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "variables_json" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "CommitmentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_acceptances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "commitment_version_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "rendered_text" TEXT NOT NULL,
    "signature_document_id" TEXT,
    "mobile_verified" BOOLEAN NOT NULL DEFAULT true,
    "session_id" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_authorizations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "authorized_by" TEXT NOT NULL,
    "authorized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waybill_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "driver_session_id" TEXT,
    "access_type" "DocumentAccessType" NOT NULL DEFAULT 'DOWNLOAD',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "document_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "recipient" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "provider" TEXT,
    "provider_message_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body_json" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "correlation_id" TEXT,
    "prev_hash" TEXT,
    "row_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_admin_access_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tech_admin_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_mobile_key" ON "users"("organization_id", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");

-- CreateIndex
CREATE INDEX "drivers_organization_id_mobile_idx" ON "drivers"("organization_id", "mobile");

-- CreateIndex
CREATE INDEX "waybills_organization_id_shipment_status_idx" ON "waybills"("organization_id", "shipment_status");

-- CreateIndex
CREATE INDEX "waybills_organization_id_waybill_number_idx" ON "waybills"("organization_id", "waybill_number");

-- CreateIndex
CREATE INDEX "waybills_driver_id_idx" ON "waybills"("driver_id");

-- CreateIndex
CREATE INDEX "waybills_created_at_idx" ON "waybills"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_organization_id_id_key" ON "waybills"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_organization_id_waybill_number_waybill_year_key_key" ON "waybills"("organization_id", "waybill_number", "waybill_year_key");

-- CreateIndex
CREATE INDEX "waybill_amounts_waybill_id_idx" ON "waybill_amounts"("waybill_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_organization_id_file_hash_key" ON "import_batches"("organization_id", "file_hash");

-- CreateIndex
CREATE INDEX "import_rows_import_batch_id_row_number_idx" ON "import_rows"("import_batch_id", "row_number");

-- CreateIndex
CREATE INDEX "documents_sha256_hash_idx" ON "documents"("sha256_hash");

-- CreateIndex
CREATE INDEX "documents_waybill_id_idx" ON "documents"("waybill_id");

-- CreateIndex
CREATE INDEX "payments_waybill_id_idx" ON "payments"("waybill_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_id_key" ON "payments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "payment_reviews_payment_id_idx" ON "payment_reviews"("payment_id");

-- CreateIndex
CREATE INDEX "payment_refunds_waybill_id_idx" ON "payment_refunds"("waybill_id");

-- CreateIndex
CREATE INDEX "gateway_transactions_status_expires_at_idx" ON "gateway_transactions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "bank_cards_organization_id_is_active_display_order_idx" ON "bank_cards"("organization_id", "is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "driver_access_links_token_hash_key" ON "driver_access_links"("token_hash");

-- CreateIndex
CREATE INDEX "driver_access_links_organization_id_waybill_id_idx" ON "driver_access_links"("organization_id", "waybill_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_sessions_session_token_hash_key" ON "driver_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "driver_sessions_organization_id_waybill_id_idx" ON "driver_sessions"("organization_id", "waybill_id");

-- CreateIndex
CREATE INDEX "otp_challenges_organization_id_mobile_idx" ON "otp_challenges"("organization_id", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_acceptances_waybill_id_commitment_version_id_key" ON "commitment_acceptances"("waybill_id", "commitment_version_id");

-- CreateIndex
CREATE INDEX "document_access_events_waybill_id_idx" ON "document_access_events"("waybill_id");

-- CreateIndex
CREATE INDEX "notification_jobs_status_next_retry_at_idx" ON "notification_jobs"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_organization_id_endpoint_idempotency_ke_key" ON "idempotency_records"("organization_id", "endpoint", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_column_mappings" ADD CONSTRAINT "excel_column_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybill_amounts" ADD CONSTRAINT "waybill_amounts_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_parent_payment_id_fkey" FOREIGN KEY ("parent_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payout_card_id_fkey" FOREIGN KEY ("payout_card_id") REFERENCES "bank_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_payment_gateway_id_fkey" FOREIGN KEY ("payment_gateway_id") REFERENCES "payment_gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_cards" ADD CONSTRAINT "bank_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_access_links" ADD CONSTRAINT "driver_access_links_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_driver_access_link_id_fkey" FOREIGN KEY ("driver_access_link_id") REFERENCES "driver_access_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_versions" ADD CONSTRAINT "commitment_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_acceptances" ADD CONSTRAINT "commitment_acceptances_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_acceptances" ADD CONSTRAINT "commitment_acceptances_commitment_version_id_fkey" FOREIGN KEY ("commitment_version_id") REFERENCES "commitment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_authorizations" ADD CONSTRAINT "release_authorizations_organization_id_waybill_id_fkey" FOREIGN KEY ("organization_id", "waybill_id") REFERENCES "waybills"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- PHYSICAL CONSTRAINTS & ADVANCED POSTGRESQL OBJECTS (data-model.md §4 & invariants.md)
-- =============================================================================

-- 1. PARTIAL UNIQUE INDEXES

-- One current amount per waybill
CREATE UNIQUE INDEX "idx_waybill_amounts_current" ON "waybill_amounts" ("waybill_id") WHERE "is_current" = TRUE;

-- Unique idempotency key per payment when present
CREATE UNIQUE INDEX "idx_payments_idempotency_key" ON "payments" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Unique tracking number per org & method for manual payments
CREATE UNIQUE INDEX "idx_payments_tracking_duplicate" ON "payments" ("organization_id", "method", "tracking_number")
WHERE "tracking_number" IS NOT NULL AND "method" IN ('CARD_TO_CARD', 'POS', 'BANK_TRANSFER');

-- 1:1 active PDF policy per waybill (matching_status <> 'REPLACED')
CREATE UNIQUE INDEX "idx_documents_active_waybill_pdf" ON "documents" ("waybill_id")
WHERE "document_type" = 'WAYBILL_PDF' AND "waybill_id" IS NOT NULL AND "matching_status" <> 'REPLACED';

-- One active driver per mobile in organization
CREATE UNIQUE INDEX "idx_drivers_active_mobile" ON "drivers" ("organization_id", "mobile") WHERE "status" = 'ACTIVE';

-- One active default commitment version per organization
CREATE UNIQUE INDEX "idx_commitment_versions_active_default" ON "commitment_versions" ("organization_id")
WHERE "status" = 'ACTIVE' AND "is_default" = TRUE;

-- At most one active release authorization per waybill
CREATE UNIQUE INDEX "idx_release_authorizations_active" ON "release_authorizations" ("waybill_id") WHERE "revoked_at" IS NULL;

-- Unique gateway provider reference per organization
CREATE UNIQUE INDEX "idx_gateway_transactions_provider_ref" ON "gateway_transactions" ("organization_id", "provider", "provider_reference")
WHERE "provider_reference" IS NOT NULL;

-- At most one open gateway attempt per waybill
CREATE UNIQUE INDEX "idx_gateway_transactions_single_open" ON "gateway_transactions" ("waybill_id")
WHERE "status" IN ('INITIATED', 'RETURNED', 'UNKNOWN');

-- At most one active payment gateway per organization
CREATE UNIQUE INDEX "idx_payment_gateways_active_per_org" ON "payment_gateways" ("organization_id") WHERE "is_active" = TRUE;


-- 2. PHYSICAL CHECK CONSTRAINTS

-- Invariant I-1: Full conditional release
ALTER TABLE "waybills" ADD CONSTRAINT "check_waybills_release_invariants" CHECK (
  "release_status" NOT IN ('ELIGIBLE', 'AUTHORIZED', 'RELEASED') OR (
    "payment_status" IN ('APPROVED', 'NOT_REQUIRED') AND
    "commitment_status" IN ('ACCEPTED', 'NOT_REQUIRED') AND
    "document_status" = 'VERIFIED'
  )
);

-- Invariant I-2: Cancelled or archived waybills can never be released
ALTER TABLE "waybills" ADD CONSTRAINT "check_waybills_cancelled_release" CHECK (
  "shipment_status" NOT IN ('CANCELLED', 'ARCHIVED') OR
  "release_status" NOT IN ('AUTHORIZED', 'RELEASED')
);

-- Payments gateway column pairing
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_gateway_pairing" CHECK (
  ("gateway_provider" IS NULL AND "gateway_transaction_id" IS NULL) OR
  ("gateway_provider" IS NOT NULL AND "gateway_transaction_id" IS NOT NULL)
);

-- Payments method GATEWAY requires auto_verified_at; non-gateway must not have auto_verified_at
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_method_gateway" CHECK (
  ("method" = 'GATEWAY' AND "gateway_provider" IS NOT NULL AND "gateway_transaction_id" IS NOT NULL AND "auto_verified_at" IS NOT NULL) OR
  ("method" <> 'GATEWAY' AND "auto_verified_at" IS NULL)
);

-- Waybill amounts: OPERATOR_CORRECTION requires reason
ALTER TABLE "waybill_amounts" ADD CONSTRAINT "check_waybill_amounts_reason" CHECK (
  "source" <> 'OPERATOR_CORRECTION' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0)
);

-- Bank cards: 16 digits card number and IR + 24 digits IBAN
ALTER TABLE "bank_cards" ADD CONSTRAINT "check_bank_cards_card_number" CHECK (
  "card_number" ~ '^[0-9]{16}$'
);

ALTER TABLE "bank_cards" ADD CONSTRAINT "check_bank_cards_iban" CHECK (
  "iban" ~ '^IR[0-9]{24}$'
);


-- 3. TRIGGERS

-- Trigger 1: check_refund_ceiling (with advisory transaction lock)
CREATE OR REPLACE FUNCTION trigger_check_refund_ceiling()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid BIGINT;
  v_total_refunded BIGINT;
BEGIN
  -- Advisory transaction lock on waybill to serialize concurrent refund checks
  PERFORM pg_advisory_xact_lock(hashtext(NEW.waybill_id));

  -- Sum of approved payments for this waybill
  SELECT COALESCE(SUM("amount"), 0)
  INTO v_total_paid
  FROM "payments"
  WHERE "waybill_id" = NEW.waybill_id AND "status" = 'APPROVED';

  -- Sum of non-rejected refunds for this waybill excluding current row if update
  SELECT COALESCE(SUM("amount"), 0)
  INTO v_total_refunded
  FROM "payment_refunds"
  WHERE "waybill_id" = NEW.waybill_id
    AND "status" <> 'REJECTED'
    AND "id" <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF (v_total_refunded + NEW.amount) > v_total_paid THEN
    RAISE EXCEPTION 'REFUND_CEILING_EXCEEDED: مجموع بازگشت وجه (% ریال) نمی‌تواند بیش از مجموع پرداختی‌های تأییدشده (% ریال) باشد.',
      (v_total_refunded + NEW.amount), v_total_paid;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_check_refund_ceiling"
BEFORE INSERT OR UPDATE ON "payment_refunds"
FOR EACH ROW
EXECUTE FUNCTION trigger_check_refund_ceiling();


-- Trigger 2: waybill_identity_immutable
CREATE OR REPLACE FUNCTION trigger_waybill_identity_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.waybill_number <> OLD.waybill_number OR COALESCE(NEW.waybill_year, 0) <> COALESCE(OLD.waybill_year, 0) THEN
    RAISE EXCEPTION 'WAYBILL_IDENTITY_IMMUTABLE: شماره بارنامه و سال بارنامه پس از ایجاد غیرقابل ویرایش هستند.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_waybill_identity_immutable"
BEFORE UPDATE ON "waybills"
FOR EACH ROW
EXECUTE FUNCTION trigger_waybill_identity_immutable();


-- Trigger 3: commitment_version_immutable
CREATE OR REPLACE FUNCTION trigger_commitment_version_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body <> OLD.body OR NEW.variables_json::text <> OLD.variables_json::text OR NEW.content_hash <> OLD.content_hash THEN
    RAISE EXCEPTION 'COMMITMENT_VERSION_IMMUTABLE: متن، متغیرها و هش نسخه تعهدنامه پس از ایجاد غیرقابل تغییر هستند. باید نسخه جدید ایجاد کنید.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_commitment_version_immutable"
BEFORE UPDATE ON "commitment_versions"
FOR EACH ROW
EXECUTE FUNCTION trigger_commitment_version_immutable();

