-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "last_user_text" TEXT,
    "topic_drift_streak" INTEGER NOT NULL DEFAULT 0,
    "sticky_provider_id" TEXT,
    "sticky_weight" DECIMAL(5,3) NOT NULL DEFAULT 0.150,
    "switch_lead_provider_id" TEXT,
    "switch_lead_streak" INTEGER NOT NULL DEFAULT 0,
    "last_switch_ts" TIMESTAMP(3),
    "topic_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "public"."timeline_events" (
    "event_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "run_id" TEXT,
    "seq" BIGINT NOT NULL,
    "timestamp_ms" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "extension_kind" TEXT,
    "render_schema_ref" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "public"."provider_runs" (
    "run_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "routing_mode" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "public"."user_context_cache" (
    "profile_ref" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "ttl_expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_context_cache_pkey" PRIMARY KEY ("profile_ref")
);

-- CreateTable
CREATE TABLE "public"."outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'timeline',
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 12,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "consumed_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_threads" (
    "task_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "execution_policy" TEXT NOT NULL,
    "active_question_id" TEXT,
    "active_reply_token" TEXT,
    "metadata" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_threads_pkey" PRIMARY KEY ("session_id","task_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_templates" (
    "workflow_id" TEXT NOT NULL,
    "workflow_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "compat_provider_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("workflow_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_template_versions" (
    "template_version_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "spec_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_template_versions_pkey" PRIMARY KEY ("template_version_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_drafts" (
    "draft_id" TEXT NOT NULL,
    "workflow_key" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL,
    "based_on_template_version_id" TEXT,
    "published_template_version_id" TEXT,
    "current_spec_json" JSONB NOT NULL,
    "latest_validation_summary_json" JSONB,
    "publishable" BOOLEAN NOT NULL DEFAULT false,
    "active_revision_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_drafts_pkey" PRIMARY KEY ("draft_id")
);

-- CreateTable
CREATE TABLE "public"."draft_revisions" (
    "revision_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "change_summary" TEXT NOT NULL,
    "spec_snapshot_json" JSONB NOT NULL,
    "validation_summary_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_revisions_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_draft_session_links" (
    "session_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_focused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_draft_session_links_pkey" PRIMARY KEY ("session_id","draft_id")
);

-- CreateTable
CREATE TABLE "public"."recipe_drafts" (
    "recipe_draft_id" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "source_artifact_id" TEXT,
    "source_refs_json" JSONB NOT NULL,
    "normalized_steps_json" JSONB NOT NULL,
    "assumptions_json" JSONB NOT NULL,
    "reviewer_notes_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_drafts_pkey" PRIMARY KEY ("recipe_draft_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_runs" (
    "run_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "compat_provider_id" TEXT NOT NULL,
    "current_node_run_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "public"."workflow_node_runs" (
    "node_run_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "executor_id" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input_json" JSONB,
    "output_artifact_id" TEXT,
    "wait_key" TEXT,
    "task_id" TEXT,
    "question_id" TEXT,
    "reply_token" TEXT,
    "compat_task_state" TEXT,
    "execution_policy" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_node_runs_pkey" PRIMARY KEY ("node_run_id")
);

-- CreateTable
CREATE TABLE "public"."artifacts" (
    "artifact_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_run_id" TEXT,
    "artifact_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "schema_ref" TEXT,
    "payload_json" JSONB NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("artifact_id")
);

-- CreateTable
CREATE TABLE "public"."approval_requests" (
    "approval_request_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_run_id" TEXT,
    "artifact_id" TEXT,
    "status" TEXT NOT NULL,
    "requested_actor_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("approval_request_id")
);

-- CreateTable
CREATE TABLE "public"."approval_decisions" (
    "approval_decision_id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_actor_id" TEXT,
    "comment" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("approval_decision_id")
);

-- CreateTable
CREATE TABLE "public"."agent_definitions" (
    "agent_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "template_version_ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activation_state" TEXT NOT NULL,
    "bridge_id" TEXT,
    "identity_ref" TEXT,
    "executor_strategy" TEXT NOT NULL,
    "tool_profile" TEXT,
    "risk_level" TEXT,
    "owner_actor_ref" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "public"."bridge_registrations" (
    "bridge_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_url" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "runtime_type" TEXT NOT NULL,
    "manifest_json" JSONB NOT NULL,
    "health_json" JSONB,
    "auth_config_json" JSONB NOT NULL,
    "callback_config_json" JSONB NOT NULL,
    "last_health_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bridge_registrations_pkey" PRIMARY KEY ("bridge_id")
);

-- CreateTable
CREATE TABLE "public"."trigger_bindings" (
    "trigger_binding_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "trigger_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "public_trigger_key" TEXT,
    "last_triggered_at" TIMESTAMP(3),
    "next_trigger_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trigger_bindings_pkey" PRIMARY KEY ("trigger_binding_id")
);

-- CreateTable
CREATE TABLE "public"."policy_bindings" (
    "policy_binding_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "policy_kind" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_bindings_pkey" PRIMARY KEY ("policy_binding_id")
);

-- CreateTable
CREATE TABLE "public"."secret_refs" (
    "secret_ref_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "environment_scope" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_refs_pkey" PRIMARY KEY ("secret_ref_id")
);

-- CreateTable
CREATE TABLE "public"."scope_grants" (
    "scope_grant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scope_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scope_grants_pkey" PRIMARY KEY ("scope_grant_id")
);

-- CreateTable
CREATE TABLE "public"."governance_change_requests" (
    "request_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "request_kind" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "requested_by_actor_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "justification" TEXT,
    "desired_state_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_change_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "public"."governance_change_decisions" (
    "decision_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "actor_ref" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_change_decisions_pkey" PRIMARY KEY ("decision_id")
);

-- CreateTable
CREATE TABLE "public"."trigger_dispatches" (
    "trigger_dispatch_id" TEXT NOT NULL,
    "trigger_binding_id" TEXT NOT NULL,
    "dispatch_key" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "run_id" TEXT,
    "payload_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trigger_dispatches_pkey" PRIMARY KEY ("trigger_dispatch_id")
);

-- CreateTable
CREATE TABLE "public"."bridge_invoke_sessions" (
    "bridge_session_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_run_id" TEXT NOT NULL,
    "bridge_id" TEXT NOT NULL,
    "external_session_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "resume_token" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bridge_invoke_sessions_pkey" PRIMARY KEY ("bridge_session_id")
);

-- CreateTable
CREATE TABLE "public"."bridge_callback_receipts" (
    "callback_receipt_id" TEXT NOT NULL,
    "callback_id" TEXT NOT NULL,
    "bridge_session_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bridge_callback_receipts_pkey" PRIMARY KEY ("callback_receipt_id")
);

-- CreateTable
CREATE TABLE "public"."actor_profiles" (
    "run_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actor_profiles_pkey" PRIMARY KEY ("run_id","actor_id")
);

-- CreateTable
CREATE TABLE "public"."actor_memberships" (
    "actor_membership_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "from_actor_id" TEXT NOT NULL,
    "to_actor_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actor_memberships_pkey" PRIMARY KEY ("actor_membership_id")
);

-- CreateTable
CREATE TABLE "public"."audience_selectors" (
    "audience_selector_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "selector_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_selectors_pkey" PRIMARY KEY ("audience_selector_id")
);

-- CreateTable
CREATE TABLE "public"."delivery_specs" (
    "delivery_spec_id" TEXT NOT NULL,
    "audience_selector_id" TEXT NOT NULL,
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "delivery_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_specs_pkey" PRIMARY KEY ("delivery_spec_id")
);

-- CreateTable
CREATE TABLE "public"."delivery_targets" (
    "delivery_target_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "delivery_spec_id" TEXT NOT NULL,
    "target_actor_id" TEXT,
    "status" TEXT NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_targets_pkey" PRIMARY KEY ("delivery_target_id")
);

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_last_activity_at" ON "public"."sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "idx_timeline_events_session_seq" ON "public"."timeline_events"("session_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_events_session_seq_key" ON "public"."timeline_events"("session_id", "seq");

-- CreateIndex
CREATE INDEX "idx_provider_runs_session_id" ON "public"."provider_runs"("session_id");

-- CreateIndex
CREATE INDEX "idx_user_context_cache_ttl" ON "public"."user_context_cache"("ttl_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_id_key" ON "public"."outbox_events"("event_id");

-- CreateIndex
CREATE INDEX "idx_outbox_events_status_created_at" ON "public"."outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_outbox_events_status_next_retry" ON "public"."outbox_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "idx_task_threads_session_id" ON "public"."task_threads"("session_id");

-- CreateIndex
CREATE INDEX "idx_task_threads_session_state" ON "public"."task_threads"("session_id", "state");

-- CreateIndex
CREATE INDEX "idx_task_threads_active_reply_token" ON "public"."task_threads"("active_reply_token");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_workflow_key_key" ON "public"."workflow_templates"("workflow_key");

-- CreateIndex
CREATE INDEX "idx_workflow_templates_status" ON "public"."workflow_templates"("status");

-- CreateIndex
CREATE INDEX "idx_workflow_template_versions_template_status" ON "public"."workflow_template_versions"("template_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_versions_template_version_key" ON "public"."workflow_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "idx_workflow_drafts_status" ON "public"."workflow_drafts"("status");

-- CreateIndex
CREATE INDEX "idx_workflow_drafts_workflow_key" ON "public"."workflow_drafts"("workflow_key");

-- CreateIndex
CREATE INDEX "idx_draft_revisions_draft_created_at" ON "public"."draft_revisions"("draft_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "draft_revisions_draft_revision_number_key" ON "public"."draft_revisions"("draft_id", "revision_number");

-- CreateIndex
CREATE INDEX "idx_workflow_draft_session_links_session_active" ON "public"."workflow_draft_session_links"("session_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_workflow_draft_session_links_draft_id" ON "public"."workflow_draft_session_links"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_recipe_drafts_source_artifact_id" ON "public"."recipe_drafts"("source_artifact_id");

-- CreateIndex
CREATE INDEX "idx_recipe_drafts_status" ON "public"."recipe_drafts"("status");

-- CreateIndex
CREATE INDEX "idx_workflow_runs_session_id" ON "public"."workflow_runs"("session_id");

-- CreateIndex
CREATE INDEX "idx_workflow_runs_template_status" ON "public"."workflow_runs"("template_id", "status");

-- CreateIndex
CREATE INDEX "idx_workflow_node_runs_run_id" ON "public"."workflow_node_runs"("run_id");

-- CreateIndex
CREATE INDEX "idx_workflow_node_runs_run_status" ON "public"."workflow_node_runs"("run_id", "status");

-- CreateIndex
CREATE INDEX "idx_artifacts_run_id" ON "public"."artifacts"("run_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_node_run_id" ON "public"."artifacts"("node_run_id");

-- CreateIndex
CREATE INDEX "idx_approval_requests_run_id" ON "public"."approval_requests"("run_id");

-- CreateIndex
CREATE INDEX "idx_approval_requests_status" ON "public"."approval_requests"("status");

-- CreateIndex
CREATE INDEX "idx_approval_decisions_request_id" ON "public"."approval_decisions"("approval_request_id");

-- CreateIndex
CREATE INDEX "idx_agent_definitions_workspace_state" ON "public"."agent_definitions"("workspace_id", "activation_state");

-- CreateIndex
CREATE INDEX "idx_agent_definitions_template_version_ref" ON "public"."agent_definitions"("template_version_ref");

-- CreateIndex
CREATE INDEX "idx_agent_definitions_bridge_id" ON "public"."agent_definitions"("bridge_id");

-- CreateIndex
CREATE INDEX "idx_bridge_registrations_workspace_status" ON "public"."bridge_registrations"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "idx_bridge_registrations_service_id" ON "public"."bridge_registrations"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_trigger_bindings_public_trigger_key" ON "public"."trigger_bindings"("public_trigger_key");

-- CreateIndex
CREATE INDEX "idx_trigger_bindings_agent_status" ON "public"."trigger_bindings"("agent_id", "status");

-- CreateIndex
CREATE INDEX "idx_trigger_bindings_kind_status_next_trigger" ON "public"."trigger_bindings"("trigger_kind", "status", "next_trigger_at");

-- CreateIndex
CREATE INDEX "idx_policy_bindings_target" ON "public"."policy_bindings"("target_type", "target_ref");

-- CreateIndex
CREATE INDEX "idx_policy_bindings_workspace_status" ON "public"."policy_bindings"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "idx_secret_refs_workspace_status" ON "public"."secret_refs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "idx_secret_refs_provider_type" ON "public"."secret_refs"("provider_type");

-- CreateIndex
CREATE INDEX "idx_scope_grants_target" ON "public"."scope_grants"("target_type", "target_ref");

-- CreateIndex
CREATE INDEX "idx_scope_grants_resource" ON "public"."scope_grants"("resource_type", "resource_ref");

-- CreateIndex
CREATE INDEX "idx_scope_grants_workspace_status" ON "public"."scope_grants"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "idx_governance_change_requests_workspace_status" ON "public"."governance_change_requests"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "idx_governance_change_requests_target" ON "public"."governance_change_requests"("target_type", "target_ref");

-- CreateIndex
CREATE INDEX "idx_governance_change_decisions_request_id" ON "public"."governance_change_decisions"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_trigger_dispatches_dispatch_key" ON "public"."trigger_dispatches"("dispatch_key");

-- CreateIndex
CREATE INDEX "idx_trigger_dispatches_binding_status" ON "public"."trigger_dispatches"("trigger_binding_id", "status");

-- CreateIndex
CREATE INDEX "idx_bridge_invoke_sessions_run_id" ON "public"."bridge_invoke_sessions"("run_id");

-- CreateIndex
CREATE INDEX "idx_bridge_invoke_sessions_node_run_id" ON "public"."bridge_invoke_sessions"("node_run_id");

-- CreateIndex
CREATE INDEX "idx_bridge_invoke_sessions_bridge_status" ON "public"."bridge_invoke_sessions"("bridge_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bridge_invoke_sessions_bridge_external_session" ON "public"."bridge_invoke_sessions"("bridge_id", "external_session_ref");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bridge_callback_receipts_callback_id" ON "public"."bridge_callback_receipts"("callback_id");

-- CreateIndex
CREATE INDEX "idx_bridge_callback_receipts_session_sequence" ON "public"."bridge_callback_receipts"("bridge_session_id", "sequence");

-- CreateIndex
CREATE INDEX "idx_actor_profiles_run_id" ON "public"."actor_profiles"("run_id");

-- CreateIndex
CREATE INDEX "idx_actor_profiles_workspace_id" ON "public"."actor_profiles"("workspace_id");

-- CreateIndex
CREATE INDEX "idx_actor_memberships_run_id" ON "public"."actor_memberships"("run_id");

-- CreateIndex
CREATE INDEX "idx_actor_memberships_from_actor_id" ON "public"."actor_memberships"("from_actor_id");

-- CreateIndex
CREATE INDEX "idx_actor_memberships_to_actor_id" ON "public"."actor_memberships"("to_actor_id");

-- CreateIndex
CREATE INDEX "idx_delivery_specs_audience_selector_id" ON "public"."delivery_specs"("audience_selector_id");

-- CreateIndex
CREATE INDEX "idx_delivery_targets_run_id" ON "public"."delivery_targets"("run_id");

-- CreateIndex
CREATE INDEX "idx_delivery_targets_delivery_spec_id" ON "public"."delivery_targets"("delivery_spec_id");

