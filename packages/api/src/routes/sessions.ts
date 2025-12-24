/**
 * Sessions routes - Full CRUD implementation
 * Sessions are scheduled time slots for study participation
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createSessionSchema, updateSessionSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyStudyOwnership } from '../utils/ownership';

export const sessionsRouter = Router();

sessionsRouter.use(authenticateResearcher);

/**
 * GET /api/v1/sessions
 * List sessions with filters
 */
sessionsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { studyId, upcoming } = req.query;

    // Parse pagination parameters (using parseInt with radix for clarity)
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string, 10) || 20), 100);

    const where: Prisma.SessionWhereInput = {};

    if (studyId) {
      // Verify study ownership
      await verifyStudyOwnership(studyId as string, req.researcher!.id);
      where.studyId = studyId as string;
    } else {
      // Show only sessions from researcher's studies
      where.study = {
        project: {
          researcherId: req.researcher!.id
        }
      };
    }

    // Filter for upcoming sessions only
    if (upcoming === 'true') {
      where.scheduledStart = {
        gte: new Date()
      };
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          study: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              participants: true
            }
          }
        },
        skip,
        take,
        orderBy: { scheduledStart: 'asc' }
      }),
      prisma.session.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        sessions,
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
 * POST /api/v1/sessions
 * Create a new session
 */
sessionsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createSessionSchema.parse(req.body);

    // Verify study ownership
    await verifyStudyOwnership(data.studyId, req.researcher!.id);

    const session = await prisma.session.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        scheduledStart: new Date(data.scheduledStart),
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null,
        maxParticipants: data.maxParticipants || 1
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
      data: session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sessions/:id
 * Get session details
 */
sessionsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        study: {
          include: {
            project: {
              select: { researcherId: true }
            }
          }
        },
        participants: {
          include: {
            participant: {
              select: {
                id: true,
                uniqueId: true,
                state: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!session) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Session not found'
      );
    }

    if (session.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to access this session'
      );
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/sessions/:id
 * Update session
 */
sessionsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateSessionSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.session.findUnique({
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
        'Session not found'
      );
    }

    if (existing.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to update this session'
      );
    }

    // Build update data
    const updateData: Prisma.SessionUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.scheduledStart !== undefined) updateData.scheduledStart = new Date(data.scheduledStart);
    if (data.scheduledEnd !== undefined) updateData.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    if (data.maxParticipants !== undefined) updateData.maxParticipants = data.maxParticipants;

    const session = await prisma.session.update({
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
      data: session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/sessions/:id
 * Delete session
 */
sessionsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const session = await prisma.session.findUnique({
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

    if (!session) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Session not found'
      );
    }

    if (session.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to delete this session'
      );
    }

    // Prevent deletion if session has checked-in participants
    if (session._count.participants > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete session with registered participants'
      );
    }

    await prisma.session.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/sessions/:id/checkin
 * Check in a participant to a session
 * Uses a transaction to prevent race conditions on capacity checks
 */
sessionsRouter.post('/:id/checkin', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().uuid('Invalid participant ID format')
    }).parse(req.body);

    const sessionId = req.params.id;
    const researcherId = req.researcher!.id;

    // Use transaction with serializable isolation to prevent race conditions
    const checkin = await prisma.$transaction(async (tx) => {
      // Verify session ownership and get current state
      const session = await tx.session.findUnique({
        where: { id: sessionId },
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

      if (!session) {
        throw new AppError(
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Session not found'
        );
      }

      if (session.study.project.researcherId !== researcherId) {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.UNAUTHORIZED,
          'You do not have permission to modify this session'
        );
      }

      // Check session capacity within transaction
      if (session._count.participants >= session.maxParticipants) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Session is at capacity'
        );
      }

      // Verify participant belongs to the same study
      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        select: { studyId: true }
      });

      if (!participant) {
        throw new AppError(
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Participant not found'
        );
      }

      if (participant.studyId !== session.studyId) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Participant does not belong to this study'
        );
      }

      // Check if already checked in (composite unique constraint prevents duplicates at DB level)
      const existingCheckin = await tx.sessionParticipant.findUnique({
        where: {
          sessionId_participantId: {
            sessionId,
            participantId
          }
        }
      });

      if (existingCheckin) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Participant is already checked in to this session'
        );
      }

      // Create check-in record
      const newCheckin = await tx.sessionParticipant.create({
        data: {
          sessionId,
          participantId,
          checkedInAt: new Date()
        },
        include: {
          participant: {
            select: {
              id: true,
              uniqueId: true
            }
          },
          session: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // Start session if this is the first check-in
      if (!session.actualStart) {
        await tx.session.update({
          where: { id: sessionId },
          data: { actualStart: new Date() }
        });
      }

      return newCheckin;
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: checkin
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/sessions/:id/complete
 * Mark session as completed
 */
sessionsRouter.put('/:id/complete', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const existing = await prisma.session.findUnique({
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
        'Session not found'
      );
    }

    if (existing.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to modify this session'
      );
    }

    if (existing.actualEnd) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Session is already completed'
      );
    }

    const session = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        actualEnd: new Date(),
        // If session was never started, set start time to now
        actualStart: existing.actualStart || new Date()
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

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    next(error);
  }
});

export default sessionsRouter;
