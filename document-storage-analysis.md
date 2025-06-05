# Document Storage Architecture Analysis

## Current Challenge
You have a document processing pipeline:
1. **Original files** (PDF, DOC, etc.) → Stored in Convex Storage
2. **Markdown conversions** (from Chunkr/Docling) → Where to store?
3. **Extracted entities** (from DocETL) → Stored in Convex tables
4. **Need**: Keep original + markdown + entities "together"

## Option 1: All in Convex (Current Approach)

### Pros:
- **Single source of truth** - Everything in one system
- **Transactional consistency** - Updates to document + markdown + entities are atomic
- **Simple querying** - Join documents with their markdown/entities easily
- **Built-in real-time** - Changes propagate instantly
- **Unified security** - One authorization system

### Cons:
- **Storage costs** - Markdown files can be large (1-10MB each)
- **Size limitations** - Convex has limits on document sizes
- **Query performance** - Large text fields can slow down queries
- **Not optimized for full-text search** - Convex search has limitations

### Implementation:
```typescript
documentIngestion: defineTable({
  sourceStorageId: v.id("_storage"), // Original PDF
  markdownStorageId: v.optional(v.id("_storage")), // Large markdown
  markdownContent: v.optional(v.string()), // Small markdown (<1MB)
  // ... rest of schema
})
```

## Option 2: Hybrid Storage (Recommended)

### Architecture:
- **Convex**: Metadata, entities, relationships, small text
- **Object Storage (S3/R2)**: Original files + markdown files
- **Vector DB (Pinecone/Weaviate)**: Embeddings for semantic search
- **Full-text Search (Elasticsearch/Typesense)**: Document content search

### Pros:
- **Cost-effective** - Cheaper storage for large files
- **Scalable** - No size limitations
- **Optimized search** - Purpose-built search engines
- **Performance** - Convex queries stay fast
- **Flexibility** - Can process files without loading into Convex

### Cons:
- **Complexity** - Multiple systems to manage
- **Consistency** - Need to handle cross-system failures
- **Development overhead** - More integration work

### Implementation:
```typescript
// Convex schema - lightweight references
documentMetadata: defineTable({
  // References to external storage
  originalFileUrl: v.string(), // S3/R2 URL
  markdownFileUrl: v.string(), // S3/R2 URL
  
  // Small, queryable data in Convex
  title: v.string(),
  summary: v.string(), // First 500 chars of markdown
  wordCount: v.number(),
  pageCount: v.number(),
  
  // Processing status
  status: v.string(),
  checksum: v.string(),
  
  // Relationships
  caseId: v.optional(v.id("cases")),
  entityIds: v.array(v.id("entities")),
})

// Separate search indices
documentSearchIndex: defineTable({
  documentId: v.id("documentMetadata"),
  chunkIndex: v.number(),
  content: v.string(), // Smaller chunks (1-2KB each)
  embedding: v.optional(v.array(v.number())), // For vector search
})
```

## Option 3: Document Lake Pattern (Advanced)

### Architecture:
```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Convex DB     │────▶│ Document Lake│────▶│ Search Layer│
│  (Metadata +    │     │  (S3/R2)     │     │ (Elastic)   │
│   Entities)     │     │              │     │             │
└─────────────────┘     └──────────────┘     └─────────────┘
         │                      │                     │
         └──────────────────────┴─────────────────────┘
                          Unified API
```

### Components:
1. **Document Lake**: All files (original + processed) in object storage
2. **Convex**: Transactional data, entities, relationships
3. **Search Service**: Full-text and vector search
4. **CDN**: Fast document delivery

### Benefits:
- **Infinite scale** - Petabytes of documents
- **Cost-optimal** - ~$0.02/GB/month for storage
- **Fast delivery** - CDN for document access
- **Advanced search** - Full-text + semantic + faceted

## Recommended Approach for Legal SaaS

### Phase 1: Hybrid Light (Start Here)
```typescript
// Store in Convex
- Document metadata
- First 10KB of markdown (for preview)
- All extracted entities
- Processing status

// Store in S3/R2
- Original PDFs
- Full markdown files
- Generated reports

// Implementation
documentIngestion: defineTable({
  // External storage
  storageUrls: v.object({
    original: v.string(), // S3 URL
    markdown: v.string(), // S3 URL
    chunks: v.optional(v.array(v.string())), // For large docs
  }),
  
  // Convex storage for quick access
  preview: v.object({
    firstPage: v.string(), // First 5KB of markdown
    summary: v.string(), // AI-generated summary
    outline: v.array(v.string()), // Document headings
  }),
  
  // Metadata
  fileSize: v.number(),
  pageCount: v.number(),
  processingTime: v.number(),
})
```

### Phase 2: Add Search (When Needed)
```typescript
// Add Typesense/Meilisearch for legal documents
const searchClient = new TypesenseClient({
  nodes: [{ host: 'search.yourapp.com', port: 443, protocol: 'https' }],
  apiKey: process.env.TYPESENSE_API_KEY,
});

// Index documents after processing
await searchClient.collections('legal_documents').documents().create({
  id: documentId,
  title: documentTitle,
  content: markdownContent,
  case_number: caseNumber,
  entities: extractedEntities,
  date: documentDate,
});
```

### Phase 3: Add Intelligence (Future)
- Vector embeddings for semantic search
- Document similarity matching
- Automatic case law citations
- Precedent finding

## Decision Matrix

| Factor | All Convex | Hybrid | Document Lake |
|--------|------------|---------|---------------|
| Complexity | Low | Medium | High |
| Cost (1000 docs) | $$$ | $$ | $ |
| Search Quality | Basic | Good | Excellent |
| Development Time | 1 week | 2-3 weeks | 1-2 months |
| Scale Limit | ~10K docs | ~100K docs | Unlimited |

## Final Recommendation

**Start with Hybrid Light approach because:**

1. **Keeps Convex fast** - Only metadata and previews in database
2. **Unlimited storage** - PDFs and markdown in S3/R2
3. **Cost-effective** - $0.015/GB/month vs database storage
4. **Future-proof** - Easy to add search/AI later
5. **Simple enough** - Can build in 1-2 weeks

**Implementation steps:**
1. Set up S3/R2 bucket with presigned URLs
2. Modify schema to store URLs instead of full content
3. Keep preview/summary in Convex for quick access
4. Add background job to sync to search engine (later)

**Example flow:**
```typescript
// 1. Upload original to S3
const originalUrl = await uploadToS3(pdfFile);

// 2. Process with Chunkr/Docling
const markdownUrl = await processAndUploadMarkdown(pdfFile);

// 3. Store references in Convex
await convex.mutation(api.documents.create, {
  storageUrls: { original: originalUrl, markdown: markdownUrl },
  preview: { firstPage: markdown.slice(0, 5000) },
  metadata: { size, pages, checksum },
});

// 4. Extract entities (can read from S3)
const markdown = await fetchFromS3(markdownUrl);
const entities = await docETL.extract(markdown);
await convex.mutation(api.entities.bulkCreate, { entities });
```

This gives you the best balance of performance, cost, and flexibility while keeping the architecture simple enough to implement quickly.