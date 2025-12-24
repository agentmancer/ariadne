/**
 * Twine Role Adapters
 * Exports all role-based LLM adapters for the Twine plugin
 */

export { TwinePlayerAdapter } from './player-adapter';
export { TwineEditorAdapter } from './editor-adapter';
export { TwineStorytellerAdapter } from './storyteller-adapter';
export { TwineConsistencyAdapter } from './consistency-adapter';
export { TwineNavigatorAdapter } from './navigator-adapter';
export { TwineCollaborativeAdapter, CollaborativeRoleContext } from './collaborative-adapter';

import { roleAdapterRegistry } from '../../role-adapter-registry';
import { TwinePlayerAdapter } from './player-adapter';
import { TwineEditorAdapter } from './editor-adapter';
import { TwineStorytellerAdapter } from './storyteller-adapter';
import { TwineConsistencyAdapter } from './consistency-adapter';
import { TwineNavigatorAdapter } from './navigator-adapter';
import { TwineCollaborativeAdapter } from './collaborative-adapter';

/**
 * Register all Twine role adapters with the global registry
 */
export function registerTwineAdapters(): void {
  roleAdapterRegistry.register('twine', 'PLAYER', TwinePlayerAdapter);
  roleAdapterRegistry.register('twine', 'EDITOR', TwineEditorAdapter);
  roleAdapterRegistry.register('twine', 'STORYTELLER', TwineStorytellerAdapter);
  roleAdapterRegistry.register('twine', 'CONSISTENCY_MANAGER', TwineConsistencyAdapter);
  roleAdapterRegistry.register('twine', 'NAVIGATOR', TwineNavigatorAdapter);
  roleAdapterRegistry.register('twine', 'COLLABORATIVE', TwineCollaborativeAdapter);
}
