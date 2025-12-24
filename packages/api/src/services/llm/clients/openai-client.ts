/**
 * OpenAI LLM Client
 * Implements LLMAdapter for OpenAI API
 */

import { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from '../types';

/**
 * OpenAI API client implementing LLMAdapter interface
 */
export class OpenAIClient implements LLMAdapter {
  readonly provider = 'openai';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey || process.env.OPENAI_API_KEY);
  }

  async generateCompletion(prompt: string, overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    return this.generateChat(
      [{ role: 'user', content: prompt }],
      overrides
    );
  }

  async generateChat(messages: LLMMessage[], overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    const config = { ...this.config, ...overrides };
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 1000,
        ...config.options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      model: data.model,
      finishReason: choice?.finish_reason,
      raw: data,
    };
  }
}
