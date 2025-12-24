/**
 * Story Architecture Configuration Factory
 *
 * Creates and validates story architecture configurations for parameterized
 * experiments. Supports single-agent, multi-agent debate, and ensemble patterns.
 */

import * as crypto from 'crypto';
import {
  StoryArchitectureConfig,
  StoryAgentDefinition,
  StoryAgentRole,
  ModelAdaptation,
  storyArchitectureConfigSchema
} from '@ariadne/shared';

/**
 * Validation result for architecture configs
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Builder options for creating configs
 */
export interface ConfigBuilderOptions {
  name?: string;
  description?: string;
  genre?: string;
  theme?: string;
  setting?: string;
}

/**
 * Factory for creating, validating, and managing story architecture configurations
 */
export class StoryArchitectureConfigFactory {
  /**
   * Create a simple single-agent narrator configuration
   */
  static createSingleAgentConfig(
    model: string,
    options: ConfigBuilderOptions = {}
  ): StoryArchitectureConfig {
    return {
      configId: crypto.randomUUID(),
      name: options.name || 'Single Agent Narrator',
      description: options.description || 'Simple single-agent story generation with one narrator',
      agents: [
        {
          agentId: 'narrator',
          role: StoryAgentRole.NARRATOR,
          promptTemplate: 'narrator-default',
          model,
          temperature: 0.7
        }
      ],
      stateRepresentation: {
        representationType: 'pydantic'
      },
      storyConstraints: {
        genre: options.genre,
        theme: options.theme,
        setting: options.setting
      }
    };
  }

  /**
   * Create a two-agent debate configuration (narrator vs drama manager)
   */
  static createDebateConfig(
    model: string,
    options: ConfigBuilderOptions = {}
  ): StoryArchitectureConfig {
    return {
      configId: crypto.randomUUID(),
      name: options.name || 'Two-Agent Debate',
      description: options.description || 'Narrative generation through narrator-drama manager debate',
      agents: [
        {
          agentId: 'narrator',
          role: StoryAgentRole.NARRATOR,
          promptTemplate: 'narrator-debate',
          model,
          temperature: 0.7,
          canRebut: true,
          canConcede: true
        },
        {
          agentId: 'drama-manager',
          role: StoryAgentRole.DRAMA_MANAGER,
          promptTemplate: 'drama-manager-debate',
          model,
          temperature: 0.8,
          canRebut: true,
          canConcede: true
        }
      ],
      debateStructure: {
        structureType: 'rounds',
        numRounds: 3,
        resolutionStrategy: 'synthesis',
        roundTimeoutMs: 30000
      },
      stateRepresentation: {
        representationType: 'hybrid',
        trackMacroQuestions: true,
        trackMicroQuestions: true
      },
      storyConstraints: {
        genre: options.genre,
        theme: options.theme,
        setting: options.setting
      },
      evaluationConfig: {
        enableCoherenceScoring: true,
        enableConsistencyChecks: true
      }
    };
  }

  /**
   * Create a multi-agent ensemble configuration with specialized roles
   */
  static createEnsembleConfig(
    model: string,
    roles: StoryAgentRole[],
    options: ConfigBuilderOptions = {}
  ): StoryArchitectureConfig {
    const agents: StoryAgentDefinition[] = roles.map((role, index) => ({
      agentId: `agent-${role.toLowerCase()}-${index}`,
      role,
      promptTemplate: `${role.toLowerCase()}-ensemble`,
      model,
      temperature: role === StoryAgentRole.CONSISTENCY_CHECKER ? 0.3 : 0.7
    }));

    return {
      configId: crypto.randomUUID(),
      name: options.name || `${roles.length}-Agent Ensemble`,
      description: options.description || `Ensemble generation with ${roles.join(', ')} agents`,
      agents,
      debateStructure: {
        structureType: 'parallel',
        resolutionStrategy: 'weighted',
        agentWeights: Object.fromEntries(
          agents.map(a => [a.agentId, 1.0 / agents.length])
        )
      },
      stateRepresentation: {
        representationType: 'graph',
        useCharacterGraph: true,
        useWorldGraph: true
      },
      storyConstraints: {
        genre: options.genre,
        theme: options.theme,
        setting: options.setting
      },
      evaluationConfig: {
        enableCoherenceScoring: true,
        enableConsistencyChecks: true,
        enableEngagementMetrics: true
      }
    };
  }

  /**
   * Create a question-tracking configuration based on Carroll's erotetic theory
   */
  static createQuestionTrackingConfig(
    model: string,
    options: ConfigBuilderOptions = {}
  ): StoryArchitectureConfig {
    return {
      configId: crypto.randomUUID(),
      name: options.name || 'Erotetic Narrative Tracking',
      description: options.description || 'Question-based narrative structure following Carroll\'s theory',
      agents: [
        {
          agentId: 'narrator',
          role: StoryAgentRole.NARRATOR,
          promptTemplate: 'narrator-erotetic',
          model,
          temperature: 0.7
        },
        {
          agentId: 'question-tracker',
          role: StoryAgentRole.QUESTION_TRACKER,
          promptTemplate: 'question-tracker',
          model,
          temperature: 0.3
        }
      ],
      debateStructure: {
        structureType: 'sequential',
        resolutionStrategy: 'synthesis'
      },
      stateRepresentation: {
        representationType: 'questions',
        trackMacroQuestions: true,
        trackMicroQuestions: true
      },
      storyConstraints: {
        genre: options.genre,
        theme: options.theme,
        setting: options.setting
      },
      evaluationConfig: {
        enableCoherenceScoring: true,
        customMetrics: ['questionClosure', 'narrativeTension', 'readerEngagement']
      }
    };
  }

