# RFC-003: Prompt Version Control

**Status:** Draft
**Author:** Claude Code (with John)
**Created:** 2025-12-22
**Related:** RFC-002 (Trials), GitHub Issue #100 (Evaluation Framework)

## Executive Summary

This RFC defines **Phase 2** of the Ariadne Evaluation Framework: a prompt version control system with Git-like semantics for managing, versioning, and experimenting with LLM prompts.

Key capabilities:
- **Immutable Versions** - Content-addressed snapshots of prompt configurations
- **Branching** - Named pointers for parallel prompt development
- **Model Configurations** - Decouple prompts from model/parameter choices
- **Diff & Compare** - Track changes between versions
- **Experiment Integration** - Link versioned prompts to A/B tests

## Motivation

### Current Limitations

LLM experiments require managing multiple variables:
1. **Prompt content** - System prompts, user templates, examples
2. **Model selection** - GPT-4, Claude, Llama, etc.
3. **Parameters** - Temperature, top_p, max_tokens
4. **Output format** - JSON schemas, structured outputs

Without version control:
- No history of prompt iterations
- Difficult to reproduce past experiments
- Hard to compare prompt variations systematically
- Model configs mixed with prompt content

### Use Cases

1. **Prompt Iteration** - Track changes as prompts are refined
2. **A/B Testing** - Compare prompt versions with statistical rigor
3. **Model Comparison** - Same prompt across different models
4. **Rollback** - Revert to known-good prompt versions
5. **Collaboration** - Multiple researchers iterating on prompts

## Proposed Design

### Data Model

```
PromptTemplate (repository)
├── PromptVersion (commits)
│   ├── systemPrompt
│   ├── userPromptTemplate
│   ├── fewShotExamples[]
│   ├── outputSchema
│   └── toolDefinitions[]
├── PromptBranch (refs)
│   └── points to → PromptVersion
└── PromptVariant (model-specific adaptations)
    └── links PromptVersion + ModelConfig

ModelConfig (LLM settings)
├── provider
├── model
├── parameters
└── responseFormat
```

### Schema

