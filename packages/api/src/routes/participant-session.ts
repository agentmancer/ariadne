/**
 * Participant Session Routes
 *
 * Real-time session management for human participants during study sessions.
 * Handles stage progression, check-in, story save/load, and partner interactions.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma, StoryData } from '@prisma/client';
import { AppError } from '../middleware/error-handler';
import { authenticateParticipant, generateParticipantToken, AuthRequest } from '../middleware/auth';
import { HTTP_STATUS, ERROR_CODES, SessionStage, getSessionStageLabel } from '@ariadne/shared';
import { z } from 'zod';
import { config } from '../config';
import { getPresignedUploadUrl, getPresignedDownloadUrl, existsInS3 } from '../services/s3';
import { authLimiter } from '../middleware/rate-limit';

export const participantSessionRouter = Router();

/**
 * Safe JSON parse with error handling
 */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

/**
 * POST /api/v1/session/join
 * Join a study session with participant code (public, rate limited)
 * Returns JWT token for subsequent authenticated requests
 */
participantSessionRouter.post('/join', authLimiter, async (req, res, next) => {
  try {
    const { code } = z.object({
      code: z.string().min(1, 'Participant code is required')
    }).parse(req.body);

    // Find participant by their unique code
    const participant = await prisma.participant.findFirst({
      where: { uniqueId: code },
      include: {
        study: {
          select: {
            id: true,
            name: true,
            status: true,
            config: true
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
            uniqueId: true,
            currentStage: true,
            metadata: true
          }
        }
      }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Invalid participant code'
      );
    }

    // Check study status
    if (participant.study.status !== 'ACTIVE') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Study is not currently active'
      );
    }

    // Check participant state
    if (participant.state === 'WITHDRAWN' || participant.state === 'EXCLUDED') {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Participant is no longer eligible for this study'
      );
    }

    // Generate JWT token
    const token = generateParticipantToken(participant.id);

    // Log join event
    await prisma.event.create({
      data: {
        participantId: participant.id,
        type: 'session_join',
        category: 'session',
        data: JSON.stringify({
          code,
          joinedAt: new Date().toISOString(),
          userAgent: req.headers['user-agent']
        }),
        timestamp: new Date()
      }
    });

    // Parse partner bio safely
    const partnerBio = participant.partner?.metadata
      ? safeJsonParse<{ bio?: string }>(participant.partner.metadata as string, {}).bio
      : null;

    res.json({
      success: true,
      data: {
        token,
        participant: {
          id: participant.id,
          participantId: participant.uniqueId,
          studyId: participant.studyId,
          actorType: participant.actorType,
          role: participant.role,
          state: participant.state,
          currentStage: participant.currentStage,
          sessionStart: participant.sessionStart,
          metadata: safeJsonParse(participant.metadata, {})
        },
        partner: participant.partner ? {
          id: participant.partner.id,
          participantId: participant.partner.uniqueId,
          currentStage: participant.partner.currentStage,
          bio: partnerBio
        } : null,
        study: {
          id: participant.study.id,
          name: participant.study.name
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PROTECTED ROUTES (auth required)
// ============================================

// Apply authentication to all subsequent routes
participantSessionRouter.use(authenticateParticipant);

/**
 * Middleware: Verify participant can only access their own data
 */
function verifyParticipantOwnership(req: AuthRequest, participantId: string): void {
  if (!req.participant) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.UNAUTHORIZED,
      'Not authenticated'
    );
  }

  if (req.participant.id !== participantId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.FORBIDDEN,
      'Access denied - can only access your own session data'
    );
  }
}

/**
 * POST /api/v1/participant-session/check-in
 * Check in for session (uses participant ID from JWT token)
 */
participantSessionRouter.post('/check-in', async (req: AuthRequest, res, next) => {
  try {
    const participantId = req.participant!.id;

    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        study: {
          select: {
            id: true,
            name: true,
            config: true
          }
        },
        partner: {
          select: {
            id: true,
            uniqueId: true,
            currentStage: true,
            metadata: true
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

    // Update check-in time if not already checked in
    if (!participant.checkedIn) {
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          checkedIn: new Date(),
          state: 'CHECKED_IN'
        }
      });

      // Log check-in event
      await prisma.event.create({
        data: {
          participantId,
          type: 'session_checkin',
          category: 'session',
          data: JSON.stringify({
            checkedInAt: new Date().toISOString()
          }),
          timestamp: new Date()
        }
      });
    }

    // Parse partner bio safely
    const partnerBio = participant.partner?.metadata
      ? safeJsonParse<{ bio?: string }>(participant.partner.metadata as string, {}).bio
      : null;

    res.json({
      success: true,
      data: {
        participant: {
          id: participant.id,
          participantId: participant.uniqueId,
          studyId: participant.studyId,
          actorType: participant.actorType,
          role: participant.role,
          state: participant.state,
          currentStage: participant.currentStage,
          sessionStart: participant.sessionStart,
          metadata: safeJsonParse(participant.metadata, {})
        },
        partner: participant.partner ? {
          id: participant.partner.id,
          participantId: participant.partner.uniqueId,
          currentStage: participant.partner.currentStage,
          bio: partnerBio
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/participant-session/:participantId
 * Get session state (alternative path without /state suffix)
 */
participantSessionRouter.get('/:participantId', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        study: {
          select: {
            id: true,
            name: true,
            config: true,
            type: true
          }
        },
        condition: {
          select: {
            id: true,
            name: true,
            config: true
          }
        },
        partner: {
          select: {
            id: true,
            uniqueId: true,
            type: true,
            currentStage: true,
            metadata: true
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

    // Get stories and comments
    const [currentStory, partnerStory, comments] = await Promise.all([
      prisma.storyData.findFirst({
        where: { participantId, status: 'CONFIRMED' },
        orderBy: { version: 'desc' }
      }),
      participant.partnerId
        ? prisma.storyData.findFirst({
            where: { participantId: participant.partnerId, status: 'CONFIRMED' },
            orderBy: { version: 'desc' }
          })
        : Promise.resolve(null),
      prisma.comment.findMany({
        where: { targetParticipantId: participantId },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    // Parse metadata safely
    const partnerBio = participant.partner?.metadata
      ? safeJsonParse<{ bio?: string }>(participant.partner.metadata as string, {}).bio
      : null;

    // Parse study config for stage information
    const studyConfig = safeJsonParse<{ stages?: Array<{ stage: number; name: string; duration?: number }> }>(
      participant.study.config,
      { stages: [] }
    );

    res.json({
      success: true,
      data: {
        participant: {
          id: participant.id,
          studyId: participant.studyId,
          participantId: participant.uniqueId,
          actorType: participant.actorType,
          role: participant.role,
          state: participant.state,
          currentStage: participant.currentStage,
          sessionStart: participant.sessionStart,
          metadata: safeJsonParse(participant.metadata, {})
        },
        partner: participant.partner ? {
          id: participant.partner.id,
          participantId: participant.partner.uniqueId,
          currentStage: participant.partner.currentStage,
          bio: partnerBio
        } : null,
        currentStory: currentStory ? {
          id: currentStory.id,
          participantId: currentStory.participantId,
          pluginType: currentStory.pluginType,
          version: currentStory.version,
          s3Key: currentStory.s3Key,
          status: currentStory.status
        } : null,
        partnerStory: partnerStory ? {
          id: partnerStory.id,
          participantId: partnerStory.participantId,
          pluginType: partnerStory.pluginType,
          version: partnerStory.version,
          s3Key: partnerStory.s3Key,
          status: partnerStory.status
        } : null,
        comments: comments.map(c => ({
          id: c.id,
          authorId: c.authorId,
          targetParticipantId: c.targetParticipantId,
          content: c.content,
          passageName: c.passageId,
          commentType: c.commentType,
          round: c.round,
          phase: c.phase,
          resolved: c.resolved,
          addressedInRound: c.addressedInRound,
          createdAt: c.createdAt.toISOString()
        })),
        config: {
          stages: studyConfig.stages || [
            { stage: 0, name: 'waiting' },
            { stage: 1, name: 'tutorial' },
            { stage: 2, name: 'authoring_1' },
            { stage: 3, name: 'playing_1' },
            { stage: 4, name: 'authoring_2' },
            { stage: 5, name: 'playing_2' },
            { stage: 6, name: 'authoring_3' },
            { stage: 7, name: 'playing_3' },
            { stage: 8, name: 'survey' },
            { stage: 9, name: 'complete' }
          ]
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/participant-session/:participantId/advance
 * Advance to next stage
 */
participantSessionRouter.post('/:participantId/advance', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    });

    if (!participant) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Participant not found'
      );
    }

    const currentStage = participant.currentStage as SessionStage;
    const nextStage = (currentStage + 1) as SessionStage;

    // Start session if moving from waiting to tutorial
    const sessionStart = currentStage === SessionStage.WAITING && nextStage === SessionStage.TUTORIAL
      ? new Date()
      : participant.sessionStart;

    const newState = nextStage >= SessionStage.COMPLETE ? 'COMPLETE' : 'ACTIVE';

    const updated = await prisma.participant.update({
      where: { id: participantId },
      data: {
        currentStage: nextStage,
        state: newState,
        sessionStart,
        completedAt: nextStage >= SessionStage.COMPLETE ? new Date() : undefined
      }
    });

    // Log stage change event
    await prisma.event.create({
      data: {
        participantId,
        type: 'stage_advance',
        category: 'session',
        data: JSON.stringify({
          fromStage: currentStage,
          toStage: nextStage
        }),
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        participantId: updated.uniqueId,
        studyId: updated.studyId,
        actorType: updated.actorType,
        role: updated.role,
        state: updated.state,
        currentStage: updated.currentStage,
        sessionStart: updated.sessionStart,
        metadata: safeJsonParse(updated.metadata, {})
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Get next stage with bounds checking
 * Returns null if already at COMPLETE stage
 */
function getNextStage(currentStage: SessionStage): SessionStage | null {
  if (currentStage >= SessionStage.COMPLETE) {
    return null;
  }
  return (currentStage + 1) as SessionStage;
}

/**
 * Stage time offsets in minutes (from session start)
 * Based on legacy Ariadne's time-based progression
 */
// Magic values for stages that require manual progression (not time-based):
// - MANUAL_PROGRESSION_SURVEY (20000): Survey stage requires explicit advancement
// - MANUAL_PROGRESSION_COMPLETE (20001): Complete stage is final and never auto-advances
const MANUAL_PROGRESSION_SURVEY = 20000;
const MANUAL_PROGRESSION_COMPLETE = 20001;

const STAGE_OFFSETS: Record<SessionStage, number> = {
  [SessionStage.WAITING]: 0,
  [SessionStage.TUTORIAL]: 0,
  [SessionStage.AUTHOR_1]: 15,
  [SessionStage.PLAY_1]: 30,
  [SessionStage.AUTHOR_2]: 45,
  [SessionStage.PLAY_2]: 60,
  [SessionStage.AUTHOR_3]: 75,
  [SessionStage.PLAY_3]: 90,
  [SessionStage.AUTHOR_4]: 105,
  [SessionStage.SURVEY]: MANUAL_PROGRESSION_SURVEY,
  [SessionStage.COMPLETE]: MANUAL_PROGRESSION_COMPLETE
};

/**
 * Helper: Get participant with ownership verification
 */
async function getParticipantById(participantId: string) {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      study: {
        select: {
          id: true,
          name: true,
          config: true,
          type: true
        }
      },
      condition: {
        select: {
          id: true,
          name: true,
          config: true
        }
      },
      partner: {
        select: {
          id: true,
          uniqueId: true,
          type: true,
          currentStage: true,
          metadata: true
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

  return participant;
}

/**
 * Helper: Calculate elapsed minutes since session start
 */
function getElapsedMinutes(sessionStart: Date | null): number {
  if (!sessionStart) return 0;
  return Math.floor((Date.now() - sessionStart.getTime()) / (1000 * 60));
}

/**
 * Helper: Get stage configuration
 */
function getStageConfig(stage: SessionStage) {
  const durations: Record<SessionStage, number> = {
    [SessionStage.WAITING]: 0,
    [SessionStage.TUTORIAL]: 15,
    [SessionStage.AUTHOR_1]: 15,
    [SessionStage.PLAY_1]: 15,
    [SessionStage.AUTHOR_2]: 15,
    [SessionStage.PLAY_2]: 15,
    [SessionStage.AUTHOR_3]: 15,
    [SessionStage.PLAY_3]: 15,
    [SessionStage.AUTHOR_4]: 15,
    [SessionStage.SURVEY]: 0,
    [SessionStage.COMPLETE]: 0
  };

  return {
    name: getSessionStageLabel(stage),
    durationMinutes: durations[stage],
    description: getStageDescription(stage)
  };
}

function getStageDescription(stage: SessionStage): string {
  const descriptions: Record<SessionStage, string> = {
    [SessionStage.WAITING]: 'Please wait for your session to begin',
    [SessionStage.TUTORIAL]: 'Watch the tutorial video to learn how to create interactive stories',
    [SessionStage.AUTHOR_1]: 'Create the first version of your interactive story',
    [SessionStage.PLAY_1]: 'Play through your partner\'s story and provide feedback',
    [SessionStage.AUTHOR_2]: 'Revise your story based on feedback',
    [SessionStage.PLAY_2]: 'Play the revised version of your partner\'s story',
    [SessionStage.AUTHOR_3]: 'Make final revisions to your story',
    [SessionStage.PLAY_3]: 'Final playthrough of your partner\'s completed story',
    [SessionStage.AUTHOR_4]: 'Polish your story for submission',
    [SessionStage.SURVEY]: 'Complete the exit survey',
    [SessionStage.COMPLETE]: 'Session complete - thank you for participating!'
  };
  return descriptions[stage];
}

/**
 * Helper: Log session event
 */
async function logSessionEvent(
  participantId: string,
  type: string,
  data: Record<string, unknown>
) {
  await prisma.event.create({
    data: {
      participantId,
      type,
      category: 'session',
      data: JSON.stringify(data),
      timestamp: new Date()
    }
  });
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/v1/session/:participantId/state
 * Returns current session state, stage, partner info, stories
 */
participantSessionRouter.get('/:participantId/state', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership - participant can only access their own data
    verifyParticipantOwnership(req, participantId);

    const participant = await getParticipantById(participantId);
    const currentStage = participant.currentStage as SessionStage;

    // Fetch stories and comments in parallel for better performance
    const [currentStory, partnerStory, comments] = await Promise.all([
      // Get participant's current story
      prisma.storyData.findFirst({
        where: {
          participantId,
          status: 'CONFIRMED'
        },
        orderBy: { version: 'desc' }
      }),
      // Get partner's story if applicable
      participant.partnerId
        ? prisma.storyData.findFirst({
            where: {
              participantId: participant.partnerId,
              status: 'CONFIRMED'
            },
            orderBy: { version: 'desc' }
          })
        : Promise.resolve(null),
      // Get comments on participant's story
      prisma.comment.findMany({
        where: {
          targetParticipantId: participantId
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    const elapsedMinutes = getElapsedMinutes(participant.sessionStart);

    // Parse metadata safely
    const partnerBio = participant.partner?.metadata
      ? safeJsonParse<{ bio?: string }>(participant.partner.metadata as string, {}).bio
      : null;

    res.json({
      success: true,
      data: {
        participant: {
          id: participant.id,
          uniqueId: participant.uniqueId,
          type: participant.type,
          currentStage,
          sessionStart: participant.sessionStart,
          checkedIn: participant.checkedIn,
          state: participant.state
        },
        partner: participant.partner ? {
          id: participant.partner.id,
          uniqueId: participant.partner.uniqueId,
          bio: partnerBio
        } : null,
        study: {
          id: participant.study.id,
          name: participant.study.name,
          config: safeJsonParse(participant.study.config, {})
        },
        currentStory: currentStory ? {
          id: currentStory.id,
          version: currentStory.version,
          s3Key: currentStory.s3Key
        } : null,
        partnerStory: partnerStory ? {
          id: partnerStory.id,
          version: partnerStory.version,
          s3Key: partnerStory.s3Key
        } : null,
        comments,
        stageConfig: getStageConfig(currentStage),
        elapsedMinutes,
        nextStageAt: (() => {
          const next = getNextStage(currentStage);
          return next !== null ? STAGE_OFFSETS[next] : null;
        })()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/session/:participantId/checkin
 * Mark participant as checked in for their session
 */
participantSessionRouter.post('/:participantId/checkin', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const participant = await getParticipantById(participantId);

    // Verify participant is in correct state
    if (participant.checkedIn) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participant is already checked in'
      );
    }

    const now = new Date();

    // Update participant
    const updated = await prisma.participant.update({
      where: { id: participantId },
      data: {
        checkedIn: now,
        state: 'CHECKED_IN',
        currentStage: SessionStage.WAITING
      }
    });

    // Log event
    await logSessionEvent(participantId, 'session_checkin', {
      checkedInAt: now.toISOString(),
      participantId: participant.uniqueId
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        checkedIn: updated.checkedIn,
        currentStage: updated.currentStage,
        state: updated.state
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/session/:participantId/stage
 * Advance to next stage (with validation)
 */
participantSessionRouter.post('/:participantId/stage', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const { targetStage, force } = z.object({
      targetStage: z.number().int().min(0).max(10).optional(),
      force: z.boolean().optional().default(false)
    }).parse(req.body);

    const participant = await getParticipantById(participantId);
    const currentStage = participant.currentStage as SessionStage;

    // Determine next stage
    const nextStage = targetStage !== undefined
      ? targetStage as SessionStage
      : (currentStage + 1) as SessionStage;

    // Validate stage transition
    if (nextStage > SessionStage.COMPLETE) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot advance past complete stage'
      );
    }

    // Check time constraints (unless forced)
    if (!force && participant.sessionStart) {
      const elapsedMinutes = getElapsedMinutes(participant.sessionStart);
      const requiredMinutes = STAGE_OFFSETS[nextStage];

      if (elapsedMinutes < requiredMinutes) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Cannot advance to stage ${nextStage} yet. Required: ${requiredMinutes} minutes, elapsed: ${elapsedMinutes} minutes`
        );
      }
    }

    // Special handling for starting the session (WAITING -> TUTORIAL)
    const sessionStart = currentStage === SessionStage.WAITING && nextStage === SessionStage.TUTORIAL
      ? new Date()
      : participant.sessionStart;

    // Update participant state
    const newState = nextStage === SessionStage.COMPLETE ? 'COMPLETE' : 'ACTIVE';

    const updated = await prisma.participant.update({
      where: { id: participantId },
      data: {
        currentStage: nextStage,
        state: newState,
        sessionStart,
        completedAt: nextStage === SessionStage.COMPLETE ? new Date() : undefined
      }
    });

    // Log event
    await logSessionEvent(participantId, 'stage_change', {
      fromStage: currentStage,
      toStage: nextStage,
      elapsedMinutes: getElapsedMinutes(sessionStart),
      forced: force
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        currentStage: updated.currentStage,
        state: updated.state,
        sessionStart: updated.sessionStart,
        stageConfig: getStageConfig(nextStage)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/session/:participantId/story
 * Get participant's current story with presigned download URL
 */
participantSessionRouter.get('/:participantId/story', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    // Verify participant exists
    await getParticipantById(participantId);

    const story = await prisma.storyData.findFirst({
      where: {
        participantId,
        status: 'CONFIRMED'
      },
      orderBy: { version: 'desc' }
    });

    if (!story) {
      res.json({
        success: true,
        data: null
      });
      return;
    }

    // Generate presigned URL for download
    const { url: downloadUrl } = await getPresignedDownloadUrl(story.s3Key, story.s3Bucket);

    res.json({
      success: true,
      data: {
        id: story.id,
        version: story.version,
        pluginType: story.pluginType,
        name: story.name,
        createdAt: story.createdAt,
        downloadUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/session/:participantId/story
 * Save/update participant's story (autosave)
 * Returns presigned upload URL
 */
participantSessionRouter.put('/:participantId/story', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const { pluginType, name } = z.object({
      pluginType: z.string().default('twine'),
      name: z.string().optional()
    }).parse(req.body);

    const participant = await getParticipantById(participantId);

    // Use SERIALIZABLE isolation with retry logic to prevent race conditions
    const MAX_RETRIES = 3;
    let story: StoryData | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        story = await prisma.$transaction(async (tx) => {
          // Get current version for this plugin type within transaction
          const currentStory = await tx.storyData.findFirst({
            where: { participantId, pluginType },
            orderBy: { version: 'desc' }
          });

          const version = currentStory ? currentStory.version + 1 : 1;
          const s3Key = `stories/${participant.studyId}/${participantId}/${pluginType}/v${version}.json`;

          // Create story record within transaction
          return tx.storyData.create({
            data: {
              participantId,
              pluginType,
              version,
              s3Key,
              s3Bucket: config.s3.bucket,
              status: 'PENDING',
              expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
              name: name || `Story v${version}`
            }
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        break; // Success - exit retry loop
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          // P2002: Unique constraint violation (concurrent insert with same version)
          // P2034: Transaction conflict (serialization failure)
          if ((error.code === 'P2002' || error.code === 'P2034') && attempt < MAX_RETRIES) {
            lastError = error;
            console.warn(`Story save retry ${attempt}/${MAX_RETRIES} for participant ${participantId} due to ${error.code}`);
            // Exponential backoff with jitter to reduce contention
            const baseDelay = Math.pow(2, attempt) * 10;
            const jitter = Math.random() * baseDelay * 0.5;
            await new Promise(r => setTimeout(r, baseDelay + jitter));
            continue; // Retry
          }
        }
        throw error;
      }
    }

    if (!story) {
      throw lastError || new Error(`Failed to create story after ${MAX_RETRIES} retries`);
    }

    // Generate presigned upload URL
    const { url: uploadUrl } = await getPresignedUploadUrl(story.s3Key);

    // Log event
    await logSessionEvent(participantId, 'story_save', {
      storyId: story.id,
      version: story.version,
      stage: participant.currentStage
    });

    res.json({
      success: true,
      data: {
        id: story.id,
        version: story.version,
        s3Key: story.s3Key,
        uploadUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/session/:participantId/story/confirm
 * Confirm story upload completed
 */
participantSessionRouter.post('/:participantId/story/confirm', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const { storyId } = z.object({
      storyId: z.string().cuid('Invalid story ID format')
    }).parse(req.body);

    // Verify story belongs to participant
    const story = await prisma.storyData.findFirst({
      where: {
        id: storyId,
        participantId
      }
    });

    if (!story) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Story not found'
      );
    }

    // Verify the S3 object was actually uploaded before confirming
    const exists = await existsInS3(story.s3Key, story.s3Bucket);
    if (!exists) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Story file not uploaded to storage'
      );
    }

    // Update status
    const updated = await prisma.storyData.update({
      where: { id: storyId },
      data: {
        status: 'CONFIRMED',
        expiresAt: null
      }
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        version: updated.version,
        status: updated.status
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/session/:participantId/partner-story
 * Get partner's latest story for playing
 */
participantSessionRouter.get('/:participantId/partner-story', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const participant = await getParticipantById(participantId);

    if (!participant.partnerId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participant has no assigned partner'
      );
    }

    const partnerStory = await prisma.storyData.findFirst({
      where: {
        participantId: participant.partnerId,
        status: 'CONFIRMED'
      },
      orderBy: { version: 'desc' }
    });

    if (!partnerStory) {
      res.json({
        success: true,
        data: null,
        message: 'Partner has not submitted a story yet'
      });
      return;
    }

    // Generate presigned URL for download
    const { url: downloadUrl } = await getPresignedDownloadUrl(partnerStory.s3Key, partnerStory.s3Bucket);

    res.json({
      success: true,
      data: {
        id: partnerStory.id,
        version: partnerStory.version,
        pluginType: partnerStory.pluginType,
        name: partnerStory.name,
        partnerId: participant.partnerId,
        downloadUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/session/:participantId/comment
 * Add comment/feedback on partner's story
 */
participantSessionRouter.post('/:participantId/comment', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const { content, passageId, commentType, storyDataId } = z.object({
      content: z.string().min(1).max(2000),
      passageId: z.string().optional(),
      commentType: z.enum(['FEEDBACK', 'SUGGESTION', 'QUESTION', 'PRAISE', 'CRITIQUE']).optional().default('FEEDBACK'),
      storyDataId: z.string().cuid('Invalid story ID format').optional()
    }).parse(req.body);

    const participant = await getParticipantById(participantId);

    if (!participant.partnerId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participant has no assigned partner'
      );
    }

    // Determine current round based on stage
    const currentStage = participant.currentStage as SessionStage;
    let round = 1;
    if (currentStage >= SessionStage.PLAY_2) round = 2;
    if (currentStage >= SessionStage.PLAY_3) round = 3;

    // Create comment (Zod already validates commentType enum)
    const comment = await prisma.comment.create({
      data: {
        authorId: participantId,
        targetParticipantId: participant.partnerId,
        content,
        passageId,
        commentType,
        storyDataId,
        round,
        phase: 'REVIEW'
      }
    });

    // Log event
    await logSessionEvent(participantId, 'comment_added', {
      commentId: comment.id,
      targetParticipantId: participant.partnerId,
      round,
      commentType
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: comment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/session/:participantId/comments
 * Get comments received on participant's story
 */
participantSessionRouter.get('/:participantId/comments', async (req: AuthRequest, res, next) => {
  try {
    const { participantId } = z.object({
      participantId: z.string().cuid('Invalid participant ID format')
    }).parse(req.params);

    // Verify ownership
    verifyParticipantOwnership(req, participantId);

    const { round, page = 1, pageSize = 50 } = z.object({
      round: z.coerce.number().int().min(1).max(4).optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).optional().default(50)
    }).parse(req.query);

    // Verify participant exists
    await getParticipantById(participantId);

    const where: { targetParticipantId: string; round?: number } = {
      targetParticipantId: participantId
    };
    if (round !== undefined) {
      where.round = round;
    }

    const skip = (page - 1) * pageSize;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              uniqueId: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      }),
      prisma.comment.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        comments,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: skip + pageSize < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
