/**
 * Surveys routes - Full CRUD implementation
 * Surveys collect questionnaire responses from participants
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createSurveySchema, updateSurveySchema, submitSurveyResponseSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { Prisma } from '@prisma/client';
import { verifyStudyOwnership, safeJsonParse } from '../utils/ownership';

export const surveysRouter = Router();

surveysRouter.use(authenticateResearcher);

/**
 * GET /api/v1/surveys
 * List surveys with filters and pagination
 */
surveysRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { studyId, timing } = req.query;

    if (!studyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'studyId query parameter is required'
      );
    }

    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string, 10) || 20), 100);

    // Verify study ownership
    await verifyStudyOwnership(studyId as string, req.researcher!.id);

    const where: Prisma.SurveyWhereInput = {
      studyId: studyId as string
    };

    if (timing) {
      where.timing = timing as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [surveys, total] = await Promise.all([
      prisma.survey.findMany({
        where,
        include: {
          _count: {
            select: {
              responses: true
            }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'asc' }
      }),
      prisma.survey.count({ where })
    ]);

    // Parse questions JSON for response with safe fallback
    const surveysWithParsedQuestions = surveys.map(survey => ({
      ...survey,
      questions: safeJsonParse(survey.questions, [])
    }));

    res.json({
      success: true,
      data: {
        surveys: surveysWithParsedQuestions,
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
 * POST /api/v1/surveys
 * Create a new survey
 */
surveysRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createSurveySchema.parse(req.body);

    // Verify study ownership
    await verifyStudyOwnership(data.studyId, req.researcher!.id);

    const survey = await prisma.survey.create({
      data: {
        studyId: data.studyId,
        name: data.name,
        description: data.description,
        timing: data.timing,
        questions: JSON.stringify(data.questions)
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
      data: {
        ...survey,
        questions: safeJsonParse(survey.questions, [])
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/surveys/:id
 * Get survey details
 */
surveysRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const survey = await prisma.survey.findUnique({
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
            responses: true
          }
        }
      }
    });

    if (!survey) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Survey not found'
      );
    }

    if (survey.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to access this survey'
      );
    }

    res.json({
      success: true,
      data: {
        ...survey,
        questions: safeJsonParse(survey.questions, [])
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/surveys/:id
 * Update survey
 */
surveysRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateSurveySchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.survey.findUnique({
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
            responses: true
          }
        }
      }
    });

    if (!existing) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Survey not found'
      );
    }

    if (existing.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to update this survey'
      );
    }

    // Track if we need to warn about modifying a survey with responses
    let hasResponseWarning = false;
    if (data.questions && existing._count.responses > 0) {
      hasResponseWarning = true;
    }

    // Build update data
    const updateData: Prisma.SurveyUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.timing !== undefined) updateData.timing = data.timing;
    if (data.questions !== undefined) updateData.questions = JSON.stringify(data.questions);

    const survey = await prisma.survey.update({
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

    // Add warning header if modifying questions on a survey with existing responses
    if (hasResponseWarning) {
      res.setHeader('X-Warning', 'Survey has existing responses - question modifications may affect data consistency');
    }

    res.json({
      success: true,
      data: {
        ...survey,
        questions: safeJsonParse(survey.questions, [])
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/surveys/:id
 * Delete survey
 */
surveysRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const survey = await prisma.survey.findUnique({
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
            responses: true
          }
        }
      }
    });

    if (!survey) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Survey not found'
      );
    }

    if (survey.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to delete this survey'
      );
    }

    // Prevent deletion if survey has responses
    if (survey._count.responses > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete survey with existing responses'
      );
    }

    await prisma.survey.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/surveys/:id/responses
 * Submit a survey response
 */
surveysRouter.post('/:id/responses', async (req: AuthRequest, res, next) => {
  try {
    const data = submitSurveyResponseSchema.parse({
      ...req.body,
      surveyId: req.params.id
    });

    // Verify survey ownership
    const survey = await prisma.survey.findUnique({
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

    if (!survey) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Survey not found'
      );
    }

    if (survey.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to submit responses to this survey'
      );
    }

    // Verify participant belongs to the same study
    const participant = await prisma.participant.findUnique({
      where: { id: data.participantId },
      select: { studyId: true }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    if (participant.studyId !== survey.studyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participant does not belong to this study'
      );
    }

    // Check for existing response (optional: allow multiple)
    const existingResponse = await prisma.surveyResponse.findFirst({
      where: {
        surveyId: req.params.id,
        participantId: data.participantId
      }
    });

    if (existingResponse) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participant has already submitted a response to this survey'
      );
    }

    // Create response
    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: req.params.id,
        participantId: data.participantId,
        responses: JSON.stringify(data.responses)
      },
      include: {
        participant: {
          select: {
            id: true,
            uniqueId: true
          }
        },
        survey: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...response,
        responses: safeJsonParse(response.responses)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/surveys/:id/responses
 * Get all responses for a survey
 */
surveysRouter.get('/:id/responses', async (req: AuthRequest, res, next) => {
  try {
    // Parse pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);

    // Verify survey ownership
    const survey = await prisma.survey.findUnique({
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

    if (!survey) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Survey not found'
      );
    }

    if (survey.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to view responses for this survey'
      );
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [responses, total] = await Promise.all([
      prisma.surveyResponse.findMany({
        where: { surveyId: req.params.id },
        include: {
          participant: {
            select: {
              id: true,
              uniqueId: true,
              condition: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        skip,
        take,
        orderBy: { completedAt: 'desc' }
      }),
      prisma.surveyResponse.count({
        where: { surveyId: req.params.id }
      })
    ]);

    // Parse responses JSON
    const responsesWithParsed = responses.map(r => ({
      ...r,
      responses: safeJsonParse(r.responses)
    }));

    res.json({
      success: true,
      data: {
        responses: responsesWithParsed,
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

export default surveysRouter;
