/**
 * Dynamic Story Plugin for Ariadne Platform
 * Connects to the story server at localhost:5000 for synthetic execution
 */

import {
  StoryPlugin,
  PluginMetadata,
  PluginCapability,
  PluginConfig,
  PluginContext,
  PluginEvent,
  PluginEventHandler,
  PluginAction,
  PluginActionResult,
  StoryState,
} from '@ariadne/plugins';

const STORY_SERVER_URL = process.env.STORY_SERVER_URL || 'http://localhost:5000';

interface Choice {
  text: string;
  choice_type?: string;
  tags?: string[];
}

interface DynamicStoryState extends StoryState {
  sessionId: string;
  currentScene: string;
  choices: Choice[];
  actionCount: number;
  isComplete: boolean;
  metrics?: Record<string, unknown>;
}

interface SessionResponse {
  session_id: string;
  opening_scene: string;
  choices?: Choice[];
  config_used?: Record<string, unknown>;
  npcs_introduced?: string[];
  hooks_established?: string[];
  metrics?: Record<string, unknown>;
  error?: string;
}

interface ActionResponse {
  scene?: string;
  narrative?: string;
  choices?: Choice[];
  game_status?: string;
  world_changes?: unknown[];
  metrics?: { generation_time_ms?: number };
  error?: string;
}

export class DynamicStoryPlugin implements StoryPlugin {
  readonly metadata: PluginMetadata = {
    id: 'dynamic-story',
    name: 'Dynamic Story',
    version: '1.0.0',
    description: 'AI-powered dynamic narrative generation',
    capabilities: [
      PluginCapability.PLAY,
      PluginCapability.NAVIGATE,
      PluginCapability.AI_GENERATION,
    ],
  };

  private sessionId: string | null = null;
  private currentState: DynamicStoryState | null = null;
  private eventHandlers: Map<PluginEvent, Set<PluginEventHandler>> = new Map();

  async init(_config: PluginConfig, _context: PluginContext): Promise<void> {
    throw new Error('UI mode not implemented - use initHeadless for synthetic execution');
  }

  async render(_container: unknown): Promise<void> {
    throw new Error('UI rendering not implemented');
  }

  async destroy(): Promise<void> {
    this.sessionId = null;
    this.currentState = null;
    this.eventHandlers.clear();
  }

  async getState(): Promise<StoryState> {
    if (!this.currentState) {
      throw new Error('Plugin not initialized');
    }
    return this.currentState;
  }

  async setState(state: StoryState): Promise<void> {
    this.currentState = state as DynamicStoryState;
  }

  on(event: PluginEvent, handler: PluginEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: PluginEvent, handler: PluginEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  async execute(command: string, _args?: unknown): Promise<unknown> {
    throw new Error(`Command ${command} not implemented`);
  }

  // ============================================
  // HEADLESS MODE METHODS
  // ============================================

  async initHeadless(context: PluginContext): Promise<void> {
    // Get config from condition or task config (task config takes precedence)
    const conditionConfig = context.condition?.config as Record<string, string> | undefined;
    const taskConfig = context.taskConfig as Record<string, string> | undefined;
    const configId = taskConfig?.config_id || conditionConfig?.config_id || 'baseline_single';
    const storyTemplate = taskConfig?.storyTemplate || taskConfig?.story_template ||
                          conditionConfig?.story_template || 'jade_dragon_mystery';

    console.log(`[DynamicStory] Initializing headless session with config=${configId}, template=${storyTemplate}`);

    try {
      // Create session via story server API
      const response = await fetch(`${STORY_SERVER_URL}/api/playthrough/configured`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: configId,
          story_template: storyTemplate,
          session_id: `ariadne-${context.actor.id}-${Date.now()}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(`Failed to create session: ${errorData.error || response.statusText}`);
      }

      const data = await response.json() as SessionResponse;

      this.sessionId = data.session_id;
      this.currentState = {
        pluginType: 'dynamic-story',
        version: 1,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sessionId: data.session_id,
        currentScene: data.opening_scene,
        choices: data.choices || [],
        actionCount: 0,
        isComplete: false,
        content: {
          configUsed: data.config_used,
          npcsIntroduced: data.npcs_introduced,
          hooksEstablished: data.hooks_established,
        },
        metrics: data.metrics,
      };

      console.log(`[DynamicStory] Session created: ${this.sessionId} with ${this.currentState.choices.length} choices`);

      this.emit(PluginEvent.INITIALIZED, { sessionId: this.sessionId });
    } catch (err) {
      const error = err as Error;
      console.error('[DynamicStory] Failed to initialize:', error.message);
      throw error;
    }
  }

  async executeHeadless(action: PluginAction): Promise<PluginActionResult> {
    if (!this.sessionId || !this.currentState) {
      throw new Error('Plugin not initialized - call initHeadless first');
    }

    try {
      // Map action to story server format
      const params = action.params as { choiceIndex?: number; choiceText?: string };
      const choiceIndex = params.choiceIndex ?? 0;
      const choiceText = params.choiceText ??
        this.currentState.choices[choiceIndex]?.text ?? 'Continue';

      console.log(`[DynamicStory] Executing action: ${choiceText}`);

      const response = await fetch(`${STORY_SERVER_URL}/api/playthrough/${this.sessionId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choice_id: choiceIndex,
          action_text: choiceText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        return {
          success: false,
          newState: this.currentState,
          error: errorData.error || response.statusText,
        };
      }

      const data = await response.json() as ActionResponse;

      // Check for story completion
      const isComplete = data.game_status === 'victory' ||
                        data.game_status === 'defeat' ||
                        data.game_status === 'complete' ||
                        !data.choices?.length;

      // Update state
      this.currentState = {
        ...this.currentState,
        currentScene: data.scene || data.narrative || '',
        choices: data.choices || [],
        actionCount: this.currentState.actionCount + 1,
        isComplete,
        metadata: {
          ...this.currentState.metadata,
          updatedAt: new Date(),
        },
        custom: {
          ...this.currentState.custom,
          lastAction: choiceText,
          gameStatus: data.game_status,
          worldChanges: data.world_changes,
        },
      };

      this.emit(PluginEvent.STATE_CHANGED, { action, result: data });

      return {
        success: true,
        newState: this.currentState,
        metadata: {
          generationTimeMs: data.metrics?.generation_time_ms,
          gameStatus: data.game_status,
        },
      };
    } catch (err) {
      const error = err as Error;
      console.error('[DynamicStory] Action execution failed:', error.message);
      return {
        success: false,
        newState: this.currentState,
        error: error.message,
      };
    }
  }

  isComplete(): boolean {
    return this.currentState?.isComplete ?? false;
  }

  async getAvailableActions(): Promise<PluginAction[]> {
    if (!this.currentState) {
      return [];
    }

    return this.currentState.choices.map((choice, index) => ({
      type: 'MAKE_CHOICE',
      params: {
        choiceIndex: index,
        choiceText: choice.text,
        choiceType: choice.choice_type,
        tags: choice.tags,
      },
      metadata: {
        description: choice.text,
      },
    }));
  }

  private emit(event: PluginEvent, data: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }
}

// Export for plugin registration
export default DynamicStoryPlugin;
