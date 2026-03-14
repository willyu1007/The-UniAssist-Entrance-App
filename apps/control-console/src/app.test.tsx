import { RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ControlConsoleProviders,
  createQueryClient,
  useAdaptivePollingInterval,
  useControlConsoleEnvironment,
} from './query';
import { buildMemoryRouter } from './router';
import { CONTROL_CONSOLE_STREAM_RETRY_MS, CONTROL_CONSOLE_STREAM_STALE_MS } from './config';
import '../../../ui/styles/tokens.css';
import '../../../ui/styles/contract.css';
import './styles.css';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;

  onopen: ((event: Event) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    return;
  }

  emitOpen(): void {
    this.onopen?.(new Event('open'));
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

type FetchRouteHandler = (input: { url: string; method: string; body?: unknown }) => unknown;

function createFetchMock(handler: FetchRouteHandler) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const payload = handler({
      url,
      method: init?.method || 'GET',
      body,
    });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function renderRoute(path: string) {
  const router = buildMemoryRouter([path]);
  const queryClient = createQueryClient();
  return render(
    <ControlConsoleProviders
      queryClient={queryClient}
      eventSourceFactory={(url) => new FakeEventSource(url)}
    >
      <RouterProvider router={router} />
    </ControlConsoleProviders>,
  );
}

function StreamProbe() {
  const { streamMode } = useControlConsoleEnvironment();
  const pollingInterval = useAdaptivePollingInterval('runs');
  return (
    <div>
      <span>mode:{streamMode}</span>
      <span>interval:{String(pollingInterval)}</span>
    </div>
  );
}

const runListPayload = {
  schemaVersion: 'v1',
  runs: [
    {
      runId: 'run-1',
      workflowId: 'wf-1',
      workflowKey: 'teaching-validation',
      templateVersionId: 'ver-1',
      startMode: 'agent',
      status: 'waiting_approval',
      sessionId: 's-1',
      userId: 'u-1',
      createdAt: 1,
      updatedAt: 1,
      currentNodeRunId: 'node-run-1',
      currentNodeKey: 'teacher_review',
      currentNodeType: 'approval_gate',
      currentNodeStatus: 'waiting_approval',
      blocker: 'waiting_approval',
      pendingApprovalCount: 1,
      deliverySummary: {
        pendingResolution: 0,
        ready: 0,
        blocked: 0,
        delivered: 1,
        failed: 0,
        cancelled: 0,
      },
      artifactTypes: ['AssessmentDraft', 'EvidencePack'],
      requestedActorIds: ['teacher:1'],
    },
  ],
};

const runDetailPayload = {
  schemaVersion: 'v1',
  run: {
    run: {
      runId: 'run-1',
      workflowId: 'wf-1',
      workflowKey: 'teaching-validation',
      templateVersionId: 'ver-1',
      startMode: 'agent',
      status: 'waiting_approval',
      sessionId: 's-1',
      userId: 'u-1',
      createdAt: 1,
      updatedAt: 1,
      currentNodeRunId: 'node-run-1',
    },
    nodeRuns: [
      {
        nodeRunId: 'node-run-1',
        runId: 'run-1',
        nodeKey: 'teacher_review',
        nodeType: 'approval_gate',
        status: 'waiting_approval',
        resumeActionId: 'approve_request:approval-1',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    approvals: [
      {
        approvalRequestId: 'approval-1',
        runId: 'run-1',
        nodeRunId: 'node-run-1',
        artifactId: 'artifact-1',
        status: 'pending',
        requestedActorId: 'teacher:1',
        payloadJson: { artifactIds: ['artifact-1'] },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    approvalDecisions: [],
    artifacts: [
      {
        artifactId: 'artifact-1',
        runId: 'run-1',
        nodeRunId: 'node-run-1',
        artifactType: 'AssessmentDraft',
        state: 'review_required',
        payloadJson: { finding: 'A' },
        metadataJson: {},
        createdAt: 1,
        updatedAt: 1,
      },
      {
        artifactId: 'artifact-2',
        runId: 'run-1',
        nodeRunId: 'node-run-2',
        artifactType: 'DeliverySummary',
        state: 'published',
        payloadJson: { disposition: 'ready_for_release' },
        metadataJson: {
          lineage: {
            nodeKey: 'summarize_delivery',
          },
        },
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    actorProfiles: [],
    actorMemberships: [],
    audienceSelectors: [],
    deliverySpecs: [],
    deliveryTargets: [
      {
        deliveryTargetId: 'delivery-1',
        runId: 'run-1',
        deliverySpecId: 'spec-1',
        status: 'delivered',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  },
  capturedRecipeDrafts: [],
};

const approvalQueuePayload = {
  schemaVersion: 'v1',
  approvals: [
    {
      approvalRequestId: 'approval-1',
      runId: 'run-1',
      workflowKey: 'teaching-validation',
      templateVersionId: 'ver-1',
      runStatus: 'waiting_approval',
      nodeRunId: 'node-run-1',
      nodeKey: 'teacher_review',
      status: 'pending',
      requestedActorId: 'teacher:1',
      approverDisplayName: 'Ms. Li',
      artifactId: 'artifact-1',
      artifactIds: ['artifact-1'],
      artifactTypes: ['AssessmentDraft'],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

const approvalDetailPayload = {
  schemaVersion: 'v1',
  approval: {
    approvalRequestId: 'approval-1',
    runId: 'run-1',
    nodeRunId: 'node-run-1',
    artifactId: 'artifact-1',
    status: 'pending',
    requestedActorId: 'teacher:1',
    payloadJson: { artifactIds: ['artifact-1'] },
    createdAt: 1,
    updatedAt: 1,
  },
  runSummary: runListPayload.runs[0],
  approverContext: {
    actorId: 'teacher:1',
    workspaceId: 'workspace-1',
    status: 'active',
    displayName: 'Ms. Li',
    actorType: 'person',
    createdAt: 1,
    updatedAt: 1,
  },
  artifacts: [
    {
      artifact: runDetailPayload.run.artifacts[0],
      typedPayload: { finding: 'A' },
      lineage: { nodeKey: 'teacher_review' },
    },
  ],
  decisions: [],
  capturedRecipeDrafts: [],
};

const artifactDetailPayload = {
  schemaVersion: 'v1',
  artifact: runDetailPayload.run.artifacts[1],
  typedPayload: {
    disposition: 'ready_for_release',
    summary: 'Issue, change review, and pipeline are aligned for release.',
  },
  lineage: {
    nodeKey: 'summarize_delivery',
    validationReportCount: 1,
  },
};

const draftListPayload = {
  schemaVersion: 'v1',
  drafts: [
    {
      draftId: 'draft-1',
      workflowKey: 'draft-key',
      name: 'Draft One',
      status: 'editable',
      currentSpec: {
        schemaVersion: 'v1',
        workflowKey: 'draft-key',
        name: 'Draft One',
        entryNode: 'collect',
        requirements: ['Need review'],
        nodes: [
          {
            nodeKey: 'collect',
            nodeType: 'executor',
            executorId: 'compat-sample',
            transitions: { success: 'finish' },
          },
          {
            nodeKey: 'finish',
            nodeType: 'end',
          },
        ],
      },
      publishable: false,
      activeRevisionNumber: 2,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  sessionLinks: [
    {
      sessionId: 'console-session-test',
      draftId: 'draft-1',
      userId: 'console-user-test',
      isActive: true,
      createdAt: 1,
      updatedAt: 1,
      lastFocusedAt: 2,
    },
  ],
};

const draftDetailPayload = {
  schemaVersion: 'v1',
  draft: draftListPayload.drafts[0],
  revisions: [
    {
      revisionId: 'rev-1',
      draftId: 'draft-1',
      revisionNumber: 1,
      source: 'builder_text_entry',
      actorId: 'console-user-test',
      changeSummary: 'Created draft',
      specSnapshot: {
        schemaVersion: 'v1',
        workflowKey: 'draft-key',
      },
      createdAt: 1,
    },
    {
      revisionId: 'rev-2',
      draftId: 'draft-1',
      revisionNumber: 2,
      source: 'console_edit',
      actorId: 'console-user-test',
      changeSummary: 'Studio patch',
      specSnapshot: draftListPayload.drafts[0].currentSpec,
      validationSummary: {
        isPublishable: false,
        errors: [],
        warnings: ['Need more nodes'],
        checkedAt: 2,
      },
      createdAt: 2,
    },
  ],
  sessionLinks: draftListPayload.sessionLinks,
};

const templateListPayload = {
  schemaVersion: 'v1',
  workflows: [
    {
      workflowId: 'wf-1',
      workflowKey: 'teaching-validation',
      name: 'Teaching Validation',
      status: 'active',
      createdAt: 1,
      updatedAt: 5,
    },
  ],
};

const templateDetailPayload = {
  schemaVersion: 'v1',
  workflow: {
    workflow: templateListPayload.workflows[0],
    versions: [
      {
        templateVersionId: 'ver-1',
        workflowId: 'wf-1',
        workflowKey: 'teaching-validation',
        version: 1,
        status: 'published',
        spec: {
          schemaVersion: 'v1',
          workflowKey: 'teaching-validation',
          name: 'Teaching Validation',
          entryNode: 'collect',
          nodes: [
            {
              nodeKey: 'collect',
              nodeType: 'executor',
              executorId: 'platform-native',
              transitions: { success: 'finish' },
            },
            {
              nodeKey: 'finish',
              nodeType: 'end',
            },
          ],
        },
        createdAt: 5,
      },
    ],
  },
};

const agentListPayload = {
  schemaVersion: 'v1',
  agents: [
    {
      agentId: 'agent-1',
      workspaceId: 'workspace-1',
      templateVersionRef: 'ver-1',
      name: 'Teaching Agent',
      description: 'Primary teaching operator',
      activationState: 'approved',
      executorStrategy: 'platform_runtime',
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const agentDetailPayload = {
  schemaVersion: 'v1',
  agent: agentListPayload.agents[0],
};

const triggerBindingsPayload = {
  schemaVersion: 'v1',
  triggerBindings: [
    {
      triggerBindingId: 'trigger-1',
      workspaceId: 'workspace-1',
      agentId: 'agent-1',
      triggerKind: 'schedule',
      status: 'approved',
      configJson: { cron: '0 * * * *' },
      nextTriggerAt: 100,
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const actionBindingsPayload = {
  schemaVersion: 'v1',
  actionBindings: [
    {
      actionBindingId: 'action-1',
      workspaceId: 'workspace-1',
      agentId: 'agent-1',
      actionRef: 'pipeline_start',
      connectorBindingId: 'binding-1',
      capabilityId: 'pipeline.start',
      status: 'active',
      sideEffectClass: 'read',
      executionMode: 'sync',
      browserFallbackMode: 'disabled',
      configJson: { branch: 'main' },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const connectorDefinitionsPayload = {
  schemaVersion: 'v1',
  connectorDefinitions: [
    {
      connectorDefinitionId: 'connector-def-1',
      workspaceId: 'workspace-1',
      connectorKey: 'ci_pipeline',
      name: 'CI Pipeline',
      description: 'Build and release connector',
      status: 'active',
      catalogJson: {
        actions: [],
        events: [],
      },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const connectorDefinitionDetailPayload = {
  schemaVersion: 'v1',
  connectorDefinition: connectorDefinitionsPayload.connectorDefinitions[0],
};

const connectorBindingsPayload = {
  schemaVersion: 'v1',
  connectorBindings: [
    {
      connectorBindingId: 'binding-1',
      workspaceId: 'workspace-1',
      connectorDefinitionId: 'connector-def-1',
      name: 'CI Pipeline Binding',
      description: 'Primary CI connector',
      status: 'active',
      secretRefId: 'secret-1',
      metadataJson: { region: 'global' },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const connectorBindingDetailPayload = {
  schemaVersion: 'v1',
  connectorBinding: connectorBindingsPayload.connectorBindings[0],
};

const eventSubscriptionsPayload = {
  schemaVersion: 'v1',
  eventSubscriptions: [
    {
      eventSubscriptionId: 'event-sub-1',
      workspaceId: 'workspace-1',
      connectorBindingId: 'binding-1',
      triggerBindingId: 'trigger-1',
      eventType: 'pipeline.completed',
      status: 'active',
      configJson: { branch: 'main' },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const bridgesPayload = {
  schemaVersion: 'v1',
  bridges: [
    {
      bridgeId: 'bridge-1',
      workspaceId: 'workspace-1',
      name: 'External Bridge',
      description: 'Bridge runtime',
      baseUrl: 'https://bridge.example.test',
      serviceId: 'executor-bridge-sample',
      status: 'registered',
      runtimeType: 'external_agent_runtime',
      manifestJson: {
        schemaVersion: 'v1',
        bridgeVersion: '0.1.0',
        runtimeType: 'external_agent_runtime',
        displayName: 'External Bridge',
        callbackMode: 'async_webhook',
        supportsResume: true,
        supportsCancel: true,
        capabilities: [],
      },
      authConfigJson: {},
      callbackConfigJson: {},
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const bridgeDetailPayload = {
  schemaVersion: 'v1',
  bridge: bridgesPayload.bridges[0],
};

const policyBindingsPayload = {
  schemaVersion: 'v1',
  policyBindings: [
    {
      policyBindingId: 'policy-1',
      workspaceId: 'workspace-1',
      policyKind: 'invoke',
      targetType: 'agent_definition',
      targetRef: 'agent-1',
      status: 'active',
      configJson: { allow: ['run'] },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const secretRefsPayload = {
  schemaVersion: 'v1',
  secretRefs: [
    {
      secretRefId: 'secret-1',
      workspaceId: 'workspace-1',
      environmentScope: 'dev',
      providerType: 'env',
      status: 'active',
      metadataJson: { envKey: 'CI_TOKEN' },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const scopeGrantsPayload = {
  schemaVersion: 'v1',
  scopeGrants: [
    {
      scopeGrantId: 'scope-1',
      workspaceId: 'workspace-1',
      targetType: 'connector_binding',
      targetRef: 'binding-1',
      resourceType: 'secret_ref',
      resourceRef: 'secret-1',
      status: 'active',
      scopeJson: { actions: ['invoke_connector'] },
      createdBy: 'console-user-test',
      updatedBy: 'console-user-test',
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const governanceRequestsPayload = {
  schemaVersion: 'v1',
  requests: [
    {
      requestId: 'request-1',
      workspaceId: 'workspace-1',
      requestKind: 'agent_activate',
      targetType: 'agent_definition',
      targetRef: 'agent-1',
      requestedByActorId: 'console-user-test',
      status: 'pending',
      riskLevel: 'R1',
      summary: 'Activate teaching agent',
      desiredStateJson: { activationState: 'active' },
      createdAt: 1,
      updatedAt: 2,
    },
  ],
};

const governanceRequestDetailPayload = {
  schemaVersion: 'v1',
  request: governanceRequestsPayload.requests[0],
  decisions: [],
};

function buildRunListPayload(
  runId: string,
  overrides: Partial<(typeof runListPayload)['runs'][0]> = {},
) {
  return {
    schemaVersion: 'v1' as const,
    runs: [
      {
        ...runListPayload.runs[0],
        runId,
        ...overrides,
      },
    ],
  };
}

function buildRunDetailPayload(
  runId: string,
  overrides: Partial<(typeof runDetailPayload)['run']['run']> = {},
) {
  return {
    schemaVersion: 'v1' as const,
    run: {
      ...runDetailPayload.run,
      run: {
        ...runDetailPayload.run.run,
        runId,
        ...overrides,
      },
      nodeRuns: runDetailPayload.run.nodeRuns.map((nodeRun) => ({
        ...nodeRun,
        runId,
      })),
      approvals: runDetailPayload.run.approvals.map((approval) => ({
        ...approval,
        runId,
      })),
      artifacts: runDetailPayload.run.artifacts.map((artifact) => ({
        ...artifact,
        runId,
      })),
      deliveryTargets: runDetailPayload.run.deliveryTargets.map((target) => ({
        ...target,
        runId,
      })),
    },
    capturedRecipeDrafts: [],
  };
}

function createConsoleFetchMock(override?: FetchRouteHandler) {
  return createFetchMock((input) => {
    const overridden = override?.(input);
    if (overridden !== undefined) {
      return overridden;
    }

    const { url, method } = input;
    if (url.includes('/v1/runs?') && method === 'GET') return runListPayload;
    if (url.endsWith('/v1/runs/run-1') && method === 'GET') return runDetailPayload;
    if (url.endsWith('/v1/runs/run-debug') && method === 'GET') return buildRunDetailPayload('run-debug');
    if (url.endsWith('/v1/runs/run-agent') && method === 'GET') return buildRunDetailPayload('run-agent');
    if (url.endsWith('/v1/approvals/queue') && method === 'GET') return approvalQueuePayload;
    if (url.endsWith('/v1/approvals/approval-1') && method === 'GET') return approvalDetailPayload;
    if (url.endsWith('/v1/artifacts/artifact-2') && method === 'GET') return artifactDetailPayload;
    if (url.endsWith('/v1/artifacts/artifact-1') && method === 'GET') {
      return {
        schemaVersion: 'v1',
        artifact: runDetailPayload.run.artifacts[0],
        typedPayload: { finding: 'A' },
        lineage: { nodeKey: 'teacher_review' },
      };
    }
    if (url.includes('/v1/workflow-drafts?sessionId=') && method === 'GET') return draftListPayload;
    if (url.endsWith('/v1/workflow-drafts') && method === 'GET') return draftListPayload;
    if (url.includes('/v1/workflow-drafts/draft-1?sessionId=') && method === 'GET') return draftDetailPayload;
    if (url.endsWith('/v1/workflows') && method === 'GET') return templateListPayload;
    if (url.endsWith('/v1/workflows/wf-1') && method === 'GET') return templateDetailPayload;
    if (url.endsWith('/v1/agents') && method === 'GET') return agentListPayload;
    if (url.endsWith('/v1/agents/agent-1') && method === 'GET') return agentDetailPayload;
    if (url.endsWith('/v1/agents/agent-1/trigger-bindings') && method === 'GET') return triggerBindingsPayload;
    if (url.endsWith('/v1/agents/agent-1/action-bindings') && method === 'GET') return actionBindingsPayload;
    if (url.endsWith('/v1/connector-definitions') && method === 'GET') return connectorDefinitionsPayload;
    if (url.endsWith('/v1/connector-definitions/connector-def-1') && method === 'GET') return connectorDefinitionDetailPayload;
    if (url.endsWith('/v1/connector-bindings') && method === 'GET') return connectorBindingsPayload;
    if (url.endsWith('/v1/connector-bindings/binding-1') && method === 'GET') return connectorBindingDetailPayload;
    if (url.endsWith('/v1/event-subscriptions') && method === 'GET') return eventSubscriptionsPayload;
    if (url.endsWith('/v1/event-subscriptions/event-sub-1') && method === 'GET') {
      return {
        schemaVersion: 'v1',
        eventSubscription: eventSubscriptionsPayload.eventSubscriptions[0],
      };
    }
    if (url.endsWith('/v1/bridge-registrations') && method === 'GET') return bridgesPayload;
    if (url.endsWith('/v1/bridge-registrations/bridge-1') && method === 'GET') return bridgeDetailPayload;
    if (url.endsWith('/v1/policy-bindings') && method === 'GET') return policyBindingsPayload;
    if (url.endsWith('/v1/secret-refs') && method === 'GET') return secretRefsPayload;
    if (url.endsWith('/v1/scope-grants') && method === 'GET') return scopeGrantsPayload;
    if (url.endsWith('/v1/governance-change-requests') && method === 'GET') return governanceRequestsPayload;
    if (url.endsWith('/v1/governance-change-requests/request-1') && method === 'GET') return governanceRequestDetailPayload;
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

describe('control console', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    window.localStorage.setItem('ua-control-console.session-id', 'console-session-test');
    window.localStorage.setItem('ua-control-console.user-id', 'console-user-test');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('renders smoke routes for the six primary operator domains', async () => {
    global.fetch = createConsoleFetchMock() as typeof fetch;

    const templatesView = renderRoute('/templates');
    expect(await screen.findByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    templatesView.unmount();

    const studioView = renderRoute('/studio');
    expect(await screen.findByRole('heading', { name: 'Workflow Studio' })).toBeInTheDocument();
    studioView.unmount();

    const agentsView = renderRoute('/agents');
    expect(await screen.findByRole('heading', { name: 'Agents' })).toBeInTheDocument();
    agentsView.unmount();

    const capabilitiesView = renderRoute('/capabilities');
    expect(await screen.findByRole('heading', { name: 'Capabilities' })).toBeInTheDocument();
    capabilitiesView.unmount();

    const governanceView = renderRoute('/governance');
    expect(await screen.findByRole('heading', { name: 'Governance' })).toBeInTheDocument();
    governanceView.unmount();

    renderRoute('/runs');
    expect(await screen.findByRole('heading', { name: 'Runboard' })).toBeInTheDocument();
  });

  it('launches a debug run from templates and navigates to run detail', async () => {
    const debugRunListPayload = buildRunListPayload('run-debug', {
      startMode: 'manual',
      status: 'waiting_approval',
    });
    const debugRunCommandPayload = {
      schemaVersion: 'v1',
      run: buildRunDetailPayload('run-debug', {
        templateVersionId: 'ver-1',
      }).run,
      events: [],
      capturedRecipeDrafts: [],
    };
    const fetchMock = createConsoleFetchMock(({ url, method, body }) => {
      if (url.endsWith('/v1/runs') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          sessionId: 'console-session-test',
          userId: 'console-user-test',
          workflowTemplateVersionId: 'ver-1',
          inputText: 'Use template debug start',
          inputPayload: { subjectRef: 'case-1' },
        });
        return debugRunCommandPayload;
      }
      if (url.includes('/v1/runs?') && method === 'GET') {
        return debugRunListPayload;
      }
      return undefined;
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/templates/wf-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Debug run launch' });
    await user.type(screen.getByLabelText('Input text'), 'Use template debug start');
    fireEvent.change(screen.getByLabelText('Input payload JSON'), {
      target: { value: '{"subjectRef":"case-1"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Start debug run' }));

    expect(await screen.findByRole('heading', { name: 'Runboard' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/runs'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/runs/run-debug'),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  it('creates an agent, activates it, and starts a production run', async () => {
    const createdAgent = {
      ...agentListPayload.agents[0],
      agentId: 'agent-2',
      templateVersionRef: 'ver-1',
      name: 'Promoted Teaching Agent',
      activationState: 'pending',
    };
    const createdAgentResponse = {
      schemaVersion: 'v1',
      agent: createdAgent,
    };
    const activatedAgentResponse = {
      schemaVersion: 'v1',
      agent: {
        ...createdAgent,
        activationState: 'approved',
      },
    };
    const productionRunListPayload = buildRunListPayload('run-agent');
    const productionRunCommandPayload = {
      schemaVersion: 'v1',
      run: buildRunDetailPayload('run-agent', {
        templateVersionId: 'ver-1',
      }).run,
      events: [],
      capturedRecipeDrafts: [],
    };
    const fetchMock = createConsoleFetchMock(({ url, method, body }) => {
      if (url.endsWith('/v1/agents') && method === 'GET') {
        return {
          ...agentListPayload,
          agents: [...agentListPayload.agents, createdAgent],
        };
      }
      if (url.endsWith('/v1/agents') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          createdBy: 'console-user-test',
          templateVersionRef: 'ver-1',
          name: 'Promoted Teaching Agent',
          workspaceId: 'workspace-1',
        });
        return createdAgentResponse;
      }
      if (url.endsWith('/v1/agents/agent-2') && method === 'GET') return createdAgentResponse;
      if (url.endsWith('/v1/agents/agent-2/trigger-bindings') && method === 'GET') {
        return { schemaVersion: 'v1', triggerBindings: [] };
      }
      if (url.endsWith('/v1/agents/agent-2/action-bindings') && method === 'GET') {
        return { schemaVersion: 'v1', actionBindings: [] };
      }
      if (url.endsWith('/v1/agents/agent-2/activate') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          userId: 'console-user-test',
          summary: 'Activate via test',
        });
        return activatedAgentResponse;
      }
      if (url.endsWith('/v1/agents/agent-2/runs') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          sessionId: 'console-session-test',
          userId: 'console-user-test',
          inputText: 'Production start from agent',
          inputPayload: { subjectRef: 'case-1' },
        });
        return productionRunCommandPayload;
      }
      if (url.includes('/v1/runs?') && method === 'GET') {
        return productionRunListPayload;
      }
      return undefined;
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/agents/from-template/ver-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Create agent' });
    await user.type(screen.getByLabelText('Name'), 'Promoted Teaching Agent');
    await user.click(screen.getByRole('button', { name: 'Create agent' }));

    expect(await screen.findByRole('heading', { name: 'Lifecycle' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Summary'), 'Activate via test');
    await user.click(screen.getByRole('button', { name: 'Activate' }));
    await user.type(screen.getByLabelText('Input text'), 'Production start from agent');
    fireEvent.change(screen.getByLabelText('Input payload JSON'), {
      target: { value: '{"subjectRef":"case-1"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Start production run' }));

    expect(await screen.findByRole('heading', { name: 'Runboard' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/agents/agent-2/activate'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/agents/agent-2/runs'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('creates a connector definition and activates a bridge from capabilities', async () => {
    const connectorDefinitionResponse = {
      schemaVersion: 'v1',
      connectorDefinition: {
        ...connectorDefinitionsPayload.connectorDefinitions[0],
        connectorDefinitionId: 'connector-def-2',
        connectorKey: 'calendar_sync',
        name: 'Calendar Sync',
      },
    };
    const activatedBridgeResponse = {
      schemaVersion: 'v1',
      bridge: {
        ...bridgesPayload.bridges[0],
        status: 'active',
      },
    };
    const fetchMock = createConsoleFetchMock(({ url, method, body }) => {
      if (url.endsWith('/v1/connector-definitions') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          userId: 'console-user-test',
          workspaceId: 'workspace-1',
          connectorKey: 'calendar_sync',
          name: 'Calendar Sync',
        });
        return connectorDefinitionResponse;
      }
      if (url.endsWith('/v1/connector-definitions/connector-def-2') && method === 'GET') {
        return connectorDefinitionResponse;
      }
      if (url.endsWith('/v1/bridge-registrations/bridge-1/activate') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          userId: 'console-user-test',
          summary: 'Bring bridge online',
        });
        return activatedBridgeResponse;
      }
      return undefined;
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/capabilities');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Connector definitions' });
    await user.type(screen.getByLabelText('Connector key'), 'calendar_sync');
    await user.type(
      screen.getByLabelText('Name', { selector: 'input#connector-definition-name' }),
      'Calendar Sync',
    );
    await user.click(screen.getByRole('button', { name: 'Create connector definition' }));
    expect(await screen.findByText('Created connector definition connector-def-2')).toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Summary', { selector: 'input#bridge-lifecycle-summary' }),
      'Bring bridge online',
    );
    await user.click(screen.getByRole('button', { name: 'Activate' }));
    expect(await screen.findByText(/activated bridge bridge-1/i)).toBeInTheDocument();
  });

  it('creates and decides governance requests from the governance surface', async () => {
    const createdRequestResponse = {
      schemaVersion: 'v1',
      request: {
        ...governanceRequestsPayload.requests[0],
        requestId: 'request-2',
        summary: 'Expand connector access',
      },
    };
    const approvedDecisionResponse = {
      schemaVersion: 'v1',
      request: {
        ...governanceRequestsPayload.requests[0],
        status: 'approved',
      },
      decision: {
        decisionId: 'decision-approve-1',
        requestId: 'request-1',
        actorRef: 'console-user-test',
        decision: 'approve',
        comment: 'approved in test',
        decidedAt: 3,
      },
    };
    const rejectedDecisionResponse = {
      schemaVersion: 'v1',
      request: {
        ...governanceRequestsPayload.requests[0],
        status: 'rejected',
      },
      decision: {
        decisionId: 'decision-reject-1',
        requestId: 'request-1',
        actorRef: 'console-user-test',
        decision: 'reject',
        comment: 'rejected in test',
        decidedAt: 4,
      },
    };
    const fetchMock = createConsoleFetchMock(({ url, method, body }) => {
      if (url.endsWith('/v1/governance-change-requests') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          workspaceId: 'workspace-1',
          requestKind: 'agent_activate',
          targetType: 'agent_definition',
          targetRef: 'agent-1',
          requestedByActorId: 'console-user-test',
          summary: 'Expand connector access',
        });
        return createdRequestResponse;
      }
      if (url.endsWith('/v1/governance-change-requests/request-1/approve') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          actorRef: 'console-user-test',
          comment: 'approved in test',
        });
        return approvedDecisionResponse;
      }
      if (url.endsWith('/v1/governance-change-requests/request-1/reject') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          actorRef: 'console-user-test',
          comment: 'rejected in test',
        });
        return rejectedDecisionResponse;
      }
      return undefined;
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/governance/requests/request-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Governance requests' });
    await user.type(
      screen.getByLabelText('Target ref', { selector: 'input#request-target-ref' }),
      'agent-1',
    );
    await user.type(
      screen.getByLabelText('Summary', { selector: 'input#request-summary' }),
      'Expand connector access',
    );
    await user.click(screen.getByRole('button', { name: 'Create governance request' }));

    await user.clear(screen.getByLabelText('Comment', { selector: 'input#decision-comment' }));
    await user.type(
      screen.getByLabelText('Comment', { selector: 'input#decision-comment' }),
      'approved in test',
    );
    await user.click(screen.getByRole('button', { name: 'Approve request' }));
    await user.clear(screen.getByLabelText('Comment', { selector: 'input#decision-comment' }));
    await user.type(
      screen.getByLabelText('Comment', { selector: 'input#decision-comment' }),
      'rejected in test',
    );
    await user.click(screen.getByRole('button', { name: 'Reject request' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/governance-change-requests'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/governance-change-requests/request-1/approve'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/governance-change-requests/request-1/reject'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('loads run artifact detail on demand through the artifact endpoint', async () => {
    const fetchMock = createFetchMock(({ url, method }) => {
      if (url.includes('/v1/runs?') && method === 'GET') return runListPayload;
      if (url.endsWith('/v1/runs/run-1') && method === 'GET') return runDetailPayload;
      if (url.endsWith('/v1/artifacts/artifact-2') && method === 'GET') return artifactDetailPayload;
      throw new Error(`unexpected request ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/runs/run-1');
    await screen.findByRole('heading', { name: 'Artifacts' });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Inspect detail' })[1]);

    expect(await screen.findByText(/ready_for_release/)).toBeInTheDocument();
    expect(await screen.findByText(/summarize_delivery/)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/artifacts/artifact-2'),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  it('submits approval decisions through the explicit decision endpoint', async () => {
    const fetchMock = createFetchMock(({ url, method, body }) => {
      if (url.endsWith('/v1/approvals/queue') && method === 'GET') return approvalQueuePayload;
      if (url.endsWith('/v1/approvals/approval-1') && method === 'GET') return approvalDetailPayload;
      if (url.endsWith('/v1/approvals/approval-1/decision') && method === 'POST') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          userId: 'console-user-test',
          decision: 'approved',
        });
        return {
          schemaVersion: 'v1',
          approval: {
            ...approvalDetailPayload.approval,
            status: 'approved',
          },
          decision: {
            approvalDecisionId: 'decision-1',
            approvalRequestId: 'approval-1',
            decision: 'approved',
            decidedActorId: 'console-user-test',
            createdAt: 3,
          },
          run: runDetailPayload.run,
          events: [],
          capturedRecipeDrafts: [],
        };
      }
      throw new Error(`unexpected request ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/approvals/approval-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Decision action' });
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/approvals/approval-1/decision'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('patches a draft section and publishes the draft from studio', async () => {
    const fetchMock = createFetchMock(({ url, method, body }) => {
      if (url.includes('/v1/workflow-drafts?sessionId=') && method === 'GET') return draftListPayload;
      if (url.includes('/v1/workflow-drafts/draft-1?sessionId=') && method === 'GET') return draftDetailPayload;
      if (url.endsWith('/v1/workflow-drafts/draft-1/spec') && method === 'PATCH') {
        expect(body).toMatchObject({
          schemaVersion: 'v1',
          sessionId: 'console-session-test',
          userId: 'console-user-test',
          baseRevisionId: 'rev-2',
        });
        return {
          schemaVersion: 'v1',
          draft: {
            ...draftDetailPayload.draft,
            name: 'Draft One Updated',
          },
          revision: {
            revisionId: 'rev-3',
            draftId: 'draft-1',
            revisionNumber: 3,
            source: 'console_edit',
            actorId: 'console-user-test',
            changeSummary: 'Updated draft metadata from workflow studio',
            specSnapshot: {
              ...draftDetailPayload.draft.currentSpec,
              name: 'Draft One Updated',
            },
            createdAt: 3,
          },
          sessionDrafts: draftListPayload.drafts,
          sessionLinks: draftListPayload.sessionLinks,
        };
      }
      if (url.endsWith('/v1/workflow-drafts/draft-1/validate') && method === 'POST') {
        return {
          schemaVersion: 'v1',
          draft: {
            ...draftDetailPayload.draft,
            publishable: true,
            latestValidationSummary: {
              isPublishable: true,
              errors: [],
              warnings: [],
              checkedAt: 4,
            },
          },
          revision: draftDetailPayload.revisions[1],
          sessionDrafts: draftListPayload.drafts,
          sessionLinks: draftListPayload.sessionLinks,
        };
      }
      if (url.endsWith('/v1/workflow-drafts/draft-1/publish') && method === 'POST') {
        return {
          schemaVersion: 'v1',
          draft: {
            ...draftDetailPayload.draft,
            status: 'published',
          },
          workflow: {
            workflowId: 'wf-1',
            workflowKey: 'draft-key',
            name: 'Draft One Updated',
            status: 'active',
            createdAt: 1,
            updatedAt: 5,
          },
          version: {
            templateVersionId: 'ver-2',
            workflowId: 'wf-1',
            workflowKey: 'draft-key',
            version: 2,
            status: 'published',
            spec: draftDetailPayload.draft.currentSpec,
            createdAt: 5,
          },
          sessionDrafts: draftListPayload.drafts,
          sessionLinks: draftListPayload.sessionLinks,
        };
      }
      throw new Error(`unexpected request ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/studio/draft-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Metadata patch' });
    const nameInput = screen.getByLabelText('Name', { selector: '#metadata-name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Draft One Updated');
    await user.click(screen.getByRole('button', { name: 'Save metadata' }));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/workflow-drafts/draft-1/spec'),
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/workflow-drafts/draft-1/publish'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows a field error instead of throwing when graph json is invalid', async () => {
    const fetchMock = createFetchMock(({ url, method }) => {
      if (url.includes('/v1/workflow-drafts?sessionId=') && method === 'GET') return draftListPayload;
      if (url.includes('/v1/workflow-drafts/draft-1?sessionId=') && method === 'GET') return draftDetailPayload;
      throw new Error(`unexpected request ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute('/studio/draft-1');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Graph patch' });
    const nodesInput = screen.getByLabelText('Nodes JSON');
    fireEvent.change(nodesInput, { target: { value: '{}' } });
    await user.click(screen.getByRole('button', { name: 'Save graph' }));

    expect(await screen.findByText('nodes JSON must be an array')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/workflow-drafts/draft-1/spec')),
    ).toBe(false);
  });

  it('falls back to polling when the SSE stream errors', async () => {
    render(
      <ControlConsoleProviders eventSourceFactory={(url) => new FakeEventSource(url)}>
        <StreamProbe />
      </ControlConsoleProviders>,
    );
    expect(await screen.findByText('mode:connecting')).toBeInTheDocument();

    await act(async () => {
      FakeEventSource.instances[0]?.emitError();
    });
    await waitFor(() => {
      expect(screen.getByText('mode:polling')).toBeInTheDocument();
      expect(screen.getByText('interval:7500')).toBeInTheDocument();
    });
  });

  it('falls back to polling when the SSE stream goes stale and then retries', async () => {
    vi.useFakeTimers();
    render(
      <ControlConsoleProviders eventSourceFactory={(url) => new FakeEventSource(url)}>
        <StreamProbe />
      </ControlConsoleProviders>,
    );
    expect(screen.getByText('mode:connecting')).toBeInTheDocument();

    await act(async () => {
      FakeEventSource.instances[0]?.emitOpen();
    });
    expect(screen.getByText('mode:sse')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTROL_CONSOLE_STREAM_STALE_MS + 1);
    });
    expect(screen.getByText('mode:polling')).toBeInTheDocument();
    expect(screen.getByText('interval:7500')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTROL_CONSOLE_STREAM_RETRY_MS + 1);
    });
    expect(FakeEventSource.instances.length).toBeGreaterThan(1);
  }, 15_000);
});
