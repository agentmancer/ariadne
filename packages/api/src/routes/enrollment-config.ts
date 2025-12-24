/**
 * Enrollment Configuration Routes
 * Researcher endpoints for managing enrollment portal settings
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import {
  createEnrollmentConfigSchema,
  updateEnrollmentConfigSchema,
  createConsentVersionSchema,
  slugSchema,
} from '@ariadne/shared';
import { z } from 'zod';
import { verifyStudyOwnership } from '../utils/ownership';
import {
  createEnrollmentConfig,
  getEnrollmentConfig,
  updateEnrollmentConfig,
  deleteEnrollmentConfig,
  toggleEnrollmentConfig,
  createConsentVersion,
  listConsentVersions,
  isSlugAvailable,
  getPublicEnrollmentPortal,
} from '../services/enrollment-config';
import { sendTestEmail, getEmailLogsByStudy } from '../services/email';
import { testEmailSchema } from '@ariadne/shared';

// ID validation - Prisma uses CUIDs, not UUIDs
const idSchema = z.string().min(1).max(50);

export const enrollmentConfigRouter = Router({ mergeParams: true });

enrollmentConfigRouter.use(authenticateResearcher);

// ============================================
// ENROLLMENT CONFIG CRUD
// ============================================

/**
 * GET /api/v1/studies/:studyId/enrollment-config
 * Get enrollment configuration for a study
 */
enrollmentConfigRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const config = await getEnrollmentConfig(studyId);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/studies/:studyId/enrollment-config
 * Create enrollment configuration for a study
 */
enrollmentConfigRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const data = createEnrollmentConfigSchema.parse(req.body);

    const config = await createEnrollmentConfig({
      studyId,
      slug: data.slug,
      enabled: data.enabled,
      maxParticipants: data.maxParticipants,
      openAt: data.openAt ? new Date(data.openAt) : undefined,
      closeAt: data.closeAt ? new Date(data.closeAt) : undefined,
      welcomeContent: data.welcomeContent,
      consentDocument: data.consentDocument,
      consentVersion: data.consentVersion,
      instructionsContent: data.instructionsContent,
      completionContent: data.completionContent,
      requireAvailability: data.requireAvailability,
      customFields: data.customFields,
      sendConfirmationEmail: data.sendConfirmationEmail,
      confirmationEmailTemplate: data.confirmationEmailTemplate,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/studies/:studyId/enrollment-config
 * Update enrollment configuration
 */
enrollmentConfigRouter.put('/', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const data = updateEnrollmentConfigSchema.parse(req.body);

    const config = await updateEnrollmentConfig(studyId, {
      slug: data.slug,
      enabled: data.enabled,
      maxParticipants: data.maxParticipants,
      openAt: typeof data.openAt === 'string' ? new Date(data.openAt) : data.openAt,
      closeAt: typeof data.closeAt === 'string' ? new Date(data.closeAt) : data.closeAt,
      welcomeContent: data.welcomeContent,
      consentDocument: data.consentDocument,
      consentVersion: data.consentVersion,
      instructionsContent: data.instructionsContent,
      completionContent: data.completionContent,
      requireAvailability: data.requireAvailability,
      customFields: data.customFields,
      sendConfirmationEmail: data.sendConfirmationEmail,
      confirmationEmailTemplate: data.confirmationEmailTemplate,
    });

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/studies/:studyId/enrollment-config
 * Delete enrollment configuration
 */
enrollmentConfigRouter.delete('/', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    await deleteEnrollmentConfig(studyId);

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/studies/:studyId/enrollment-config/toggle
 * Toggle enrollment enabled/disabled
 */
enrollmentConfigRouter.put('/toggle', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

    const config = await toggleEnrollmentConfig(studyId, enabled);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CONSENT VERSION MANAGEMENT
// ============================================

/**
 * GET /api/v1/studies/:studyId/enrollment-config/consent-versions
 * List all consent versions for a study
 */
enrollmentConfigRouter.get('/consent-versions', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const versions = await listConsentVersions(studyId);

    res.json({
      success: true,
      data: versions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/studies/:studyId/enrollment-config/consent-versions
 * Create a new consent version
 */
enrollmentConfigRouter.post('/consent-versions', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const data = createConsentVersionSchema.parse(req.body);

    const version = await createConsentVersion(studyId, data.version, data.content);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: version,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SLUG VALIDATION
// ============================================

/**
 * GET /api/v1/studies/:studyId/enrollment-config/check-slug/:slug
 * Check if a slug is available
 */
enrollmentConfigRouter.get('/check-slug/:slug', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const slug = slugSchema.parse(req.params.slug);
    const available = await isSlugAvailable(slug, studyId);

    res.json({
      success: true,
      data: { available },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PREVIEW MODE
// ============================================

/**
 * GET /api/v1/studies/:studyId/enrollment-config/preview
 * Get a preview of the enrollment portal as it would appear to participants
 */
enrollmentConfigRouter.get('/preview', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const config = await getEnrollmentConfig(studyId);

    if (!config) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Enrollment configuration not found'
      );
    }

    // Get the public portal data for preview
    const portal = await getPublicEnrollmentPortal(config.slug);

    res.json({
      success: true,
      data: {
        ...portal,
        isPreview: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// EMAIL TESTING
// ============================================

/**
 * POST /api/v1/studies/:studyId/enrollment-config/test-email
 * Send a test email to verify email configuration
 */
enrollmentConfigRouter.post('/test-email', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    const study = await verifyStudyOwnership(studyId, req.researcher!.id);

    const config = await getEnrollmentConfig(studyId);

    if (!config) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Enrollment configuration not found'
      );
    }

    const { email } = testEmailSchema.parse(req.body);
    const template = config.confirmationEmailTemplate || undefined;

    const result = await sendTestEmail(email, study.name, template || '');

    if (!result.success) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        result.error || 'Failed to send test email'
      );
    }

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        sentTo: email,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/studies/:studyId/enrollment-config/email-logs
 * Get email logs for this study
 */
enrollmentConfigRouter.get('/email-logs', async (req: AuthRequest, res, next) => {
  try {
    const studyId = idSchema.parse(req.params.studyId);
    await verifyStudyOwnership(studyId, req.researcher!.id);

    const logs = await getEmailLogsByStudy(studyId);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});
