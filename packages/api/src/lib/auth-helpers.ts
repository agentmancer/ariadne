/**
 * Shared authorization helpers
 * Common functions for verifying researcher access to resources
 */

import { prisma } from './prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';

/**
 * Safely parse JSON with a fallback default value
 * Useful for parsing stored JSON fields that might be malformed
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Verify researcher has access to a study
 * Checks that the study exists and belongs to a project owned by the researcher
 */
export async function verifyStudyAccess(studyId: string, researcherId: string) {
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
      'Access denied'
    );
  }

  return study;
}

/**
 * Verify researcher has access to a project
 * Checks that the project exists and is owned by the researcher
 */
export async function verifyProjectAccess(projectId: string, researcherId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, researcherId: true }
  });

  if (!project) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Project not found'
    );
  }

  if (project.researcherId !== researcherId) {
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.UNAUTHORIZED,
      'Access denied'
    );
  }

  return project;
}
