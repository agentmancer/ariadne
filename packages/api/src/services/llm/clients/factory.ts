/**
 * LLM Client Factory
 * Creates appropriate LLM client based on provider configuration
 */

import { LLMAdapter, LLMConfig } from '../types';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';

/**
 * Create an LLM client based on the provider configuration
 * @param config LLM configuration including provider name
 * @returns LLM adapter instance
 */
export function createLLMClient(config: LLMConfig): LLMAdapter {
  const provider = config.provider.toLowerCase();

  switch (provider) {
    case 'openai':
    case 'gpt':
    case 'gpt-4':
    case 'gpt-3.5':
      return new OpenAIClient(config);

    case 'anthropic':
    case 'claude':
      return new AnthropicClient(config);

    case 'ollama':
      // Ollama uses OpenAI-compatible API
      // Default to host.docker.internal for Docker/WSL environments
      return new OpenAIClient({
        ...config,
        baseUrl: config.baseUrl || 'http://host.docker.internal:11434/v1',
        apiKey: config.apiKey || 'ollama', // Ollama doesn't require a real key
      });

    // Future providers can be added here:
    // case 'google':
    // case 'gemini':
    //   return new GoogleClient(config);

    default:
      // Default to OpenAI-compatible API (many providers use this format)
      console.warn(`Unknown LLM provider '${provider}', falling back to OpenAI-compatible client`);
      return new OpenAIClient(config);
  }
}

/**
 * Check if a provider is supported
 */
export function isSupportedProvider(provider: string): boolean {
  const supported = ['openai', 'gpt', 'gpt-4', 'gpt-3.5', 'anthropic', 'claude', 'ollama'];
  return supported.includes(provider.toLowerCase());
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): string[] {
  return ['openai', 'anthropic', 'ollama'];
}
