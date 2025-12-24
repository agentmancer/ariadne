/**
 * Prompts routes - Prompt version control
 * RFC 003 Phase 2: Prompt Version Control
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { verifyStudyAccess, safeJsonParse } from '../lib/auth-helpers';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as diff from 'diff';

export const promptsRouter = Router();

promptsRouter.use(authenticateResearcher);

// ============================================
// VALIDATION SCHEMAS
// ============================================

// ID validation - Prisma uses CUIDs, not UUIDs
const idSchema = z.string().min(1).max(50);

// Template variable definition
const templateVariableSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
});

// Few-shot example
const fewShotExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  description: z.string().optional(),
});

// Tool definition (simplified OpenAI function calling format)
const toolDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

// Create template with initial version
const createTemplateSchema = z.object({
  studyId: idSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  // Initial version content
  systemPrompt: z.string().min(1),
  userPromptTemplate: z.string().min(1),
  templateVariables: z.array(templateVariableSchema).default([]),
  fewShotExamples: z.array(fewShotExampleSchema).default([]),
  outputSchema: z.record(z.unknown()).optional(),
  toolDefinitions: z.array(toolDefinitionSchema).default([]),
  message: z.string().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  defaultBranch: z.string().min(1).max(100).optional(),
});

// Create new version
const createVersionSchema = z.object({
  systemPrompt: z.string().min(1),
  userPromptTemplate: z.string().min(1),
  templateVariables: z.array(templateVariableSchema).default([]),
  fewShotExamples: z.array(fewShotExampleSchema).default([]),
  outputSchema: z.record(z.unknown()).optional(),
  toolDefinitions: z.array(toolDefinitionSchema).default([]),
  message: z.string().optional(),
  parentId: idSchema.optional(), // If not provided, uses latest version on default branch
  branchName: z.string().min(1).max(100).optional(), // If provided, updates this branch
});

// Branch operations
const createBranchSchema = z.object({
  name: z.string().min(1).max(100),
  versionId: idSchema.optional(), // If not provided, uses latest version on default branch
});

const updateBranchSchema = z.object({
  versionId: idSchema,
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Compute SHA-256 content hash for a prompt version
 */
