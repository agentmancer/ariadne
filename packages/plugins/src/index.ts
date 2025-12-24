/**
 * Ariadne Platform v2.0 - Plugins Package
 *
 * Core plugin system for integrating story authoring platforms.
 * Plugin-specific implementations live in separate module packages.
 *
 * @example
 * ```typescript
 * import { StoryPlugin, PluginRegistry, pluginRegistry } from '@ariadne/plugins';
 * import { TwinePlugin } from '@ariadne/module-twine';
 *
 * // Register a module's plugin
 * pluginRegistry.register(TwinePlugin);
 * ```
 */

// Export core plugin types and interfaces
export * from './types';

// Export base plugin class for modules to extend
export * from './base-plugin';

// Export registry class and singleton
export { PluginRegistry, pluginRegistry } from './registry';

// Note: Plugin implementations (TwinePlugin, etc.) are in separate module packages.
// Install @ariadne/module-twine for Twine support.
