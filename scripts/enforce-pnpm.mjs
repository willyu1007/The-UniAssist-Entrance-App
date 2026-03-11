const packageManager = 'pnpm@10.28.0';
const userAgent = process.env.npm_config_user_agent || '';
const execPath = process.env.npm_execpath || '';

const isPnpm = userAgent.includes('pnpm/') || execPath.includes('pnpm');

if (isPnpm) {
  process.exit(0);
}

console.error(
  [
    'This repository uses pnpm only.',
    `Expected package manager: ${packageManager}`,
    'Install and use pnpm via Corepack:',
    '  corepack enable',
    `  corepack prepare ${packageManager} --activate`,
    '  pnpm install',
  ].join('\n'),
);

process.exit(1);
