/**
 * Predefined Architecture Configurations
 *
 * Standard configurations for common experimental setups.
 * These serve as templates for researchers to use or customize.
 */

import * as crypto from 'crypto';
import {
  StoryArchitectureConfig,
  StoryAgentRole
} from '@ariadne/shared';
import { StoryArchitectureConfigFactory } from './config-factory';

/**
 * Registry of predefined architecture configurations
 */
export const PREDEFINED_CONFIGS: Record<string, () => StoryArchitectureConfig> = {
  /**
   * Baseline: Simple single-agent narrator
   * Use as control condition in experiments
   */
  'baseline-single-agent': () =>
    StoryArchitectureConfigFactory.createSingleAgentConfig('gpt-4', {
      name: 'Baseline Single Agent',
      description: 'Control condition: single narrator without debate or ensemble'
    }),

  /**
   * Two-agent debate between narrator and drama manager
   * Tests effect of dramatic tension optimization
   */
  'debate-narrator-drama': () =>
    StoryArchitectureConfigFactory.createDebateConfig('gpt-4', {
      name: 'Narrator-Drama Debate',
      description: 'Two agents debate narrative direction: narrator for coherence, drama manager for tension'
    }),

  /**
   * Question-tracking configuration using Carroll's erotetic theory
   * Tests effect of explicit narrative question management
   */
  'erotetic-question-tracking': () =>
    StoryArchitectureConfigFactory.createQuestionTrackingConfig('gpt-4', {
      name: 'Erotetic Question Tracking',
      description: 'Tracks narrative questions (macro and micro) following Carroll\'s theory'
    }),

  /**
   * Full ensemble with narrator, drama manager, consistency checker, and world builder
   * Tests effect of comprehensive multi-agent coordination
   */
  'ensemble-full': () =>
    StoryArchitectureConfigFactory.createEnsembleConfig(
      'gpt-4',
      [
        StoryAgentRole.NARRATOR,
        StoryAgentRole.DRAMA_MANAGER,
        StoryAgentRole.CONSISTENCY_CHECKER,
        StoryAgentRole.WORLD_BUILDER
      ],
      {
        name: 'Full Ensemble',
        description: '4-agent ensemble with specialized roles for comprehensive story generation'
      }
    ),

  /**
   * Minimal ensemble with narrator and consistency checker
   * Tests effect of consistency checking alone
   */
  'ensemble-minimal': () =>
    StoryArchitectureConfigFactory.createEnsembleConfig(
      'gpt-4',
      [
        StoryAgentRole.NARRATOR,
        StoryAgentRole.CONSISTENCY_CHECKER
      ],
      {
        name: 'Minimal Ensemble',
        description: '2-agent ensemble: narrator with consistency checking'
      }
    ),

  /**
   * Character-driven configuration with 2 character advocates
   * Use for stories with strong character arcs
   */
  'character-driven-2': () =>
    StoryArchitectureConfigFactory.createCharacterDrivenConfig(
      'gpt-4',
      ['protagonist', 'antagonist'],
      {
        name: 'Two-Character Driven',
        description: 'Character advocates for protagonist and antagonist guide narrative'
      }
    ),

  /**
   * High creativity single agent (higher temperature)
   */
  'creative-single-agent': () => ({
    ...StoryArchitectureConfigFactory.createSingleAgentConfig('gpt-4', {
      name: 'Creative Single Agent',
      description: 'High-creativity baseline with elevated temperature'
    }),
    agents: [{
      agentId: 'narrator',
      role: StoryAgentRole.NARRATOR,
      promptTemplate: 'narrator-creative',
      model: 'gpt-4',
      temperature: 0.95
    }]
  }),

  /**
   * Deterministic single agent (low temperature)
   * For reproducibility testing
   */
  'deterministic-single-agent': () => ({
    ...StoryArchitectureConfigFactory.createSingleAgentConfig('gpt-4', {
      name: 'Deterministic Single Agent',
      description: 'Low-temperature baseline for reproducibility'
    }),
    agents: [{
      agentId: 'narrator',
      role: StoryAgentRole.NARRATOR,
      promptTemplate: 'narrator-default',
      model: 'gpt-4',
      temperature: 0.1
    }]
  }),

  /**
   * Local model configuration (Ollama)
   * For researchers without API access
   */
  'local-ollama-baseline': () =>
    StoryArchitectureConfigFactory.createSingleAgentConfig('llama3.2', {
      name: 'Local Ollama Baseline',
      description: 'Single agent using local Ollama instance'
    }),

  /**
   * Claude-based configuration
   */
  'anthropic-baseline': () =>
    StoryArchitectureConfigFactory.createSingleAgentConfig('claude-3-5-sonnet-20241022', {
      name: 'Claude Baseline',
      description: 'Single agent using Claude 3.5 Sonnet'
    }),

  /**
   * Multi-model debate (GPT-4 vs Claude)
   * Tests cross-model collaboration
   */
  'cross-model-debate': () => ({
    configId: crypto.randomUUID(),
    name: 'Cross-Model Debate',
    description: 'Debate between GPT-4 narrator and Claude drama manager',
    agents: [
      {
        agentId: 'narrator-gpt4',
        role: StoryAgentRole.NARRATOR,
        promptTemplate: 'narrator-debate',
        model: 'gpt-4',
        temperature: 0.7,
        canRebut: true,
        canConcede: true
      },
      {
        agentId: 'drama-claude',
        role: StoryAgentRole.DRAMA_MANAGER,
        promptTemplate: 'drama-manager-debate',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.8,
        canRebut: true,
        canConcede: true
      }
    ],
    debateStructure: {
      structureType: 'rounds',
      numRounds: 3,
      resolutionStrategy: 'synthesis'
    },
    stateRepresentation: {
      representationType: 'hybrid',
      trackMacroQuestions: true
    }
  })
};

