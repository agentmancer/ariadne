/**
 * Plugin system types and interfaces for Ariadne Platform
 * Allows different story authoring platforms (Twine, AI generators, etc.) to be integrated
 */

import { EventData } from '@ariadne/shared';

// ============================================
// PLUGIN INTERFACE
// ============================================

/**
 * Base plugin interface that all story platform plugins must implement
 */
export interface StoryPlugin {
  /**
   * Plugin metadata
   */
  readonly metadata: PluginMetadata;

  /**
   * Initialize the plugin with configuration
   * @param config Plugin-specific configuration
   * @param context Runtime context (participant info, study config, etc.)
   */
  init(config: PluginConfig, context: PluginContext): Promise<void>;

  /**
   * Render the plugin UI into a container element
   * @param container DOM element to render into
   */
  render(container: HTMLElement): Promise<void>;

  /**
   * Clean up plugin resources
   */
  destroy(): Promise<void>;

  /**
   * Get current state of the story/narrative
   */
  getState(): Promise<StoryState>;

  /**
   * Set/restore state (for loading saved stories)
   */
  setState(state: StoryState): Promise<void>;

  /**
   * Subscribe to plugin events
   */
  on(event: PluginEvent, handler: PluginEventHandler): void;

  /**
   * Unsubscribe from plugin events
   */
  off(event: PluginEvent, handler: PluginEventHandler): void;

  /**
   * Execute a plugin-specific command
   */
  execute(command: string, args?: unknown): Promise<unknown>;

  // ============================================
  // HEADLESS MODE METHODS (for synthetic actors)
  // ============================================

  /**
   * Initialize the plugin in headless mode (no UI rendering)
   * Used for synthetic actor execution
   * @param context Runtime context with actor information
   */
  initHeadless?(context: PluginContext): Promise<void>;

  /**
   * Execute an action in headless mode
   * @param action The action to execute
   * @returns Result of the action including new state
   */
  executeHeadless?(action: PluginAction): Promise<PluginActionResult>;

  /**
   * Check if the story/task is complete
   * @returns true if no more actions are possible or goal is reached
   */
  isComplete?(): boolean;

  /**
   * Get available actions at current state
   * @returns List of possible actions the actor can take
   */
  getAvailableActions?(): Promise<PluginAction[]>;
}

// ============================================
// HEADLESS ACTION TYPES
// ============================================

/**
 * An action that can be executed in headless mode
 */
export interface PluginAction {
  /**
   * Action type (e.g., 'CREATE_PASSAGE', 'MAKE_CHOICE', 'ADD_COMMENT')
   */
  type: string;

  /**
   * Action parameters
   */
  params: Record<string, unknown>;

  /**
   * Optional metadata about the action
   */
  metadata?: {
    /** Human-readable description */
    description?: string;
    /** Priority/relevance score */
    score?: number;
  };
}

/**
 * Result of executing a headless action
 */
export interface PluginActionResult {
  /**
   * Whether the action succeeded
   */
  success: boolean;

  /**
   * New state after action execution
   */
  newState: StoryState;

  /**
   * Error message if action failed
   */
  error?: string;

  /**
   * Additional metadata about the action result
   */
  metadata?: Record<string, unknown>;
}

// ============================================
// PLUGIN METADATA
// ============================================

export interface PluginMetadata {
  /**
   * Unique plugin identifier
   */
  id: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Brief description
   */
  description: string;

  /**
   * Plugin author
   */
  author?: string;

  /**
   * Plugin capabilities
   */
  capabilities: PluginCapability[];

  /**
   * Configuration schema (for validation)
   */
  configSchema?: unknown; // Could be Zod schema or JSON schema
}

export enum PluginCapability {
  // Authoring capabilities
  CREATE = 'create',           // Can create new stories
  EDIT = 'edit',               // Can edit existing stories
  DELETE = 'delete',           // Can delete content

  // Playback capabilities
  PLAY = 'play',               // Can play/experience stories
  NAVIGATE = 'navigate',       // Supports navigation between passages/scenes

  // Collaboration
  REAL_TIME_COLLAB = 'real_time_collab',  // Supports real-time collaboration
  COMMENTING = 'commenting',              // Supports commenting on content

  // AI features
  AI_GENERATION = 'ai_generation',        // Can generate content via AI
  AI_SUGGESTION = 'ai_suggestion',        // Can provide AI suggestions

  // Export/Import
  EXPORT = 'export',           // Can export stories
  IMPORT = 'import',           // Can import stories

  // Versioning
  VERSION_HISTORY = 'version_history',    // Tracks version history

  // Orchestration capabilities (RFC-002: module-symbiote)
  ORCHESTRATION = 'orchestration',        // Software orchestration experiments
  CI_INTEGRATION = 'ci_integration',      // CI/CD pipeline integration
  CODE_REVIEW = 'code_review',            // Code review workflow support
  AGENT_LIFECYCLE = 'agent_lifecycle',    // Agent provisioning and cleanup
  METRICS_COLLECTION = 'metrics_collection' // Experiment metrics collection
}

// ============================================
// PLUGIN CONFIGURATION
// ============================================

export interface PluginConfig {
  /**
   * Mode: authoring or playing
   */
  mode: 'author' | 'play';

  /**
   * Read-only mode (for viewing only)
   */
  readOnly?: boolean;

  /**
   * Auto-save interval (ms), 0 to disable
   */
  autoSaveInterval?: number;

  /**
   * AI configuration (if plugin supports AI)
   */
  ai?: {
    enabled: boolean;
    model?: string;
    apiKey?: string;
    prompt?: string;
  };

