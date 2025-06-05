// ================================================
// INTELLIGENT CACHING LAYER
// ================================================
// client-template/convex/performance/cache.ts

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { withSecurity } from "../lib/security";

// Cache configuration
const CACHE_CONFIGS = {
  userProfile: { ttl: 5 * 60 * 1000 }, // 5 minutes
  caseList: { ttl: 60 * 1000 }, // 1 minute
  documentMetadata: { ttl: 10 * 60 * 1000 }, // 10 minutes
  aiSummary: { ttl: 60 * 60 * 1000 }, // 1 hour
};

// Generic cache wrapper
export function withCache<TArgs, TReturn>(
  cacheKey: keyof typeof CACHE_CONFIGS,
  queryFn: (ctx: any, args: TArgs) => Promise<TReturn>
) {
  return async (ctx: any, args: TArgs): Promise<TReturn> => {
    const cacheId = `${cacheKey}:${JSON.stringify(args)}`;
    
    // Check cache
    const cached = await ctx.db
      .query("cache")
      .withIndex("by_key", (q) => q.eq("key", cacheId))
      .first();
    
    if (cached && Date.now() - cached.createdAt < CACHE_CONFIGS[cacheKey].ttl) {
      // Log cache hit
      await ctx.scheduler.runAfter(0, internal.performance.logCacheHit, {
        cacheKey,
        hitRate: true,
      });
      
      return cached.value as TReturn;
    }
    
    // Cache miss - execute query
    const result = await queryFn(ctx, args);
    
    // Store in cache
    if (cached) {
      await ctx.db.patch(cached._id, {
        value: result,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.insert("cache", {
        key: cacheId,
        value: result,
        createdAt: Date.now(),
      });
    }
    
    // Log cache miss
    await ctx.scheduler.runAfter(0, internal.performance.logCacheHit, {
      cacheKey,
      hitRate: false,
    });
    
    return result;
  };
}

// Cached case list query
export const listCasesCached = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: withCache("caseList", async (ctx, args) => {
    // Original query logic
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_status", (q) => 
        args.status ? q.eq("status", args.status) : q
      )
      .order("desc")
      .take(args.limit || 50);
    
    return cases;
  }),
});

// Intelligent cache invalidation
export const invalidateCache = internalMutation({
  args: {
    patterns: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const pattern of args.patterns) {
      const entries = await ctx.db
        .query("cache")
        .filter((q) => q.eq(q.field("key").startsWith(pattern), true))
        .collect();
      
      for (const entry of entries) {
        await ctx.db.delete(entry._id);
      }
    }
    
    return null;
  },
});

// ================================================
// CDN & STATIC ASSET OPTIMIZATION
// ================================================
// client-template/convex/performance/cdn.ts

import { v } from "convex/values";
import { action, mutation } from "../_generated/server";

// Generate CDN URLs for documents
export const getCdnUrl = action({
  args: {
    storageId: v.id("_storage"),
    optimization: v.optional(v.object({
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      quality: v.optional(v.number()),
      format: v.optional(v.string()),
    })),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Get base URL
    const baseUrl = await ctx.storage.getUrl(args.storageId);
    if (!baseUrl) throw new Error("File not found");
    
    // Apply CDN transformations
    const cdnUrl = new URL(baseUrl);
    cdnUrl.hostname = process.env.CDN_HOSTNAME || cdnUrl.hostname;
    
    // Add optimization parameters
    if (args.optimization) {
      const params = new URLSearchParams();
      if (args.optimization.width) params.set("w", args.optimization.width.toString());
      if (args.optimization.height) params.set("h", args.optimization.height.toString());
      if (args.optimization.quality) params.set("q", args.optimization.quality.toString());
      if (args.optimization.format) params.set("fm", args.optimization.format);
      
      cdnUrl.search = params.toString();
    }
    
    // Add cache headers
    cdnUrl.searchParams.set("cache", "immutable");
    cdnUrl.searchParams.set("expires", "31536000"); // 1 year
    
    return cdnUrl.toString();
  },
});

