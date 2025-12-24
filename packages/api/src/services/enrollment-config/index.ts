/**
 * Enrollment Configuration Service
 * Manages enrollment portal configuration for studies
 */

import { prisma } from '../../lib/prisma';
import type {
  EnrollmentConfig,
  CustomFieldDefinition,
  PublicEnrollmentPortal,
  ConsentVersionEntry,
  EnrollmentResult,
} from '@ariadne/shared';
import { renderMarkdown } from '../markdown';
import { ParticipantState, generateParticipantId } from '@ariadne/shared';

// ============================================
// TYPES
// ============================================

export interface CreateEnrollmentConfigInput {
  studyId: string;
  slug: string;
  enabled?: boolean;
  maxParticipants?: number;
  openAt?: Date;
  closeAt?: Date;
  welcomeContent?: string;
  consentDocument?: string;
  consentVersion?: string;
  instructionsContent?: string;
  completionContent?: string;
  requireAvailability?: boolean;
  customFields?: CustomFieldDefinition[];
  sendConfirmationEmail?: boolean;
  confirmationEmailTemplate?: string;
}

export interface UpdateEnrollmentConfigInput {
  slug?: string;
  enabled?: boolean;
  maxParticipants?: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  welcomeContent?: string | null;
  consentDocument?: string | null;
  consentVersion?: string;
  instructionsContent?: string | null;
  completionContent?: string | null;
  requireAvailability?: boolean;
  customFields?: CustomFieldDefinition[];
  sendConfirmationEmail?: boolean;
  confirmationEmailTemplate?: string | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Prisma EnrollmentConfig to API response format
 */
function toEnrollmentConfig(config: {
  id: string;
  studyId: string;
  slug: string;
  enabled: boolean;
  maxParticipants: number | null;
  openAt: Date | null;
  closeAt: Date | null;
  welcomeContent: string | null;
  consentDocument: string | null;
  consentVersion: string;
  instructionsContent: string | null;
  completionContent: string | null;
  requireAvailability: boolean;
  customFields: string;
  sendConfirmationEmail: boolean;
  confirmationEmailTemplate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EnrollmentConfig {
  return {
    id: config.id,
    studyId: config.studyId,
    slug: config.slug,
    enabled: config.enabled,
    maxParticipants: config.maxParticipants,
    openAt: config.openAt?.toISOString() ?? null,
    closeAt: config.closeAt?.toISOString() ?? null,
    welcomeContent: config.welcomeContent,
    consentDocument: config.consentDocument,
    consentVersion: config.consentVersion,
    instructionsContent: config.instructionsContent,
    completionContent: config.completionContent,
    requireAvailability: config.requireAvailability,
    customFields: parseCustomFields(config.customFields),
    sendConfirmationEmail: config.sendConfirmationEmail,
    confirmationEmailTemplate: config.confirmationEmailTemplate,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

function parseCustomFields(json: string): CustomFieldDefinition[] {
  try {
    return JSON.parse(json) as CustomFieldDefinition[];
  } catch {
    return [];
  }
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Create enrollment configuration for a study
 */
export async function createEnrollmentConfig(
  input: CreateEnrollmentConfigInput
): Promise<EnrollmentConfig> {
  // Verify study exists
  const study = await prisma.study.findUnique({
    where: { id: input.studyId },
  });

  if (!study) {
    throw new Error('Study not found');
  }

  // Check if config already exists
  const existing = await prisma.enrollmentConfig.findUnique({
    where: { studyId: input.studyId },
  });

  if (existing) {
    throw new Error('Enrollment configuration already exists for this study');
  }

  // Validate slug uniqueness
  const slugExists = await prisma.enrollmentConfig.findUnique({
    where: { slug: input.slug },
  });

  if (slugExists) {
    throw new Error('Slug is already in use');
  }

  const config = await prisma.enrollmentConfig.create({
    data: {
      studyId: input.studyId,
      slug: input.slug,
      enabled: input.enabled ?? false,
      maxParticipants: input.maxParticipants,
      openAt: input.openAt,
      closeAt: input.closeAt,
      welcomeContent: input.welcomeContent,
      consentDocument: input.consentDocument,
      consentVersion: input.consentVersion ?? '1.0',
      instructionsContent: input.instructionsContent,
      completionContent: input.completionContent,
      requireAvailability: input.requireAvailability ?? true,
      customFields: JSON.stringify(input.customFields ?? []),
      sendConfirmationEmail: input.sendConfirmationEmail ?? true,
      confirmationEmailTemplate: input.confirmationEmailTemplate,
    },
  });

  // If consent document provided, create initial consent version
  if (input.consentDocument) {
    await prisma.consentVersion.create({
      data: {
        enrollmentConfigId: config.id,
        version: input.consentVersion ?? '1.0',
        content: input.consentDocument,
      },
    });
  }

  return toEnrollmentConfig(config);
}

/**
 * Get enrollment configuration for a study
 */
export async function getEnrollmentConfig(
  studyId: string
): Promise<EnrollmentConfig | null> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { studyId },
  });

  return config ? toEnrollmentConfig(config) : null;
}

/**
 * Get enrollment configuration by slug
 */
export async function getEnrollmentConfigBySlug(
  slug: string
): Promise<EnrollmentConfig | null> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { slug },
  });

