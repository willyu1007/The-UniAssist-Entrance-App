import crypto from 'node:crypto';

import { createLogger } from '@uniassist/shared';
import {
  buildRunboardProjectionSummary,
  ConvexRunboardProjectionClient,
  RUNBOARD_PROJECTION_WINDOW,
  type RunboardProjectionChange,
} from '@uniassist/convex-projection-experiment';
import type { WorkflowConsoleStreamEvent, WorkflowRunListResponse, WorkflowRunSnapshot, WorkflowRunSummary } from '@uniassist/workflow-contracts';
import type { ControlConsoleStreamBroker } from './control-console-stream';
import type { RuntimeClient } from './runtime-client';

const logger = createLogger({ service: 'workflow-platform-api:runboard-projection' });

type ProjectionListFallback = () => Promise<WorkflowRunListResponse>;

function createRunUpdatedEvent(runId: string): WorkflowConsoleStreamEvent {
  return {
    schemaVersion: 'v1',
    eventId: crypto.randomUUID(),
    timestampMs: Date.now(),
    kind: 'run.updated',
    runId,
  };
}

function summarizeRun(run: WorkflowRunSummary): string {
  return JSON.stringify([
    run.updatedAt,
    run.status,
    run.currentNodeRunId || '',
    run.currentNodeKey || '',
    run.pendingApprovalCount,
    run.deliverySummary.pendingResolution,
    run.deliverySummary.ready,
    run.deliverySummary.blocked,
    run.deliverySummary.delivered,
    run.deliverySummary.failed,
    run.deliverySummary.cancelled,
    run.artifactTypes,
    run.requestedActorIds,
  ]);
}

export interface RunboardProjectionAdapter {
  readonly enabled: boolean;
  readonly reason?: string;
  bootstrapRecentRuns(limit: number, runs: WorkflowRunSummary[]): Promise<void>;
  upsertRunSummary(snapshot: WorkflowRunSnapshot): Promise<void>;
  listRecentRuns(limit: number): Promise<WorkflowRunListResponse | null>;
  subscribeRecentRuns(limit: number, onChange: (change: RunboardProjectionChange) => void): () => void;
  dispose(): Promise<void>;
}

class NoopRunboardProjectionAdapter implements RunboardProjectionAdapter {
  readonly enabled = false;

  readonly reason?: string;

  constructor(reason?: string) {
    this.reason = reason;
  }

  async bootstrapRecentRuns(_limit: number, _runs: WorkflowRunSummary[]): Promise<void> {}

  async upsertRunSummary(_snapshot: WorkflowRunSnapshot): Promise<void> {}

  async listRecentRuns(_limit: number): Promise<WorkflowRunListResponse | null> {
    return null;
  }

  subscribeRecentRuns(_limit: number, _onChange: (change: RunboardProjectionChange) => void): () => void {
    return () => undefined;
  }

  async dispose(): Promise<void> {}
}

class ConvexRunboardProjectionAdapter implements RunboardProjectionAdapter {
  readonly enabled = true;

  private readonly client: ConvexRunboardProjectionClient;

  constructor(url: string) {
    this.client = new ConvexRunboardProjectionClient(url);
  }

  async bootstrapRecentRuns(limit: number, runs: WorkflowRunSummary[]): Promise<void> {
    await this.client.bootstrapRecentRuns(limit, runs);
  }

  async upsertRunSummary(snapshot: WorkflowRunSnapshot): Promise<void> {
    await this.client.upsertRunSummary(buildRunboardProjectionSummary(snapshot));
  }

  async listRecentRuns(limit: number): Promise<WorkflowRunListResponse | null> {
    return {
      schemaVersion: 'v1',
      runs: await this.client.listRecentRuns(limit),
    };
  }

  subscribeRecentRuns(limit: number, onChange: (change: RunboardProjectionChange) => void): () => void {
    return this.client.subscribeRecentRuns(limit, onChange, (error) => {
      logger.warn('convex runboard subscription failed', {
        error: error.message,
      });
    });
  }

  async dispose(): Promise<void> {
    await this.client.close();
  }
}

