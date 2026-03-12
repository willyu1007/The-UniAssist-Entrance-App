import { mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';

type RunboardSummaryDoc = {
  runId: string;
  updatedAt: number;
  projectedAt: number;
  summary: Record<string, unknown>;
};

async function upsertRunboardSummary(
  ctx: MutationCtx,
  doc: RunboardSummaryDoc,
): Promise<void> {
  const existing = await ctx.db
    .query('runboardSummaries')
    .withIndex('by_run_id', (q) => q.eq('runId', doc.runId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return;
  }

  await ctx.db.insert('runboardSummaries', doc);
}

export const listRecent = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit, 200));
    const docs = await ctx.db
      .query('runboardSummaries')
      .withIndex('by_updated_at')
      .order('desc')
      .take(limit);

    return docs.map((doc) => doc.summary);
  },
});

export const upsert = mutation({
  args: {
    projectedAt: v.number(),
    summary: v.any(),
  },
  handler: async (ctx, args) => {
    const summary = args.summary as RunboardSummaryDoc['summary'] & { runId: string; updatedAt: number };
    await upsertRunboardSummary(ctx, {
      runId: String(summary.runId),
      updatedAt: Number(summary.updatedAt),
      projectedAt: args.projectedAt,
      summary,
    });
    return { ok: true };
  },
});

export const bootstrap = mutation({
  args: {
    limit: v.number(),
    projectedAt: v.number(),
    runs: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit, 200));
    const runs = (args.runs as Array<Record<string, unknown>>).slice(0, limit);
    const targetRunIds = new Set<string>();

    for (const summary of runs) {
      const runId = String(summary.runId);
      targetRunIds.add(runId);
      await upsertRunboardSummary(ctx, {
        runId,
        updatedAt: Number(summary.updatedAt),
        projectedAt: args.projectedAt,
        summary,
      });
    }

    const existing = await ctx.db
      .query('runboardSummaries')
      .withIndex('by_updated_at')
      .order('desc')
      .collect();

    for (const doc of existing) {
      if (!targetRunIds.has(doc.runId)) {
        await ctx.db.delete(doc._id);
      }
    }

    return { count: runs.length };
  },
});
