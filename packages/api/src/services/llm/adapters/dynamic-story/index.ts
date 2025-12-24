/**
 * Dynamic Story Role Adapters
 * Exports all role-based LLM adapters for the Dynamic Story plugin
 */

export { DynamicStoryNavigatorAdapter } from './navigator-adapter';
export { DynamicStoryProposerAdapter } from './proposer-adapter';
export { DynamicStoryCriticAdapter } from './critic-adapter';

import { roleAdapterRegistry } from '../../role-adapter-registry';
import { DynamicStoryNavigatorAdapter } from './navigator-adapter';
import { DynamicStoryProposerAdapter } from './proposer-adapter';
import { DynamicStoryCriticAdapter } from './critic-adapter';

/**
 * Register all Dynamic Story role adapters with the global registry
 */
export function registerDynamicStoryAdapters(): void {
  // Register for 'dynamic-story' plugin type - Individual mode
  roleAdapterRegistry.register('dynamic-story', 'NAVIGATOR', DynamicStoryNavigatorAdapter);
  roleAdapterRegistry.register('dynamic-story', 'PLAYER', DynamicStoryNavigatorAdapter);

  // Team mode roles (Critique + Revise)
  roleAdapterRegistry.register('dynamic-story', 'PROPOSER', DynamicStoryProposerAdapter);
  roleAdapterRegistry.register('dynamic-story', 'CRITIC', DynamicStoryCriticAdapter);

  // Also register under alternate names for flexibility
  roleAdapterRegistry.register('dynamic_story', 'NAVIGATOR', DynamicStoryNavigatorAdapter);
  roleAdapterRegistry.register('dynamic_story', 'PLAYER', DynamicStoryNavigatorAdapter);
  roleAdapterRegistry.register('dynamic_story', 'PROPOSER', DynamicStoryProposerAdapter);
  roleAdapterRegistry.register('dynamic_story', 'CRITIC', DynamicStoryCriticAdapter);
  roleAdapterRegistry.register('story', 'NAVIGATOR', DynamicStoryNavigatorAdapter);
  roleAdapterRegistry.register('story', 'PLAYER', DynamicStoryNavigatorAdapter);
}
