# Backend Implementation Product Requirements Document (PRD)

## Executive Summary

This document provides a comprehensive step-by-step implementation plan for the Legal Case Management SaaS backend system. The architecture is designed for multi-tenant operation with enterprise-grade security, AI-powered document processing, and real-time collaboration capabilities.

## 1. Project Overview

### 1.1 Vision
Build a scalable, secure, and intelligent legal case management platform that enables law firms to efficiently manage cases, documents, and client relationships while maintaining compliance with legal industry regulations.

### 1.2 Key Features
- Multi-tenant architecture with database-per-tenant isolation
- AI-powered document processing and entity extraction
- Real-time collaboration and updates
- Enterprise-grade security and compliance
- Comprehensive audit logging and monitoring

### 1.3 Technology Stack
- **Database**: Convex Cloud (reactive, real-time NoSQL)
- **API Framework**: Hono.js (edge-optimized, TypeScript)
- **Authentication**: Clerk (multi-tenant auth)
- **Document Storage**: AWS S3/Cloudflare R2
- **Document Processing**: Chunkr/Docling + DocETL
- **Caching**: Upstash Redis
- **Monitoring**: Sentry, Datadog

## 2. Implementation Phases

### Phase 1: Foundation Setup (Weeks 1-2)

#### 1.1 Project Structure Setup
```bash
backend/
├── apps/
│   ├── control-plane/      # Organization management
│   ├── api-gateway/        # Main API service
│   └── document-processor/ # Async document processing
├── packages/
│   ├── shared-types/       # Shared TypeScript types
│   ├── convex-schemas/     # Database schemas
│   └── utils/              # Common utilities
├── infrastructure/
│   ├── terraform/          # Infrastructure as code
│   └── docker/             # Container configs
├── scripts/                # Development scripts
└── tests/                  # Test suites
```

#### 1.2 Core Dependencies
```json
{
  "name": "@legal-saas/backend",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "turbo": "^1.10.0",
    "vitest": "^1.0.0"
  }
}
```

#### 1.3 Environment Configuration
Create `.env.example`:
```env
# Control Plane
CONVEX_CONTROL_URL=
CONVEX_CONTROL_DEPLOY_KEY=

# Authentication
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# Storage
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

# Document Processing
CHUNKR_API_KEY=
DOCETL_API_KEY=

# Caching
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Monitoring
SENTRY_DSN=
DATADOG_API_KEY=
```

### Phase 2: Control Plane Implementation (Weeks 3-4)

#### 2.1 Convex Control Schema
```typescript
// packages/convex-schemas/src/control-plane.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const controlSchema = defineSchema({
  organizations: defineTable({
    name: v.string(),
    domain: v.string(),
    plan: v.union(v.literal("trial"), v.literal("professional"), v.literal("enterprise")),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("cancelled")),
    convexProjectId: v.string(),
    billingEmail: v.string(),
    maxUsers: v.number(),
    maxStorage: v.number(),
    features: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_domain", ["domain"]),

  userOrganizations: defineTable({
    userId: v.string(),
    organizationId: v.id("organizations"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    invitedBy: v.optional(v.string()),
    joinedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"]),

  usageMetrics: defineTable({
    organizationId: v.id("organizations"),
    metric: v.string(),
    value: v.number(),
    timestamp: v.number()
  })
    .index("by_org_metric", ["organizationId", "metric"])
    .index("by_timestamp", ["timestamp"])
});
```

#### 2.2 Control Plane API
```typescript
// apps/control-plane/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@legal-saas/convex-schemas';

const app = new Hono();

app.use('/*', cors());

app.post('/api/v1/organizations', async (c) => {
  // Create new law firm
  // 1. Validate request
  // 2. Create Convex project
  // 3. Deploy client schema
  // 4. Store organization record
  // 5. Configure Clerk organization
});

app.get('/api/v1/organizations', async (c) => {
  // List organizations for user
});

export default app;
```

### Phase 3: Client Database Implementation (Weeks 5-6)

