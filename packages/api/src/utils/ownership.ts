/**
 * Ownership verification utilities
 * Shared helpers for verifying resource ownership through the researcher chain
 */

import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';

/**
 * Verify that a study belongs to the given researcher
 * @param studyId - The study ID to verify
 * @param researcherId - The researcher ID to check ownership against
 * @returns The study with project info if ownership is verified
 * @throws AppError if study not found or researcher doesn't own it
 */
export async function verifyStudyOwnership(studyId: string, researcherId: string) {
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

  return study;
}

/**
 * Verify that a participant belongs to a study owned by the given researcher
 * @param participantId - The participant ID to verify
 * @param researcherId - The researcher ID to check ownership against
 * @returns The participant with study and project info if ownership is verified
 * @throws AppError if participant not found or researcher doesn't own it
 */
export async function verifyParticipantOwnership(participantId: string, researcherId: string) {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
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

  if (participant.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'You do not have permission to access this participant'
    );
  }

  return participant;
}

/**
 * Verify that story data belongs to a study owned by the given researcher
 * @param storyDataId - The story data ID to verify
 * @param researcherId - The researcher ID to check ownership against
 * @returns The story data with full ownership chain if verified
 * @throws AppError if story data not found or researcher doesn't own it
 */
export async function verifyStoryDataOwnership(storyDataId: string, researcherId: string) {
  const storyData = await prisma.storyData.findUnique({
    where: { id: storyDataId },
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

  if (!storyData) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Story data not found'
    );
  }

  if (storyData.participant.study.project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'You do not have permission to access this story data'
    );
  }

  return storyData;
}

/**
 * Safely parse JSON with fallback for corrupted data
 * @param str - The JSON string to parse
 * @param fallback - The fallback value if parsing fails
 * @returns The parsed JSON or the fallback value
 */
export function safeJsonParse(str: string, fallback: unknown = {}): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
