/**
 * Model Configs routes - LLM provider and parameter configuration
 * RFC 003 Phase 2: Prompt Version Control
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { verifyStudyAccess, safeJsonParse } from '../lib/auth-helpers';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';

export const modelConfigsRouter = Router();

modelConfigsRouter.use(authenticateResearcher);

// ============================================
// VALIDATION SCHEMAS
// ============================================

// ID validation - Prisma uses CUIDs, not UUIDs
const idSchema = z.string().min(1).max(50);

const createModelConfigSchema = z.object({
  studyId: idSchema,
  name: z.string().min(1).max(255),
  provider: z.enum(['openai', 'anthropic', 'google', 'azure', 'local', 'custom']),
  model: z.string().min(1).max(100),
  // Core parameters
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(100000).default(1024),
  topP: z.number().min(0).max(1).optional(),
  // Extended parameters
  topK: z.number().int().min(1).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  stopSequences: z.array(z.string()).default([]),
  seed: z.number().int().optional(),
  responseFormat: z.record(z.unknown()).optional(),
  // Cost tracking
  costPerInputToken: z.number().min(0).optional(),
  costPerOutputToken: z.number().min(0).optional(),
});

const updateModelConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  provider: z.enum(['openai', 'anthropic', 'google', 'azure', 'local', 'custom']).optional(),
  model: z.string().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  topK: z.number().int().min(1).nullable().optional(),
  presencePenalty: z.number().min(-2).max(2).nullable().optional(),
  frequencyPenalty: z.number().min(-2).max(2).nullable().optional(),
  stopSequences: z.array(z.string()).optional(),
  seed: z.number().int().nullable().optional(),
  responseFormat: z.record(z.unknown()).nullable().optional(),
  costPerInputToken: z.number().min(0).nullable().optional(),
  costPerOutputToken: z.number().min(0).nullable().optional(),
});

// ============================================
// HELPER FUNCTIONS
// ============================================


/**
 * Verify researcher has access to a model config
 */
