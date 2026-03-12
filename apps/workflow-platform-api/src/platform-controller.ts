import crypto from 'node:crypto';

import type { Request, Response } from 'express';

import type {
  AgentDefinitionCreateRequest,
  AgentDefinitionLifecycleRequest,
  GovernanceChangeDecisionRequest,
  GovernanceChangeRequestCreateRequest,
  PolicyBindingCreateRequest,
  RecipeDraftCreateRequest,
  RecipeDraftUpdateRequest,
  SecretRefCreateRequest,
  TriggerBindingCreateRequest,
  TriggerBindingLifecycleRequest,
  TriggerDispatchRequest,
  WorkflowConsoleStreamEvent,
  WorkflowDraftSpecPatch,
  WorkflowNodeSpec,
  WorkflowRunSnapshot,
  WorkflowApprovalDecisionRequest,
  WorkflowDraftCreateRequest,
  WorkflowDraftFocusRequest,
  WorkflowDraftIntakeRequest,
  WorkflowDraftPublishRequest,
  WorkflowDraftSpecPatchRequest,
  WorkflowResumeRequest,
  WorkflowStartRequest,
} from '@baseinterface/workflow-contracts';
import { isPlatformError, PlatformError } from './platform-errors';
import type { PlatformService } from './platform-service';
import type { ControlConsoleStreamBroker } from './control-console-stream';

const EXECUTOR_STRATEGIES = new Set(['platform_runtime', 'external_runtime']);
const TRIGGER_KINDS = new Set(['schedule', 'webhook', 'event_subscription']);
const POLICY_KINDS = new Set(['approval', 'invoke', 'delivery', 'visibility', 'browser_fallback']);
const GOVERNANCE_TARGET_TYPES = new Set(['agent_definition', 'trigger_binding', 'policy_binding', 'secret_ref', 'scope_grant']);
const GOVERNANCE_RISK_LEVELS = new Set(['R0', 'R1', 'R2']);
const GOVERNANCE_REQUEST_KINDS = new Set([
  'agent_activate',
  'trigger_enable',
  'policy_bind_apply',
  'secret_grant_issue',
  'scope_grant_issue',
  'scope_widen',
  'external_write_allow',
  'agent_suspend',
  'agent_retire',
  'trigger_disable',
  'scope_grant_revoke',
]);

function ensureSchemaVersion(value: unknown): void {
  if (value !== 'v1') {
    throw new PlatformError(400, 'INVALID_SCHEMA_VERSION', 'schemaVersion must be v1');
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlatformError(400, 'INVALID_REQUEST', `${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalPositiveInt(value: unknown): number | undefined {
  const raw = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.trunc(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new PlatformError(400, 'INVALID_REQUEST', 'record fields must be objects');
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new PlatformError(400, 'INVALID_REQUEST', `${field} must be an array`);
  }
  return value.map((item) => requireString(item, field));
}

function requireStringRecord(value: unknown, field: string): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    throw new PlatformError(400, 'INVALID_REQUEST', `${field} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [key, requireString(entryValue, `${field}.${key}`)]),
  );
}

function requireEnum(value: unknown, field: string, allowed: Set<string>): string {
  const next = requireString(value, field);
  if (!allowed.has(next)) {
    throw new PlatformError(400, 'INVALID_REQUEST', `${field} is invalid`);
  }
  return next;
}

function optionalEnum(value: unknown, field: string, allowed: Set<string>): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireEnum(value, field, allowed);
}

