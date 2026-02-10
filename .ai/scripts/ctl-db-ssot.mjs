#!/usr/bin/env node
/**
 * ctl-db-ssot.mjs
 *
 * SSOT-aware database schema context generator.
 *
 * Goal:
 * - Provide a single, deterministic "database shape" artifact for LLMs:
 *   docs/context/db/schema.json (normalized-db-schema-v2)
 * - Support mutually-exclusive DB SSOT modes:
 *   - none         : no managed SSOT in repo
 *   - repo-prisma  : prisma/schema.prisma is SSOT (code -> db)
 *   - database     : real DB is SSOT (db -> code); repo holds mirrors
 *
 * Config (created by init pipeline):
 *   docs/project/db-ssot.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  readJsonIfExists,
  readTextIfExists,
  writeJson,
  parsePrismaSchema,
  normalizeDbMirrorSchema,
  buildNormalizedDbSchema,
  NORMALIZED_DB_SCHEMA_VERSION
} from './lib/normalized-db-schema.mjs';


function stableStringifyForCompare(value) {
  const seen = new WeakSet();
  function normalize(v) {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      if (Array.isArray(v)) return v.map(normalize);
      const out = {};
      for (const k of Object.keys(v).sort()) {
        out[k] = normalize(v[k]);
      }
      return out;
    }
    return v;
  }
  return JSON.stringify(normalize(value));
}

function withoutUpdatedAt(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = { ...obj };
  delete copy.updatedAt;
  return copy;
}

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/ctl-db-ssot.mjs <command> [options]

Commands:
  help
    Show this help.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show resolved DB SSOT mode and source paths.

  sync-to-context
    --repo-root <path>          Repo root (default: cwd)
    --out <path>                Output path (default: docs/context/db/schema.json)
    --format <text|json>        Output format (default: text)
    Generate/update the normalized DB schema contract for LLMs.

Notes:
- This script is safe to run in CI.
- It never requires DB credentials. For DB SSOT mode it reads repo mirrors.
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};
  const positionals = [];

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function loadDbSsotConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'docs', 'project', 'db-ssot.json');
  const raw = readJsonIfExists(configPath);
  if (!raw) return { path: configPath, config: null };

  const ssot = raw?.db?.ssot || raw?.ssot || raw?.mode;
  const mode =
    typeof ssot === 'string'
      ? ssot.trim()
      : ssot && typeof ssot === 'object' && typeof ssot.mode === 'string'
        ? ssot.mode.trim()
        : '';

  return { path: configPath, config: raw, mode };
}

function inferMode(repoRoot) {
  const prismaSchema = path.join(repoRoot, 'prisma', 'schema.prisma');
  const dbMirror = path.join(repoRoot, 'db', 'schema', 'tables.json');

  if (exists(prismaSchema)) return 'repo-prisma';
  if (exists(dbMirror)) return 'database';
  return 'none';
}

function resolveMode(repoRoot) {
  const { path: configPath, config, mode: configuredMode } = loadDbSsotConfig(repoRoot);

  const supported = new Set(['none', 'repo-prisma', 'database']);

  if (configuredMode && supported.has(configuredMode)) {
    return {
      mode: configuredMode,
      source: 'config',
      configPath,
      config
    };
  }

  return {
    mode: inferMode(repoRoot),
    source: configuredMode ? 'infer (invalid config)' : 'infer (no config)',
    configPath,
    config
  };
}

function buildContractFromPrisma({ repoRoot, mode }) {
  const prismaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
  const prismaText = readTextIfExists(prismaPath);

  if (!prismaText) {
    return {
      contract: buildNormalizedDbSchema({
        mode,
        source: { kind: 'prisma-schema', path: toPosix(path.relative(repoRoot, prismaPath)) },
        database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
        enums: [],
        tables: [],
        notes: `Missing prisma schema at ${toPosix(path.relative(repoRoot, prismaPath))}. Create it, then re-run ctl-db-ssot.`
      }),
      warnings: [`Missing Prisma schema: ${toPosix(path.relative(repoRoot, prismaPath))}`]
    };
  }

  const parsed = parsePrismaSchema(prismaText);
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings : [];
  return {
    contract: buildNormalizedDbSchema({
      mode,
      source: { kind: 'prisma-schema', path: toPosix(path.relative(repoRoot, prismaPath)) },
      database: parsed.database,
      enums: parsed.enums,
      tables: parsed.tables,
      notes: `Generated from Prisma schema.prisma (SSOT: ${mode}).`
    }),
    warnings
  };
}

function buildContractFromDbMirror({ repoRoot, mode }) {
  const mirrorPath = path.join(repoRoot, 'db', 'schema', 'tables.json');
  const raw = readJsonIfExists(mirrorPath);

  if (!raw) {
    return {
      contract: buildNormalizedDbSchema({
        mode,
        source: { kind: 'db-mirror', path: toPosix(path.relative(repoRoot, mirrorPath)) },
        database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
        enums: [],
        tables: [],
        notes: `Missing DB mirror at ${toPosix(path.relative(repoRoot, mirrorPath))}. Initialize db-mirror and import schema, then re-run ctl-db-ssot.`
      }),
      warnings: [`Missing DB mirror: ${toPosix(path.relative(repoRoot, mirrorPath))}`]
    };
  }

  const normalized = normalizeDbMirrorSchema(raw);

  // Ensure ssot.mode matches current mode.
  normalized.ssot = normalized.ssot || { mode, source: { kind: 'db-mirror', path: '' } };
  normalized.ssot.mode = mode;
  normalized.ssot.source = normalized.ssot.source || { kind: 'db-mirror', path: '' };
  normalized.ssot.source.kind = normalized.ssot.source.kind || 'db-mirror';
  normalized.ssot.source.path = normalized.ssot.source.path || toPosix(path.relative(repoRoot, mirrorPath));

  normalized.notes = normalized.notes || `Mirrored from real DB via repo artifacts (SSOT: ${mode}).`;

  return { contract: normalized, warnings: [] };
}

function buildContractNone({ repoRoot }) {
  return {
    contract: buildNormalizedDbSchema({
      mode: 'none',
      source: { kind: 'none', path: '' },
      database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
      enums: [],
      tables: [],
      notes: 'DB SSOT mode is "none". This contract is intentionally empty.'
    }),
    warnings: []
  };
}

function runContextTouch(repoRoot) {
  const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
  if (!exists(contextctl)) return { ran: false, reason: 'ctl-context.mjs not found' };

  const res = spawnSync('node', [contextctl, 'touch', '--repo-root', repoRoot], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (res.status !== 0) {
    return { ran: true, ok: false, exitCode: res.status };
  }

  return { ran: true, ok: true };
}

function cmdStatus(repoRoot, format) {
  const resolved = resolveMode(repoRoot);
  const prismaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
  const mirrorPath = path.join(repoRoot, 'db', 'schema', 'tables.json');
  const outPath = path.join(repoRoot, 'docs', 'context', 'db', 'schema.json');

  const status = {
    mode: resolved.mode,
    source: resolved.source,
    configPath: toPosix(path.relative(repoRoot, resolved.configPath)),
    paths: {
      prismaSchema: toPosix(path.relative(repoRoot, prismaPath)),
      dbMirror: toPosix(path.relative(repoRoot, mirrorPath)),
      contextContract: toPosix(path.relative(repoRoot, outPath))
    },
    exists: {
      prismaSchema: exists(prismaPath),
      dbMirror: exists(mirrorPath),
      contextContract: exists(outPath)
    }
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('DB SSOT Status');
  console.log('');
  console.log(`  Mode:   ${status.mode}`);
  console.log(`  Source: ${status.source}`);
  console.log(`  Config: ${status.configPath} (${exists(resolved.configPath) ? 'present' : 'missing'})`);
  console.log('');
  console.log('  Key paths:');
  console.log(`    - Prisma schema:   ${status.paths.prismaSchema} (${status.exists.prismaSchema ? 'present' : 'missing'})`);
  console.log(`    - DB mirror:       ${status.paths.dbMirror} (${status.exists.dbMirror ? 'present' : 'missing'})`);
  console.log(`    - Context contract:${status.paths.contextContract} (${status.exists.contextContract ? 'present' : 'missing'})`);
}

function cmdSyncToContext(repoRoot, outPath, format) {
  const resolved = resolveMode(repoRoot);

  let built;
  if (resolved.mode === 'repo-prisma') {
    built = buildContractFromPrisma({ repoRoot, mode: 'repo-prisma' });
  } else if (resolved.mode === 'database') {
    built = buildContractFromDbMirror({ repoRoot, mode: 'database' });
  } else {
    built = buildContractNone({ repoRoot });
  }

  const outputPath = resolvePath(repoRoot, outPath || path.join('docs', 'context', 'db', 'schema.json'));
  if (!outputPath) die('[error] Failed to resolve output path');

  // Ensure target dir exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Sanity: enforce expected version
  if (built.contract.version !== NORMALIZED_DB_SCHEMA_VERSION) {
    built.contract.version = NORMALIZED_DB_SCHEMA_VERSION;
  }

  // Preserve updatedAt when the generated contract is structurally identical.
  const existing = readJsonIfExists(outputPath);
  if (existing && typeof existing === 'object') {
    const a = stableStringifyForCompare(withoutUpdatedAt(existing));
    const b = stableStringifyForCompare(withoutUpdatedAt(built.contract));
    if (a === b && typeof existing.updatedAt === 'string' && existing.updatedAt) {
      built.contract.updatedAt = existing.updatedAt;
    }
  }

  writeJson(outputPath, built.contract);

  const touchRes = runContextTouch(repoRoot);

  const result = {
    ok: true,
    mode: resolved.mode,
    out: toPosix(path.relative(repoRoot, outputPath)),
    warnings: built.warnings,
    contextTouch: touchRes
  };

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[ok] Context DB contract updated.');
  console.log(`  - Mode: ${resolved.mode}`);
  console.log(`  - Out:  ${result.out}`);
  if (built.warnings && built.warnings.length > 0) {
    for (const w of built.warnings) console.warn(`[warn] ${w}`);
  }
  if (touchRes.ran) {
    console.log(`  - ctl-context touch: ${touchRes.ok ? 'ok' : `failed (exit ${touchRes.exitCode})`}`);
  } else {
    console.log(`  - ctl-context touch: skipped (${touchRes.reason})`);
  }
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = String(opts['format'] || 'text').toLowerCase();
  const out = opts['out'];

  if (command === 'help') usage(0);
  if (command === 'status') return cmdStatus(repoRoot, format);
  if (command === 'sync-to-context') return cmdSyncToContext(repoRoot, out, format);

  usage(1);
}

main();
