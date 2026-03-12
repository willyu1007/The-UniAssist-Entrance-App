# 05 Pitfalls

## Do-Not-Repeat Summary
- 不要把 runtime approval queue 直接扩成 control-plane governance ledger。
- 不要让 direct webhook trigger 越界成 connector event bridge 或 external runtime callback ingress。
- 不要把 trigger config 主权下放到 scheduler 或 runtime。

## Log
- Symptom: webhook trigger runtime originally tried to read `SecretRef.metadataJson.value` as the actual shared secret.
  - Root cause: that shape collapses `SecretRef` from inventory/reference object into secret material storage, conflicting with the target control-plane semantics.
  - What was tried: kept the inline value path briefly while wiring `getWebhookTriggerRuntimeConfig`.
  - Fix/workaround: switched to `SecretRef.metadataJson.envKey` and let `trigger-scheduler` resolve the secret from `process.env`.
  - Prevention: future secret providers should preserve the same boundary: governance objects store refs/locators, runtime resolves material.
- Symptom: running `pnpm install`, package typecheck, and scheduler typecheck concurrently caused a transient “local package.json exists, but node_modules missing” failure.
  - Root cause: the new workspace package was typechecked before `pnpm install` finished linking dependencies.
  - What was tried: reran the same typecheck after install completed.
  - Fix/workaround: run install first when a new workspace package has just been added.
  - Prevention: do not parallelize first-install and first-typecheck for a newly created workspace.
- Symptom: an agent could be suspended or retired while its enabled schedule triggers kept their old `nextTriggerAt`, so scheduler polling would keep re-reading the same stale due rows forever.
  - Root cause: agent lifecycle mutations only changed `activationState`; they did not reconcile long-lived schedule state.
  - What was tried: relied on `isTriggerBindingRunnable()` to filter inactive agents at read time.
  - Fix/workaround: clear `nextTriggerAt` for enabled schedule triggers on `suspend/retire`, and recompute it on successful `agent_activate`.
  - Prevention: when a control-plane lifecycle change affects trigger executability, reconcile the persisted schedule cursor in the same transaction instead of depending on read-time filtering.
