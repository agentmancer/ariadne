/**
 * Conditions routes - Full CRUD implementation
 * Conditions are experimental groups within a study
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createConditionSchema, updateConditionSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyStudyOwnership } from '../utils/ownership';
import { getPredefinedConfig, StoryArchitectureConfigFactory } from '../services/architecture';

// Schema for bulk participant assignment with UUID validation
const assignParticipantsSchema = z.object({
  participantIds: z.array(z.string().uuid('Invalid participant ID format')).min(1, 'At least one participant ID is required')
});

export const conditionsRouter = Router();

conditionsRouter.use(authenticateResearcher);

/**
 * GET /api/v1/conditions
 * List conditions with filters and pagination
 */
conditionsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { studyId } = req.query;

    if (!studyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'studyId query parameter is required'
      );
    }

    // Parse pagination parameters (using parseInt with radix for clarity)
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string, 10) || 20), 100);

    // Verify study ownership
    await verifyStudyOwnership(studyId as string, req.researcher!.id);

    const where: Prisma.ConditionWhereInput = { studyId: studyId as string };
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [conditions, total] = await Promise.all([
      prisma.condition.findMany({
        where,
        include: {
          _count: {
            select: {
              participants: true
            }
          }
        },
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      prisma.condition.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        conditions,
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
 * POST /api/v1/conditions
 * Create a new condition
 */
conditionsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createConditionSchema.parse(req.body);

    // Verify study ownership
    await verifyStudyOwnership(data.studyId, req.researcher!.id);

    // Resolve architecture config: either from direct config or predefined key
    let resolvedArchConfig: string | undefined;
    if (data.architectureConfig) {
      // Validate the architecture config
      const validation = StoryArchitectureConfigFactory.validate(data.architectureConfig);
      if (!validation.valid) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Invalid architecture config: ${validation.errors.join(', ')}`
        );
      }
      resolvedArchConfig = JSON.stringify(data.architectureConfig);
    } else if (data.architectureConfigKey) {
      // Look up predefined config
      const predefined = getPredefinedConfig(data.architectureConfigKey);
      if (!predefined) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Predefined architecture config '${data.architectureConfigKey}' not found`
        );
      }
      resolvedArchConfig = JSON.stringify(predefined);
    }

    // Note: config is stored as JSON string; clients must JSON.parse() when reading
    const condition = await prisma.condition.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        description: data.description,
        config: JSON.stringify(data.config || {}),
        architectureConfig: resolvedArchConfig
      },
      include: {
        study: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: condition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/conditions/:id
 * Get condition details
 */
conditionsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const condition = await prisma.condition.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true }
            }
          }
        },
        _count: {
          select: {
            participants: true
          }
        }
      }
    });

    if (!condition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Condition not found'
      );
    }

    if (condition.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to access this condition'
      );
    }

    res.json({
      success: true,
      data: condition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/conditions/:id
 * Update condition
 */
conditionsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateConditionSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.condition.findUnique({
      where: { id: req.params.id },
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

    if (!existing) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Condition not found'
      );
    }

    if (existing.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to update this condition'
      );
    }

    // Build update data
    const updateData: Prisma.ConditionUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config);

    // Handle architecture config updates
    if (data.architectureConfig) {
      const validation = StoryArchitectureConfigFactory.validate(data.architectureConfig);
      if (!validation.valid) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Invalid architecture config: ${validation.errors.join(', ')}`
        );
      }
      updateData.architectureConfig = JSON.stringify(data.architectureConfig);
    } else if (data.architectureConfigKey) {
      const predefined = getPredefinedConfig(data.architectureConfigKey);
      if (!predefined) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Predefined architecture config '${data.architectureConfigKey}' not found`
        );
      }
      updateData.architectureConfig = JSON.stringify(predefined);
    }

    const condition = await prisma.condition.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        study: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: condition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/conditions/:id
 * Delete condition
 */
conditionsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const condition = await prisma.condition.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true }
            }
          }
        },
        _count: {
          select: {
            participants: true
          }
        }
      }
    });

    if (!condition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Condition not found'
      );
    }

    if (condition.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to delete this condition'
      );
    }

    // Prevent deletion if condition has participants assigned
    if (condition._count.participants > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete condition with assigned participants'
      );
    }

    await prisma.condition.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/conditions/:id/assign
 * Assign participants to a condition
 */
conditionsRouter.post('/:id/assign', async (req: AuthRequest, res, next) => {
  try {
    // Validate input with Zod schema
    const { participantIds } = assignParticipantsSchema.parse(req.body);

    // Verify condition ownership
    const condition = await prisma.condition.findUnique({
      where: { id: req.params.id },
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

    if (!condition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Condition not found'
      );
    }

    if (condition.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to modify this condition'
      );
    }

    // Verify all participants exist and belong to the same study
    const participants = await prisma.participant.findMany({
      where: {
        id: { in: participantIds },
        studyId: condition.studyId
      },
      select: { id: true }
    });

    if (participants.length !== participantIds.length) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Some participants were not found or do not belong to this study'
      );
    }

    // Assign participants to condition
    await prisma.participant.updateMany({
      where: {
        id: { in: participantIds }
      },
      data: {
        conditionId: req.params.id
      }
    });

    res.json({
      success: true,
      message: `${participantIds.length} participant(s) assigned to condition`
    });
  } catch (error) {
    next(error);
  }
});

export default conditionsRouter;