#### 3.1 Client Project Schema
```typescript
// packages/convex-schemas/src/client-project.ts
export const clientSchema = defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("partner"), v.literal("associate"), v.literal("paralegal"), v.literal("client")),
    permissions: v.array(v.string()),
    lastActive: v.number()
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  cases: defineTable({
    caseNumber: v.string(),
    title: v.string(),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("archived")),
    type: v.string(),
    clientName: v.string(), // encrypted
    clientContact: v.string(), // encrypted
    assignedTo: v.array(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_case_number", ["caseNumber"])
    .index("by_status", ["status"])
    .index("by_assigned", ["assignedTo"]),

  documents: defineTable({
    caseId: v.id("cases"),
    title: v.string(),
    type: v.string(),
    storageKey: v.string(), // S3 key
    mimeType: v.string(),
    size: v.number(),
    uploadedBy: v.id("users"),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    metadata: v.optional(v.any()),
    createdAt: v.number()
  })
    .index("by_case", ["caseId"])
    .index("by_status", ["processingStatus"])
    .index("by_type", ["type"]),

  entities: defineTable({
    documentId: v.id("documents"),
    type: v.union(v.literal("person"), v.literal("organization"), v.literal("location"), v.literal("date")),
    value: v.string(),
    context: v.string(),
    confidence: v.number(),
    position: v.object({
      page: v.number(),
      start: v.number(),
      end: v.number()
    })
  })
    .index("by_document", ["documentId"])
    .index("by_type_value", ["type", "value"])
    .searchIndex("search_value", {
      searchField: "value",
      filterFields: ["type", "documentId"]
    }),

  auditLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    metadata: v.optional(v.any()),
    ipAddress: v.string(),
    userAgent: v.string(),
    timestamp: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_timestamp", ["timestamp"])
});
```

### Phase 4: API Gateway Implementation (Weeks 7-8)

#### 4.1 API Gateway Structure
```typescript
// apps/api-gateway/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { ConvexHttpClient } from 'convex/browser';
import { verifyToken } from '@clerk/backend';

const app = new Hono();

// Middleware
app.use('/*', cors());
app.use('/api/*', bearerAuth({ verifyToken }));

// Domain extraction middleware
app.use('/api/v1/:domain/*', async (c, next) => {
  const domain = c.req.param('domain');
  const org = await getOrganizationByDomain(domain);
  c.set('organization', org);
  await next();
});

// Case routes
app.get('/api/v1/:domain/cases', async (c) => {
  const org = c.get('organization');
  const client = new ConvexHttpClient(org.convexProjectUrl);
  const cases = await client.query(api.cases.list);
  return c.json(cases);
});

app.post('/api/v1/:domain/cases', async (c) => {
  const org = c.get('organization');
  const body = await c.req.json();
  // Validate and create case
});

// Document routes
app.post('/api/v1/:domain/documents/upload', async (c) => {
  // Generate presigned S3 URL
});

app.get('/api/v1/:domain/documents/:id', async (c) => {
  // Get document metadata and download URL
});

// Entity search
app.get('/api/v1/:domain/entities', async (c) => {
  const query = c.req.query('q');
  const type = c.req.query('type');
  // Search entities across documents
});

export default app;
```

### Phase 5: Document Processing Pipeline (Weeks 9-10)

#### 5.1 Document Processor Service
```typescript
// apps/document-processor/src/index.ts
import { ConvexHttpClient } from 'convex/browser';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ChunkrClient } from '@chunkr/sdk';
import { DocETLClient } from 'docetl';

interface ProcessDocumentJob {
  organizationId: string;
  documentId: string;
  storageKey: string;
}

export async function processDocument(job: ProcessDocumentJob) {
  try {
    // 1. Download from S3
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const document = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: job.storageKey
    }));

    // 2. Convert to Markdown using Chunkr
    const chunkr = new ChunkrClient({ apiKey: process.env.CHUNKR_API_KEY });
    const markdown = await chunkr.convert({
      file: document.Body,
      format: 'markdown'
    });

    // 3. Extract entities using DocETL
    const docetl = new DocETLClient({ apiKey: process.env.DOCETL_API_KEY });
    const entities = await docetl.extract({
      text: markdown,
      extractors: ['person', 'organization', 'location', 'date']
    });

    // 4. Store results in Convex
    const client = getConvexClient(job.organizationId);
    await client.mutation(api.documents.updateProcessingResult, {
      documentId: job.documentId,
      markdown,
      entities
    });

  } catch (error) {
    // Update document status to failed
    console.error('Document processing failed:', error);
  }
}
```

