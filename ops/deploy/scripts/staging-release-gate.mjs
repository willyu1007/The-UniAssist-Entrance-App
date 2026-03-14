#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

function fail(message) {
  console.error(`[staging-gate][FAIL] ${message}`);
  process.exit(1);
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runStep(step) {
  const startedAt = Date.now();
  console.log(`\n[staging-gate] STEP: ${step.name}`);
  console.log(`[staging-gate] CMD: ${step.cmd} ${step.args.join(' ')}`);

  await new Promise((resolve, reject) => {
    const child = spawn(step.cmd, step.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(step.env || {}),
      },
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${step.name} exited with code ${code ?? 'unknown'}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });

  return Date.now() - startedAt;
}

async function main() {
  const steps = [
    { name: 'workspace typecheck', cmd: 'pnpm', args: ['typecheck:workspaces'] },
    { name: 'pure-v1 smoke suite', cmd: 'pnpm', args: ['smoke:pure-v1'] },
    { name: 'connector runtime tests', cmd: 'pnpm', args: ['--filter', '@uniassist/connector-runtime', 'test'] },
    { name: 'trigger scheduler tests', cmd: 'pnpm', args: ['--filter', '@uniassist/trigger-scheduler', 'test'] },
    {
      name: 'worker simulate drill',
      cmd: 'pnpm',
      args: ['worker:drill:staging'],
      env: {
        WORKER_DRILL_MODE: 'simulate',
      },
    },
  ];

  const result = [];
  const gateStart = Date.now();

  for (const step of steps) {
    try {
      const elapsed = await runStep(step);
      result.push({ step: step.name, ok: true, elapsed });
      console.log(`[staging-gate] OK: ${step.name} (${fmtMs(elapsed)})`);
    } catch (error) {
      const elapsed = Date.now() - gateStart;
      result.push({ step: step.name, ok: false, error: String(error) });
      console.error(`\n[staging-gate][FAIL] step failed: ${step.name}`);
      console.error(`[staging-gate][FAIL] reason: ${String(error)}`);
      console.error(`[staging-gate][FAIL] total elapsed: ${fmtMs(elapsed)}`);
      console.error('[staging-gate][SUMMARY]', result);
      process.exit(1);
    }
  }

  const total = Date.now() - gateStart;
  console.log('\n[staging-gate][PASS] all steps passed');
  console.log('[staging-gate][SUMMARY]', result);
  console.log(`[staging-gate] total elapsed: ${fmtMs(total)}`);
}

main().catch((error) => {
  fail(String(error));
});
