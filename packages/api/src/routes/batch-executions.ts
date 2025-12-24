/**
 * Batch Executions routes
 * CRUD operations for batch execution management and job queue integration
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import {
  addBatchCreationJob,
  addDataExportJob,
  addCollaborativeBatchJob,
  getAllQueueStats,
  setBatchStatusCache,
  deleteBatchStatusCache,
} from '../services/queue';
import { getPredefinedConfig } from '../services/architecture';

export const batchExecutionsRouter = Router();

batchExecutionsRouter.use(authenticateResearcher);

// ============================================================================
// Validation Schemas
// ============================================================================

const createBatchExecutionSchema = z.object({
  studyId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['TRAINING_DATA', 'EVALUATION', 'SIMULATION']),
  conditionId: z.string().optional(),
  // Actor configuration
  actorCount: z.number().int().min(1).max(1000),
  role: z.enum(['PLAYER', 'STORYTELLER', 'EDITOR', 'CONSISTENCY_MANAGER', 'EVALUATOR', 'PARTNER', 'CUSTOM']),
  llmConfig: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }),
  agentDefinitionId: z.string().optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
  // Architecture config for story generation (optional - uses condition's config if not provided)
  architectureConfigKey: z.string().optional(), // Reference to predefined config
});

const exportBatchSchema = z.object({
  format: z.enum(['JSON', 'JSONL', 'CSV']).default('JSONL'),
  includeEvents: z.boolean().default(true),
  includeSurveyResponses: z.boolean().default(true),
  includeStoryData: z.boolean().default(true),
  participantIds: z.array(z.string()).optional(),
  eventTypes: z.array(z.string()).optional(),
});

const createCollaborativeBatchSchema = z.object({
  studyId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  conditionId: z.string().optional(),
  // Collaborative configuration
  pairCount: z.number().int().min(1).max(500), // Number of pairs (total participants = pairCount * 2)
  sessionConfig: z.object({
    rounds: z.number().int().positive().default(3),
    phases: z.array(z.enum(['AUTHOR', 'PLAY', 'REVIEW'])).default(['AUTHOR', 'PLAY', 'REVIEW']),
    feedbackRequired: z.boolean().default(true),
    maxPlayActions: z.number().int().positive().default(20),
    storyConstraints: z.object({
      genre: z.string().optional(),
      theme: z.string().optional(),
      maxPassages: z.number().optional(),
      minPassages: z.number().optional(),
    }).optional(),
  }).optional(),
  // LLM configuration
  llmConfig: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }),
  // Whether to use different LLM configs for partners
  varyPartnerConfig: z.boolean().default(false),
  partnerLlmConfig: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(),
  agentDefinitionId: z.string().optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/batch-executions/queue/stats
 * Get queue statistics (admin/monitoring)
 * NOTE: This route MUST be defined before /:id to avoid route conflict
 */
