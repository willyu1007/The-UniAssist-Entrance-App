/**
 * system.mjs
 * Environment system test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';
import { assertIncludes, assertNotIncludes } from '../../lib/text.mjs';

export const name = 'environment-system';

function sqliteUrlFromPath(filePath) {
  const abs = path.resolve(filePath);
  const posix = abs.split(path.sep).join('/');
  return `sqlite:///${posix}`;
}

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });

  const contractctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'environment',
    'env-contractctl',
    'scripts',
    'env_contractctl.py'
  );
  const localctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'environment',
    'env-localctl',
    'scripts',
    'env_localctl.py'
  );
  const cloudctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'environment',
    'env-cloudctl',
    'scripts',
    'env_cloudctl.py'
  );

  // 1) Init (safe scaffold)
  const initMd = path.join(rootDir, 'init.md');
  const init = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', contractctl, 'init', '--root', rootDir, '--envs', 'dev,staging', '--out', initMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.init`,
  });
  if (init.error || init.code !== 0) {
    const detail = init.error ? String(init.error) : init.stderr || init.stdout;
    return { name, status: 'FAIL', error: `env-contractctl init failed: ${detail}` };
  }
  if (!fs.existsSync(path.join(rootDir, 'docs', 'project', 'env-ssot.json'))) {
    return { name, status: 'FAIL', error: 'init did not create docs/project/env-ssot.json' };
  }
  if (!fs.existsSync(path.join(rootDir, 'env', 'contract.yaml'))) {
    return { name, status: 'FAIL', error: 'init did not create env/contract.yaml' };
  }

  // 2) Extend the contract to include secrets + URL for full workflow coverage
  fs.writeFileSync(
    path.join(rootDir, 'env', 'contract.yaml'),
    `version: 1\n` +
      `variables:\n` +
      `  APP_ENV:\n` +
      `    type: enum\n` +
      `    enum: [dev, staging]\n` +
      `    required: true\n` +
      `    default: dev\n` +
      `    description: Deployment environment profile.\n` +
      `  SERVICE_NAME:\n` +
      `    type: string\n` +
      `    required: true\n` +
      `    default: demo-service\n` +
      `    description: Service name.\n` +
      `  PORT:\n` +
      `    type: int\n` +
      `    required: true\n` +
      `    default: 8000\n` +
      `    description: HTTP port.\n` +
      `  API_BASE_URL:\n` +
      `    type: url\n` +
      `    required: true\n` +
      `    default: "https://api.example.com"\n` +
      `    description: Base URL for external API.\n` +
      `  DATABASE_URL:\n` +
      `    type: url\n` +
      `    required: true\n` +
      `    secret: true\n` +
      `    secret_ref: db_url\n` +
      `    description: Database connection URL.\n` +
      `  API_KEY:\n` +
      `    type: string\n` +
      `    required: true\n` +
      `    secret: true\n` +
      `    secret_ref: api_key\n` +
      `    description: API key for external service.\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(rootDir, 'env', 'values', 'dev.yaml'),
    `SERVICE_NAME: demo-service\nPORT: 8000\nAPI_BASE_URL: "https://api.example.com"\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(rootDir, 'env', 'values', 'staging.yaml'),
    `SERVICE_NAME: demo-service\nPORT: 8000\nAPI_BASE_URL: "https://api.example.com"\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(rootDir, 'env', 'secrets', 'dev.ref.yaml'),
    `version: 1\n` +
      `secrets:\n` +
      `  db_url:\n` +
      `    backend: mock\n` +
      `    ref: "mock://dev/db_url"\n` +
      `  api_key:\n` +
      `    backend: mock\n` +
      `    ref: "mock://dev/api_key"\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(rootDir, 'env', 'secrets', 'staging.ref.yaml'),
    `version: 1\n` +
      `secrets:\n` +
      `  db_url:\n` +
      `    backend: mock\n` +
      `    ref: "mock://staging/db_url"\n` +
      `  api_key:\n` +
      `    backend: mock\n` +
      `    ref: "mock://staging/api_key"\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(rootDir, 'env', 'inventory', 'staging.yaml'),
    `version: 1\nenv: staging\nprovider: mockcloud\nruntime: mock\nregion: local\n`,
    'utf8'
  );

  // 3) Provide mock secret material (gitignored local store)
  fs.mkdirSync(path.join(rootDir, 'env', '.secrets-store', 'dev'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'env', '.secrets-store', 'staging'), { recursive: true });

  const dbPath = path.join(rootDir, '.tmp_sqlite.db');
  const mkDb = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      '-S',
      '-c',
      [
        'import sqlite3, sys',
        'p = sys.argv[1]',
        'conn = sqlite3.connect(p)',
        'conn.execute("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)")',
        'conn.commit()',
        'conn.close()',
        'print(p)',
      ].join('\n'),
      dbPath,
    ],
    evidenceDir: testDir,
    label: `${name}.mkdb`,
  });
  if (mkDb.error || mkDb.code !== 0) {
    const detail = mkDb.error ? String(mkDb.error) : mkDb.stderr || mkDb.stdout;
    return { name, status: 'FAIL', error: `failed to create sqlite db: ${detail}` };
  }

  const dbUrl = sqliteUrlFromPath(dbPath);
  fs.writeFileSync(path.join(rootDir, 'env', '.secrets-store', 'dev', 'db_url'), dbUrl + '\n', 'utf8');
  fs.writeFileSync(path.join(rootDir, 'env', '.secrets-store', 'dev', 'api_key'), 'dev-secret\n', 'utf8');
  fs.writeFileSync(path.join(rootDir, 'env', '.secrets-store', 'staging', 'db_url'), dbUrl + '\n', 'utf8');
  fs.writeFileSync(path.join(rootDir, 'env', '.secrets-store', 'staging', 'api_key'), 'staging-secret\n', 'utf8');

  // 4) Contract validate + generate
  const validationMd = path.join(rootDir, 'validation.md');
  const validate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', contractctl, 'validate', '--root', rootDir, '--out', validationMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.validate`,
  });
  if (validate.error || validate.code !== 0) {
    const detail = validate.error ? String(validate.error) : validate.stderr || validate.stdout;
    return { name, status: 'FAIL', error: `env-contractctl validate failed: ${detail}` };
  }
  assertIncludes(readUtf8(validationMd), 'Status: **PASS**', 'Expected PASS in validation.md');

  const generateMd = path.join(rootDir, 'generate.md');
  const generate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', contractctl, 'generate', '--root', rootDir, '--out', generateMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.generate`,
  });
  if (generate.error || generate.code !== 0) {
    const detail = generate.error ? String(generate.error) : generate.stderr || generate.stdout;
    return { name, status: 'FAIL', error: `env-contractctl generate failed: ${detail}` };
  }
  const envExample = path.join(rootDir, 'env', '.env.example');
  if (!fs.existsSync(envExample)) {
    return { name, status: 'FAIL', error: 'missing env/.env.example' };
  }
  assertIncludes(readUtf8(envExample), 'DATABASE_URL', 'Expected DATABASE_URL in env/.env.example');

  const envDoc = path.join(rootDir, 'docs', 'env.md');
  if (!fs.existsSync(envDoc)) {
    return { name, status: 'FAIL', error: 'missing docs/env.md' };
  }
  assertIncludes(readUtf8(envDoc), 'DATABASE_URL', 'Expected DATABASE_URL in docs/env.md');

  const contractJson = path.join(rootDir, 'docs', 'context', 'env', 'contract.json');
  if (!fs.existsSync(contractJson)) {
    return { name, status: 'FAIL', error: 'missing docs/context/env/contract.json' };
  }
  assertIncludes(readUtf8(contractJson), '"DATABASE_URL"', 'Expected DATABASE_URL in contract.json');

  // 5) Local dev: doctor + compile + connectivity (no secret leaks)
  const doctorMd = path.join(rootDir, 'doctor.md');
  const doctor = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', localctl, 'doctor', '--root', rootDir, '--env', 'dev', '--out', doctorMd],
    evidenceDir: testDir,
    label: `${name}.localctl.doctor`,
  });
  if (doctor.error || doctor.code !== 0) {
    const detail = doctor.error ? String(doctor.error) : doctor.stderr || doctor.stdout;
    return { name, status: 'FAIL', error: `env-localctl doctor failed: ${detail}` };
  }
  const doctorText = readUtf8(doctorMd);
  assertIncludes(doctorText, 'Status: **PASS**', 'Expected PASS in doctor.md');
  assertNotIncludes(doctorText, 'dev-secret', 'Doctor output leaked secret');

  const compileMd = path.join(rootDir, 'compile.md');
  const compile = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', localctl, 'compile', '--root', rootDir, '--env', 'dev', '--out', compileMd],
    evidenceDir: testDir,
    label: `${name}.localctl.compile`,
  });
  if (compile.error || compile.code !== 0) {
    const detail = compile.error ? String(compile.error) : compile.stderr || compile.stdout;
    return { name, status: 'FAIL', error: `env-localctl compile failed: ${detail}` };
  }

  const envLocal = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envLocal)) {
    return { name, status: 'FAIL', error: 'missing .env.local' };
  }

  if (process.platform !== 'win32') {
    const mode = fs.statSync(envLocal).mode & 0o777;
    if (mode !== 0o600) {
      return {
        name,
        status: 'FAIL',
        error: `expected .env.local permission 600, got ${mode.toString(8)} (filesystem may not support chmod)`,
      };
    }
  }

  const effectiveDev = path.join(rootDir, 'docs', 'context', 'env', 'effective-dev.json');
  if (!fs.existsSync(effectiveDev)) {
    return { name, status: 'FAIL', error: 'missing docs/context/env/effective-dev.json' };
  }
  assertNotIncludes(readUtf8(effectiveDev), 'dev-secret', 'Effective dev context leaked secret');

  const connectivityMd = path.join(rootDir, 'connectivity.md');
  const connectivity = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', localctl, 'connectivity', '--root', rootDir, '--env', 'dev', '--out', connectivityMd],
    evidenceDir: testDir,
    label: `${name}.localctl.connectivity`,
  });
  if (connectivity.error || connectivity.code !== 0) {
    const detail = connectivity.error ? String(connectivity.error) : connectivity.stderr || connectivity.stdout;
    return { name, status: 'FAIL', error: `env-localctl connectivity failed: ${detail}` };
  }
  const connectivityText = readUtf8(connectivityMd);
  assertIncludes(connectivityText, 'Status: **PASS**', 'Expected PASS in connectivity.md');
  assertNotIncludes(connectivityText, 'dev-secret', 'Connectivity output leaked secret');

  // 6) Cloud staging: plan/apply/verify/drift (mockcloud), rotate, decommission
  const planMd = path.join(rootDir, 'plan.md');
  const plan = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', cloudctl, 'plan', '--root', rootDir, '--env', 'staging', '--out', planMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.plan`,
  });
  if (plan.error || plan.code !== 0) {
    const detail = plan.error ? String(plan.error) : plan.stderr || plan.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl plan failed: ${detail}` };
  }
  assertIncludes(readUtf8(planMd), 'Status: **PASS**', 'Expected PASS in plan.md');

  const applyMd = path.join(rootDir, 'apply.md');
  const apply = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', cloudctl, 'apply', '--root', rootDir, '--env', 'staging', '--approve', '--out', applyMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.apply`,
  });
  if (apply.error || apply.code !== 0) {
    const detail = apply.error ? String(apply.error) : apply.stderr || apply.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl apply failed: ${detail}` };
  }
  const stateJson = path.join(rootDir, '.ai', 'mock-cloud', 'staging', 'state.json');
  if (!fs.existsSync(stateJson)) {
    return { name, status: 'FAIL', error: `missing mock cloud state.json: ${stateJson}` };
  }

  const verifyMd = path.join(rootDir, 'verify.md');
  const verify = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', cloudctl, 'verify', '--root', rootDir, '--env', 'staging', '--out', verifyMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.verify`,
  });
  if (verify.error) return { name, status: 'FAIL', error: `env-cloudctl verify errored: ${String(verify.error)}` };
  if (verify.code !== 0) return { name, status: 'FAIL', error: `env-cloudctl verify failed` };
  assertIncludes(readUtf8(verifyMd), 'Status: **PASS**', 'Expected PASS in verify.md');

  const driftMd = path.join(rootDir, 'drift.md');
  const drift = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', cloudctl, 'drift', '--root', rootDir, '--env', 'staging', '--out', driftMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.drift`,
  });
  if (drift.error) return { name, status: 'FAIL', error: `env-cloudctl drift errored: ${String(drift.error)}` };
  if (drift.code !== 0) return { name, status: 'FAIL', error: `env-cloudctl drift failed` };
  assertIncludes(readUtf8(driftMd), 'Status: **PASS**', 'Expected PASS in drift.md');

  const rotateMd = path.join(rootDir, 'rotate.md');
  const rotate = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      '-S',
      cloudctl,
      'rotate',
      '--root',
      rootDir,
      '--env',
      'staging',
      '--secret',
      'api_key',
      '--approve',
      '--out',
      rotateMd,
    ],
    evidenceDir: testDir,
    label: `${name}.cloudctl.rotate`,
  });
  if (rotate.error || rotate.code !== 0) {
    const detail = rotate.error ? String(rotate.error) : rotate.stderr || rotate.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl rotate failed: ${detail}` };
  }
  assertNotIncludes(readUtf8(rotateMd), 'staging-secret', 'Rotate output leaked secret');

  const decomMd = path.join(rootDir, 'decom.md');
  const decom = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', cloudctl, 'decommission', '--root', rootDir, '--env', 'staging', '--approve', '--out', decomMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.decommission`,
  });
  if (decom.error || decom.code !== 0) {
    const detail = decom.error ? String(decom.error) : decom.stderr || decom.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl decommission failed: ${detail}` };
  }

  const mockCloudDir = path.join(rootDir, '.ai', 'mock-cloud', 'staging');
  if (fs.existsSync(mockCloudDir)) {
    return { name, status: 'FAIL', error: `expected mock cloud env removed: ${mockCloudDir}` };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