  /**
   * UI customization
   */
  ui?: {
    theme?: 'light' | 'dark';
    toolbar?: boolean;
    helpText?: boolean;
  };

  /**
   * Plugin-specific configuration
   */
  custom?: Record<string, unknown>;
}

// ============================================
// PLUGIN CONTEXT
// ============================================

/**
 * Actor type - whether this is a human participant or synthetic actor
 */
export type ActorType = 'HUMAN' | 'SYNTHETIC';

/**
 * Actor information (participant or synthetic)
 */
export interface ActorInfo {
  id: string;
  uniqueId: string;
  /** Actor type */
  type?: ActorType;
  /** Role for synthetic actors (e.g., 'PLAYER', 'EDITOR', 'STORYTELLER') */
  role?: string;
}

export interface PluginContext {
  /**
   * Study information
   */
  study: {
    id: string;
    name: string;
    type: string;
  };

  /**
   * Actor information (renamed from participant for clarity)
   * Represents either a human participant or synthetic actor
   */
  actor: ActorInfo;

  /**
   * @deprecated Use 'actor' instead. Kept for backwards compatibility.
   */
  participant?: {
    id: string;
    uniqueId: string;
  };

  /**
   * Actor type - whether this is a human or synthetic execution
   */
  actorType: ActorType;

  /**
   * Role for synthetic actors (e.g., 'PLAYER', 'EDITOR', 'STORYTELLER')
   * Determines which LLM adapter to use
   */
  role?: string;

  /**
   * Partner information (for collaborative studies)
   */
  partner?: ActorInfo;

  /**
   * Collaboration mode for multi-actor studies
   */
  collaborationMode?: 'REAL_TIME' | 'ASYNC';

  /**
   * Whether running in headless mode (no UI)
   */
  headless: boolean;

  /**
   * Session information
   */
  session?: {
    id: string;
    startTime: Date;
  };

  /**
   * Condition information (experimental condition)
   */
  condition?: {
    id: string;
    name: string;
    config?: Record<string, unknown>;
  };

  /**
   * Trial information (parameter sweep experiments - RFC-002)
   * Contains the specific parameter configuration for this trial
   */
  trial?: {
    id: string;
    name?: string;
    parameters: Record<string, unknown>;
  };

  /**
   * Task-specific configuration passed from job queue
   * Used by synthetic execution workers for runtime settings
   */
  taskConfig?: Record<string, unknown>;

  /**
   * API client for logging events and saving data
   */
  api: PluginApiClient;
}

// ============================================
// PLUGIN API CLIENT
// ============================================

export interface PluginApiClient {
  /**
   * Log an event
   */
  logEvent(event: EventData): Promise<void>;

  /**
   * Save story data
   */
  saveStory(data: unknown): Promise<{ version: number }>;

  /**
   * Load story data
   */
  loadStory(version?: number): Promise<unknown>;

  /**
   * Load partner's story (for collaborative studies)
   */
  loadPartnerStory(version?: number): Promise<unknown>;
}

// ============================================
// PLUGIN EVENTS
// ============================================

export enum PluginEvent {
  // Lifecycle events
  INITIALIZED = 'initialized',
  RENDERED = 'rendered',
  DESTROYED = 'destroyed',

  // State changes
  STATE_CHANGED = 'state_changed',
  STORY_LOADED = 'story_loaded',
  STORY_SAVED = 'story_saved',

  // User interactions
  PASSAGE_CHANGED = 'passage_changed',
  CONTENT_EDITED = 'content_edited',
  LINK_CREATED = 'link_created',
  LINK_DELETED = 'link_deleted',

  // Navigation
  NAVIGATE_FORWARD = 'navigate_forward',
  NAVIGATE_BACKWARD = 'navigate_backward',
  NAVIGATE_TO = 'navigate_to',

  // AI events
  AI_GENERATION_START = 'ai_generation_start',
  AI_GENERATION_COMPLETE = 'ai_generation_complete',
  AI_GENERATION_ERROR = 'ai_generation_error',

  // Collaboration
  COMMENT_ADDED = 'comment_added',
  PARTNER_ACTION = 'partner_action',

  // Errors
  ERROR = 'error'
}

export type PluginEventHandler = (data: unknown) => void;

// ============================================
// STORY STATE
// ============================================

/**
 * Generic story state structure
 * Each plugin can extend this with plugin-specific fields
 */
export interface StoryState {
  /**
   * Plugin type
   */
  pluginType: string;

  /**
   * Story version
   */
  version: number;

  /**
   * Story metadata
   */
  metadata: {
    name?: string;
    author?: string;
    createdAt: Date;
    updatedAt: Date;
  };

  /**
   * Current location in the story (if applicable)
   */
  currentLocation?: string;

  /**
   * Navigation history
   */
  history?: string[];

  /**
   * Story content (plugin-specific format)
   */
  content: unknown;

  /**
   * Custom plugin data
   */
  custom?: Record<string, unknown>;
}

// ============================================
// PLUGIN REGISTRY
// ============================================

// Note: Plugin-specific types (TwineStoryState, AIGeneratorStoryState, etc.)
// should be defined in their respective module packages.
// Example: @ariadne/module-twine exports TwineStoryState, TwinePassage

export interface IPluginRegistry {
  /**
   * Register a plugin
   */
  register(plugin: StoryPluginConstructor): void;

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): void;

  /**
   * Get a plugin by ID
   */
  get(pluginId: string): StoryPluginConstructor | undefined;

  /**
   * List all registered plugins
   */
  list(): PluginMetadata[];

  /**
   * Create a plugin instance
   */
  create(pluginId: string): StoryPlugin;
}

export type StoryPluginConstructor = new () => StoryPlugin;