/**
 * Cached metadata for predefined configs to avoid executing factories just for listing
 */
const PREDEFINED_CONFIG_METADATA: Record<string, { name: string; description: string }> = {
  'baseline-single-agent': {
    name: 'Baseline Single Agent',
    description: 'Control condition: single narrator without debate or ensemble'
  },
  'debate-narrator-drama': {
    name: 'Narrator-Drama Debate',
    description: 'Two agents debate narrative direction: narrator for coherence, drama manager for tension'
  },
  'erotetic-question-tracking': {
    name: 'Erotetic Question Tracking',
    description: 'Tracks narrative questions (macro and micro) following Carroll\'s theory'
  },
  'ensemble-full': {
    name: 'Full Ensemble',
    description: '4-agent ensemble with specialized roles for comprehensive story generation'
  },
  'ensemble-minimal': {
    name: 'Minimal Ensemble',
    description: '2-agent ensemble: narrator with consistency checking'
  },
  'character-driven-2': {
    name: 'Two-Character Driven',
    description: 'Character advocates for protagonist and antagonist guide narrative'
  },
  'creative-single-agent': {
    name: 'Creative Single Agent',
    description: 'High-creativity baseline with elevated temperature'
  },
  'deterministic-single-agent': {
    name: 'Deterministic Single Agent',
    description: 'Low-temperature baseline for reproducibility'
  },
  'local-ollama-baseline': {
    name: 'Local Ollama Baseline',
    description: 'Single agent using local Ollama instance'
  },
  'anthropic-baseline': {
    name: 'Claude Baseline',
    description: 'Single agent using Claude 3.5 Sonnet'
  },
  'cross-model-debate': {
    name: 'Cross-Model Debate',
    description: 'Debate between GPT-4 narrator and Claude drama manager'
  }
};

/**
 * Get a predefined configuration by key
 */
export function getPredefinedConfig(key: string): StoryArchitectureConfig | null {
  const factory = PREDEFINED_CONFIGS[key];
  return factory ? factory() : null;
}

/**
 * List all available predefined configuration keys
 * Uses cached metadata to avoid executing factory functions
 */
export function listPredefinedConfigs(): Array<{ key: string; name: string; description: string }> {
  return Object.keys(PREDEFINED_CONFIGS).map(key => ({
    key,
    name: PREDEFINED_CONFIG_METADATA[key]?.name || key,
    description: PREDEFINED_CONFIG_METADATA[key]?.description || ''
  }));
}

/**
 * Experimental design helpers
 */
export const ExperimentalDesigns = {
  /**
   * Create a 2x2 factorial design comparing debate vs no-debate and question-tracking vs no-tracking
   */
  createDebateQuestionFactorial: (model: string): StoryArchitectureConfig[] => [
    // Condition A: No debate, no question tracking
    StoryArchitectureConfigFactory.createSingleAgentConfig(model, {
      name: 'Control (No Debate, No QT)'
    }),
    // Condition B: Debate, no question tracking
    StoryArchitectureConfigFactory.createDebateConfig(model, {
      name: 'Debate Only'
    }),
    // Condition C: No debate, question tracking
    StoryArchitectureConfigFactory.createQuestionTrackingConfig(model, {
      name: 'Question Tracking Only'
    }),
    // Condition D: Debate with question tracking
    StoryArchitectureConfigFactory.merge(
      StoryArchitectureConfigFactory.createDebateConfig(model, {
        name: 'Debate + Question Tracking'
      }),
      {
        agents: [
          {
            agentId: 'narrator',
            role: StoryAgentRole.NARRATOR,
            promptTemplate: 'narrator-debate-erotetic',
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
          },
          {
            agentId: 'question-tracker',
            role: StoryAgentRole.QUESTION_TRACKER,
            promptTemplate: 'question-tracker',
            model,
            temperature: 0.3
          }
        ],
        stateRepresentation: {
          representationType: 'questions',
          trackMacroQuestions: true,
          trackMicroQuestions: true
        }
      }
    )
  ],

  /**
   * Create model comparison design across providers
   */
  createModelComparisonDesign: (models: string[]): StoryArchitectureConfig[] =>
    models.map(model =>
      StoryArchitectureConfigFactory.createSingleAgentConfig(model, {
        name: `Baseline: ${model}`,
        description: `Single agent using ${model}`
      })
    ),

  /**
   * Create ensemble size comparison (1, 2, 3, 4 agents)
   */
  createEnsembleSizeComparison: (model: string): StoryArchitectureConfig[] => [
    StoryArchitectureConfigFactory.createSingleAgentConfig(model, {
      name: '1-Agent Baseline'
    }),
    StoryArchitectureConfigFactory.createEnsembleConfig(
      model,
      [StoryAgentRole.NARRATOR, StoryAgentRole.CONSISTENCY_CHECKER],
      { name: '2-Agent Ensemble' }
    ),
    StoryArchitectureConfigFactory.createEnsembleConfig(
      model,
      [StoryAgentRole.NARRATOR, StoryAgentRole.DRAMA_MANAGER, StoryAgentRole.CONSISTENCY_CHECKER],
      { name: '3-Agent Ensemble' }
    ),
    StoryArchitectureConfigFactory.createEnsembleConfig(
      model,
      [
        StoryAgentRole.NARRATOR,
        StoryAgentRole.DRAMA_MANAGER,
        StoryAgentRole.CONSISTENCY_CHECKER,
        StoryAgentRole.WORLD_BUILDER
      ],
      { name: '4-Agent Ensemble' }
    )
  ]
};