export function createRunboardProjectionAdapter(config: {
  enabled: boolean;
  url?: string;
}): RunboardProjectionAdapter {
  if (!config.enabled) {
    return new NoopRunboardProjectionAdapter('disabled');
  }
  if (!config.url) {
    return new NoopRunboardProjectionAdapter('missing_url');
  }
  try {
    return new ConvexRunboardProjectionAdapter(config.url);
  } catch (error) {
    logger.warn('convex runboard adapter initialization failed, falling back to authoritative mode', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NoopRunboardProjectionAdapter('invalid_url');
  }
}

export class RunboardProjectionController {
  private readonly adapter: RunboardProjectionAdapter;

  private readonly runtimeClient: RuntimeClient;

  private readonly broker?: ControlConsoleStreamBroker;

  private bootstrapped = false;

  private subscriptionHealthy = false;

  private subscriptionStarted = false;

  private hasProjectionBaseline = false;

  private unsubscribe?: () => void;

  private lastProjectionRuns = new Map<string, string>();

  private recoveryPromise?: Promise<void>;

  constructor(deps: {
    adapter: RunboardProjectionAdapter;
    runtimeClient: RuntimeClient;
    broker?: ControlConsoleStreamBroker;
  }) {
    this.adapter = deps.adapter;
    this.runtimeClient = deps.runtimeClient;
    this.broker = deps.broker;
  }

  async start(): Promise<void> {
    if (!this.adapter.enabled) {
      if (this.adapter.reason && this.adapter.reason !== 'disabled') {
        logger.info('runboard projection disabled', {
          reason: this.adapter.reason,
        });
      }
      return;
    }

    await this.ensureBootstrapped();
    if (this.subscriptionStarted) {
      return;
    }
    this.subscriptionStarted = true;
    this.unsubscribe = this.adapter.subscribeRecentRuns(RUNBOARD_PROJECTION_WINDOW, (change) => {
      this.handleProjectionChange(change);
    });
  }

  async close(): Promise<void> {
    this.unsubscribe?.();
    await this.adapter.dispose();
  }

  async listRuns(limit: number | undefined, fallback: ProjectionListFallback): Promise<WorkflowRunListResponse> {
    const effectiveLimit = typeof limit === 'number' ? limit : 25;
    if (!this.adapter.enabled || effectiveLimit > RUNBOARD_PROJECTION_WINDOW) {
      return await fallback();
    }

    if (!(await this.ensureBootstrapped())) {
      return await fallback();
    }

    if (!this.isProjectionReady()) {
      return await fallback();
    }

    try {
      const response = await this.adapter.listRecentRuns(effectiveLimit);
      if (response) {
        return response;
      }
    } catch (error) {
      logger.warn('runboard projection query failed, falling back to authoritative list', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return await fallback();
  }

  async syncRunSnapshot(snapshot: WorkflowRunSnapshot): Promise<boolean> {
    if (!this.adapter.enabled) {
      return false;
    }

    try {
      await this.adapter.upsertRunSummary(snapshot);
      return this.isProjectionReady();
    } catch (error) {
      logger.warn('runboard projection upsert failed, falling back to authoritative run.updated', {
        error: error instanceof Error ? error.message : String(error),
        runId: snapshot.run.runId,
      });
      return false;
    }
  }

  private async ensureBootstrapped(): Promise<boolean> {
    if (!this.adapter.enabled) {
      return false;
    }
    if (this.bootstrapped) {
      return true;
    }

    try {
      const response = await this.runtimeClient.listRuns(RUNBOARD_PROJECTION_WINDOW);
      await this.adapter.bootstrapRecentRuns(RUNBOARD_PROJECTION_WINDOW, response.runs);
      this.bootstrapped = true;
      return true;
    } catch (error) {
      logger.warn('runboard projection bootstrap failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private handleProjectionChange(change: RunboardProjectionChange): void {
    this.subscriptionHealthy = change.connectionState.isWebSocketConnected;
    const nextProjectionRuns = new Map(
      change.runs.map((run) => [run.runId, summarizeRun(run)]),
    );

    if (this.shouldRecoverProjection(nextProjectionRuns)) {
      this.invalidateProjectionState('projection_shrank', {
        previousCount: this.lastProjectionRuns.size,
        nextCount: nextProjectionRuns.size,
      });
      void this.recoverProjection();
      return;
    }

    if (!this.hasProjectionBaseline) {
      this.lastProjectionRuns = nextProjectionRuns;
      this.hasProjectionBaseline = true;
      return;
    }

    if (!this.subscriptionHealthy || !this.broker) {
      this.lastProjectionRuns = nextProjectionRuns;
      return;
    }

    for (const [runId, signature] of nextProjectionRuns) {
      if (this.lastProjectionRuns.get(runId) !== signature) {
        this.broker.publish(createRunUpdatedEvent(runId));
      }
    }
    this.lastProjectionRuns = nextProjectionRuns;
  }

  private isProjectionReady(): boolean {
    return this.bootstrapped && this.subscriptionHealthy && this.hasProjectionBaseline;
  }

  private shouldRecoverProjection(nextProjectionRuns: Map<string, string>): boolean {
    return this.hasProjectionBaseline
      && this.lastProjectionRuns.size > 0
      && nextProjectionRuns.size < this.lastProjectionRuns.size;
  }

  private invalidateProjectionState(
    reason: string,
    context: Record<string, unknown> = {},
  ): void {
    logger.warn('runboard projection invalidated, falling back to authoritative list until recovery completes', {
      reason,
      ...context,
    });
    this.bootstrapped = false;
    this.subscriptionHealthy = false;
    this.hasProjectionBaseline = false;
    this.lastProjectionRuns = new Map();
  }

  private async recoverProjection(): Promise<void> {
    if (this.recoveryPromise) {
      await this.recoveryPromise;
      return;
    }

    this.recoveryPromise = (async () => {
      const recovered = await this.ensureBootstrapped();
      if (!recovered) {
        logger.warn('runboard projection recovery bootstrap failed');
      }
    })().finally(() => {
      this.recoveryPromise = undefined;
    });

    await this.recoveryPromise;
  }
}