// Preload critical assets
export const preloadAssets = mutation({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    // Get frequently accessed documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .filter((q) => q.gt(q.field("accessCount"), 5))
      .order("desc")
      .take(10);
    
    const preloadUrls = [];
    
    for (const doc of documents) {
      // Generate thumbnail URL
      if (doc.thumbnailStorageId) {
        const thumbnailUrl = await getCdnUrl(ctx, {
          storageId: doc.thumbnailStorageId,
          optimization: {
            width: 200,
            height: 200,
            quality: 85,
            format: "webp",
          },
        });
        preloadUrls.push(thumbnailUrl);
      }
    }
    
    return preloadUrls;
  },
});

// ================================================
// QUERY OPTIMIZATION & INDEXING
// ================================================
// client-template/convex/performance/queryOptimizer.ts

import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

// Analyze query performance
export const analyzeQueryPerformance = internalQuery({
  args: {},
  returns: v.array(v.object({
    queryName: v.string(),
    avgExecutionTime: v.number(),
    callCount: v.number(),
    slowestExecution: v.number(),
    recommendations: v.array(v.string()),
  })),
  handler: async (ctx) => {
    // Get performance metrics
    const metrics = await ctx.db
      .query("performanceMetrics")
      .withIndex("by_timestamp", (q) => 
        q.gte("timestamp", Date.now() - 24 * 60 * 60 * 1000)
      )
      .collect();
    
    // Group by endpoint
    const grouped = metrics.reduce((acc, metric) => {
      const key = `${metric.method}:${metric.endpoint}`;
      if (!acc[key]) {
        acc[key] = {
          times: [],
          dbTimes: [],
        };
      }
      acc[key].times.push(metric.responseTimeMs);
      acc[key].dbTimes.push(metric.dbQueryTimeMs);
      return acc;
    }, {} as Record<string, { times: number[], dbTimes: number[] }>);
    
    // Analyze each query
    const analysis = Object.entries(grouped).map(([queryName, data]) => {
      const avgExecutionTime = average(data.times);
      const avgDbTime = average(data.dbTimes);
      const slowestExecution = Math.max(...data.times);
      
      const recommendations = [];
      
      // Add recommendations based on performance
      if (avgExecutionTime > 500) {
        recommendations.push("Consider adding caching");
      }
      if (avgDbTime / avgExecutionTime > 0.8) {
        recommendations.push("Query is database-bound, check indexes");
      }
      if (data.times.length > 1000) {
        recommendations.push("High-frequency query, consider rate limiting");
      }
      if (slowestExecution > avgExecutionTime * 3) {
        recommendations.push("High variance in execution time, investigate edge cases");
      }
      
      return {
        queryName,
        avgExecutionTime,
        callCount: data.times.length,
        slowestExecution,
        recommendations,
      };
    });
    
    return analysis.sort((a, b) => b.avgExecutionTime - a.avgExecutionTime);
  },
});

// Auto-create missing indexes
export const optimizeIndexes = internalMutation({
  args: {},
  returns: v.object({
    suggestedIndexes: v.array(v.object({
      table: v.string(),
      fields: v.array(v.string()),
      reason: v.string(),
    })),
  }),
  handler: async (ctx) => {
    const suggestedIndexes = [];
    
    // Analyze query patterns
    const recentQueries = await ctx.db
      .query("queryPatterns")
      .withIndex("by_timestamp", (q) => 
        q.gte("timestamp", Date.now() - 7 * 24 * 60 * 60 * 1000)
      )
      .collect();
    
    // Group by table and filter fields
    const patterns = recentQueries.reduce((acc, query) => {
      if (!acc[query.table]) {
        acc[query.table] = {};
      }
      const filterKey = query.filters.join(",");
      acc[query.table][filterKey] = (acc[query.table][filterKey] || 0) + 1;
      return acc;
    }, {} as Record<string, Record<string, number>>);
    
    // Suggest indexes for frequent patterns
    for (const [table, filters] of Object.entries(patterns)) {
      for (const [filterFields, count] of Object.entries(filters)) {
        if (count > 100) {
          suggestedIndexes.push({
            table,
            fields: filterFields.split(","),
            reason: `Frequent query pattern (${count} times in last 7 days)`,
          });
        }
      }
    }
    
    return { suggestedIndexes };
  },
});

