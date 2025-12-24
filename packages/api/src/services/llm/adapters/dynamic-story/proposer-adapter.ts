/**
 * Dynamic Story PROPOSER Role Adapter (Team Mode)
 * Proposes actions with reasoning for partner critique
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
 * Parsed response structure for proposals
 */
interface ProposerResponse {
  choiceIndex: number;
  reasoning: string;
  considerations: string[];
}

/**
 * PROPOSER role adapter for Dynamic Story Team Mode
 * Proposes an action with detailed reasoning for the critic to evaluate
 */
export class DynamicStoryProposerAdapter extends BaseRoleAdapter {
  readonly pluginType = 'dynamic-story';
  readonly role = 'PROPOSER';

  getSystemPrompt(): string {
    return `You are playing an interactive mystery story as part of a team. Your role is to PROPOSE actions for your team to consider.

Your proposal will be reviewed by your partner before a final decision is made. Therefore, you should:
1. Carefully analyze the current situation and available choices
2. Propose the action you think is best
3. Provide clear, detailed reasoning so your partner can evaluate your choice
4. List key considerations that informed your decision

Guidelines for proposals:
- Focus on advancing the mystery investigation
- Consider both immediate effects and longer-term narrative implications
- Highlight any risks or uncertainties in your reasoning
- Be open to your partner suggesting a different approach

Respond with a JSON object:
{
  "choiceIndex": <number from 0 to N-1>,
  "reasoning": "Detailed explanation of why this is the best choice",
  "considerations": ["Key point 1", "Key point 2", "..."]
}

IMPORTANT: choiceIndex must be a valid index from the available choices (0-indexed).`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as unknown as DynamicStoryState;

    let prompt = '=== YOUR TURN TO PROPOSE ===\n\n';

    // Add scene context
    if (state.currentScene) {
      prompt += `CURRENT SCENE:\n${state.currentScene}\n\n`;
    }

    // Add story context if available
    if (state.content?.npcsIntroduced && state.content.npcsIntroduced.length > 0) {
      prompt += `Characters met: ${state.content.npcsIntroduced.join(', ')}\n`;
    }

    if (state.custom?.lastAction) {
      prompt += `Last action taken: ${state.custom.lastAction}\n`;
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
    }

    prompt += `\nAnalyze these options and propose the best choice with your reasoning.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, context: RoleContext): PluginAction {
    const availableActions = context.availableActions || [];

    // Try to parse JSON response
    const parsed = this.extractJSON<ProposerResponse>(response.content);

    if (parsed && typeof parsed.choiceIndex === 'number') {
      if (parsed.choiceIndex >= 0 && parsed.choiceIndex < availableActions.length) {
        const chosenAction = availableActions[parsed.choiceIndex];
        return {
          ...chosenAction,
          params: {
            ...chosenAction.params,
            _proposerReasoning: parsed.reasoning,
            _proposerConsiderations: parsed.considerations,
            _proposerChoiceIndex: parsed.choiceIndex,
          },
        };
      }
    }

    // Fallback: try to extract a number
    const numberMatch = response.content.match(/\b(\d+)\b/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10);
      if (index >= 0 && index < availableActions.length) {
        return {
          ...availableActions[index],
          params: {
            ...availableActions[index].params,
            _proposerReasoning: response.content,
            _proposerChoiceIndex: index,
          },
        };
      }
    }

    // Last resort: pick first action
    if (availableActions.length > 0) {
      return {
        ...availableActions[0],
        params: {
          ...availableActions[0].params,
          _proposerReasoning: 'Fallback proposal',
          _proposerChoiceIndex: 0,
        },
      };
    }

    return {
      type: 'MAKE_CHOICE',
      params: {
        choiceIndex: 0,
        choiceText: 'Continue',
        _proposerError: 'No available actions',
      },
      metadata: {
        description: 'No actions available',
      },
    };
  }
}
