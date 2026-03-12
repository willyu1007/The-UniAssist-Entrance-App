import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(packageDir, '.env.local');

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function startConvexDev() {
  const child = spawn('pnpm', ['exec', 'convex', 'dev', '--once', '--typecheck', 'disable'], {
    cwd: packageDir,
    env: {
      ...process.env,
      CONVEX_AGENT_MODE: 'anonymous',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[convex-projection] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[convex-projection] ${chunk}`);
  });

  return child;
}

async function waitForExit(child, timeoutMs = 30_000) {
  return await Promise.race([
    new Promise((resolvePromise, rejectPromise) => {
      child.once('exit', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error(`convex dev exited with code ${code}`));
      });
    }),
    sleep(timeoutMs).then(() => {
      throw new Error('convex dev timeout');
    }),
  ]);
}

function readConvexUrl() {
  if (!existsSync(envFile)) {
    return 'http://127.0.0.1:3210';
  }
  const content = readFileSync(envFile, 'utf8');
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('CONVEX_URL='));
  return line ? line.slice('CONVEX_URL='.length) : 'http://127.0.0.1:3210';
}

async function isBackendAvailable(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/version`);
    return response.ok;
  } catch {
    return false;
  }
}

test('convex projection workspace can bootstrap codegen locally', async () => {
  const convexUrl = readConvexUrl();
  if (!(await isBackendAvailable(convexUrl))) {
    const child = startConvexDev();
    await waitForExit(child);
  }

  const generatedApi = await import(resolve(packageDir, 'convex/_generated/api.js'));
  assert.ok(generatedApi.api.runboard.listRecent);
});
