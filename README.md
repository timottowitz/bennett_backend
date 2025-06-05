# Legal SaaS Backend - Multi-Tenant Convex Setup

## Overview

This backend implements a **database-per-tenant** architecture using Convex's cloud platform. Each law firm gets their own isolated Convex project for maximum security and compliance with attorney-client privilege requirements.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Control Plane │────▶│   API Gateway   │────▶│  Client Project │
│  (Organizations)│     │   (Hono.js)     │     │   (Law Firm A)  │
│ convex.cloud/cp │     │                 │     │ convex.cloud/a  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Client Project │
                        │   (Law Firm B)  │
                        │ convex.cloud/b  │
                        └─────────────────┘
```

### Key Components

1. **Control Plane**: Single Convex project managing all organizations
2. **Client Projects**: One Convex project per law firm (complete data isolation)
3. **API Gateway**: Routes requests to correct client project based on domain
4. **Document Pipeline**: S3 storage + Chunkr/Docling + DocETL with Gemini 2.5

## Prerequisites

### Required Accounts & Services
- **Convex Account**: [convex.dev](https://convex.dev) (free tier available)
- **Google Cloud Account**: For Vertex AI (Gemini models)
- **AWS Account**: For S3 document storage
- **Clerk Account**: For authentication
- **Chunkr Account**: For PDF processing (optional: use Docling)

### Required Tools
```bash
# Install Node.js 18+ and npm
node --version  # v18.0.0 or higher
npm --version   # 9.0.0 or higher

# Install Convex CLI globally
npm install -g convex

# Install other global tools
npm install -g wrangler  # For Cloudflare Workers deployment
npm install -g typescript
```

## Project Structure

```
backend/
├── control-plane/           # Organization management
│   ├── convex/
│   │   ├── schema.ts       # Organizations, users mapping
│   │   ├── organizations.ts # CRUD operations
│   │   └── _generated/     # Auto-generated Convex files
│   ├── package.json
│   └── convex.json
├── client-template/         # Template for law firm projects
│   ├── convex/
│   │   ├── schema.ts       # Cases, documents, entities
│   │   ├── users.ts        # User management
│   │   ├── cases.ts        # Case management
│   │   ├── documents.ts    # Document handling
│   │   └── _generated/
│   ├── package.json
│   └── convex.json
├── api-gateway/             # Hono.js API routing
│   ├── src/
│   │   ├── index.ts        # Main router
│   │   ├── middleware/     # Auth, CORS, etc.
│   │   └── routes/         # API endpoints
│   ├── package.json
│   └── wrangler.toml       # Cloudflare Workers config
├── scripts/                 # Automation scripts
│   ├── provision-client.ts # Create new law firm project
│   ├── deploy-template.ts  # Deploy template updates
│   └── backup-data.ts      # Data backup utilities
├── shared/                  # Shared types and utilities
│   ├── types.ts            # TypeScript interfaces
│   └── utils.ts            # Common functions
└── docs/                    # Additional documentation
```

## Setup Instructions

### Step 1: Environment Configuration

Create `.env` files for each component:

#### `control-plane/.env`
```bash
# Convex
CONVEX_DEPLOYMENT=dev:control-plane-abc123
CONVEX_DEPLOY_KEY=your-deploy-key

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Control plane specific
CONTROL_PLANE_URL=https://control-plane-abc123.convex.cloud
```

#### `client-template/.env`
```bash
# This will be templated for each client
CONVEX_DEPLOYMENT=dev:client-template-def456
CONVEX_DEPLOY_KEY=your-deploy-key

# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
VERTEX_AI_LOCATION=us-central1

# Gemini Models
GEMINI_PRO_MODEL=gemini-2.5-pro
GEMINI_FLASH_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=text-embedding-preview-0409

# AWS S3
AWS_S3_BUCKET=legal-docs-bucket
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Document Processing
CHUNKR_API_KEY=your-chunkr-key
DOCETL_API_KEY=your-docetl-key

# Monitoring
SENTRY_DSN=https://...
DATADOG_API_KEY=...
```

#### `api-gateway/.env`
```bash
# Cloudflare Workers
CLOUDFLARE_API_TOKEN=your-cf-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Control plane connection
CONTROL_PLANE_URL=https://control-plane-abc123.convex.cloud

# Clerk
CLERK_SECRET_KEY=sk_test_...
```

### Step 2: Initialize Convex Projects

#### Control Plane Setup
```bash
cd control-plane/