  return config ? toEnrollmentConfig(config) : null;
}

/**
 * Update enrollment configuration
 */
export async function updateEnrollmentConfig(
  studyId: string,
  input: UpdateEnrollmentConfigInput
): Promise<EnrollmentConfig> {
  const existing = await prisma.enrollmentConfig.findUnique({
    where: { studyId },
  });

  if (!existing) {
    throw new Error('Enrollment configuration not found');
  }

  // If changing slug, validate uniqueness
  if (input.slug && input.slug !== existing.slug) {
    const slugExists = await prisma.enrollmentConfig.findUnique({
      where: { slug: input.slug },
    });

    if (slugExists) {
      throw new Error('Slug is already in use');
    }
  }

  const config = await prisma.enrollmentConfig.update({
    where: { studyId },
    data: {
      slug: input.slug,
      enabled: input.enabled,
      maxParticipants: input.maxParticipants,
      openAt: input.openAt,
      closeAt: input.closeAt,
      welcomeContent: input.welcomeContent,
      consentDocument: input.consentDocument,
      consentVersion: input.consentVersion,
      instructionsContent: input.instructionsContent,
      completionContent: input.completionContent,
      requireAvailability: input.requireAvailability,
      customFields: input.customFields !== undefined
        ? JSON.stringify(input.customFields)
        : undefined,
      sendConfirmationEmail: input.sendConfirmationEmail,
      confirmationEmailTemplate: input.confirmationEmailTemplate,
    },
  });

  return toEnrollmentConfig(config);
}

/**
 * Delete enrollment configuration
 */
export async function deleteEnrollmentConfig(studyId: string): Promise<void> {
  await prisma.enrollmentConfig.delete({
    where: { studyId },
  });
}

/**
 * Toggle enrollment enabled status
 */
export async function toggleEnrollmentConfig(
  studyId: string,
  enabled: boolean
): Promise<EnrollmentConfig> {
  const config = await prisma.enrollmentConfig.update({
    where: { studyId },
    data: { enabled },
  });

  return toEnrollmentConfig(config);
}

// ============================================
// CONSENT VERSION MANAGEMENT
// ============================================

/**
 * Create a new consent version
 */
export async function createConsentVersion(
  studyId: string,
  version: string,
  content: string
): Promise<ConsentVersionEntry> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { studyId },
  });

  if (!config) {
    throw new Error('Enrollment configuration not found');
  }

  // Check if version already exists
  const existing = await prisma.consentVersion.findUnique({
    where: {
      enrollmentConfigId_version: {
        enrollmentConfigId: config.id,
        version,
      },
    },
  });

  if (existing) {
    throw new Error(`Consent version ${version} already exists`);
  }

  const consentVersion = await prisma.consentVersion.create({
    data: {
      enrollmentConfigId: config.id,
      version,
      content,
    },
  });

  // Update the current consent version and document
  await prisma.enrollmentConfig.update({
    where: { studyId },
    data: {
      consentVersion: version,
      consentDocument: content,
    },
  });

  return {
    id: consentVersion.id,
    version: consentVersion.version,
    content: consentVersion.content,
    effectiveDate: consentVersion.effectiveDate.toISOString(),
    createdAt: consentVersion.createdAt.toISOString(),
  };
}

/**
 * List all consent versions for a study
 */
export async function listConsentVersions(
  studyId: string
): Promise<ConsentVersionEntry[]> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { studyId },
  });

  if (!config) {
    return [];
  }

  const versions = await prisma.consentVersion.findMany({
    where: { enrollmentConfigId: config.id },
    orderBy: { createdAt: 'desc' },
  });

  return versions.map(v => ({
    id: v.id,
    version: v.version,
    content: v.content,
    effectiveDate: v.effectiveDate.toISOString(),
    createdAt: v.createdAt.toISOString(),
  }));
}

// ============================================
// SLUG VALIDATION
// ============================================

/**
 * Check if a slug is available
 */
export async function isSlugAvailable(
  slug: string,
  excludeStudyId?: string
): Promise<boolean> {
  const existing = await prisma.enrollmentConfig.findUnique({
    where: { slug },
  });

  if (!existing) {
    return true;
  }

  // If excluding a study ID, check if the existing slug belongs to that study
  if (excludeStudyId && existing.studyId === excludeStudyId) {
    return true;
  }

  return false;
}

// ============================================
// PUBLIC PORTAL DATA
// ============================================

/**
 * Get public enrollment portal data by slug
 * Returns null if not found or not enabled
 */