function requireNodeSpecArray(value: unknown): WorkflowNodeSpec[] {
  if (!Array.isArray(value)) {
    throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.nodes must be an array');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PlatformError(400, 'INVALID_REQUEST', `patch.value.nodes[${index}] must be an object`);
    }
    const nodeType = requireString(item.nodeType, `patch.value.nodes[${index}].nodeType`);
    if (!['executor', 'approval_gate', 'end'].includes(nodeType)) {
      throw new PlatformError(400, 'INVALID_REQUEST', `patch.value.nodes[${index}].nodeType is invalid`);
    }
    const transitions = item.transitions === undefined
      ? undefined
      : (() => {
          const record = optionalRecord(item.transitions);
          if (!record) return undefined;
          const normalized = Object.fromEntries(
            Object.entries(record).map(([key, next]) => {
              if (next !== undefined && typeof next !== 'string') {
                throw new PlatformError(400, 'INVALID_REQUEST', `patch.value.nodes[${index}].transitions.${key} must be a string`);
              }
              return [key, next];
            }),
          );
          return normalized;
        })();
    return {
      nodeKey: requireString(item.nodeKey, `patch.value.nodes[${index}].nodeKey`),
      nodeType: nodeType as WorkflowNodeSpec['nodeType'],
      executorId: item.executorId === undefined ? undefined : requireString(item.executorId, `patch.value.nodes[${index}].executorId`),
      config: optionalRecord(item.config),
      transitions,
    };
  });
}

function requireDraftSpecPatch(value: unknown): WorkflowDraftSpecPatch {
  if (!isRecord(value)) {
    throw new PlatformError(400, 'INVALID_REQUEST', 'patch must be an object');
  }
  const section = requireString(value.section, 'patch.section');
  const patchValue = value.value;
  if (!isRecord(patchValue)) {
    throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value must be an object');
  }

  if (section === 'metadata') {
    const entryNode = 'entryNode' in patchValue ? patchValue.entryNode : undefined;
    const workflowKey = 'workflowKey' in patchValue ? patchValue.workflowKey : undefined;
    const name = 'name' in patchValue ? patchValue.name : undefined;
    const compatProviderId = 'compatProviderId' in patchValue ? patchValue.compatProviderId : undefined;
    if (workflowKey !== undefined && typeof workflowKey !== 'string') {
      throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.workflowKey must be a string');
    }
    if (name !== undefined && typeof name !== 'string') {
      throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.name must be a string');
    }
    if (compatProviderId !== undefined && typeof compatProviderId !== 'string') {
      throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.compatProviderId must be a string');
    }
    if (entryNode !== undefined && typeof entryNode !== 'string') {
      throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.entryNode must be a string');
    }
    const metadataValue: WorkflowDraftSpecPatch['value'] = {};
    if ('workflowKey' in patchValue) {
      metadataValue.workflowKey = workflowKey as string | undefined;
    }
    if ('name' in patchValue) {
      metadataValue.name = name as string | undefined;
    }
    if ('compatProviderId' in patchValue) {
      metadataValue.compatProviderId = compatProviderId as string | undefined;
    }
    if ('entryNode' in patchValue) {
      metadataValue.entryNode = entryNode as string | undefined;
    }
    return {
      section: 'metadata',
      value: metadataValue,
    };
  }

  if (section === 'requirements') {
    return {
      section: 'requirements',
      value: {
        requirements: requireStringArray(patchValue.requirements, 'patch.value.requirements'),
      },
    };
  }

  if (section === 'nodes') {
    const entryNode = patchValue.entryNode;
    if (entryNode !== undefined && typeof entryNode !== 'string') {
      throw new PlatformError(400, 'INVALID_REQUEST', 'patch.value.entryNode must be a string');
    }
    return {
      section: 'nodes',
      value: {
        entryNode: entryNode as string | undefined,
        nodes: requireNodeSpecArray(patchValue.nodes),
      },
    };
  }

  throw new PlatformError(400, 'INVALID_REQUEST', 'patch.section is invalid');
}

function publishConsoleEvents(
  broker: ControlConsoleStreamBroker | undefined,
  events: WorkflowConsoleStreamEvent[],
): void {
  if (!broker) return;
  for (const event of events) {
    broker.publish(event);
  }
}

function createConsoleEvent(
  kind: WorkflowConsoleStreamEvent['kind'],
  refs: Omit<WorkflowConsoleStreamEvent, 'schemaVersion' | 'eventId' | 'timestampMs' | 'kind'>,
): WorkflowConsoleStreamEvent {
  return {
    schemaVersion: 'v1',
    eventId: crypto.randomUUID(),
    timestampMs: Date.now(),
    kind,
    ...refs,
  };
}

