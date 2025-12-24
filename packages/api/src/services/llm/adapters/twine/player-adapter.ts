/**
 * Twine PLAYER Role Adapter
 * Generates story content by creating passages in Twine
 */

import { PluginAction } from '@ariadne/plugins';
import { TwineStoryState, TwinePassage } from '@ariadne/module-twine';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * Parsed response structure for passage creation
 */
interface PassageResponse {
  passageName: string;
  passageText: string;
  links?: Array<{
    text: string;
    target: string;
  }>;
}

/**
 * PLAYER role adapter for Twine
 * Creates story passages with narrative content and choices
 */
export class TwinePlayerAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'PLAYER';

  getSystemPrompt(): string {
    return `You are a creative writer composing an interactive fiction story in Twine format.

Your task is to write engaging story passages that:
1. Follow naturally from previous passages in the story
2. Maintain character consistency and narrative coherence
3. Provide meaningful choices that affect the story direction
4. Use vivid, descriptive language that immerses the reader
5. Create emotional resonance and dramatic tension

When writing a passage, you should:
- Give the passage a clear, descriptive name
- Write compelling narrative text (2-4 paragraphs typically)
- Include 2-4 meaningful choices/links to other passages
- Use [[Link Text|PassageName]] syntax for choices

Respond with a JSON object containing:
{
  "passageName": "Name of the passage",
  "passageText": "The narrative text with [[Choice Text|NextPassage]] links embedded",
  "links": [
    {"text": "Choice text shown to reader", "target": "TargetPassageName"}
  ]
}`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as TwineStoryState;
    const passages = state.content?.passages || [];
    const currentPassage = state.currentLocation;

    // Build context about existing story
    let storyContext = '';
    if (passages.length > 0) {
      const recentPassages = passages.slice(-5);
      storyContext = `\nExisting passages in the story:\n${recentPassages
        .map((p: TwinePassage) => `- "${p.name}": ${p.text.substring(0, 200)}...`)
        .join('\n')}`;
    }

    // Build prompt
    let prompt = `Write the next passage for this interactive story.`;

    if (currentPassage) {
      const current = passages.find((p: TwinePassage) => p.name === currentPassage);
      if (current) {
        prompt += `\n\nContinuing from passage "${currentPassage}":\n"${current.text}"`;
      }
    } else if (passages.length === 0) {
      prompt += `\n\nThis is the START of the story. Create an opening passage that hooks the reader and sets up the narrative.`;
    }

    prompt += storyContext;

    // Add any configuration hints
    if (context.config?.theme) {
      prompt += `\n\nStory theme/genre: ${context.config.theme}`;
    }
    if (context.config?.tone) {
      prompt += `\nTone: ${context.config.tone}`;
    }

    prompt += `\n\nRespond with JSON only.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, _context: RoleContext): PluginAction {
    const parsed = this.extractJSON<PassageResponse>(response.content);

    if (!parsed) {
      // Fallback: try to extract passage info from plain text
      const lines = response.content.split('\n');
      const passageName = lines[0]?.replace(/^#\s*/, '').trim() || 'New Passage';
      const passageText = lines.slice(1).join('\n').trim();

      return {
        type: 'CREATE_PASSAGE',
        params: {
          name: passageName,
          text: passageText,
          links: [],
        },
        metadata: {
          description: `Create passage "${passageName}"`,
        },
      };
    }

    // Extract links from text if not provided separately
    let links = parsed.links || [];
    if (links.length === 0) {
      const linkMatches = parsed.passageText.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
      for (const match of linkMatches) {
        links.push({
          text: match[1],
          target: match[2] || match[1],
        });
      }
    }

    return {
      type: 'CREATE_PASSAGE',
      params: {
        name: parsed.passageName,
        text: parsed.passageText,
        links,
      },
      metadata: {
        description: `Create passage "${parsed.passageName}" with ${links.length} choices`,
      },
    };
  }
}
