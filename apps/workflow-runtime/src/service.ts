import { Pool } from 'pg';

import type {
  ContextPackage,
  InteractionEvent,
  UserInteraction,
  UnifiedUserInput,
} from '@baseinterface/contracts';
import type { CompatExecutorClient } from '@baseinterface/executor-sdk';
import type {
  WorkflowApprovalDecisionRecord,
  WorkflowApprovalRequestRecord,
  WorkflowArtifactRecord,
  WorkflowCommandResponse,
  WorkflowFormalEvent,
  WorkflowNodeRunRecord,
  WorkflowNodeSpec,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowTemplateSpec,
} from '@baseinterface/workflow-contracts';
import { isWorkflowNodeTerminal, isWorkflowRunTerminal } from '@baseinterface/workflow-contracts';
import { createLogger, serializeError } from '@baseinterface/shared';
import type { InternalRunState, RuntimeStore } from './store';

type RuntimeServiceDeps = {
  store: RuntimeStore;
  compatExecutorClient: CompatExecutorClient;
  databaseUrl?: string;
  now: () => number;
  uuid: () => string;
};

const logger = createLogger({ service: 'workflow-runtime' });

function buildContextPackage(run: WorkflowRunRecord): ContextPackage {
  return {
    schemaVersion: 'v0',
    user: {
      userId: run.userId,
    },
    profileSnapshot: {
      displayName: run.userId,
    },
    profileRef: `profile:${run.userId}`,
    permissions: ['context:read'],
    session: {
      sessionId: run.sessionId,
      recentEventsCursor: 0,
    },
  };
}

function findNode(spec: WorkflowTemplateSpec, nodeKey: string): WorkflowNodeSpec {
  const node = spec.nodes.find((item) => item.nodeKey === nodeKey);
  if (!node) {
    throw new Error(`workflow node not found: ${nodeKey}`);
  }
  return node;
}

function cloneSnapshot(state: InternalRunState): WorkflowRunSnapshot {
  return {
    run: { ...state.run },
    nodeRuns: state.nodeRuns.map((item) => ({ ...item })),
    approvals: state.approvals.map((item) => ({ ...item })),
    artifacts: state.artifacts.map((item) => ({ ...item })),
  };
}

export class WorkflowRuntimeService {
  private readonly store: RuntimeStore;

  private readonly compatExecutorClient: CompatExecutorClient;

  private readonly now: () => number;

  private readonly uuid: () => string;

  private readonly outboxPool?: Pool;

  constructor(deps: RuntimeServiceDeps) {
    this.store = deps.store;
    this.compatExecutorClient = deps.compatExecutorClient;
    this.now = deps.now;
    this.uuid = deps.uuid;
    if (deps.databaseUrl) {
      this.outboxPool = new Pool({ connectionString: deps.databaseUrl });
    }
  }

  async close(): Promise<void> {
    if (this.outboxPool) {
      await this.outboxPool.end();
    }
  }