function buildRunConsoleEvents(run: WorkflowRunSnapshot): WorkflowConsoleStreamEvent[] {
  const dedup = new Map<string, WorkflowConsoleStreamEvent>();
  const add = (event: WorkflowConsoleStreamEvent): void => {
    dedup.set(`${event.kind}:${event.runId || ''}:${event.approvalRequestId || ''}:${event.artifactId || ''}`, event);
  };
  add(createConsoleEvent('run.updated', { runId: run.run.runId }));
  for (const approval of run.approvals) {
    add(createConsoleEvent('approval.updated', {
      runId: run.run.runId,
      approvalRequestId: approval.approvalRequestId,
    }));
  }
  for (const artifact of run.artifacts) {
    add(createConsoleEvent('artifact.updated', {
      runId: run.run.runId,
      artifactId: artifact.artifactId,
    }));
  }
  return [...dedup.values()];
}

function handleError(res: Response, error: unknown): void {
  if (isPlatformError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }
  res.status(500).json({
    error: error instanceof Error ? error.message : String(error),
    code: 'INTERNAL_ERROR',
  });
}

export function createPlatformController(
  service: PlatformService,
  controlConsoleBroker?: ControlConsoleStreamBroker,
) {
  return {
    health: (_req: Request, res: Response) => {
      res.json({ ok: true, service: 'workflow-platform-api' });
    },

    directCreateRemoved: (_req: Request, res: Response) => {
      res.status(410).json({
        error: 'workflow direct create has been removed; use draft -> publish',
        code: 'WORKFLOW_DIRECT_CREATE_REMOVED',
      });
    },

    listWorkflows: async (_req: Request, res: Response) => {
      try {
        res.json({
          schemaVersion: 'v1',
          workflows: await service.listWorkflows(),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    getWorkflow: async (req: Request, res: Response) => {
      try {
        res.json({
          schemaVersion: 'v1',
          workflow: await service.getWorkflow(req.params.workflowId),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    startRun: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowStartRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.startRun({
          schemaVersion: 'v1',
          traceId: requireString(body.traceId, 'traceId'),
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          workflowKey: requireString(body.workflowKey, 'workflowKey'),
          templateVersionId: optionalString(body.templateVersionId),
          inputText: optionalString(body.inputText),
          inputPayload: body.inputPayload,
        });
        publishConsoleEvents(controlConsoleBroker, buildRunConsoleEvents(response.run));
        res.status(201).json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    listRuns: async (req: Request, res: Response) => {
      try {
        const limit = optionalPositiveInt(req.query.limit);
        res.json(await service.listRuns(limit));
      } catch (error) {
        handleError(res, error);
      }
    },

    getRun: async (req: Request, res: Response) => {
      try {
        res.json(await service.getRun(req.params.runId));
      } catch (error) {
        handleError(res, error);
      }
    },

    resumeRun: async (req: Request, res: Response) => {
      try {
        const body = req.body as Omit<WorkflowResumeRequest, 'runId'>;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.resumeRun({
          schemaVersion: 'v1',
          traceId: requireString(body.traceId, 'traceId'),
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          runId: requireString(req.params.runId, 'runId'),
          actionId: requireString(body.actionId, 'actionId'),
          replyToken: optionalString(body.replyToken),
          taskId: optionalString(body.taskId),
          payload: body.payload,
        });
        publishConsoleEvents(controlConsoleBroker, buildRunConsoleEvents(response.run));
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    listApprovals: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listApprovals());
      } catch (error) {
        handleError(res, error);
      }
    },

    listApprovalQueue: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listApprovalQueue());
      } catch (error) {
        handleError(res, error);
      }
    },

    getApprovalDetail: async (req: Request, res: Response) => {
      try {
        res.json(await service.getApprovalDetail(req.params.approvalRequestId));
      } catch (error) {
        handleError(res, error);
      }
    },

    decideApproval: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowApprovalDecisionRequest;
        ensureSchemaVersion(body?.schemaVersion);
        if (body.decision !== 'approved' && body.decision !== 'rejected') {
          throw new PlatformError(400, 'INVALID_REQUEST', 'decision must be approved or rejected');
        }
        const response = await service.decideApproval(req.params.approvalRequestId, {
          schemaVersion: 'v1',
          traceId: requireString(body.traceId, 'traceId'),
          userId: requireString(body.userId, 'userId'),
          decision: body.decision,
          comment: optionalString(body.comment),
        });
        publishConsoleEvents(controlConsoleBroker, buildRunConsoleEvents(response.run));
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    getArtifact: async (req: Request, res: Response) => {
      try {
        res.json(await service.getArtifact(req.params.artifactId));
      } catch (error) {
        handleError(res, error);
      }
    },

    createDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.createDraft({
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          workflowKey: optionalString(body.workflowKey),
          name: optionalString(body.name),
          basedOnTemplateVersionId: optionalString(body.basedOnTemplateVersionId),
          source: body.source,
          initialText: optionalString(body.initialText),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.status(201).json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    listDrafts: async (req: Request, res: Response) => {
      try {
        const sessionId = optionalString(req.query.sessionId);
        res.json(await service.listDrafts(sessionId));
      } catch (error) {
        handleError(res, error);
      }
    },

    getDraft: async (req: Request, res: Response) => {
      try {
        const sessionId = optionalString(req.query.sessionId);
        res.json(await service.getDraft(req.params.draftId, sessionId));
      } catch (error) {
        handleError(res, error);
      }
    },

    listDraftRevisions: async (req: Request, res: Response) => {
      try {
        const sessionId = optionalString(req.query.sessionId);
        const response = await service.getDraft(req.params.draftId, sessionId);
        res.json({
          schemaVersion: 'v1',
          revisions: response.revisions,
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    focusDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftFocusRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.focusDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    intakeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftIntakeRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.intakeDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          text: requireString(body.text, 'text'),
          source: body.source,
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    synthesizeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftFocusRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.synthesizeDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    validateDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftFocusRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.validateDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    patchDraftSpec: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftSpecPatchRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.patchDraftSpec(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          baseRevisionId: requireString(body.baseRevisionId, 'baseRevisionId'),
          changeSummary: requireString(body.changeSummary, 'changeSummary'),
          patch: requireDraftSpecPatch(body.patch),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    publishDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftPublishRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.publishDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        });
        publishConsoleEvents(controlConsoleBroker, [
          createConsoleEvent('draft.updated', { draftId: response.draft.draftId }),
        ]);
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    createRecipeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as RecipeDraftCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(201).json({
          schemaVersion: 'v1',
          recipeDraft: await service.createRecipeDraft(body),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    listRecipeDrafts: async (_req: Request, res: Response) => {
      try {
        res.json({
          schemaVersion: 'v1',
          recipeDrafts: await service.listRecipeDrafts(),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    getRecipeDraft: async (req: Request, res: Response) => {
      try {
        res.json({
          schemaVersion: 'v1',
          recipeDraft: await service.getRecipeDraft(req.params.recipeDraftId),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    updateRecipeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as RecipeDraftUpdateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json({
          schemaVersion: 'v1',
          recipeDraft: await service.updateRecipeDraft(req.params.recipeDraftId, body),
        });
      } catch (error) {
        handleError(res, error);
      }
    },

    listAgents: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listAgents());
      } catch (error) {
        handleError(res, error);
      }
    },

    getAgent: async (req: Request, res: Response) => {
      try {
        res.json(await service.getAgent(req.params.agentId));
      } catch (error) {
        handleError(res, error);
      }
    },

    createAgent: async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentDefinitionCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        const response = await service.createAgent({
          schemaVersion: 'v1',
          workspaceId: requireString(body.workspaceId, 'workspaceId'),
          templateVersionRef: requireString(body.templateVersionRef, 'templateVersionRef'),
          name: requireString(body.name, 'name'),
          createdBy: requireString(body.createdBy, 'createdBy'),
          description: optionalString(body.description),
          identityRef: optionalString(body.identityRef),
          executorStrategy: optionalEnum(body.executorStrategy, 'executorStrategy', EXECUTOR_STRATEGIES) as AgentDefinitionCreateRequest['executorStrategy'],
          toolProfile: optionalString(body.toolProfile),
          riskLevel: optionalEnum(body.riskLevel, 'riskLevel', GOVERNANCE_RISK_LEVELS) as AgentDefinitionCreateRequest['riskLevel'],
          ownerActorRef: optionalString(body.ownerActorRef),
        });
        res.status(201).json(response);
      } catch (error) {
        handleError(res, error);
      }
    },

    activateAgent: async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentDefinitionLifecycleRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(202).json(await service.activateAgent(req.params.agentId, {
          schemaVersion: 'v1',
          userId: requireString(body.userId, 'userId'),
          summary: optionalString(body.summary),
          justification: optionalString(body.justification),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    suspendAgent: async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentDefinitionLifecycleRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.suspendAgent(req.params.agentId, {
          schemaVersion: 'v1',
          userId: requireString(body.userId, 'userId'),
          summary: optionalString(body.summary),
          justification: optionalString(body.justification),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    retireAgent: async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentDefinitionLifecycleRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.retireAgent(req.params.agentId, {
          schemaVersion: 'v1',
          userId: requireString(body.userId, 'userId'),
          summary: optionalString(body.summary),
          justification: optionalString(body.justification),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    listTriggerBindings: async (req: Request, res: Response) => {
      try {
        res.json(await service.listTriggerBindings(req.params.agentId));
      } catch (error) {
        handleError(res, error);
      }
    },

    createTriggerBinding: async (req: Request, res: Response) => {
      try {
        const body = req.body as TriggerBindingCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(201).json(await service.createTriggerBinding(req.params.agentId, {
          schemaVersion: 'v1',
          workspaceId: requireString(body.workspaceId, 'workspaceId'),
          userId: requireString(body.userId, 'userId'),
          triggerKind: requireEnum(body.triggerKind, 'triggerKind', TRIGGER_KINDS) as TriggerBindingCreateRequest['triggerKind'],
          configJson: optionalRecord(body.configJson) || {},
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    enableTriggerBinding: async (req: Request, res: Response) => {
      try {
        const body = req.body as TriggerBindingLifecycleRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(202).json(await service.enableTriggerBinding(req.params.triggerBindingId, {
          schemaVersion: 'v1',
          userId: requireString(body.userId, 'userId'),
          summary: optionalString(body.summary),
          justification: optionalString(body.justification),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    disableTriggerBinding: async (req: Request, res: Response) => {
      try {
        const body = req.body as TriggerBindingLifecycleRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.disableTriggerBinding(req.params.triggerBindingId, {
          schemaVersion: 'v1',
          userId: requireString(body.userId, 'userId'),
          summary: optionalString(body.summary),
          justification: optionalString(body.justification),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    listPolicyBindings: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listPolicyBindings());
      } catch (error) {
        handleError(res, error);
      }
    },

    createPolicyBinding: async (req: Request, res: Response) => {
      try {
        const body = req.body as PolicyBindingCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(201).json(await service.createPolicyBinding({
          schemaVersion: 'v1',
          workspaceId: requireString(body.workspaceId, 'workspaceId'),
          userId: requireString(body.userId, 'userId'),
          policyKind: requireEnum(body.policyKind, 'policyKind', POLICY_KINDS) as PolicyBindingCreateRequest['policyKind'],
          targetType: requireEnum(body.targetType, 'targetType', GOVERNANCE_TARGET_TYPES) as PolicyBindingCreateRequest['targetType'],
          targetRef: requireString(body.targetRef, 'targetRef'),
          configJson: optionalRecord(body.configJson) || {},
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    listSecretRefs: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listSecretRefs());
      } catch (error) {
        handleError(res, error);
      }
    },

    createSecretRef: async (req: Request, res: Response) => {
      try {
        const body = req.body as SecretRefCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(201).json(await service.createSecretRef({
          schemaVersion: 'v1',
          workspaceId: requireString(body.workspaceId, 'workspaceId'),
          userId: requireString(body.userId, 'userId'),
          environmentScope: requireString(body.environmentScope, 'environmentScope'),
          providerType: requireString(body.providerType, 'providerType'),
          metadataJson: optionalRecord(body.metadataJson),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    listScopeGrants: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listScopeGrants());
      } catch (error) {
        handleError(res, error);
      }
    },

    listGovernanceChangeRequests: async (_req: Request, res: Response) => {
      try {
        res.json(await service.listGovernanceChangeRequests());
      } catch (error) {
        handleError(res, error);
      }
    },

    getGovernanceChangeRequest: async (req: Request, res: Response) => {
      try {
        res.json(await service.getGovernanceChangeRequest(req.params.requestId));
      } catch (error) {
        handleError(res, error);
      }
    },

    createGovernanceChangeRequest: async (req: Request, res: Response) => {
      try {
        const body = req.body as GovernanceChangeRequestCreateRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(201).json(await service.createGovernanceChangeRequest({
          schemaVersion: 'v1',
          workspaceId: requireString(body.workspaceId, 'workspaceId'),
          requestKind: requireEnum(body.requestKind, 'requestKind', GOVERNANCE_REQUEST_KINDS) as GovernanceChangeRequestCreateRequest['requestKind'],
          targetType: requireEnum(body.targetType, 'targetType', GOVERNANCE_TARGET_TYPES) as GovernanceChangeRequestCreateRequest['targetType'],
          targetRef: requireString(body.targetRef, 'targetRef'),
          requestedByActorId: requireString(body.requestedByActorId, 'requestedByActorId'),
          riskLevel: requireEnum(body.riskLevel, 'riskLevel', GOVERNANCE_RISK_LEVELS) as GovernanceChangeRequestCreateRequest['riskLevel'],
          summary: requireString(body.summary, 'summary'),
          justification: optionalString(body.justification),
          desiredStateJson: optionalRecord(body.desiredStateJson),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    approveGovernanceChangeRequest: async (req: Request, res: Response) => {
      try {
        const body = req.body as GovernanceChangeDecisionRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.approveGovernanceChangeRequest(req.params.requestId, {
          schemaVersion: 'v1',
          actorRef: requireString(body.actorRef, 'actorRef'),
          comment: optionalString(body.comment),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    rejectGovernanceChangeRequest: async (req: Request, res: Response) => {
      try {
        const body = req.body as GovernanceChangeDecisionRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.rejectGovernanceChangeRequest(req.params.requestId, {
          schemaVersion: 'v1',
          actorRef: requireString(body.actorRef, 'actorRef'),
          comment: optionalString(body.comment),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    listDueScheduleTriggers: async (req: Request, res: Response) => {
      try {
        const timestamp = optionalPositiveInt(req.query.timestampMs) || Date.now();
        res.json(await service.listDueScheduleTriggers(timestamp));
      } catch (error) {
        handleError(res, error);
      }
    },

    getWebhookTriggerRuntimeConfig: async (req: Request, res: Response) => {
      try {
        res.json(await service.getWebhookTriggerRuntimeConfig(req.params.publicTriggerKey));
      } catch (error) {
        handleError(res, error);
      }
    },

    dispatchScheduleTrigger: async (req: Request, res: Response) => {
      try {
        const body = req.body as TriggerDispatchRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(202).json(await service.dispatchScheduleTrigger(req.params.triggerBindingId, {
          schemaVersion: 'v1',
          dispatchKey: requireString(body.dispatchKey, 'dispatchKey'),
          firedAt: optionalPositiveInt(body.firedAt) || Date.now(),
          payload: optionalRecord(body.payload),
          headers: body.headers === undefined ? undefined : requireStringRecord(body.headers, 'headers'),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    dispatchWebhookTrigger: async (req: Request, res: Response) => {
      try {
        const body = req.body as TriggerDispatchRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.status(202).json(await service.dispatchWebhookTrigger(req.params.publicTriggerKey, {
          schemaVersion: 'v1',
          dispatchKey: requireString(body.dispatchKey, 'dispatchKey'),
          firedAt: optionalPositiveInt(body.firedAt) || Date.now(),
          payload: optionalRecord(body.payload),
          headers: body.headers === undefined ? undefined : requireStringRecord(body.headers, 'headers'),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },
  };
}
