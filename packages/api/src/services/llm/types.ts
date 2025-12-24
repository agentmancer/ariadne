/**
 * LLM Integration Types
 * Defines interfaces for LLM adapters and role-based action generation
 */

import { PluginAction, StoryState } from '@ariadne/plugins';

// ============================================
// LLM ADAPTER INTERFACE
// ============================================

/**
 * Configuration for an LLM provider
 */
export interface LLMConfig {
  /** Provider name (e.g., 'openai', 'anthropic', 'bedrock') */
  provider: string;
  /** Model identifier */
  model: string;
  /** API key (if required) */
  apiKey?: string;
  /** Base URL for API (for custom endpoints) */
  baseUrl?: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * A message in a conversation
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Response from an LLM completion
 */
export interface LLMResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Model used for generation */
  model: string;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  /** Raw response from provider (for debugging) */
  raw?: unknown;
}

/**
 * Interface for LLM provider adapters
 */
export interface LLMAdapter {
  /** Provider identifier */
  readonly provider: string;

  /**
   * Generate a completion from a prompt
   * @param prompt The prompt text
   * @param config Optional per-request configuration
   */
  generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse>;

  /**
   * Generate a completion from a conversation
   * @param messages The conversation history
   * @param config Optional per-request configuration
   */
  generateChat(messages: LLMMessage[], config?: Partial<LLMConfig>): Promise<LLMResponse>;

  /**
   * Check if the adapter is properly configured and ready
   */
  isConfigured(): boolean;
}

// ============================================
// ROLE ADAPTER INTERFACE
// ============================================

/**
 * Context provided to role adapters for action generation
 */
export interface RoleContext {
  /** Current story state */
  state: StoryState;
  /** Role being played */
  role: string;
  /** Available actions at current state */
  availableActions?: PluginAction[];
  /** History of previous actions (for context) */
  actionHistory?: PluginAction[];
  /** Study/condition configuration */
  config?: Record<string, unknown>;
  /** Partner's state (for collaborative scenarios) */
  partnerState?: StoryState;
}

/**
 * Interface for role-based LLM adapters
 * Each role (PLAYER, EDITOR, STORYTELLER, etc.) has a specific adapter
 * that knows how to generate appropriate actions for that role
 */
export interface RoleLLMAdapter {
  /** Plugin type this adapter works with */
  readonly pluginType: string;
  /** Role this adapter handles */
  readonly role: string;

  /**
   * Generate an action based on the current state and role
   * @param llm The LLM adapter to use for generation
   * @param context Context including state and role information
   */
  generateAction(llm: LLMAdapter, context: RoleContext): Promise<PluginAction>;

  /**
   * Get the system prompt for this role
   */
  getSystemPrompt(): string;

  /**
   * Build a user prompt from the current context
   * @param context The role context
   */
  buildUserPrompt(context: RoleContext): string;

  /**
   * Parse an LLM response into a plugin action
   * @param response The raw LLM response
   * @param context The role context for validation
   */
  parseResponse(response: LLMResponse, context: RoleContext): PluginAction;
}

/**
 * Constructor type for role adapters
 */
export type RoleLLMAdapterConstructor = new () => RoleLLMAdapter;

// ============================================
// STRATEGY TYPES (for agent definitions)
// ============================================

/**
 * Agent strategy types that affect action generation behavior
 */
export type AgentStrategy =
  | 'exploratory'      // Tries to explore all branches/options
  | 'goal_driven'      // Focused on completing specific goals
  | 'curious'          // Asks questions, seeks information
  | 'random'           // Makes random choices (for baseline)
  | 'optimal';         // Attempts to find optimal path

/**
 * Strategy configuration that modifies adapter behavior
 */
export interface StrategyConfig {
  strategy: AgentStrategy;
  /** Maximum actions before stopping */
  maxActions?: number;
  /** Goals to achieve (for goal_driven strategy) */
  goals?: string[];
  /** Exploration parameters (for exploratory strategy) */
  explorationParams?: {
    noveltyWeight: number;
    revisitPenalty: number;
  };
}