```prisma
// ============================================
// PROMPT VERSION CONTROL
// ============================================

model PromptTemplate {
  id          String   @id @default(cuid())
  studyId     String
  study       Study    @relation(fields: [studyId], references: [id], onDelete: Cascade)

  name        String   // e.g., "Story Generation Prompt"
  description String?

  // Default branch (like git's main/master)
  defaultBranchId String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  versions    PromptVersion[]
  branches    PromptBranch[]
  variants    PromptVariant[]

  @@index([studyId])
  @@map("prompt_templates")
}

model PromptVersion {
  id         String   @id @default(cuid())
  templateId String
  template   PromptTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  // Version tracking
  version    Int      // Auto-incrementing version number
  parentId   String?  // Previous version (null for initial)
  parent     PromptVersion? @relation("VersionHistory", fields: [parentId], references: [id])
  children   PromptVersion[] @relation("VersionHistory")

  // Content hash for deduplication
  contentHash String  // SHA-256 of canonical content

  // === MUST HAVE: Core Prompt Content ===
  systemPrompt       String   // System/instruction prompt
  userPromptTemplate String   // User message template with {{variables}}
  templateVariables  String   @default("[]") // JSON: variable definitions with types

  // === NICE TO HAVE: Extended Content ===
  fewShotExamples    String   @default("[]") // JSON: Array of {input, output} examples
  outputSchema       String?  // JSON Schema for structured output
  toolDefinitions    String   @default("[]") // JSON: Tool/function definitions

  // Metadata
  message    String?  // Commit message describing changes
  createdBy  String?  // Researcher ID who created this version
  createdAt  DateTime @default(now())

  // Branches pointing to this version
  branches   PromptBranch[]
  variants   PromptVariant[]

  @@unique([templateId, version])
  @@unique([templateId, contentHash])
  @@index([templateId])
  @@index([parentId])
  @@map("prompt_versions")
}

model PromptBranch {
  id         String   @id @default(cuid())
  templateId String
  template   PromptTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  name       String   // e.g., "main", "experiment-v2", "concise-variant"
  versionId  String   // Current version this branch points to
  version    PromptVersion @relation(fields: [versionId], references: [id])

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([templateId, name])
  @@index([templateId])
  @@map("prompt_branches")
}

// ============================================
// MODEL CONFIGURATION
// ============================================

model ModelConfig {
  id        String   @id @default(cuid())
  studyId   String
  study     Study    @relation(fields: [studyId], references: [id], onDelete: Cascade)

  name      String   // e.g., "GPT-4 Creative", "Claude Precise"

  // Provider & Model
  provider  String   // "openai", "anthropic", "google", "local"
  model     String   // "gpt-4-turbo", "claude-3-opus", etc.

  // === MUST HAVE: Core Parameters ===
  temperature     Float   @default(0.7)
  maxTokens       Int     @default(1024)
  topP            Float?  // Nucleus sampling

  // === NICE TO HAVE: Extended Parameters ===
  topK            Int?    // Top-k sampling
  presencePenalty Float?  // Reduce repetition
  frequencyPenalty Float? // Reduce repetition
  stopSequences   String  @default("[]") // JSON: array of stop strings
  seed            Int?    // For reproducibility
  responseFormat  String? // JSON: e.g., {"type": "json_object"}

  // Cost tracking
  costPerInputToken  Float? // USD per 1K tokens
  costPerOutputToken Float? // USD per 1K tokens

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  variants  PromptVariant[]

  @@unique([studyId, name])
  @@index([studyId])
  @@map("model_configs")
}

// ============================================
// PROMPT VARIANTS (Model-Specific Adaptations)
// ============================================

model PromptVariant {
  id            String   @id @default(cuid())
  templateId    String
  template      PromptTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  versionId     String
  version       PromptVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  modelConfigId String
  modelConfig   ModelConfig @relation(fields: [modelConfigId], references: [id], onDelete: Cascade)

  // Optional overrides (null = use version's content)
  systemPromptOverride       String?
  userPromptTemplateOverride String?
  fewShotExamplesOverride    String? // JSON

  // Variant metadata
  notes     String?  // Why this variant exists

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([versionId, modelConfigId])
  @@index([templateId])
  @@index([versionId])
  @@index([modelConfigId])
  @@map("prompt_variants")
}
```

### API Endpoints

#### Prompt Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prompts` | List templates (paginated, filtered by study) |
| POST | `/api/v1/prompts` | Create template with initial version |
| GET | `/api/v1/prompts/:id` | Get template with current version |
| PATCH | `/api/v1/prompts/:id` | Update template metadata |
| DELETE | `/api/v1/prompts/:id` | Delete template and all versions |

#### Prompt Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prompts/:id/versions` | List versions (paginated) |
| POST | `/api/v1/prompts/:id/versions` | Create new version |
| GET | `/api/v1/prompts/:id/versions/:vid` | Get specific version |
| GET | `/api/v1/prompts/:id/diff` | Compare two versions |

#### Prompt Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prompts/:id/branches` | List branches |
| POST | `/api/v1/prompts/:id/branches` | Create branch |
| PUT | `/api/v1/prompts/:id/branches/:name` | Update branch pointer |
| DELETE | `/api/v1/prompts/:id/branches/:name` | Delete branch |

#### Model Configs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/model-configs` | List configs (filtered by study) |
| POST | `/api/v1/model-configs` | Create config |
| GET | `/api/v1/model-configs/:id` | Get config |
| PATCH | `/api/v1/model-configs/:id` | Update config |
| DELETE | `/api/v1/model-configs/:id` | Delete config |
| GET | `/api/v1/model-configs/presets` | Get common model presets |

#### Prompt Variants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prompts/:id/variants` | List variants for template |
| POST | `/api/v1/prompts/:id/variants` | Create variant |
| GET | `/api/v1/prompts/:id/variants/:vid` | Get variant |
| PATCH | `/api/v1/prompts/:id/variants/:vid` | Update variant |
| DELETE | `/api/v1/prompts/:id/variants/:vid` | Delete variant |

### Experiment Integration

Experimental conditions can reference:

```json
{
  "conditionId": "cond_123",
  "promptVersionId": "pv_456",    // Specific prompt version
  "modelConfigId": "mc_789",       // Model configuration
  "variantId": "var_012"           // Optional: model-specific variant
}
```