  async startRun(request: WorkflowRuntimeStartRunRequest): Promise<WorkflowCommandResponse> {
    const timestamp = this.now();
    const run: WorkflowRunRecord = {
      runId: this.uuid(),
      workflowId: request.template.workflowId,
      workflowKey: request.template.workflowKey,
      templateVersionId: request.version.templateVersionId,
      compatProviderId: request.template.compatProviderId,
      status: 'created',
      sessionId: request.sessionId,
      userId: request.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const state = this.store.createRun({
      template: request.template,
      version: request.version,
      run,
      nodeRuns: [],
      approvals: [],
      decisions: [],
      artifacts: [],
    });

    const events = await this.advanceToNode(
      state,
      request.version.spec.entryNode,
      request.traceId,
      {
        text: request.inputText,
        payload: request.inputPayload,
      },
      new Set<string>(),
      false,
    );
    this.store.saveRun(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      run: cloneSnapshot(state),
      events,
    };
  }

  async resumeRun(request: WorkflowRuntimeResumeRunRequest): Promise<WorkflowCommandResponse> {
    const state = this.store.getRun(request.runId);
    if (!state) {
      throw new Error(`workflow run not found: ${request.runId}`);
    }

    const current = state.nodeRuns.find((item) => item.nodeRunId === state.run.currentNodeRunId);
    if (!current) {
      throw new Error(`workflow run missing current node: ${request.runId}`);
    }

    let events: WorkflowFormalEvent[] = [];
    if (current.nodeType === 'approval_gate') {
      events = await this.resumeApprovalGate(state, current, request.traceId, request.actionId);
    } else {
      events = await this.resumeExecutorNode(state, current, request.traceId, request);
    }

    this.store.saveRun(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      run: cloneSnapshot(state),
      events,
    };
  }

  listApprovals(): WorkflowApprovalRequestRecord[] {
    return this.store.listApprovals();
  }

  getArtifact(artifactId: string) {
    return this.store.getArtifact(artifactId);
  }

  getRun(runId: string): WorkflowRunSnapshot | undefined {
    return this.store.snapshot(runId);
  }

  private async advanceToNode(
    state: InternalRunState,
    nodeKey: string,
    traceId: string,
    initialInput: { text?: string; payload?: Record<string, unknown> },
    visited: Set<string>,
    fromResume: boolean,
  ): Promise<WorkflowFormalEvent[]> {
    if (visited.has(nodeKey)) {
      state.run.status = 'failed';
      state.run.updatedAt = this.now();
      return [
        this.buildRunStateEvent(traceId, state.run, 'failed'),
      ];
    }
    visited.add(nodeKey);

    const node = findNode(state.version.spec, nodeKey);
    const nodeRun: WorkflowNodeRunRecord = {
      nodeRunId: this.uuid(),
      runId: state.run.runId,
      nodeKey,
      nodeType: node.nodeType,
      status: 'running',
      executorId: node.executorId,
      attempt: 1,
      inputJson: initialInput.payload || (initialInput.text ? { text: initialInput.text } : undefined),
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.nodeRuns.push(nodeRun);
    state.run.currentNodeRunId = nodeRun.nodeRunId;
    state.run.status = 'running';
    state.run.updatedAt = this.now();

    const events: WorkflowFormalEvent[] = [
      this.buildRunStateEvent(traceId, state.run, 'running'),
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'running'),
    ];

    if (node.nodeType === 'end') {
      nodeRun.status = 'completed';
      nodeRun.updatedAt = this.now();
      state.run.status = 'completed';
      state.run.updatedAt = this.now();
      state.run.completedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
      return events;
    }

    if (node.nodeType === 'approval_gate') {
      const approval = this.createApprovalRequest(state, nodeRun);
      nodeRun.status = 'waiting_approval';
      nodeRun.updatedAt = this.now();
      state.run.status = 'waiting_approval';
      state.run.updatedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'waiting_approval'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_approval'));
      events.push({
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: this.now(),
        kind: 'approval_requested',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          nodeRunId: nodeRun.nodeRunId,
          taskId: approval.approvalRequestId,
          prompt: '等待审批后继续执行。',
        },
      });
      return events;
    }

    const compatEvents = fromResume
      ? []
      : await this.invokeExecutor(state, node, traceId, initialInput.text, initialInput.payload);
    if (fromResume) {
      return events;
    }
    const translated = await this.consumeCompatEvents(state, nodeRun, traceId, compatEvents, visited);
    return [...events, ...translated];
  }

