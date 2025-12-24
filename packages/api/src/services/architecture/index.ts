/**
 * Story Architecture Configuration Module
 *
 * Provides factory methods and predefined configurations for
 * parameterized story generation experiments.
 */

export {
  StoryArchitectureConfigFactory,
  ValidationResult,
  ConfigBuilderOptions
} from './config-factory';

export {
  PREDEFINED_CONFIGS,
  getPredefinedConfig,
  listPredefinedConfigs,
  ExperimentalDesigns
} from './predefined';
