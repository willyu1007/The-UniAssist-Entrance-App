import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  provider: 19990,
  runtime: 19992,
};

const internalAuth = {
  mode: 'enforce',
  issuer: 'uniassist-internal',
  kid: 'kid-main',
  secret: 'internal-secret-main',
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signInternalHeaders({
  method,
  path,
  rawBody = '',
  subject,
  audience,
  scopes = [],
  timestampMs = Date.now(),
  nonce = randomUUID(),
  jti = randomUUID(),
}) {
  const ts = String(timestampMs);
  const claims = {
    iss: internalAuth.issuer,
    sub: subject,
    aud: audience,
    scope: scopes.join(' ').trim(),
    iat: Math.floor(timestampMs / 1000),
    exp: Math.floor(timestampMs / 1000) + 300,
    jti,
  };
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: internalAuth.kid,
  };
  const headerEncoded = base64urlJson(header);
  const payloadEncoded = base64urlJson(claims);
  const unsigned = `${headerEncoded}.${payloadEncoded}`;
  const tokenSig = createHmac('sha256', internalAuth.secret).update(unsigned).digest('base64url');
  const token = `${unsigned}.${tokenSig}`;
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const signablePath = path.split('?')[0] || path;
  const signPayload = `${ts}.${nonce}.${method.toUpperCase()}.${signablePath}.${bodyHash}`;
  const requestSig = createHmac('sha256', internalAuth.secret).update(signPayload).digest('hex');
  return {
    authorization: `Bearer ${token}`,
    'x-uniassist-internal-kid': internalAuth.kid,
    'x-uniassist-internal-ts': ts,
    'x-uniassist-internal-nonce': nonce,
    'x-uniassist-internal-signature': requestSig,
  };
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

async function postInternal(url, path, body, subject = 'workflow-platform-api') {
  const rawBody = JSON.stringify(body);
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signInternalHeaders({
        method: 'POST',
        path,
        rawBody,
        subject,
        audience: 'workflow-runtime',
      }),
    },
    body: rawBody,
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function getInternal(url, path, subject = 'workflow-platform-api') {
  const response = await fetch(`${url}${path}`, {
    method: 'GET',
    headers: {
      ...signInternalHeaders({
        method: 'GET',
        path,
        subject,
        audience: 'workflow-runtime',
      }),
    },
  });
  const json = await response.json();
  return { status: response.status, json };
}

function buildTemplate(versionId, spec) {
  return {
    template: {
      workflowId: `wf-${versionId}`,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: spec.compatProviderId,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    version: {
      templateVersionId: versionId,
      workflowId: `wf-${versionId}`,
      workflowKey: spec.workflowKey,
      version: 1,
      status: 'published',
      spec,
      createdAt: Date.now(),
    },
  };
}

test('workflow runtime runs the B3 teaching validation workflow end-to-end', async (t) => {
  const internalEnv = {
    UNIASSIST_INTERNAL_AUTH_MODE: internalAuth.mode,
    UNIASSIST_INTERNAL_AUTH_ISSUER: internalAuth.issuer,
    UNIASSIST_INTERNAL_AUTH_KEYS_JSON: JSON.stringify({ [internalAuth.kid]: internalAuth.secret }),
    UNIASSIST_INTERNAL_AUTH_SIGNING_KID: internalAuth.kid,
  };

  const provider = startService('provider-sample', ['--filter', '@baseinterface/provider-sample', 'start'], {
    PORT: String(ports.provider),
    UNIASSIST_SERVICE_ID: 'provider-sample',
    ...internalEnv,
  });
  const runtime = startService('workflow-runtime', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_SERVICE_ID: 'workflow-runtime',
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
    ...internalEnv,
  });

  const stopAll = () => {
    provider.kill('SIGTERM');
    runtime.kill('SIGTERM');
  };

  t.after(async () => {
    stopAll();
    await sleep(500);
  });

  await waitForHealth(`http://127.0.0.1:${ports.provider}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);

  const runtimeBaseUrl = `http://127.0.0.1:${ports.runtime}`;

  const teachingSpec = {
    schemaVersion: 'v1',
    workflowKey: 'sample-b3-teaching',
    name: 'Teaching Validation Sample',
    compatProviderId: 'sample',
    entryNode: 'parse_materials',
    nodes: [
      {
        nodeKey: 'parse_materials',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'generate_assessment',
        },
      },
      {
        nodeKey: 'generate_assessment',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'teacher_review',
        },
      },
      {
        nodeKey: 'teacher_review',
        nodeType: 'approval_gate',
        transitions: {
          approved: 'fanout_delivery',
        },
        config: {
          reviewArtifactTypes: ['AssessmentDraft', 'EvidencePack'],
        },
      },
      {
        nodeKey: 'fanout_delivery',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };

  const teachingTemplate = buildTemplate('ver-teaching', teachingSpec);
  const teachingInput = {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-teaching',
    userId: 'u-runtime',
    ...teachingTemplate,
    inputPayload: {
      subject: {
        subjectRef: 'student:case-1',
        subjectType: 'student',
        displayName: 'Alex',
      },
      materials: [
        '课堂观察记录',
        '作业提交摘要',
      ],
      reviewerActor: {
        actorId: 'reviewer:primary',
        displayName: 'Primary Reviewer',
      },
      audiences: [
        { audienceType: 'parent', actorId: 'parent:case-1', displayName: 'Parent Case 1' },
        { audienceType: 'student', actorId: 'student:case-1', displayName: 'Alex' },
        { audienceType: 'group', actorId: 'group:class-a', displayName: 'Class A', actorType: 'cohort' },
      ],
      temporaryCollaborators: [
        { actorId: 'assistant:temp-1', displayName: 'Assistant Temp 1' },
      ],
    },
  };

  const startResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', teachingInput);
  assert.equal(startResponse.status, 200);
  assert.equal(startResponse.json.run.run.status, 'waiting_approval');
  assert.deepEqual(
    startResponse.json.run.artifacts.map((artifact) => artifact.artifactType),
    ['ObservationArtifact', 'AssessmentDraft', 'EvidencePack', 'AnalysisRecipeCandidate'],
  );
  assert.equal(
    startResponse.json.run.artifacts.find((artifact) => artifact.artifactType === 'AssessmentDraft')?.state,
    'review_required',
  );
  const approvalRequested = startResponse.json.events.find((event) => event.kind === 'approval.requested');
  assert.ok(approvalRequested);

  const recipeArtifact = startResponse.json.run.artifacts.find((artifact) => artifact.artifactType === 'AnalysisRecipeCandidate');
  assert.ok(recipeArtifact);
  const recipeArtifactResponse = await getInternal(
    runtimeBaseUrl,
    `/internal/runtime/artifacts/${recipeArtifact.artifactId}`,
  );
  assert.equal(recipeArtifactResponse.status, 200);
  assert.equal(recipeArtifactResponse.json.artifact.artifactType, 'AnalysisRecipeCandidate');
  assert.equal(recipeArtifactResponse.json.typedPayload.title, 'Alex workflow 配方候选');
  assert.equal(recipeArtifactResponse.json.lineage.nodeKey, 'generate_assessment');

  const approvalRequestId = approvalRequested.payload.approvalRequestId;
  const runListBeforeDecision = await getInternal(runtimeBaseUrl, '/internal/runtime/runs?limit=10');
  assert.equal(runListBeforeDecision.status, 200);
  assert.equal(runListBeforeDecision.json.runs.some((run) => run.runId === startResponse.json.run.run.runId), true);
  assert.equal(runListBeforeDecision.json.runs[0].status, 'waiting_approval');
  assert.equal(runListBeforeDecision.json.runs[0].blocker, 'waiting_approval');

  const approvalQueueBeforeDecision = await getInternal(runtimeBaseUrl, '/internal/runtime/approvals/queue');
  assert.equal(approvalQueueBeforeDecision.status, 200);
  assert.equal(
    approvalQueueBeforeDecision.json.approvals.some((approval) => approval.approvalRequestId === approvalRequestId),
    true,
  );
  assert.equal(
    approvalQueueBeforeDecision.json.approvals.find((approval) => approval.approvalRequestId === approvalRequestId)?.status,
    'pending',
  );

  const approvalDetailBeforeDecision = await getInternal(
    runtimeBaseUrl,
    `/internal/runtime/approvals/${approvalRequestId}`,
  );
  assert.equal(approvalDetailBeforeDecision.status, 200);
  assert.equal(approvalDetailBeforeDecision.json.approval.approvalRequestId, approvalRequestId);
  assert.equal(approvalDetailBeforeDecision.json.artifacts.length, 2);
  assert.equal(approvalDetailBeforeDecision.json.decisions.length, 0);

  const approvalResume = await postInternal(runtimeBaseUrl, `/internal/runtime/approvals/${approvalRequestId}/decision`, {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    userId: 'u-runtime',
    decision: 'approved',
  });

  assert.equal(approvalResume.status, 200);
  assert.equal(approvalResume.json.run.run.status, 'completed');
  assert.ok(approvalResume.json.events.some((event) => event.kind === 'approval.decided'));
  assert.equal(
    approvalResume.json.run.artifacts.find((artifact) => artifact.artifactType === 'AssessmentDraft')?.state,
    'published',
  );
  assert.ok(approvalResume.json.run.artifacts.some((artifact) => artifact.artifactType === 'ReviewableDelivery'));
  assert.equal(approvalResume.json.run.deliveryTargets.length, 3);
  assert.equal(
    approvalResume.json.run.deliveryTargets.some((target) => target.targetActorId === 'assistant:temp-1'),
    false,
  );
  assert.equal(
    approvalResume.json.run.actorMemberships.some((membership) => membership.status === 'pending_confirmation'),
    true,
  );

  const runQuery = await getInternal(runtimeBaseUrl, `/internal/runtime/runs/${startResponse.json.run.run.runId}`);
  assert.equal(runQuery.status, 200);
  assert.equal(runQuery.json.run.approvalDecisions.length, 1);
  assert.equal(runQuery.json.run.deliveryTargets.length, 3);
  assert.equal(runQuery.json.run.actorProfiles.length, 5);

  const decisionStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    ...teachingInput,
    traceId: randomUUID(),
    sessionId: 's-runtime-teaching-decision',
  });
  assert.equal(decisionStart.status, 200);
  const decisionApproval = decisionStart.json.events.find((event) => event.kind === 'approval.requested');
  assert.ok(decisionApproval);

  const approvalDecisionResponse = await postInternal(
    runtimeBaseUrl,
    `/internal/runtime/approvals/${decisionApproval.payload.approvalRequestId}/decision`,
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      userId: 'u-runtime',
      decision: 'approved',
      comment: 'LGTM',
    },
  );
  assert.equal(approvalDecisionResponse.status, 200);
  assert.equal(approvalDecisionResponse.json.approval.status, 'approved');
  assert.equal(approvalDecisionResponse.json.decision.comment, 'LGTM');
  assert.equal(approvalDecisionResponse.json.run.run.status, 'completed');
  assert.equal(
    approvalDecisionResponse.json.run.artifacts.find((artifact) => artifact.artifactType === 'AssessmentDraft')?.state,
    'published',
  );

  const runListAfterDecision = await getInternal(runtimeBaseUrl, '/internal/runtime/runs?limit=10');
  assert.equal(runListAfterDecision.status, 200);
  assert.equal(
    runListAfterDecision.json.runs.some((run) => (
      run.runId === approvalDecisionResponse.json.run.run.runId && run.status === 'completed'
    )),
    true,
  );

  const rejectStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    ...teachingInput,
    traceId: randomUUID(),
    sessionId: 's-runtime-teaching-reject',
  });
  assert.equal(rejectStart.status, 200);
  const rejectApproval = rejectStart.json.events.find((event) => event.kind === 'approval.requested');
  assert.ok(rejectApproval);

  const rejectResume = await postInternal(
    runtimeBaseUrl,
    `/internal/runtime/approvals/${rejectApproval.payload.approvalRequestId}/decision`,
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      userId: 'u-runtime',
      decision: 'rejected',
      comment: 'needs changes',
    },
  );
  assert.equal(rejectResume.status, 200);
  assert.equal(rejectResume.json.run.run.status, 'failed');
  assert.equal(
    rejectResume.json.run.artifacts.some((artifact) => artifact.artifactType === 'ReviewableDelivery'),
    false,
  );
  assert.equal(rejectResume.json.run.deliveryTargets.length, 0);

  const interactionSpec = {
    schemaVersion: 'v1',
    compatProviderId: 'sample',
    workflowKey: 'sample-b3-interaction-recovery',
    name: 'Interaction Recovery Fixture',
    entryNode: 'collect_subject',
    nodes: [
      {
        nodeKey: 'collect_subject',
        nodeType: 'executor',
        executorId: 'compat-sample',
        config: {
          compatFixture: 'interaction_recovery',
        },
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };

  const interactionTemplate = buildTemplate('ver-interaction-recovery', interactionSpec);
  const interactionStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-interaction',
    userId: 'u-runtime',
    ...interactionTemplate,
    inputPayload: {},
  });
  assert.equal(interactionStart.status, 200);
  assert.equal(interactionStart.json.run.run.status, 'waiting_interaction');
  assert.ok(interactionStart.json.events.some((event) => event.kind === 'interaction.requested'));

  const firstInteractionRequest = interactionStart.json.run.interactionRequests.at(-1);
  assert.ok(firstInteractionRequest);
  assert.equal(firstInteractionRequest.status, 'pending');

  const firstInteractionResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-interaction',
    userId: 'u-runtime',
    runId: interactionStart.json.run.run.runId,
    interactionRequestId: firstInteractionRequest.interactionRequestId,
    payload: {
      subject: 'Fixture Topic',
    },
  });
  assert.equal(firstInteractionResponse.status, 200);
  assert.equal(firstInteractionResponse.json.run.run.status, 'waiting_interaction');
  assert.ok(firstInteractionResponse.json.events.some((event) => event.kind === 'interaction.responded'));
  const answeredInteraction = firstInteractionResponse.json.run.interactionRequests.find(
    (item) => item.interactionRequestId === firstInteractionRequest.interactionRequestId,
  );
  assert.equal(answeredInteraction?.status, 'answered');
  const confirmationInteraction = firstInteractionResponse.json.run.interactionRequests.find(
    (item) => item.status === 'pending',
  );
  assert.ok(confirmationInteraction);

  const confirmationResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-interaction',
    userId: 'u-runtime',
    runId: interactionStart.json.run.run.runId,
    interactionRequestId: confirmationInteraction.interactionRequestId,
    payload: {
      confirmed: true,
      comment: 'proceed',
    },
  });
  assert.equal(confirmationResponse.status, 200);
  assert.equal(confirmationResponse.json.run.run.status, 'completed');
  assert.ok(confirmationResponse.json.events.some((event) => event.kind === 'interaction.responded'));
  assert.ok(
    confirmationResponse.json.run.artifacts.some((artifact) => artifact.artifactType === 'InteractionFixtureArtifact'),
  );
});
