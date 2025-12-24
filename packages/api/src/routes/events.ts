/**
 * Events routes - Full CRUD implementation
 * Events track participant actions and behaviors during studies
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logEventSchema, batchLogEventsSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { Prisma } from '@prisma/client';
import { verifyStudyOwnership, verifyParticipantOwnership, safeJsonParse } from '../utils/ownership';

/**
 * Validate and parse date string, returns null if invalid
 */
function parseDate(dateStr: string): Date | null {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

export const eventsRouter = Router();

eventsRouter.use(authenticateResearcher);

/**
 * GET /api/v1/events
 * Query events with filters
 */
eventsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { participantId, studyId, type, category, startDate, endDate } = req.query;

    // Parse pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 100), 1000);

    const where: Prisma.EventWhereInput = {};

    // Filter by participant (requires ownership verification)
    if (participantId) {
      await verifyParticipantOwnership(participantId as string, req.researcher!.id);
      where.participantId = participantId as string;
    } else if (studyId) {
      // Filter by study (verify ownership using shared helper)
      await verifyStudyOwnership(studyId as string, req.researcher!.id);
      where.participant = {
        studyId: studyId as string
      };
    } else {
      // Show only events from researcher's studies
      where.participant = {
        study: {
          project: {
            researcherId: req.researcher!.id
          }
        }
      };
    }

    // Filter by type
    if (type) {
      where.type = type as string;
    }

    // Filter by category
    if (category) {
      where.category = category as string;
    }

    // Filter by date range with validation
    if (startDate || endDate) {
      where.timestamp = {};
      let parsedStart: Date | null = null;
      let parsedEnd: Date | null = null;

      if (startDate) {
        parsedStart = parseDate(startDate as string);
        if (!parsedStart) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'Invalid startDate format'
          );
        }
        where.timestamp.gte = parsedStart;
      }
      if (endDate) {
        parsedEnd = parseDate(endDate as string);
        if (!parsedEnd) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'Invalid endDate format'
          );
        }
        where.timestamp.lte = parsedEnd;
      }

      // Validate date range order
      if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'startDate must be before endDate'
        );
      }
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          participant: {
            select: {
              id: true,
              uniqueId: true,
              studyId: true
            }
          }
        },
        skip,
        take,
        orderBy: { timestamp: 'desc' }
      }),
      prisma.event.count({ where })
    ]);

    // Parse data JSON with safe fallback for corrupted data
    const eventsWithParsedData = events.map(event => ({
      ...event,
      data: safeJsonParse(event.data)
    }));

    res.json({
      success: true,
      data: {
        events: eventsWithParsedData,
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
 * POST /api/v1/events
 * Log a single event
 */
eventsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = logEventSchema.parse(req.body);

    // Verify participant ownership
    await verifyParticipantOwnership(data.participantId, req.researcher!.id);

    const event = await prisma.event.create({
      data: {
        participantId: data.participantId,
        type: data.type,
        category: data.category,
        data: JSON.stringify(data.data),
        context: data.context,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        sequenceNum: data.sequenceNum
      },
      include: {
        participant: {
          select: {
            id: true,
            uniqueId: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...event,
        data: safeJsonParse(event.data)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/events/batch
 * Log multiple events (bulk insert)
 * Uses transaction to ensure atomicity of verification + insertion
 */
eventsRouter.post('/batch', async (req: AuthRequest, res, next) => {
  try {
    const { events } = batchLogEventsSchema.parse(req.body);
    const researcherId = req.researcher!.id;

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Verify all participants belong to researcher
      const participantIds = [...new Set(events.map(e => e.participantId))];

      const participants = await tx.participant.findMany({
        where: {
          id: { in: participantIds }
        },
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

      // Check all participants found (use generic message to avoid ID enumeration)
      if (participants.length !== participantIds.length) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          'Invalid participant IDs provided'
        );
      }

      // Verify all belong to researcher
      const unauthorized = participants.filter(
        p => p.study.project.researcherId !== researcherId
      );

      if (unauthorized.length > 0) {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.UNAUTHORIZED,
          'You do not have permission to log events for some participants'
        );
      }

      // Bulk insert events
      const eventData = events.map(e => ({
        participantId: e.participantId,
        type: e.type,
        category: e.category ?? null,
        data: JSON.stringify(e.data),
        context: e.context ?? null,
        timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        sequenceNum: e.sequenceNum ?? null
      }));

      return tx.event.createMany({
        data: eventData
      });
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        count: result.count,
        message: `${result.count} event(s) logged successfully`
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/events/summary/stats
 * Get event summary statistics
 * NOTE: This route must be defined BEFORE /:id to prevent Express from matching "summary" as an ID
 */
eventsRouter.get('/summary/stats', async (req: AuthRequest, res, next) => {
  try {
    const { studyId, participantId } = req.query;

    let whereClause: Prisma.EventWhereInput = {};

    if (participantId) {
      await verifyParticipantOwnership(participantId as string, req.researcher!.id);
      whereClause.participantId = participantId as string;
    } else if (studyId) {
      // Use shared helper for study ownership verification
      await verifyStudyOwnership(studyId as string, req.researcher!.id);
      whereClause.participant = {
        studyId: studyId as string
      };
    } else {
      whereClause.participant = {
        study: {
          project: {
            researcherId: req.researcher!.id
          }
        }
      };
    }

    // Get counts by type
    const eventsByType = await prisma.event.groupBy({
      by: ['type'],
      where: whereClause,
      _count: {
        type: true
      }
    });

    // Get counts by category
    const eventsByCategory = await prisma.event.groupBy({
      by: ['category'],
      where: whereClause,
      _count: {
        category: true
      }
    });

    // Get total count
    const totalCount = await prisma.event.count({ where: whereClause });

    res.json({
      success: true,
      data: {
        total: totalCount,
        byType: eventsByType.map(e => ({
          type: e.type,
          count: e._count.type
        })),
        byCategory: eventsByCategory.map(e => ({
          category: e.category || 'uncategorized',
          count: e._count.category
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/events/:id
 * Get a single event
 */
eventsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        participant: {
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

    if (!event) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Event not found'
      );
    }

    if (event.participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to access this event'
      );
    }

    res.json({
      success: true,
      data: {
        ...event,
        data: safeJsonParse(event.data)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/events/:id
 * Delete a single event
 */
eventsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        participant: {
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

    if (!event) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Event not found'
      );
    }

    if (event.participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to delete this event'
      );
    }

    await prisma.event.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

export default eventsRouter;