function average(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// ================================================
// REAL-TIME PERFORMANCE MONITORING
// ================================================
// client-template/convex/performance/monitoring.ts

import { v } from "convex/values";
import { query, internalAction } from "../_generated/server";

// Real-time performance dashboard data
export const getPerformanceDashboard = query({
  args: {},
  returns: v.object({
    currentLoad: v.object({
      cpu: v.number(),
      memory: v.number(),
      activeConnections: v.number(),
    }),
    responseTime: v.object({
      p50: v.number(),
      p95: v.number(),
      p99: v.number(),
    }),
    throughput: v.object({
      requestsPerSecond: v.number(),
      dataTransferRate: v.number(),
    }),
    errors: v.object({
      rate: v.number(),
      recent: v.array(v.object({
        type: v.string(),
        count: v.number(),
        lastOccurred: v.number(),
      })),
    }),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    // Get recent metrics
    const recentMetrics = await ctx.db
      .query("performanceMetrics")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", oneMinuteAgo))
      .collect();
    
    // Calculate percentiles
    const responseTimes = recentMetrics.map(m => m.responseTimeMs).sort((a, b) => a - b);
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    
    // Calculate error rate
    const errors = recentMetrics.filter(m => m.statusCode >= 500);
    const errorRate = (errors.length / recentMetrics.length) * 100;
    
    // Get active connections
    const activeUsers = await ctx.db
      .query("activeUsers")
      .withIndex("by_last_activity", (q) => q.gte("lastActivityAt", oneMinuteAgo))
      .collect();
    
    return {
      currentLoad: {
        cpu: await getCpuUsage(),
        memory: await getMemoryUsage(),
        activeConnections: activeUsers.length,
      },
      responseTime: { p50, p95, p99 },
      throughput: {
        requestsPerSecond: recentMetrics.length / 60,
        dataTransferRate: calculateDataRate(recentMetrics),
      },
      errors: {
        rate: errorRate,
        recent: groupErrors(errors),
      },
    };
  },
});

// Alert on performance degradation
export const checkPerformanceThresholds = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const dashboard = await ctx.runQuery(internal.performance.getPerformanceDashboard);
    
    const alerts = [];
    
    // Check response time
    if (dashboard.responseTime.p95 > 1000) {
      alerts.push({
        type: "high_response_time",
        severity: "warning",
        message: `95th percentile response time is ${dashboard.responseTime.p95}ms`,
      });
    }
    
    // Check error rate
    if (dashboard.errors.rate > 5) {
      alerts.push({
        type: "high_error_rate",
        severity: "critical",
        message: `Error rate is ${dashboard.errors.rate}%`,
      });
    }
    
    // Check CPU usage
    if (dashboard.currentLoad.cpu > 80) {
      alerts.push({
        type: "high_cpu_usage",
        severity: "warning",
        message: `CPU usage is ${dashboard.currentLoad.cpu}%`,
      });
    }
    
    // Send alerts
    for (const alert of alerts) {
      await ctx.runMutation(internal.alerts.sendPerformanceAlert, alert);
    }
    
    return null;
  },
});

// Helper functions
async function getCpuUsage(): Promise<number> {
  // In production, integrate with cloud provider metrics
  return Math.random() * 100;
}

async function getMemoryUsage(): Promise<number> {
  // In production, integrate with cloud provider metrics
  return Math.random() * 100;
}

function calculateDataRate(metrics: any[]): number {
  // Estimate based on response sizes
  const totalBytes = metrics.length * 1024; // Rough estimate
  return totalBytes / 60; // Bytes per second
}

function groupErrors(errors: any[]): any[] {
  const grouped = errors.reduce((acc, error) => {
    const type = error.errorType || "unknown";
    if (!acc[type]) {
      acc[type] = {
        type,
        count: 0,
        lastOccurred: 0,
      };
    }
    acc[type].count++;
    acc[type].lastOccurred = Math.max(acc[type].lastOccurred, error.timestamp);
    return acc;
  }, {} as Record<string, any>);
  
  return Object.values(grouped);
}