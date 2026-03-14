#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value.replace(/\/$/, '');
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? value.replace(/\/$/, '') : '';
}

async function checkHealth(baseUrl, pathSuffix = '/health') {
  const url = `${baseUrl}${pathSuffix}`;
  const response = await fetch(url);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    url,
    ok: response.status === 200 && (pathSuffix === '/' ? /<html/i.test(text) : json?.ok === true),
    status: response.status,
  };
}

function evaluateAlertRules(statuses) {
  const runbook = 'ops/observability/runbooks/incident-playbook.md';
  return [
    {
      alert: 'UniAssistControlConsoleUnavailable',
      severity: 'p2',
      fired: statuses.controlConsole === 'unavailable',
      value: statuses.controlConsole,
      runbook: `${runbook}#p2-control-console-unavailable`,
    },
    {
      alert: 'UniAssistWorkflowPlatformApiUnavailable',
      severity: 'p1',
      fired: statuses.workflowPlatformApi === 'unavailable',
      value: statuses.workflowPlatformApi,
      runbook: `${runbook}#p1-workflow-platform-api-unavailable`,
    },
    {
      alert: 'UniAssistWorkflowRuntimeUnavailable',
      severity: 'p1',
      fired: statuses.workflowRuntime === 'unavailable',
      value: statuses.workflowRuntime,
      runbook: `${runbook}#p1-workflow-runtime-unavailable`,
    },
    {
      alert: 'UniAssistConnectorRuntimeUnavailable',
      severity: 'p2',
      fired: statuses.connectorRuntime === 'unavailable',
      value: statuses.connectorRuntime,
      runbook: `${runbook}#p2-connector-runtime-unavailable`,
    },
    {
      alert: 'UniAssistTriggerSchedulerUnavailable',
      severity: 'p2',
      fired: statuses.triggerScheduler === 'unavailable',
      value: statuses.triggerScheduler,
      runbook: `${runbook}#p2-trigger-scheduler-unavailable`,
    },
    {
      alert: 'UniAssistWorkerUnavailable',
      severity: 'p1',
      fired: statuses.worker === 'unavailable',
      value: statuses.worker,
      runbook: `${runbook}#p1-worker-unavailable`,
    },
  ];
}

