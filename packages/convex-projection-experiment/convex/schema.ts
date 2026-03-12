import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  runboardSummaries: defineTable({
    runId: v.string(),
    updatedAt: v.number(),
    projectedAt: v.number(),
    summary: v.any(),
  })
    .index('by_run_id', ['runId'])
    .index('by_updated_at', ['updatedAt']),
});
