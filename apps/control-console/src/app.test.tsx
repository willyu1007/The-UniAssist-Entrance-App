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

  it('renders smoke routes for runs, approvals, drafts, and studio', async () => {
    global.fetch = createFetchMock(({ url, method }) => {
      if (url.includes('/v1/runs?') && method === 'GET') return runListPayload;
      if (url.endsWith('/v1/approvals/queue') && method === 'GET') return approvalQueuePayload;
      if (url.endsWith('/v1/workflow-drafts') && method === 'GET') return draftListPayload;
      if (url.includes('/v1/workflow-drafts?sessionId=') && method === 'GET') return draftListPayload;
      throw new Error(`unexpected request ${method} ${url}`);
    });
    const runView = renderRoute('/runs');
    expect(await screen.findByRole('heading', { name: 'Runboard' })).toBeInTheDocument();
    runView.unmount();

    const approvalView = renderRoute('/approvals');
    expect(await screen.findByRole('heading', { name: 'Approval Inbox' })).toBeInTheDocument();
    approvalView.unmount();

    const draftView = renderRoute('/drafts');
    expect(await screen.findByRole('heading', { name: 'Draft Inspector' })).toBeInTheDocument();
    draftView.unmount();

    renderRoute('/studio');
    expect(await screen.findByRole('heading', { name: 'Workflow Studio' })).toBeInTheDocument();
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
