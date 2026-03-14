# R&D Collaboration Validation Scenario

This scenario documents the `B8` canonical validation package. It is a validation fixture, not a product vertical definition.

## What it proves

- governed external write actions across `issue_tracker + source_control + ci_pipeline`
- approval before external writes
- same-run async callback resume for CI
- `event_subscription` companion flow for pipeline-finished events
- control-console artifact inspection via existing runs/approvals surfaces

## Canonical workflows

### Primary change flow

`capture_change_intent -> synthesize_execution_plan -> risk_review -> issue_upsert -> change_review_upsert -> pipeline_start -> summarize_delivery -> finish`

### Companion event flow

`capture_validation_signal -> issue_upsert -> finish`

## Acceptance highlights

- Approval remains pending after `synthesize_execution_plan`
- Approve path creates `ChangeIntent`, `ExecutionPlan`, connector `ActionReceipt`s, callback `ValidationReport`, and final `DeliverySummary`
- Event-subscription companion flow creates a `ValidationReport`, then upserts issue status via `issue_tracker`

The scenario helper in `packages/workflow-contracts` and the adjacent JSON fixtures are the executable reference. This README records only the non-obvious behavioral expectations.