# Initialize Convex project
npx convex dev

# This will:
# 1. Create a new Convex project
# 2. Generate convex.json with your project URL
# 3. Deploy schema and functions
# 4. Start development server

# Deploy to production
npx convex deploy --prod
```

#### Client Template Setup
```bash
cd ../client-template/

# Initialize template project
npx convex dev

# Deploy template (used for provisioning new clients)
npx convex deploy --prod
```

### Step 3: Package Dependencies

#### Control Plane (`control-plane/package.json`)
```json
{
  "name": "legal-saas-control-plane",
  "version": "1.0.0",
  "dependencies": {
    "convex": "^1.17.4",
    "@clerk/backend": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "scripts": {
    "dev": "convex dev",
    "deploy": "convex deploy --prod",
    "typecheck": "tsc --noEmit"
  }
}
```

#### Client Template (`client-template/package.json`)
```json
{
  "name": "legal-saas-client-template",
  "version": "1.0.0",
  "dependencies": {
    "convex": "^1.17.4",
    "@google-cloud/vertexai": "^1.7.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "scripts": {
    "dev": "convex dev",
    "deploy": "convex deploy --prod",
    "typecheck": "tsc --noEmit"
  }
}
```

#### API Gateway (`api-gateway/package.json`)
```json
{
  "name": "legal-saas-api-gateway",
  "version": "1.0.0",
  "dependencies": {
    "hono": "^4.0.0",
    "convex": "^1.17.4",
    "@clerk/backend": "^1.0.0",
    "@hono/zod-validator": "^0.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.0.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  }
}
```

### Step 4: Deploy Components

#### 1. Deploy Control Plane
```bash
cd control-plane/
npm install
npm run deploy

# Note the deployment URL (e.g., https://control-plane-abc123.convex.cloud)
```

#### 2. Deploy Client Template
```bash
cd ../client-template/
npm install
npm run deploy

# This creates the template for client provisioning
```

#### 3. Deploy API Gateway
```bash
cd ../api-gateway/
npm install

# Configure Cloudflare Workers
npx wrangler login
npx wrangler deploy

# This deploys to https://your-worker.your-subdomain.workers.dev
```

### Step 5: Provision First Client

```bash
cd ../scripts/

# Create your first law firm
npm run provision-client -- \
  --domain "smithlaw" \
  --name "Smith & Associates" \
  --owner-email "admin@smithlaw.com"

# This will:
# 1. Create new Convex project for Smith & Associates
# 2. Deploy client schema and functions
# 3. Register in control plane
# 4. Return project URL: https://smithlaw-xyz789.convex.cloud
```

## Development Workflow

### Adding New Features

1. **Update schemas** in `client-template/convex/schema.ts`
2. **Add functions** in `client-template/convex/`
3. **Test locally** with `convex dev`
4. **Deploy template** with `convex deploy --prod`
5. **Update existing clients** with `npm run update-clients`

### Working with Multiple Clients

```bash
# List all provisioned clients
npm run list-clients

# Connect to specific client for debugging
npm run connect-client -- --domain "smithlaw"

# Update specific client
npm run update-client -- --domain "smithlaw"

# Backup client data
npm run backup-client -- --domain "smithlaw"
```

### Testing

```bash
# Test control plane
cd control-plane/
npm test

# Test client template
cd ../client-template/
npm test

# Test API gateway
cd ../api-gateway/
npm test

# Integration tests
npm run test:integration
```

## API Usage Examples

### Authentication (via API Gateway)

```typescript
// Get user's organizations
const response = await fetch('https://api.legal-saas.com/v1/user/organizations', {
  headers: {
    'Authorization': `Bearer ${clerkToken}`,
    'Content-Type': 'application/json'
  }
});

const organizations = await response.json();
// Returns: [{ domain: "smithlaw", name: "Smith & Associates", role: "owner" }]
```

### Domain-based API Access

```typescript
// Access Smith Law's cases
const cases = await fetch('https://api.legal-saas.com/v1/smithlaw/cases', {
  headers: { 'Authorization': `Bearer ${clerkToken}` }
});

// Upload document to Smith Law
const uploadUrl = await fetch('https://api.legal-saas.com/v1/smithlaw/documents/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${clerkToken}` },
  body: JSON.stringify({
    filename: 'contract.pdf',
    fileType: 'application/pdf',
    fileSize: 1024000,
    caseId: 'case123'
  })
});
```

### Direct Convex Access (from frontend)

```typescript
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api';

// Connect to specific law firm's Convex project
const client = new ConvexHttpClient('https://smithlaw-xyz789.convex.cloud');

// Query cases
const cases = await client.query(api.cases.list, { status: 'active' });

// Create new case
const caseId = await client.mutation(api.cases.create, {
  caseNumber: '2024-001',
  title: 'Contract Dispute',
  clientName_encrypted: 'encrypted_client_name',
  practiceArea: 'Contract Law'
});
```

## Document Processing Pipeline

### 1. Upload Flow
```typescript
// 1. Get presigned URL
const { uploadUrl, documentId } = await client.action(api.documents.generateUploadUrl, {
  filename: 'contract.pdf',
  fileType: 'application/pdf',
  fileSize: 1024000,
  caseId: 'case123'
});

// 2. Upload to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: pdfFile,
  headers: { 'Content-Type': 'application/pdf' }
});

