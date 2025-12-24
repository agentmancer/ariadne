/**
 * Twine EDITOR Role Adapter
 * Reviews story content and provides constructive feedback
 */

import { PluginAction } from '@ariadne/plugins';
import { TwineStoryState, TwinePassage } from '@ariadne/module-twine';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * Parsed response structure for editorial feedback
 */
interface EditorResponse {
  passageId?: string;
  overallAssessment: string;
  strengths: string[];
  suggestions: Array<{
    type: 'grammar' | 'clarity' | 'pacing' | 'character' | 'plot' | 'choice_design';
    description: string;
    passageName?: string;
    severity: 'minor' | 'moderate' | 'major';
  }>;
  rating?: {
    overall: number;
    creativity: number;
    coherence: number;
    engagement: number;
  };
}

/**
 * EDITOR role adapter for Twine
 * Provides constructive editorial feedback on story content
 */
export class TwineEditorAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'EDITOR';

  getSystemPrompt(): string {
    return `You are an experienced editor reviewing an interactive fiction story written in Twine.

Your role is to provide constructive, actionable feedback that helps the author improve their work.

When reviewing, evaluate:
1. **Narrative Quality**: Is the writing engaging, clear, and well-paced?
2. **Character Consistency**: Do characters behave consistently? Are motivations clear?
3. **Plot Coherence**: Does the story make sense? Are there plot holes?
4. **Choice Design**: Are choices meaningful and interesting? Do they affect the story?
5. **Technical Quality**: Grammar, spelling, and Twine syntax correctness

Be encouraging but honest. Focus on specific, actionable improvements.

Respond with a JSON object:
{
  "passageId": "specific passage being commented on (optional)",
  "overallAssessment": "Brief overall evaluation",
  "strengths": ["What works well..."],
  "suggestions": [
    {
      "type": "grammar|clarity|pacing|character|plot|choice_design",
      "description": "Specific suggestion",
      "passageName": "Affected passage (if specific)",
      "severity": "minor|moderate|major"
    }
  ],
  "rating": {
    "overall": 1-5,
    "creativity": 1-5,
    "coherence": 1-5,
    "engagement": 1-5
  }
}`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as TwineStoryState;
    const passages = state.content?.passages || [];

    if (passages.length === 0) {
      return `The story is empty. Please wait for content to review.`;
    }

    // Format passages for review
    const storyContent = passages
      .map((p: TwinePassage) => {
        const links = p.text.match(/\[\[([^\]]+)\]\]/g) || [];
        return `## ${p.name}\n${p.text}\n(${links.length} choices)`;
      })
      .join('\n\n---\n\n');

    let prompt = `Please review this interactive fiction story:\n\n${storyContent}`;

    // Add context about what to focus on
    if (context.config?.focusAreas) {
      prompt += `\n\nPlease pay special attention to: ${context.config.focusAreas}`;
    }

    // If there's a specific passage to review
    if (context.config?.targetPassage) {
      prompt += `\n\nFocus your detailed feedback on the passage: "${context.config.targetPassage}"`;
    }

    prompt += `\n\nProvide your editorial feedback as JSON.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, _context: RoleContext): PluginAction {
    const parsed = this.extractJSON<EditorResponse>(response.content);

    if (!parsed) {
      // Fallback: create a basic comment from plain text
      return {
        type: 'ADD_COMMENT',
        params: {
          passageId: null,
          comment: response.content,
          suggestions: [],
        },
        metadata: {
          description: 'Editorial feedback (unparsed)',
        },
      };
    }

    return {
      type: 'ADD_COMMENT',
      params: {
        passageId: parsed.passageId,
        comment: parsed.overallAssessment,
        strengths: parsed.strengths,
        suggestions: parsed.suggestions,
        rating: parsed.rating,
      },
      metadata: {
        description: `Editorial review with ${parsed.suggestions?.length || 0} suggestions`,
        score: parsed.rating?.overall,
      },
    };
  }
}
