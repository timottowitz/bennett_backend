# Project Context for Claude Code

## Project Overview
This is a multi-tenant legal case management SaaS platform with AI-powered document processing capabilities.

## Technology Stack

### Core Technologies
- **Language**: TypeScript (strict mode)
- **Monorepo**: Turbo build system with npm/pnpm workspaces
- **Database**: Convex Cloud (reactive, real-time NoSQL with multi-project architecture for tenant isolation)
- **API Framework**: Hono.js (edge-optimized, 400k+ RPS capability)
- **Authentication**: Clerk with Organizations feature (multi-tenant auth)
- **Validation**: Zod (schema validation)
- **AI SDK**: @google-cloud/vertexai (^1.7.0) for Gemini model integration

### Frontend Stack
- **Framework**: React 19 with Next.js
- **State Management**: TanStack Query (Convex integration)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router DOM

### Document Processing Pipeline
- **PDF Conversion**: Chunkr/Docling (PDF to Markdown)
- **Entity Extraction**: DocETL with Gemini models on Vertex AI
  - **Primary Model**: Gemini 2.5 Pro via Vertex AI for complex legal document analysis
  - **Fast Model**: Gemini 2.5 Flash via Vertex AI for quick entity extraction
  - **Context Window**: Up to 2M tokens for processing large legal documents
  - **Multimodal**: Direct PDF/image processing capability via Chunkr with Gemini 2.5 Flash integrated into Chunkr
- **Storage**: AWS S3/Cloudflare R2 with lifecycle policies
- **CDN**: Cloudflare for static assets

### Infrastructure & Deployment
- **Edge Runtime**: Cloudflare Workers (primary) / AWS Lambda@Edge
- **Containerization**: Docker with AWS ECS
- **Infrastructure as Code**: Terraform
- **CI/CD**: GitHub Actions
- **Deployment Tools**: Wrangler (Cloudflare)

### Security & Monitoring
- **Encryption**: AWS KMS for key management, AES-256 for data
- **Error Tracking**: Sentry
- **Metrics**: Datadog with StatsD
- **Analytics**: Cloudflare Analytics
- **Caching**: Upstash Redis

### Testing & Development
- **Testing Framework**: Vitest
- **Linting**: ESLint
- **Real-time**: WebSocket for live updates
- **Build Tools**: esbuild (Lambda builds)

### Future Integrations (Planned)
- **Vector Database**: 
  - **Primary**: Vertex AI Vector Search (Matching Engine) for Gemini embeddings
- **Search**: Vertex AI Search for enterprise search capabilities
- **Billing**: Stripe integration
- **Advanced AI Features**:
  - Gemini Code Assist for legal document drafting
  - Document AI for form processing
  - Translation AI for multilingual support

## Project Structure
```
.
├── backend/                 # Backend architecture and design docs
├── file-drive/             # Convex-based file management system
├── internal_AI_powered_case_dashboard/  # Frontend dashboard
├── modal_sandbox_example.py  # Modal Labs integration
├── rule.md                 # Project policy and workflows
└── backend-implementation-prd.md  # Implementation roadmap
```

## Key Development Guidelines

### 1. Multi-Tenant Architecture
- Database-per-tenant isolation using Convex
- Domain-based routing (e.g., lawfirm1.app.com)
- Strict data isolation between tenants

### 2. Security Requirements
- Field-level encryption for PII
- Comprehensive audit logging
- Role-based access control (partner, associate, paralegal, client)
- Attorney-client privilege protection

### 3. Code Standards
- TypeScript strict mode
- Comprehensive error handling
- No console.logs in production code
- All async operations properly handled

### 4. Testing Requirements
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical workflows
- Minimum 80% code coverage

### 5. Performance Targets
- API response time < 200ms (p95)
- Document processing < 30s for 100-page PDF
- Real-time updates via WebSocket

## Vertex AI Configuration

### Environment Variables
```bash
# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_ENDPOINT=us-central1-aiplatform.googleapis.com

# Model Selection
GEMINI_PRO_MODEL=gemini-2.5-pro
GEMINI_FLASH_MODEL=gemini-2.5-flash
GEMINI_FLASH_8B_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=text-embedding-preview-0409

# Rate Limiting
GEMINI_PRO_RPM=100
GEMINI_FLASH_RPM=1000
GEMINI_FLASH_8B_RPM=2000
```

