#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

const clusterName = process.env.KIND_CLUSTER_NAME || 'uniassist-kind';
const overlayPath = path.join(repoRoot, 'ops/deploy/k8s/overlays/kind');

function fail(message) {
  console.error(`[k8s-kind-down][FAIL] ${message}`);
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

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with ${code ?? 'unknown'}`));
      }
    });
  });
}

async function clusterExists() {
  try {
    const output = await run('kind', ['get', 'clusters'], { stdio: 'pipe' });
    return output.split('\n').map((item) => item.trim()).includes(clusterName);
  } catch {
    return false;
  }
}

async function main() {
  if (!(await clusterExists())) {
    console.log(`[k8s-kind-down] cluster not found, nothing to delete: ${clusterName}`);
    return;
  }

  console.log('[k8s-kind-down] deleting deployed manifests');
  await run('kubectl', ['delete', '-k', overlayPath, '--ignore-not-found=true']);

  console.log(`[k8s-kind-down] deleting kind cluster: ${clusterName}`);
  await run('kind', ['delete', 'cluster', '--name', clusterName]);

  console.log('[k8s-kind-down][PASS] cluster deleted');
}

main().catch((error) => {
  fail(String(error));
});
