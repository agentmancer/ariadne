#!/usr/bin/env tsx
/**
 * Multi-Model Collaborative Study Comparison
 *
 * Runs synthetic dyad studies across multiple LLM providers for comparison.
 * Useful for validating the pipeline and comparing model capabilities.
 *
 * Usage:
 *   cd packages/api
 *
 *   # Run Haiku validation (fast, cheap)
 *   pnpm tsx scripts/run-model-comparison.ts --model haiku
 *
 *   # Run specific provider
 *   pnpm tsx scripts/run-model-comparison.ts --provider anthropic --model claude-sonnet-4-20250514
 *
 *   # Run all frontier models
 *   pnpm tsx scripts/run-model-comparison.ts --all-frontier
 *
 *   # Run with multiple pairs
 *   pnpm tsx scripts/run-model-comparison.ts --model haiku --pairs 3
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Required for Anthropic models
 *   OPENAI_API_KEY - Required for OpenAI models
 *   GOOGLE_API_KEY - Required for Gemini models
 */

// Load environment variables from .env file
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CollaborativePhase } from '@ariadne/shared';
import {
  CollaborativeSessionOrchestrator,
  CollaborativeSessionConfig,
} from '../src/services/collaborative/orchestrator';
import { createLLMClient } from '../src/services/llm/clients/factory';
import {
  getOrCreateAgentContext,
} from '../src/services/collaborative/agent-context';

const prisma = new PrismaClient();

// Model presets
const MODEL_PRESETS: Record<string, { provider: string; model: string; tier: string }> = {
  // Anthropic
  'haiku': { provider: 'anthropic', model: 'claude-3-5-haiku-latest', tier: 'small' },
  'sonnet': { provider: 'anthropic', model: 'claude-sonnet-4-20250514', tier: 'frontier' },
  'opus': { provider: 'anthropic', model: 'claude-opus-4-20250514', tier: 'frontier' },
  'opus-4.5': { provider: 'anthropic', model: 'claude-opus-4-5-20251101', tier: 'frontier' },

  // OpenAI
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', tier: 'small' },
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', tier: 'legacy' },
  'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo', tier: 'legacy' },
  'gpt-5': { provider: 'openai', model: 'gpt-5', tier: 'frontier' },
  'gpt-5.2': { provider: 'openai', model: 'gpt-5.2', tier: 'frontier' },

  // Google
  'gemini-flash': { provider: 'google', model: 'gemini-2.0-flash', tier: 'small' },
  'gemini-pro': { provider: 'google', model: 'gemini-2.5-pro', tier: 'frontier' },

  // Local models (Ollama)
  'qwq-32b': { provider: 'ollama', model: 'qwq:32b', tier: 'local-reasoning' },
  'qwen-14b': { provider: 'ollama', model: 'qwen2.5:14b-instruct-q4_K_M', tier: 'local' },
  'gemma3-27b': { provider: 'ollama', model: 'gemma3:27b', tier: 'local' },
};

// Frontier models for comparison study (cloud + local)
const FRONTIER_MODELS = ['sonnet', 'opus-4.5', 'gpt-5.2', 'gemini-pro', 'qwen-14b'];

// Novice persona for realistic study replication
const NOVICE_PERSONA = `You are participating in a collaborative interactive fiction study as a NOVICE writer.

## Your Background
- You are NEW to interactive fiction and branching narratives
- You have basic writing skills but limited experience with choice-based storytelling
- You're enthusiastic but still learning what makes choices meaningful

## Constraints (Important!)
- Keep stories SHORT: 5-8 passages maximum
- Use SIMPLE branching: mostly linear with 1-2 choice points
- Write in a casual, conversational style (not polished prose)
- Make some common novice mistakes:
  * Choices that don't meaningfully affect the story
  * Abrupt endings
  * Telling rather than showing
  * Inconsistent tone

## Your Approach
- AUTHOR phase: Create a simple mystery or adventure story with basic choices
- PLAY phase: Explore your partner's story, noting what confuses or delights you
- REVIEW phase: Give honest, helpful feedback as a peer learner

## Remember
- You're learning alongside your partner
- Be supportive but honest in feedback
- Don't write like an expert - embrace your novice perspective`;

