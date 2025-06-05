// ================================================
// ENHANCED SCHEMA FOR DOCUMENT PROCESSING PIPELINE
// ================================================
// client-template/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Raw document ingestion tracking
  documentIngestion: defineTable({
    // Source tracking
    sourceStorageId: v.id("_storage"), // Original PDF/DOC
    sourceFilename: v.string(),
    sourceMimeType: v.string(),
    sourceChecksum: v.string(),
    
    // Processing pipeline status
    status: v.string(), // "uploaded" | "processing" | "completed" | "failed"
    
    // Processing stages
    stages: v.object({
      chunkr: v.optional(v.object({
        status: v.string(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        outputPath: v.optional(v.string()),
        error: v.optional(v.string()),
      })),
      docling: v.optional(v.object({
        status: v.string(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        outputPath: v.optional(v.string()),
        error: v.optional(v.string()),
      })),
      docetl: v.optional(v.object({
        status: v.string(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        entityCount: v.optional(v.number()),
        error: v.optional(v.string()),
      })),
    }),
    
    // Converted content
    markdownStorageId: v.optional(v.id("_storage")), // Converted .md file
    markdownContent: v.optional(v.string()), // For smaller files, store directly
    
    // Metadata
    uploadedBy: v.id("users"),
    caseId: v.optional(v.id("cases")), // May be assigned later
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_case", ["caseId"])
    .index("by_checksum", ["sourceChecksum"]),

  // Extracted entities from documents
  entities: defineTable({
    // Source reference
    ingestionId: v.id("documentIngestion"),
    caseId: v.optional(v.id("cases")),
    
    // Entity core data
    entityType: v.string(), // "person" | "organization" | "location" | "date" | "event" | "evidence"
    entitySubtype: v.optional(v.string()), // "victim" | "perpetrator" | "witness" | "judge" | "attorney"
    
    // Entity identification
    name: v.string(), // Primary identifier
    aliases: v.optional(v.array(v.string())), // Alternative names/spellings
    
    // Structured attributes based on 6 W's
    attributes: v.object({
      // WHO
      role: v.optional(v.string()), // "victim" | "defendant" | "witness" | "attorney" | "judge"
      personDetails: v.optional(v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        middleName: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        identification: v.optional(v.array(v.object({
          type: v.string(), // "ssn" | "driver_license" | "passport"
          value: v.string(), // Encrypted
          issuingAuthority: v.optional(v.string()),
        }))),
      })),
      
      // WHAT
      eventDetails: v.optional(v.object({
        eventType: v.optional(v.string()), // "crime" | "hearing" | "filing"
        description: v.optional(v.string()),
        charges: v.optional(v.array(v.string())),
        outcome: v.optional(v.string()),
      })),
      
      // WHERE
      locationDetails: v.optional(v.object({
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        country: v.optional(v.string()),
        coordinates: v.optional(v.object({
          lat: v.number(),
          lng: v.number(),
        })),
        locationType: v.optional(v.string()), // "crime_scene" | "court" | "residence"
      })),
      
      // WHEN
      temporalDetails: v.optional(v.object({
        date: v.optional(v.string()), // ISO date
        time: v.optional(v.string()),
        timezone: v.optional(v.string()),
        precision: v.optional(v.string()), // "exact" | "approximate" | "range"
        endDate: v.optional(v.string()), // For date ranges
      })),
      
      // WHY
      motivationDetails: v.optional(v.object({
        motive: v.optional(v.string()),
        context: v.optional(v.string()),
        relatedFactors: v.optional(v.array(v.string())),
      })),
      
      // HOW
      methodDetails: v.optional(v.object({
        method: v.optional(v.string()),
        tools: v.optional(v.array(v.string())),
        sequence: v.optional(v.string()),
      })),
    }),
    
    // Extraction metadata
    confidence: v.number(), // 0-1 confidence score from DocETL
    sourceContext: v.string(), // Surrounding text for context
    pageNumber: v.optional(v.number()),
    boundingBox: v.optional(v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    })),
    
    // Validation status
    validated: v.boolean(),
    validatedBy: v.optional(v.id("users")),
    validatedAt: v.optional(v.number()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ingestion", ["ingestionId"])
    .index("by_case", ["caseId"])
    .index("by_type", ["entityType"])
    .index("by_type_and_subtype", ["entityType", "entitySubtype"])
    .index("by_name", ["name"])
    .index("by_confidence", ["confidence"])
    .searchIndex("search_entities", {
      searchField: "name",
      filterFields: ["entityType", "caseId"],
    }),

  // Relationships between entities
  entityRelationships: defineTable({
    // Source entities
    fromEntityId: v.id("entities"),
    toEntityId: v.id("entities"),
    
    // Relationship details
    relationshipType: v.string(), // "represents" | "witnessed" | "related_to" | "employed_by"
    relationshipSubtype: v.optional(v.string()),
    
    // Temporal aspects
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    
    // Extraction metadata
    confidence: v.number(),
    sourceIngestionId: v.id("documentIngestion"),
    sourceContext: v.string(),
    
    // Validation
    validated: v.boolean(),
    
    createdAt: v.number(),
  })
    .index("by_from_entity", ["fromEntityId"])
    .index("by_to_entity", ["toEntityId"])
    .index("by_type", ["relationshipType"])
    .index("by_source", ["sourceIngestionId"]),

  // Document sections/chunks for granular access
  documentChunks: defineTable({
    ingestionId: v.id("documentIngestion"),
    
    // Chunk identification
    chunkIndex: v.number(), // Order in document
    chunkType: v.string(), // "header" | "paragraph" | "list" | "table" | "footnote"
    
    // Content
    content: v.string(), // Markdown content
    plainText: v.string(), // Stripped text for search
    
    // Structure
    headingLevel: v.optional(v.number()),
    parentChunkId: v.optional(v.id("documentChunks")),
    
    // Metadata
    pageNumber: v.optional(v.number()),
    characterCount: v.number(),
    wordCount: v.number(),
    
    // Entity references in this chunk
    entityIds: v.array(v.id("entities")),
    
    createdAt: v.number(),
  })
    .index("by_ingestion", ["ingestionId"])
    .index("by_chunk_index", ["ingestionId", "chunkIndex"])
    .searchIndex("search_chunks", {
      searchField: "plainText",
      filterFields: ["ingestionId", "chunkType"],
    }),

  // Template mappings for DocETL
  entityExtractionTemplates: defineTable({
    name: v.string(),
    documentType: v.string(), // "police_report" | "court_filing" | "witness_statement"
    
    // DocETL configuration
    extractionRules: v.object({
      // Entity patterns
      personPatterns: v.array(v.object({
        pattern: v.string(),
        role: v.string(),
        confidence: v.number(),
      })),
      datePatterns: v.array(v.object({
        pattern: v.string(),
        type: v.string(),
        format: v.string(),
      })),
      locationPatterns: v.array(v.object({
        pattern: v.string(),
        type: v.string(),
      })),
      
      // Custom patterns
      customPatterns: v.optional(v.any()),
    }),
    
    // Field mappings
    fieldMappings: v.object({
      victim: v.optional(v.array(v.string())), // Possible field names
      defendant: v.optional(v.array(v.string())),
      witness: v.optional(v.array(v.string())),
      incidentDate: v.optional(v.array(v.string())),
      location: v.optional(v.array(v.string())),
    }),
    
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_document_type", ["documentType"]),

  // Processing queue for DocETL
  processingQueue: defineTable({
    ingestionId: v.id("documentIngestion"),
    
    // Queue management
    priority: v.number(), // 0-10
    status: v.string(), // "queued" | "processing" | "completed" | "failed"
    
    // Processing configuration
    processingConfig: v.object({
      useChunkr: v.boolean(),
      useDocling: v.boolean(),
      templateId: v.optional(v.id("entityExtractionTemplates")),
      customConfig: v.optional(v.any()),
    }),
    
    // Execution tracking
    attempts: v.number(),
    lastAttemptAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_priority_and_created", ["priority", "createdAt"])
    .index("by_ingestion", ["ingestionId"]),

  // Existing tables with entity linking...
  cases: defineTable({
    // ... existing fields ...
    caseNumber: v.string(),
    title: v.string(),
    status: v.string(),
    clientName_encrypted: v.string(),
    opposingParty_encrypted: v.optional(v.string()),
    leadAttorneyId: v.id("users"),
    teamMemberIds: v.array(v.id("users")),
    practiceArea: v.string(),
    
    // Entity associations
    primaryEntities: v.optional(v.object({
      victimIds: v.optional(v.array(v.id("entities"))),
      defendantIds: v.optional(v.array(v.id("entities"))),
      witnessIds: v.optional(v.array(v.id("entities"))),
      judgeId: v.optional(v.id("entities")),
      prosecutorIds: v.optional(v.array(v.id("entities"))),
      defenseAttorneyIds: v.optional(v.array(v.id("entities"))),
    })),
    
    // Key dates extracted from documents
    extractedDates: v.optional(v.object({
      incidentDate: v.optional(v.string()),
      filingDate: v.optional(v.string()),
      trialDate: v.optional(v.string()),
      sentencingDate: v.optional(v.string()),
    })),
    
    // Locations
    primaryLocationId: v.optional(v.id("entities")),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_case_number", ["caseNumber"])
    .index("by_status", ["status"])
    .index("by_lead_attorney", ["leadAttorneyId"]),

  // ... rest of existing tables remain the same
});

// ================================================
// DOCUMENT INGESTION API
// ================================================
// client-template/convex/documentIngestion.ts

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { wrapApi } from "./lib/apiWrapper";

// Start document ingestion
export const startIngestion = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    checksum: v.string(),
    caseId: v.optional(v.id("cases")),
    processingConfig: v.optional(v.object({
      useChunkr: v.boolean(),
      useDocling: v.boolean(),
      templateId: v.optional(v.id("entityExtractionTemplates")),
    })),
  },
  returns: v.id("documentIngestion"),
  handler: wrapApi(
    { 
      requireAuth: true,
      auditAction: "document.ingestion_started"
    },
    async (ctx, context, args) => {
      // Check for duplicate
      const existing = await ctx.db
        .query("documentIngestion")
        .withIndex("by_checksum", (q) => q.eq("sourceChecksum", args.checksum))
        .first();
      
      if (existing) {
        throw new Error("Document already ingested");
      }
      
      // Create ingestion record
      const ingestionId = await ctx.db.insert("documentIngestion", {
        sourceStorageId: args.storageId,
        sourceFilename: args.filename,
        sourceMimeType: args.mimeType,
        sourceChecksum: args.checksum,
        status: "uploaded",
        stages: {
          chunkr: args.processingConfig?.useChunkr ? 
            { status: "pending" } : undefined,
          docling: args.processingConfig?.useDocling ? 
            { status: "pending" } : undefined,
          docetl: { status: "pending" },
        },
        uploadedBy: context.userId,
        caseId: args.caseId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      // Queue for processing
      await ctx.db.insert("processingQueue", {
        ingestionId,
        priority: 5,
        status: "queued",
        processingConfig: args.processingConfig || {
          useChunkr: true,
          useDocling: false,
        },
        attempts: 0,
        createdAt: Date.now(),
      });
      
      return ingestionId;
    }
  ),
});

// Store markdown content after conversion
export const storeMarkdownContent = mutation({
  args: {
    ingestionId: v.id("documentIngestion"),
    markdownContent: v.string(),
    markdownStorageId: v.optional(v.id("_storage")),
    stage: v.string(), // "chunkr" | "docling"
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ingestion = await ctx.db.get(args.ingestionId);
    if (!ingestion) throw new Error("Ingestion not found");
    
    // Update ingestion record
    await ctx.db.patch(args.ingestionId, {
      markdownContent: args.markdownContent.length < 1000000 ? 
        args.markdownContent : undefined, // Store directly if < 1MB
      markdownStorageId: args.markdownStorageId,
      stages: {
        ...ingestion.stages,
        [args.stage]: {
          status: "completed",
          completedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    });
    
    // Parse and store chunks
    await parseAndStoreChunks(ctx, args.ingestionId, args.markdownContent);
    
    return null;
  },
});

// Store extracted entities from DocETL
export const storeExtractedEntities = mutation({
  args: {
    ingestionId: v.id("documentIngestion"),
    entities: v.array(v.object({
      entityType: v.string(),
      entitySubtype: v.optional(v.string()),
      name: v.string(),
      aliases: v.optional(v.array(v.string())),
      attributes: v.any(), // Flexible schema for different entity types
      confidence: v.number(),
      sourceContext: v.string(),
      pageNumber: v.optional(v.number()),
    })),
  },
  returns: v.array(v.id("entities")),
  handler: wrapApi(
    { 
      requireAuth: true,
      auditAction: "entities.extracted"
    },
    async (ctx, context, args) => {
      const ingestion = await ctx.db.get(args.ingestionId);
      if (!ingestion) throw new Error("Ingestion not found");
      
      const entityIds = [];
      
      for (const entity of args.entities) {
        const entityId = await ctx.db.insert("entities", {
          ingestionId: args.ingestionId,
          caseId: ingestion.caseId,
          entityType: entity.entityType,
          entitySubtype: entity.entitySubtype,
          name: entity.name,
          aliases: entity.aliases,
          attributes: entity.attributes,
          confidence: entity.confidence,
          sourceContext: entity.sourceContext,
          pageNumber: entity.pageNumber,
          validated: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        
        entityIds.push(entityId);
      }
      
      // Update ingestion status
      await ctx.db.patch(args.ingestionId, {
        stages: {
          ...ingestion.stages,
          docetl: {
            status: "completed",
            completedAt: Date.now(),
            entityCount: entityIds.length,
          },
        },
        status: "completed",
        updatedAt: Date.now(),
      });
      
      // Auto-link entities to case if applicable
      if (ingestion.caseId) {
        await autoLinkEntitiesToCase(ctx, ingestion.caseId, entityIds);
      }
      
      return entityIds;
    }
  ),
});

// Helper functions
async function parseAndStoreChunks(
  ctx: any, 
  ingestionId: string, 
  markdownContent: string
) {
  const lines = markdownContent.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;
  let currentType = 'paragraph';
  
  for (const line of lines) {
    // Detect chunk type
    if (line.startsWith('#')) {
      // Save previous chunk
      if (currentChunk) {
        await ctx.db.insert("documentChunks", {
          ingestionId,
          chunkIndex,
          chunkType: currentType,
          content: currentChunk,
          plainText: currentChunk.replace(/[#*_`]/g, ''),
          headingLevel: currentType === 'header' ? 
            (currentChunk.match(/^#+/)?.[0].length || 1) : undefined,
          characterCount: currentChunk.length,
          wordCount: currentChunk.split(/\s+/).length,
          entityIds: [], // Will be populated later
          createdAt: Date.now(),
        });
        chunkIndex++;
      }
      currentChunk = line;
      currentType = 'header';
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      currentType = 'list';
      currentChunk += '\n' + line;
    } else if (line.trim() === '') {
      // Paragraph break
      if (currentChunk) {
        await ctx.db.insert("documentChunks", {
          ingestionId,
          chunkIndex,
          chunkType: currentType,
          content: currentChunk,
          plainText: currentChunk.replace(/[#*_`]/g, ''),
          characterCount: currentChunk.length,
          wordCount: currentChunk.split(/\s+/).length,
          entityIds: [],
          createdAt: Date.now(),
        });
        chunkIndex++;
        currentChunk = '';
        currentType = 'paragraph';
      }
    } else {
      currentChunk += '\n' + line;
    }
  }
  
  // Save last chunk
  if (currentChunk) {
    await ctx.db.insert("documentChunks", {
      ingestionId,
      chunkIndex,
      chunkType: currentType,
      content: currentChunk,
      plainText: currentChunk.replace(/[#*_`]/g, ''),
      characterCount: currentChunk.length,
      wordCount: currentChunk.split(/\s+/).length,
      entityIds: [],
      createdAt: Date.now(),
    });
  }
}

async function autoLinkEntitiesToCase(
  ctx: any,
  caseId: string,
  entityIds: string[]
) {
  const case_ = await ctx.db.get(caseId);
  if (!case_) return;
  
  const entities = await Promise.all(
    entityIds.map(id => ctx.db.get(id))
  );
  
  const primaryEntities = case_.primaryEntities || {
    victimIds: [],
    defendantIds: [],
    witnessIds: [],
  };
  
  // Auto-categorize based on entity subtype
  for (const entity of entities) {
    if (!entity) continue;
    
    switch (entity.entitySubtype) {
      case 'victim':
        primaryEntities.victimIds = [
          ...(primaryEntities.victimIds || []),
          entity._id
        ];
        break;
      case 'defendant':
      case 'perpetrator':
        primaryEntities.defendantIds = [
          ...(primaryEntities.defendantIds || []),
          entity._id
        ];
        break;
      case 'witness':
        primaryEntities.witnessIds = [
          ...(primaryEntities.witnessIds || []),
          entity._id
        ];
        break;
    }
  }
  
  await ctx.db.patch(caseId, {
    primaryEntities,
    updatedAt: Date.now(),
  });
}