export async function getPublicEnrollmentPortal(
  slug: string
): Promise<PublicEnrollmentPortal | null> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { slug },
    include: {
      study: true,
    },
  });

  if (!config) {
    return null;
  }

  // Get enrolled count
  const enrolledCount = await prisma.participant.count({
    where: {
      studyId: config.studyId,
      actorType: 'HUMAN',
      state: {
        in: [
          ParticipantState.ENROLLED,
          ParticipantState.SCHEDULED,
          ParticipantState.CONFIRMED,
          ParticipantState.CHECKED_IN,
          ParticipantState.ACTIVE,
          ParticipantState.COMPLETE,
        ],
      },
    },
  });

  // Determine if enrollment is open
  const now = new Date();
  const isWithinTimeWindow =
    (!config.openAt || config.openAt <= now) &&
    (!config.closeAt || config.closeAt > now);
  const hasCapacity =
    !config.maxParticipants || enrolledCount < config.maxParticipants;
  const isOpen = config.enabled && isWithinTimeWindow && hasCapacity;

  return {
    studyId: config.studyId,
    studyName: config.study.name,
    studyDescription: config.study.description,
    slug: config.slug,
    isOpen,
    enrolledCount,
    maxParticipants: config.maxParticipants,
    openAt: config.openAt?.toISOString() ?? null,
    closeAt: config.closeAt?.toISOString() ?? null,
    requireAvailability: config.requireAvailability,
    customFields: parseCustomFields(config.customFields),
    content: {
      welcome: config.welcomeContent ? renderMarkdown(config.welcomeContent) : null,
      consent: config.consentDocument ? renderMarkdown(config.consentDocument) : null,
      consentVersion: config.consentVersion,
      instructions: config.instructionsContent ? renderMarkdown(config.instructionsContent) : null,
      completion: config.completionContent ? renderMarkdown(config.completionContent) : null,
    },
  };
}

/**
 * Get enrollment status by slug (lightweight check)
 */
export async function getEnrollmentStatusBySlug(slug: string): Promise<{
  isOpen: boolean;
  reason?: string;
} | null> {
  const config = await prisma.enrollmentConfig.findUnique({
    where: { slug },
  });

  if (!config) {
    return null;
  }

  if (!config.enabled) {
    return { isOpen: false, reason: 'Enrollment is currently closed' };
  }

  const now = new Date();

  if (config.openAt && config.openAt > now) {
    return { isOpen: false, reason: 'Enrollment has not started yet' };
  }

  if (config.closeAt && config.closeAt <= now) {
    return { isOpen: false, reason: 'Enrollment has ended' };
  }

  if (config.maxParticipants) {
    const enrolledCount = await prisma.participant.count({
      where: {
        studyId: config.studyId,
        actorType: 'HUMAN',
        state: {
          notIn: [ParticipantState.WITHDRAWN, ParticipantState.EXCLUDED],
        },
      },
    });

    if (enrolledCount >= config.maxParticipants) {
      return { isOpen: false, reason: 'Study is at capacity' };
    }
  }

  return { isOpen: true };
}

// ============================================
// PORTAL ENROLLMENT SUBMISSION
// ============================================

export interface PortalEnrollmentData {
  email: string;
  consentVersion: string;
  demographicData?: Record<string, unknown>;
  availabilityData?: unknown[];
  customFieldData?: Record<string, unknown>;
}

/**
 * Submit enrollment from the public portal
 * This handles the new consent-based enrollment flow
 */
export async function submitPortalEnrollment(
  studyId: string,
  data: PortalEnrollmentData
): Promise<EnrollmentResult> {
  // Get the study to include name in the result
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { name: true },
  });

  if (!study) {
    throw new Error('Study not found');
  }

  // Normalize email
  const normalizedEmail = data.email.toLowerCase().trim();

  // Use transaction to prevent race conditions
  const participant = await prisma.$transaction(async (tx) => {
    // Check for duplicate email
    const existingParticipant = await tx.participant.findFirst({
      where: {
        studyId,
        email: normalizedEmail,
      },
    });

    if (existingParticipant) {
      throw new Error('Unable to process enrollment request');
    }

    // Build application data
    const submittedAt = new Date().toISOString();
    const application = {
      consent: {
        agreed: true,
        version: data.consentVersion,
        timestamp: submittedAt,
      },
      demographics: data.demographicData || {},
      availability: data.availabilityData || [],
      customFields: data.customFieldData || {},
      email: normalizedEmail,
      submittedAt,
    };

    // Generate unique participant ID
    const uniqueId = generateParticipantId();

    // Create participant
    return tx.participant.create({
      data: {
        studyId,
        uniqueId,
        email: normalizedEmail,
        actorType: 'HUMAN',
        type: 'HUMAN',
        state: ParticipantState.ENROLLED,
        consentVersion: data.consentVersion,
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
    studyName: study.name,
    state: participant.state as ParticipantState,
    enrolledAt: participant.createdAt.toISOString(),
  };
}
