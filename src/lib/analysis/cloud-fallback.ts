/**
 * Cloud Fallback
 *
 * Fallback to cloud LLMs when local Ollama is unavailable.
 *
 * @module lib/analysis/cloud-fallback
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// =============================================================================
// Types
// =============================================================================

export interface CloudAnalysisResult {
  content: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'openrouter';
  tokensUsed?: number;
}

// =============================================================================
// Constants
// =============================================================================

const ANTHROPIC_MODEL = 'claude-haiku-5-5';
const OPENAI_MODEL = 'gpt-5.6-terra';
const OPENROUTER_MODEL = 'google/gemini-2.5-flash';

// =============================================================================
// Clients
// =============================================================================

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let openrouterClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!anthropicClient && process.env['ANTHROPIC_API_KEY']) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env['OPENAI_API_KEY']) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

function getOpenRouterClient(): OpenAI | null {
  if (!openrouterClient && process.env['OPENROUTER_API_KEY']) {
    openrouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env['OPENROUTER_API_KEY'],
    });
  }
  return openrouterClient;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze image with cloud fallback chain
 */
export async function cloudFallbackAnalysis(
  imageBase64: string,
  prompt: string
): Promise<CloudAnalysisResult> {
  // Try providers in order: OpenRouter → OpenAI → Anthropic
  // (OpenRouter is often cheapest)

  const openrouter = getOpenRouterClient();
  if (openrouter) {
    try {
      return await analyzeWithOpenRouter(openrouter, imageBase64, prompt);
    } catch (error) {
      console.warn('OpenRouter analysis failed, trying OpenAI:', error);
    }
  }

  const openai = getOpenAIClient();
  if (openai) {
    try {
      return await analyzeWithOpenAI(openai, imageBase64, prompt);
    } catch (error) {
      console.warn('OpenAI analysis failed, trying Anthropic:', error);
    }
  }

  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      return await analyzeWithAnthropic(anthropic, imageBase64, prompt);
    } catch (error) {
      console.error('Anthropic analysis failed:', error);
      throw error;
    }
  }

  throw new Error('No cloud LLM providers available');
}

/**
 * Analyze with OpenRouter
 */
async function analyzeWithOpenRouter(
  client: OpenAI,
  imageBase64: string,
  prompt: string
): Promise<CloudAnalysisResult> {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageUrl = `data:image/jpeg;base64,${base64Data}`;

  const response = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 500,
  });

  return {
    content: response.choices[0]?.message?.content || '',
    model: OPENROUTER_MODEL,
    provider: 'openrouter',
    tokensUsed: response.usage?.total_tokens,
  };
}

/**
 * Analyze with OpenAI
 */
async function analyzeWithOpenAI(
  client: OpenAI,
  imageBase64: string,
  prompt: string
): Promise<CloudAnalysisResult> {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageUrl = `data:image/jpeg;base64,${base64Data}`;

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_completion_tokens: 4096,
  });

  return {
    content: response.choices[0]?.message?.content || '',
    model: OPENAI_MODEL,
    provider: 'openai',
    tokensUsed: response.usage?.total_tokens,
  };
}

/**
 * Analyze with Anthropic
 */
async function analyzeWithAnthropic(
  client: Anthropic,
  imageBase64: string,
  prompt: string
): Promise<CloudAnalysisResult> {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Data,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const content = textBlock && 'text' in textBlock ? textBlock.text : '';

  return {
    content,
    model: ANTHROPIC_MODEL,
    provider: 'anthropic',
    tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
  };
}

/**
 * Check which cloud providers are available
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = [];

  if (process.env['OPENROUTER_API_KEY']) providers.push('openrouter');
  if (process.env['OPENAI_API_KEY']) providers.push('openai');
  if (process.env['ANTHROPIC_API_KEY']) providers.push('anthropic');

  return providers;
}

export default {
  cloudFallbackAnalysis,
  getAvailableProviders,
};
