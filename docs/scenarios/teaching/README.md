# Teaching Validation Scenario

This scenario documents the B3 canonical sample workflow used to validate:

- workflow runtime typed artifact generation
- approval-gated progression
- delivery target fan-out
- run-derived `RecipeDraft` capture

## Canonical node chain

`parse_materials -> generate_assessment -> teacher_review -> fanout_delivery -> finish`

## Helper path

- Code helper: `packages/workflow-contracts/src/teaching-scenario.ts`

## Input fixture

- `canonical-input.json`

## Expected outputs

- `expected-artifacts.json`
- Approval remains pending after `generate_assessment`
- Approve path publishes `AssessmentDraft`, creates `ReviewableDelivery`, and resolves delivery targets
- Reject path fails the run and does not create delivery artifacts
