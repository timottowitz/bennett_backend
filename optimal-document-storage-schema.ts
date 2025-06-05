// ================================================
// OPTIMAL DOCUMENT STORAGE SCHEMA
// ================================================
// client-template/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Lightweight document metadata in Convex
  documents: defineTable({
    // Case association
    caseId: v.optional(v.id("cases")),
    
    // File identification
    filename: v.string(),
    fileType: v.string(), // "pdf" | "docx" | "image"
    checksum: v.string(), // SHA-256 for deduplication
    
    // External storage references
    storage: v.object({
      // S3/R2 URLs with presigned access
      originalUrl: v.string(),
      markdownUrl: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      
      // Storage metadata
      bucket: v.string(),
      region: v.string(),
      size: v.number(), // bytes
      
      // Versioning
      version: v.string(),
      previousVersionUrl: v.optional(v.string()),
    }),
    
    // Quick-access content in Convex (small)
    preview: v.object({
      // First portion of markdown for instant display
      excerpt: v.string(), // First 5KB
      
      // Document structure
      outline: v.array(v.object({
        level: v.number(),
        text: v.string(),
        page: v.optional(v.number()),
      })),
      
      // Key metadata
      pageCount: v.number(),
      wordCount: v.number(),
      hasImages: v.boolean(),
      hasTables: v.boolean(),
    }),
    
    // Processing pipeline status
    processing: v.object({
      status: v.string(), // "uploaded" | "processing" | "completed" | "failed"
      
      stages: v.object({
        upload: v.object({
          completedAt: v.number(),
          duration: v.number(),
        }),
        
        conversion: v.optional(v.object({
          tool: v.string(), // "chunkr" | "docling"
          startedAt: v.number(),
          completedAt: v.optional(v.number()),
          duration: v.optional(v.number()),
          error: v.optional(v.string()),
        })),
        
        extraction: v.optional(v.object({
          tool: v.string(), // "docetl"
          startedAt: v.number(),
          completedAt: v.optional(v.number()),
          entityCount: v.optional(v.number()),
          error: v.optional(v.string()),
        })),
      }),
      
      // Overall metrics
      totalDuration: v.optional(v.number()),
      retryCount: v.number(),
    }),
    
    // Search optimization
    searchData: v.object({
      // Computed search text (for Convex search)
      searchableText: v.string(), // Title + excerpt + entity names
      
      // Search metadata
      language: v.optional(v.string()),
      readabilityScore: v.optional(v.number()),
      
      // Key terms for filtering
      documentType: v.string(), // "contract" | "pleading" | "correspondence"
      jurisdiction: v.optional(v.string()),
      dateReferences: v.array(v.string()), // Extracted dates
    }),
    
    // Legal metadata
    legal: v.object({
      privileged: v.boolean(),
      confidentialityLevel: v.string(),
      retentionDate: v.optional(v.number()),
      
      // Signatures detected
      signatureCount: v.number(),
      signedDate: v.optional(v.string()),
    }),
    
    // Audit fields
    uploadedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastAccessedAt: v.optional(v.number()),
    accessCount: v.number(),
  })
    .index("by_case", ["caseId"])
    .index("by_checksum", ["checksum"])
    .index("by_type", ["searchData.documentType"])
    .index("by_upload_date", ["createdAt"])
    .searchIndex("search_documents", {
      searchField: "searchData.searchableText",
      filterFields: ["caseId", "legal.privileged", "searchData.documentType"],
    }),

  // Document chunks for granular processing
  documentChunks: defineTable({
    documentId: v.id("documents"),
    
    // Chunk identification
    chunkIndex: v.number(),
    pageNumber: v.optional(v.number()),
    
    // Content reference
    contentLocation: v.union(
      // Small chunks stored in Convex
      v.object({
        type: v.literal("inline"),
        content: v.string(), // < 10KB
      }),
      // Large chunks stored externally
      v.object({
        type: v.literal("external"),
        url: v.string(),
        size: v.number(),
      })
    ),
    
    // Chunk metadata
    chunkType: v.string(), // "heading" | "paragraph" | "list" | "table"
    
    // Entity references
    entityIds: v.array(v.id("entities")),
    entityDensity: v.number(), // Entities per 100 words
    
    createdAt: v.number(),
  })
    .index("by_document", ["documentId", "chunkIndex"])
    .index("by_entity_density", ["entityDensity"]),

  // Extracted entities remain in Convex (structured data)
  entities: defineTable({
    documentId: v.id("documents"),
    caseId: v.optional(v.id("cases")),
    
    // Entity core data
    entityType: v.string(),
    entitySubtype: v.optional(v.string()),
    name: v.string(),
    
    // Structured attributes (same as before)
    attributes: v.object({
      // WHO, WHAT, WHERE, WHEN, WHY, HOW
      // ... (keep existing structure)
    }),
    
    // Location in document
    locations: v.array(v.object({
      chunkId: v.id("documentChunks"),
      startOffset: v.number(),
      endOffset: v.number(),
      context: v.string(), // Surrounding text
    })),
    
    confidence: v.number(),
    validated: v.boolean(),
    
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_case", ["caseId"])
    .index("by_type", ["entityType"])
    .index("by_name", ["name"]),

  // Processing jobs with external storage awareness
  processingJobs: defineTable({
    documentId: v.id("documents"),
    
    jobType: v.string(), // "conversion" | "extraction" | "indexing"
    status: v.string(),
    
    // External service references
    externalReferences: v.optional(v.object({
      chunkrJobId: v.optional(v.string()),
      doclingJobId: v.optional(v.string()),
      s3UploadId: v.optional(v.string()),
    })),
    
    // Configuration
    config: v.object({
      sourceUrl: v.string(), // S3 URL of source
      targetBucket: v.string(),
      processingOptions: v.any(),
    }),
    
    // Results
    results: v.optional(v.object({
      outputUrl: v.optional(v.string()),
      metrics: v.any(),
      errors: v.optional(v.array(v.string())),
    })),
    
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_document", ["documentId"])
    .index("by_status", ["status"])
    .index("by_type", ["jobType"]),
});

// ================================================
// DOCUMENT UPLOAD WITH S3
// ================================================
// client-template/convex/documents.ts

import { v } from "convex/values";
import { mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// Generate presigned URL for upload
export const generateUploadUrl = action({
  args: {
    filename: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    caseId: v.optional(v.id("cases")),
  },
  returns: v.object({
    uploadUrl: v.string(),
    documentId: v.id("documents"),
    fileKey: v.string(),
  }),
  handler: async (ctx, args) => {
    // Generate S3 presigned URL
    const fileKey = `${Date.now()}-${args.filename}`;
    const uploadUrl = await generateS3PresignedUrl({
      bucket: process.env.S3_BUCKET!,
      key: fileKey,
      contentType: args.fileType,
      maxSize: args.fileSize,
    });
    
    // Create document record
    const documentId = await ctx.runMutation(api.documents.createPending, {
      filename: args.filename,
      fileType: args.fileType,
      fileSize: args.fileSize,
      fileKey,
      caseId: args.caseId,
    });
    
    return { uploadUrl, documentId, fileKey };
  },
});

// Create pending document record
export const createPending = mutation({
  args: {
    filename: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    fileKey: v.string(),
    caseId: v.optional(v.id("cases")),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    return await ctx.db.insert("documents", {
      caseId: args.caseId,
      filename: args.filename,
      fileType: args.fileType,
      checksum: "", // Will be updated after upload
      
      storage: {
        originalUrl: `s3://${process.env.S3_BUCKET}/${args.fileKey}`,
        bucket: process.env.S3_BUCKET!,
        region: process.env.AWS_REGION!,
        size: args.fileSize,
        version: "1",
      },
      
      preview: {
        excerpt: "",
        outline: [],
        pageCount: 0,
        wordCount: 0,
        hasImages: false,
        hasTables: false,
      },
      
      processing: {
        status: "uploaded",
        stages: {
          upload: {
            completedAt: Date.now(),
            duration: 0,
          },
        },
        retryCount: 0,
      },
      
      searchData: {
        searchableText: args.filename,
        documentType: "unknown",
        dateReferences: [],
      },
      
      legal: {
        privileged: false,
        confidentialityLevel: "confidential",
        signatureCount: 0,
      },
      
      uploadedBy: user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
    });
  },
});

// Process uploaded document
export const processDocument = action({
  args: {
    documentId: v.id("documents"),
    checksum: v.string(),
  },
  handler: async (ctx, args) => {
    // Update document with checksum
    await ctx.runMutation(api.documents.updateChecksum, {
      documentId: args.documentId,
      checksum: args.checksum,
    });
    
    // Start processing pipeline
    const doc = await ctx.runQuery(api.documents.get, { 
      documentId: args.documentId 
    });
    
    // 1. Queue conversion job
    await queueConversionJob({
      documentId: args.documentId,
      sourceUrl: doc.storage.originalUrl,
      tool: "chunkr", // or "docling" based on file type
    });
    
    // 2. Conversion will trigger extraction
    // 3. Extraction will update entities
  },
});

// Store markdown preview after conversion
export const storeMarkdownPreview = mutation({
  args: {
    documentId: v.id("documents"),
    markdownUrl: v.string(),
    preview: v.object({
      excerpt: v.string(),
      outline: v.array(v.object({
        level: v.number(),
        text: v.string(),
        page: v.optional(v.number()),
      })),
      pageCount: v.number(),
      wordCount: v.number(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    
    await ctx.db.patch(args.documentId, {
      storage: {
        ...doc.storage,
        markdownUrl: args.markdownUrl,
      },
      preview: args.preview,
      searchData: {
        ...doc.searchData,
        searchableText: `${doc.filename} ${args.preview.excerpt}`.slice(0, 10000),
      },
      processing: {
        ...doc.processing,
        stages: {
          ...doc.processing.stages,
          conversion: {
            tool: "chunkr",
            startedAt: doc.processing.stages.conversion?.startedAt || Date.now(),
            completedAt: Date.now(),
            duration: Date.now() - (doc.processing.stages.conversion?.startedAt || Date.now()),
          },
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Helper function for S3 presigned URLs
async function generateS3PresignedUrl(params: {
  bucket: string;
  key: string;
  contentType: string;
  maxSize: number;
}): Promise<string> {
  // Use AWS SDK v3
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  
  const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.maxSize,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}