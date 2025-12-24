/**
 * Prolific Integration Routes
 *
 * Public endpoints for Prolific participant recruitment.
 * These endpoints do NOT require authentication as they are used by
 * participants redirected from Prolific.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES, generateParticipantId, generateCompletionCode } from '@ariadne/shared';
import { defaultLimiter } from '../middleware/rate-limit';

export const prolificRouter = Router();

/**
 * GET /api/v1/prolific/:studyId/entry
 * Prolific participant entry endpoint
 * Query params: PROLIFIC_PID, STUDY_ID, SESSION_ID
 *
 * This endpoint:
 * 1. Validates the study exists and is Prolific-enabled
 * 2. Creates a participant with prolificId
 * 3. Generates a unique participant code
 * 4. Redirects to the web app's join page
 */
prolificRouter.get('/:studyId/entry', defaultLimiter, async (req, res, next) => {
  try {
    const studyId = z.string().cuid().parse(req.params.studyId);

    // Parse Prolific query parameters
    const { PROLIFIC_PID, STUDY_ID, SESSION_ID } = z.object({
      PROLIFIC_PID: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid Prolific ID format'),
      STUDY_ID: z.string().optional(),
      SESSION_ID: z.string().optional()
    }).parse(req.query);

    // Verify study exists and is Prolific-enabled
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        name: true,
        status: true,
        prolificEnabled: true,
        prolificStudyId: true
      }
    });

    if (!study) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (!study.prolificEnabled) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.PROLIFIC_INVALID_CONFIG,
        'This study is not configured for Prolific recruitment'
      );
    }

    // Verify study is active
    if (study.status !== 'ACTIVE') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Study is not currently active'
      );
    }

    // Verify Prolific Study ID matches if provided
    if (STUDY_ID && study.prolificStudyId && STUDY_ID !== study.prolificStudyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Prolific study ID mismatch'
      );
    }

    // Upsert participant to prevent race condition
    const uniqueId = generateParticipantId();
    const enrollmentMetadata = {
      prolificSessionId: SESSION_ID,
      prolificStudyId: STUDY_ID,
      enrolledAt: new Date().toISOString(),
      source: 'prolific'
    };

    const participant = await prisma.participant.upsert({
      where: {
        studyId_prolificId: {
          studyId,
          prolificId: PROLIFIC_PID
        }
      },
      update: {
        // Update metadata if participant returns
        metadata: JSON.stringify(enrollmentMetadata)
      },
      create: {
        studyId,
        uniqueId,
        prolificId: PROLIFIC_PID,
        state: 'ENROLLED',
        actorType: 'HUMAN',
        type: 'HUMAN',
        metadata: JSON.stringify(enrollmentMetadata)
      }
    });

    // Log enrollment event only for new participants
    // Use try-catch to handle race conditions gracefully (duplicate events are harmless)
    try {
      const existingEvents = await prisma.event.count({
        where: {
          participantId: participant.id,
          type: 'prolific_enrollment'
        }
      });

      if (existingEvents === 0) {
        await prisma.event.create({
          data: {
            participantId: participant.id,
            type: 'prolific_enrollment',
            category: 'session',
            data: JSON.stringify({
              prolificId: PROLIFIC_PID,
              prolificSessionId: SESSION_ID,
              prolificStudyId: STUDY_ID,
              userAgent: req.headers['user-agent']
            }),
            timestamp: new Date()
          }
        });
      }
    } catch {
      // Ignore duplicate event errors - enrollment logging is non-critical
    }

    // Redirect to web app join page with participant code
    // The web app will be responsible for displaying the study interface
    const webAppUrl = process.env.WEB_APP_URL;
    if (!webAppUrl) {
      throw new AppError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.PROLIFIC_INVALID_CONFIG,
        'WEB_APP_URL environment variable is required for Prolific integration'
      );
    }
    const redirectUrl = `${webAppUrl}/study/join/${participant.uniqueId}`;

    res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/prolific/:studyId/complete
 * Mark participant as complete and return completion code
 *
 * This endpoint is called when a participant completes the study.
 * It generates a unique completion code that the participant submits to Prolific.
 */
prolificRouter.post('/:studyId/complete', defaultLimiter, async (req, res, next) => {
  try {
    const studyId = z.string().cuid().parse(req.params.studyId);

    // Parse request body
    const { prolificId } = z.object({
      prolificId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid Prolific ID format')
    }).parse(req.body);

    // Verify study exists and is Prolific-enabled
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        prolificEnabled: true
      }
    });

    if (!study) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (!study.prolificEnabled) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.PROLIFIC_INVALID_CONFIG,
        'This study is not configured for Prolific recruitment'
      );
    }

    // Find participant
    const participant = await prisma.participant.findFirst({
      where: {
        studyId,
        prolificId
      }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    // Generate completion code if not already generated
    let completionCode = participant.completionCode;
    if (!completionCode) {
      completionCode = generateCompletionCode();

      await prisma.participant.update({
        where: { id: participant.id },
        data: {
          completionCode,
          state: 'COMPLETE',
          completedAt: new Date()
        }
      });

      // Log completion event
      await prisma.event.create({
        data: {
          participantId: participant.id,
          type: 'prolific_completion',
          category: 'session',
          data: JSON.stringify({
            completionCode,
            completedAt: new Date().toISOString()
          }),
          timestamp: new Date()
        }
      });
    }

    res.json({
      success: true,
      data: {
        completionCode,
        message: 'Please submit this code to Prolific to receive your payment'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/prolific/:studyId/status/:prolificId
 * Get participant status and completion code (if completed)
 *
 * This endpoint allows participants to retrieve their completion code
 * if they lost it or closed the window.
 */
prolificRouter.get('/:studyId/status/:prolificId', defaultLimiter, async (req, res, next) => {
  try {
    const { studyId, prolificId } = z.object({
      studyId: z.string().cuid(),
      prolificId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid Prolific ID format')
    }).parse(req.params);

    // Verify study exists and is Prolific-enabled
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        name: true,
        prolificEnabled: true
      }
    });

    if (!study) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Study not found'
      );
    }

    if (!study.prolificEnabled) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.PROLIFIC_INVALID_CONFIG,
        'This study is not configured for Prolific recruitment'
      );
    }

    // Find participant
    const participant = await prisma.participant.findFirst({
      where: {
        studyId,
        prolificId
      },
      select: {
        id: true,
        uniqueId: true,
        state: true,
        completionCode: true,
        completedAt: true
      }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    res.json({
      success: true,
      data: {
        participantId: participant.uniqueId,
        state: participant.state,
        completionCode: participant.completionCode,
        completedAt: participant.completedAt
      }
    });
  } catch (error) {
    next(error);
  }
});