// 3. Trigger processing
await client.action(api.documents.processDocument, {
  documentId,
  checksum: 'sha256-hash'
});
```

### 2. Processing Stages
1. **Upload**: File uploaded to S3
2. **Conversion**: Chunkr/Docling converts PDF → Markdown
3. **Extraction**: DocETL + Gemini extracts entities
4. **Indexing**: Document becomes searchable

### 3. Monitoring Processing
```typescript
// Check processing status
const document = await client.query(api.documents.get, { documentId });

console.log(document.processing.status); // "processing" | "completed" | "failed"
console.log(document.processing.stages); // Detailed stage information
```

## Monitoring & Debugging

### Convex Dashboard
- Control Plane: `https://dashboard.convex.dev/[your-control-plane-id]`
- Each Client: `https://dashboard.convex.dev/[client-project-id]`

### Logs and Metrics
```bash
# View control plane logs
npx convex logs --project control-plane-abc123

# View specific client logs
npx convex logs --project smithlaw-xyz789

# Monitor API gateway
wrangler tail
```

### Common Issues

#### 1. Authentication Errors
```bash
# Check Clerk configuration
curl -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  https://api.clerk.dev/v1/users

# Verify Convex auth
npx convex auth --project your-project-id
```

#### 2. Document Processing Failures
```bash
# Check S3 permissions
aws s3 ls s3://your-bucket/

# Verify Chunkr API
curl -H "Authorization: Bearer $CHUNKR_API_KEY" \
  https://api.chunkr.ai/health

# Test Gemini connection
npm run test:gemini
```

#### 3. Convex Deployment Issues
```bash
# Reset Convex project
npx convex init --reset

# Check deployment status
npx convex dashboard
```

## Production Deployment Checklist

### Security
- [ ] All environment variables in production are secure
- [ ] S3 bucket has proper IAM policies
- [ ] Convex projects have authentication enabled
- [ ] API gateway has rate limiting
- [ ] Audit logging is enabled

### Performance
- [ ] CDN configured for static assets
- [ ] Redis caching layer deployed
- [ ] Database indexes optimized
- [ ] Document storage lifecycle policies set

### Monitoring
- [ ] Sentry error tracking configured
- [ ] Datadog metrics collection enabled
- [ ] Convex function monitoring set up
- [ ] API gateway analytics enabled

### Backup & Recovery
- [ ] Automated daily backups configured
- [ ] Cross-region replication enabled
- [ ] Disaster recovery procedures documented
- [ ] Data retention policies implemented

## Getting Help

### Documentation
- [Convex Docs](https://docs.convex.dev/)
- [Hono.js Docs](https://hono.dev/)
- [Clerk Auth Docs](https://clerk.com/docs)
- [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)

### Support Channels
- Convex Discord: [discord.gg/convex](https://discord.gg/convex)
- GitHub Issues: Create issues in this repository
- Team Slack: #legal-saas-backend

### Common Commands Quick Reference
```bash
# Development
convex dev                    # Start local development
convex logs                   # View function logs
convex dashboard             # Open web dashboard

# Deployment
convex deploy --prod         # Deploy to production
convex deploy --reset        # Reset and redeploy

# Client Management
npm run provision-client     # Create new law firm
npm run list-clients        # List all clients
npm run update-clients      # Update all client projects

# API Gateway
wrangler dev                # Local development
wrangler deploy             # Deploy to Cloudflare
wrangler tail               # View live logs
```

This setup provides a scalable, secure, and compliant backend for legal case management with complete tenant isolation and modern AI-powered document processing.