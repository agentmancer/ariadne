/**
 * Trials routes - Parameter sweep experiments
 * RFC-002: Trials Feature
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { verifyStudyAccess } from '../lib/auth-helpers';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';
import { TrialStatus } from '@prisma/client';

export const trialsRouter = Router();

trialsRouter.use(authenticateResearcher);

// ============================================
// VALIDATION SCHEMAS
// ============================================

const idSchema = z.string().min(1).max(50);

const createTrialSchema = z.object({
  conditionId: idSchema.optional(),
  parameters: z.record(z.unknown()).default({}),
  name: z.string().max(255).optional(),
});

const createSweepSchema = z.object({
  conditionId: idSchema.optional(),
  parameterKey: z.string().min(1).max(100),
  values: z.array(z.unknown()).min(1).max(100),
  baseParameters: z.record(z.unknown()).default({}),
});

const updateTrialSchema = z.object({
  name: z.string().max(255).optional(),
  parameters: z.record(z.unknown()).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
});

const runTrialSchema = z.object({
  sessionCount: z.number().int().min(1).max(100),
  agentDefinitionId: idSchema.optional(),
  // Batch execution options (RFC-002 Phase 4)
  autoExecute: z.boolean().default(false),
  llmConfig: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).optional(),
  role: z.enum(['PLAYER', 'STORYTELLER', 'EDITOR', 'CONSISTENCY_MANAGER', 'EVALUATOR', 'PARTNER', 'CUSTOM']).default('PLAYER'),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verify researcher has access to a trial
 */
