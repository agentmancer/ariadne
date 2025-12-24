/**
 * Anthropic LLM Client
 * Implements LLMAdapter for Anthropic API
 */

import { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from '../types';

/**
 * Anthropic API client implementing LLMAdapter interface
 */
export class AnthropicClient implements LLMAdapter {
  readonly provider = 'anthropic';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  async generateCompletion(prompt: string, overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    return this.generateChat(
      [{ role: 'user', content: prompt }],
      overrides
    );
  }

  async generateChat(messages: LLMMessage[], overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    const config = { ...this.config, ...overrides };
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const baseUrl = config.baseUrl || 'https://api.anthropic.com';

    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens ?? 1000,
        system: systemMessage?.content,
        messages: chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        temperature: config.temperature ?? 0.7,
        ...config.options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
      model: string;
      stop_reason?: string;
    };

    // Extract text from content blocks
    const content = data.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text || '')
      .join('') || '';

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
      model: data.model,
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : undefined,
      raw: data,
    };
  }
}
