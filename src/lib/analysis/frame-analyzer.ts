/**
 * Frame Analyzer
 *
 * Vision analysis pipeline using local Ollama models with cloud fallback.
 * Implements two-tier analysis: fast triage followed by detailed analysis.
 *
 * @module lib/analysis/frame-analyzer
 */

import { getDefaultOllamaClient, type OllamaClient } from '../ollama/client.js';
import { getPetPrompt, getBabyPrompt, getElderlyPrompt } from './profiles/index.js';
import { cloudFallbackAnalysis } from './cloud-fallback.js';
import type {
  MonitoringScenario,
  ConcernLevel,
} from '../../types/index.js';
import { generateId, now } from '../../db/index.js';

// =============================================================================
// Types
// =============================================================================

export interface FrameAnalysisRequest {
  frameData: string; // Base64 JPEG
  streamId: string;
  scenario: MonitoringScenario;
  motionScore?: number;
  audioLevel?: number;
}

export interface FrameAnalysisResult {
  id: string;
  streamId: string;
  scenario: MonitoringScenario;
  concernLevel: ConcernLevel;
  description: string;
  modelUsed: string;
  inferenceMs: number;
  createdAt: string;
  triageResult?: string;
  detailedResult?: string;
  usedCloudFallback: boolean;
}

// =============================================================================
// Frame Analyzer Class
// =============================================================================

export class FrameAnalyzer {
  private ollama: OllamaClient;
  private cloudFallbackEnabled: boolean;
  private analysisCount = 0;
  private cloudFallbackCount = 0;

  constructor(ollama?: OllamaClient) {
    this.ollama = ollama || getDefaultOllamaClient();
    this.cloudFallbackEnabled = !!(
      process.env['OPENROUTER_API_KEY'] ||
      process.env['OPENAI_API_KEY'] ||
      process.env['ANTHROPIC_API_KEY']
    );
  }

  // ===========================================================================
  // Main Analysis Pipeline
  // ===========================================================================

  /**
   * Analyze a frame using the two-tier pipeline:
   * 1. Quick triage with Moondream
   * 2. Detailed analysis with LLaVA if concern detected
   * 3. Cloud fallback if still uncertain
   */
  async analyze(request: FrameAnalysisRequest): Promise<FrameAnalysisResult> {
    this.analysisCount++;
    const startTime = Date.now();

    // Get scenario-specific prompts
    const { triagePrompt, detailedPrompt } = this.getPrompts(request.scenario);

    // Step 1: Quick triage
    const triageResult = await this.triage(request.frameData, triagePrompt);

    // Parse triage result to determine if further analysis needed
    const triageConcern = this.parseConcernLevel(triageResult.response);

    // If no concern, return early
    if (triageConcern === 'none') {
      return this.createResult(request, {
        concernLevel: 'none',
        description: 'No concerns detected',
        modelUsed: 'moondream (triage)',
        inferenceMs: Date.now() - startTime,
        triageResult: triageResult.response,
        usedCloudFallback: false,
      });
    }

    // Step 2: Detailed analysis
    const detailedResult = await this.detailed(request.frameData, detailedPrompt);
    const detailedConcern = this.parseConcernLevel(detailedResult.response);

    // If concern level is clear, return
    if (detailedConcern !== 'none' || triageConcern === 'low') {
      return this.createResult(request, {
        concernLevel: detailedConcern || triageConcern,
        description: this.extractDescription(detailedResult.response),
        modelUsed: 'llava:7b (detailed)',
        inferenceMs: Date.now() - startTime,
        triageResult: triageResult.response,
        detailedResult: detailedResult.response,
        usedCloudFallback: false,
      });
    }

    // Step 3: Cloud fallback for uncertain cases (triageConcern is medium/high/critical at this point)
    if (this.cloudFallbackEnabled) {
      this.cloudFallbackCount++;
      try {
        const cloudResult = await this.cloudAnalysis(request.frameData, detailedPrompt);
        const cloudConcern = this.parseConcernLevel(cloudResult);

        return this.createResult(request, {
          concernLevel: cloudConcern || triageConcern,
          description: this.extractDescription(cloudResult),
          modelUsed: 'cloud-fallback',
          inferenceMs: Date.now() - startTime,
          triageResult: triageResult.response,
          detailedResult: cloudResult,
          usedCloudFallback: true,
        });
      } catch (error) {
        console.error('[FrameAnalyzer] Cloud fallback failed:', error);
        // Fall through to return local result
      }
    }

    // Return best local result
    return this.createResult(request, {
      concernLevel: triageConcern,
      description: this.extractDescription(detailedResult.response || triageResult.response),
      modelUsed: 'llava:7b (detailed)',
      inferenceMs: Date.now() - startTime,
      triageResult: triageResult.response,
      detailedResult: detailedResult.response,
      usedCloudFallback: false,
    });
  }

