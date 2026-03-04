#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const overlayPath = path.join(repoRoot, 'ops/deploy/k8s/overlays/staging');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function main() {
  console.log('[k8s-staging-validate] render overlay');
  await run('kubectl', ['kustomize', overlayPath]);

  console.log('[k8s-staging-validate] client dry-run');
  await run('kubectl', ['apply', '--dry-run=client', '-k', overlayPath]);

  console.log('[k8s-staging-validate][PASS] overlay is valid');
}

main().catch((error) => {
  console.error(`[k8s-staging-validate][FAIL] ${String(error)}`);
  process.exit(1);
});
