/**
 * Agent Definitions routes - Full CRUD implementation
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { z } from 'zod';

export const agentDefinitionsRouter = Router();

agentDefinitionsRouter.use(authenticateResearcher);

// Validation schemas
const createAgentDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  role: z.string().min(1), // Required field
  llmConfig: z.record(z.unknown()).optional(),
  enabledTools: z.array(z.string()).optional(),
  toolUseMode: z.enum(['AGENTIC', 'SCRIPTED', 'HYBRID']).optional(),
  agenticConfig: z.record(z.unknown()).optional(),
  scriptedWorkflow: z.record(z.unknown()).optional(),
  systemPrompt: z.string().min(1), // Required field
  toolUseInstructions: z.string().optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional()
});

const updateAgentDefinitionSchema = createAgentDefinitionSchema.partial();

/**
 * GET /api/v1/agent-definitions
 * List all agent definitions for authenticated researcher (optionally include public definitions)
 */
agentDefinitionsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const includePublic = req.query.includePublic === 'true';

    const agentDefinitions = await prisma.agentDefinition.findMany({
      where: includePublic
        ? {
            OR: [
              { researcherId: req.researcher!.id },
              { isPublic: true }
            ]
          }
        : {
            researcherId: req.researcher!.id
          },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: agentDefinitions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agent-definitions
 * Create a new agent definition
 */
agentDefinitionsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createAgentDefinitionSchema.parse(req.body);

    const agentDefinition = await prisma.agentDefinition.create({
      data: {
        researcherId: req.researcher!.id,
        name: data.name,
        description: data.description,
        role: data.role,
        llmConfig: data.llmConfig ? JSON.stringify(data.llmConfig) : '{}',
        enabledTools: data.enabledTools ? JSON.stringify(data.enabledTools) : '[]',
        toolUseMode: data.toolUseMode || 'AGENTIC',
        agenticConfig: data.agenticConfig ? JSON.stringify(data.agenticConfig) : '{}',
        scriptedWorkflow: data.scriptedWorkflow ? JSON.stringify(data.scriptedWorkflow) : undefined,
        systemPrompt: data.systemPrompt,
        toolUseInstructions: data.toolUseInstructions,
        isPublic: data.isPublic ?? false,
        tags: data.tags ? JSON.stringify(data.tags) : '[]'
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: agentDefinition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/agent-definitions/:id
 * Get a single agent definition (accessible if owned or public)
 */
agentDefinitionsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const agentDefinition = await prisma.agentDefinition.findFirst({
      where: {
        OR: [
          { id: req.params.id, researcherId: req.researcher!.id },
          { id: req.params.id, isPublic: true }
        ]
      }
    });

    if (!agentDefinition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Agent definition not found'
      );
    }

    res.json({
      success: true,
      data: agentDefinition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/agent-definitions/:id
 * Update an agent definition
 */
agentDefinitionsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateAgentDefinitionSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.agentDefinition.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Agent definition not found'
      );
    }

    if (existing.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Access denied'
      );
    }

    // Build update data object with only defined fields
    const updateData: Record<string, string | boolean | undefined> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.llmConfig !== undefined) updateData.llmConfig = JSON.stringify(data.llmConfig);
    if (data.enabledTools !== undefined) updateData.enabledTools = JSON.stringify(data.enabledTools);
    if (data.toolUseMode !== undefined) updateData.toolUseMode = data.toolUseMode;
    if (data.agenticConfig !== undefined) updateData.agenticConfig = JSON.stringify(data.agenticConfig);
    if (data.scriptedWorkflow !== undefined) updateData.scriptedWorkflow = JSON.stringify(data.scriptedWorkflow);
    if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt;
    if (data.toolUseInstructions !== undefined) updateData.toolUseInstructions = data.toolUseInstructions;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);

    const agentDefinition = await prisma.agentDefinition.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      data: agentDefinition
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/agent-definitions/:id
 * Delete an agent definition
 */
agentDefinitionsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const agentDefinition = await prisma.agentDefinition.findUnique({
      where: { id: req.params.id }
    });

    if (!agentDefinition) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Agent definition not found'
      );
    }

    if (agentDefinition.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Access denied'
      );
    }

    await prisma.agentDefinition.delete({
      where: { id: req.params.id }
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

export default agentDefinitionsRouter;
