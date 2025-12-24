/**
 * Dynamic Story CRITIC Role Adapter (Team Mode)
 * Critiques partner's proposal and may suggest revisions
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
  // Team mode additions
  _proposal?: {
    choiceIndex: number;
    choiceText: string;
    reasoning: string;
    considerations?: string[];
  };
}

/**
 * Parsed response structure for critiques
 */
interface CriticResponse {
  decision: 'APPROVE' | 'SUGGEST_REVISION';
  feedback: string;
  suggestedChoiceIndex?: number;
  suggestedReasoning?: string;
  strengthsOfProposal?: string[];
  concernsWithProposal?: string[];
}

/**
 * CRITIC role adapter for Dynamic Story Team Mode
 * Evaluates partner's proposal and provides constructive feedback
 */
export class DynamicStoryCriticAdapter extends BaseRoleAdapter {
  readonly pluginType = 'dynamic-story';
  readonly role = 'CRITIC';

  getSystemPrompt(): string {
    return `You are playing an interactive mystery story as part of a team. Your role is to CRITIQUE your partner's proposed action.

Your partner has analyzed the situation and proposed a choice. You should:
1. Consider whether their reasoning is sound
2. Look for factors they may have overlooked
3. Either APPROVE their choice or SUGGEST a revision

When evaluating:
- Consider narrative engagement and mystery advancement
- Look for missed opportunities or potential risks
- Be constructive and specific in your feedback
- Only suggest revision if you have a clearly better alternative

Respond with a JSON object:
{
  "decision": "APPROVE" or "SUGGEST_REVISION",
  "feedback": "Your evaluation of the proposal",
  "strengthsOfProposal": ["What was good about their reasoning"],
  "concernsWithProposal": ["Any issues or missed considerations"],
  "suggestedChoiceIndex": <only if SUGGEST_REVISION - the better choice index>,
  "suggestedReasoning": "<only if SUGGEST_REVISION - why your suggestion is better>"
}

IMPORTANT:
- If you APPROVE, your partner's choice will be executed
- If you SUGGEST_REVISION, your partner will reconsider with your feedback`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as unknown as DynamicStoryState;

    let prompt = '=== CRITIQUE YOUR PARTNER\'S PROPOSAL ===\n\n';

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

    // Add the proposal to critique
    if (state._proposal) {
      prompt += `\n=== PARTNER'S PROPOSAL ===\n`;
      prompt += `Proposed choice: ${state._proposal.choiceIndex}. ${state._proposal.choiceText}\n`;
      prompt += `Reasoning: ${state._proposal.reasoning}\n`;
      if (state._proposal.considerations && state._proposal.considerations.length > 0) {
        prompt += `Considerations:\n`;
        state._proposal.considerations.forEach(c => {
          prompt += `  - ${c}\n`;
        });
      }
    }

    prompt += `\nEvaluate this proposal and decide whether to APPROVE or SUGGEST_REVISION.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, context: RoleContext): PluginAction {
    const state = context.state as unknown as DynamicStoryState;
    const availableActions = context.availableActions || [];

    // Try to parse JSON response
    const parsed = this.extractJSON<CriticResponse>(response.content);

    if (parsed) {
      const isApproved = parsed.decision === 'APPROVE';

      // Determine which choice to return
      let finalChoiceIndex: number;
      if (isApproved && state._proposal) {
        finalChoiceIndex = state._proposal.choiceIndex;
      } else if (!isApproved && typeof parsed.suggestedChoiceIndex === 'number') {
        finalChoiceIndex = parsed.suggestedChoiceIndex;
      } else if (state._proposal) {
        finalChoiceIndex = state._proposal.choiceIndex;
      } else {
        finalChoiceIndex = 0;
      }

      // Validate the choice index
      if (finalChoiceIndex >= 0 && finalChoiceIndex < availableActions.length) {
        const chosenAction = availableActions[finalChoiceIndex];
        return {
          ...chosenAction,
          params: {
            ...chosenAction.params,
            _criticDecision: parsed.decision,
            _criticFeedback: parsed.feedback,
            _criticStrengths: parsed.strengthsOfProposal,
            _criticConcerns: parsed.concernsWithProposal,
            _finalChoiceIndex: finalChoiceIndex,
            _wasRevised: !isApproved,
            _suggestedReasoning: parsed.suggestedReasoning,
          },
        };
      }
    }

    // Fallback: approve the original proposal
    if (state._proposal && state._proposal.choiceIndex < availableActions.length) {
      const chosenAction = availableActions[state._proposal.choiceIndex];
      return {
        ...chosenAction,
        params: {
          ...chosenAction.params,
          _criticDecision: 'APPROVE',
          _criticFeedback: 'Fallback approval',
          _finalChoiceIndex: state._proposal.choiceIndex,
          _wasRevised: false,
        },
      };
    }

    // Last resort
    if (availableActions.length > 0) {
      return {
        ...availableActions[0],
        params: {
          ...availableActions[0].params,
          _criticDecision: 'APPROVE',
          _criticFeedback: 'Fallback',
          _finalChoiceIndex: 0,
          _wasRevised: false,
        },
      };
    }

    return {
      type: 'MAKE_CHOICE',
      params: {
        choiceIndex: 0,
        choiceText: 'Continue',
        _criticError: 'No available actions',
      },
      metadata: {
        description: 'No actions available',
      },
    };
  }
}
