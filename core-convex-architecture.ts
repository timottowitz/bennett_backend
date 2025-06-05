// ================================================
// CORE CONTROL PLANE SCHEMA
// ================================================
// control-plane/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Organizations (law firms) registry
  organizations: defineTable({
    name: v.string(),
    domain: v.string(), // Unique identifier (e.g., "smithlaw")
    
    // Convex project connection info
    projectId: v.string(),
    projectUrl: v.string(),
    deploymentStatus: v.string(), // "provisioning" | "active" | "suspended"
    
    // Basic metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_domain", ["domain"])
    .index("by_status", ["deploymentStatus"]),

  // User to organization mapping
  userOrganizations: defineTable({
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    role: v.string(), // "owner" | "admin" | "user"
    addedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_organization", ["organizationId"]),
});

// ================================================
// CONTROL PLANE CORE FUNCTIONS
// ================================================
// control-plane/convex/organizations.ts

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Register a new organization
export const createOrganization = mutation({
  args: {
    name: v.string(),
    domain: v.string(),
    ownerClerkId: v.string(),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    // Check domain uniqueness
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
    
    if (existing) {
      throw new Error("Domain already exists");
    }
    
    // Create organization record
    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      domain: args.domain,
      projectId: "", // Will be set after provisioning
      projectUrl: "", // Will be set after provisioning  
      deploymentStatus: "provisioning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Link user to organization
    await ctx.db.insert("userOrganizations", {
      clerkUserId: args.ownerClerkId,
      organizationId: orgId,
      role: "owner",
      addedAt: Date.now(),
    });
    
    return orgId;
  },
});

// Get organization project info by domain
export const getOrganizationByDomain = query({
  args: { domain: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("organizations"),
      name: v.string(),
      projectUrl: v.string(),
      deploymentStatus: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
    
    if (!org || org.deploymentStatus !== "active") {
      return null;
    }
    
    return {
      _id: org._id,
      name: org.name,
      projectUrl: org.projectUrl,
      deploymentStatus: org.deploymentStatus,
    };
  },
});

// Update organization after provisioning
export const updateOrganizationProject = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.string(),
    projectUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      projectId: args.projectId,
      projectUrl: args.projectUrl,
      deploymentStatus: "active",
      updatedAt: Date.now(),
    });
    
    return null;
  },
});

// Get user's organizations
export const getUserOrganizations = query({
  args: { clerkUserId: v.string() },
  returns: v.array(v.object({
    organizationId: v.id("organizations"),
    organization: v.object({
      name: v.string(),
      domain: v.string(),
      projectUrl: v.string(),
    }),
    role: v.string(),
  })),
  handler: async (ctx, args) => {
    const userOrgs = await ctx.db
      .query("userOrganizations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();
    
    const results = [];
    for (const userOrg of userOrgs) {
      const org = await ctx.db.get(userOrg.organizationId);
      if (org && org.deploymentStatus === "active") {
        results.push({
          organizationId: userOrg.organizationId,
          organization: {
            name: org.name,
            domain: org.domain,
            projectUrl: org.projectUrl,
          },
          role: userOrg.role,
        });
      }
    }
    
    return results;
  },
});

// ================================================
// CLIENT PROJECT SCHEMA (Per Law Firm)
// ================================================
// client-template/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users within this specific law firm
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.string(), // "partner" | "associate" | "paralegal" | "client"
    permissions: v.array(v.string()),
    
    // Attorney info
    barNumber: v.optional(v.string()),
    barState: v.optional(v.string()),
    
    // Status
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // Legal cases  
  cases: defineTable({
    caseNumber: v.string(),
    title: v.string(),
    status: v.string(), // "active" | "closed" | "archived"
    
    // Encrypted sensitive data
    clientName_encrypted: v.string(),
    opposingParty_encrypted: v.optional(v.string()),
    
    // Assignments
    leadAttorneyId: v.id("users"),
    teamMemberIds: v.array(v.id("users")),
    
    // Metadata
    practiceArea: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_case_number", ["caseNumber"])
    .index("by_status", ["status"])
    .index("by_lead_attorney", ["leadAttorneyId"]),

  // Documents
  documents: defineTable({
    caseId: v.id("cases"),
    storageId: v.id("_storage"),
    
    title: v.string(),
    type: v.string(), // "pleading" | "discovery" | "correspondence"
    
    // Security
    privileged: v.boolean(),
    confidentialityLevel: v.string(), // "public" | "confidential"
    
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_case", ["caseId"])
    .index("by_type", ["type"])
    .index("by_uploader", ["uploadedBy"]),

  // Audit logs (required for compliance)
  auditLogs: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    
    ipAddress: v.string(),
    userAgent: v.string(),
    
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_time", ["createdAt"]),
});

// ================================================
// CLIENT PROJECT CORE FUNCTIONS
// ================================================
// client-template/convex/users.ts

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get or create user in this law firm
export const ensureUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    
    if (existing) {
      return existing._id;
    }
    
    // Create new user
    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      role: "user", // Default role
      permissions: ["cases.read", "documents.read"],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Get current user
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.string(),
      role: v.string(),
      permissions: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    
    if (!user || !user.isActive) return null;
    
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };
  },
});

