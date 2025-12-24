/**
 * Google AI (Gemini) LLM Client
 * Implements LLMAdapter for Google's Gemini API
 */

import { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from '../types';

/**
 * Google AI (Gemini) client implementing LLMAdapter interface
 */
export class GoogleClient implements LLMAdapter {
  readonly provider = 'google';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey || process.env.GOOGLE_API_KEY);
  }

  async generateCompletion(prompt: string, overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    return this.generateChat(
      [{ role: 'user', content: prompt }],
      overrides
    );
  }

  async generateChat(messages: LLMMessage[], overrides?: Partial<LLMConfig>): Promise<LLMResponse> {
    const config = { ...this.config, ...overrides };
    const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error('Google API key not configured');
    }

    const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const timeoutMs = (config.options?.timeoutMs as number) ?? 120000; // Default 2 minutes
    const model = config.model || 'gemini-3-pro-preview';

    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Gemini format
    // Gemini uses 'user' and 'model' roles, with 'parts' array
    const geminiContents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Build request body
    const requestBody: {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
      generationConfig: {
        temperature: number;
        maxOutputTokens: number;
        candidateCount: number;
      };
    } = {
      contents: geminiContents,
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens ?? 1000,
        candidateCount: 1,
      },
    };

    // Add system instruction if present
    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new Error(`LLM request timed out after ${timeoutMs}ms - model: ${model}`);
        }
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google AI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
          role?: string;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
      modelVersion?: string;
    };

    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts
      ?.map(part => part.text || '')
      .join('') || '';

    // Map finish reasons to standard format
    let finishReason: LLMResponse['finishReason'];
    switch (candidate?.finishReason) {
      case 'STOP':
        finishReason = 'stop';
        break;
      case 'MAX_TOKENS':
        finishReason = 'length';
        break;
      case 'SAFETY':
        finishReason = 'content_filter';
        break;
      default:
        finishReason = undefined;
    }

    return {
      content,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
      model: data.modelVersion || model,
      finishReason,
      raw: data,
    };
  }
}
