import type {
  AgentActivationState,
  GovernanceChangeRequestRecord,
  GovernanceRequestKind,
  GovernanceRiskLevel,
  GovernanceTargetType,
  PolicyBindingRecord,
  ScopeGrantRecord,
  SecretRefRecord,
  TriggerBindingStatus,
} from '@uniassist/workflow-contracts';

const GOVERNED_ACTIONS = new Set<GovernanceRequestKind>([
  'agent_activate',
  'trigger_enable',
  'policy_bind_apply',
  'secret_grant_issue',
  'scope_grant_issue',
  'scope_widen',
  'external_write_allow',
]);

export function requiresGovernanceApproval(
  actionKind: GovernanceRequestKind,
  _riskLevel?: GovernanceRiskLevel,
  _targetType?: GovernanceTargetType,
): boolean {
  return GOVERNED_ACTIONS.has(actionKind);
}

export function canApplyApprovedChange(
  changeRequest: GovernanceChangeRequestRecord,
  currentState?: Record<string, unknown>,
): boolean {
  if (changeRequest.status !== 'approved') {
    return false;
  }

  const activationState = typeof currentState?.activationState === 'string'
    ? currentState.activationState
    : undefined;
  const status = typeof currentState?.status === 'string'
    ? currentState.status
    : undefined;

  if (activationState === 'archived' || activationState === 'retired') {
    return false;
  }
  if (status === 'archived' || status === 'revoked') {
    return false;
  }
  return true;
}

export function isSecretUsable(
  secretRef: SecretRefRecord | undefined,
  scopeGrant: ScopeGrantRecord | undefined,
  environmentScope: string,
): boolean {
  if (!secretRef || secretRef.status !== 'active') {
    return false;
  }
  if (secretRef.environmentScope !== environmentScope && secretRef.environmentScope !== '*') {
    return false;
  }
  if (!scopeGrant) {
    return false;
  }
  return scopeGrant.status === 'active' && scopeGrant.resourceRef === secretRef.secretRefId;
}

export function isTriggerRunnable(
  agentState: AgentActivationState,
  triggerBindingState: TriggerBindingStatus,
  policyBindings: PolicyBindingRecord[],
  scopeGrants: ScopeGrantRecord[],
): boolean {
  if (agentState !== 'active' || triggerBindingState !== 'enabled') {
    return false;
  }

  if (policyBindings.some((binding) => binding.status === 'revoked' || binding.status === 'archived')) {
    return false;
  }

  if (scopeGrants.some((grant) => grant.status === 'revoked')) {
    return false;
  }

  return true;
}
