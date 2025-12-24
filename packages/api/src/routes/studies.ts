/**
 * Studies routes - Full CRUD implementation
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  createStudySchema,
  updateStudySchema,
  StudyStatus,
  pairingConfigSchema,
  manualPairingSchema,
  generateParticipantId,
} from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  pairParticipants,
  getPairing,
  unpairParticipant,
  manualPair,
  getStudyPairings,
} from '../services/pairing';

export const studiesRouter = Router();

studiesRouter.use(authenticateResearcher);

// Valid status transitions (state machine)
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: []
};

/**
 * Validates a status transition and throws an error if invalid
 */
function validateStatusTransition(currentStatus: string, newStatus: string): void {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTransitions.includes(newStatus)) {
    const validOptions = allowedTransitions.length > 0
      ? `Valid transitions: ${allowedTransitions.join(', ')}`
      : 'No transitions allowed from this status';
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      `Cannot transition from ${currentStatus} to ${newStatus}. ${validOptions}`
    );
  }
}

/**
 * GET /api/v1/studies
 * List studies with filters
 */
studiesRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { projectId, status, type } = req.query;

    // Parse and validate pagination parameters
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(req.query.pageSize) || 20),
      100 // Maximum page size to prevent abuse
    );

    const where: Prisma.StudyWhereInput = {};

    // Filter by project (and verify ownership)
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId as string },
        select: { researcherId: true }
      });

      if (!project) {
        throw new AppError(
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Project not found'
        );
      }

      if (project.researcherId !== req.researcher!.id) {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.UNAUTHORIZED,
          'You do not have permission to access this project'
        );
      }

      where.projectId = projectId as string;
    } else {
      // Show only studies from researcher's projects (optimized with nested where)
      where.project = {
        researcherId: req.researcher!.id
      };
    }

    // Filter by status
    if (status) {
      where.status = status as string;
    }

    // Filter by type
    if (type) {
      where.type = type as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [studies, total] = await Promise.all([
      prisma.study.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              participants: true,
              conditions: true,
              surveys: true,
              sessions: true
            }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.study.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        studies,
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
 * POST /api/v1/studies
 * Create a new study
 */
studiesRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createStudySchema.parse(req.body);

    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { researcherId: true }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found'
      );
    }

    if (project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to create studies in this project'
      );
    }

    const study = await prisma.study.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        type: data.type,
        // Note: config is stored as a JSON string in the database
        // Clients will need to parse it when receiving study data
        config: JSON.stringify(data.config || {}),
        prolificEnabled: data.prolificEnabled || false,
        prolificStudyId: data.prolificStudyId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: 'DRAFT'
      },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: study
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:id
 * Get study details
 */
studiesRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const study = await prisma.study.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            researcherId: true
          }
        },
        conditions: {
          orderBy: { name: 'asc' }
        },
        surveys: {
          orderBy: { createdAt: 'asc' }
        },
        _count: {
          select: {
            participants: true,
            sessions: true
          }
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
        'You do not have permission to access this study'
      );
    }

    res.json({
      success: true,
      data: study
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/studies/:id
 * Update study
 */
studiesRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateStudySchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.study.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: { researcherId: true }
        }
      }
    });

    if (!existing) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (existing.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to update this study'
      );
    }

    // Build update data - status changes are validated against state machine
    const updateData: Prisma.StudyUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config);
    if (data.prolificEnabled !== undefined) updateData.prolificEnabled = data.prolificEnabled;
    if (data.prolificStudyId !== undefined) updateData.prolificStudyId = data.prolificStudyId;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;

    // Validate status transitions if status is being updated
    if (data.status !== undefined && data.status !== existing.status) {
      validateStatusTransition(existing.status, data.status);
      updateData.status = data.status;
    }

    const study = await prisma.study.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: study
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/studies/:id
 * Delete study
 */
studiesRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const study = await prisma.study.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: { researcherId: true }
        },
        _count: {
          select: {
            participants: true,
            sessions: true
          }
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
        'You do not have permission to delete this study'
      );
    }

    // Prevent deletion if study has participants or sessions
    if (study._count.participants > 0 || study._count.sessions > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete study with existing participants or sessions'
      );
    }

    await prisma.study.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/studies/:id/status
 * Update study status
 */
studiesRouter.put('/:id/status', async (req: AuthRequest, res, next) => {
  try {
    const { status } = z.object({
      status: z.nativeEnum(StudyStatus)
    }).parse(req.body);

    // Verify ownership
    const existing = await prisma.study.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: { researcherId: true }
        }
      }
    });

    if (!existing) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (existing.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to update this study\'s status'
      );
    }

    // Validate status transitions using shared state machine
    validateStatusTransition(existing.status, status);

    const study = await prisma.study.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: study
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PARTNER PAIRING ENDPOINTS
// ============================================

/**
 * Helper to verify study ownership
 */
async function verifyStudyOwnership(studyId: string, researcherId: string): Promise<void> {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
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

  if (study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'You do not have permission to access this study'
    );
  }
}

/**
 * Helper to verify participant belongs to study
 */
