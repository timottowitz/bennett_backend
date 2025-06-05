// ================================================
// ENHANCED SCHEMA WITH FUTURE-READY FIELDS
// ================================================
// client-template/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users - with fields for future features
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.string(),
    permissions: v.array(v.string()),
    
    // Attorney info
    barNumber: v.optional(v.string()),
    barState: v.optional(v.string()),
    
    // Future: Security scoring
    metadata: v.optional(v.any()), // For future security scores, MFA status, etc.
    
    // Status
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // Cases - with extensible fields
  cases: defineTable({
    caseNumber: v.string(),
    title: v.string(),
    status: v.string(),
    
    // Encrypted sensitive data
    clientName_encrypted: v.string(),
    opposingParty_encrypted: v.optional(v.string()),
    
    // Assignments
    leadAttorneyId: v.id("users"),
    teamMemberIds: v.array(v.id("users")),
    
    // Metadata
    practiceArea: v.string(),
    
    // Future: AI features placeholder
    computedData: v.optional(v.any()), // For AI summaries, risk scores, etc.
    
    // Future: Search optimization
    searchableText: v.optional(v.string()), // Concatenated searchable content
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_case_number", ["caseNumber"])
    .index("by_status", ["status"])
    .index("by_lead_attorney", ["leadAttorneyId"])
    .searchIndex("search_cases", { // Ready for full-text search
      searchField: "searchableText",
      filterFields: ["status", "practiceArea", "leadAttorneyId"],
    }),

  // Documents - with processing status
  documents: defineTable({
    caseId: v.id("cases"),
    storageId: v.id("_storage"),
    
    title: v.string(),
    type: v.string(),
    
    // Security
    privileged: v.boolean(),
    confidentialityLevel: v.string(),
    
    // Future: AI processing
    processingStatus: v.optional(v.string()), // "pending" | "processing" | "completed"
    processedData: v.optional(v.any()), // OCR text, extracted entities, etc.
    
    // Future: Version control
    version: v.number(),
    previousVersionId: v.optional(v.id("documents")),
    
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_case", ["caseId"])
    .index("by_type", ["type"])
    .index("by_uploader", ["uploadedBy"])
    .index("by_processing_status", ["processingStatus"]), // For batch processing

  // Audit logs - comprehensive from the start
  auditLogs: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    
    // Request context
    ipAddress: v.string(),
    userAgent: v.string(),
    sessionId: v.optional(v.string()), // For session tracking
    
    // Future: Enhanced security
    metadata: v.optional(v.any()), // Threat scores, anomaly flags, etc.
    
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_time", ["createdAt"])
    .index("by_resource", ["resourceType", "resourceId"]),

  // System events - for monitoring and alerts
  systemEvents: defineTable({
    eventType: v.string(), // "performance" | "security" | "error" | "info"
    severity: v.string(), // "low" | "medium" | "high" | "critical"
    
    source: v.string(), // Which system component
    message: v.string(),
    
    // Structured data for different event types
    eventData: v.optional(v.any()),
    
    // Resolution tracking
    acknowledged: v.boolean(),
    acknowledgedBy: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    
    createdAt: v.number(),
  })
    .index("by_type", ["eventType"])
    .index("by_severity", ["severity"])
    .index("by_time", ["createdAt"])
    .index("by_acknowledged", ["acknowledged"]),

  // Feature flags - for gradual rollout
  featureFlags: defineTable({
    feature: v.string(),
    enabled: v.boolean(),
    
    // Targeting
    rolloutPercentage: v.optional(v.number()),
    enabledForUsers: v.optional(v.array(v.id("users"))),
    enabledForRoles: v.optional(v.array(v.string())),
    
    // Metadata
    description: v.optional(v.string()),
    config: v.optional(v.any()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_feature", ["feature"])
    .index("by_enabled", ["enabled"]),

  // Background jobs - for async processing
  backgroundJobs: defineTable({
    jobType: v.string(), // "document_processing" | "report_generation" | etc.
    status: v.string(), // "pending" | "processing" | "completed" | "failed"
    
    // Job data
    inputData: v.any(),
    outputData: v.optional(v.any()),
    error: v.optional(v.string()),
    
    // Execution tracking
    attempts: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    
    // Scheduling
    scheduledFor: v.optional(v.number()),
    priority: v.number(), // 0 = lowest, 10 = highest
    
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_type", ["jobType"])
    .index("by_scheduled", ["scheduledFor"])
    .index("by_priority_and_created", ["priority", "createdAt"]),
});

// ================================================
// EXTENSIBLE API WRAPPER PATTERN
// ================================================
// client-template/convex/lib/apiWrapper.ts

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Base context that can be extended
export interface BaseContext {
  userId: Id<"users">;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  startTime: number;
}

// Wrapper for all API functions
export function wrapApi<TArgs, TReturn>(
  options: {
    requireAuth?: boolean;
    auditAction?: string;
    featureFlag?: string;
  },
  handler: (ctx: QueryCtx | MutationCtx, context: BaseContext, args: TArgs) => Promise<TReturn>
): (ctx: QueryCtx | MutationCtx, args: TArgs) => Promise<TReturn> {
  return async (ctx, args) => {
    const startTime = Date.now();
    
    // Build context
    const identity = await ctx.auth.getUserIdentity();
    if (options.requireAuth && !identity) {
      throw new Error("Unauthenticated");
    }
    
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
        .first();
      userId = user?._id;
    }
    
    const context: BaseContext = {
      userId: userId!,
      sessionId: identity?.sessionId || "anonymous",
      ipAddress: identity?.ipAddress || "unknown",
      userAgent: identity?.userAgent || "unknown",
      startTime,
    };
    
    // Check feature flag if specified
    if (options.featureFlag) {
      const flag = await ctx.db
        .query("featureFlags")
        .withIndex("by_feature", (q) => q.eq("feature", options.featureFlag))
        .first();
      
      if (!flag?.enabled) {
        throw new Error("Feature not enabled");
      }
    }
    
    try {
      // Execute handler
      const result = await handler(ctx, context, args);
      
      // Audit log for mutations
      if (options.auditAction && "db" in ctx) {
        await ctx.db.insert("auditLogs", {
          userId: context.userId,
          action: options.auditAction,
          resourceType: "system",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          createdAt: Date.now(),
        });
      }
      
      // Log performance for slow queries
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        await (ctx as MutationCtx).db.insert("systemEvents", {
          eventType: "performance",
          severity: "medium",
          source: options.auditAction || "unknown",
          message: `Slow operation: ${duration}ms`,
          eventData: { duration, args },
          acknowledged: false,
          createdAt: Date.now(),
        });
      }
      
      return result;
    } catch (error) {
      // Log errors
      if ("db" in ctx) {
        await ctx.db.insert("systemEvents", {
          eventType: "error",
          severity: "high",
          source: options.auditAction || "unknown",
          message: error.message,
          eventData: { error: error.toString(), args },
          acknowledged: false,
          createdAt: Date.now(),
        });
      }
      throw error;
    }
  };
}

// ================================================
// BACKGROUND JOB SYSTEM
// ================================================
// client-template/convex/lib/jobs.ts

import { v } from "convex/values";
import { internalMutation, internalQuery, cronJobs } from "../_generated/server";
import { internal } from "../_generated/api";

// Create a job
export const createJob = internalMutation({
  args: {
    jobType: v.string(),
    inputData: v.any(),
    priority: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
  },
  returns: v.id("backgroundJobs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("backgroundJobs", {
      jobType: args.jobType,
      status: "pending",
      inputData: args.inputData,
      attempts: 0,
      priority: args.priority || 5,
      scheduledFor: args.scheduledFor,
      createdAt: Date.now(),
    });
  },
});

// Process pending jobs
export const processPendingJobs = internalQuery({
  args: {},
  returns: v.array(v.id("backgroundJobs")),
  handler: async (ctx) => {
    const now = Date.now();
    
    // Get jobs ready to process
    const jobs = await ctx.db
      .query("backgroundJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => 
        q.or(
          q.eq(q.field("scheduledFor"), undefined),
          q.lte(q.field("scheduledFor"), now)
        )
      )
      .order("desc") // Newest first within priority
      .take(10);
    
    // Sort by priority
    return jobs
      .sort((a, b) => b.priority - a.priority)
      .map(job => job._id);
  },
});

// Cron job to process background jobs
const crons = cronJobs();

crons.interval(
  "process background jobs",
  { seconds: 30 }, // Every 30 seconds
  internal.lib.jobs.processJobs
);

export default crons;

// ================================================
// FEATURE FLAG SYSTEM
// ================================================
// client-template/convex/featureFlags.ts

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { wrapApi } from "./lib/apiWrapper";

// Check if feature is enabled for current user
export const isEnabled = query({
  args: { feature: v.string() },
  returns: v.boolean(),
  handler: wrapApi(
    { requireAuth: false },
    async (ctx, context, args) => {
      const flag = await ctx.db
        .query("featureFlags")
        .withIndex("by_feature", (q) => q.eq("feature", args.feature))
        .first();
      
      if (!flag || !flag.enabled) return false;
      
      // Check user-specific targeting
      if (flag.enabledForUsers?.includes(context.userId)) {
        return true;
      }
      
      // Check role-based targeting
      if (flag.enabledForRoles && context.userId) {
        const user = await ctx.db.get(context.userId);
        if (user && flag.enabledForRoles.includes(user.role)) {
          return true;
        }
      }
      
      // Check rollout percentage
      if (flag.rolloutPercentage) {
        // Simple hash-based rollout
        const hash = context.userId ? 
          context.userId.charCodeAt(0) : 
          Math.random() * 100;
        return hash < flag.rolloutPercentage;
      }
      
      return flag.enabled;
    }
  ),
});

// ================================================
// UPDATED CASE FUNCTIONS WITH WRAPPER
// ================================================
// client-template/convex/cases.ts

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { wrapApi } from "./lib/apiWrapper";

// List cases with monitoring
export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  returns: v.array(v.any()),
  handler: wrapApi(
    { requireAuth: true },
    async (ctx, context, args) => {
      let query = ctx.db.query("cases");
      
      if (args.status) {
        query = query.withIndex("by_status", (q) => q.eq("status", args.status));
      }
      
      const cases = await query.order("desc").collect();
      
      return cases.map(c => ({
        _id: c._id,
        caseNumber: c.caseNumber,
        title: c.title,
        status: c.status,
        leadAttorneyId: c.leadAttorneyId,
        createdAt: c.createdAt,
      }));
    }
  ),
});

// Create case with audit logging
export const create = mutation({
  args: {
    caseNumber: v.string(),
    title: v.string(),
    clientName_encrypted: v.string(),
    practiceArea: v.string(),
  },
  returns: v.id("cases"),
  handler: wrapApi(
    { 
      requireAuth: true,
      auditAction: "case.created",
    },
    async (ctx, context, args) => {
      // Check if case number exists
      const existing = await ctx.db
        .query("cases")
        .withIndex("by_case_number", (q) => q.eq("caseNumber", args.caseNumber))
        .first();
      
      if (existing) {
        throw new Error("Case number already exists");
      }
      
      // Create case
      const caseId = await ctx.db.insert("cases", {
        caseNumber: args.caseNumber,
        title: args.title,
        status: "active",
        clientName_encrypted: args.clientName_encrypted,
        leadAttorneyId: context.userId,
        teamMemberIds: [],
        practiceArea: args.practiceArea,
        searchableText: `${args.caseNumber} ${args.title}`, // Pre-compute for search
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      // Queue processing job for future AI features
      await ctx.scheduler.runAfter(0, internal.lib.jobs.createJob, {
        jobType: "case.postProcessing",
        inputData: { caseId },
        priority: 3,
      });
      
      return caseId;
    }
  ),
});