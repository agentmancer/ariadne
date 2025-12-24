/**
 * Base Role Adapter
 * Provides common functionality for role-based LLM adapters
 */

import { PluginAction } from '@ariadne/plugins';
import {
  RoleLLMAdapter,
  LLMAdapter,
  LLMResponse,
  RoleContext,
} from '../types';

/**
 * Abstract base class for role adapters
 * Provides common implementation patterns
 */
export abstract class BaseRoleAdapter implements RoleLLMAdapter {
  abstract readonly pluginType: string;
  abstract readonly role: string;

  /**
   * Generate an action using the LLM
   */
  async generateAction(llm: LLMAdapter, context: RoleContext): Promise<PluginAction> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    const response = await llm.generateChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this.parseResponse(response, context);
  }

  /**
   * Get the system prompt - must be implemented by subclasses
   */
  abstract getSystemPrompt(): string;

  /**
   * Build user prompt - must be implemented by subclasses
   */
  abstract buildUserPrompt(context: RoleContext): string;

  /**
   * Parse LLM response into action - must be implemented by subclasses
   */
  abstract parseResponse(response: LLMResponse, context: RoleContext): PluginAction;

  /**
   * Helper: Extract JSON from LLM response that may contain markdown code blocks
   */
  protected extractJSON<T>(text: string): T | null {
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Clean and normalize text content
   */
  protected cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  /**
   * Helper: Truncate state for prompt to avoid context length issues
   */
  protected truncateStateForPrompt(state: unknown, maxLength: number = 4000): string {
    const stateStr = JSON.stringify(state, null, 2);
    if (stateStr.length <= maxLength) {
      return stateStr;
    }
    return stateStr.substring(0, maxLength) + '\n... (truncated)';
  }

  /**
   * Helper: Format available actions for prompt
   */
  protected formatAvailableActions(actions?: PluginAction[]): string {
    if (!actions || actions.length === 0) {
      return 'No specific actions available - use your judgment.';
    }

    return actions
      .map((action, i) => {
        const desc = action.metadata?.description || action.type;
        return `${i + 1}. ${action.type}: ${desc}`;
      })
      .join('\n');
  }
}