  // ===========================================================================
  // Analysis Methods
  // ===========================================================================

  private async triage(
    frameData: string,
    prompt: string
  ): Promise<{ response: string; inferenceMs: number }> {
    try {
      const startTime = Date.now();
      const response = await this.ollama.triage(frameData, prompt);
      return { response, inferenceMs: Date.now() - startTime };
    } catch (error) {
      console.error('[FrameAnalyzer] Triage failed:', error);
      return { response: 'ERROR: Triage failed', inferenceMs: 0 };
    }
  }

  private async detailed(
    frameData: string,
    prompt: string
  ): Promise<{ response: string; inferenceMs: number }> {
    try {
      const startTime = Date.now();
      const response = await this.ollama.analyze(frameData, prompt);
      return { response, inferenceMs: Date.now() - startTime };
    } catch (error) {
      console.error('[FrameAnalyzer] Detailed analysis failed:', error);
      return { response: 'ERROR: Detailed analysis failed', inferenceMs: 0 };
    }
  }

  private async cloudAnalysis(frameData: string, prompt: string): Promise<string> {
    const result = await cloudFallbackAnalysis(frameData, prompt);
    return result.content;
  }

  // ===========================================================================
  // Prompt Management
  // ===========================================================================

  private getPrompts(scenario: MonitoringScenario): {
    triagePrompt: string;
    detailedPrompt: string;
  } {
    switch (scenario) {
      case 'pet':
        return {
          triagePrompt: getPetPrompt('triage'),
          detailedPrompt: getPetPrompt('detailed'),
        };
      case 'baby':
        return {
          triagePrompt: getBabyPrompt('triage'),
          detailedPrompt: getBabyPrompt('detailed'),
        };
      case 'elderly':
        return {
          triagePrompt: getElderlyPrompt('triage'),
          detailedPrompt: getElderlyPrompt('detailed'),
        };
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  // ===========================================================================
  // Result Parsing
  // ===========================================================================

  private parseConcernLevel(response: string | undefined | null): ConcernLevel {
    if (!response) {
      return 'low'; // Default to low if no response
    }
    const lower = response.toLowerCase();

    if (lower.includes('critical') || lower.includes('emergency') || lower.includes('immediate')) {
      return 'critical';
    }
    if (lower.includes('high') || lower.includes('urgent') || lower.includes('danger')) {
      return 'high';
    }
    if (lower.includes('medium') || lower.includes('moderate') || lower.includes('attention')) {
      return 'medium';
    }
    if (lower.includes('low') || lower.includes('minor') || lower.includes('slight')) {
      return 'low';
    }
    if (
      lower.includes('no concern') ||
      lower.includes('normal') ||
      lower.includes('ok') ||
      lower.includes('fine') ||
      lower.includes('safe')
    ) {
      return 'none';
    }

    // Default to low if unclear
    return 'low';
  }

  private extractDescription(response: string | undefined | null): string {
    if (!response) {
      return 'Analysis complete';
    }
    // Try to extract a concise description from the response
    const lines = response.split('\n').filter((l) => l.trim());

    // Look for lines that describe the situation
    for (const line of lines) {
      if (
        line.includes('I see') ||
        line.includes('I notice') ||
        line.includes('The image shows') ||
        line.includes('This shows')
      ) {
        return line.trim();
      }
    }

    // Return first non-empty line as fallback
    return lines[0]?.trim() || 'Analysis complete';
  }

  // ===========================================================================
  // Result Creation
  // ===========================================================================

  private createResult(
    request: FrameAnalysisRequest,
    data: {
      concernLevel: ConcernLevel;
      description: string;
      modelUsed: string;
      inferenceMs: number;
      triageResult?: string;
      detailedResult?: string;
      usedCloudFallback: boolean;
    }
  ): FrameAnalysisResult {
    return {
      id: generateId(),
      streamId: request.streamId,
      scenario: request.scenario,
      concernLevel: data.concernLevel,
      description: data.description,
      modelUsed: data.modelUsed,
      inferenceMs: data.inferenceMs,
      createdAt: now(),
      triageResult: data.triageResult,
      detailedResult: data.detailedResult,
      usedCloudFallback: data.usedCloudFallback,
    };
  }

  // ===========================================================================
  // Stats
  // ===========================================================================

  getStats(): {
    analysisCount: number;
    cloudFallbackCount: number;
    cloudFallbackRate: number;
  } {
    return {
      analysisCount: this.analysisCount,
      cloudFallbackCount: this.cloudFallbackCount,
      cloudFallbackRate:
        this.analysisCount > 0 ? this.cloudFallbackCount / this.analysisCount : 0,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultAnalyzer: FrameAnalyzer | null = null;

export function getDefaultFrameAnalyzer(): FrameAnalyzer {
  if (!defaultAnalyzer) {
    defaultAnalyzer = new FrameAnalyzer();
  }
  return defaultAnalyzer;
}




































