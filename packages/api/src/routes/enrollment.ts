/**
 * Enrollment routes - Public endpoints for human participant enrollment
 *
 * These endpoints do NOT require authentication as they are used by
 * participants to enroll themselves in studies.
 */

import { Router } from 'express';
import { z } from 'zod';
import { enrollRequestSchema, HTTP_STATUS, slugSchema, enrollWithConsentSchema, ERROR_CODES } from '@ariadne/shared';
import {
  getEnrollmentStatus,
  submitEnrollment,
  getEnrollmentData,
  verifyParticipantAccess,
} from '../services/enrollment';
import {
  getPublicEnrollmentPortal,
  getEnrollmentStatusBySlug,
  getEnrollmentConfigBySlug,
  submitPortalEnrollment,
} from '../services/enrollment-config';
import { sendEnrollmentConfirmation } from '../services/email';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { AppError } from '../middleware/error-handler';

export const enrollmentRouter = Router();

// ============================================
// RESEARCHER ENDPOINTS (auth required)
// Must be registered BEFORE parameterized routes to avoid conflicts
// ============================================

/**
 * GET /api/v1/enrollment/participants/:participantId
 * Get enrollment application data (researcher only)
 */
enrollmentRouter.get(
  '/participants/:participantId',
  authenticateResearcher,
  async (req: AuthRequest, res, next) => {
    try {
      const participantId = z.string().cuid().parse(req.params.participantId);

      // Verify researcher has access to this participant
      await verifyParticipantAccess(participantId, req.researcher!.id);

      const enrollment = await getEnrollmentData(participantId);

      res.json({
        success: true,
        data: enrollment,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================

/**
 * GET /api/v1/enrollment/:studyId/status
 * Get enrollment status for a study (public)
 */
enrollmentRouter.get('/:studyId/status', async (req, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.studyId);

    const status = await getEnrollmentStatus(studyId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/enrollment/:studyId
 * Submit enrollment application (public, rate limited)
 */
enrollmentRouter.post('/:studyId', authLimiter, async (req, res, next) => {
  try {
    const studyId = z.string().uuid().parse(req.params.studyId);
    const data = enrollRequestSchema.parse(req.body);

    const result = await submitEnrollment(studyId, data);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SLUG-BASED PUBLIC ENDPOINTS (new enrollment portal)
// ============================================

/**
 * GET /api/v1/enrollment/by-slug/:slug
 * Get public enrollment portal data by slug
 */
enrollmentRouter.get('/by-slug/:slug', async (req, res, next) => {
  try {
    const slug = slugSchema.parse(req.params.slug);

    const portal = await getPublicEnrollmentPortal(slug);

    if (!portal) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Enrollment portal not found'
      );
    }

    res.json({
      success: true,
      data: portal,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/enrollment/by-slug/:slug/status
 * Get enrollment status by slug (lightweight check)
 */
enrollmentRouter.get('/by-slug/:slug/status', async (req, res, next) => {
  try {
    const slug = slugSchema.parse(req.params.slug);

    const status = await getEnrollmentStatusBySlug(slug);

    if (!status) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Enrollment portal not found'
      );
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/enrollment/by-slug/:slug
 * Submit enrollment via slug-based portal (public, rate limited)
 */
enrollmentRouter.post('/by-slug/:slug', authLimiter, async (req, res, next) => {
  try {
    const slug = slugSchema.parse(req.params.slug);

    // Get enrollment config to verify it exists and is open
    const config = await getEnrollmentConfigBySlug(slug);

    if (!config) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Enrollment portal not found'
      );
    }

    if (!config.enabled) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Enrollment is currently closed'
      );
    }

    // Parse and validate enrollment data with consent
    const data = enrollWithConsentSchema.parse(req.body);

    // Submit enrollment using the new portal enrollment function
    const result = await submitPortalEnrollment(config.studyId, {
      email: data.email,
      consentVersion: config.consentVersion,
      demographicData: data.demographicData as Record<string, unknown> | undefined,
      availabilityData: data.availabilityData as unknown[] | undefined,
      customFieldData: data.customFieldData as Record<string, unknown> | undefined,
    });

    // Send confirmation email if configured
    if (config.sendConfirmationEmail && data.email) {
      const participantName = (data.demographicData as Record<string, unknown> | undefined)?.name;
      await sendEnrollmentConfirmation({
        participantEmail: data.email,
        participantName: typeof participantName === 'string' ? participantName : 'Participant',
        studyId: config.studyId,
        studyName: result.studyName || 'Research Study',
        emailTemplate: config.confirmationEmailTemplate || undefined,
      });
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        participantId: result.participantId,
        message: 'Enrollment successful',
      },
    });
  } catch (error) {
    next(error);
  }
});