This enables:
- **Prompt A/B testing**: Same model, different prompt versions
- **Model comparison**: Same prompt, different models
- **Full factorial**: Multiple prompts × multiple models

### Content Hashing

Versions are content-addressed using SHA-256:

```typescript
function computeContentHash(version: PromptVersionInput): string {
  const canonical = JSON.stringify({
    systemPrompt: version.systemPrompt,
    userPromptTemplate: version.userPromptTemplate,
    templateVariables: version.templateVariables,
    fewShotExamples: version.fewShotExamples,
    outputSchema: version.outputSchema,
    toolDefinitions: version.toolDefinitions,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

This enables:
- Detecting duplicate content
- Efficient comparison
- Cache-friendly operations

### Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

#### Common Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `INVALID_INPUT` | Request validation failed (e.g., invalid JSON, missing fields) |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 403 | `UNAUTHORIZED` | Access denied to resource |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `ALREADY_EXISTS` | Duplicate resource (e.g., branch name, config name) |

#### Validation Errors

Zod validation failures return detailed error information:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Request validation failed",
    "details": [
      { "path": ["temperature"], "message": "Number must be less than or equal to 2" }
    ]
  }
}
```

### Diff Generation

Compare two versions:

```typescript
GET /api/v1/prompts/:id/diff?from=v1&to=v2

Response:
{
  "from": { "version": 1, "id": "pv_123" },
  "to": { "version": 2, "id": "pv_456" },
  "changes": {
    "systemPrompt": {
      "type": "modified",
      "diff": "unified diff string..."
    },
    "fewShotExamples": {
      "type": "added",
      "count": 2
    }
  }
}
```

## Implementation Plan

### Phase 2a: Core (Must Have)
1. Prisma schema for all models
2. PromptTemplate CRUD
3. PromptVersion creation with content hashing
4. PromptBranch management
5. ModelConfig CRUD
6. Basic diff endpoint

### Phase 2b: Extended (Nice to Have)
1. PromptVariant CRUD
2. Few-shot examples management
3. Output schema validation
4. Tool definitions
5. Version history visualization data

### Phase 2c: Integration (Implemented)

Links prompt version control to the experiment system:

#### Schema Changes

`ExperimentalCondition` gains optional prompt references:
```prisma
model ExperimentalCondition {
  // ... existing fields ...

  // Prompt integration
  promptVersionId String?
  promptVersion   PromptVersion?
  modelConfigId   String?
  modelConfig     ModelConfig?
  promptVariantId String?
  promptVariant   PromptVariant?
}
```

#### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/v1/experiments/:id/conditions/:conditionId/prompt` | Set prompt references on condition |
| GET | `/api/v1/experiments/:id/conditions/:conditionId/prompt` | Resolve effective prompt for condition |
| POST | `/api/v1/experiments/:id/estimate-cost` | Estimate experiment cost based on model configs |

#### Prompt Resolution

The `GET .../prompt` endpoint resolves the effective prompt configuration:
- If `promptVariantId` is set, uses variant overrides
- Falls back to `promptVersionId` content
- Includes `modelConfig` parameters for LLM execution

Response includes:
```json
{
  "systemPrompt": "...",
  "userPromptTemplate": "...",
  "templateVariables": [...],
  "fewShotExamples": [...],
  "outputSchema": {...},
  "toolDefinitions": [...],
  "modelConfig": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.7,
    ...
  }
}
```

#### Cost Estimation

The `POST .../estimate-cost` endpoint calculates expected costs:
- Accepts `inputTokens` and `outputTokens` query params (defaults: 1000/500)
- Uses `costPerInputToken` and `costPerOutputToken` from model configs
- Returns per-condition breakdown and total estimate

## Testing Strategy

1. **Unit tests**: Content hashing, diff generation
2. **Integration tests**: Full CRUD flows
3. **Edge cases**:
   - Duplicate content detection
   - Branch conflicts
   - Circular parent references (prevent)

## Future Considerations

- **Merge support**: Combine branches (complex, defer to Phase 4+)
- **Prompt templates library**: Share across studies
- **Import/Export**: YAML/JSON format for prompts
- **LangChain/LlamaIndex integration**: Import from popular formats