interface RunConfig {
  provider: string;
  model: string;
  rounds: number;
  pairs: number;
  persona: string;
  temperature: number;
}

interface PairResult {
  pairIndex: number;
  participantAId: string;
  participantBId: string;
  rounds: Array<{
    round: number;
    phases: Array<{
      phase: string;
      participant: string;
      success: boolean;
      durationMs: number;
      error?: string;
    }>;
  }>;
  totalDurationMs: number;
  storiesCreated: number;
  commentsCreated: number;
}

interface ModelResult {
  provider: string;
  model: string;
  tier: string;
  pairs: PairResult[];
  summary: {
    totalPairs: number;
    successfulPairs: number;
    avgDurationMs: number;
    avgStoriesPerPair: number;
    avgCommentsPerPair: number;
    phaseSuccessRate: number;
  };
}

async function runPair(
  config: RunConfig,
  pairIndex: number,
  studyId: string
): Promise<PairResult> {
  const startTime = Date.now();

  // Create participants
  const participantAId = randomUUID();
  const participantBId = randomUUID();
  const timestamp = Date.now().toString(36);

  await prisma.participant.createMany({
    data: [
      {
        id: participantAId,
        studyId,
        uniqueId: `${config.model}-${timestamp}-${pairIndex}-A`,
        actorType: 'SYNTHETIC',
        type: 'SYNTHETIC',
        role: 'COLLABORATIVE',
        state: 'ENROLLED',
        partnerId: participantBId,
        llmConfig: JSON.stringify({
          provider: config.provider,
          model: config.model,
          temperature: config.temperature,
        }),
        metadata: JSON.stringify({ pairRole: 'A', persona: 'novice' }),
      },
      {
        id: participantBId,
        studyId,
        uniqueId: `${config.model}-${timestamp}-${pairIndex}-B`,
        actorType: 'SYNTHETIC',
        type: 'SYNTHETIC',
        role: 'COLLABORATIVE',
        state: 'ENROLLED',
        partnerId: participantAId,
        llmConfig: JSON.stringify({
          provider: config.provider,
          model: config.model,
          temperature: config.temperature,
        }),
        metadata: JSON.stringify({ pairRole: 'B', persona: 'novice' }),
      },
    ],
  });

  // Initialize agent contexts
  await getOrCreateAgentContext(participantAId);
  await getOrCreateAgentContext(participantBId);

  // Create LLM client
  // GPT-5.x reasoning models need more tokens for internal reasoning + output
  // Reasoning models accumulate context from transcripts/comments so need 32k+
  const isReasoningModel = config.model.startsWith('gpt-5') || config.model.startsWith('o1') || config.model.startsWith('o3');
  const llmClient = createLLMClient({
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    maxTokens: isReasoningModel ? 32768 : 4096,
  });

  // Create orchestrator
  const orchestratorConfig: CollaborativeSessionConfig = {
    rounds: config.rounds,
    phases: [CollaborativePhase.AUTHOR, CollaborativePhase.PLAY, CollaborativePhase.REVIEW],
    feedbackRequired: true,
    maxPlayActions: 15,
    storyConstraints: {
      genre: 'mystery',
      theme: 'discovery',
      minPassages: 4,
      maxPassages: 8,
    },
    systemPrompt: config.persona,
  };
  const orchestrator = new CollaborativeSessionOrchestrator(orchestratorConfig);

  // Initialize session
  const { agentA, agentB } = await orchestrator.initializeSession(
    participantAId,
    participantBId
  );
  agentA.llm = llmClient;
  agentB.llm = llmClient;

  // Run session
  const rounds: PairResult['rounds'] = [];

  const result = await orchestrator.runSession(agentA, agentB, (event) => {
    // Track phase results
    let roundData = rounds.find(r => r.round === event.round);
    if (!roundData) {
      roundData = { round: event.round, phases: [] };
      rounds.push(roundData);
    }

    if (event.status === 'complete' || event.status === 'error') {
      roundData.phases.push({
        phase: event.phase,
        participant: event.agent,
        success: event.status === 'complete',
        durationMs: event.durationMs || 0,
        error: event.error,
      });
    }
  });

  const totalDurationMs = Date.now() - startTime;

  // Count stories and comments
  const storiesCreated = await prisma.storyData.count({
    where: { participantId: { in: [participantAId, participantBId] } },
  });

  const commentsCreated = await prisma.comment.count({
    where: {
      OR: [
        { authorId: { in: [participantAId, participantBId] } },
        { targetParticipantId: { in: [participantAId, participantBId] } },
      ],
    },
  });

  return {
    pairIndex,
    participantAId,
    participantBId,
    rounds,
    totalDurationMs,
    storiesCreated,
    commentsCreated,
  };
}

