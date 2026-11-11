/**
 * Ollama Client
 *
 * Client for interacting with local Ollama server.
 *
 * @module lib/ollama/client
 */

// =============================================================================
// Types
// =============================================================================

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_HOST = 'http://localhost:11434';
const HEALTH_CHECK_TIMEOUT = 5000;
const GENERATE_TIMEOUT = 120000; // 2 minutes for vision models

// Models for SafeOS
const TRIAGE_MODEL = 'moondream'; // Fast, small vision model
const ANALYSIS_MODEL = 'llava:7b'; // Detailed analysis model

// =============================================================================
// OllamaClient Class
// =============================================================================

export class OllamaClient {
  private host: string;
  private healthCache: { healthy: boolean; timestamp: number } | null = null;
  private modelCache: Map<string, boolean> = new Map();

  constructor(host?: string) {
    this.host = host || process.env['OLLAMA_HOST'] || DEFAULT_HOST;
  }

  // ---------------------------------------------------------------------------
  // Health & Status
  // ---------------------------------------------------------------------------

  async isHealthy(): Promise<boolean> {
    // Check cache (valid for 30 seconds)
    if (
      this.healthCache &&
      Date.now() - this.healthCache.timestamp < 30000
    ) {
      return this.healthCache.healthy;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const response = await fetch(`${this.host}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const healthy = response.ok;
      this.healthCache = { healthy, timestamp: Date.now() };
      return healthy;
    } catch {
      this.healthCache = { healthy: false, timestamp: Date.now() };
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    try {
      const response = await fetch(`${this.host}/api/version`);
      if (response.ok) {
        const data = await response.json() as { version: string };
        return data.version;
      }
    } catch (error) {
      console.error('Failed to get Ollama version:', error);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Model Management
  // ---------------------------------------------------------------------------

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      if (response.ok) {
        const data = await response.json() as { models?: OllamaModel[] };
        return data.models || [];
      }
    } catch (error) {
      console.error('Failed to list models:', error);
    }
    return [];
  }

  async hasModel(modelName: string): Promise<boolean> {
    // Check cache
    if (this.modelCache.has(modelName)) {
      return this.modelCache.get(modelName)!;
    }

    const models = await this.listModels();
    const hasIt = models.some(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`)
    );

    this.modelCache.set(modelName, hasIt);
    return hasIt;
  }

  async ensureModels(models: string[]): Promise<void> {
    for (const model of models) {
      const hasModel = await this.hasModel(model);
      if (!hasModel) {
        console.log(`Pulling model: ${model}`);
        await this.pullModel(model);
      }
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.host}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      // Stream response to track progress
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Parse progress updates
          const text = new TextDecoder().decode(value);
          const lines = text.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.status) {
                console.log(`Pull ${modelName}: ${data.status}`);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Update cache
      this.modelCache.set(modelName, true);
      console.log(`Model ${modelName} pulled successfully`);
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  async generate(options: OllamaGenerateOptions): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT);

      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...options,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json() as OllamaResponse;
      return data.response || '';
    } catch (error) {
      console.error('Ollama generation failed:', error);
      throw error;
    }
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    model: string = ANALYSIS_MODEL
  ): Promise<string> {
    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    return this.generate({
      model,
      prompt,
      images: [base64Data],
      options: {
        temperature: 0.2,
        num_predict: 500,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // SafeOS-Specific Methods
  // ---------------------------------------------------------------------------

  /**
   * Quick triage with fast model (Moondream)
   */
  async triage(imageBase64: string, prompt: string): Promise<string> {
    return this.analyzeImage(imageBase64, prompt, TRIAGE_MODEL);
  }

  /**
   * Detailed analysis with larger model (LLaVA)
   */
  async analyze(imageBase64: string, prompt: string): Promise<string> {
    return this.analyzeImage(imageBase64, prompt, ANALYSIS_MODEL);
  }

  /**
   * Check if required models are available
   */
  async checkRequiredModels(): Promise<{
    triageModel: boolean;
    analysisModel: boolean;
  }> {
    const [triageModel, analysisModel] = await Promise.all([
      this.hasModel(TRIAGE_MODEL),
      this.hasModel(ANALYSIS_MODEL),
    ]);

    return { triageModel, analysisModel };
  }

  /**
   * Get host URL
   */
  getHost(): string {
    return this.host;
  }
}

// Default client singleton
let defaultClient: OllamaClient | null = null;

export function getDefaultOllamaClient(): OllamaClient {
  if (!defaultClient) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    defaultClient = new OllamaClient(host);
  }
  return defaultClient;
}

export default OllamaClient;