#### 5.2 DocETL Configuration
```yaml
# apps/document-processor/docetl-config.yaml
name: legal_document_processor
default_model: gpt-4o

operations:
  - name: extract_legal_entities
    type: map
    prompt: |
      Extract the following entities from this legal document:
      - Person names (attorneys, clients, witnesses, judges)
      - Organization names (law firms, companies, courts)
      - Locations (addresses, jurisdictions)
      - Important dates (filing dates, deadlines, court dates)
      - Case numbers and references
      
      Return as structured JSON with confidence scores.

  - name: identify_document_type
    type: map
    prompt: |
      Classify this legal document into one of these categories:
      - Contract
      - Pleading
      - Discovery
      - Correspondence
      - Court Order
      - Evidence
      
      Also extract key metadata like parties involved and subject matter.

pipelines:
  - name: legal_document_pipeline
    operations:
      - extract_legal_entities
      - identify_document_type
```

### Phase 6: Security & Monitoring (Weeks 11-12)

#### 6.1 Security Implementation
```typescript
// packages/utils/src/security.ts
import crypto from 'crypto';

export class FieldEncryption {
  private algorithm = 'aes-256-gcm';
  
  constructor(private kmsKeyId: string) {}

  async encrypt(plaintext: string): Promise<string> {
    const key = await this.getDataKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      authTag: authTag.toString('hex'),
      iv: iv.toString('hex')
    });
  }

  async decrypt(encryptedData: string): Promise<string> {
    const { encrypted, authTag, iv } = JSON.parse(encryptedData);
    const key = await this.getDataKey();
    
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private async getDataKey(): Promise<Buffer> {
    // Get data key from AWS KMS
    // Cache in memory with TTL
  }
}
```

#### 6.2 Monitoring Setup
```typescript
// packages/utils/src/monitoring.ts
import * as Sentry from '@sentry/node';
import { StatsD } from 'node-statsd';

export class MonitoringService {
  private statsd: StatsD;

  constructor() {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1
    });

    this.statsd = new StatsD({
      host: process.env.DATADOG_HOST,
      port: 8125
    });
  }

  trackApiCall(endpoint: string, duration: number, status: number) {
    this.statsd.timing(`api.request.duration`, duration, [`endpoint:${endpoint}`, `status:${status}`]);
    this.statsd.increment(`api.request.count`, 1, [`endpoint:${endpoint}`, `status:${status}`]);
  }

  trackDocumentProcessing(duration: number, success: boolean) {
    this.statsd.timing(`document.processing.duration`, duration);
    this.statsd.increment(`document.processing.${success ? 'success' : 'failure'}`);
  }

  captureError(error: Error, context?: any) {
    Sentry.captureException(error, { extra: context });
  }
}
```

### Phase 7: Performance Optimization (Weeks 13-14)

