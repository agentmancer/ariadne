/**
 * LLM Services
 * Role-based LLM adapters for synthetic actor execution
 */

// Types
export * from './types';

// Registry
export { RoleAdapterRegistry, roleAdapterRegistry } from './role-adapter-registry';

// Base adapter
export { BaseRoleAdapter } from './adapters/base-role-adapter';

// Plugin-specific adapters
export * from './adapters/twine';

// LLM Clients
export { createLLMClient, isSupportedProvider, getSupportedProviders } from './clients/factory';
export { OpenAIClient } from './clients/openai-client';
export { AnthropicClient } from './clients/anthropic-client';

// Registration function for all adapters
import { registerTwineAdapters } from './adapters/twine';

/**
 * Register all role adapters with the global registry
 * Call this at application startup
 */
export function registerAllRoleAdapters(): void {
  registerTwineAdapters();
  // Add more plugin adapters here as they are created:
  // registerInkAdapters();
  // registerBitsyAdapters();
}
