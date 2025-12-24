/**
 * Projects routes
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createProjectSchema, updateProjectSchema, ShareRole, ProjectWithAccess } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';

export const projectsRouter = Router();

// All project routes require authentication
projectsRouter.use(authenticateResearcher);

/**
 * Helper to check if a researcher has access to a project
 * Returns the access level or null if no access
 */
async function getProjectAccess(projectId: string, researcherId: string): Promise<{
  project: Awaited<ReturnType<typeof prisma.project.findUnique>>;
  isOwner: boolean;
  shareRole?: ShareRole;
} | null> {
  // Check if owner
  const ownedProject = await prisma.project.findFirst({
    where: {
      id: projectId,
      researcherId
    }
  });

  if (ownedProject) {
    return { project: ownedProject, isOwner: true };
  }

  // Check if shared
  const share = await prisma.projectShare.findFirst({
    where: {
      projectId,
      sharedWithId: researcherId
    },
    include: {
      project: true
    }
  });

  if (share) {
    return {
      project: share.project,
      isOwner: false,
      shareRole: share.role as ShareRole
    };
  }

  return null;
}

/**
 * Check if a share role allows editing
 */
function canEdit(shareRole?: ShareRole): boolean {
  return shareRole === ShareRole.EDITOR || shareRole === ShareRole.ADMIN;
}

/**
 * GET /api/v1/projects
 * List all projects for the authenticated researcher (owned + shared)
 */
projectsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const includeShared = req.query.includeShared !== 'false'; // Default true

    // Get owned projects
    const ownedProjects = await prisma.project.findMany({
      where: { researcherId: req.researcher!.id },
      include: {
        researcher: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform owned projects with access info
    const ownedWithAccess: ProjectWithAccess[] = ownedProjects.map(p => ({
      ...p,
      isOwner: true,
      shareRole: undefined
    }));

    if (!includeShared) {
      return res.json({
        success: true,
        data: ownedWithAccess
      });
    }

    // Get shared projects
    const shares = await prisma.projectShare.findMany({
      where: { sharedWithId: req.researcher!.id },
      include: {
        project: {
          include: {
            researcher: {
              select: { id: true, email: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform shared projects with access info
    const sharedWithAccess: ProjectWithAccess[] = shares.map(s => ({
      ...s.project,
      isOwner: false,
      shareRole: s.role as ShareRole
    }));

    // Combine and return
    const allProjects = [...ownedWithAccess, ...sharedWithAccess];

    res.json({
      success: true,
      data: allProjects
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects
 * Create a new project
 */
projectsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        ...data,
        researcherId: req.researcher!.id
      }
    });

    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/projects/:id
 * Get a single project (owned or shared)
 */
projectsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getProjectAccess(req.params.id, req.researcher!.id);

    if (!access) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Project not found'
        }
      });
    }

    // Fetch full project with studies
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        researcher: {
          select: { id: true, email: true, name: true }
        },
        studies: {
          orderBy: { createdAt: 'desc' }
        },
        shares: access.isOwner ? {
          include: {
            sharedWith: {
              select: { id: true, email: true, name: true }
            }
          }
        } : false
      }
    });

    // Add access info to response
    const response: ProjectWithAccess & { studies: unknown[]; shares?: unknown[] } = {
      ...project!,
      isOwner: access.isOwner,
      shareRole: access.shareRole
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/projects/:id
 * Update a project (owner or editor/admin)
 */
projectsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateProjectSchema.parse(req.body);
    const access = await getProjectAccess(req.params.id, req.researcher!.id);

    if (!access) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found'
      );
    }

    // Check edit permission
    if (!access.isOwner && !canEdit(access.shareRole)) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'You do not have permission to edit this project'
      );
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description
      },
      include: {
        researcher: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    res.json({
      success: true,
      data: {
        ...project,
        isOwner: access.isOwner,
        shareRole: access.shareRole
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/projects/:id
 * Delete a project (owner only - shared users cannot delete)
 */
projectsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Only owners can delete - shared users (even with ADMIN role) cannot delete
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        researcherId: req.researcher!.id
      },
      include: {
        _count: {
          select: {
            studies: true
          }
        }
      }
    });

    if (!project) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Project not found'
      );
    }

    // Prevent deletion if project has studies
    if (project._count.studies > 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Cannot delete project with existing studies'
      );
    }

    await prisma.project.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});