  /**
   * Create a character-focused configuration with character advocates
   */
  static createCharacterDrivenConfig(
    model: string,
    characterIds: string[],
    options: ConfigBuilderOptions = {}
  ): StoryArchitectureConfig {
    const agents: StoryAgentDefinition[] = [
      {
        agentId: 'narrator',
        role: StoryAgentRole.NARRATOR,
        promptTemplate: 'narrator-character-driven',
        model,
        temperature: 0.7
      },
      ...characterIds.map(charId => ({
        agentId: `advocate-${charId}`,
        role: StoryAgentRole.CHARACTER_ADVOCATE,
        promptTemplate: 'character-advocate',
        model,
        temperature: 0.8,
        characterId: charId
      }))
    ];

    return {
      configId: crypto.randomUUID(),
      name: options.name || 'Character-Driven Narrative',
      description: options.description || `Character-driven story with ${characterIds.length} character advocates`,
      agents,
      debateStructure: {
        structureType: 'rounds',
        numRounds: 2,
        resolutionStrategy: 'voting'
      },
      stateRepresentation: {
        representationType: 'graph',
        useCharacterGraph: true
      },
      storyConstraints: {
        genre: options.genre,
        theme: options.theme,
        setting: options.setting
      },
      evaluationConfig: {
        enableCoherenceScoring: true,
        enableConsistencyChecks: true
      }
    };
  }

  /**
   * Add model adaptation rules to a config
   */
  static withModelAdaptation(
    config: StoryArchitectureConfig,
    adaptations: ModelAdaptation[]
  ): StoryArchitectureConfig {
    return {
      ...config,
      modelAdaptations: [...(config.modelAdaptations || []), ...adaptations]
    };
  }

  /**
   * Validate an architecture configuration
   */
  static validate(config: StoryArchitectureConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Use Zod for schema validation
    const zodResult = storyArchitectureConfigSchema.safeParse(config);
    if (!zodResult.success) {
      errors.push(...zodResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
    }

    // Additional semantic validation
    if (config.agents.length === 0) {
      errors.push('At least one agent is required');
    }

    // Check for duplicate agent IDs
    const agentIds = config.agents.map(a => a.agentId);
    const duplicates = agentIds.filter((id, i) => agentIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate agent IDs: ${duplicates.join(', ')}`);
    }

    // Validate debate structure matches agent count
    if (config.debateStructure) {
      if (config.debateStructure.structureType !== 'single' && config.agents.length < 2) {
        errors.push('Debate structures other than "single" require at least 2 agents');
      }

      if (config.debateStructure.agentWeights) {
        const weightAgentIds = Object.keys(config.debateStructure.agentWeights);
        const missingAgents = weightAgentIds.filter(id => !agentIds.includes(id));
        if (missingAgents.length > 0) {
          warnings.push(`Agent weights reference unknown agents: ${missingAgents.join(', ')}`);
        }
      }
    }

    // Validate character advocates have characterId
    const characterAdvocates = config.agents.filter(a => a.role === StoryAgentRole.CHARACTER_ADVOCATE);
    const advocatesWithoutChar = characterAdvocates.filter(a => !a.characterId);
    if (advocatesWithoutChar.length > 0) {
      warnings.push(`Character advocates without characterId: ${advocatesWithoutChar.map(a => a.agentId).join(', ')}`);
    }

    // Validate question tracking state representation
    if (config.stateRepresentation?.representationType === 'questions') {
      const hasQuestionTracker = config.agents.some(a => a.role === StoryAgentRole.QUESTION_TRACKER);
      if (!hasQuestionTracker) {
        warnings.push('Question-based state representation works best with a QUESTION_TRACKER agent');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clone a configuration with a new ID
   */
  static clone(config: StoryArchitectureConfig, newName?: string): StoryArchitectureConfig {
    return {
      ...JSON.parse(JSON.stringify(config)),
      configId: crypto.randomUUID(),
      name: newName || `${config.name} (copy)`
    };
  }

  /**
   * Merge two configurations (second overrides first for conflicts)
   */
  static merge(
    base: StoryArchitectureConfig,
    override: Partial<StoryArchitectureConfig>
  ): StoryArchitectureConfig {
    return {
      ...base,
      ...override,
      configId: override.configId || crypto.randomUUID(),
      agents: override.agents || base.agents,
      debateStructure: override.debateStructure !== undefined
        ? override.debateStructure
        : base.debateStructure,
      stateRepresentation: override.stateRepresentation !== undefined
        ? override.stateRepresentation
        : base.stateRepresentation,
      storyConstraints: {
        ...base.storyConstraints,
        ...override.storyConstraints
      },
      evaluationConfig: {
        ...base.evaluationConfig,
        ...override.evaluationConfig
      }
    };
  }
}