async function runModel(
  provider: string,
  model: string,
  tier: string,
  rounds: number,
  pairs: number,
  persona: string
): Promise<ModelResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Running: ${provider}/${model} (${tier})`);
  console.log(`Pairs: ${pairs}, Rounds: ${rounds}`);
  console.log('='.repeat(70));

  // Create study for this model run
  let researcher = await prisma.researcher.findFirst({
    where: { email: 'model-comparison@ariadne.local' },
  });
  if (!researcher) {
    researcher = await prisma.researcher.create({
      data: {
        email: 'model-comparison@ariadne.local',
        passwordHash: '$2b$10$test',
        name: 'Model Comparison Runner',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
  }

  let project = await prisma.project.findFirst({
    where: { researcherId: researcher.id, name: 'Model Comparison Studies' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Model Comparison Studies',
        description: 'Automated model comparison for Ariadne',
        researcherId: researcher.id,
      },
    });
  }

  const study = await prisma.study.create({
    data: {
      projectId: project.id,
      name: `${model} Comparison - ${new Date().toISOString().slice(0, 19)}`,
      description: `Model comparison run: ${provider}/${model}`,
      type: 'PAIRED_COLLABORATIVE',
      status: 'ACTIVE',
      config: JSON.stringify({ provider, model, rounds, pairs }),
    },
  });

  const config: RunConfig = {
    provider,
    model,
    rounds,
    pairs,
    persona,
    temperature: 0.8,
  };

  const pairResults: PairResult[] = [];

  for (let i = 0; i < pairs; i++) {
    console.log(`\n  Pair ${i + 1}/${pairs}...`);
    try {
      const result = await runPair(config, i, study.id);
      pairResults.push(result);

      const successCount = result.rounds.flatMap(r => r.phases).filter(p => p.success).length;
      const totalPhases = result.rounds.flatMap(r => r.phases).length;
      console.log(`    ✓ Completed in ${(result.totalDurationMs / 1000).toFixed(1)}s`);
      console.log(`      Phases: ${successCount}/${totalPhases}, Stories: ${result.storiesCreated}, Comments: ${result.commentsCreated}`);
    } catch (error) {
      console.log(`    ✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      pairResults.push({
        pairIndex: i,
        participantAId: '',
        participantBId: '',
        rounds: [],
        totalDurationMs: 0,
        storiesCreated: 0,
        commentsCreated: 0,
      });
    }
  }

  // Calculate summary
  const successfulPairs = pairResults.filter(p => p.rounds.length > 0);
  const allPhases = pairResults.flatMap(p => p.rounds.flatMap(r => r.phases));
  const successfulPhases = allPhases.filter(p => p.success);

  return {
    provider,
    model,
    tier,
    pairs: pairResults,
    summary: {
      totalPairs: pairs,
      successfulPairs: successfulPairs.length,
      avgDurationMs: successfulPairs.length > 0
        ? successfulPairs.reduce((sum, p) => sum + p.totalDurationMs, 0) / successfulPairs.length
        : 0,
      avgStoriesPerPair: successfulPairs.length > 0
        ? successfulPairs.reduce((sum, p) => sum + p.storiesCreated, 0) / successfulPairs.length
        : 0,
      avgCommentsPerPair: successfulPairs.length > 0
        ? successfulPairs.reduce((sum, p) => sum + p.commentsCreated, 0) / successfulPairs.length
        : 0,
      phaseSuccessRate: allPhases.length > 0
        ? successfulPhases.length / allPhases.length
        : 0,
    },
  };
}

