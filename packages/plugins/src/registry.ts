/**
 * Plugin registry implementation
 */

import {
  StoryPlugin,
  StoryPluginConstructor,
  PluginMetadata,
  IPluginRegistry
} from './types';

export class PluginRegistry implements IPluginRegistry {
  private plugins: Map<string, StoryPluginConstructor> = new Map();

  /**
   * Register a plugin
   */
  register(pluginConstructor: StoryPluginConstructor): void {
    const instance = new pluginConstructor();
    const { id } = instance.metadata;

    if (this.plugins.has(id)) {
      console.warn(`Plugin ${id} is already registered. Overwriting.`);
    }

    this.plugins.set(id, pluginConstructor);
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  /**
   * Get a plugin constructor by ID
   */
  get(pluginId: string): StoryPluginConstructor | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all registered plugins
   */
  list(): PluginMetadata[] {
    const metadata: PluginMetadata[] = [];

    for (const PluginConstructor of this.plugins.values()) {
      const instance = new PluginConstructor();
      metadata.push(instance.metadata);
    }

    return metadata;
  }

  /**
   * Create a plugin instance
   */
  create(pluginId: string): StoryPlugin {
    const PluginConstructor = this.plugins.get(pluginId);

    if (!PluginConstructor) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }

    return new PluginConstructor();
  }

  /**
   * Check if a plugin is registered
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();
