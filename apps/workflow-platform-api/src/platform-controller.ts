import crypto from 'node:crypto';

import type { Request, Response } from 'express';

import type {
  RecipeDraftCreateRequest,
  RecipeDraftUpdateRequest,
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
  };
}
