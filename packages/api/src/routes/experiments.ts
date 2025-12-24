/**
 * Experiments routes - Experiment execution management
 * RFC 003: Ariadne Evaluation Framework
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';

export const experimentsRouter = Router();

experimentsRouter.use(authenticateResearcher);

// ============================================
// VALIDATION SCHEMAS
// ============================================

// ID validation - Prisma uses CUIDs, not UUIDs
const idSchema = z.string().min(1).max(50);

const createExperimentSchema = z.object({
  designId: idSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  hypothesis: z.string().optional(),
  runsPerCondition: z.number().int().min(1).max(1000).default(1),
});

const updateExperimentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  hypothesis: z.string().optional(),
  runsPerCondition: z.number().int().min(1).max(1000).optional(),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function verifyExperimentAccess(experimentId: string, researcherId: string) {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: {
      design: {
        include: {
          study: {
            include: {
              project: {
                select: { researcherId: true }
              }
            }
          }
        }
      }
    }
  });

  if (!experiment) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Experiment not found'
    );
  }

  if (experiment.design.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  return experiment;
}

// ============================================
// CRUD ENDPOINTS
// ============================================

/**
 * GET /api/v1/experiments
 * List experiments with filters
 */
experimentsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    // Parse and validate pagination parameters
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);
    const { designId, studyId, status } = req.query;

    // Build where clause
    const where: Record<string, unknown> = {
      design: {
        study: {
          project: {
            researcherId: req.researcher!.id
          }
        }
      }
    };

    if (designId) {
      where.designId = designId as string;
    }

    if (studyId) {
      where.design = {
        ...where.design as object,
        studyId: studyId as string
      };
    }

    if (status) {
      where.status = status as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [experiments, total] = await Promise.all([
      prisma.experiment.findMany({
        where,
        include: {
          design: {
            select: {
              id: true,
              name: true,
              studyId: true,
              study: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          _count: {
            select: { runs: true }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.experiment.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        experiments,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: skip + take < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/experiments
 * Create a new experiment
 */
experimentsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createExperimentSchema.parse(req.body);

    // Verify design access
    const design = await prisma.experimentDesign.findUnique({
      where: { id: data.designId },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true }
            }
          }
        },
        conditions: true
      }
    });

    if (!design) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Experiment design not found'
      );
    }

    if (design.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    // Create experiment
    const experiment = await prisma.experiment.create({
      data: {
        designId: data.designId,
        name: data.name,
        description: data.description,
        hypothesis: data.hypothesis,
        runsPerCondition: data.runsPerCondition,
        status: 'DRAFT',
        progress: JSON.stringify({}),
      },
      include: {
        design: {
          select: {
            id: true,
            name: true,
            conditions: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: experiment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/experiments/:id
 * Get experiment details
 */
experimentsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    await verifyExperimentAccess(experimentId, req.researcher!.id);

    // Get full experiment with runs summary
    const fullExperiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        design: {
          include: {
            conditions: true,
            study: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        runs: {
          select: {
            id: true,
            conditionId: true,
            status: true,
            metrics: true,
            createdAt: true,
            completedAt: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: fullExperiment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/experiments/:id
 * Update experiment (only if not running)
 */
experimentsRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const data = updateExperimentSchema.parse(req.body);

    const existingExperiment = await verifyExperimentAccess(experimentId, req.researcher!.id);

    if (existingExperiment.status === 'RUNNING') {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'Cannot update a running experiment'
      );
    }

    const updated = await prisma.experiment.update({
      where: { id: experimentId },
      data: {
        name: data.name,
        description: data.description,
        hypothesis: data.hypothesis,
        runsPerCondition: data.runsPerCondition,
      }
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/experiments/:id
 * Delete experiment
 */
experimentsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const experiment = await verifyExperimentAccess(experimentId, req.researcher!.id);

    if (experiment.status === 'RUNNING') {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'Cannot delete a running experiment. Cancel it first.'
      );
    }

    await prisma.experiment.delete({
      where: { id: experimentId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

// ============================================
// EXECUTION ENDPOINTS
// ============================================

/**
 * POST /api/v1/experiments/:id/start
 * Queue experiment for execution
 */
experimentsRouter.post('/:id/start', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const experiment = await verifyExperimentAccess(experimentId, req.researcher!.id);

    if (experiment.status !== 'DRAFT' && experiment.status !== 'FAILED') {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        `Cannot start experiment in ${experiment.status} status`
      );
    }

    // Get conditions from the design
    const design = await prisma.experimentDesign.findUnique({
      where: { id: experiment.designId },
      include: { conditions: true }
    });

    if (!design || design.conditions.length === 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Experiment design has no conditions'
      );
    }

    // Create runs for each condition
    const runs = [];
    for (const condition of design.conditions) {
      for (let i = 0; i < experiment.runsPerCondition; i++) {
        runs.push({
          experimentId,
          conditionId: condition.id,
          status: 'PENDING',
          outputs: '{}',
          metrics: '{}',
        });
      }
    }

    // Create runs and update experiment status in a transaction
    await prisma.$transaction([
      prisma.experimentRun.createMany({ data: runs }),
      prisma.experiment.update({
        where: { id: experimentId },
        data: {
          status: 'QUEUED',
          queuedAt: new Date(),
          progress: JSON.stringify(
            Object.fromEntries(design.conditions.map(c => [c.id, 0]))
          )
        }
      })
    ]);

    // TODO: Add to BullMQ queue for execution
    // await experimentQueue.add('execute-experiment', { experimentId });

    const updated = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        _count: { select: { runs: true } }
      }
    });

    res.json({
      success: true,
      data: updated,
      message: `Experiment queued with ${runs.length} runs`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/experiments/:id/cancel
 * Cancel a running or queued experiment
 */
experimentsRouter.post('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const experiment = await verifyExperimentAccess(experimentId, req.researcher!.id);

    if (experiment.status !== 'QUEUED' && experiment.status !== 'RUNNING') {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        `Cannot cancel experiment in ${experiment.status} status`
      );
    }

    // Cancel pending runs and update experiment status
    await prisma.$transaction([
      prisma.experimentRun.updateMany({
        where: {
          experimentId,
          status: 'PENDING'
        },
        data: {
          status: 'FAILED',
          error: 'Experiment cancelled'
        }
      }),
      prisma.experiment.update({
        where: { id: experimentId },
        data: {
          status: 'CANCELLED',
          error: 'Cancelled by user'
        }
      })
    ]);

    const updated = await prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// RUNS & RESULTS ENDPOINTS
// ============================================

/**
 * GET /api/v1/experiments/:id/runs
 * Get all runs for an experiment
 */
experimentsRouter.get('/:id/runs', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    await verifyExperimentAccess(experimentId, req.researcher!.id);

    // Parse and validate pagination parameters
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 50), 100);
    const { status, conditionId } = req.query;

    const where: Record<string, unknown> = { experimentId };

    if (status) {
      where.status = status as string;
    }

    if (conditionId) {
      where.conditionId = conditionId as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [runs, total] = await Promise.all([
      prisma.experimentRun.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.experimentRun.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        runs,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: skip + take < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/experiments/:id/results
 * Get aggregated results with statistics
 */
experimentsRouter.get('/:id/results', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);

    // Verify access and get experiment with conditions and completed runs
    // Single query with ownership verification built-in
    const experiment = await prisma.experiment.findFirst({
      where: {
        id: experimentId,
        design: {
          study: {
            project: {
              researcherId: req.researcher!.id
            }
          }
        }
      },
      include: {
        design: {
          include: { conditions: true }
        },
        runs: {
          where: { status: 'COMPLETED' }
        }
      }
    });

    if (!experiment) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Experiment not found or access denied'
      );
    }

    // Group runs by condition and compute statistics
    const resultsByCondition: Record<string, {
      condition: { id: string; name: string };
      runCount: number;
      metrics: Record<string, { mean: number; std: number; values: number[] }>;
    }> = {};

    for (const condition of experiment.design.conditions) {
      const conditionRuns = experiment.runs.filter(r => r.conditionId === condition.id);

      // Parse metrics from each run
      const allMetrics: Record<string, number[]> = {};

      for (const run of conditionRuns) {
        const metrics = JSON.parse(run.metrics || '{}');
        for (const [key, value] of Object.entries(metrics)) {
          if (typeof value === 'number') {
            if (!allMetrics[key]) {
              allMetrics[key] = [];
            }
            allMetrics[key].push(value);
          }
        }
      }

      // Compute mean and standard deviation for each metric
      const metricStats: Record<string, { mean: number; std: number; values: number[] }> = {};

      for (const [key, values] of Object.entries(allMetrics)) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const std = Math.sqrt(variance);

        metricStats[key] = { mean, std, values };
      }

      resultsByCondition[condition.id] = {
        condition: { id: condition.id, name: condition.name },
        runCount: conditionRuns.length,
        metrics: metricStats
      };
    }

    res.json({
      success: true,
      data: {
        experimentId: experiment.id,
        experimentName: experiment.name,
        status: experiment.status,
        totalRuns: experiment.runs.length,
        completedRuns: experiment.runs.filter(r => r.status === 'COMPLETED').length,
        resultsByCondition
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/runs/:id
 * Get single run details
 */
experimentsRouter.get('/runs/:id', async (req: AuthRequest, res, next) => {
  try {
    const runId = idSchema.parse(req.params.id);

    const run = await prisma.experimentRun.findUnique({
      where: { id: runId },
      include: {
        experiment: {
          include: {
            design: {
              include: {
                study: {
                  include: {
                    project: {
                      select: { researcherId: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!run) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Run not found'
      );
    }

    if (run.experiment.design.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    res.json({
      success: true,
      data: run
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PHASE 2c: PROMPT INTEGRATION
// ============================================

// Validation schema for setting prompt references on a condition
const setConditionPromptSchema = z.object({
  promptVersionId: idSchema.optional().nullable(),
  modelConfigId: idSchema.optional().nullable(),
  promptVariantId: idSchema.optional().nullable(),
});

/**
 * Helper to verify condition belongs to experiment and researcher has access
 * Note: ExperimentalCondition.experimentId references ExperimentDesign, not Experiment.
 * So we verify via the experiment's design.
 */
async function verifyConditionAccess(experimentId: string, conditionId: string, researcherId: string) {
  // First get the experiment to find its designId
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: {
      design: {
        include: {
          study: {
            include: {
              project: {
                select: { researcherId: true }
              }
            }
          }
        }
      }
    }
  });

  if (!experiment) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Experiment not found'
    );
  }

  if (experiment.design.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  // Now get the condition and verify it belongs to this experiment's design
  const condition = await prisma.experimentalCondition.findUnique({
    where: { id: conditionId },
  });

  if (!condition) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Condition not found'
    );
  }

  // ExperimentalCondition.experimentId references ExperimentDesign.id
  if (condition.experimentId !== experiment.designId) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      'Condition does not belong to this experiment'
    );
  }

  return condition;
}

/**
 * PATCH /api/v1/experiments/:id/conditions/:conditionId/prompt
 * Set prompt references for an experimental condition
 */
experimentsRouter.patch('/:id/conditions/:conditionId/prompt', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const conditionId = idSchema.parse(req.params.conditionId);

    await verifyConditionAccess(experimentId, conditionId, req.researcher!.id);

    const data = setConditionPromptSchema.parse(req.body);

    // Validate that referenced resources exist if provided
    if (data.promptVersionId) {
      const version = await prisma.promptVersion.findUnique({
        where: { id: data.promptVersionId }
      });
      if (!version) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Prompt version not found'
        );
      }
    }

    if (data.modelConfigId) {
      const config = await prisma.modelConfig.findUnique({
        where: { id: data.modelConfigId }
      });
      if (!config) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Model config not found'
        );
      }
    }

    if (data.promptVariantId) {
      const variant = await prisma.promptVariant.findUnique({
        where: { id: data.promptVariantId }
      });
      if (!variant) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Prompt variant not found'
        );
      }
    }

    const updated = await prisma.experimentalCondition.update({
      where: { id: conditionId },
      data: {
        promptVersionId: data.promptVersionId,
        modelConfigId: data.modelConfigId,
        promptVariantId: data.promptVariantId,
      },
      include: {
        promptVersion: {
          select: { id: true, version: true, templateId: true }
        },
        modelConfig: {
          select: { id: true, name: true, provider: true, model: true }
        },
        promptVariant: {
          select: { id: true, notes: true }
        }
      }
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/experiments/:id/conditions/:conditionId/prompt
 * Resolve the effective prompt configuration for a condition
 * Returns the complete prompt with model config, ready for execution
 */
experimentsRouter.get('/:id/conditions/:conditionId/prompt', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);
    const conditionId = idSchema.parse(req.params.conditionId);

    const condition = await verifyConditionAccess(experimentId, conditionId, req.researcher!.id);

    // Check if any prompt configuration is set
    if (!condition.promptVersionId && !condition.promptVariantId) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'No prompt configuration set for this condition'
      );
    }

    // Fetch full prompt configuration
    const fullCondition = await prisma.experimentalCondition.findUnique({
      where: { id: conditionId },
      include: {
        promptVersion: {
          include: {
            template: {
              select: { id: true, name: true }
            }
          }
        },
        modelConfig: true,
        promptVariant: true
      }
    });

    if (!fullCondition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Condition not found'
      );
    }

    // Resolve effective prompt content
    // Priority: variant overrides > version content
    const version = fullCondition.promptVersion;
    const variant = fullCondition.promptVariant;
    const modelConfig = fullCondition.modelConfig || (variant ?
      await prisma.modelConfig.findUnique({ where: { id: variant.modelConfigId } }) : null);

    if (!version && !variant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'No prompt version found'
      );
    }

    // Use variant's version if no direct version set
    const effectiveVersion = version || (variant ?
      await prisma.promptVersion.findUnique({
        where: { id: variant.versionId },
        include: { template: { select: { id: true, name: true } } }
      }) : null);

    if (!effectiveVersion) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Could not resolve prompt version'
      );
    }

    // Build resolved prompt
    const resolvedPrompt = {
      // Source info
      conditionId,
      conditionName: fullCondition.name,
      templateId: effectiveVersion.template?.id || effectiveVersion.templateId,
      templateName: effectiveVersion.template?.name,
      versionId: effectiveVersion.id,
      versionNumber: effectiveVersion.version,
      variantId: variant?.id || null,

      // Effective content (variant overrides version)
      systemPrompt: variant?.systemPromptOverride || effectiveVersion.systemPrompt,
      userPromptTemplate: variant?.userPromptTemplateOverride || effectiveVersion.userPromptTemplate,
      templateVariables: JSON.parse(effectiveVersion.templateVariables),
      fewShotExamples: variant?.fewShotExamplesOverride
        ? JSON.parse(variant.fewShotExamplesOverride)
        : JSON.parse(effectiveVersion.fewShotExamples),
      outputSchema: effectiveVersion.outputSchema
        ? JSON.parse(effectiveVersion.outputSchema)
        : null,
      toolDefinitions: JSON.parse(effectiveVersion.toolDefinitions),

      // Model configuration
      modelConfig: modelConfig ? {
        id: modelConfig.id,
        name: modelConfig.name,
        provider: modelConfig.provider,
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        topP: modelConfig.topP,
        topK: modelConfig.topK,
        presencePenalty: modelConfig.presencePenalty,
        frequencyPenalty: modelConfig.frequencyPenalty,
        stopSequences: JSON.parse(modelConfig.stopSequences),
        seed: modelConfig.seed,
        responseFormat: modelConfig.responseFormat
          ? JSON.parse(modelConfig.responseFormat)
          : null,
        costPerInputToken: modelConfig.costPerInputToken,
        costPerOutputToken: modelConfig.costPerOutputToken,
      } : null,
    };

    res.json({
      success: true,
      data: resolvedPrompt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/experiments/:id/estimate-cost
 * Estimate cost for running the experiment based on model configs
 */
experimentsRouter.post('/:id/estimate-cost', async (req: AuthRequest, res, next) => {
  try {
    const experimentId = idSchema.parse(req.params.id);

    const experiment = await verifyExperimentAccess(experimentId, req.researcher!.id);

    // Get all conditions with their model configs
    // Note: ExperimentalCondition.experimentId references ExperimentDesign.id
    const conditions = await prisma.experimentalCondition.findMany({
      where: { experimentId: experiment.designId },
      include: {
        modelConfig: true,
        promptVariant: {
          include: {
            modelConfig: true
          }
        }
      }
    });

    // Calculate estimated cost per condition
    const costBreakdown = conditions.map(condition => {
      const modelConfig = condition.modelConfig || condition.promptVariant?.modelConfig;

      if (!modelConfig || !modelConfig.costPerInputToken || !modelConfig.costPerOutputToken) {
        return {
          conditionId: condition.id,
          conditionName: condition.name,
          modelConfig: modelConfig ? {
            name: modelConfig.name,
            provider: modelConfig.provider,
            model: modelConfig.model,
          } : null,
          estimatedCost: null,
          reason: modelConfig ? 'Cost rates not configured' : 'No model config set',
        };
      }

      // Estimate tokens per run (configurable via query params)
      const estimatedInputTokens = Number(req.query.inputTokens) || 1000;
      const estimatedOutputTokens = Number(req.query.outputTokens) || 500;
      const runsPerCondition = experiment.runsPerCondition || 1;

      const costPerRun =
        (estimatedInputTokens / 1000) * modelConfig.costPerInputToken +
        (estimatedOutputTokens / 1000) * modelConfig.costPerOutputToken;

      const totalConditionCost = costPerRun * runsPerCondition;

      return {
        conditionId: condition.id,
        conditionName: condition.name,
        modelConfig: {
          name: modelConfig.name,
          provider: modelConfig.provider,
          model: modelConfig.model,
          costPerInputToken: modelConfig.costPerInputToken,
          costPerOutputToken: modelConfig.costPerOutputToken,
        },
        runsPerCondition,
        estimatedInputTokens,
        estimatedOutputTokens,
        costPerRun: Math.round(costPerRun * 10000) / 10000, // Round to 4 decimals
        totalConditionCost: Math.round(totalConditionCost * 10000) / 10000,
      };
    });

    // Calculate total
    const totalEstimatedCost = costBreakdown
      .filter(c => c.totalConditionCost !== null && c.totalConditionCost !== undefined)
      .reduce((sum, c) => sum + (c.totalConditionCost as number), 0);

    const conditionsWithCost = costBreakdown.filter(c => c.totalConditionCost !== null).length;
    const conditionsWithoutCost = costBreakdown.filter(c => c.totalConditionCost === null).length;

    res.json({
      success: true,
      data: {
        experimentId,
        experimentName: experiment.name,
        totalConditions: conditions.length,
        conditionsWithCost,
        conditionsWithoutCost,
        totalEstimatedCost: Math.round(totalEstimatedCost * 10000) / 10000,
        currency: 'USD',
        assumptions: {
          inputTokensPerRun: Number(req.query.inputTokens) || 1000,
          outputTokensPerRun: Number(req.query.outputTokens) || 500,
        },
        breakdown: costBreakdown,
      }
    });
  } catch (error) {
    next(error);
  }
});