async function verifyModelConfigAccess(configId: string, researcherId: string) {
  const config = await prisma.modelConfig.findUnique({
    where: { id: configId },
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

  if (!config) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Model config not found'
    );
  }

  if (config.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  return config;
}

// ============================================
// CRUD ENDPOINTS
// ============================================

/**
 * GET /api/v1/model-configs
 * List model configs with filters
 */
modelConfigsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);
    const { studyId, provider } = req.query;

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

    if (provider) {
      where.provider = provider as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [configs, total] = await Promise.all([
      prisma.modelConfig.findMany({
        where,
        include: {
          study: {
            select: { id: true, name: true }
          },
          _count: {
            select: { variants: true }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.modelConfig.count({ where })
    ]);

    // Parse JSON fields
    const data = configs.map(config => ({
      ...config,
      stopSequences: safeJsonParse<string[]>(config.stopSequences, []),
      responseFormat: config.responseFormat ? safeJsonParse<Record<string, unknown>>(config.responseFormat, {}) : null,
    }));

    res.json({
      success: true,
      data,
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
 * POST /api/v1/model-configs
 * Create a new model config
 */
modelConfigsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createModelConfigSchema.parse(req.body);

    // Verify study access
    await verifyStudyAccess(data.studyId, req.researcher!.id);

    // Check for duplicate name in study
    const existingConfig = await prisma.modelConfig.findUnique({
      where: {
        studyId_name: { studyId: data.studyId, name: data.name }
      }
    });

    if (existingConfig) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ALREADY_EXISTS,
        `Model config '${data.name}' already exists in this study`
      );
    }

    const config = await prisma.modelConfig.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        provider: data.provider,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        topP: data.topP,
        topK: data.topK,
        presencePenalty: data.presencePenalty,
        frequencyPenalty: data.frequencyPenalty,
        stopSequences: JSON.stringify(data.stopSequences),
        seed: data.seed,
        responseFormat: data.responseFormat ? JSON.stringify(data.responseFormat) : null,
        costPerInputToken: data.costPerInputToken,
        costPerOutputToken: data.costPerOutputToken,
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...config,
        stopSequences: data.stopSequences,
        responseFormat: data.responseFormat || null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/model-configs/presets
 * Get common model presets for quick setup
 * NOTE: This route must be defined BEFORE /:id to avoid matching "presets" as an ID
 */
modelConfigsRouter.get('/presets', async (_req: AuthRequest, res, next) => {
  try {
    const presets = [
      {
        name: 'GPT-4 Turbo (Balanced)',
        provider: 'openai',
        model: 'gpt-4-turbo',
        temperature: 0.7,
        maxTokens: 4096,
        costPerInputToken: 0.01,
        costPerOutputToken: 0.03,
      },
      {
        name: 'GPT-4 Turbo (Creative)',
        provider: 'openai',
        model: 'gpt-4-turbo',
        temperature: 1.0,
        maxTokens: 4096,
        topP: 0.95,
        costPerInputToken: 0.01,
        costPerOutputToken: 0.03,
      },
      {
        name: 'GPT-4 Turbo (Precise)',
        provider: 'openai',
        model: 'gpt-4-turbo',
        temperature: 0.2,
        maxTokens: 4096,
        costPerInputToken: 0.01,
        costPerOutputToken: 0.03,
      },
      {
        name: 'Claude 3 Opus (Balanced)',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
        maxTokens: 4096,
        costPerInputToken: 0.015,
        costPerOutputToken: 0.075,
      },
      {
        name: 'Claude 3.5 Sonnet (Balanced)',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
        costPerInputToken: 0.003,
        costPerOutputToken: 0.015,
      },
      {
        name: 'Claude 3 Haiku (Fast)',
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        temperature: 0.7,
        maxTokens: 4096,
        costPerInputToken: 0.00025,
        costPerOutputToken: 0.00125,
      },
      {
        name: 'Gemini Pro (Balanced)',
        provider: 'google',
        model: 'gemini-pro',
        temperature: 0.7,
        maxTokens: 8192,
        costPerInputToken: 0.00025,
        costPerOutputToken: 0.0005,
      },
      {
        name: 'Local Ollama (Llama 3)',
        provider: 'local',
        model: 'llama3',
        temperature: 0.7,
        maxTokens: 4096,
        costPerInputToken: 0,
        costPerOutputToken: 0,
      },
    ];

    res.json({
      success: true,
      data: presets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/model-configs/:id
 * Get a specific model config
 */
modelConfigsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const configId = idSchema.parse(req.params.id);
    const config = await verifyModelConfigAccess(configId, req.researcher!.id);

    res.json({
      success: true,
      data: {
        ...config,
        stopSequences: safeJsonParse<string[]>(config.stopSequences, []),
        responseFormat: config.responseFormat ? safeJsonParse<Record<string, unknown>>(config.responseFormat, {}) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/model-configs/:id
 * Update a model config
 */
modelConfigsRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const configId = idSchema.parse(req.params.id);
    const existingConfig = await verifyModelConfigAccess(configId, req.researcher!.id);

    const data = updateModelConfigSchema.parse(req.body);

    // Check for duplicate name if changing name
    if (data.name && data.name !== existingConfig.name) {
      const duplicateConfig = await prisma.modelConfig.findUnique({
        where: {
          studyId_name: { studyId: existingConfig.studyId, name: data.name }
        }
      });

      if (duplicateConfig) {
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.ALREADY_EXISTS,
          `Model config '${data.name}' already exists in this study`
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.temperature !== undefined) updateData.temperature = data.temperature;
    if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
    if (data.topP !== undefined) updateData.topP = data.topP;
    if (data.topK !== undefined) updateData.topK = data.topK;
    if (data.presencePenalty !== undefined) updateData.presencePenalty = data.presencePenalty;
    if (data.frequencyPenalty !== undefined) updateData.frequencyPenalty = data.frequencyPenalty;
    if (data.stopSequences !== undefined) updateData.stopSequences = JSON.stringify(data.stopSequences);
    if (data.seed !== undefined) updateData.seed = data.seed;
    if (data.responseFormat !== undefined) {
      updateData.responseFormat = data.responseFormat ? JSON.stringify(data.responseFormat) : null;
    }
    if (data.costPerInputToken !== undefined) updateData.costPerInputToken = data.costPerInputToken;
    if (data.costPerOutputToken !== undefined) updateData.costPerOutputToken = data.costPerOutputToken;

    const config = await prisma.modelConfig.update({
      where: { id: configId },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        ...config,
        stopSequences: safeJsonParse<string[]>(config.stopSequences, []),
        responseFormat: config.responseFormat ? safeJsonParse<Record<string, unknown>>(config.responseFormat, {}) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/model-configs/:id
 * Delete a model config
 */
modelConfigsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const configId = idSchema.parse(req.params.id);
    await verifyModelConfigAccess(configId, req.researcher!.id);

    // Check if config is used by any variants
    const variantCount = await prisma.promptVariant.count({
      where: { modelConfigId: configId }
    });

    if (variantCount > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Cannot delete model config: it is used by ${variantCount} prompt variant(s)`
      );
    }

    await prisma.modelConfig.delete({
      where: { id: configId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

