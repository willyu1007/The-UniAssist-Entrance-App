#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const ruleFile = process.env.ALERT_RULE_FILE || path.join(repoRoot, 'ops/observability/alerts/staging.rules.yml');

const requiredAlerts = [
  'UniAssistGatewayIngestErrorRateHigh',
  'UniAssistGatewayIngestLatencyP95High',
  'UniAssistOutboxBacklogHigh',
  'UniAssistOutboxDeadLetterDetected',
  'UniAssistProviderInvokeErrorsHigh',
];

function fail(message) {
  console.error(`[alerts-validate][FAIL] ${message}`);
  process.exit(1);
}

function parseAlertBlocks(content) {
  const blocks = content.match(/-\s+alert:[\s\S]*?(?=\n\s*-\s+alert:|$)/g) || [];
  return blocks.map((block) => {
    const name = block.match(/alert:\s*([A-Za-z0-9_\-]+)/)?.[1] || '';
    const expr = block.match(/\n\s*expr:\s*([^\n]+)/)?.[1]?.trim() || '';
    const duration = block.match(/\n\s*for:\s*([^\n]+)/)?.[1]?.trim() || '';
    const severity = block.match(/\n\s*severity:\s*([^\n]+)/)?.[1]?.replace(/['\"]/g, '').trim() || '';
    const runbook = block.match(/\n\s*runbook:\s*([^\n]+)/)?.[1]?.replace(/['\"]/g, '').trim() || '';
    return { name, expr, duration, severity, runbook, raw: block };
  });
}

function main() {
  if (!fs.existsSync(ruleFile)) {
    fail(`rule file not found: ${ruleFile}`);
  }

  const content = fs.readFileSync(ruleFile, 'utf8');
  const alerts = parseAlertBlocks(content);
  if (alerts.length === 0) {
    fail('no alert blocks found');
  }

  const byName = new Map(alerts.map((a) => [a.name, a]));

  const missing = requiredAlerts.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    fail(`missing required alerts: ${missing.join(', ')}`);
  }

  const problems = [];
  requiredAlerts.forEach((name) => {
    const alert = byName.get(name);
    if (!alert) return;
    if (!alert.expr) problems.push(`${name}: missing expr`);
    if (!alert.duration) problems.push(`${name}: missing for`);
    if (!['p1', 'p2'].includes(alert.severity)) {
      problems.push(`${name}: severity must be p1/p2 (actual=${alert.severity || 'empty'})`);
    }
    if (!alert.runbook) problems.push(`${name}: missing runbook annotation`);
  });

  if (problems.length > 0) {
    fail(problems.join('; '));
  }

  const p1p2Count = requiredAlerts
    .map((name) => byName.get(name))
    .filter((alert) => alert && ['p1', 'p2'].includes(alert.severity)).length;

  if (p1p2Count < 3) {
    fail(`expected at least 3 p1/p2 alerts, got ${p1p2Count}`);
  }

  console.log('[alerts-validate][PASS] alert rules validated');
  console.log('[alerts-validate][SUMMARY]', {
    ruleFile: path.relative(repoRoot, ruleFile),
    alertCount: alerts.length,
    requiredCount: requiredAlerts.length,
    p1p2Count,
  });
}

main();
