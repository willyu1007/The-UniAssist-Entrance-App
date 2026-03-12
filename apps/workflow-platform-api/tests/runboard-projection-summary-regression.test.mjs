import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectionSourcePath = resolve(packageDir, '../../packages/convex-projection-experiment/src/runboard-projection.ts');

async function runTsxEval(script) {
  const child = spawn('pnpm', ['exec', 'tsx', '--eval', script], {
    cwd: packageDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', resolvePromise);
  });

  if (exitCode !== 0) {
    throw new Error(`tsx eval failed with code ${exitCode}: ${stderr}`);
  }

  return stdout.trim();
}

test('buildRunboardProjectionSummary deduplicates requested actor ids', async () => {
  const script = `
    import { buildRunboardProjectionSummary } from ${JSON.stringify(projectionSourcePath)};

    const summary = buildRunboardProjectionSummary({
      run: {
        runId: 'run-1',
        workflowId: 'wf-1',
        workflowKey: 'wf-key',
        templateVersionId: 'ver-1',
        compatProviderId: 'sample',
        status: 'waiting_approval',
        sessionId: 'session-1',
        userId: 'user-1',
        createdAt: 1,
        updatedAt: 2,
        completedAt: null,
        currentNodeRunId: 'node-1',
      },
      nodeRuns: [
        {
          nodeRunId: 'node-1',
          nodeKey: 'review',
          nodeType: 'approval_gate',
          status: 'waiting_approval',
        },
      ],
      approvals: [
        {
          approvalRequestId: 'approval-1',
          status: 'pending',
          requestedActorId: 'teacher-1',
        },
        {
          approvalRequestId: 'approval-2',
          status: 'pending',
          requestedActorId: 'teacher-1',
        },
      ],
      deliveryTargets: [],
      artifacts: [],
    });

    console.log(JSON.stringify(summary.requestedActorIds));
  `;

  const output = await runTsxEval(script);
  assert.deepEqual(JSON.parse(output), ['teacher-1']);
});
