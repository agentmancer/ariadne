/**
 * Role Adapter Registry
 * Manages registration and retrieval of role-based LLM adapters
 */

import { RoleLLMAdapter, RoleLLMAdapterConstructor } from './types';

/**
 * Registry for role-based LLM adapters
 * Allows plugins to register adapters for specific role combinations
 */
export class RoleAdapterRegistry {
  private adapters: Map<string, RoleLLMAdapterConstructor> = new Map();

  /**
   * Generate a registry key from plugin type and role
   */
  private getKey(pluginType: string, role: string): string {
    return `${pluginType}:${role}`;
  }

  /**
   * Register an adapter for a specific plugin type and role
   * @param pluginType The plugin type (e.g., 'twine', 'ink')
   * @param role The role (e.g., 'PLAYER', 'EDITOR', 'STORYTELLER')
   * @param adapterConstructor The adapter class constructor
   */
  register(
    pluginType: string,
    role: string,
    adapterConstructor: RoleLLMAdapterConstructor
  ): void {
    const key = this.getKey(pluginType, role);

    if (this.adapters.has(key)) {
      console.warn(`Role adapter for ${key} is already registered. Overwriting.`);
    }

    this.adapters.set(key, adapterConstructor);
  }

  /**
   * Unregister an adapter
   * @param pluginType The plugin type
   * @param role The role
   */
  unregister(pluginType: string, role: string): void {
    const key = this.getKey(pluginType, role);
    this.adapters.delete(key);
  }

  /**
   * Get an adapter instance for a plugin type and role
   * @param pluginType The plugin type
   * @param role The role
   * @returns A new adapter instance
   * @throws Error if no adapter is registered for the combination
   */
  getAdapter(pluginType: string, role: string): RoleLLMAdapter {
    const key = this.getKey(pluginType, role);
    const AdapterConstructor = this.adapters.get(key);

    if (!AdapterConstructor) {
      throw new Error(
        `No role adapter registered for plugin '${pluginType}' and role '${role}'. ` +
        `Available adapters: ${this.listRegistered().join(', ') || 'none'}`
      );
    }

    return new AdapterConstructor();
  }

  /**
   * Check if an adapter is registered
   * @param pluginType The plugin type
   * @param role The role
   */
  hasAdapter(pluginType: string, role: string): boolean {
    const key = this.getKey(pluginType, role);
    return this.adapters.has(key);
  }

  /**
   * List all registered adapter keys
   */
  listRegistered(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * List all roles registered for a specific plugin type
   * @param pluginType The plugin type
   */
  listRolesForPlugin(pluginType: string): string[] {
    const roles: string[] = [];
    for (const key of this.adapters.keys()) {
      if (key.startsWith(`${pluginType}:`)) {
        roles.push(key.split(':')[1]);
      }
    }
    return roles;
  }

  /**
   * List all plugin types that have registered adapters
   */
  listPluginTypes(): string[] {
    const pluginTypes = new Set<string>();
    for (const key of this.adapters.keys()) {
      pluginTypes.add(key.split(':')[0]);
    }
    return Array.from(pluginTypes);
  }

  /**
   * Clear all registered adapters
   */
  clear(): void {
    this.adapters.clear();
  }
}

// Singleton instance for application-wide use
export const roleAdapterRegistry = new RoleAdapterRegistry();
