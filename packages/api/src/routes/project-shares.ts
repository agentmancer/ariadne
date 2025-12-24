/**
 * Project Shares routes
 * Manages sharing projects between researchers
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createProjectShareSchema, updateProjectShareSchema, ShareRole } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';

export const projectSharesRouter = Router();

// All project share routes require authentication
projectSharesRouter.use(authenticateResearcher);

/**
 * GET /api/v1/projects/:projectId/shares
 * List all shares for a project (owner only)
 */
projectSharesRouter.get('/:projectId/shares', async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.params;

    // Verify ownership - only owner can see all shares
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        researcherId: req.researcher!.id
      }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found or you do not have permission to manage shares'
      );
    }

    const shares = await prisma.projectShare.findMany({
      where: { projectId },
      include: {
        sharedWith: {
          select: { id: true, email: true, name: true }
        },
        sharedBy: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: shares
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects/:projectId/shares
 * Share a project with another researcher (owner only)
 */
projectSharesRouter.post('/:projectId/shares', async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.params;
    const data = createProjectShareSchema.parse(req.body);

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        researcherId: req.researcher!.id
      }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found or you do not have permission to share it'
      );
    }

    // Find the researcher to share with
    const targetResearcher = await prisma.researcher.findUnique({
      where: { email: data.email }
    });

    if (!targetResearcher) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        `No researcher found with email: ${data.email}`
      );
    }

    // Cannot share with yourself
    if (targetResearcher.id === req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot share a project with yourself'
      );
    }

    // Check if share already exists
    const existingShare = await prisma.projectShare.findUnique({
      where: {
        projectId_sharedWithId: {
          projectId,
          sharedWithId: targetResearcher.id
        }
      }
    });

    if (existingShare) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ALREADY_EXISTS,
        `Project is already shared with ${data.email}`
      );
    }

    // Create the share
    const share = await prisma.projectShare.create({
      data: {
        projectId,
        sharedWithId: targetResearcher.id,
        role: data.role,
        sharedById: req.researcher!.id
      },
      include: {
        sharedWith: {
          select: { id: true, email: true, name: true }
        },
        sharedBy: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: share
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/projects/:projectId/shares/:shareId
 * Update a share's role (owner only)
 */
projectSharesRouter.put('/:projectId/shares/:shareId', async (req: AuthRequest, res, next) => {
  try {
    const { projectId, shareId } = req.params;
    const data = updateProjectShareSchema.parse(req.body);

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        researcherId: req.researcher!.id
      }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found or you do not have permission to manage shares'
      );
    }

    // Find and update the share
    const share = await prisma.projectShare.findFirst({
      where: {
        id: shareId,
        projectId
      }
    });

    if (!share) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Share not found'
      );
    }

    const updatedShare = await prisma.projectShare.update({
      where: { id: shareId },
      data: { role: data.role },
      include: {
        sharedWith: {
          select: { id: true, email: true, name: true }
        },
        sharedBy: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    res.json({
      success: true,
      data: updatedShare
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/projects/:projectId/shares/:shareId
 * Remove a share (owner only)
 */
projectSharesRouter.delete('/:projectId/shares/:shareId', async (req: AuthRequest, res, next) => {
  try {
    const { projectId, shareId } = req.params;

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        researcherId: req.researcher!.id
      }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found or you do not have permission to manage shares'
      );
    }

    // Find and delete the share
    const share = await prisma.projectShare.findFirst({
      where: {
        id: shareId,
        projectId
      }
    });

    if (!share) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Share not found'
      );
    }

    await prisma.projectShare.delete({
      where: { id: shareId }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/projects/:projectId/shares/leave
 * Leave a shared project (for the shared-with user)
 */
projectSharesRouter.delete('/:projectId/shares/leave', async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.params;

    // Find the share for this researcher
    const share = await prisma.projectShare.findFirst({
      where: {
        projectId,
        sharedWithId: req.researcher!.id
      }
    });

    if (!share) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'You do not have access to this project or it does not exist'
      );
    }

    await prisma.projectShare.delete({
      where: { id: share.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/project-shares/my-shares
 * List all projects shared with the current user
 */
projectSharesRouter.get('/my-shares', async (req: AuthRequest, res, next) => {
  try {
    const shares = await prisma.projectShare.findMany({
      where: {
        sharedWithId: req.researcher!.id
      },
      include: {
        project: {
          include: {
            researcher: {
              select: { id: true, email: true, name: true }
            }
          }
        },
        sharedBy: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to ProjectWithAccess format
    const projectsWithAccess = shares.map(share => ({
      ...share.project,
      isOwner: false,
      shareRole: share.role as ShareRole,
      sharedBy: share.sharedBy,
      sharedAt: share.createdAt
    }));

    res.json({
      success: true,
      data: projectsWithAccess
    });
  } catch (error) {
    next(error);
  }
});