### Vertex AI Client Setup
```typescript
import { VertexAI } from '@google-cloud/vertexai';

const vertex = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_AI_LOCATION,
});

// For legal document analysis
const geminiPro = vertex.preview.getGenerativeModel({
  model: 'gemini-1.5-pro-002',
  systemInstruction: 'You are a legal document analysis expert...',
  generationConfig: {
    maxOutputTokens: 8192,
    temperature: 0.1, // Low temperature for accuracy
    topP: 0.95,
    topK: 40,
    responseMimeType: 'application/json', // For structured output
  },
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_ONLY_HIGH',
    },
  ],
});
```

## Common Commands
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Google Cloud setup
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# Test Vertex AI connection
npm run test:vertex-ai
```

## Important Notes

### Gemini Model Usage Guidelines
1. **Model Selection**:
   - Use **Gemini 1.5 Pro** for: Contract analysis, case law research, complex document review, multi-document synthesis
   - Use **Gemini 1.5 Flash** for: Entity extraction, document classification, quick summaries, metadata generation
   - Use **Gemini 1.5 Flash-8B** for: Real-time UI features, autocomplete, quick searches, simple validations

2. **Prompt Engineering**:
   - Always include role context: "You are a legal document expert specializing in [specific area]"
   - Use system instructions for consistent behavior
   - Request JSON output for structured data extraction
   - Include few-shot examples for complex tasks

3. **Cost Optimization**:
   - Batch process documents when possible
   - Use Flash models for initial screening, Pro for detailed analysis
   - Cache embeddings and common queries
   - Implement request queuing to stay within rate limits

4. **Error Handling**:
   - Implement exponential backoff for rate limit errors
   - Have fallback to Flash model if Pro quota exceeded
   - Log all API errors with request/response details
   - Monitor token usage per tenant

### General Development Notes
- Always check existing code patterns before implementing new features
- Use the document processing pipeline for all PDF/document uploads
- Implement proper error boundaries in React components
- Cache expensive queries using Upstash Redis
- Log all security-relevant events to audit trail
- All AI-generated content must be marked as such for compliance

## Current Focus Areas
1. Implementing the backend services based on the PRD
2. Setting up the multi-tenant Convex architecture
3. Integrating document processing pipeline
4. Building the frontend dashboard with real-time updates

## Gemini Integration Examples

### Document Entity Extraction
```typescript
// Using Gemini Flash for entity extraction
const extractEntities = async (documentText: string) => {
  const model = vertex.preview.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const prompt = `Extract legal entities from this document.
  Return JSON with this structure:
  {
    "people": [{"name": "", "role": "", "confidence": 0.0}],
    "organizations": [{"name": "", "type": "", "confidence": 0.0}],
    "dates": [{"date": "", "context": "", "type": ""}],
    "caseNumbers": [""],
    "monetaryAmounts": [{"amount": "", "context": ""}]
  }
  
  Document: ${documentText}`;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
};
```

### Contract Analysis with Gemini Pro
```typescript
// Using Gemini Pro for complex analysis
const analyzeContract = async (contractPdf: Buffer) => {
  const model = vertex.preview.getGenerativeModel({
    model: 'gemini-2.5-pro',
    systemInstruction: `You are an expert contract lawyer with 20 years experience.
    Analyze contracts for key terms, risks, and obligations.`,
  });

  const prompt = `Analyze this contract and provide:
  1. Key parties and their obligations
  2. Important dates and deadlines
  3. Payment terms
  4. Termination clauses
  5. Potential risks or unusual terms
  6. Recommendations for negotiation`;

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: contractPdf.toString('base64') } },
    { text: prompt }
  ]);
  
  return result.response.text();
};
```

### Embedding Generation for Semantic Search
```typescript
// Generate embeddings for vector search
const generateEmbedding = async (text: string) => {
  const model = vertex.preview.getGenerativeModel({
    model: 'text-embedding-preview-0409',
  });

  const result = await model.embedContent({
    content: { parts: [{ text }] },
  });
  
  return result.embedding.values; // 768-dimensional vector
};
```