/**
 * Authentication routes
 */

import { Router } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { generateResearcherToken, authenticateResearcher, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { authLimiter } from '../middleware/rate-limit';
import {
  HTTP_STATUS,
  ERROR_CODES,
  ResearcherRole,
  AccountStatus,
  DEFAULT_RESEARCHER_SETTINGS
} from '@ariadne/shared';
import {
  loginSchema,
  registerSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  changePasswordSchema,
  updateSettingsSchema
} from '@ariadne/shared';

export const authRouter = Router();

/**
 * POST /api/v1/auth/register
 * Register a new researcher account
 */
authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    // TODO: Verify reCAPTCHA if enabled
    // if (config.recaptcha.enabled && data.recaptchaToken) {
    //   await verifyRecaptcha(data.recaptchaToken);
    // }

    // Hash password before transaction (CPU-intensive)
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Use Serializable transaction to prevent race condition in first-user admin creation
    const { researcher, isFirstUser } = await prisma.$transaction(async (tx) => {
      // Check if email already exists
      const existing = await tx.researcher.findUnique({
        where: { email: data.email }
      });

      if (existing) {
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.ALREADY_EXISTS,
          'Email already registered'
        );
      }

      // Check if this is the first user (make them admin)
      const userCount = await tx.researcher.count();
      const isFirst = userCount === 0;

      // Create researcher
      const created = await tx.researcher.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: isFirst ? ResearcherRole.ADMIN : ResearcherRole.RESEARCHER,
          status: AccountStatus.ACTIVE,
          settings: DEFAULT_RESEARCHER_SETTINGS as unknown as Prisma.InputJsonValue,
          emailVerified: false
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          settings: true,
          emailVerified: true,
          createdAt: true
        }
      });

      return { researcher: created, isFirstUser: isFirst };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });

    // Generate token
    const token = generateResearcherToken(
      researcher.id,
      researcher.email,
      researcher.role as ResearcherRole,
      researcher.status as AccountStatus
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        researcher,
        token,
        isFirstUser // Let frontend know this is the admin
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/login
 * Login as a researcher
 */
authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find researcher
    const researcher = await prisma.researcher.findUnique({
      where: { email: data.email }
    });

    if (!researcher) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password'
      );
    }

    // Check account status
    if (researcher.status === AccountStatus.SUSPENDED) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Account suspended. Please contact administrator.'
      );
    }

    // Verify password
    const valid = await bcrypt.compare(data.password, researcher.passwordHash);

    if (!valid) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password'
      );
    }

    // Generate token
    const token = generateResearcherToken(
      researcher.id,
      researcher.email,
      researcher.role as ResearcherRole,
      researcher.status as AccountStatus
    );

    res.json({
      success: true,
      data: {
        researcher: {
          id: researcher.id,
          email: researcher.email,
          name: researcher.name,
          role: researcher.role,
          status: researcher.status,
          settings: researcher.settings,
          emailVerified: researcher.emailVerified,
          createdAt: researcher.createdAt
        },
        token
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 * Get current researcher profile
 */
authRouter.get('/me', authenticateResearcher, async (req: AuthRequest, res, next) => {
  try {
    const researcher = await prisma.researcher.findUnique({
      where: { id: req.researcher!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        settings: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!researcher) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Researcher not found'
      );
    }

    res.json({
      success: true,
      data: researcher
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/auth/settings
 * Update researcher settings
 */
authRouter.put('/settings', authenticateResearcher, async (req: AuthRequest, res, next) => {
  try {
    const updates = updateSettingsSchema.parse(req.body);

    // Get current settings
    const current = await prisma.researcher.findUnique({
      where: { id: req.researcher!.id },
      select: { settings: true }
    });

    // Merge settings
    const currentSettings = (current?.settings as object) || DEFAULT_RESEARCHER_SETTINGS;
    const newSettings = { ...currentSettings, ...updates };

    const researcher = await prisma.researcher.update({
      where: { id: req.researcher!.id },
      data: { settings: newSettings },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        settings: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: researcher
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/change-password
 * Change password (requires current password)
 */
authRouter.post('/change-password', authenticateResearcher, async (req: AuthRequest, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const researcher = await prisma.researcher.findUnique({
      where: { id: req.researcher!.id }
    });

    if (!researcher) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Researcher not found'
      );
    }

    // Verify current password
    const valid = await bcrypt.compare(data.currentPassword, researcher.passwordHash);

    if (!valid) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Current password is incorrect'
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await prisma.researcher.update({
      where: { id: req.researcher!.id },
      data: { passwordHash }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset email
 */
authRouter.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const data = passwordResetRequestSchema.parse(req.body);

    // TODO: Verify reCAPTCHA if enabled

    const researcher = await prisma.researcher.findUnique({
      where: { email: data.email }
    });

    // Always return success to prevent email enumeration
    if (!researcher) {
      res.json({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      });
      return;
    }

    // Generate reset token and hash it for storage
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { researcherId: researcher.id }
    });

    // Create new token (store hash, not plaintext)
    await prisma.passwordResetToken.create({
      data: {
        researcherId: researcher.id,
        token: tokenHash,
        expiresAt
      }
    });

    // TODO: Send email with reset link
    // Log token in dev mode only (never include in response)
    if (process.env.NODE_ENV === 'development') {
      console.log(`Password reset token for ${researcher.email}: ${token}`);
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with token
 */
authRouter.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const data = passwordResetConfirmSchema.parse(req.body);

    // Hash the incoming token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { researcher: true }
    });

    if (!resetToken) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Invalid or expired reset token'
      );
    }

    if (resetToken.usedAt) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Reset token has already been used'
      );
    }

    if (resetToken.expiresAt < new Date()) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Reset token has expired'
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.researcher.update({
        where: { id: resetToken.researcherId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      })
    ]);

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    next(error);
  }
});
