/**
 * index.mjs
 * Database test suite
 */
import * as sqliteSmoke from './sqlite-smoke.mjs';

const TESTS = [sqliteSmoke];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][database] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][database] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
