/**
 * Twine Collaborative Story Adapter
 *
 * A composite adapter for multi-round collaborative studies where agents:
 * - AUTHOR phase: Write/revise stories
 * - PLAY phase: Play partner's story
 * - REVIEW phase: Provide feedback
 *
 * This adapter injects AgentCollaborativeContext into prompts,
 * ensuring the same agent retains memory across all phases.
 */

import { PluginAction } from '@ariadne/plugins';
import { TwineStoryState, TwinePassage } from '@ariadne/module-twine';
import { LLMAdapter, LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';
import {
  AgentCollaborativeContext,
  CollaborativePhase,
  Comment,
} from '@ariadne/shared';

/**
 * Extended context that includes collaborative memory
 */
export interface CollaborativeRoleContext extends RoleContext {
  /** The agent's persistent memory across phases/rounds */
  collaborativeContext: AgentCollaborativeContext;
  /** Partner's story (for PLAY phase) */
  partnerStory?: TwineStoryState;
  /** Feedback from partner (for AUTHOR revision phase) */
  partnerFeedback?: Comment[];
  /** Current round number */
  round: number;
}

/**
 * Parsed response for story creation
 */
interface AuthorResponse {
  passages: Array<{
    name: string;
    text: string;
    links?: Array<{
      text: string;
      target: string;
    }>;
  }>;
  startPassage: string;
  storySummary?: string;
}

/**
 * Parsed response for navigation choices
 */
interface PlayResponse {
  choiceIndex: number;
  reasoning: string;
  observation?: string;
}

/**
 * Parsed response for feedback
 */
interface ReviewResponse {
  strengths: string[];
  improvements: string[];
  questions?: string[];
  overallAssessment: string;
  comments: Array<{
    passageId?: string;
    content: string;
    type: 'PRAISE' | 'SUGGESTION' | 'CRITIQUE' | 'QUESTION';
  }>;
}

/**
 * Collaborative Story Adapter for Twine
 * Handles all phases of collaborative story creation and review
 */
export class TwineCollaborativeAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'COLLABORATIVE';

  /**
   * Generate action based on the current collaborative phase
   */
  async generateAction(
    llm: LLMAdapter,
    context: CollaborativeRoleContext
  ): Promise<PluginAction> {
    const phase = context.collaborativeContext.currentPhase;

    // Build phase-appropriate prompts
    const systemPrompt = this.getSystemPromptForPhase(phase, context);
    const userPrompt = this.buildUserPromptForPhase(phase, context);

    const response = await llm.generateChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this.parseResponseForPhase(phase, response, context);
  }

  getSystemPrompt(): string {
    // Default implementation - returns a generic collaborative authoring prompt
    // This is called when no specific context is available (e.g., during adapter initialization)
    return `You are a creative author participating in a collaborative interactive fiction study.
Your role is to write engaging stories and provide constructive feedback to your partner.`;
  }

  buildUserPrompt(context: RoleContext): string {
    const collab = context as CollaborativeRoleContext;
    return this.buildUserPromptForPhase(
      collab.collaborativeContext?.currentPhase || CollaborativePhase.AUTHOR,
      collab
    );
  }

  parseResponse(response: LLMResponse, context: RoleContext): PluginAction {
    const collab = context as CollaborativeRoleContext;
    return this.parseResponseForPhase(
      collab.collaborativeContext?.currentPhase || CollaborativePhase.AUTHOR,
      response,
      collab
    );
  }

  // ============================================
  // PHASE-SPECIFIC SYSTEM PROMPTS
  // ============================================

  private getSystemPromptForPhase(
    phase: CollaborativePhase,
    context: CollaborativeRoleContext
  ): string {
    const contextSummary = this.buildCollaborativeContextSummary(context);

    switch (phase) {
      case CollaborativePhase.AUTHOR:
        return this.getAuthorSystemPrompt(context, contextSummary);
      case CollaborativePhase.PLAY:
        return this.getPlaySystemPrompt(context, contextSummary);
      case CollaborativePhase.REVIEW:
        return this.getReviewSystemPrompt(context, contextSummary);
      default:
        return this.getAuthorSystemPrompt(context, contextSummary);
    }
  }

  private getAuthorSystemPrompt(
    context: CollaborativeRoleContext,
    contextSummary: string
  ): string {
    const isRevision = context.round > 1 && context.partnerFeedback?.length;

    let prompt = `You are a creative author writing interactive fiction for a collaborative study.

${contextSummary}

You are ${isRevision ? 'REVISING' : 'CREATING'} an interactive story.`;

    if (isRevision) {
      prompt += `

This is round ${context.round}. You have received feedback on your previous story.
Your task is to revise and improve your story based on the feedback,
while maintaining the core narrative that worked well.

Consider:
1. Address specific feedback points
2. Keep strengths that were praised
3. Apply learnings from playing your partner's story
4. Make the story more engaging based on what you observed`;
    } else {
      prompt += `

Create a complete short interactive fiction story with:
1. Multiple passages (minimum 5, maximum 15)
2. Meaningful choices that affect the narrative
3. At least 2 different endings
4. A clear narrative arc (beginning, middle, end)

Make the story engaging, with distinct characters and interesting choices.`;
    }

    prompt += `

Respond with a JSON object:
{
  "passages": [
    {
      "name": "PassageName",
      "text": "The passage content...",
      "links": [
        {"text": "Choice text shown to player", "target": "TargetPassageName"}
      ]
    }
  ],
  "startPassage": "NameOfFirstPassage",
  "storySummary": "Brief 1-2 sentence summary of your story"
}

Requirements:
- Every passage name must be unique
- Every link target must match an existing passage name
- Include at least one passage with no links (an ending)
- Start passage must exist`;

    return prompt;
  }

  private getPlaySystemPrompt(
    _context: CollaborativeRoleContext,
    contextSummary: string
  ): string {
    return `You are playing through your partner's interactive fiction story.

${contextSummary}

Your goal is to:
1. Experience the story fully and thoughtfully
2. Make choices that explore the narrative meaningfully
3. Take mental notes about what works well and what could be improved
4. Consider the story from both a reader and author perspective

As you play:
- Stay immersed in the narrative
- Notice interesting techniques or problems
- Consider how choices feel meaningful or not
- Pay attention to pacing, character, and engagement

Respond with a JSON object:
{
  "choiceIndex": <number from 0 to N-1>,
  "reasoning": "Brief explanation of why you made this choice",
  "observation": "Optional observation about the story (good or bad)"
}

IMPORTANT: choiceIndex must be a valid index from the available choices (0-indexed).`;
  }

  private getReviewSystemPrompt(
    _context: CollaborativeRoleContext,
    contextSummary: string
  ): string {
    return `You are providing constructive feedback on your partner's story.

${contextSummary}

Having just played through your partner's story, provide thoughtful feedback that will help them improve while being respectful and encouraging.

Your feedback should:
1. Highlight specific strengths (what worked well)
2. Suggest specific improvements (constructive, actionable)
3. Ask questions about unclear elements
4. Provide an overall assessment

Remember:
- Be specific with examples from the story
- Balance praise with constructive criticism
- Make suggestions actionable
- Consider your own experience as a player

Respond with a JSON object:
{
  "strengths": ["Specific strength 1", "Specific strength 2", ...],
  "improvements": ["Specific suggestion 1", "Specific suggestion 2", ...],
  "questions": ["Question about unclear element", ...],
  "overallAssessment": "2-3 sentence overall summary",
  "comments": [
    {
      "passageId": "OptionalPassageName",
      "content": "Specific comment about this passage or general comment",
      "type": "PRAISE|SUGGESTION|CRITIQUE|QUESTION"
    }
  ]
}`;
  }

  // ============================================
  // PHASE-SPECIFIC USER PROMPTS
  // ============================================

  private buildUserPromptForPhase(
    phase: CollaborativePhase,
    context: CollaborativeRoleContext
  ): string {
    switch (phase) {
      case CollaborativePhase.AUTHOR:
        return this.buildAuthorUserPrompt(context);
      case CollaborativePhase.PLAY:
        return this.buildPlayUserPrompt(context);
      case CollaborativePhase.REVIEW:
        return this.buildReviewUserPrompt(context);
      default:
        return this.buildAuthorUserPrompt(context);
    }
  }

  private buildAuthorUserPrompt(context: CollaborativeRoleContext): string {
    let prompt = `Round ${context.round}: Create your interactive story.\n\n`;

    // Add genre/theme constraints if provided
    if (context.config?.genre) {
      prompt += `Genre: ${context.config.genre}\n`;
    }
    if (context.config?.theme) {
      prompt += `Theme: ${context.config.theme}\n`;
    }
    if (context.config?.constraints) {
      prompt += `Constraints: ${context.config.constraints}\n`;
    }

    // If this is a revision round, include feedback
    if (context.round > 1 && context.partnerFeedback?.length) {
      prompt += `\n## Feedback from your partner:\n`;
      for (const comment of context.partnerFeedback) {
        const typeLabel = comment.commentType.toLowerCase();
        prompt += `- [${typeLabel}] ${comment.content}\n`;
      }
    }

    // Include learnings from playing partner's story
    const playExperiences = context.collaborativeContext.partnerStoriesPlayed;
    if (playExperiences.length > 0) {
      const latestPlay = playExperiences[playExperiences.length - 1];
      if (latestPlay.observations.length > 0) {
        prompt += `\n## What you learned playing your partner's story:\n`;
        for (const obs of latestPlay.observations) {
          prompt += `- ${obs}\n`;
        }
      }
    }

    prompt += `\nRespond with JSON only.`;

    return prompt;
  }

  private buildPlayUserPrompt(context: CollaborativeRoleContext): string {
    const state = context.partnerStory || (context.state as TwineStoryState);
    const passages = state.content?.passages || [];

    let prompt = `You are playing through your partner's story (Round ${context.round}).\n\n`;

    // Current passage
    const currentPassageId = state.currentLocation;
    const currentPassage = passages.find(
      (p: TwinePassage) => p.id === currentPassageId || p.name === currentPassageId
    );

    // Recent history for context
    if (state.history && state.history.length > 0) {
      const recentHistory = state.history.slice(-2);
      const historyPassages = recentHistory
        .map((id) =>
          passages.find((p: TwinePassage) => p.id === id || p.name === id)
        )
        .filter(Boolean) as TwinePassage[];

      if (historyPassages.length > 0) {
        prompt += `Recent story:\n`;
        for (const p of historyPassages) {
          prompt += `---\n${p.text.substring(0, 200)}${p.text.length > 200 ? '...' : ''}\n`;
        }
        prompt += '\n';
      }
    }

    // Current passage
    if (currentPassage) {
      prompt += `CURRENT PASSAGE: "${currentPassage.name}"\n\n`;
      prompt += `${currentPassage.text}\n\n`;
    } else if (!currentPassageId && state.content?.startPassage) {
      const startPassage = passages.find(
        (p: TwinePassage) => p.name === state.content?.startPassage
      );
      if (startPassage) {
        prompt += `STARTING PASSAGE: "${startPassage.name}"\n\n`;
        prompt += `${startPassage.text}\n\n`;
      }
    }

    // Available choices
    if (context.availableActions && context.availableActions.length > 0) {
      prompt += `AVAILABLE CHOICES:\n`;
      context.availableActions.forEach((action, index) => {
        const choiceText =
          action.params?.choiceText ||
          action.metadata?.description ||
          `Choice ${index + 1}`;
        prompt += `${index}. ${choiceText}\n`;
      });
    } else {
      prompt += `No choices available - this may be an ending.\n`;
    }

    prompt += `\nRespond with JSON. Make note of anything interesting about the story.`;

    return prompt;
  }

  private buildReviewUserPrompt(context: CollaborativeRoleContext): string {
    let prompt = `Round ${context.round}: Provide feedback on your partner's story.\n\n`;

    // Summarize the play experience
    const playExperiences = context.collaborativeContext.partnerStoriesPlayed;
    if (playExperiences.length > 0) {
      const latestPlay = playExperiences.find((p) => p.round === context.round);
      if (latestPlay) {
        prompt += `## Your playthrough notes:\n`;
        prompt += `${latestPlay.playNotes}\n\n`;

        if (latestPlay.choicesMade.length > 0) {
          prompt += `## Choices you made:\n`;
          for (const choice of latestPlay.choicesMade) {
            prompt += `- At "${choice.passageId}": "${choice.choiceText}"`;
            if (choice.reasoning) {
              prompt += ` (${choice.reasoning})`;
            }
            prompt += '\n';
          }
        }

        if (latestPlay.observations.length > 0) {
          prompt += `\n## Your observations:\n`;
          for (const obs of latestPlay.observations) {
            prompt += `- ${obs}\n`;
          }
        }

        if (latestPlay.overallImpression) {
          prompt += `\n## Overall impression:\n${latestPlay.overallImpression}\n`;
        }
      }
    }

    prompt += `\nProvide structured feedback as JSON.`;

    return prompt;
  }

  // ============================================
  // PHASE-SPECIFIC RESPONSE PARSING
  // ============================================

  private parseResponseForPhase(
    phase: CollaborativePhase,
    response: LLMResponse,
    context: CollaborativeRoleContext
  ): PluginAction {
    switch (phase) {
      case CollaborativePhase.AUTHOR:
        return this.parseAuthorResponse(response, context);
      case CollaborativePhase.PLAY:
        return this.parsePlayResponse(response, context);
      case CollaborativePhase.REVIEW:
        return this.parseReviewResponse(response, context);
      default:
        return this.parseAuthorResponse(response, context);
    }
  }

  private parseAuthorResponse(
    response: LLMResponse,
    context: CollaborativeRoleContext
  ): PluginAction {
    const parsed = this.extractJSON<AuthorResponse>(response.content);

    if (!parsed || !parsed.passages || parsed.passages.length === 0) {
      // Fallback: create a minimal story
      return {
        type: 'CREATE_STORY',
        params: {
          passages: [
            {
              name: 'Start',
              text: 'The story begins...',
              links: [{ text: 'Continue', target: 'End' }],
            },
            {
              name: 'End',
              text: 'The story ends.',
              links: [],
            },
          ],
          startPassage: 'Start',
          storySummary: 'A story that failed to generate properly',
          _llmError: 'Failed to parse story response',
        },
        metadata: {
          description: 'Story creation (parse error)',
        },
      };
    }

    return {
      type: 'CREATE_STORY',
      params: {
        passages: parsed.passages,
        startPassage: parsed.startPassage,
        storySummary: parsed.storySummary,
        round: context.round,
      },
      metadata: {
        description: `Story created: ${parsed.storySummary || 'Untitled'}`,
      },
    };
  }

  private parsePlayResponse(
    response: LLMResponse,
    context: CollaborativeRoleContext
  ): PluginAction {
    const availableActions = context.availableActions || [];
    const parsed = this.extractJSON<PlayResponse>(response.content);

    // Store observation for later review
    const observation = parsed?.observation;

    if (parsed && typeof parsed.choiceIndex === 'number') {
      if (parsed.choiceIndex >= 0 && parsed.choiceIndex < availableActions.length) {
        const chosenAction = availableActions[parsed.choiceIndex];
        return {
          ...chosenAction,
          params: {
            ...chosenAction.params,
            _llmReasoning: parsed.reasoning,
            _llmChoiceIndex: parsed.choiceIndex,
            _llmObservation: observation,
          },
        };
      }
    }

    // Fallback to first action
    if (availableActions.length > 0) {
      return {
        ...availableActions[0],
        params: {
          ...availableActions[0].params,
          _llmReasoning: 'Fallback to first choice',
          _llmChoiceIndex: 0,
          _llmObservation: observation,
        },
      };
    }

    // No actions - story ended
    return {
      type: 'STORY_ENDED',
      params: {
        _llmObservation: observation,
      },
      metadata: {
        description: 'Reached end of story',
      },
    };
  }

  private parseReviewResponse(
    response: LLMResponse,
    context: CollaborativeRoleContext
  ): PluginAction {
    const parsed = this.extractJSON<ReviewResponse>(response.content);

    if (!parsed) {
      // Fallback: minimal feedback
      return {
        type: 'SUBMIT_FEEDBACK',
        params: {
          strengths: ['The story was readable'],
          improvements: ['Could use more development'],
          overallAssessment: response.content.substring(0, 500),
          comments: [],
          round: context.round,
        },
        metadata: {
          description: 'Feedback submitted (parse error)',
        },
      };
    }

    return {
      type: 'SUBMIT_FEEDBACK',
      params: {
        strengths: parsed.strengths,
        improvements: parsed.improvements,
        questions: parsed.questions,
        overallAssessment: parsed.overallAssessment,
        comments: parsed.comments,
        round: context.round,
      },
      metadata: {
        description: `Feedback: ${parsed.strengths.length} strengths, ${parsed.improvements.length} improvements`,
      },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Build a summary of the agent's collaborative context for inclusion in prompts
   */
  private buildCollaborativeContextSummary(
    context: CollaborativeRoleContext
  ): string {
    if (!context.collaborativeContext) {
      return '';
    }

    const ctx = context.collaborativeContext;
    const lines: string[] = ['## Your Memory'];

    lines.push(`Current Round: ${ctx.currentRound}`);
    lines.push(`Current Phase: ${ctx.currentPhase}`);
    lines.push('');

    // Own stories
    if (ctx.ownStoryDrafts.length > 0) {
      lines.push('### Your Previous Stories');
      for (const draft of ctx.ownStoryDrafts) {
        lines.push(`- Round ${draft.round}: ${draft.summary}`);
      }
      lines.push('');
    }

    // Partner stories played
    if (ctx.partnerStoriesPlayed.length > 0) {
      lines.push('### Partner Stories Played');
      for (const exp of ctx.partnerStoriesPlayed) {
        lines.push(`- Round ${exp.round}: ${exp.overallImpression || exp.playNotes}`);
      }
      lines.push('');
    }

    // Feedback received
    if (ctx.feedbackReceived.length > 0) {
      lines.push('### Feedback Received');
      for (const fb of ctx.feedbackReceived) {
        lines.push(`Round ${fb.round}:`);
        if (fb.strengths.length > 0) {
          lines.push(`  Strengths: ${fb.strengths.join(', ')}`);
        }
        if (fb.improvements.length > 0) {
          lines.push(`  To improve: ${fb.improvements.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Cumulative learnings
    if (ctx.cumulativeLearnings.length > 0) {
      lines.push('### What You\'ve Learned');
      for (const learning of ctx.cumulativeLearnings) {
        lines.push(`- [${learning.category}] ${learning.insight}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
