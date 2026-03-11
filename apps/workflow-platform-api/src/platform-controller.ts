import type { Request, Response } from 'express';

import type {
  RecipeDraftCreateRequest,
  RecipeDraftUpdateRequest,
  WorkflowDraftCreateRequest,
  WorkflowDraftFocusRequest,
  WorkflowDraftIntakeRequest,
  WorkflowDraftPublishRequest,
  WorkflowResumeRequest,
  WorkflowStartRequest,
} from '@baseinterface/workflow-contracts';
import { isPlatformError, PlatformError } from './platform-errors';
import type { PlatformService } from './platform-service';

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

export function createPlatformController(service: PlatformService) {
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
        res.status(201).json(response);
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
        res.json(await service.resumeRun({
          schemaVersion: 'v1',
          traceId: requireString(body.traceId, 'traceId'),
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          runId: requireString(req.params.runId, 'runId'),
          actionId: requireString(body.actionId, 'actionId'),
          replyToken: optionalString(body.replyToken),
          taskId: optionalString(body.taskId),
          payload: body.payload,
        }));
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
        res.json(await service.focusDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    intakeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftIntakeRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.intakeDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
          text: requireString(body.text, 'text'),
          source: body.source,
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    synthesizeDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftFocusRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.synthesizeDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    validateDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftFocusRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.validateDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        }));
      } catch (error) {
        handleError(res, error);
      }
    },

    publishDraft: async (req: Request, res: Response) => {
      try {
        const body = req.body as WorkflowDraftPublishRequest;
        ensureSchemaVersion(body?.schemaVersion);
        res.json(await service.publishDraft(req.params.draftId, {
          schemaVersion: 'v1',
          sessionId: requireString(body.sessionId, 'sessionId'),
          userId: requireString(body.userId, 'userId'),
        }));
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
