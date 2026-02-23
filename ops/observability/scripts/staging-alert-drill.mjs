#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseMetrics(text) {
  const out = new Map();
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [name, value] = trimmed.split(/\s+/);
    if (!name || value === undefined) return;
    const n = Number(value);
    if (Number.isFinite(n)) {
      out.set(name, n);
    }
  });
  return out;
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function evaluateAlertRules(metrics, thresholds) {
  const get = (key) => num(metrics.get(key), 0);
  const evaluations = [
    {
      alert: 'UniAssistGatewayIngestErrorRateHigh',
      severity: 'p1',
      fired: get('uniassist_gateway_ingest_error_rate') > thresholds.ingestErrorRate,
      value: get('uniassist_gateway_ingest_error_rate'),
      threshold: thresholds.ingestErrorRate,
      runbook: 'ops/observability/runbooks/incident-playbook.md#p1-gateway-ingest-error-rate-high',
    },
    {
      alert: 'UniAssistGatewayIngestLatencyP95High',
      severity: 'p2',
      fired: get('uniassist_gateway_ingest_latency_p95_ms') > thresholds.ingestLatencyP95Ms,
      value: get('uniassist_gateway_ingest_latency_p95_ms'),
      threshold: thresholds.ingestLatencyP95Ms,
      runbook: 'ops/observability/runbooks/incident-playbook.md#p2-gateway-ingest-latency-high',
    },
    {
      alert: 'UniAssistOutboxBacklogHigh',
      severity: 'p1',
      fired: get('uniassist_outbox_backlog_total') > thresholds.outboxBacklog,
      value: get('uniassist_outbox_backlog_total'),
      threshold: thresholds.outboxBacklog,
      runbook: 'ops/observability/runbooks/incident-playbook.md#p1-outbox-backlog-high',
    },
    {
      alert: 'UniAssistOutboxDeadLetterDetected',
      severity: 'p1',
      fired: get('uniassist_outbox_dead_letter_total') > thresholds.outboxDeadLetter,
      value: get('uniassist_outbox_dead_letter_total'),
      threshold: thresholds.outboxDeadLetter,
      runbook: 'ops/observability/runbooks/incident-playbook.md#p1-dead-letter-detected',
    },
    {
      alert: 'UniAssistProviderInvokeErrorsHigh',
      severity: 'p2',
      fired: get('uniassist_gateway_provider_invoke_error_total') > thresholds.providerInvokeErrors,
      value: get('uniassist_gateway_provider_invoke_error_total'),
      threshold: thresholds.providerInvokeErrors,
      runbook: 'ops/observability/runbooks/incident-playbook.md#p2-provider-invoke-errors-high',
    },
  ];

  return evaluations;
}

function toMarkdown({ mode, gatewayBaseUrl, nowEvaluations, simulationEvaluations, outputPath }) {
  const lines = [];
  lines.push('# Staging Alert Drill Report');
  lines.push('');
  lines.push(`- Timestamp: ${nowIso()}`);
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Gateway: ${gatewayBaseUrl}`);
  lines.push('');
  lines.push('## Current metric evaluation');
  lines.push('');
  lines.push('| Alert | Severity | Fired | Value | Threshold |');
  lines.push('| --- | --- | --- | --- | --- |');
  nowEvaluations.forEach((item) => {
    lines.push(`| ${item.alert} | ${item.severity} | ${item.fired ? 'yes' : 'no'} | ${item.value} | ${item.threshold} |`);
  });

  if (simulationEvaluations) {
    lines.push('');
    lines.push('## Simulation evaluation');
    lines.push('');
    lines.push('| Alert | Severity | Fired | Value | Threshold | Runbook |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    simulationEvaluations.forEach((item) => {
      lines.push(`| ${item.alert} | ${item.severity} | ${item.fired ? 'yes' : 'no'} | ${item.value} | ${item.threshold} | ${item.runbook} |`);
    });
  }

  lines.push('');
  lines.push(`- Report path: ${outputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const gatewayBaseUrl = (process.env.STAGING_GATEWAY_BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
  const mode = (process.env.DRILL_MODE || 'simulate').trim();
  const reportPath = process.env.DRILL_OUTPUT_PATH || path.join('ops', 'observability', 'reports', 'staging-drill-latest.md');

  const thresholds = {
    ingestErrorRate: num(process.env.DRILL_THRESHOLD_INGEST_ERROR_RATE, 0.05),
    ingestLatencyP95Ms: num(process.env.DRILL_THRESHOLD_INGEST_LATENCY_P95_MS, 1500),
    outboxBacklog: num(process.env.DRILL_THRESHOLD_OUTBOX_BACKLOG, 100),
    outboxDeadLetter: num(process.env.DRILL_THRESHOLD_OUTBOX_DEAD_LETTER, 0),
    providerInvokeErrors: num(process.env.DRILL_THRESHOLD_PROVIDER_INVOKE_ERRORS, 10),
  };

  const health = await getJson(`${gatewayBaseUrl}/health`);
  if (health.status !== 200 || health.json?.ok !== true) {
    throw new Error(`gateway health check failed: status=${health.status}`);
  }

  const metricsRes = await getJson(`${gatewayBaseUrl}/metrics`);
  if (metricsRes.status !== 200) {
    throw new Error(`metrics endpoint failed: status=${metricsRes.status}`);
  }

  const metricMap = parseMetrics(metricsRes.text);
  const nowEvaluations = evaluateAlertRules(metricMap, thresholds);

  let simulationEvaluations = null;
  if (mode === 'simulate') {
    const simulated = new Map(metricMap);
    simulated.set('uniassist_gateway_ingest_error_rate', 0.12);
    simulated.set('uniassist_gateway_ingest_latency_p95_ms', 2200);
    simulated.set('uniassist_outbox_backlog_total', 180);
    simulated.set('uniassist_outbox_dead_letter_total', 2);
    simulated.set('uniassist_gateway_provider_invoke_error_total', 25);

    simulationEvaluations = evaluateAlertRules(simulated, thresholds);
    const fired = simulationEvaluations.filter((item) => item.fired);
    if (fired.length < 3) {
      throw new Error(`simulation expected >=3 alerts fired, actual=${fired.length}`);
    }
  }

  const reportAbs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  fs.mkdirSync(path.dirname(reportAbs), { recursive: true });
  const markdown = toMarkdown({
    mode,
    gatewayBaseUrl,
    nowEvaluations,
    simulationEvaluations,
    outputPath: reportPath,
  });
  fs.writeFileSync(reportAbs, markdown, 'utf8');

  console.log('[alert-drill][PASS] staging drill complete');
  console.log('[alert-drill][SUMMARY]', {
    gatewayBaseUrl,
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
