/**
 * Local Ollama Client - connects directly from browser to user's local Ollama
 *
 * Key insight: Browsers allow HTTPS pages to fetch from http://localhost (special exception)
 * This means a page hosted on jtm.io can call the user's local Ollama at localhost:11434
 */

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface OllamaGenerateOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const STORAGE_KEYS = {
  OLLAMA_URL: 'ariadne_ollama_url',
  OLLAMA_MODEL: 'ariadne_ollama_model',
  OLLAMA_ENABLED: 'ariadne_ollama_enabled',
};

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

class LocalOllamaClient {
  private baseUrl: string;
  private selectedModel: string | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.baseUrl = this.loadBaseUrl();
    this.selectedModel = this.loadSelectedModel();
  }

  // ============================================
  // Configuration & Persistence
  // ============================================

  private loadBaseUrl(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || DEFAULT_OLLAMA_URL;
    } catch {
      return DEFAULT_OLLAMA_URL;
    }
  }

  private loadSelectedModel(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL);
    } catch {
      return null;
    }
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
    try {
      localStorage.setItem(STORAGE_KEYS.OLLAMA_URL, url);
    } catch (e) {
      console.warn('Failed to save Ollama URL:', e);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setSelectedModel(model: string): void {
    this.selectedModel = model;
    try {
      localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, model);
    } catch (e) {
      console.warn('Failed to save selected model:', e);
    }
  }

  getSelectedModel(): string | null {
    return this.selectedModel;
  }

  isEnabled(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.OLLAMA_ENABLED) === 'true';
    } catch {
      return false;
    }
  }

  setEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.OLLAMA_ENABLED, String(enabled));
    } catch (e) {
      console.warn('Failed to save Ollama enabled state:', e);
    }
  }

  // ============================================
  // Connection & Model Discovery
  // ============================================

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      this.isConnected = true;
      return { success: true };
    } catch (error) {
      this.isConnected = false;
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, error: message };
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  // ============================================
  // Generation
  // ============================================

  async generate(
    prompt: string,
    options: OllamaGenerateOptions = {}
  ): Promise<string> {
    if (!this.selectedModel) {
      throw new Error('No model selected');
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.selectedModel,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 1000,
          top_p: options.top_p,
          top_k: options.top_k,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async chat(
    messages: OllamaMessage[],
    options: OllamaGenerateOptions = {}
  ): Promise<string> {
    if (!this.selectedModel) {
      throw new Error('No model selected');
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.selectedModel,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 1000,
          top_p: options.top_p,
          top_k: options.top_k,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  // ============================================
  // Streaming Generation
  // ============================================

  async *generateStream(
    prompt: string,
    options: OllamaGenerateOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.selectedModel) {
      throw new Error('No model selected');
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.selectedModel,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 1000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            yield json.response;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  }

  // ============================================
  // Utility
  // ============================================

  getConnectionStatus(): { connected: boolean; url: string; model: string | null } {
    return {
      connected: this.isConnected,
      url: this.baseUrl,
      model: this.selectedModel,
    };
  }

  /**
   * Select the best default model from available models
   * Prefers smaller/faster models suitable for interactive use
   */
  selectBestDefaultModel(models: OllamaModel[]): string | null {
    const preferredModels = [
      'llama3.2:3b', 'llama3.2:1b', 'llama3.2',
      'llama3.1:8b', 'llama3.1',
      'llama3:8b', 'llama3',
      'mistral:7b', 'mistral',
      'gemma2:9b', 'gemma2:2b', 'gemma2',
      'phi3:mini', 'phi3',
      'qwen2.5:7b', 'qwen2.5:3b', 'qwen2.5',
      'codellama:7b', 'codellama',
    ];

    const modelNames = models.map(m => m.name);

    for (const preferred of preferredModels) {
      const found = modelNames.find(m =>
        m.toLowerCase().includes(preferred.toLowerCase())
      );
      if (found) return found;
    }

    // Fall back to first available model
    return modelNames[0] || null;
  }
}

// Singleton instance
export const ollamaClient = new LocalOllamaClient();

// Export class for testing
export { LocalOllamaClient };
