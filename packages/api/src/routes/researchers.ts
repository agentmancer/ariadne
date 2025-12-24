/**
 * Researcher management routes (admin-only)
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateResearcher, requireAdmin, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import {
  HTTP_STATUS,
  ERROR_CODES,
  ResearcherRole,
  AccountStatus
} from '@ariadne/shared';
import {
  updateResearcherRoleSchema,
  updateResearcherStatusSchema
} from '@ariadne/shared';
import { z } from 'zod';

// Query string pagination schema (coerces strings to numbers with bounds)
const queryPaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(ResearcherRole).optional(),
  status: z.nativeEnum(AccountStatus).optional()
});

export const researchersRouter = Router();

// All routes require authentication and admin role
researchersRouter.use(authenticateResearcher);
researchersRouter.use(requireAdmin);

/**
 * GET /api/v1/researchers/stats/overview
 * Get researcher statistics (admin only)
 * NOTE: Must be defined before /:id to prevent route collision
 */
researchersRouter.get('/stats/overview', async (_req: AuthRequest, res, next) => {
  try {
    const [totalResearchers, byRole, byStatus, recentSignups] = await Promise.all([
      prisma.researcher.count(),
      prisma.researcher.groupBy({
        by: ['role'],
        _count: { id: true }
      }),
      prisma.researcher.groupBy({
        by: ['status'],
        _count: { id: true }
      }),
      prisma.researcher.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        total: totalResearchers,
        byRole: byRole.reduce((acc, r) => ({ ...acc, [r.role]: r._count.id }), {}),
        byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count.id }), {}),
        recentSignups
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/researchers
 * List all researchers (admin only)
 */
researchersRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const query = queryPaginationSchema.parse(req.query);
    const { page, pageSize, search, role, status } = query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const [researchers, total] = await Promise.all([
      prisma.researcher.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              projects: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.researcher.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        items: researchers.map(r => ({
          ...r,
          projectCount: r._count.projects,
          _count: undefined
        })),
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/researchers/:id
 * Get researcher details (admin only)
 */
researchersRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const researcher = await prisma.researcher.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        settings: true,
        emailVerified: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        projects: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            _count: {
              select: { studies: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            projects: true,
            llmProviders: true,
            agentDefinitions: true
          }
        }
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
 * PATCH /api/v1/researchers/:id/role
 * Update researcher role (admin only)
 */
researchersRouter.patch('/:id/role', async (req: AuthRequest, res, next) => {
  try {
    const data = updateResearcherRoleSchema.parse(req.body);

    // Prevent admin from demoting themselves
    if (req.params.id === req.researcher!.id && data.role !== ResearcherRole.ADMIN) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot demote your own admin account'
      );
    }

    const researcher = await prisma.researcher.update({
      where: { id: req.params.id },
      data: { role: data.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
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
    if ((error as { code?: string }).code === 'P2025') {
      next(new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Researcher not found'
      ));
    } else {
      next(error);
    }
  }
});

/**
 * PATCH /api/v1/researchers/:id/status
 * Update researcher status (admin only)
 */
researchersRouter.patch('/:id/status', async (req: AuthRequest, res, next) => {
  try {
    const data = updateResearcherStatusSchema.parse(req.body);

    // Prevent admin from suspending themselves
    if (req.params.id === req.researcher!.id && data.status === AccountStatus.SUSPENDED) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot suspend your own account'
      );
    }

    const researcher = await prisma.researcher.update({
      where: { id: req.params.id },
      data: { status: data.status },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
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
    if ((error as { code?: string }).code === 'P2025') {
      next(new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Researcher not found'
      ));
    } else {
      next(error);
    }
  }
});

/**
 * DELETE /api/v1/researchers/:id
 * Delete a researcher account (admin only)
 */
researchersRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete your own account'
      );
    }

    // Check if researcher exists
    const researcher = await prisma.researcher.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        _count: {
          select: { projects: true }
        }
      }
    });

    if (!researcher) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Researcher not found'
      );
    }

    // Warn if researcher has projects
    if (researcher._count.projects > 0) {
      const confirm = req.query.confirm === 'true';
      if (!confirm) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Researcher has ${researcher._count.projects} projects. Add ?confirm=true to delete anyway.`
        );
      }
    }

    await prisma.researcher.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      message: 'Researcher deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

