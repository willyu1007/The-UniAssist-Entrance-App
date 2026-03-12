import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 9992,
  platform: 9991,
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function startService(name, args, env = {}) {
  const child = spawn('pnpm', args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`health timeout for ${url}`);
}

async function httpPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function httpGet(url) {
  const response = await fetch(url);
  const json = await response.json();
  return { status: response.status, json };
}

async function httpPatch(url, body) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function openSse(url) {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
    },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.ok(response.body);
  return {
    controller,
    reader: response.body.getReader(),
  };
}

async function readNextSseEvent(reader, timeoutMs = 5_000) {
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let buffer = '';

  while (Date.now() - startedAt < timeoutMs) {
    const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const result = await Promise.race([
      reader.read(),
      sleep(remaining).then(() => {
        throw new Error('sse read timeout');
      }),
    ]);
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const dataLine = frame
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data: '));
      if (dataLine) {
        return JSON.parse(dataLine.slice(6));
      }
    }
  }

  throw new Error('sse stream ended before data event');
}

test('workflow platform api manages drafts, publish, recipes, and runtime commands', async (t) => {
  const runtimeRequests = [];
  const workflowKey = 'sample-b3-platform';
  const compatProviderId = 'sample';
  let runResumed = false;
  let currentRunContext = {
    sessionId: 's-platform',
    userId: 'u-platform',
  };

  function buildPendingRunSnapshot(body) {
    const now = Date.now();
    return {
      run: {
        runId: 'run-platform-start',
        workflowId: body.template.workflowId,
        workflowKey: body.template.workflowKey,
        templateVersionId: body.version.templateVersionId,
        compatProviderId: body.template.compatProviderId,
        status: 'waiting_approval',
        sessionId: body.sessionId,
        userId: body.userId,
        currentNodeRunId: 'node-teacher-review',
        createdAt: now,
        updatedAt: now,
      },
      nodeRuns: [
        {
          nodeRunId: 'node-teacher-review',
          runId: 'run-platform-start',
          nodeKey: 'teacher_review',
          nodeType: 'approval_gate',
          status: 'waiting_approval',
          taskId: 'task-teacher-review',
          createdAt: now,
          updatedAt: now,
        },
      ],
      approvals: [
        {
          approvalRequestId: 'approval-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-teacher-review',
          artifactId: 'artifact-assessment-1',
          status: 'pending',
          requestedActorId: 'teacher:primary',
          payloadJson: {
            artifactIds: ['artifact-assessment-1', 'artifact-evidence-1'],
            artifactTypes: ['AssessmentDraft', 'EvidencePack'],
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
      approvalDecisions: [],
      artifacts: [
        {
          artifactId: 'artifact-observation-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-parse',
          artifactType: 'ObservationArtifact',
          state: 'validated',
          payloadJson: {
            subjectRef: 'student:case-1',
            subjectType: 'student',
          },
          metadataJson: {
            lineage: {
              nodeKey: 'parse_materials',
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          artifactId: 'artifact-assessment-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-assessment',
          artifactType: 'AssessmentDraft',
          state: 'review_required',
          payloadJson: {
            subjectRef: 'student:case-1',
            subjectType: 'student',
            findings: ['Finding 1'],
          },
          metadataJson: {
            lineage: {
              nodeKey: 'generate_assessment',
              observationRefs: ['artifact-observation-1'],
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          artifactId: 'artifact-evidence-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-assessment',
          artifactType: 'EvidencePack',
          state: 'validated',
          payloadJson: {
            subjectRef: 'student:case-1',
            subjectType: 'student',
            sourceArtifactRefs: ['artifact-observation-1'],
            observationRefs: ['artifact-observation-1'],
          },
          metadataJson: {
            lineage: {
              nodeKey: 'generate_assessment',
              observationRefs: ['artifact-observation-1'],
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          artifactId: 'artifact-recipe-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-assessment',
          artifactType: 'AnalysisRecipeCandidate',
          state: 'validated',
          payloadJson: {
            title: 'Alex 评估配方候选',
            normalizedSteps: ['收集材料', '提炼观察', '生成评估草稿', '输出交付视图'],
            assumptions: ['材料覆盖最近一次课堂表现'],
            reviewerNotes: ['captured from sample provider'],
            evidenceRefs: ['artifact-evidence-1'],
          },
          metadataJson: {
            lineage: {
              nodeKey: 'generate_assessment',
              evidenceArtifactTypes: ['EvidencePack'],
            },
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
      actorProfiles: [
        {
          runId: 'run-platform-start',
          actorId: 'teacher:primary',
          workspaceId: 'workspace:run-platform-start',
          status: 'active',
          displayName: 'Ms. Li',
          actorType: 'person',
          createdAt: now,
          updatedAt: now,
        },
      ],
      actorMemberships: [],
      audienceSelectors: [],
      deliverySpecs: [],
      deliveryTargets: [],
    };
  }

  function buildRunSummary() {
    const now = Date.now();
    return {
      runId: 'run-platform-start',
      workflowId: 'wf-platform',
      workflowKey,
      templateVersionId: 'ver-platform',
      compatProviderId,
      status: runResumed ? 'completed' : 'waiting_approval',
      sessionId: currentRunContext.sessionId,
      userId: currentRunContext.userId,
      createdAt: now,
      updatedAt: now,
      completedAt: runResumed ? now : undefined,
      currentNodeRunId: runResumed ? undefined : 'node-teacher-review',
      currentNodeKey: runResumed ? undefined : 'teacher_review',
      currentNodeType: runResumed ? undefined : 'approval_gate',
      currentNodeStatus: runResumed ? undefined : 'waiting_approval',
      blocker: runResumed ? null : 'waiting_approval',
      pendingApprovalCount: runResumed ? 0 : 1,
      deliverySummary: {
        pendingResolution: 0,
        ready: 0,
        blocked: 0,
        delivered: runResumed ? 1 : 0,
        failed: 0,
        cancelled: 0,
      },
      artifactTypes: runResumed
        ? ['ObservationArtifact', 'AssessmentDraft', 'EvidencePack', 'AnalysisRecipeCandidate', 'ReviewableDelivery']
        : ['ObservationArtifact', 'AssessmentDraft', 'EvidencePack', 'AnalysisRecipeCandidate'],
      requestedActorIds: ['teacher:primary'],
    };
  }

  function buildApprovalQueueItem() {
    const now = Date.now();
    return {
      approvalRequestId: 'approval-1',
      runId: 'run-platform-start',
      workflowKey,
      templateVersionId: 'ver-platform',
      compatProviderId,
      runStatus: runResumed ? 'completed' : 'waiting_approval',
      nodeRunId: 'node-teacher-review',
      nodeKey: 'teacher_review',
      status: runResumed ? 'approved' : 'pending',
      requestedActorId: 'teacher:primary',
      approverDisplayName: 'Ms. Li',
      artifactId: 'artifact-assessment-1',
      artifactIds: ['artifact-assessment-1', 'artifact-evidence-1'],
      artifactTypes: ['AssessmentDraft', 'EvidencePack'],
      createdAt: now,
      updatedAt: now,
    };
  }

  function buildApprovalDetail() {
    const snapshot = runResumed
      ? buildCompletedRunSnapshot(currentRunContext.sessionId, currentRunContext.userId)
      : buildPendingRunSnapshot({
          template: {
            workflowId: 'wf-platform',
            workflowKey,
            compatProviderId,
          },
          version: {
            templateVersionId: 'ver-platform',
          },
          sessionId: currentRunContext.sessionId,
          userId: currentRunContext.userId,
        });

    return {
      schemaVersion: 'v1',
      approval: {
        approvalRequestId: 'approval-1',
        runId: 'run-platform-start',
        nodeRunId: 'node-teacher-review',
        artifactId: 'artifact-assessment-1',
        status: runResumed ? 'approved' : 'pending',
        requestedActorId: 'teacher:primary',
        payloadJson: {
          artifactIds: ['artifact-assessment-1', 'artifact-evidence-1'],
          artifactTypes: ['AssessmentDraft', 'EvidencePack'],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      runSummary: buildRunSummary(),
      approverContext: {
        runId: 'run-platform-start',
        actorId: 'teacher:primary',
        workspaceId: 'workspace:run-platform-start',
        status: 'active',
        displayName: 'Ms. Li',
        actorType: 'person',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      artifacts: snapshot.artifacts
        .filter((artifact) => ['artifact-assessment-1', 'artifact-evidence-1'].includes(artifact.artifactId))
        .map((artifact) => ({
          artifact,
          typedPayload: artifact.payloadJson,
          lineage: artifact.metadataJson?.lineage || {},
        })),
      decisions: runResumed
        ? [{
            approvalDecisionId: 'approval-decision-1',
            approvalRequestId: 'approval-1',
            decision: 'approved',
            decidedActorId: currentRunContext.userId,
            comment: 'ship it',
            createdAt: Date.now(),
          }]
        : [],
      capturedRecipeDrafts: [],
    };
  }

  function buildCompletedRunSnapshot(sessionId, userId) {
    const now = Date.now();
    const pending = buildPendingRunSnapshot({
      template: {
        workflowId: 'wf-platform',
        workflowKey,
        compatProviderId,
      },
      version: {
        templateVersionId: 'ver-platform',
      },
      sessionId,
      userId,
    });
    return {
      ...pending,
      run: {
        ...pending.run,
        workflowId: 'wf-platform',
        workflowKey,
        templateVersionId: 'ver-platform',
        compatProviderId,
        status: 'completed',
        sessionId,
        userId,
        updatedAt: now,
        completedAt: now,
      },
      approvals: pending.approvals.map((approval) => ({
        ...approval,
        status: 'approved',
        updatedAt: now,
      })),
      approvalDecisions: [
        {
          approvalDecisionId: 'approval-decision-1',
          approvalRequestId: 'approval-1',
          decision: 'approved',
          decidedActorId: 'teacher:primary',
          createdAt: now,
        },
      ],
      artifacts: pending.artifacts.map((artifact) => (
        artifact.artifactType === 'AssessmentDraft'
          ? { ...artifact, state: 'published', updatedAt: now }
          : artifact
      )).concat([
        {
          artifactId: 'artifact-delivery-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-delivery',
          artifactType: 'ReviewableDelivery',
          state: 'published',
          payloadJson: {
            presentationRef: 'presentation:run-platform-start:reviewable-delivery',
            audienceType: 'fanout_bundle',
            approvedContentSlots: ['summary', 'actions', 'next_step'],
            redactions: ['internal_confidence_notes'],
          },
          metadataJson: {
            lineage: {
              nodeKey: 'fanout_delivery',
              assessmentRef: 'artifact-assessment-1',
              evidenceRef: 'artifact-evidence-1',
            },
          },
          createdAt: now,
          updatedAt: now,
        },
      ]),
      actorProfiles: [
        {
          actorId: 'teacher:primary',
          workspaceId: 'workspace:run-platform-start',
          status: 'active',
          displayName: 'Ms. Li',
          actorType: 'person',
          createdAt: now,
          updatedAt: now,
        },
      ],
      actorMemberships: [],
      audienceSelectors: [
        {
          audienceSelectorId: 'audsel:run-platform-start',
          status: 'bound',
          selectorJson: { audienceTypes: ['parent', 'student'] },
          createdAt: now,
          updatedAt: now,
        },
      ],
      deliverySpecs: [
        {
          deliverySpecId: 'delspec:run-platform-start',
          audienceSelectorId: 'audsel:run-platform-start',
          reviewRequired: true,
          deliveryMode: 'assisted_delivery',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      deliveryTargets: [
        {
          deliveryTargetId: 'deltarget:run-platform-start:1',
          runId: 'run-platform-start',
          deliverySpecId: 'delspec:run-platform-start',
          targetActorId: 'parent:case-1',
          status: 'delivered',
          payloadJson: { audienceType: 'parent' },
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }

  const runtimeServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : {};
    runtimeRequests.push({ method: req.method, path: req.url, body });

    if (req.url === '/internal/runtime/start-run' && req.method === 'POST') {
      runResumed = false;
      currentRunContext = {
        sessionId: body.sessionId,
        userId: body.userId,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: buildPendingRunSnapshot(body),
        events: [],
      }));
      return;
    }

    if (req.url === '/internal/runtime/resume-run' && req.method === 'POST') {
      runResumed = true;
      currentRunContext = {
        sessionId: body.sessionId,
        userId: body.userId,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: buildCompletedRunSnapshot(body.sessionId, body.userId),
        events: [],
      }));
      return;
    }

    if (req.url?.startsWith('/internal/runtime/runs?') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        runs: [buildRunSummary()],
      }));
      return;
    }

    if (req.url === '/internal/runtime/approvals' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        approvals: [
          {
            approvalRequestId: 'approval-1',
            runId: 'run-platform-start',
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }));
      return;
    }

    if (req.url === '/internal/runtime/approvals/queue' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        approvals: [buildApprovalQueueItem()],
      }));
      return;
    }

    if (req.url === '/internal/runtime/approvals/approval-1' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(buildApprovalDetail()));
      return;
    }

    if (req.url === '/internal/runtime/approvals/approval-1/decision' && req.method === 'POST') {
      runResumed = true;
      currentRunContext = {
        sessionId: currentRunContext.sessionId,
        userId: body.userId,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        approval: {
          approvalRequestId: 'approval-1',
          runId: 'run-platform-start',
          nodeRunId: 'node-teacher-review',
          artifactId: 'artifact-assessment-1',
          status: 'approved',
          requestedActorId: 'teacher:primary',
          payloadJson: {
            artifactIds: ['artifact-assessment-1', 'artifact-evidence-1'],
            artifactTypes: ['AssessmentDraft', 'EvidencePack'],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        decision: {
          approvalDecisionId: 'approval-decision-1',
          approvalRequestId: 'approval-1',
          decision: body.decision,
          decidedActorId: body.userId,
          comment: body.comment,
          createdAt: Date.now(),
        },
        run: buildCompletedRunSnapshot(currentRunContext.sessionId, body.userId),
        events: [],
      }));
      return;
    }

    if (req.url === '/internal/runtime/artifacts/artifact-1' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        artifact: {
          artifactId: 'artifact-1',
          runId: 'run-platform-start',
          artifactType: 'ReviewableDelivery',
          state: 'validated',
          payloadJson: { done: true },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        typedPayload: {
          presentationRef: 'presentation:run-platform-start:reviewable-delivery',
          audienceType: 'fanout_bundle',
        },
        lineage: {
          nodeKey: 'fanout_delivery',
          assessmentRef: 'artifact-assessment-1',
          evidenceRef: 'artifact-evidence-1',
        },
      }));
      return;
    }

    if (req.url === '/internal/runtime/runs/run-platform-start' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: runResumed
          ? buildCompletedRunSnapshot('s-platform', 'u-platform')
          : buildPendingRunSnapshot({
              template: {
                workflowId: 'wf-platform',
                workflowKey,
                compatProviderId,
              },
              version: {
                templateVersionId: 'ver-platform',
              },
              sessionId: 's-platform',
              userId: 'u-platform',
            }),
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, '127.0.0.1', resolvePromise));
  t.after(async () => {
    await new Promise((resolvePromise) => runtimeServer.close(resolvePromise));
  });

  const platform = startService('workflow-platform-api', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_SERVICE_ID: 'workflow-platform-api',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  t.after(async () => {
    platform.kill('SIGTERM');
    await sleep(500);
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const sessionId = 's-platform-builder';
  const userId = 'u-platform-builder';

  const directCreateRemoved = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflows`, {
    schemaVersion: 'v1',
    workflowKey,
    name: 'removed direct create path',
    compatProviderId,
    spec: {
      schemaVersion: 'v1',
      workflowKey,
      name: 'removed direct create path',
      compatProviderId,
      entryNode: 'collect',
      nodes: [],
    },
  });
  assert.equal(directCreateRemoved.status, 410);
  assert.equal(directCreateRemoved.json.code, 'WORKFLOW_DIRECT_CREATE_REMOVED');

  async function createPublishedVersion(params) {
    const createdDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
      schemaVersion: 'v1',
      sessionId,
      userId,
      workflowKey: params.workflowKey,
      name: params.name,
      source: 'builder_text_entry',
      initialText: params.initialText,
    });
    assert.equal(createdDraft.status, 201);
    assert.equal(createdDraft.json.draft.workflowKey, params.workflowKey);
    assert.equal(createdDraft.json.sessionLinks[0].isActive, true);

    const draftId = createdDraft.json.draft.draftId;

    const synthesized = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/synthesize`, {
      schemaVersion: 'v1',
      sessionId,
      userId,
    });
    assert.equal(synthesized.status, 200);
    assert.equal(synthesized.json.draft.status, 'synthesized');
    assert.equal(synthesized.json.draft.currentSpec.metadata.builder.createdFrom, 'builder_text_entry');
    assert.equal(synthesized.json.draft.currentSpec.metadata.builder.draftId, draftId);

    const validated = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/validate`, {
      schemaVersion: 'v1',
      sessionId,
      userId,
    });
    assert.equal(validated.status, 200);
    assert.equal(validated.json.draft.publishable, true);
    assert.equal(validated.json.revision.validationSummary.isPublishable, true);

    const published = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/publish`, {
      schemaVersion: 'v1',
      sessionId,
      userId,
    });
    assert.equal(published.status, 200);
    assert.equal(published.json.draft.status, 'published');

    return {
      createdDraft,
      synthesized,
      validated,
      published,
      draftId,
    };
  }

  const firstPublish = await createPublishedVersion({
    workflowKey,
    name: 'Sample Platform Flow',
    initialText: '帮我创建一个样例工作流',
  });

  const listedDrafts = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(listedDrafts.status, 200);
  assert.equal(listedDrafts.json.drafts.length, 1);
  assert.equal(listedDrafts.json.sessionLinks.length, 1);
  assert.equal(listedDrafts.json.sessionLinks[0].draftId, firstPublish.draftId);

  const draftDetail = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${firstPublish.draftId}?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(draftDetail.status, 200);
  assert.equal(draftDetail.json.draft.status, 'published');
  assert.equal(draftDetail.json.revisions.length, 4);
  assert.deepEqual(draftDetail.json.revisions.map((revision) => revision.revisionNumber), [1, 2, 3, 4]);

  const revisions = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${firstPublish.draftId}/revisions`);
  assert.equal(revisions.status, 200);
  assert.equal(revisions.json.revisions.length, 4);

  const terminalIntake = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${firstPublish.draftId}/intake`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    text: 'publish 后不允许再追加',
    source: 'chat_intake',
  });
  assert.equal(terminalIntake.status, 409);
  assert.equal(terminalIntake.json.code, 'DRAFT_TERMINAL');

  const listed = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflows`);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.workflows.length, 1);

  const fetched = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflows/${firstPublish.published.json.workflow.workflowId}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.workflow.workflow.workflowKey, workflowKey);
  assert.equal(fetched.json.workflow.versions.length, 1);
  assert.equal(fetched.json.workflow.versions[0].status, 'published');

  const secondDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    workflowKey,
    name: 'Sample Platform Flow v2',
    source: 'builder_text_entry',
    initialText: '请升级这个样例工作流版本',
  });
  assert.equal(secondDraft.status, 201);

  const secondDraftId = secondDraft.json.draft.draftId;
  const listedAfterSecondCreate = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(listedAfterSecondCreate.status, 200);
  assert.equal(listedAfterSecondCreate.json.drafts.length, 2);
  assert.equal(listedAfterSecondCreate.json.sessionLinks.find((link) => link.isActive).draftId, secondDraftId);

  const corsPreflight = await fetch(`http://127.0.0.1:${ports.platform}/v1/runs`, {
    method: 'OPTIONS',
  });
  assert.equal(corsPreflight.status, 204);
  assert.equal(corsPreflight.headers.get('access-control-allow-origin'), '*');

  const focusFirst = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${firstPublish.draftId}/focus`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(focusFirst.status, 200);
  assert.equal(focusFirst.json.sessionLinks.find((link) => link.isActive).draftId, firstPublish.draftId);

  const focusSecond = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/focus`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(focusSecond.status, 200);
  assert.equal(focusSecond.json.sessionLinks.find((link) => link.isActive).draftId, secondDraftId);

  const invalidPatch = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: 'rev-invalid',
    changeSummary: 'invalid patch should be rejected',
    patch: {
      section: 'requirements',
    },
  });
  assert.equal(invalidPatch.status, 400);
  assert.equal(invalidPatch.json.code, 'INVALID_REQUEST');

  const secondDraftDetailBeforePatch = await httpGet(
    `http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}?sessionId=${encodeURIComponent(sessionId)}`,
  );
  assert.equal(secondDraftDetailBeforePatch.status, 200);
  const staleRevisionId = secondDraftDetailBeforePatch.json.revisions.at(-1).revisionId;

  const sse = await openSse(`http://127.0.0.1:${ports.platform}/v1/control-console/stream`);
  t.after(async () => {
    sse.controller.abort();
    await sse.reader.cancel().catch(() => undefined);
  });

  const patchedDraft = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: staleRevisionId,
    changeSummary: 'Rename and pin entry node from control console',
    patch: {
      section: 'metadata',
      value: {
        name: 'Sample Platform Flow v2 Console Edit',
        entryNode: 'draft_start',
      },
    },
  });
  assert.equal(patchedDraft.status, 200);
  assert.equal(patchedDraft.json.draft.name, 'Sample Platform Flow v2 Console Edit');
  assert.equal(patchedDraft.json.revision.source, 'console_edit');
  assert.equal(patchedDraft.json.revision.changeSummary, 'Rename and pin entry node from control console');

  const sseEvent = await readNextSseEvent(sse.reader);
  assert.equal(sseEvent.type, 'control_console_event');
  assert.equal(sseEvent.event.kind, 'draft.updated');
  assert.equal(sseEvent.event.draftId, secondDraftId);

  const stalePatch = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: staleRevisionId,
    changeSummary: 'stale edit should fail',
    patch: {
      section: 'requirements',
      value: {
        requirements: ['stale write should conflict'],
      },
    },
  });
  assert.equal(stalePatch.status, 409);
  assert.equal(stalePatch.json.code, 'DRAFT_REVISION_CONFLICT');

  const secondSynthesized = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/synthesize`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(secondSynthesized.status, 200);

  const secondValidated = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/validate`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(secondValidated.status, 200);
  assert.equal(secondValidated.json.draft.publishable, true);

  const secondPublished = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${secondDraftId}/publish`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(secondPublished.status, 200);
  assert.equal(secondPublished.json.version.version, 2);

  const fetchedAfterSecondPublish = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflows/${firstPublish.published.json.workflow.workflowId}`);
  assert.equal(fetchedAfterSecondPublish.status, 200);
  assert.equal(fetchedAfterSecondPublish.json.workflow.versions.length, 2);
  assert.deepEqual(
    fetchedAfterSecondPublish.json.workflow.versions.map((version) => ({ version: version.version, status: version.status })),
    [
      { version: 1, status: 'superseded' },
      { version: 2, status: 'published' },
    ],
  );

  const started = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-start',
    sessionId: 's-platform',
    userId: 'u-platform',
    workflowKey,
    inputText: '帮我启动一个 workflow run',
  });

  assert.equal(started.status, 201);
  assert.equal(started.json.run.run.runId, 'run-platform-start');
  assert.equal(started.json.capturedRecipeDrafts.length, 0);
  assert.equal(runtimeRequests.at(-1).path, '/internal/runtime/start-run');
  assert.equal(runtimeRequests.at(-1).body.template.workflowKey, workflowKey);

  const missingRun = await httpGet(`http://127.0.0.1:${ports.platform}/v1/runs/run-missing`);
  assert.equal(missingRun.status, 404);
  assert.equal(missingRun.json.code, 'RUNTIME_REQUEST_FAILED');

  const missingApproval = await httpGet(`http://127.0.0.1:${ports.platform}/v1/approvals/approval-missing`);
  assert.equal(missingApproval.status, 404);
  assert.equal(missingApproval.json.code, 'RUNTIME_REQUEST_FAILED');

  const runsList = await httpGet(`http://127.0.0.1:${ports.platform}/v1/runs?limit=10`);
  assert.equal(runsList.status, 200);
  assert.equal(runsList.json.runs.length, 1);
  assert.equal(runsList.json.runs[0].status, 'waiting_approval');
  assert.equal(runsList.json.runs[0].blocker, 'waiting_approval');

  const approvalQueue = await httpGet(`http://127.0.0.1:${ports.platform}/v1/approvals/queue`);
  assert.equal(approvalQueue.status, 200);
  assert.equal(approvalQueue.json.approvals.length, 1);
  assert.equal(approvalQueue.json.approvals[0].status, 'pending');
  assert.deepEqual(approvalQueue.json.approvals[0].artifactTypes, ['AssessmentDraft', 'EvidencePack']);

  const approvalDetail = await httpGet(`http://127.0.0.1:${ports.platform}/v1/approvals/approval-1`);
  assert.equal(approvalDetail.status, 200);
  assert.equal(approvalDetail.json.approval.approvalRequestId, 'approval-1');
  assert.equal(approvalDetail.json.approverContext.displayName, 'Ms. Li');
  assert.equal(approvalDetail.json.artifacts.length, 2);

  const runSnapshot = await httpGet(`http://127.0.0.1:${ports.platform}/v1/runs/run-platform-start`);
  assert.equal(runSnapshot.status, 200);
  assert.equal(runSnapshot.json.run.run.runId, 'run-platform-start');
  assert.equal(runSnapshot.json.capturedRecipeDrafts.length, 0);
  assert.equal(runSnapshot.json.run.approvals.length, 1);

  const resumed = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs/run-platform-start/resume`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-resume',
    sessionId: 's-platform',
    userId: 'u-platform',
    actionId: 'execute_task',
  });

  assert.equal(resumed.status, 200);
  assert.equal(resumed.json.run.run.status, 'completed');
  assert.equal(resumed.json.capturedRecipeDrafts.length, 1);
  assert.equal(resumed.json.capturedRecipeDrafts[0].title, 'Alex 评估配方候选');
  assert.equal(runtimeRequests.at(-1).path, '/internal/runtime/resume-run');
  assert.equal(runtimeRequests.at(-1).body.runId, 'run-platform-start');

  const runSnapshotAfterResume = await httpGet(`http://127.0.0.1:${ports.platform}/v1/runs/run-platform-start`);
  assert.equal(runSnapshotAfterResume.status, 200);
  assert.equal(runSnapshotAfterResume.json.run.run.status, 'completed');
  assert.equal(runSnapshotAfterResume.json.capturedRecipeDrafts.length, 1);

  const approvals = await httpGet(`http://127.0.0.1:${ports.platform}/v1/approvals`);
  assert.equal(approvals.status, 200);
  assert.equal(approvals.json.approvals.length, 1);

  const decisionStarted = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-decision-start',
    sessionId: 's-platform-decision',
    userId: 'u-platform-decision',
    workflowKey,
    inputText: 'start a second run to exercise decision endpoint',
  });
  assert.equal(decisionStarted.status, 201);

  const decisionResponse = await httpPost(`http://127.0.0.1:${ports.platform}/v1/approvals/approval-1/decision`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-decision',
    userId: 'u-platform-decision',
    decision: 'approved',
    comment: 'ship it',
  });
  assert.equal(decisionResponse.status, 200);
  assert.equal(decisionResponse.json.approval.status, 'approved');
  assert.equal(decisionResponse.json.decision.comment, 'ship it');
  assert.equal(decisionResponse.json.run.run.status, 'completed');
  assert.equal(decisionResponse.json.capturedRecipeDrafts.length, 1);
  assert.equal(runtimeRequests.at(-1).path, '/internal/runtime/approvals/approval-1/decision');
  assert.equal(runtimeRequests.at(-1).body.decision, 'approved');

  const artifact = await httpGet(`http://127.0.0.1:${ports.platform}/v1/artifacts/artifact-1`);
  assert.equal(artifact.status, 200);
  assert.equal(artifact.json.artifact.artifactId, 'artifact-1');
  assert.equal(artifact.json.typedPayload.presentationRef, 'presentation:run-platform-start:reviewable-delivery');
  assert.equal(artifact.json.lineage.nodeKey, 'fanout_delivery');

  const createdRecipe = await httpPost(`http://127.0.0.1:${ports.platform}/v1/recipe-drafts`, {
    schemaVersion: 'v1',
    title: 'Sample Recipe Draft',
    sourceRefs: [{ type: 'note', ref: 'builder-session' }],
    normalizedSteps: [{ stepKey: 'collect', title: 'Collect input' }],
    assumptions: ['user can provide due date'],
    reviewerNotes: ['captured from builder flow'],
  });
  assert.equal(createdRecipe.status, 201);
  assert.equal(createdRecipe.json.recipeDraft.title, 'Sample Recipe Draft');

  const listedRecipes = await httpGet(`http://127.0.0.1:${ports.platform}/v1/recipe-drafts`);
  assert.equal(listedRecipes.status, 200);
  assert.equal(listedRecipes.json.recipeDrafts.length, 2);

  const fetchedRecipe = await httpGet(`http://127.0.0.1:${ports.platform}/v1/recipe-drafts/${createdRecipe.json.recipeDraft.recipeDraftId}`);
  assert.equal(fetchedRecipe.status, 200);
  assert.equal(fetchedRecipe.json.recipeDraft.recipeDraftId, createdRecipe.json.recipeDraft.recipeDraftId);

  const updatedRecipe = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/recipe-drafts/${createdRecipe.json.recipeDraft.recipeDraftId}`, {
    schemaVersion: 'v1',
    status: 'review_required',
    reviewerNotes: ['review passed'],
  });
  assert.equal(updatedRecipe.status, 200);
  assert.equal(updatedRecipe.json.recipeDraft.status, 'review_required');
  assert.deepEqual(updatedRecipe.json.recipeDraft.reviewerNotes, ['review passed']);
});
