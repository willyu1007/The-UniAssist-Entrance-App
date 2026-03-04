#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

const clusterName = process.env.KIND_CLUSTER_NAME || 'uniassist-kind';
const kindConfigPath = path.join(repoRoot, 'ops/deploy/k8s/kind/cluster.yaml');
const overlayPath = path.join(repoRoot, 'ops/deploy/k8s/overlays/kind');

const services = [
  { id: 'gateway', image: 'uniassist/gateway:local', dockerfile: 'ops/packaging/services/gateway.Dockerfile' },
  {
    id: 'provider-plan',
    image: 'uniassist/provider-plan:local',
    dockerfile: 'ops/packaging/services/provider-plan.Dockerfile',
  },
  {
    id: 'adapter-wechat',
    image: 'uniassist/adapter-wechat:local',
    dockerfile: 'ops/packaging/services/adapter-wechat.Dockerfile',
  },
  { id: 'worker', image: 'uniassist/worker:local', dockerfile: 'ops/packaging/services/worker.Dockerfile' },
];

function fail(message) {
  console.error(`[k8s-kind-up][FAIL] ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || repoRoot,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: options.stdio || 'inherit',
    });

    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with ${code ?? 'unknown'}: ${stderr || stdout}`));
      }
    });
  });
}

async function ensureCommand(cmd, args = ['--version']) {
  try {
    await run(cmd, args, { stdio: 'ignore' });
  } catch {
    fail(`required command not found or not runnable: ${cmd}`);
  }
}

async function clusterExists() {
  try {
    const result = await run('kind', ['get', 'clusters'], { stdio: 'pipe' });
    return result.stdout.split('\n').map((item) => item.trim()).includes(clusterName);
  } catch {
    return false;
  }
}

async function waitForRollout(deployment, timeoutSeconds = 240) {
  await run('kubectl', [
    '-n',
    'uniassist-staging',
    'rollout',
    'status',
    `deployment/${deployment}`,
    `--timeout=${timeoutSeconds}s`,
  ]);
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore transient errors while waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  await ensureCommand('docker');
  await ensureCommand('kind');
  await ensureCommand('kubectl', ['version', '--client']);

  if (!(await clusterExists())) {
    console.log(`[k8s-kind-up] creating kind cluster: ${clusterName}`);
    await run('kind', ['create', 'cluster', '--name', clusterName, '--config', kindConfigPath]);
  } else {
    console.log(`[k8s-kind-up] kind cluster already exists: ${clusterName}`);
  }

  for (const service of services) {
    console.log(`[k8s-kind-up] building image: ${service.image}`);
    await run('docker', ['build', '-f', service.dockerfile, '-t', service.image, '.']);
  }

  console.log('[k8s-kind-up] loading images into kind');
  await run('kind', ['load', 'docker-image', '--name', clusterName, ...services.map((service) => service.image)]);

  console.log('[k8s-kind-up] applying manifests');
  await run('kubectl', ['apply', '-k', overlayPath]);

  const deployments = ['postgres', 'redis', 'provider-plan', 'gateway', 'adapter-wechat', 'worker'];
  for (const deployment of deployments) {
    console.log(`[k8s-kind-up] waiting rollout: ${deployment}`);
    await waitForRollout(deployment);
  }

  await waitForHttp('http://127.0.0.1:8787/health', 120000);
  await waitForHttp('http://127.0.0.1:8788/health', 120000);

  await run('kubectl', ['-n', 'uniassist-staging', 'get', 'pods']);
  await run('kubectl', ['-n', 'uniassist-staging', 'get', 'svc']);

  console.log('[k8s-kind-up][PASS] kind cluster is ready');
  console.log('[k8s-kind-up] gateway: http://127.0.0.1:8787/health');
  console.log('[k8s-kind-up] adapter-wechat: http://127.0.0.1:8788/health');
}

main().catch((error) => {
  fail(String(error));
});