// ================================================
// CLIENT PROJECT CASES
// ================================================
// client-template/convex/cases.ts

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// List cases
export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  returns: v.array(v.object({
    _id: v.id("cases"),
    caseNumber: v.string(),
    title: v.string(),
    status: v.string(),
    leadAttorneyId: v.id("users"),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
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
  },
});

// Create case
export const create = mutation({
  args: {
    caseNumber: v.string(),
    title: v.string(),
    clientName_encrypted: v.string(),
    practiceArea: v.string(),
  },
  returns: v.id("cases"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
    // Get current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    
    if (!user) throw new Error("User not found");
    
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
      leadAttorneyId: user._id,
      teamMemberIds: [],
      practiceArea: args.practiceArea,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Audit log
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "case.created",
      resourceType: "case",
      resourceId: caseId,
      ipAddress: "unknown", // Would come from request context
      userAgent: "unknown",
      createdAt: Date.now(),
    });
    
    return caseId;
  },
});

// ================================================
// PROVISIONING SCRIPT
// ================================================
// scripts/provision-client.ts

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../control-plane/convex/_generated/api';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export async function provisionClient(organizationId: string, domain: string) {
  console.log(`Provisioning Convex project for ${domain}...`);
  
  try {
    // 1. Create new Convex project
    const projectName = `legal-${domain}`;
    const templatePath = path.join(__dirname, '../client-template');
    
    // Create Convex project
    const { stdout } = await execAsync(
      `npx convex deploy --new "${projectName}"`,
      { cwd: templatePath }
    );
    
    // Extract project URL
    const urlMatch = stdout.match(/https:\/\/[^.]+\.convex\.cloud/);
    if (!urlMatch) throw new Error('Failed to extract project URL');
    
    const projectUrl = urlMatch[0];
    const projectId = projectUrl.split('//')[1].split('.')[0];
    
    // 2. Deploy schema and functions
    await execAsync('npx convex deploy', { cwd: templatePath });
    
    // 3. Update control plane
    const controlPlane = new ConvexHttpClient(process.env.CONTROL_PLANE_URL!);
    await controlPlane.mutation(api.organizations.updateOrganizationProject, {
      organizationId,
      projectId,
      projectUrl,
    });
    
    console.log(`✅ Successfully provisioned ${domain} at ${projectUrl}`);
    return { projectId, projectUrl };
    
  } catch (error) {
    console.error(`❌ Failed to provision ${domain}:`, error);
    throw error;
  }
}

// ================================================
// API ROUTING (Simplified)
// ================================================
// api-gateway/src/router.ts

import { ConvexHttpClient } from 'convex/browser';
import { Request, Response, NextFunction } from 'express';

// Store client connections
const clientConnections = new Map<string, ConvexHttpClient>();

// Get or create client connection
export function getClientConnection(projectUrl: string): ConvexHttpClient {
  if (!clientConnections.has(projectUrl)) {
    clientConnections.set(projectUrl, new ConvexHttpClient(projectUrl));
  }
  return clientConnections.get(projectUrl)!;
}

// Route to correct Convex project
export async function routeToClient(req: Request, res: Response, next: NextFunction) {
  const domain = req.params.domain;
  
  // Get organization from control plane
  const controlPlane = new ConvexHttpClient(process.env.CONTROL_PLANE_URL!);
  const org = await controlPlane.query(api.organizations.getOrganizationByDomain, { domain });
  
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }
  
  // Attach client connection to request
  req.convexClient = getClientConnection(org.projectUrl);
  req.organizationDomain = domain;
  
  next();
}

// Example usage
app.get('/api/:domain/cases', routeToClient, async (req, res) => {
  try {
    const cases = await req.convexClient.query(api.cases.list, {
      status: req.query.status as string,
    });
    res.json(cases);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});