batchExecutionsRouter.get('/queue/stats', async (_req: AuthRequest, res, next) => {
  try {
    const stats = await getAllQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    // Handle Redis connection failures gracefully
    if (error instanceof Error && error.message.includes('Redis')) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: 'Queue service is temporarily unavailable',
        },
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/batch-executions/collaborative
 * Create a new collaborative batch execution with paired agents
 * NOTE: This route MUST be defined before /:id to avoid route conflict
 */
batchExecutionsRouter.post('/collaborative', async (req: AuthRequest, res, next) => {
  try {
    const data = createCollaborativeBatchSchema.parse(req.body);

    // Verify study ownership
    const study = await prisma.study.findUnique({
      where: { id: data.studyId },
      include: {
        project: {
          select: { researcherId: true },
        },
      },
    });

    if (!study) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Study not found');
    }

    if (study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to create batch executions for this study'
      );
    }

    // Verify condition if provided
    if (data.conditionId) {
      const condition = await prisma.condition.findFirst({
        where: { id: data.conditionId, studyId: data.studyId },
      });

      if (!condition) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Condition not found or does not belong to the specified study'
        );
      }
    }

    // Validate partner config if varyPartnerConfig is true
    if (data.varyPartnerConfig && !data.partnerLlmConfig) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'partnerLlmConfig is required when varyPartnerConfig is true'
      );
    }

    // Create batch execution record
    const batch = await prisma.batchExecution.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        description: data.description,
        type: 'SIMULATION', // Collaborative batches are simulations
        status: 'QUEUED',
        config: JSON.stringify({
          collaborative: true,
          conditionId: data.conditionId,
          pairCount: data.pairCount,
          sessionConfig: data.sessionConfig,
          llmConfig: data.llmConfig,
          varyPartnerConfig: data.varyPartnerConfig,
          partnerLlmConfig: data.partnerLlmConfig,
          agentDefinitionId: data.agentDefinitionId,
          priority: data.priority,
        }),
      },
      include: {
        study: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Queue the collaborative batch creation job
    const jobId = await addCollaborativeBatchJob({
      batchExecutionId: batch.id,
      studyId: data.studyId,
      conditionId: data.conditionId,
      pairCount: data.pairCount,
      sessionConfig: data.sessionConfig,
      llmConfig: data.llmConfig,
      varyPartnerConfig: data.varyPartnerConfig,
      partnerLlmConfig: data.partnerLlmConfig,
      agentDefinitionId: data.agentDefinitionId,
      priority: data.priority,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...batch,
        jobId,
        collaborative: true,
        expectedParticipants: data.pairCount * 2,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/batch-executions
 * List batch executions for studies the researcher has access to
 */
batchExecutionsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { studyId, status } = req.query;

    // Parse pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);

    // Build where clause - only show batches from researcher's studies
    const where: Prisma.BatchExecutionWhereInput = {
      study: {
        project: {
          researcherId: req.researcher!.id,
        },
      },
    };

    if (studyId) {
      where.studyId = studyId as string;
    }

    if (status) {
      where.status = status as string;
    }

    const [batches, total] = await Promise.all([
      prisma.batchExecution.findMany({
        where,
        include: {
          study: {
            select: {
              id: true,
              name: true,
              project: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              participants: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.batchExecution.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        batches,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: page * pageSize < total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/batch-executions
 * Create a new batch execution and start processing
 */
batchExecutionsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createBatchExecutionSchema.parse(req.body);

    // Verify study ownership
    const study = await prisma.study.findUnique({
      where: { id: data.studyId },
      include: {
        project: {
          select: { researcherId: true },
        },
      },
    });

    if (!study) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Study not found');
    }

    if (study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to create batch executions for this study'
      );
    }

    // Verify condition if provided and get its architecture config
    let conditionArchConfig: string | null = null;
    if (data.conditionId) {
      const condition = await prisma.condition.findFirst({
        where: { id: data.conditionId, studyId: data.studyId },
      });

      if (!condition) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Condition not found or does not belong to the specified study'
        );
      }
      conditionArchConfig = condition.architectureConfig;
    }

    // Resolve architecture config: explicit key > condition's config > null
    let resolvedArchConfig: unknown = null;
    if (data.architectureConfigKey) {
      const predefined = getPredefinedConfig(data.architectureConfigKey);
      if (!predefined) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Predefined architecture config '${data.architectureConfigKey}' not found`
        );
      }
      resolvedArchConfig = predefined;
    } else if (conditionArchConfig) {
      resolvedArchConfig = JSON.parse(conditionArchConfig);
    }

    // Create batch execution record
    const batch = await prisma.batchExecution.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        description: data.description,
        type: data.type,
        status: 'QUEUED',
        config: JSON.stringify({
          conditionId: data.conditionId,
          actorCount: data.actorCount,
          role: data.role,
          llmConfig: data.llmConfig,
          agentDefinitionId: data.agentDefinitionId,
          priority: data.priority,
          architectureConfig: resolvedArchConfig,
        }),
      },
      include: {
        study: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Queue the batch creation job
    const jobId = await addBatchCreationJob({
      batchExecutionId: batch.id,
      studyId: data.studyId,
      conditionId: data.conditionId,
      actorCount: data.actorCount,
      role: data.role,
      llmConfig: data.llmConfig,
      agentDefinitionId: data.agentDefinitionId,
      priority: data.priority,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...batch,
        jobId,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/batch-executions/:id
 * Get batch execution details with progress
 */
batchExecutionsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const batch = await prisma.batchExecution.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true },
            },
          },
        },
        participants: {
          select: {
            id: true,
            uniqueId: true,
            state: true,
            role: true,
            createdAt: true,
            completedAt: true,
          },
          take: 100, // Limit for large batches
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      },
    });

    if (!batch) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Batch execution not found');
    }

    if (batch.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to access this batch execution'
      );
    }

    // Calculate progress
    const progress = {
      total: batch.actorsCreated,
      completed: batch.actorsCompleted,
      percentage: batch.actorsCreated > 0
        ? Math.round((batch.actorsCompleted / batch.actorsCreated) * 100)
        : 0,
      // Count by state
      byState: await prisma.participant.groupBy({
        by: ['state'],
        where: { batchId: batch.id },
        _count: true,
      }),
    };

    res.json({
      success: true,
      data: {
        ...batch,
        progress,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/batch-executions/:id/pause
 * Pause a running batch execution
 */
batchExecutionsRouter.post('/:id/pause', async (req: AuthRequest, res, next) => {
  try {
    const batch = await prisma.batchExecution.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Batch execution not found');
    }

    if (batch.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to pause this batch execution'
      );
    }

    if (batch.status !== 'RUNNING') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Cannot pause batch with status ${batch.status}`
      );
    }

    const updated = await prisma.batchExecution.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
    });

    // Update Redis cache for fast pause detection by workers
    await setBatchStatusCache(req.params.id, 'PAUSED');

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/batch-executions/:id/resume
 * Resume a paused batch execution
 */
batchExecutionsRouter.post('/:id/resume', async (req: AuthRequest, res, next) => {
  try {
    const batch = await prisma.batchExecution.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Batch execution not found');
    }

    if (batch.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to resume this batch execution'
      );
    }

    if (batch.status !== 'PAUSED') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Cannot resume batch with status ${batch.status}`
      );
    }

    const updated = await prisma.batchExecution.update({
      where: { id: req.params.id },
      data: { status: 'RUNNING' },
    });

    // Update Redis cache for workers
    await setBatchStatusCache(req.params.id, 'RUNNING');

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/batch-executions/:id/export
 * Export batch execution results
 */
batchExecutionsRouter.post('/:id/export', async (req: AuthRequest, res, next) => {
  try {
    const data = exportBatchSchema.parse(req.body);

    const batch = await prisma.batchExecution.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Batch execution not found');
    }

    if (batch.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to export this batch execution'
      );
    }

    // Queue export job
    const jobId = await addDataExportJob({
      batchExecutionId: batch.id,
      studyId: batch.studyId,
      format: data.format,
      includeEvents: data.includeEvents,
      includeSurveyResponses: data.includeSurveyResponses,
      includeStoryData: data.includeStoryData,
      participantIds: data.participantIds,
      eventTypes: data.eventTypes,
    });

    res.status(HTTP_STATUS.ACCEPTED).json({
      success: true,
      data: {
        message: 'Export job queued',
        jobId,
        batchExecutionId: batch.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/batch-executions/:id
 * Delete a batch execution (only if not running)
 */
batchExecutionsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const batch = await prisma.batchExecution.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Batch execution not found');
    }

    if (batch.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to delete this batch execution'
      );
    }

    if (batch.status === 'RUNNING') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete a running batch execution. Pause it first.'
      );
    }

    // Check for active participants that may have jobs in progress
    const activeParticipants = await prisma.participant.count({
      where: {
        batchId: batch.id,
        state: 'ACTIVE',
      },
    });

    if (activeParticipants > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Cannot delete batch with ${activeParticipants} active participant(s). Wait for jobs to complete or pause the batch first.`
      );
    }

    // Mark as deleting in Redis so any in-flight workers know to stop
    // Non-critical: proceed with delete even if Redis cache update fails
    try {
      await setBatchStatusCache(batch.id, 'DELETING');
    } catch (e) {
      console.error('Failed to set DELETING status in Redis cache, proceeding with delete:', e);
    }

    // Delete participants and batch (cascade should handle events, etc.)
    await prisma.$transaction([
      prisma.participant.deleteMany({
        where: { batchId: batch.id },
      }),
      prisma.batchExecution.delete({
        where: { id: batch.id },
      }),
    ]);

    // Clean up Redis cache
    await deleteBatchStatusCache(batch.id);

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

export default batchExecutionsRouter;
