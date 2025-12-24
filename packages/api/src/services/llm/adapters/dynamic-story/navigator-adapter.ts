/**
 * Dynamic Story NAVIGATOR Role Adapter
 * Plays through dynamic AI-generated stories by making navigation choices
 */

import { PluginAction } from '@ariadne/plugins';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * State structure from DynamicStoryPlugin
 */
interface DynamicStoryState {
  pluginType: string;
  sessionId: string;
  currentScene: string;
  choices: Array<{
    text: string;
    choice_type?: string;
    tags?: string[];
  }>;
  actionCount: number;
  isComplete: boolean;
  content?: {
    configUsed?: Record<string, unknown>;
    npcsIntroduced?: string[];
    hooksEstablished?: string[];
  };
  custom?: {
    lastAction?: string;
    gameStatus?: string;
    worldChanges?: unknown[];
  };
}

/**
 * Parsed response structure for navigation choices
 */
interface NavigatorResponse {
  choiceIndex: number;
  reasoning?: string;
}

/**
 * NAVIGATOR role adapter for Dynamic Story
 * Plays through AI-generated stories by making choices
 */
export class DynamicStoryNavigatorAdapter extends BaseRoleAdapter {
  readonly pluginType = 'dynamic-story';
  readonly role = 'NAVIGATOR';

  getSystemPrompt(): string {
    return `You are playing through an AI-generated interactive mystery story. Your goal is to explore the narrative by making meaningful choices that advance the investigation.

When presented with a scene and choices, you should:
1. Read and understand the current situation
2. Consider the available options and their potential consequences
3. Make a choice that feels narratively interesting or advances the mystery
4. Explain your reasoning briefly

Guidelines for making choices:
- Stay focused on investigating the mystery
- Gather clues and talk to NPCs when opportunities arise
- Make choices that balance exploration with narrative progress
- Consider the emotional and dramatic weight of choices
- Try to uncover the truth behind the mystery

Respond with a JSON object:
{
  "choiceIndex": <number from 0 to N-1>,
  "reasoning": "Brief explanation of why you made this choice"
}

IMPORTANT: choiceIndex must be a valid index from the available choices (0-indexed).`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as unknown as DynamicStoryState;

    let prompt = '';

    // Add scene context
    if (state.currentScene) {
      prompt += `CURRENT SCENE:\n${state.currentScene}\n\n`;
    }

    // Add story context if available
    if (state.content?.npcsIntroduced && state.content.npcsIntroduced.length > 0) {
      prompt += `Characters met: ${state.content.npcsIntroduced.join(', ')}\n`;
    }

    if (state.custom?.lastAction) {
      prompt += `Your last action: ${state.custom.lastAction}\n`;
    }

    if (state.custom?.gameStatus) {
      prompt += `Current status: ${state.custom.gameStatus}\n`;
    }

    prompt += `\nActions taken so far: ${state.actionCount}\n\n`;

    // Add available choices
    if (context.availableActions && context.availableActions.length > 0) {
      prompt += `AVAILABLE CHOICES:\n`;
      context.availableActions.forEach((action, index) => {
        const choiceText = action.params?.choiceText || action.metadata?.description || `Choice ${index + 1}`;
        const choiceType = action.params?.choiceType ? ` [${action.params.choiceType}]` : '';
        prompt += `${index}. ${choiceText}${choiceType}\n`;
      });
    } else {
      prompt += `No choices available - this may be an ending.\n`;
    }

    prompt += `\nRespond with JSON only. Choose one of the available options by its index number.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, context: RoleContext): PluginAction {
    const availableActions = context.availableActions || [];

    // Try to parse JSON response
    const parsed = this.extractJSON<NavigatorResponse>(response.content);

    if (parsed && typeof parsed.choiceIndex === 'number') {
      // Validate the choice index
      if (parsed.choiceIndex >= 0 && parsed.choiceIndex < availableActions.length) {
        // Return the actual action from available actions
        const chosenAction = availableActions[parsed.choiceIndex];
        return {
          ...chosenAction,
          params: {
            ...chosenAction.params,
            _llmReasoning: parsed.reasoning,
            _llmChoiceIndex: parsed.choiceIndex,
          },
        };
      }
    }

    // Fallback: try to extract a number from the response
    const numberMatch = response.content.match(/\b(\d+)\b/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10);
      if (index >= 0 && index < availableActions.length) {
        return {
          ...availableActions[index],
          params: {
            ...availableActions[index].params,
            _llmReasoning: 'Extracted from response',
            _llmChoiceIndex: index,
          },
        };
      }
    }

    // Last resort: pick the first available action
    if (availableActions.length > 0) {
      return {
        ...availableActions[0],
        params: {
          ...availableActions[0].params,
          _llmReasoning: 'Fallback to first choice',
          _llmChoiceIndex: 0,
        },
      };
    }

    // No actions available - return a continue action
    return {
      type: 'MAKE_CHOICE',
      params: {
        choiceIndex: 0,
        choiceText: 'Continue',
        _llmError: 'No available actions to choose from',
      },
      metadata: {
        description: 'No actions available, attempting to continue',
      },
    };
  }
}
