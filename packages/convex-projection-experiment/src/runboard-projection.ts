import { ConvexClient, ConvexHttpClient, type ConnectionState } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import type { WorkflowRunSnapshot, WorkflowRunSummary } from '@baseinterface/workflow-contracts';

export const RUNBOARD_PROJECTION_WINDOW = 40;

export type RunboardProjectionChange = {
  runs: WorkflowRunSummary[];
  connectionState: ConnectionState;
};

export type RunboardProjectionStatus = {
  queryReady: boolean;
  subscriptionReady: boolean;
  lastError?: string;
};

function summarizeDelivery(run: WorkflowRunSnapshot['deliveryTargets']): WorkflowRunSummary['deliverySummary'] {
  return run.reduce((summary, target) => {
    switch (target.status) {
      case 'pending_resolution':
        summary.pendingResolution += 1;
        break;
      case 'ready':
        summary.ready += 1;
        break;
      case 'blocked':
        summary.blocked += 1;
        break;
      case 'delivered':
        summary.delivered += 1;
        break;
      case 'failed':
        summary.failed += 1;
        break;
      case 'cancelled':
        summary.cancelled += 1;
        break;
      default:
        break;
    }
    return summary;
  }, {
    pendingResolution: 0,
    ready: 0,
    blocked: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
  });
}

function deriveBlocker(status: WorkflowRunSnapshot['run']['status']): WorkflowRunSummary['blocker'] {
  if (status === 'waiting_input') return 'waiting_input';
  if (status === 'waiting_approval') return 'waiting_approval';
  if (status === 'failed') return 'failed';
  if (status === 'paused') return 'paused';
  return null;
}

export function buildRunboardProjectionSummary(snapshot: WorkflowRunSnapshot): WorkflowRunSummary {
  const currentNode = snapshot.run.currentNodeRunId
    ? snapshot.nodeRuns.find((item) => item.nodeRunId === snapshot.run.currentNodeRunId)
    : undefined;

  return {
    runId: snapshot.run.runId,
    workflowId: snapshot.run.workflowId,
    workflowKey: snapshot.run.workflowKey,
    templateVersionId: snapshot.run.templateVersionId,
    compatProviderId: snapshot.run.compatProviderId,
    status: snapshot.run.status,
    sessionId: snapshot.run.sessionId,
    userId: snapshot.run.userId,
    createdAt: snapshot.run.createdAt,
    updatedAt: snapshot.run.updatedAt,
    completedAt: snapshot.run.completedAt,
    currentNodeRunId: snapshot.run.currentNodeRunId,
    currentNodeKey: currentNode?.nodeKey,
    currentNodeType: currentNode?.nodeType,
    currentNodeStatus: currentNode?.status,
    blocker: deriveBlocker(snapshot.run.status),
    pendingApprovalCount: snapshot.approvals.filter((item) => item.status === 'pending').length,
    deliverySummary: summarizeDelivery(snapshot.deliveryTargets),
    artifactTypes: [...new Set(snapshot.artifacts.map((item) => item.artifactType))],
    requestedActorIds: [...new Set(
      snapshot.approvals
        .map((item) => item.requestedActorId)
        .filter((item): item is string => Boolean(item)),
    )],
  };
}

function canonicalizeRuns(runs: WorkflowRunSummary[]): WorkflowRunSummary[] {
  return [...runs].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.runId.localeCompare(left.runId);
  });
}

export class ConvexRunboardProjectionClient {
  private readonly queryClient: ConvexHttpClient;

  private readonly subscriptionClient: ConvexClient;

  private lastConnectionState: ConnectionState;

  constructor(url: string) {
    this.queryClient = new ConvexHttpClient(url);
    this.subscriptionClient = new ConvexClient(url);
    this.lastConnectionState = this.subscriptionClient.connectionState();
  }

  async bootstrapRecentRuns(limit: number, runs: WorkflowRunSummary[]): Promise<void> {
    await this.queryClient.mutation(api.runboard.bootstrap, {
      limit,
      projectedAt: Date.now(),
      runs,
    });
  }

  async upsertRunSummary(summary: WorkflowRunSummary): Promise<void> {
    await this.queryClient.mutation(api.runboard.upsert, {
      projectedAt: Date.now(),
      summary,
    });
  }

  async listRecentRuns(limit: number): Promise<WorkflowRunSummary[]> {
    const runs = await this.queryClient.query(api.runboard.listRecent, { limit });
    return canonicalizeRuns(runs as WorkflowRunSummary[]);
  }

  subscribeRecentRuns(
    limit: number,
    callback: (change: RunboardProjectionChange) => void,
    onError?: (error: Error) => void,
  ): () => void {
    let lastRuns: WorkflowRunSummary[] = [];
    let hasRunPayload = false;

    const unsubscribeConnection = this.subscriptionClient.subscribeToConnectionState((state) => {
      this.lastConnectionState = state;
      if (!hasRunPayload) {
        return;
      }
      callback({
        runs: lastRuns,
        connectionState: state,
      });
    });
    const unsubscribeRuns = this.subscriptionClient.onUpdate(
      api.runboard.listRecent,
      { limit },
      (runs) => {
        lastRuns = canonicalizeRuns(runs as WorkflowRunSummary[]);
        hasRunPayload = true;
        callback({
          runs: lastRuns,
          connectionState: this.lastConnectionState,
        });
      },
      (error) => {
        onError?.(error);
      },
    );

    return () => {
      unsubscribeRuns();
      unsubscribeConnection();
    };
  }

  connectionState(): ConnectionState {
    return this.lastConnectionState;
  }

  async close(): Promise<void> {
    await this.subscriptionClient.close();
  }
}
