/**
 * Participants routes - Full CRUD implementation
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createParticipantSchema, updateParticipantSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { generateParticipantId } from '@ariadne/shared';
// TODO: Use these when implementing advanced participant features
// import {
//   participantIdSchema,
//   validateParams,
//   validateQuery,
//   paginationSchema
// } from '../services/validation/sanitizers';
// import { updateParticipantWithEvent } from '../services/database/transactions';
// import { searchParticipants, getParticipantWithActivity } from '../services/database/queries';

export const participantsRouter = Router();

participantsRouter.use(authenticateResearcher);

/**
 * GET /api/v1/participants
 * List participants with filters
 */
participantsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { studyId, state, conditionId, actorType, page = 1, pageSize = 20 } = req.query;

    const where: Record<string, unknown> = {};

    // Filter by study (and verify ownership)
    if (studyId) {
      const study = await prisma.study.findUnique({
        where: { id: studyId as string },
        include: {
          project: {
            select: { researcherId: true }
          }
        }
      });

      if (!study) {
        throw new AppError(
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Study not found'
        );
      }

      if (study.project.researcherId !== req.researcher!.id) {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.UNAUTHORIZED,
          'Access denied'
        );
      }

      where.studyId = studyId;
    } else {
      // Show only participants from researcher's studies
      const studies = await prisma.study.findMany({
        where: {
          project: {
            researcherId: req.researcher!.id
          }
        },
        select: { id: true }
      });
      where.studyId = { in: studies.map(s => s.id) };
    }

    // Filter by state
    if (state) {
      where.state = state;
    }

    // Filter by condition
    if (conditionId) {
      where.conditionId = conditionId;
    }

    // Filter by actor type (HUMAN or SYNTHETIC)
    if (actorType) {
      where.actorType = actorType;
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        include: {
          study: {
            select: {
              id: true,
              name: true
            }
          },
          condition: {
            select: {
              id: true,
              name: true
            }
          },
          partner: {
            select: {
              id: true,
              uniqueId: true
            }
          },
          batch: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true
            }
          },
          agentDefinition: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.participant.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        participants,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
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
 * POST /api/v1/participants
 * Create a participant
 */
participantsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createParticipantSchema.parse(req.body);

    // Verify study ownership
    const study = await prisma.study.findUnique({
      where: { id: data.studyId },
      include: {
        project: {
          select: { researcherId: true }
        }
      }
    });

    if (!study) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    // Generate unique participant ID
    const uniqueId = generateParticipantId();

    const participant = await prisma.participant.create({
      data: {
        studyId: data.studyId,
        uniqueId,
        conditionId: data.conditionId,
        email: data.email,
        prolificId: data.prolificId,
        metadata: JSON.stringify(data.metadata || {}),
        state: 'ENROLLED',
        // Participant type (new field - supports hybrid studies)
        type: data.type,
        // Synthetic actor fields (if provided)
        actorType: data.actorType || 'HUMAN',
        role: data.role,
        llmConfig: data.llmConfig ? JSON.stringify(data.llmConfig) : null,
        batchId: data.batchId,
        agentDefinitionId: data.agentDefinitionId,
        // Human participant session fields
        currentStage: data.currentStage,
        application: data.application as object | undefined,
      },
      include: {
        study: {
          select: {
            id: true,
            name: true
          }
        },
        condition: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: participant
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/participants/:id
 * Get participant details
 */
participantsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true }
            }
          }
        },
        condition: true,
        partner: {
          select: {
            id: true,
            uniqueId: true,
            state: true
          }
        },
        sessions: {
          include: {
            session: true
          }
        },
        surveyResponses: {
          include: {
            survey: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    if (participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    res.json({
      success: true,
      data: participant
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/participants/:id
 * Update participant
 */
participantsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateParticipantSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.participant.findUnique({
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
        'Participant not found'
      );
    }

    if (existing.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    const participant = await prisma.participant.update({
      where: { id: req.params.id },
      data: {
        state: data.state,
        conditionId: data.conditionId,
        partnerId: data.partnerId,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        // Participant type (can be updated for hybrid studies)
        type: data.type,
        // Session progression fields
        currentStage: data.currentStage,
        sessionStart: data.sessionStart ? new Date(data.sessionStart) : undefined,
        checkedIn: data.checkedIn ? new Date(data.checkedIn) : undefined,
        application: data.application as object | undefined
      }
    });

    res.json({
      success: true,
      data: participant
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/participants/:id
 * Delete participant
 */
participantsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const participant = await prisma.participant.findUnique({
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

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    if (participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    await prisma.participant.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/participants/:id/partner
 * Assign partner to participant
 */
participantsRouter.post('/:id/partner', async (req: AuthRequest, res, next) => {
  try {
    const { partnerId } = req.body;

    if (!partnerId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'partnerId is required'
      );
    }

    // Get both participants
    const [participant, partner] = await Promise.all([
      prisma.participant.findUnique({
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
      }),
      prisma.participant.findUnique({
        where: { id: partnerId },
        include: {
          study: {
            include: {
              project: {
                select: { researcherId: true }
              }
            }
          }
        }
      })
    ]);

    if (!participant || !partner) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    // Verify ownership of both
    if (
      participant.study.project.researcherId !== req.researcher!.id ||
      partner.study.project.researcherId !== req.researcher!.id
    ) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    // Verify they're in the same study
    if (participant.studyId !== partner.studyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participants must be in the same study'
      );
    }

    // Assign partners (bidirectional)
    await Promise.all([
      prisma.participant.update({
        where: { id: req.params.id },
        data: { partnerId }
      }),
      prisma.participant.update({
        where: { id: partnerId },
        data: { partnerId: req.params.id }
      })
    ]);

    res.json({
      success: true,
      message: 'Partner assigned successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/participants/:id/events
 * Get events for a participant
 */
participantsRouter.get('/:id/events', async (req: AuthRequest, res, next) => {
  try {
    const { page = 1, pageSize = 100 } = req.query;

    // Verify ownership
    const participant = await prisma.participant.findUnique({
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

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    if (participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'Access denied'
      );
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: { participantId: req.params.id },
        skip,
        take,
        orderBy: { timestamp: 'desc' }
      }),
      prisma.event.count({
        where: { participantId: req.params.id }
      })
    ]);

    res.json({
      success: true,
      data: {
        events,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          hasNext: skip + take < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
