# R&D Collaboration Validation Scenario

This scenario documents the `B8` canonical validation package used to verify:

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

## Helper path

- Code helper: `packages/workflow-contracts/src/rnd-collab-scenario.ts`

## Input fixtures

- `canonical-input.json`
- `event-fixture.json`

## Expected outputs

- `expected-artifacts.json`
- Approval remains pending after `synthesize_execution_plan`
- Approve path creates `ChangeIntent`, `ExecutionPlan`, connector `ActionReceipt`s, callback `ValidationReport`, and final `DeliverySummary`
- Event-subscription companion flow creates a `ValidationReport`, then upserts issue status via `issue_tracker`