#### 7.1 Redis Caching Layer
```typescript
// packages/utils/src/cache.ts
import { Redis } from '@upstash/redis';

export class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });
  }

  async getCaseList(orgId: string, userId: string): Promise<any> {
    const key = `cases:${orgId}:${userId}`;
    const cached = await this.redis.get(key);
    
    if (cached) {
      await this.redis.expire(key, 300); // 5 minute TTL
      return cached;
    }
    
    return null;
  }

  async setCaseList(orgId: string, userId: string, cases: any[]) {
    const key = `cases:${orgId}:${userId}`;
    await this.redis.setex(key, 300, JSON.stringify(cases));
  }

  async invalidateCaseCache(orgId: string) {
    const pattern = `cases:${orgId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

#### 7.2 Query Optimization
```typescript
// packages/convex-schemas/src/optimized-queries.ts
export const getRecentCasesWithDocuments = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    
    // Use index for efficient querying
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(limit);
    
    // Batch load documents
    const caseIds = cases.map(c => c._id);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_case")
      .filter((q) => q.or(...caseIds.map(id => q.eq(q.field("caseId"), id))))
      .collect();
    
    // Group documents by case
    const docsByCase = documents.reduce((acc, doc) => {
      if (!acc[doc.caseId]) acc[doc.caseId] = [];
      acc[doc.caseId].push(doc);
      return acc;
    }, {} as Record<string, typeof documents>);
    
    return cases.map(c => ({
      ...c,
      documents: docsByCase[c._id] || []
    }));
  }
});
```

### Phase 8: Testing & Deployment (Weeks 15-16)

#### 8.1 Testing Strategy
```typescript
// apps/api-gateway/src/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';
import app from './index';

describe('API Gateway', () => {
  describe('Case Management', () => {
    it('should create a new case', async () => {
      const client = testClient(app);
      const response = await client.api.v1[':domain'].cases.$post({
        json: {
          title: 'Test Case',
          type: 'litigation',
          clientName: 'Test Client'
        },
        param: { domain: 'testfirm' }
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('caseNumber');
    });
  });
});
```

#### 8.2 Deployment Configuration
```yaml
# .github/workflows/deploy.yml
name: Deploy Backend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Deploy Control Plane
        run: |
          cd apps/control-plane
          npx convex deploy --prod
          
      - name: Deploy API Gateway
        run: |
          cd apps/api-gateway
          wrangler deploy --env production
          
      - name: Deploy Document Processor
        run: |
          cd apps/document-processor
          npm run deploy:lambda
```

## 3. Development Milestones

### Milestone 1: MVP (End of Week 6)
- [ ] Control plane with organization management
- [ ] Basic authentication and authorization
- [ ] Client database schema deployed
- [ ] Basic case and document CRUD operations

### Milestone 2: Document Processing (End of Week 10)
- [ ] S3 integration for document storage
- [ ] PDF to Markdown conversion
- [ ] Entity extraction pipeline
- [ ] Basic search functionality

### Milestone 3: Production Ready (End of Week 14)
- [ ] Field-level encryption
- [ ] Comprehensive audit logging
- [ ] Performance optimization with caching
- [ ] Monitoring and alerting

### Milestone 4: Launch (End of Week 16)
- [ ] Complete test coverage
- [ ] Documentation complete
- [ ] CI/CD pipeline operational
- [ ] Production deployment

## 4. Success Metrics

### Technical Metrics
- API response time < 200ms (p95)
- Document processing time < 30s for 100-page PDF
- 99.9% uptime SLA
- Zero security incidents

### Business Metrics
- Support 100+ law firms
- Process 10,000+ documents/day
- < 5 minute onboarding time
- 90%+ user satisfaction score

## 5. Risk Mitigation

### Technical Risks
1. **Convex Scalability**: Monitor usage and implement sharding strategy if needed
2. **Document Processing Costs**: Implement usage-based billing and processing limits
3. **Data Privacy**: Regular security audits and penetration testing

### Operational Risks
1. **Compliance Changes**: Regular legal review and flexible schema design
2. **Vendor Lock-in**: Abstract service interfaces for easy migration
3. **Performance Degradation**: Proactive monitoring and auto-scaling

## 6. Next Steps

1. **Immediate Actions**:
   - Set up development environment
   - Create GitHub repository with proper structure
   - Initialize Convex projects (control and test client)
   - Set up Clerk application

2. **Week 1 Deliverables**:
   - Complete project scaffolding
   - Deploy control plane schema
   - Implement organization creation flow
   - Basic authentication working

3. **Communication**:
   - Daily standups during development
   - Weekly progress reports
   - Bi-weekly stakeholder demos

## Appendix A: API Documentation

[Detailed API documentation will be generated using OpenAPI/Swagger during implementation]

## Appendix B: Database Indexes

[Complete index strategy based on query patterns discovered during development]

## Appendix C: Security Checklist

- [ ] All API endpoints require authentication
- [ ] PII fields encrypted at rest
- [ ] Audit logs for all data access
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (N/A for Convex)
- [ ] XSS prevention in responses
- [ ] CORS properly configured
- [ ] Secrets management via environment variables
- [ ] Regular dependency updates