  private async resumeApprovalGate(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    actionId: string,
  ): Promise<WorkflowFormalEvent[]> {
    const approval = state.approvals.find((item) => item.nodeRunId === nodeRun.nodeRunId && item.status === 'pending');
    if (!approval) {
      throw new Error(`approval request not found for node ${nodeRun.nodeRunId}`);
    }

    const approved = actionId.includes('approve');
    const decision: WorkflowApprovalDecisionRecord = {
      approvalDecisionId: this.uuid(),
      approvalRequestId: approval.approvalRequestId,
      decision: approved ? 'approved' : 'rejected',
      decidedActorId: state.run.userId,
      createdAt: this.now(),
    };
    state.decisions.push(decision);
    approval.status = approved ? 'approved' : 'rejected';
    approval.updatedAt = this.now();

    const events: WorkflowFormalEvent[] = [
      {
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: this.now(),
        kind: 'approval_decided',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          decision: decision.decision,
        },
      },
    ];

    if (!approved) {
      nodeRun.status = 'failed';
      nodeRun.updatedAt = this.now();
      state.run.status = 'failed';
      state.run.updatedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'failed'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'failed'));
      return events;
    }

    nodeRun.status = 'completed';
    nodeRun.updatedAt = this.now();
    events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
    const nextNode = findNode(state.version.spec, nodeRun.nodeKey).transitions?.approved
      || findNode(state.version.spec, nodeRun.nodeKey).transitions?.success;
    if (!nextNode) {
      state.run.status = 'completed';
      state.run.updatedAt = this.now();
      state.run.completedAt = this.now();
      events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
      return events;
    }
    const tail = await this.advanceToNode(state, nextNode, traceId, {}, new Set<string>([nodeRun.nodeKey]), false);
    return [...events, ...tail];
  }

  private async resumeExecutorNode(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<WorkflowFormalEvent[]> {
    const node = findNode(state.version.spec, nodeRun.nodeKey);
    const compatEvents = await this.interactExecutor(state, nodeRun, node, traceId, request);
    nodeRun.attempt += 1;
    nodeRun.updatedAt = this.now();
    return this.consumeCompatEvents(state, nodeRun, traceId, compatEvents, new Set<string>([nodeRun.nodeKey]));
  }

  private async invokeExecutor(
    state: InternalRunState,
    node: WorkflowNodeSpec,
    traceId: string,
    inputText?: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<InteractionEvent[]> {
    if (!node.executorId) {
      throw new Error(`executor node missing executorId: ${node.nodeKey}`);
    }
    const executor = this.compatExecutorClient.getExecutorEntry(node.executorId);
    if (!executor) {
      throw new Error(`executor not found: ${node.executorId}`);
    }

    const input: UnifiedUserInput = {
      schemaVersion: 'v0',
      traceId,
      userId: state.run.userId,
      sessionId: state.run.sessionId,
      source: 'app',
      text: inputText,
      raw: inputPayload,
      timestampMs: this.now(),
    };
    return this.compatExecutorClient.invoke({
      executor,
      input,
      context: buildContextPackage(state.run),
      runId: state.run.runId,
    });
  }

  private async interactExecutor(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<InteractionEvent[]> {
    if (!node.executorId) {
      throw new Error(`executor node missing executorId: ${node.nodeKey}`);
    }
    const executor = this.compatExecutorClient.getExecutorEntry(node.executorId);
    if (!executor) {
      throw new Error(`executor not found: ${node.executorId}`);
    }

    const interaction: UserInteraction = {
      schemaVersion: 'v0',
      traceId,
      sessionId: state.run.sessionId,
      userId: state.run.userId,
      providerId: state.run.compatProviderId,
      runId: state.run.runId,
      actionId: request.actionId,
      payload: request.payload,
      replyToken: request.replyToken,
      inReplyTo: request.taskId
        ? {
            providerId: state.run.compatProviderId,
            runId: state.run.runId,
            taskId: request.taskId,
            questionId: nodeRun.questionId,
          }
        : undefined,
      timestampMs: this.now(),
    };

    return this.compatExecutorClient.interact({
      executor,
      interaction,
      context: buildContextPackage(state.run),
    });
  }

  private async consumeCompatEvents(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    compatEvents: InteractionEvent[],
    visited: Set<string>,
  ): Promise<WorkflowFormalEvent[]> {
    const events: WorkflowFormalEvent[] = [];
    const node = findNode(state.version.spec, nodeRun.nodeKey);

    for (const compatEvent of compatEvents) {
      if (compatEvent.type !== 'provider_extension') {
        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'compat_interaction',
          payload: {
            interaction: compatEvent,
          },
        });
        continue;
      }

      if (compatEvent.extensionKind === 'task_question') {
        nodeRun.status = 'waiting_input';
        nodeRun.taskId = compatEvent.payload.taskId;
        nodeRun.questionId = compatEvent.payload.questionId;
        nodeRun.replyToken = compatEvent.payload.replyToken;
        nodeRun.waitKey = compatEvent.payload.replyToken;
        nodeRun.compatTaskState = 'collecting';
        nodeRun.updatedAt = this.now();
        state.run.status = 'waiting_input';
        state.run.updatedAt = this.now();
        events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_input'));
        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'waiting_input',
          payload: {
            nodeRunId: nodeRun.nodeRunId,
            nodeKey: nodeRun.nodeKey,
            taskId: compatEvent.payload.taskId,
            questionId: compatEvent.payload.questionId,
            replyToken: compatEvent.payload.replyToken,
            prompt: compatEvent.payload.prompt,
            answerSchema: compatEvent.payload.answerSchema,
            uiSchema: compatEvent.payload.uiSchema,
            metadata: compatEvent.payload.metadata,
          },
        });
        continue;
      }

      if (compatEvent.extensionKind === 'task_state') {
        nodeRun.taskId = compatEvent.payload.taskId;
        nodeRun.executionPolicy = compatEvent.payload.executionPolicy;
        nodeRun.compatTaskState = compatEvent.payload.state;
        nodeRun.updatedAt = this.now();

        if (compatEvent.payload.state === 'collecting') {
          nodeRun.status = 'waiting_input';
          state.run.status = 'waiting_input';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_input'));
        } else if (compatEvent.payload.state === 'ready') {
          if (compatEvent.payload.executionPolicy === 'auto_execute') {
            const autoEvents = await this.interactExecutor(
              state,
              nodeRun,
              node,
              traceId,
              {
                schemaVersion: 'v1',
                traceId,
                sessionId: state.run.sessionId,
                userId: state.run.userId,
                runId: state.run.runId,
                compatProviderId: state.run.compatProviderId,
                actionId: 'execute_task',
                taskId: compatEvent.payload.taskId,
              },
            );
            const translated = await this.consumeCompatEvents(state, nodeRun, traceId, autoEvents, visited);
            events.push(...translated);
            continue;
          }
          nodeRun.status = 'paused';
          state.run.status = 'paused';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'paused'));
        } else if (compatEvent.payload.state === 'executing') {
          nodeRun.status = 'running';
          state.run.status = 'running';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'running'));
        } else if (compatEvent.payload.state === 'completed') {
          nodeRun.status = 'completed';
          state.run.updatedAt = this.now();
          const artifact = this.createArtifact(state, nodeRun, 'executor_result', {
            taskId: compatEvent.payload.taskId,
            nodeKey: nodeRun.nodeKey,
            metadata: compatEvent.payload.metadata || {},
          });
          const nextNode = node.transitions?.success;
          events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
          events.push({
            schemaVersion: 'v1',
            eventId: this.uuid(),
            traceId,
            runId: state.run.runId,
            compatProviderId: state.run.compatProviderId,
            timestampMs: this.now(),
            kind: 'artifact_created',
            payload: {
              artifactId: artifact.artifactId,
              artifactType: artifact.artifactType,
              state: artifact.state,
            },
          });
          if (nextNode) {
            const tail = await this.advanceToNode(state, nextNode, traceId, {}, visited, false);
            events.push(...tail);
            continue;
          }
          state.run.status = 'completed';
          state.run.completedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
          continue;
        } else if (compatEvent.payload.state === 'failed') {
          nodeRun.status = 'failed';
          state.run.status = 'failed';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'failed'));
        }

        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'node_state',
          payload: {
            nodeRunId: nodeRun.nodeRunId,
            nodeKey: nodeRun.nodeKey,
            nodeType: nodeRun.nodeType,
            status: nodeRun.status,
            compatTaskState: compatEvent.payload.state,
            executionPolicy: compatEvent.payload.executionPolicy,
            taskId: compatEvent.payload.taskId,
            metadata: compatEvent.payload.metadata,
          },
        });
      }
    }

    if (!events.some((event) => event.kind === 'node_state' && event.payload.status && isWorkflowNodeTerminal(event.payload.status))) {
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, nodeRun.status));
    }

    return events;
  }

  private createApprovalRequest(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
  ): WorkflowApprovalRequestRecord {
    const approval: WorkflowApprovalRequestRecord = {
      approvalRequestId: this.uuid(),
      runId: state.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      status: 'pending',
      requestedActorId: state.run.userId,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.approvals.push(approval);
    return approval;
  }

  private createArtifact(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    artifactType: string,
    payloadJson: Record<string, unknown>,
  ): WorkflowArtifactRecord {
    const artifact: WorkflowArtifactRecord = {
      artifactId: this.uuid(),
      runId: state.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      artifactType,
      state: 'validated',
      payloadJson,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.artifacts.push(artifact);
    nodeRun.outputArtifactId = artifact.artifactId;
    nodeRun.updatedAt = this.now();
    return artifact;
  }

  private buildRunStateEvent(
    traceId: string,
    run: WorkflowRunRecord,
    status: WorkflowRunRecord['status'],
  ): WorkflowFormalEvent {
    return {
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId: run.runId,
      compatProviderId: run.compatProviderId,
      timestampMs: this.now(),
      kind: 'run_state',
      payload: { status },
    };
  }

  private buildNodeStateEvent(
    traceId: string,
    run: WorkflowRunRecord,
    nodeRun: WorkflowNodeRunRecord,
    status: WorkflowNodeRunRecord['status'],
  ): WorkflowFormalEvent {
    return {
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId: run.runId,
      compatProviderId: run.compatProviderId,
      timestampMs: this.now(),
      kind: 'node_state',
      payload: {
        nodeRunId: nodeRun.nodeRunId,
        nodeKey: nodeRun.nodeKey,
        nodeType: nodeRun.nodeType,
        status,
        compatTaskState: nodeRun.compatTaskState,
        executionPolicy: nodeRun.executionPolicy,
        taskId: nodeRun.taskId,
        metadata: nodeRun.metadata,
      },
    };
  }

  private async enqueueFormalEvents(
    traceId: string,
    state: InternalRunState,
    events: WorkflowFormalEvent[],
  ): Promise<void> {
    if (!this.outboxPool || events.length === 0 || isWorkflowRunTerminal(state.run.status) === false && events.length === 0) {
      return;
    }
    const payload = {
      schemaVersion: 'v1',
      traceId,
      sessionId: state.run.sessionId,
      userId: state.run.userId,
      compatProviderId: state.run.compatProviderId,
      runId: state.run.runId,
      events,
    };
    try {
      await this.outboxPool.query(
        `
          INSERT INTO outbox_events (event_id, session_id, channel, payload, status, attempts, max_attempts, next_retry_at)
          VALUES ($1, $2, 'workflow_formal_event', $3::jsonb, 'pending', 0, 12, NOW())
        `,
        [this.uuid(), state.run.sessionId, JSON.stringify(payload)],
      );
    } catch (error) {
      logger.warn('workflow runtime outbox enqueue failed', serializeError(error));
    }
  }
}

export function createWorkflowRuntimeService(deps: RuntimeServiceDeps): WorkflowRuntimeService {
  return new WorkflowRuntimeService(deps);
}
