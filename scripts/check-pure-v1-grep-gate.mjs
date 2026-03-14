import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const includePaths = [
  'README.md',
  'AGENTS.md',
  'package.json',
  'apps',
  'packages',
  'ops',
  'prisma/schema.prisma',
  'docs/context',
  'docs/project',
  'dev-docs/active',
];

const excludedPrefixes = [
  '.git/',
  '.next/',
  '.turbo/',
  'coverage/',
  'dev-docs/archive/',
  'dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/',
  'dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/',
  'dist/',
  'node_modules/',
  'ops/deploy/reports/',
  'prisma/migrations/',
];

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.prisma',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const forbiddenPatterns = [
  { label: '/v0 path', regex: /\/v0\b/g },
  { label: 'legacy gateway term', regex: /\bgateway\b/gi },
  { label: 'legacy adapter term', regex: /adapter-wechat/gi },
  { label: 'legacy provider term', regex: /provider-sample|provider_run/gi },
  { label: '@baseinterface workspace identity', regex: /@baseinterface\//g },
  { label: 'compatProviderId token', regex: /compatProviderId/g },
  { label: 'WorkflowEntryRegistryEntry token', regex: /WorkflowEntryRegistryEntry/g },
  { label: 'replyToken token', regex: /replyToken/g },
];

function toRepoRelative(targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join('/');
}

function isExcluded(relativePath) {
  return excludedPrefixes.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

function shouldReadFile(relativePath) {
  const basename = path.basename(relativePath);
  if (basename === 'README.md' || basename === 'AGENTS.md' || basename === 'package.json') {
    return true;
  }
  return textExtensions.has(path.extname(relativePath));
}

async function walk(targetPath, matches) {
  const relativePath = toRepoRelative(targetPath);
  if (isExcluded(relativePath)) {
    return;
  }

  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  if (stats.isSymbolicLink()) {
    return;
  }

  if (stats.isDirectory()) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await walk(path.join(targetPath, entry.name), matches);
    }
    return;
  }

  if (!shouldReadFile(relativePath)) {
    return;
  }

  const contents = await fs.readFile(targetPath, 'utf8');
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hits = forbiddenPatterns
      .filter(({ regex }) => regex.test(line))
      .map(({ label }) => label);
    for (const { regex } of forbiddenPatterns) {
      regex.lastIndex = 0;
    }
    if (hits.length > 0) {
      matches.push({
        file: relativePath,
        line: index + 1,
        labels: hits,
        text: line.trim(),
      });
    }
  }
}

async function main() {
  const matches = [];
  for (const includePath of includePaths) {
    const absolutePath = path.join(repoRoot, includePath);
    try {
      await fs.access(absolutePath);
    } catch {
      continue;
    }
    await walk(absolutePath, matches);
  }

  if (matches.length > 0) {
    console.error('[grep:pure-v1] forbidden legacy terms found:');
    for (const match of matches) {
      console.error(`- ${match.file}:${match.line} [${match.labels.join(', ')}] ${match.text}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[grep:pure-v1] PASS');
}

await main();