function toMarkdown({ mode, serviceChecks, nowEvaluations, simulationEvaluations, outputPath }) {
  const lines = [];
  lines.push('# Staging Alert Drill Report');
  lines.push('');
  lines.push(`- Timestamp: ${nowIso()}`);
  lines.push(`- Mode: ${mode}`);
  lines.push('');
  lines.push('## Service checks');
  lines.push('');
  lines.push('| Service | Status | URL |');
  lines.push('| --- | --- | --- |');
  serviceChecks.forEach((item) => {
    lines.push(`| ${item.service} | ${item.ok ? 'healthy' : 'unavailable'} | ${item.url || 'n/a'} |`);
  });
  lines.push('');
  lines.push('## Current alert evaluation');
  lines.push('');
  lines.push('| Alert | Severity | Fired | Value | Runbook |');
  lines.push('| --- | --- | --- | --- | --- |');
  nowEvaluations.forEach((item) => {
    lines.push(`| ${item.alert} | ${item.severity} | ${item.fired ? 'yes' : 'no'} | ${item.value} | ${item.runbook} |`);
  });

  if (simulationEvaluations) {
    lines.push('');
    lines.push('## Simulation evaluation');
    lines.push('');
    lines.push('| Alert | Severity | Fired | Value | Runbook |');
    lines.push('| --- | --- | --- | --- | --- |');
    simulationEvaluations.forEach((item) => {
      lines.push(`| ${item.alert} | ${item.severity} | ${item.fired ? 'yes' : 'no'} | ${item.value} | ${item.runbook} |`);
    });
  }

  lines.push('');
  lines.push(`- Report path: ${outputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = (process.env.DRILL_MODE || 'simulate').trim();
  const reportPath = process.env.DRILL_OUTPUT_PATH || path.join('ops', 'observability', 'reports', 'staging-drill-latest.md');

  const serviceChecks = [];
  const controlConsoleBase = requiredEnv('STAGING_CONTROL_CONSOLE_BASE_URL');
  const workflowPlatformApiBase = requiredEnv('STAGING_WORKFLOW_PLATFORM_API_BASE_URL');
  const workflowRuntimeBase = optionalEnv('STAGING_WORKFLOW_RUNTIME_BASE_URL');
  const connectorRuntimeBase = optionalEnv('STAGING_CONNECTOR_RUNTIME_BASE_URL');
  const triggerSchedulerBase = optionalEnv('STAGING_TRIGGER_SCHEDULER_BASE_URL');
  const workerStatus = (process.env.STAGING_WORKER_STATUS || 'healthy').trim().toLowerCase() === 'unavailable'
    ? 'unavailable'
    : 'healthy';

  const controlConsole = await checkHealth(controlConsoleBase, '/');
  serviceChecks.push({ service: 'control-console', ...controlConsole });
  const platform = await checkHealth(workflowPlatformApiBase);
  serviceChecks.push({ service: 'workflow-platform-api', ...platform });

  let runtime = { ok: true, url: '', status: 0 };
  if (workflowRuntimeBase) {
    runtime = await checkHealth(workflowRuntimeBase);
    serviceChecks.push({ service: 'workflow-runtime', ...runtime });
  }

  let connector = { ok: true, url: '', status: 0 };
  if (connectorRuntimeBase) {
    connector = await checkHealth(connectorRuntimeBase);
    serviceChecks.push({ service: 'connector-runtime', ...connector });
  }

  let scheduler = { ok: true, url: '', status: 0 };
  if (triggerSchedulerBase) {
    scheduler = await checkHealth(triggerSchedulerBase);
    serviceChecks.push({ service: 'trigger-scheduler', ...scheduler });
  }

  serviceChecks.push({ service: 'worker', ok: workerStatus === 'healthy', url: '', status: workerStatus === 'healthy' ? 200 : 503 });

  const currentStatuses = {
    controlConsole: controlConsole.ok ? 'healthy' : 'unavailable',
    workflowPlatformApi: platform.ok ? 'healthy' : 'unavailable',
    workflowRuntime: workflowRuntimeBase ? (runtime.ok ? 'healthy' : 'unavailable') : 'skipped',
    connectorRuntime: connectorRuntimeBase ? (connector.ok ? 'healthy' : 'unavailable') : 'skipped',
    triggerScheduler: triggerSchedulerBase ? (scheduler.ok ? 'healthy' : 'unavailable') : 'skipped',
    worker: workerStatus,
  };

  const nowEvaluations = evaluateAlertRules(currentStatuses);
  let simulationEvaluations = null;
  if (mode === 'simulate') {
    simulationEvaluations = evaluateAlertRules({
      ...currentStatuses,
      controlConsole: 'unavailable',
      workflowRuntime: 'unavailable',
      worker: 'unavailable',
    });
  }

  const reportAbs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  fs.mkdirSync(path.dirname(reportAbs), { recursive: true });
  const markdown = toMarkdown({
    mode,
    serviceChecks,
    nowEvaluations,
    simulationEvaluations,
    outputPath: reportPath,
  });
  fs.writeFileSync(reportAbs, markdown, 'utf8');

  console.log('[alert-drill][PASS] pure-v1 staging drill complete');
  console.log('[alert-drill][SUMMARY]', {
    mode,
    reportPath,
    currentlyFiring: nowEvaluations.filter((item) => item.fired).map((item) => item.alert),
    simulatedFiring: simulationEvaluations ? simulationEvaluations.filter((item) => item.fired).map((item) => item.alert) : [],
  });
}

main().catch((error) => {
  console.error('[alert-drill][FAIL]', String(error));
  process.exit(1);
});
