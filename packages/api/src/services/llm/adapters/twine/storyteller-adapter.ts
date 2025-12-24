/**
 * Twine STORYTELLER Role Adapter
 * Generates story prompts, scenarios, and narrative frameworks
 */

import { PluginAction } from '@ariadne/plugins';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * Parsed response structure for story prompts
 */
interface StorytellerResponse {
  prompt: string;
  theme: string;
  genre: string;
  tone: string;
  characters?: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  setting?: {
    location: string;
    time: string;
    atmosphere: string;
  };
  plotHooks?: string[];
  suggestedStructure?: {
    beginning: string;
    middle: string;
    end: string;
  };
}

/**
 * STORYTELLER role adapter for Twine
 * Creates story frameworks, prompts, and narrative scaffolding
 */
export class TwineStorytellerAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'STORYTELLER';

  getSystemPrompt(): string {
    return `You are a master storyteller and narrative designer creating frameworks for interactive fiction.

Your role is to generate compelling story prompts, scenarios, and structural frameworks that:
1. Provide a clear premise that hooks the reader
2. Establish interesting characters with clear motivations
3. Set up a rich, explorable world/setting
4. Create multiple potential paths and outcomes
5. Include themes that resonate emotionally

When generating a story framework, consider:
- The branching nature of interactive fiction
- Multiple endings and player agency
- Pacing that works with player choice
- Mysteries or questions that drive exploration

Respond with a JSON object:
{
  "prompt": "The main story premise/hook (1-2 paragraphs)",
  "theme": "Core theme (e.g., 'redemption', 'sacrifice', 'identity')",
  "genre": "Genre (e.g., 'mystery', 'sci-fi', 'fantasy', 'horror')",
  "tone": "Narrative tone (e.g., 'dark', 'hopeful', 'whimsical')",
  "characters": [
    {"name": "...", "role": "protagonist|antagonist|ally|etc", "description": "..."}
  ],
  "setting": {
    "location": "Where the story takes place",
    "time": "When (era, season, etc.)",
    "atmosphere": "The overall mood/feel"
  },
  "plotHooks": ["Intriguing elements to explore..."],
  "suggestedStructure": {
    "beginning": "How the story should open",
    "middle": "Key conflicts and choices",
    "end": "Possible conclusions"
  }
}`;
  }

  buildUserPrompt(context: RoleContext): string {
    let prompt = `Generate a story framework for an interactive fiction.`;

    // Use configuration to guide generation
    if (context.config?.genre) {
      prompt += `\n\nRequested genre: ${context.config.genre}`;
    }
    if (context.config?.theme) {
      prompt += `\nTheme to explore: ${context.config.theme}`;
    }
    if (context.config?.audience) {
      prompt += `\nTarget audience: ${context.config.audience}`;
    }
    if (context.config?.length) {
      prompt += `\nIntended length: ${context.config.length}`;
    }
    if (context.config?.constraints) {
      prompt += `\nConstraints/requirements: ${context.config.constraints}`;
    }

    // If there's an existing story, build on it
    if (context.state.content && Object.keys(context.state.content).length > 0) {
      prompt += `\n\nThere is existing story content. Generate a framework that extends or complements it.`;
      prompt += `\nExisting state summary: ${this.truncateStateForPrompt(context.state.content, 1000)}`;
    }

    prompt += `\n\nRespond with JSON only.`;

    return prompt;
  }

  parseResponse(response: LLMResponse, _context: RoleContext): PluginAction {
    const parsed = this.extractJSON<StorytellerResponse>(response.content);

    if (!parsed) {
      // Fallback: use the raw text as the prompt
      return {
        type: 'SET_STORY_PROMPT',
        params: {
          prompt: response.content,
          metadata: {},
        },
        metadata: {
          description: 'Story prompt (unparsed)',
        },
      };
    }

    return {
      type: 'SET_STORY_PROMPT',
      params: {
        prompt: parsed.prompt,
        theme: parsed.theme,
        genre: parsed.genre,
        tone: parsed.tone,
        characters: parsed.characters,
        setting: parsed.setting,
        plotHooks: parsed.plotHooks,
        suggestedStructure: parsed.suggestedStructure,
      },
      metadata: {
        description: `Story framework: ${parsed.genre} ${parsed.theme}`,
      },
    };
  }
}
