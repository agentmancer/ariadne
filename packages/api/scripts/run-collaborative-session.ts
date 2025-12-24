#!/usr/bin/env tsx
/**
 * Direct Collaborative Session Runner
 *
 * Runs a single collaborative session directly (without queue workers)
 * for testing and debugging the orchestrator flow.
 *
 * Usage:
 *   cd packages/api
 *   pnpm tsx scripts/run-collaborative-session.ts [studyId]
 *
 * If no studyId is provided, creates a new study automatically.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - API key for Anthropic Claude
 *   OPENAI_API_KEY - API key for OpenAI (alternative)
 *   LLM_PROVIDER - 'anthropic' or 'openai' (default: anthropic)
 *   LLM_MODEL - Model name (default: claude-sonnet-4-20250514 or gpt-4o)
 *   ROUNDS - Number of rounds (default: 2)
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CollaborativePhase } from '@ariadne/shared';

// Import the orchestrator and LLM client factory
import {
  createOrchestrator,
  CollaborativeSessionConfig,
} from '../src/services/collaborative/orchestrator';
import { createLLMClient } from '../src/services/llm/clients/factory';

const prisma = new PrismaClient();

// Configuration
const config = {
  provider: process.env.LLM_PROVIDER || 'anthropic',
  model: process.env.LLM_MODEL || (process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514'),
  rounds: parseInt(process.env.ROUNDS || '2', 10),
  apiKey: process.env.LLM_PROVIDER === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY,
};

async function setupTestEnvironment(studyId?: string) {
  // Find or create researcher
  let researcher = await prisma.researcher.findFirst({
    where: { email: 'synthetic-test@ariadne.local' },
  });

  if (!researcher) {
    researcher = await prisma.researcher.create({
      data: {
        email: 'synthetic-test@ariadne.local',
        passwordHash: '$2b$10$test-password-hash',
        name: 'Synthetic Test Runner',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
  }

  // Find or create project
  let project = await prisma.project.findFirst({
    where: { researcherId: researcher.id, name: 'FDG 2026 Synthetic Study' },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'FDG 2026 Synthetic Study',
        description: 'Collaborative dyad study with synthetic actors',
        researcherId: researcher.id,
      },
    });
  }

  // Use provided study or create new
  let study;
  if (studyId) {
    study = await prisma.study.findUnique({ where: { id: studyId } });
    if (!study) {
      console.error(`Study ${studyId} not found`);
      process.exit(1);
    }
  } else {
    study = await prisma.study.create({
      data: {
        projectId: project.id,
        name: `Direct Test Session ${new Date().toISOString().slice(0, 19)}`,
        description: 'Direct test of collaborative session orchestrator',
        type: 'PAIRED_COLLABORATIVE',
        status: 'ACTIVE',
        config: JSON.stringify({
          collaborative: true,
          rounds: config.rounds,
          phases: ['AUTHOR', 'PLAY', 'REVIEW'],
        }),
      },
    });
  }

  return { researcher, project, study };
}

async function createParticipantPair(studyId: string) {
  const participantAId = randomUUID();
  const participantBId = randomUUID();
  const timestamp = Date.now().toString(36);

  await prisma.participant.createMany({
    data: [
      {
        id: participantAId,
        studyId,
        uniqueId: `test-${timestamp}-A`,
        actorType: 'SYNTHETIC',
        type: 'SYNTHETIC',
        role: 'COLLABORATIVE',
        state: 'ENROLLED',
        partnerId: participantBId,
        llmConfig: JSON.stringify({
          provider: config.provider,
          model: config.model,
          temperature: 0.8,
        }),
        metadata: JSON.stringify({ pairRole: 'A', persona: 'novice_writer_curious' }),
      },
      {
        id: participantBId,
        studyId,
        uniqueId: `test-${timestamp}-B`,
        actorType: 'SYNTHETIC',
        type: 'SYNTHETIC',
        role: 'COLLABORATIVE',
        state: 'ENROLLED',
        partnerId: participantAId,
        llmConfig: JSON.stringify({
          provider: config.provider,
          model: config.model,
          temperature: 0.8,
        }),
        metadata: JSON.stringify({ pairRole: 'B', persona: 'novice_writer_analytical' }),
      },
    ],
  });

  return { participantAId, participantBId };
}

async function main() {
  const studyIdArg = process.argv[2];

  console.log('='.repeat(70));
  console.log('Ariadne Direct Collaborative Session Runner');
  console.log('='.repeat(70));
  console.log();

  // Validate API key
  if (!config.apiKey) {
    console.error('Error: No API key found.');
    console.error(`Set ${config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable.`);
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Rounds: ${config.rounds}`);
  console.log();

  // Setup
  console.log('Setting up test environment...');
  const { study } = await setupTestEnvironment(studyIdArg);
  console.log(`  Study: ${study.id} (${study.name})`);

  console.log('Creating participant pair...');
  const { participantAId, participantBId } = await createParticipantPair(study.id);
  console.log(`  Participant A: ${participantAId}`);
  console.log(`  Participant B: ${participantBId}`);
  console.log();

  // Create LLM client
  console.log('Initializing LLM client...');
  const llmClient = createLLMClient({
    provider: config.provider,
    model: config.model,
    temperature: 0.8,
    maxTokens: 4096,
    apiKey: config.apiKey,
  });
  console.log('  LLM client ready');
  console.log();

  // Create orchestrator
  console.log('Creating orchestrator...');
  const orchestratorConfig: Partial<CollaborativeSessionConfig> = {
    rounds: config.rounds,
    phases: [CollaborativePhase.AUTHOR, CollaborativePhase.PLAY, CollaborativePhase.REVIEW],
    feedbackRequired: true,
    maxPlayActions: 20,
    storyConstraints: {
      genre: 'mystery',
      theme: 'discovery',
      minPassages: 5,
      maxPassages: 12,
    },
  };
  const orchestrator = createOrchestrator(orchestratorConfig);
  console.log('  Orchestrator created');
  console.log();

  // Initialize session
  console.log('Initializing collaborative session...');
  const { agentA, agentB } = await orchestrator.initializeSession(
    participantAId,
    participantBId
  );

  // Attach LLM clients
  agentA.llm = llmClient;
  agentB.llm = llmClient;
  console.log('  Session initialized');
  console.log();

  // Run the session
  console.log('='.repeat(70));
  console.log('Running Collaborative Session');
  console.log('='.repeat(70));
  console.log();

  const startTime = Date.now();

  const result = await orchestrator.runSession(agentA, agentB, (event) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] Round ${event.round} | ${event.phase} | Agent ${event.agent}: ${event.status}`);
  });

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log('='.repeat(70));
  console.log('Session Complete');
  console.log('='.repeat(70));
  console.log();
  console.log(`Total duration: ${totalDuration}s`);
  console.log(`Rounds completed: ${result.rounds.length}`);
  console.log();

  // Summary of results
  console.log('Results Summary:');
  for (const round of result.rounds) {
    console.log(`\n  Round ${round.round}:`);
    for (const phase of round.results) {
      const status = phase.success ? '✓' : '✗';
      const participant = phase.participantId === participantAId ? 'A' : 'B';
      console.log(`    ${status} ${phase.phase} (Agent ${participant})`);
      if (phase.data) {
        const dataStr = JSON.stringify(phase.data);
        console.log(`      Data: ${dataStr.substring(0, 80)}${dataStr.length > 80 ? '...' : ''}`);
      }
      if (phase.error) {
        console.log(`      Error: ${phase.error}`);
      }
    }
  }

  // Final context summary
  console.log('\nFinal Agent Contexts:');
  console.log(`\n  Agent A (${participantAId.substring(0, 8)}...):`);
  console.log(`    Stories created: ${result.finalContextA.ownStoryDrafts.length}`);
  console.log(`    Partner stories played: ${result.finalContextA.partnerStoriesPlayed.length}`);
  console.log(`    Feedback given: ${result.finalContextA.feedbackGiven.length}`);
  console.log(`    Feedback received: ${result.finalContextA.feedbackReceived.length}`);
  console.log(`    Learnings: ${result.finalContextA.cumulativeLearnings.length}`);

  console.log(`\n  Agent B (${participantBId.substring(0, 8)}...):`);
  console.log(`    Stories created: ${result.finalContextB.ownStoryDrafts.length}`);
  console.log(`    Partner stories played: ${result.finalContextB.partnerStoriesPlayed.length}`);
  console.log(`    Feedback given: ${result.finalContextB.feedbackGiven.length}`);
  console.log(`    Feedback received: ${result.finalContextB.feedbackReceived.length}`);
  console.log(`    Learnings: ${result.finalContextB.cumulativeLearnings.length}`);

  console.log();
  console.log('Database records created:');
  console.log(`  Study: ${study.id}`);
  console.log(`  Participant A: ${participantAId}`);
  console.log(`  Participant B: ${participantBId}`);

  // Check for stories in database
  const storyCount = await prisma.storyData.count({
    where: {
      participantId: { in: [participantAId, participantBId] },
    },
  });
  console.log(`  Story versions saved: ${storyCount}`);

  const commentCount = await prisma.comment.count({
    where: {
      OR: [
        { authorId: { in: [participantAId, participantBId] } },
        { targetParticipantId: { in: [participantAId, participantBId] } },
      ],
    },
  });
  console.log(`  Comments created: ${commentCount}`);

  console.log();
  console.log('To view the data:');
  console.log(`  pnpm prisma studio`);
  console.log();

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