async function verifyTrialAccess(trialId: string, researcherId: string) {
  const trial = await prisma.trial.findUnique({
    where: { id: trialId },
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

  if (!trial) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Trial not found'
    );
  }

  if (trial.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  return trial;
}

/**
 * Get next sequence number for a trial in a study/condition
 */
async function getNextSequence(studyId: string, conditionId?: string | null): Promise<number> {
  const maxTrial = await prisma.trial.findFirst({
    where: {
      studyId,
      conditionId: conditionId || null,
    },
    orderBy: { sequence: 'desc' },
    select: { sequence: true }
  });

  return (maxTrial?.sequence ?? 0) + 1;
}

// ============================================
// STUDY-SCOPED ENDPOINTS
// ============================================

/**
 * GET /api/v1/studies/:studyId/trials
 * List trials for a study with optional filtering
 */
trialsRouter.get('/studies/:studyId/trials', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyAccess(studyId, req.researcher!.id);

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);
    const { conditionId, status, parameterKey } = req.query;

    const where: Record<string, unknown> = { studyId };

    if (conditionId) {
      where.conditionId = conditionId as string;
    }

    if (status) {
      where.status = status as TrialStatus;
    }

    if (parameterKey) {
      where.parameterKey = parameterKey as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [trials, total] = await Promise.all([
      prisma.trial.findMany({
        where,
        include: {
          condition: {
            select: { id: true, name: true }
          },
          _count: {
            select: { sessions: true }
          }
        },
        skip,
        take,
        orderBy: [{ conditionId: 'asc' }, { sequence: 'asc' }]
      }),
      prisma.trial.count({ where })
    ]);

    // Parse JSON fields
    const data = trials.map(trial => ({
      ...trial,
      parameters: JSON.parse(trial.parameters),
      metrics: trial.metrics ? JSON.parse(trial.metrics) : null,
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
 * POST /api/v1/studies/:studyId/trials
 * Create a single trial
 */
trialsRouter.post('/studies/:studyId/trials', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyAccess(studyId, req.researcher!.id);

    const data = createTrialSchema.parse(req.body);

    // Validate condition if provided
    if (data.conditionId) {
      const condition = await prisma.condition.findUnique({
        where: { id: data.conditionId }
      });
      if (!condition || condition.studyId !== studyId) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Condition not found or does not belong to this study'
        );
      }
    }

    const sequence = await getNextSequence(studyId, data.conditionId);

    const trial = await prisma.trial.create({
      data: {
        studyId,
        conditionId: data.conditionId,
        sequence,
        name: data.name,
        parameters: JSON.stringify(data.parameters),
      },
      include: {
        condition: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...trial,
        parameters: data.parameters,
        metrics: null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/studies/:studyId/trials/sweep
 * Create multiple trials for a parameter sweep
 */
trialsRouter.post('/studies/:studyId/trials/sweep', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyAccess(studyId, req.researcher!.id);

    const data = createSweepSchema.parse(req.body);

    // Validate condition if provided
    if (data.conditionId) {
      const condition = await prisma.condition.findUnique({
        where: { id: data.conditionId }
      });
      if (!condition || condition.studyId !== studyId) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Condition not found or does not belong to this study'
        );
      }
    }

    // Create trials for each value in the sweep
    const startSequence = await getNextSequence(studyId, data.conditionId);

    const trials = await prisma.$transaction(
      data.values.map((value, index) => {
        const parameters = {
          ...data.baseParameters,
          [data.parameterKey]: value,
        };

        return prisma.trial.create({
          data: {
            studyId,
            conditionId: data.conditionId,
            sequence: startSequence + index,
            name: `${data.parameterKey}=${String(value)}`,
            parameters: JSON.stringify(parameters),
            parameterKey: data.parameterKey,
            parameterValue: String(value),
          },
          include: {
            condition: {
              select: { id: true, name: true }
            }
          }
        });
      })
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        count: trials.length,
        parameterKey: data.parameterKey,
        values: data.values,
        trials: trials.map(trial => ({
          ...trial,
          parameters: JSON.parse(trial.parameters),
          metrics: null,
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TRIAL-SCOPED ENDPOINTS
// ============================================

/**
 * GET /api/v1/trials/:id
 * Get a specific trial with details
 */
trialsRouter.get('/trials/:id', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    // Get full trial with relations
    const fullTrial = await prisma.trial.findUnique({
      where: { id: trialId },
      include: {
        condition: {
          select: { id: true, name: true }
        },
        sessions: {
          select: {
            id: true,
            name: true,
            scheduledStart: true,
            actualStart: true,
            actualEnd: true,
          },
          orderBy: { scheduledStart: 'asc' }
        },
        _count: {
          select: { sessions: true }
        }
      }
    });

    res.json({
      success: true,
      data: {
        ...fullTrial,
        parameters: JSON.parse(fullTrial!.parameters),
        metrics: fullTrial!.metrics ? JSON.parse(fullTrial!.metrics) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/trials/:id
 * Update a trial
 */
trialsRouter.patch('/trials/:id', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    const data = updateTrialSchema.parse(req.body);

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.parameters !== undefined) updateData.parameters = JSON.stringify(data.parameters);
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        updateData.completedAt = new Date();
      }
    }

    const trial = await prisma.trial.update({
      where: { id: trialId },
      data: updateData,
      include: {
        condition: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      success: true,
      data: {
        ...trial,
        parameters: JSON.parse(trial.parameters),
        metrics: trial.metrics ? JSON.parse(trial.metrics) : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/trials/:id
 * Delete a trial
 */
trialsRouter.delete('/trials/:id', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    const trial = await verifyTrialAccess(trialId, req.researcher!.id);

    // Check if trial has sessions
    if (trial.sessionCount > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Cannot delete trial with ${trial.sessionCount} session(s). Delete sessions first.`
      );
    }

    await prisma.trial.delete({
      where: { id: trialId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/trials/:id/run
 * Run sessions for a trial
 *
 * If autoExecute is true and llmConfig is provided, creates a batch execution
 * and queues jobs for automatic execution.
 */
trialsRouter.post('/trials/:id/run', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    const trial = await verifyTrialAccess(trialId, req.researcher!.id);

    const data = runTrialSchema.parse(req.body);

    // Update trial status to running
    await prisma.trial.update({
      where: { id: trialId },
      data: { status: 'RUNNING' }
    });

    // Create sessions for the trial
    const sessions = await prisma.$transaction(
      Array.from({ length: data.sessionCount }, (_, i) =>
        prisma.session.create({
          data: {
            studyId: trial.studyId,
            trialId: trial.id,
            name: `${trial.name || `Trial ${trial.sequence}`} - Session ${i + 1}`,
            scheduledStart: new Date(),
          }
        })
      )
    );

    // Update session count
    await prisma.trial.update({
      where: { id: trialId },
      data: {
        sessionCount: {
          increment: data.sessionCount
        }
      }
    });

    // If autoExecute is enabled and llmConfig is provided, create batch and queue jobs
    let batchExecution = null;
    let jobId = null;

    if (data.autoExecute && data.llmConfig) {
      const { addBatchCreationJob } = await import('../services/queue');

      // Create batch execution record
      batchExecution = await prisma.batchExecution.create({
        data: {
          studyId: trial.studyId,
          name: `Trial ${trial.sequence} Execution`,
          description: `Automated execution for trial: ${trial.name || `Trial ${trial.sequence}`}`,
          type: 'SIMULATION',
          status: 'QUEUED',
          config: JSON.stringify({
            trialId: trial.id,
            conditionId: trial.conditionId,
            parameters: JSON.parse(trial.parameters),
            actorCount: data.sessionCount,
            role: data.role,
            llmConfig: data.llmConfig,
            agentDefinitionId: data.agentDefinitionId,
            priority: data.priority,
          }),
        },
      });

      // Link trial to batch execution
      await prisma.trial.update({
        where: { id: trialId },
        data: { batchExecutionId: batchExecution.id }
      });

      // Queue the batch creation job
      jobId = await addBatchCreationJob({
        batchExecutionId: batchExecution.id,
        studyId: trial.studyId,
        conditionId: trial.conditionId || undefined,
        actorCount: data.sessionCount,
        role: data.role,
        llmConfig: data.llmConfig,
        agentDefinitionId: data.agentDefinitionId,
        priority: data.priority,
      });
    }

    res.json({
      success: true,
      data: {
        trialId,
        sessionsCreated: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          scheduledStart: s.scheduledStart,
        })),
        batchExecution: batchExecution ? {
          id: batchExecution.id,
          status: batchExecution.status,
          jobId,
        } : null,
        message: data.autoExecute && data.llmConfig
          ? 'Sessions created and batch execution queued.'
          : 'Sessions created. Use autoExecute with llmConfig to queue batch execution.'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/trials/:id/progress
 * Get trial execution progress (if batch execution is linked)
 */
trialsRouter.get('/trials/:id/progress', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    const trial = await prisma.trial.findUnique({
      where: { id: trialId },
      include: {
        batchExecution: true,
        sessions: {
          select: {
            id: true,
            actualStart: true,
            actualEnd: true,
          }
        }
      }
    });

    if (!trial) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Trial not found'
      );
    }

    const completedSessions = trial.sessions.filter(s => s.actualEnd !== null).length;
    const startedSessions = trial.sessions.filter(s => s.actualStart !== null).length;

    const progress = {
      trialId: trial.id,
      status: trial.status,
      sessionCount: trial.sessionCount,
      completedSessions,
      startedSessions,
      successCount: trial.successCount,
      failureCount: trial.failureCount,
      progressPercent: trial.sessionCount > 0
        ? Math.round((completedSessions / trial.sessionCount) * 100)
        : 0,
      batchExecution: trial.batchExecution ? {
        id: trial.batchExecution.id,
        status: trial.batchExecution.status,
        actorsCreated: trial.batchExecution.actorsCreated,
        actorsCompleted: trial.batchExecution.actorsCompleted,
        startedAt: trial.batchExecution.startedAt,
        completedAt: trial.batchExecution.completedAt,
        error: trial.batchExecution.error,
      } : null,
    };

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/trials/:id/results
 * Get aggregated results and statistics for a trial
 */
trialsRouter.get('/trials/:id/results', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    const trial = await prisma.trial.findUnique({
      where: { id: trialId },
      include: {
        condition: {
          select: { id: true, name: true }
        },
        sessions: {
          select: {
            id: true,
            name: true,
            actualStart: true,
            actualEnd: true,
          }
        }
      }
    });

    if (!trial) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Trial not found'
      );
    }

    // Calculate session statistics
    const completedSessions = trial.sessions.filter(s => s.actualEnd !== null);
    const sessionDurations = completedSessions
      .filter(s => s.actualStart && s.actualEnd)
      .map(s => new Date(s.actualEnd!).getTime() - new Date(s.actualStart!).getTime());

    const avgDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
      : null;

    const results = {
      trialId: trial.id,
      trialName: trial.name,
      conditionId: trial.conditionId,
      conditionName: trial.condition?.name,
      parameters: JSON.parse(trial.parameters),
      parameterKey: trial.parameterKey,
      parameterValue: trial.parameterValue,
      status: trial.status,
      completedAt: trial.completedAt,

      // Session statistics
      sessionStats: {
        total: trial.sessionCount,
        completed: completedSessions.length,
        successCount: trial.successCount,
        failureCount: trial.failureCount,
        successRate: trial.sessionCount > 0
          ? Math.round((trial.successCount / trial.sessionCount) * 100) / 100
          : null,
      },

      // Duration statistics (in milliseconds)
      durationStats: sessionDurations.length > 0 ? {
        mean: Math.round(avgDuration!),
        min: Math.min(...sessionDurations),
        max: Math.max(...sessionDurations),
        count: sessionDurations.length,
      } : null,

      // Custom metrics from trial
      metrics: trial.metrics ? JSON.parse(trial.metrics) : null,
    };

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/trials/:id/aggregate
 * Recompute and update aggregated metrics for a trial
 */
trialsRouter.post('/trials/:id/aggregate', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    // Import the aggregation service
    const { updateTrialMetrics, aggregateTrialResults } = await import('../services/trial-aggregation');

    // Compute and update metrics
    await updateTrialMetrics(trialId);

    // Return the new metrics
    const metrics = await aggregateTrialResults(trialId);

    res.json({
      success: true,
      data: {
        trialId,
        metrics,
        message: 'Trial metrics aggregated successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/trials/:id/export
 * Export trial results as structured data for analysis
 */
trialsRouter.get('/trials/:id/export', async (req: AuthRequest, res, next) => {
  try {
    const trialId = idSchema.parse(req.params.id);
    await verifyTrialAccess(trialId, req.researcher!.id);

    const { exportTrialResults } = await import('../services/trial-aggregation');
    const rows = await exportTrialResults(trialId);

    // Check format query param
    const format = req.query.format as string || 'json';

    if (format === 'csv') {
      // Convert to CSV
      if (rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="trial-${trialId}-export.csv"`);
        return res.send('');
      }

      const headers = Object.keys(rows[0]);
      const csvRows = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          }).join(',')
        )
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="trial-${trialId}-export.csv"`);
      return res.send(csvRows.join('\n'));
    }

    res.json({
      success: true,
      data: {
        trialId,
        rowCount: rows.length,
        rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:studyId/trials/compare
 * Compare all trials within a study
 */
trialsRouter.get('/studies/:studyId/trials/compare', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyAccess(studyId, req.researcher!.id);

    const { compareTrials } = await import('../services/trial-aggregation');
    const comparisons = await compareTrials(studyId);

    res.json({
      success: true,
      data: {
        studyId,
        trialCount: comparisons.length,
        comparisons
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:studyId/trials/export
 * Export comparison data for all trials in a study
 */
trialsRouter.get('/studies/:studyId/trials/export', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyAccess(studyId, req.researcher!.id);

    const { exportStudyTrialComparison } = await import('../services/trial-aggregation');
    const rows = await exportStudyTrialComparison(studyId);

    const format = req.query.format as string || 'json';

    if (format === 'csv') {
      if (rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="study-${studyId}-trials-export.csv"`);
        return res.send('');
      }

      const headers = Object.keys(rows[0]);
      const csvRows = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          }).join(',')
        )
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="study-${studyId}-trials-export.csv"`);
      return res.send(csvRows.join('\n'));
    }

    res.json({
      success: true,
      data: {
        studyId,
        rowCount: rows.length,
        rows
      }
    });
  } catch (error) {
    next(error);
  }
});
