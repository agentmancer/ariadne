/**
 * Architecture Configuration routes
 *
 * API endpoints for managing story architecture configurations.
 * These support parameterized experiments with different multi-agent
 * structures, debate patterns, and state representations.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import {
  HTTP_STATUS,
  ERROR_CODES,
  storyArchitectureConfigSchema,
  StoryArchitectureConfig,
  StoryAgentRole
} from '@ariadne/shared';
import {
  StoryArchitectureConfigFactory,
  listPredefinedConfigs,
  getPredefinedConfig,
  ExperimentalDesigns
} from '../services/architecture';

export const architectureConfigsRouter = Router();

// All routes require authentication
architectureConfigsRouter.use(authenticateResearcher);

/**
 * GET /api/v1/architecture-configs/predefined
 * List all predefined architecture configurations
 */
architectureConfigsRouter.get('/predefined', (_req: AuthRequest, res, next) => {
  try {
    const configs = listPredefinedConfigs();
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/architecture-configs/predefined/:key
 * Get a specific predefined configuration by key
 */
architectureConfigsRouter.get('/predefined/:key', (req: AuthRequest, res, next) => {
  try {
    const config = getPredefinedConfig(req.params.key);

    if (!config) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        `Predefined configuration '${req.params.key}' not found`
      );
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/architecture-configs/validate
 * Validate a custom architecture configuration
 */
architectureConfigsRouter.post('/validate', (req: AuthRequest, res, next) => {
  try {
    // First validate structure with Zod, then run semantic validation
    const config = storyArchitectureConfigSchema.parse(req.body);
    const result = StoryArchitectureConfigFactory.validate(config);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Schema for generating configs from templates
const generateConfigSchema = z.object({
  template: z.enum([
    'single-agent',
    'debate',
    'ensemble',
    'question-tracking',
    'character-driven'
  ]),
  model: z.string().min(1),
  options: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    genre: z.string().optional(),
    theme: z.string().optional(),
    setting: z.string().optional()
  }).optional(),
  // For ensemble template
  roles: z.array(z.string()).optional(),
  // For character-driven template
  characterIds: z.array(z.string()).optional()
});

/**
 * POST /api/v1/architecture-configs/generate
 * Generate a configuration from a template
 */
architectureConfigsRouter.post('/generate', (req: AuthRequest, res, next) => {
  try {
    const data = generateConfigSchema.parse(req.body);
    let config: StoryArchitectureConfig;

    switch (data.template) {
      case 'single-agent':
        config = StoryArchitectureConfigFactory.createSingleAgentConfig(
          data.model,
          data.options
        );
        break;
      case 'debate':
        config = StoryArchitectureConfigFactory.createDebateConfig(
          data.model,
          data.options
        );
        break;
      case 'ensemble':
        if (!data.roles || data.roles.length === 0) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'Ensemble template requires at least one role'
          );
        }
        // Validate role values
        const validRoles = Object.values(StoryAgentRole) as string[];
        const invalidRoles = data.roles.filter(r => !validRoles.includes(r));
        if (invalidRoles.length > 0) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            `Invalid roles: ${invalidRoles.join(', ')}. Valid roles: ${validRoles.join(', ')}`
          );
        }
        config = StoryArchitectureConfigFactory.createEnsembleConfig(
          data.model,
          data.roles as typeof StoryAgentRole[keyof typeof StoryAgentRole][],
          data.options
        );
        break;
      case 'question-tracking':
        config = StoryArchitectureConfigFactory.createQuestionTrackingConfig(
          data.model,
          data.options
        );
        break;
      case 'character-driven':
        if (!data.characterIds || data.characterIds.length === 0) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'Character-driven template requires at least one character ID'
          );
        }
        config = StoryArchitectureConfigFactory.createCharacterDrivenConfig(
          data.model,
          data.characterIds,
          data.options
        );
        break;
      default: {
        // Exhaustiveness check - TypeScript will error if a case is missing
        const _exhaustive: never = data.template;
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Unknown template: ${_exhaustive}`
        );
      }
    }

    // Validate the generated config
    const validation = StoryArchitectureConfigFactory.validate(config);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        config,
        validation
      }
    });
  } catch (error) {
    next(error);
  }
});

// Schema for experimental design generation
const experimentalDesignSchema = z.object({
  design: z.enum([
    'debate-question-factorial',
    'model-comparison',
    'ensemble-size-comparison'
  ]),
  model: z.string().optional(), // Required for some designs
  models: z.array(z.string()).optional() // For model comparison
});

/**
 * POST /api/v1/architecture-configs/experimental-design
 * Generate a set of configurations for experimental designs
 */
architectureConfigsRouter.post('/experimental-design', (req: AuthRequest, res, next) => {
  try {
    const data = experimentalDesignSchema.parse(req.body);
    let configs: StoryArchitectureConfig[];

    switch (data.design) {
      case 'debate-question-factorial':
        if (!data.model) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'debate-question-factorial design requires a model'
          );
        }
        configs = ExperimentalDesigns.createDebateQuestionFactorial(data.model);
        break;
      case 'model-comparison':
        if (!data.models || data.models.length < 2) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'model-comparison design requires at least 2 models'
          );
        }
        configs = ExperimentalDesigns.createModelComparisonDesign(data.models);
        break;
      case 'ensemble-size-comparison':
        if (!data.model) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.INVALID_INPUT,
            'ensemble-size-comparison design requires a model'
          );
        }
        configs = ExperimentalDesigns.createEnsembleSizeComparison(data.model);
        break;
      default: {
        // Exhaustiveness check - TypeScript will error if a case is missing
        const _exhaustive: never = data.design;
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.INVALID_INPUT,
          `Unknown design: ${_exhaustive}`
        );
      }
    }

    // Validate all configs
    const validatedConfigs = configs.map(config => ({
      config,
      validation: StoryArchitectureConfigFactory.validate(config)
    }));

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        design: data.design,
        conditionCount: configs.length,
        configs: validatedConfigs
      }
    });
  } catch (error) {
    next(error);
  }
});

// Schema for clone request body validation
const cloneRequestSchema = z.object({
  config: storyArchitectureConfigSchema,
  newName: z.string().optional(),
  modifications: storyArchitectureConfigSchema.partial().optional()
});

/**
 * POST /api/v1/architecture-configs/clone
 * Clone and optionally modify a configuration
 */
architectureConfigsRouter.post('/clone', (req: AuthRequest, res, next) => {
  try {
    // Validate all inputs including modifications
    const { config, newName, modifications } = cloneRequestSchema.parse(req.body);

    // Clone the config
    let newConfig = StoryArchitectureConfigFactory.clone(config, newName);

    // Apply modifications if provided
    if (modifications) {
      newConfig = StoryArchitectureConfigFactory.merge(newConfig, modifications);
    }

    // Validate the result
    const validation = StoryArchitectureConfigFactory.validate(newConfig);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        config: newConfig,
        validation
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/architecture-configs/agent-roles
 * List all available agent roles
 */
architectureConfigsRouter.get('/agent-roles', (_req: AuthRequest, res, next) => {
  try {
    const roles = Object.entries(StoryAgentRole).map(([key, value]) => ({
      key,
      value,
      description: getRoleDescription(value as string)
    }));

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get description for an agent role
 */
function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    NARRATOR: 'Primary storyteller responsible for narrative coherence and prose',
    CHARACTER_ADVOCATE: 'Advocates for a specific character\'s motivations and arc',
    DRAMA_MANAGER: 'Manages dramatic tension, pacing, and conflict escalation',
    QUESTION_TRACKER: 'Tracks narrative questions and their resolution (erotetic theory)',
    CONSISTENCY_CHECKER: 'Ensures logical and narrative consistency across passages',
    WORLD_BUILDER: 'Develops setting, worldbuilding elements, and environmental details',
    EVALUATOR: 'Evaluates story quality metrics and provides feedback',
    CUSTOM: 'Custom role with user-defined responsibilities'
  };
  return descriptions[role] || 'No description available';
}

export default architectureConfigsRouter;