function printSummary(results: ModelResult[]) {
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(70));

  console.log('\n| Model | Tier | Pairs | Success | Avg Time | Stories | Comments | Phase Success |');
  console.log('|-------|------|-------|---------|----------|---------|----------|---------------|');

  for (const r of results) {
    const avgTime = (r.summary.avgDurationMs / 1000).toFixed(1) + 's';
    const successRate = (r.summary.phaseSuccessRate * 100).toFixed(0) + '%';
    console.log(
      `| ${r.model.slice(0, 20).padEnd(20)} | ${r.tier.padEnd(8)} | ` +
      `${r.summary.totalPairs.toString().padStart(5)} | ${r.summary.successfulPairs.toString().padStart(7)} | ` +
      `${avgTime.padStart(8)} | ${r.summary.avgStoriesPerPair.toFixed(1).padStart(7)} | ` +
      `${r.summary.avgCommentsPerPair.toFixed(1).padStart(8)} | ${successRate.padStart(13)} |`
    );
  }

  console.log('\n');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let modelPreset: string | null = null;
  let provider: string | null = null;
  let model: string | null = null;
  let allFrontier = false;
  let rounds = 2;
  let pairs = 2;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
      case '-m':
        modelPreset = args[++i];
        break;
      case '--provider':
      case '-p':
        provider = args[++i];
        break;
      case '--all-frontier':
        allFrontier = true;
        break;
      case '--rounds':
      case '-r':
        rounds = parseInt(args[++i], 10);
        break;
      case '--pairs':
      case '-n':
        pairs = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        console.log(`
Ariadne Model Comparison Script

Usage:
  pnpm tsx scripts/run-model-comparison.ts [options]

Options:
  --model, -m <preset>    Use a model preset (haiku, sonnet, gpt-4o-mini, etc.)
  --provider, -p <name>   Specify provider (anthropic, openai, google)
  --all-frontier          Run all frontier models for comparison
  --rounds, -r <n>        Number of rounds per pair (default: 2)
  --pairs, -n <n>         Number of pairs to run (default: 2)
  --help, -h              Show this help

Model Presets:
  Small (validation):  haiku, gpt-4o-mini, gemini-flash
  Frontier:            sonnet, gpt-5, gemini-pro
  Legacy:              gpt-4o, gpt-4-turbo

Examples:
  # Quick Haiku validation
  pnpm tsx scripts/run-model-comparison.ts --model haiku --pairs 2

  # Full frontier comparison
  pnpm tsx scripts/run-model-comparison.ts --all-frontier --pairs 3 --rounds 3
        `);
        process.exit(0);
    }
  }

  // Default to Haiku if nothing specified
  if (!modelPreset && !provider && !allFrontier) {
    modelPreset = 'haiku';
  }

  console.log('='.repeat(70));
  console.log('Ariadne Model Comparison Study');
  console.log('='.repeat(70));

  const results: ModelResult[] = [];

  if (allFrontier) {
    // Run all frontier models
    for (const preset of FRONTIER_MODELS) {
      const config = MODEL_PRESETS[preset];
      if (!config) continue;

      // Check API key
      const envKey = config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
        : config.provider === 'openai' ? 'OPENAI_API_KEY'
        : 'GOOGLE_API_KEY';

      if (!process.env[envKey]) {
        console.log(`\nSkipping ${preset}: ${envKey} not set`);
        continue;
      }

      const result = await runModel(
        config.provider,
        config.model,
        config.tier,
        rounds,
        pairs,
        NOVICE_PERSONA
      );
      results.push(result);
    }
  } else if (modelPreset) {
    // Run specific preset
    const config = MODEL_PRESETS[modelPreset];
    if (!config) {
      console.error(`Unknown model preset: ${modelPreset}`);
      console.error(`Available: ${Object.keys(MODEL_PRESETS).join(', ')}`);
      process.exit(1);
    }

    const result = await runModel(
      config.provider,
      config.model,
      config.tier,
      rounds,
      pairs,
      NOVICE_PERSONA
    );
    results.push(result);
  } else if (provider && model) {
    // Run custom provider/model
    const result = await runModel(
      provider,
      model,
      'custom',
      rounds,
      pairs,
      NOVICE_PERSONA
    );
    results.push(result);
  }

  printSummary(results);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