async function verifyParticipantInStudy(participantId: string, studyId: string): Promise<void> {
  const participant = await prisma.participant.findUnique({
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

  if (participant.studyId !== studyId) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      'Participant does not belong to this study'
    );
  }
}

/**
 * GET /api/v1/studies/:id/pairings
 * Get all pairings for a study
 */
studiesRouter.get('/:id/pairings', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const pairings = await getStudyPairings(studyId);

    res.json({
      success: true,
      data: pairings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/studies/:id/pairings
 * Run automatic pairing for unpaired participants
 */
studiesRouter.post('/:id/pairings', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const config = pairingConfigSchema.parse({
      ...req.body,
      studyId
    });

    const results = await pairParticipants(config);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        paired: results.length,
        pairings: results
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/studies/:id/pairings/manual
 * Manually pair two participants
 */
studiesRouter.post('/:id/pairings/manual', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const { participantAId, participantBId } = manualPairingSchema.parse(req.body);

    // Service validates participants belong to study and handles pairing
    const result = await manualPair(participantAId, participantBId, req.researcher!.id, studyId);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/studies/:id/pairings/:participantId
 * Unpair a participant
 */
studiesRouter.delete('/:id/pairings/:participantId', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    const participantId = z.string().uuid().parse(req.params.participantId);

    await verifyStudyOwnership(studyId, req.researcher!.id);
    await verifyParticipantInStudy(participantId, studyId);

    await unpairParticipant(participantId);

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:id/pairings/:participantId
 * Get pairing info for a specific participant
 */
studiesRouter.get('/:id/pairings/:participantId', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    const participantId = z.string().uuid().parse(req.params.participantId);

    await verifyStudyOwnership(studyId, req.researcher!.id);
    await verifyParticipantInStudy(participantId, studyId);

    const pairing = await getPairing(participantId);

    res.json({
      success: true,
      data: pairing
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TEST MODE ENDPOINTS
// ============================================

const createTestParticipantSchema = z.object({
  conditionId: z.string().uuid().optional(),
  paired: z.boolean().optional().default(false),
});

/**
 * POST /api/v1/studies/:id/test-participants
 * Create test participant(s) for testing the study flow
 * Returns one or two participants depending on 'paired' flag
 */
studiesRouter.post('/:id/test-participants', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    const { conditionId, paired } = createTestParticipantSchema.parse(req.body);

    // Verify ownership
    await verifyStudyOwnership(studyId, req.researcher!.id);

    // Get a condition if not specified
    let targetConditionId = conditionId;
    if (!targetConditionId) {
      const condition = await prisma.condition.findFirst({
        where: { studyId },
        orderBy: { name: 'asc' }
      });
      targetConditionId = condition?.id;
    }

    // Create test participant(s)
    const createTestParticipant = async () => {
      const uniqueId = generateParticipantId();
      return prisma.participant.create({
        data: {
          studyId,
          uniqueId,
          conditionId: targetConditionId,
          state: 'ENROLLED',
          actorType: 'HUMAN',
          metadata: JSON.stringify({ isTest: true, createdAt: new Date().toISOString() }),
        },
        include: {
          condition: {
            select: { id: true, name: true }
          }
        }
      });
    };

    const participantA = await createTestParticipant();
    let participantB = null;

    if (paired) {
      participantB = await createTestParticipant();

      // Pair them together
      await Promise.all([
        prisma.participant.update({
          where: { id: participantA.id },
          data: { partnerId: participantB.id }
        }),
        prisma.participant.update({
          where: { id: participantB.id },
          data: { partnerId: participantA.id }
        })
      ]);

      // Refetch with partner info
      const [updatedA, updatedB] = await Promise.all([
        prisma.participant.findUnique({
          where: { id: participantA.id },
          include: {
            condition: { select: { id: true, name: true } },
            partner: { select: { id: true, uniqueId: true } }
          }
        }),
        prisma.participant.findUnique({
          where: { id: participantB.id },
          include: {
            condition: { select: { id: true, name: true } },
            partner: { select: { id: true, uniqueId: true } }
          }
        })
      ]);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: {
          participantA: updatedA,
          participantB: updatedB,
          paired: true
        }
      });
    } else {
      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: {
          participantA,
          participantB: null,
          paired: false
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:id/test-participants
 * List test participants for a study
 */
studiesRouter.get('/:id/test-participants', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    // Find participants with isTest in metadata
    const participants = await prisma.participant.findMany({
      where: {
        studyId,
        metadata: {
          contains: '"isTest":true'
        }
      },
      include: {
        condition: { select: { id: true, name: true } },
        partner: { select: { id: true, uniqueId: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: participants
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/studies/:id/test-participants
 * Delete all test participants for a study
 */
studiesRouter.delete('/:id/test-participants', async (req: AuthRequest, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.id);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    // Delete test participants (cascade will handle related data)
    const result = await prisma.participant.deleteMany({
      where: {
        studyId,
        metadata: {
          contains: '"isTest":true'
        }
      }
    });

    res.json({
      success: true,
      data: { deleted: result.count }
    });
  } catch (error) {
    next(error);
  }
});
