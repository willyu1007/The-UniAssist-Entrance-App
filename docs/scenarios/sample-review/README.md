# Sample Review Validation Scenario

This scenario documents the `B3` canonical sample workflow. It is a validation fixture, not a product definition.

## What it proves

- workflow runtime typed artifact generation
- approval-gated progression
- delivery target fan-out
- run-derived `RecipeDraft` capture

## Canonical node chain

`capture_inputs -> synthesize_review_draft -> approval_review -> publish_delivery -> finish`

## Acceptance highlights

- Approval remains pending after `synthesize_review_draft`
- Approve path publishes `AssessmentDraft`, creates `ReviewableDelivery`, and resolves delivery targets
- Reject path fails the run and does not create delivery artifacts

The scenario helper in `packages/workflow-contracts` and the adjacent JSON fixtures are the executable reference. This README records only the behavioral contract that is easy to miss when scanning those files.
