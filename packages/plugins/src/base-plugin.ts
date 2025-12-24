/**
 * Base plugin class that provides common functionality
 * Concrete plugins can extend this to reduce boilerplate
 */

import {
  StoryPlugin,
  PluginMetadata,
  PluginConfig,
  PluginContext,
  StoryState,
  PluginEvent,
  PluginEventHandler
} from './types';

export abstract class BaseStoryPlugin implements StoryPlugin {
  protected config?: PluginConfig;
  protected context?: PluginContext;
  protected container?: HTMLElement;
  protected eventHandlers: Map<PluginEvent, Set<PluginEventHandler>> = new Map();
  protected currentState?: StoryState;

  /**
   * Plugin metadata - must be implemented by concrete plugins
   */
  abstract readonly metadata: PluginMetadata;

  /**
   * Initialize the plugin
   */
  async init(config: PluginConfig, context: PluginContext): Promise<void> {
    this.config = config;
    this.context = context;
    await this.onInit();
    this.emit(PluginEvent.INITIALIZED, { config, context });
  }

  /**
   * Hook for subclasses to override
   */
  protected async onInit(): Promise<void> {
    // Override in subclass
  }

  /**
   * Render the plugin UI
   */
  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    await this.onRender(container);
    this.emit(PluginEvent.RENDERED, { container });
  }

  /**
   * Hook for subclasses to implement
   */
  protected abstract onRender(container: HTMLElement): Promise<void>;

  /**
   * Clean up plugin resources
   */
  async destroy(): Promise<void> {
    await this.onDestroy();
    this.eventHandlers.clear();
    this.container = undefined;
    this.emit(PluginEvent.DESTROYED, {});
  }

  /**
   * Hook for subclasses to override
   */
  protected async onDestroy(): Promise<void> {
    // Override in subclass if cleanup needed
  }

  /**
   * Get current story state
   */
  async getState(): Promise<StoryState> {
    return this.currentState || this.createEmptyState();
  }

  /**
   * Set/restore story state
   */
  async setState(state: StoryState): Promise<void> {
    this.currentState = state;
    await this.onStateChanged(state);
    this.emit(PluginEvent.STATE_CHANGED, { state });
  }

  /**
   * Hook for subclasses to override
   */
  protected async onStateChanged(_state: StoryState): Promise<void> {
    // Override in subclass
  }

  /**
   * Create an empty state for this plugin
   */
  protected createEmptyState(): StoryState {
    return {
      pluginType: this.metadata.id,
      version: 1,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date()
      },
      content: {},
      history: []
    };
  }

  /**
   * Subscribe to plugin events
   */
  on(event: PluginEvent, handler: PluginEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from plugin events
   */
  off(event: PluginEvent, handler: PluginEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit a plugin event
   */
  protected emit(event: PluginEvent, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Execute a plugin command
   */
  async execute(command: string, _args?: unknown): Promise<unknown> {
    throw new Error(`Command ${command} not implemented by plugin ${this.metadata.id}`);
  }

  /**
   * Helper: Log an event via the API
   */
  protected async logEvent(type: string, data: Record<string, unknown>, category?: string): Promise<void> {
    if (!this.context) {
      console.warn('Cannot log event: plugin not initialized');
      return;
    }

    await this.context.api.logEvent({
      type,
      category: category || 'story',
      data,
      timestamp: new Date()
    });
  }

  /**
   * Helper: Save story state
   */
  protected async saveStory(): Promise<void> {
    if (!this.context) {
      throw new Error('Cannot save story: plugin not initialized');
    }

    const state = await this.getState();
    const { version } = await this.context.api.saveStory(state);

    this.currentState = {
      ...state,
      version
    };

    this.emit(PluginEvent.STORY_SAVED, { version });
  }

  /**
   * Helper: Load story state
   */
  protected async loadStory(version?: number): Promise<void> {
    if (!this.context) {
      throw new Error('Cannot load story: plugin not initialized');
    }

    const state = await this.context.api.loadStory(version) as StoryState;
    await this.setState(state);
    this.emit(PluginEvent.STORY_LOADED, { state });
  }
}
