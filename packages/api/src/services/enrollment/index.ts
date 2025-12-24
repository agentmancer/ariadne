/**
 * Enrollment Service
 *
 * Handles human participant enrollment including:
 * - Consent collection
 * - Demographics collection
 * - Availability scheduling
 * - Participant creation
 */

import {
  EnrollRequest,
  EnrollmentApplication,
  EnrollmentStatus,
  EnrollmentResult,
  ParticipantState,
  StudyStatus,
  HTTP_STATUS,
  ERROR_CODES,
  generateParticipantId,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/error-handler';

/**
 * Get enrollment status for a study
 */
export async function getEnrollmentStatus(studyId: string): Promise<EnrollmentStatus> {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: {
      id: true,
      name: true,
      status: true,
      config: true,
      startDate: true,
      endDate: true,
      _count: {
        select: {
          participants: {
            where: {
              actorType: 'HUMAN',
            },
          },
        },
      },
    },
  });

  if (!study) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Study not found'
    );
  }

  // Parse config to get max participants
  let maxParticipants: number | undefined;
  let requiresAvailability = true;

  if (study.config) {
    try {
      const config = typeof study.config === 'string'
        ? JSON.parse(study.config)
        : study.config;
      maxParticipants = config.maxParticipants;
      requiresAvailability = config.requiresAvailability !== false;
    } catch {
      // Ignore parse errors
    }
  }

  // Determine if enrollment is open
  const now = new Date();
  const isActive = study.status === StudyStatus.ACTIVE;
  const isBeforeEnd = !study.endDate || now < study.endDate;
  const isAfterStart = !study.startDate || now >= study.startDate;
  const hasCapacity = !maxParticipants || study._count.participants < maxParticipants;

  const isOpen = isActive && isBeforeEnd && isAfterStart && hasCapacity;

  return {
    studyId: study.id,
    studyName: study.name,
    isOpen,
    enrolledCount: study._count.participants,
    maxParticipants,
    startDate: study.startDate?.toISOString(),
    endDate: study.endDate?.toISOString(),
    requiresAvailability,
  };
}

/**
 * Submit enrollment application for a study
 * Uses a transaction to prevent race conditions with concurrent enrollments
 */
export async function submitEnrollment(
  studyId: string,
  data: EnrollRequest
): Promise<EnrollmentResult> {
  // Check enrollment status first (outside transaction for efficiency)
  const status = await getEnrollmentStatus(studyId);

  if (!status.isOpen) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      'Enrollment is not open for this study'
    );
  }

  // Normalize email to prevent case-sensitive duplicates
  const normalizedEmail = data.email.toLowerCase().trim();

  // Use transaction to prevent race conditions
  const participant = await prisma.$transaction(async (tx) => {
    // Check for duplicate email within transaction
    const existingParticipant = await tx.participant.findFirst({
      where: {
        studyId,
        email: normalizedEmail,
      },
    });

    if (existingParticipant) {
      // Generic error message to prevent email enumeration
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Unable to process enrollment request'
      );
    }

    // Build application data
    const submittedAt = new Date().toISOString();
    const application: EnrollmentApplication = {
      consent: data.consent,
      demographics: data.demographics,
      availability: data.availability,
      email: normalizedEmail,
      timezone: data.timezone,
      submittedAt,
    };

    // Generate unique participant ID
    const uniqueId = generateParticipantId();

    // Create participant within same transaction
    return tx.participant.create({
      data: {
        studyId,
        uniqueId,
        email: normalizedEmail,
        actorType: 'HUMAN',
        type: 'HUMAN',
        state: ParticipantState.ENROLLED,
        application: application as object,
      },
      select: {
        id: true,
        uniqueId: true,
        studyId: true,
        state: true,
        createdAt: true,
      },
    });
  });

  return {
    participantId: participant.id,
    uniqueId: participant.uniqueId,
    studyId: participant.studyId,
    state: participant.state as ParticipantState,
    enrolledAt: participant.createdAt.toISOString(),
  };
}

/**
 * Get enrollment application data for a participant (researcher only)
 */
export async function getEnrollmentData(
  participantId: string
): Promise<EnrollmentApplication | null> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      application: true,
    },
  });

  if (!participant) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Participant not found'
    );
  }

  if (!participant.application) {
    return null;
  }

  return participant.application as unknown as EnrollmentApplication;
}

/**
 * Verify a participant belongs to a study owned by the researcher
 */
export async function verifyParticipantAccess(
  participantId: string,
  researcherId: string
): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      study: {
        select: {
          project: {
            select: {
              researcherId: true,
            },
          },
        },
      },
    },
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
      'Access denied'
    );
  }
}
