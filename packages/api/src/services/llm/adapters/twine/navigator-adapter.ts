/**
 * Twine NAVIGATOR Role Adapter
 * Plays through existing Twine stories by making navigation choices
 *
 * This adapter is for PLAYING existing stories, not creating them.
 * It reads the current passage and available choices, then decides which choice to make.
 */

import { PluginAction } from '@ariadne/plugins';
import { TwineStoryState, TwinePassage, TwineActionType } from '@ariadne/module-twine';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * Parsed response structure for navigation choices
 */
interface NavigatorResponse {
  choiceIndex: number;
  reasoning?: string;
}

/**
 * NAVIGATOR role adapter for Twine
 * Plays through existing stories by making choices at each branch point
 */
export class TwineNavigatorAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'NAVIGATOR';

  getSystemPrompt(): string {
    return `You are playing through an interactive fiction story. Your goal is to explore the narrative by making meaningful choices.

When presented with a passage and choices, you should:
1. Read and understand the current situation
2. Consider the available options and their potential consequences
3. Make a choice that feels narratively interesting or appropriate for the character
4. Explain your reasoning briefly

Guidelines for making choices:
- Stay in character if one is established
- Make choices that advance the story meaningfully
- Balance exploration with narrative consistency
- Consider the emotional and dramatic weight of choices

Respond with a JSON object:
{
  "choiceIndex": <number from 0 to N-1>,
  "reasoning": "Brief explanation of why you made this choice"
}

IMPORTANT: choiceIndex must be a valid index from the available choices (0-indexed).`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as TwineStoryState;
    const passages = state.content?.passages || [];

    // Find current passage
    const currentPassageId = state.currentLocation;
    const currentPassage = passages.find((p: TwinePassage) =>
      p.id === currentPassageId || p.name === currentPassageId
    );

    let prompt = '';

    // Add story context from history
    if (state.history && state.history.length > 0) {
      const recentHistory = state.history.slice(-3);
      const historyPassages = recentHistory
        .map(id => passages.find((p: TwinePassage) => p.id === id || p.name === id))
        .filter(Boolean) as TwinePassage[];

      if (historyPassages.length > 0) {
        prompt += `Recent story history:\n`;
        historyPassages.forEach((p) => {
          prompt += `---\n${p.text.substring(0, 300)}${p.text.length > 300 ? '...' : ''}\n`;
        });
        prompt += '\n';
      }
    }

    // Add current passage
    if (currentPassage) {
      prompt += `CURRENT PASSAGE: "${currentPassage.name}"\n\n`;
      prompt += `${currentPassage.text}\n\n`;
    } else if (!currentPassageId && state.content?.startPassage) {
      // Need to navigate to start
      const startPassage = passages.find((p: TwinePassage) => p.name === state.content?.startPassage);
      if (startPassage) {
        prompt += `STARTING PASSAGE: "${startPassage.name}"\n\n`;
        prompt += `${startPassage.text}\n\n`;
      }
    }

    // Add available choices
    if (context.availableActions && context.availableActions.length > 0) {
      prompt += `AVAILABLE CHOICES:\n`;
      context.availableActions.forEach((action, index) => {
        const choiceText = action.params?.choiceText || action.metadata?.description || `Choice ${index + 1}`;
        prompt += `${index}. ${choiceText}\n`;
      });
    } else {
      prompt += `No choices available - this may be an ending or dead end.\n`;
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
          // Store LLM-specific data in params for logging
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

    // No actions available - this shouldn't happen in normal play
    return {
      type: TwineActionType.NAVIGATE_TO,
      params: {
        passageName: 'Start',
        _llmError: 'No available actions to choose from',
      },
      metadata: {
        description: 'No actions available, attempting to navigate to Start',
      },
    };
  }
}