function computeContentHash(content: {
  systemPrompt: string;
  userPromptTemplate: string;
  templateVariables: unknown[];
  fewShotExamples: unknown[];
  outputSchema?: unknown;
  toolDefinitions: unknown[];
}): string {
  const canonical = JSON.stringify({
    systemPrompt: content.systemPrompt,
    userPromptTemplate: content.userPromptTemplate,
    templateVariables: content.templateVariables,
    fewShotExamples: content.fewShotExamples,
    outputSchema: content.outputSchema || null,
    toolDefinitions: content.toolDefinitions,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}


/**
 * Verify researcher has access to a template
 */
async function verifyTemplateAccess(templateId: string, researcherId: string) {
  const template = await prisma.promptTemplate.findUnique({
    where: { id: templateId },
    include: {
      study: {
        include: {
          project: {
            select: { researcherId: true }
          }
        }
      }
    }
  });

  if (!template) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Prompt template not found'
    );
  }

  if (template.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  return template;
}

/**
 * Get the latest version on a branch
 */
async function getLatestVersionOnBranch(templateId: string, branchName: string) {
  const branch = await prisma.promptBranch.findUnique({
    where: {
      templateId_name: { templateId, name: branchName }
    },
    include: { version: true }
  });

  if (!branch) {
    return null;
  }

  return branch.version;
}

/**
 * Get the next version number for a template
 */
async function getNextVersionNumber(templateId: string): Promise<number> {
  const maxVersion = await prisma.promptVersion.aggregate({
    where: { templateId },
    _max: { version: true }
  });

  return (maxVersion._max.version || 0) + 1;
}

// ============================================
// TEMPLATE CRUD ENDPOINTS
// ============================================

/**
 * GET /api/v1/prompts
 * List prompt templates with filters
 */
promptsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);
    const { studyId } = req.query;

    const where: Record<string, unknown> = {
      study: {
        project: {
          researcherId: req.researcher!.id
        }
      }
    };

    if (studyId) {
      where.studyId = studyId as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [templates, total] = await Promise.all([
      prisma.promptTemplate.findMany({
        where,
        include: {
          study: {
            select: { id: true, name: true }
          },
          _count: {
            select: { versions: true, branches: true, variants: true }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.promptTemplate.count({ where })
    ]);

    res.json({
      success: true,
      data: templates,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/prompts
 * Create a new prompt template with initial version
 */
promptsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createTemplateSchema.parse(req.body);

    // Verify study access
    await verifyStudyAccess(data.studyId, req.researcher!.id);

    // Compute content hash
    const contentHash = computeContentHash({
      systemPrompt: data.systemPrompt,
      userPromptTemplate: data.userPromptTemplate,
      templateVariables: data.templateVariables,
      fewShotExamples: data.fewShotExamples,
      outputSchema: data.outputSchema,
      toolDefinitions: data.toolDefinitions,
    });

    // Create template with initial version and main branch in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create template
      const template = await tx.promptTemplate.create({
        data: {
          studyId: data.studyId,
          name: data.name,
          description: data.description,
          defaultBranch: 'main',
        }
      });

      // Create initial version
      const version = await tx.promptVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          contentHash,
          systemPrompt: data.systemPrompt,
          userPromptTemplate: data.userPromptTemplate,
          templateVariables: JSON.stringify(data.templateVariables),
          fewShotExamples: JSON.stringify(data.fewShotExamples),
          outputSchema: data.outputSchema ? JSON.stringify(data.outputSchema) : null,
          toolDefinitions: JSON.stringify(data.toolDefinitions),
          message: data.message || 'Initial version',
          createdBy: req.researcher!.id,
        }
      });

      // Create main branch pointing to initial version
      await tx.promptBranch.create({
        data: {
          templateId: template.id,
          name: 'main',
          versionId: version.id,
        }
      });

      return { template, version };
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...result.template,
        currentVersion: result.version,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/prompts/:id
 * Get template with current version (from default branch)
 */
promptsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    const template = await verifyTemplateAccess(templateId, req.researcher!.id);

    // Get current version from default branch
    const currentVersion = await getLatestVersionOnBranch(templateId, template.defaultBranch);

    // Get branch info
    const branches = await prisma.promptBranch.findMany({
      where: { templateId },
      select: { name: true, versionId: true }
    });

    res.json({
      success: true,
      data: {
        ...template,
        currentVersion,
        branches,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/prompts/:id
 * Update template metadata
 */
promptsRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const data = updateTemplateSchema.parse(req.body);

    // If changing default branch, verify it exists
    if (data.defaultBranch) {
      const branch = await prisma.promptBranch.findUnique({
        where: {
          templateId_name: { templateId, name: data.defaultBranch }
        }
      });
      if (!branch) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Branch '${data.defaultBranch}' does not exist`
        );
      }
    }

    const template = await prisma.promptTemplate.update({
      where: { id: templateId },
      data,
    });

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/prompts/:id
 * Delete template and all versions
 */
promptsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    await prisma.promptTemplate.delete({
      where: { id: templateId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

// ============================================
// VERSION ENDPOINTS
// ============================================

/**
 * GET /api/v1/prompts/:id/versions
 * List versions for a template
 */
promptsRouter.get('/:id/versions', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [versions, total] = await Promise.all([
      prisma.promptVersion.findMany({
        where: { templateId },
        select: {
          id: true,
          version: true,
          parentId: true,
          contentHash: true,
          message: true,
          createdBy: true,
          createdAt: true,
          branches: {
            select: { name: true }
          }
        },
        skip,
        take,
        orderBy: { version: 'desc' }
      }),
      prisma.promptVersion.count({ where: { templateId } })
    ]);

    res.json({
      success: true,
      data: versions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/prompts/:id/versions
 * Create a new version
 */
promptsRouter.post('/:id/versions', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    const template = await verifyTemplateAccess(templateId, req.researcher!.id);

    const data = createVersionSchema.parse(req.body);

    // Compute content hash
    const contentHash = computeContentHash({
      systemPrompt: data.systemPrompt,
      userPromptTemplate: data.userPromptTemplate,
      templateVariables: data.templateVariables,
      fewShotExamples: data.fewShotExamples,
      outputSchema: data.outputSchema,
      toolDefinitions: data.toolDefinitions,
    });

    // Check for duplicate content
    const existingVersion = await prisma.promptVersion.findUnique({
      where: {
        templateId_contentHash: { templateId, contentHash }
      }
    });

    if (existingVersion) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ALREADY_EXISTS,
        `Identical content already exists as version ${existingVersion.version}`
      );
    }

    // Determine parent version
    let parentId = data.parentId;
    if (!parentId) {
      const latestVersion = await getLatestVersionOnBranch(templateId, template.defaultBranch);
      parentId = latestVersion?.id;
    }

    // Create version and optionally update branch
    const result = await prisma.$transaction(async (tx) => {
      const nextVersion = await getNextVersionNumber(templateId);

      const version = await tx.promptVersion.create({
        data: {
          templateId,
          version: nextVersion,
          parentId,
          contentHash,
          systemPrompt: data.systemPrompt,
          userPromptTemplate: data.userPromptTemplate,
          templateVariables: JSON.stringify(data.templateVariables),
          fewShotExamples: JSON.stringify(data.fewShotExamples),
          outputSchema: data.outputSchema ? JSON.stringify(data.outputSchema) : null,
          toolDefinitions: JSON.stringify(data.toolDefinitions),
          message: data.message,
          createdBy: req.researcher!.id,
        }
      });

      // Update branch if specified
      const branchName = data.branchName || template.defaultBranch;
      await tx.promptBranch.upsert({
        where: {
          templateId_name: { templateId, name: branchName }
        },
        update: {
          versionId: version.id,
        },
        create: {
          templateId,
          name: branchName,
          versionId: version.id,
        }
      });

      return version;
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/prompts/:id/versions/:versionId
 * Get a specific version
 */
promptsRouter.get('/:id/versions/:versionId', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const versionId = idSchema.parse(req.params.versionId);

    const version = await prisma.promptVersion.findFirst({
      where: { id: versionId, templateId },
      include: {
        branches: {
          select: { name: true }
        },
        parent: {
          select: { id: true, version: true }
        }
      }
    });

    if (!version) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Version not found'
      );
    }

    // Parse JSON fields
    res.json({
      success: true,
      data: {
        ...version,
        templateVariables: safeJsonParse<unknown[]>(version.templateVariables, []),
        fewShotExamples: safeJsonParse<unknown[]>(version.fewShotExamples, []),
        outputSchema: version.outputSchema ? safeJsonParse<Record<string, unknown>>(version.outputSchema, {}) : null,
        toolDefinitions: safeJsonParse<unknown[]>(version.toolDefinitions, []),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/prompts/:id/diff
 * Compare two versions
 */
promptsRouter.get('/:id/diff', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const fromVersion = Number(req.query.from);
    const toVersion = Number(req.query.to);

    if (isNaN(fromVersion) || isNaN(toVersion)) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Both "from" and "to" version numbers are required'
      );
    }

    const [fromV, toV] = await Promise.all([
      prisma.promptVersion.findFirst({
        where: { templateId, version: fromVersion }
      }),
      prisma.promptVersion.findFirst({
        where: { templateId, version: toVersion }
      })
    ]);

    if (!fromV || !toV) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'One or both versions not found'
      );
    }

    // Generate diffs for each field
    const changes: Record<string, { type: string; diff?: string; from?: unknown; to?: unknown }> = {};

    // System prompt diff
    if (fromV.systemPrompt !== toV.systemPrompt) {
      changes.systemPrompt = {
        type: 'modified',
        diff: diff.createPatch('systemPrompt', fromV.systemPrompt, toV.systemPrompt, `v${fromVersion}`, `v${toVersion}`)
      };
    }

    // User prompt template diff
    if (fromV.userPromptTemplate !== toV.userPromptTemplate) {
      changes.userPromptTemplate = {
        type: 'modified',
        diff: diff.createPatch('userPromptTemplate', fromV.userPromptTemplate, toV.userPromptTemplate, `v${fromVersion}`, `v${toVersion}`)
      };
    }

    // Template variables
    const fromVars = safeJsonParse<unknown[]>(fromV.templateVariables, []);
    const toVars = safeJsonParse<unknown[]>(toV.templateVariables, []);
    if (fromV.templateVariables !== toV.templateVariables) {
      changes.templateVariables = {
        type: fromVars.length === 0 ? 'added' : toVars.length === 0 ? 'removed' : 'modified',
        from: fromVars,
        to: toVars,
      };
    }

    // Few-shot examples
    const fromExamples = safeJsonParse<unknown[]>(fromV.fewShotExamples, []);
    const toExamples = safeJsonParse<unknown[]>(toV.fewShotExamples, []);
    if (fromV.fewShotExamples !== toV.fewShotExamples) {
      changes.fewShotExamples = {
        type: fromExamples.length === 0 ? 'added' : toExamples.length === 0 ? 'removed' : 'modified',
        from: fromExamples,
        to: toExamples,
      };
    }

    // Output schema
    if (fromV.outputSchema !== toV.outputSchema) {
      changes.outputSchema = {
        type: !fromV.outputSchema ? 'added' : !toV.outputSchema ? 'removed' : 'modified',
        from: fromV.outputSchema ? safeJsonParse<Record<string, unknown>>(fromV.outputSchema, {}) : null,
        to: toV.outputSchema ? safeJsonParse<Record<string, unknown>>(toV.outputSchema, {}) : null,
      };
    }

    // Tool definitions
    const fromTools = safeJsonParse<unknown[]>(fromV.toolDefinitions, []);
    const toTools = safeJsonParse<unknown[]>(toV.toolDefinitions, []);
    if (fromV.toolDefinitions !== toV.toolDefinitions) {
      changes.toolDefinitions = {
        type: fromTools.length === 0 ? 'added' : toTools.length === 0 ? 'removed' : 'modified',
        from: fromTools,
        to: toTools,
      };
    }

    res.json({
      success: true,
      data: {
        from: { version: fromVersion, id: fromV.id },
        to: { version: toVersion, id: toV.id },
        changes,
        hasChanges: Object.keys(changes).length > 0,
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// BRANCH ENDPOINTS
// ============================================

/**
 * GET /api/v1/prompts/:id/branches
 * List branches for a template
 */
promptsRouter.get('/:id/branches', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    const template = await verifyTemplateAccess(templateId, req.researcher!.id);

    const branches = await prisma.promptBranch.findMany({
      where: { templateId },
      include: {
        version: {
          select: {
            id: true,
            version: true,
            message: true,
            createdAt: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: branches.map(b => ({
        ...b,
        isDefault: b.name === template.defaultBranch,
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/prompts/:id/branches
 * Create a new branch
 */
promptsRouter.post('/:id/branches', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    const template = await verifyTemplateAccess(templateId, req.researcher!.id);

    const data = createBranchSchema.parse(req.body);

    // Check if branch already exists
    const existingBranch = await prisma.promptBranch.findUnique({
      where: {
        templateId_name: { templateId, name: data.name }
      }
    });

    if (existingBranch) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ALREADY_EXISTS,
        `Branch '${data.name}' already exists`
      );
    }

    // Get version to point to
    let versionId = data.versionId;
    if (!versionId) {
      const latestVersion = await getLatestVersionOnBranch(templateId, template.defaultBranch);
      if (!latestVersion) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'No versions exist to create branch from'
        );
      }
      versionId = latestVersion.id;
    }

    // Verify version exists and belongs to template
    const version = await prisma.promptVersion.findFirst({
      where: { id: versionId, templateId }
    });

    if (!version) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Version not found'
      );
    }

    const branch = await prisma.promptBranch.create({
      data: {
        templateId,
        name: data.name,
        versionId,
      },
      include: {
        version: {
          select: { id: true, version: true }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/prompts/:id/branches/:name
 * Update branch pointer
 */
promptsRouter.put('/:id/branches/:name', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const branchName = req.params.name;
    const data = updateBranchSchema.parse(req.body);

    // Verify branch exists
    const existingBranch = await prisma.promptBranch.findUnique({
      where: {
        templateId_name: { templateId, name: branchName }
      }
    });

    if (!existingBranch) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        `Branch '${branchName}' not found`
      );
    }

    // Verify version exists and belongs to template
    const version = await prisma.promptVersion.findFirst({
      where: { id: data.versionId, templateId }
    });

    if (!version) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Version not found'
      );
    }

    const branch = await prisma.promptBranch.update({
      where: {
        templateId_name: { templateId, name: branchName }
      },
      data: {
        versionId: data.versionId,
      },
      include: {
        version: {
          select: { id: true, version: true }
        }
      }
    });

    res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/prompts/:id/branches/:name
 * Delete a branch
 */
promptsRouter.delete('/:id/branches/:name', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    const template = await verifyTemplateAccess(templateId, req.researcher!.id);

    const branchName = req.params.name;

    // Cannot delete default branch
    if (branchName === template.defaultBranch) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete the default branch'
      );
    }

    // Verify branch exists
    const existingBranch = await prisma.promptBranch.findUnique({
      where: {
        templateId_name: { templateId, name: branchName }
      }
    });

    if (!existingBranch) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        `Branch '${branchName}' not found`
      );
    }

    await prisma.promptBranch.delete({
      where: {
        templateId_name: { templateId, name: branchName }
      }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

// ============================================
// VARIANT ENDPOINTS
// ============================================

/**
 * GET /api/v1/prompts/:id/variants
 * List variants for a template
 */
promptsRouter.get('/:id/variants', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const { versionId, modelConfigId } = req.query;

    const where: Record<string, unknown> = { templateId };
    if (versionId) where.versionId = versionId as string;
    if (modelConfigId) where.modelConfigId = modelConfigId as string;

    const variants = await prisma.promptVariant.findMany({
      where,
      include: {
        version: {
          select: { id: true, version: true }
        },
        modelConfig: {
          select: { id: true, name: true, provider: true, model: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: variants
    });
  } catch (error) {
    next(error);
  }
});

// Variant creation schema
const createVariantSchema = z.object({
  versionId: idSchema,
  modelConfigId: idSchema,
  systemPromptOverride: z.string().optional(),
  userPromptTemplateOverride: z.string().optional(),
  fewShotExamplesOverride: z.array(fewShotExampleSchema).optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/prompts/:id/variants
 * Create a variant
 */
promptsRouter.post('/:id/variants', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const data = createVariantSchema.parse(req.body);

    // Verify version belongs to template
    const version = await prisma.promptVersion.findFirst({
      where: { id: data.versionId, templateId }
    });

    if (!version) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Version not found'
      );
    }

    // Verify model config exists and belongs to same study
    const template = await prisma.promptTemplate.findUnique({
      where: { id: templateId },
      select: { studyId: true }
    });

    const modelConfig = await prisma.modelConfig.findFirst({
      where: { id: data.modelConfigId, studyId: template!.studyId }
    });

    if (!modelConfig) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Model config not found in study'
      );
    }

    // Check for existing variant
    const existingVariant = await prisma.promptVariant.findUnique({
      where: {
        versionId_modelConfigId: { versionId: data.versionId, modelConfigId: data.modelConfigId }
      }
    });

    if (existingVariant) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ALREADY_EXISTS,
        'Variant already exists for this version and model config'
      );
    }

    const variant = await prisma.promptVariant.create({
      data: {
        templateId,
        versionId: data.versionId,
        modelConfigId: data.modelConfigId,
        systemPromptOverride: data.systemPromptOverride,
        userPromptTemplateOverride: data.userPromptTemplateOverride,
        fewShotExamplesOverride: data.fewShotExamplesOverride ? JSON.stringify(data.fewShotExamplesOverride) : null,
        notes: data.notes,
      },
      include: {
        version: {
          select: { id: true, version: true }
        },
        modelConfig: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: variant
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/prompts/:id/variants/:variantId
 * Get a specific variant
 */
promptsRouter.get('/:id/variants/:variantId', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const variantId = idSchema.parse(req.params.variantId);

    const variant = await prisma.promptVariant.findFirst({
      where: { id: variantId, templateId },
      include: {
        version: true,
        modelConfig: true,
      }
    });

    if (!variant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Variant not found'
      );
    }

    res.json({
      success: true,
      data: {
        ...variant,
        fewShotExamplesOverride: variant.fewShotExamplesOverride ? safeJsonParse<unknown[]>(variant.fewShotExamplesOverride, []) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Variant update schema
const updateVariantSchema = z.object({
  systemPromptOverride: z.string().nullable().optional(),
  userPromptTemplateOverride: z.string().nullable().optional(),
  fewShotExamplesOverride: z.array(fewShotExampleSchema).nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * PATCH /api/v1/prompts/:id/variants/:variantId
 * Update a variant
 */
promptsRouter.patch('/:id/variants/:variantId', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const variantId = idSchema.parse(req.params.variantId);
    const data = updateVariantSchema.parse(req.body);

    const existingVariant = await prisma.promptVariant.findFirst({
      where: { id: variantId, templateId }
    });

    if (!existingVariant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Variant not found'
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.systemPromptOverride !== undefined) updateData.systemPromptOverride = data.systemPromptOverride;
    if (data.userPromptTemplateOverride !== undefined) updateData.userPromptTemplateOverride = data.userPromptTemplateOverride;
    if (data.fewShotExamplesOverride !== undefined) {
      updateData.fewShotExamplesOverride = data.fewShotExamplesOverride ? JSON.stringify(data.fewShotExamplesOverride) : null;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;

    const variant = await prisma.promptVariant.update({
      where: { id: variantId },
      data: updateData,
      include: {
        version: {
          select: { id: true, version: true }
        },
        modelConfig: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      success: true,
      data: {
        ...variant,
        fewShotExamplesOverride: variant.fewShotExamplesOverride ? safeJsonParse<unknown[]>(variant.fewShotExamplesOverride, []) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/prompts/:id/variants/:variantId
 * Delete a variant
 */
promptsRouter.delete('/:id/variants/:variantId', async (req: AuthRequest, res, next) => {
  try {
    const templateId = idSchema.parse(req.params.id);
    await verifyTemplateAccess(templateId, req.researcher!.id);

    const variantId = idSchema.parse(req.params.variantId);

    const existingVariant = await prisma.promptVariant.findFirst({
      where: { id: variantId, templateId }
    });

    if (!existingVariant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Variant not found'
      );
    }

    await prisma.promptVariant.delete({
      where: { id: variantId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});
