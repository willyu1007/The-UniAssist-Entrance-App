-- AlterTable
ALTER TABLE "public"."connector_event_receipts" ADD COLUMN     "run_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_connector_event_receipts_run_received_at" ON "public"."connector_event_receipts"("run_id", "received_at");
