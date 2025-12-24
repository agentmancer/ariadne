#!/usr/bin/env tsx
/**
 * Hybrid Human-AI Study Setup Script
 *
 * Creates a study where human participants interact with AI partners:
 * - Human uses Twine through the postMessage interface (browser-based)
 * - AI agent uses headless tools/APIs
 * - They exchange stories and feedback across rounds
 *
 * Usage:
 *   cd packages/api
 *   pnpm tsx scripts/setup-hybrid-study.ts
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - API key for Anthropic Claude
 *   OPENAI_API_KEY - API key for OpenAI (alternative)
 *   LLM_PROVIDER - 'anthropic' or 'openai' (default: anthropic)
 *   LLM_MODEL - Model name (default: claude-sonnet-4-20250514)
 *   ROUNDS - Number of rounds (default: 3)
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  ParticipantType,
  CollaborativePhase,
  HybridStudyConfig,
} from '@ariadne/shared';

const prisma = new PrismaClient();

// Configuration from environment
const config = {
  provider: process.env.LLM_PROVIDER || 'anthropic',
  model: process.env.LLM_MODEL || (process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514'),
  rounds: parseInt(process.env.ROUNDS || '3', 10),
  apiPort: parseInt(process.env.PORT || '3002', 10),
  webPort: parseInt(process.env.WEB_PORT || '5173', 10),
};

// Synthetic partner persona - emulates a novice creative writer
const SYNTHETIC_PARTNER_PERSONA = `You are a creative writing partner participating in a collaborative interactive fiction study.

## Your Background
- You are an enthusiastic but novice writer learning to create interactive stories
- You enjoy mystery and adventure genres
- You appreciate constructive feedback and try to incorporate suggestions

## Your Approach
- When writing stories (AUTHOR phase): Create engaging branching narratives with meaningful choices
- When playing stories (PLAY phase): Explore thoughtfully, making choices that feel natural
- When reviewing (REVIEW phase): Provide supportive, constructive feedback that helps your partner improve

## Important
- Be genuinely engaged with your partner's creative work
- Offer specific, actionable suggestions
- Celebrate what works well while gently noting areas for improvement
- Remember previous rounds and build on shared experiences`;

async function main() {
  console.log('='.repeat(70));
  console.log('Ariadne Hybrid Human-AI Study Setup');
  console.log('='.repeat(70));
  console.log();

  // Check for API keys
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

  if (!hasAnthropicKey && !hasOpenAIKey) {
    console.error('Error: No API keys found.');
    console.error('Set either ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  if (config.provider === 'anthropic' && !hasAnthropicKey) {
    console.warn('Warning: ANTHROPIC_API_KEY not set, falling back to OpenAI');
    config.provider = 'openai';
    config.model = 'gpt-4o';
  }

  console.log('Configuration:');
  console.log(`  LLM Provider: ${config.provider}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Rounds: ${config.rounds}`);
  console.log(`  API Port: ${config.apiPort}`);
  console.log(`  Web Port: ${config.webPort}`);
  console.log();

  // Step 1: Create or find test researcher
  console.log('Step 1: Setting up researcher...');
  let researcher = await prisma.researcher.findFirst({
    where: { email: 'hybrid-test@ariadne.local' },
  });

  if (!researcher) {
    researcher = await prisma.researcher.create({
      data: {
        email: 'hybrid-test@ariadne.local',
        passwordHash: '$2b$10$test-password-hash',
        name: 'Hybrid Study Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    console.log(`  Created researcher: ${researcher.id}`);
  } else {
    console.log(`  Using existing researcher: ${researcher.id}`);
  }

  // Step 2: Create or find test project
  console.log('Step 2: Setting up project...');
  let project = await prisma.project.findFirst({
    where: {
      researcherId: researcher.id,
      name: 'Hybrid Human-AI Studies',
    },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Hybrid Human-AI Studies',
        description: 'Studies pairing human participants with AI partners',
        researcherId: researcher.id,
      },
    });
    console.log(`  Created project: ${project.id}`);
  } else {
    console.log(`  Using existing project: ${project.id}`);
  }

  // Step 3: Create agent definition for synthetic partner
  console.log('Step 3: Creating agent definition...');
  let agentDefinition = await prisma.agentDefinition.findFirst({
    where: {
      name: 'Novice Writing Partner',
      researcherId: researcher.id,
    },
  });

  if (!agentDefinition) {
    agentDefinition = await prisma.agentDefinition.create({
      data: {
        name: 'Novice Writing Partner',
        description: 'AI partner that emulates a novice creative writer',
        role: 'COLLABORATIVE',
        systemPrompt: SYNTHETIC_PARTNER_PERSONA,
        llmConfig: JSON.stringify({
          provider: config.provider,
          model: config.model,
          temperature: 0.8,
          maxTokens: 4096,
        }),
        toolUseMode: 'AGENTIC',
        enabledTools: JSON.stringify(['CREATE_PASSAGE', 'EDIT_PASSAGE', 'NAVIGATE_TO', 'MAKE_CHOICE', 'ADD_COMMENT']),
        researcherId: researcher.id,
      },
    });
    console.log(`  Created agent definition: ${agentDefinition.id}`);
  } else {
    console.log(`  Using existing agent definition: ${agentDefinition.id}`);
  }

  // Step 4: Create hybrid study configuration
  console.log('Step 4: Creating hybrid study...');
  const hybridConfig: HybridStudyConfig = {
    studyType: 'PAIRED_COLLABORATIVE',
    executionMode: 'ASYNCHRONOUS',
    collaboration: {
      pairingMode: 'HUMAN_AI',
      rounds: config.rounds,
      phasesPerRound: [
        CollaborativePhase.AUTHOR,
        CollaborativePhase.PLAY,
        CollaborativePhase.REVIEW,
      ],
      feedbackRequired: true,
    },
    phaseTimeLimits: {
      [CollaborativePhase.AUTHOR]: 20 * 60 * 1000, // 20 minutes
      [CollaborativePhase.PLAY]: 10 * 60 * 1000,   // 10 minutes
      [CollaborativePhase.REVIEW]: 10 * 60 * 1000, // 10 minutes
    },
    syntheticPartner: {
      agentDefinitionId: agentDefinition.id,
      responseDelayMs: 5000, // 5 second delay to feel more natural
    },
    maxPlayActions: 20,
  };

  const studyName = `Hybrid Study ${new Date().toISOString().slice(0, 10)}`;
  const study = await prisma.study.create({
    data: {
      projectId: project.id,
      name: studyName,
      description: 'Human-AI collaborative interactive fiction study',
      type: 'PAIRED_COLLABORATIVE',
      status: 'ACTIVE',
      config: JSON.stringify(hybridConfig),
    },
  });
  console.log(`  Created study: ${study.id}`);
  console.log(`  Study name: ${studyName}`);

  // Step 5: Create a test human participant
  console.log('Step 5: Creating test human participant...');
  const humanParticipantId = randomUUID();
  const enrollmentToken = randomUUID().slice(0, 8);

  const humanParticipant = await prisma.participant.create({
    data: {
      id: humanParticipantId,
      studyId: study.id,
      uniqueId: `human-${enrollmentToken}`,
      actorType: 'HUMAN',
      type: 'HUMAN',
      role: 'COLLABORATIVE',
      state: 'ENROLLED',
      metadata: JSON.stringify({
        enrollmentToken,
        pairRole: 'A',
      }),
    },
  });
  console.log(`  Created human participant: ${humanParticipant.id}`);

  // Step 6: Create synthetic partner
  console.log('Step 6: Creating synthetic partner...');
  const syntheticParticipantId = randomUUID();

  const syntheticParticipant = await prisma.participant.create({
    data: {
      id: syntheticParticipantId,
      studyId: study.id,
      uniqueId: `synthetic-${enrollmentToken}`,
      actorType: 'SYNTHETIC',
      type: 'SYNTHETIC',
      role: 'COLLABORATIVE',
      state: 'ENROLLED',
      partnerId: humanParticipantId,
      agentDefinitionId: agentDefinition.id,
      llmConfig: JSON.stringify({
        provider: config.provider,
        model: config.model,
        temperature: 0.8,
        maxTokens: 4096,
      }),
      metadata: JSON.stringify({
        pairRole: 'B',
        persona: 'novice_writer',
      }),
    },
  });
  console.log(`  Created synthetic partner: ${syntheticParticipant.id}`);

  // Update human participant with partner reference
  await prisma.participant.update({
    where: { id: humanParticipantId },
    data: { partnerId: syntheticParticipantId },
  });

  // Step 7: Create session
  console.log('Step 7: Creating session...');
  const session = await prisma.session.create({
    data: {
      name: `Hybrid Session - ${enrollmentToken}`,
      studyId: study.id,
      scheduledStart: new Date(),
      maxParticipants: 2,
      participants: {
        create: [
          { participantId: humanParticipantId },
          { participantId: syntheticParticipantId },
        ],
      },
    },
  });
  console.log(`  Created session: ${session.id}`);

  // Step 8: Initialize agent contexts
  console.log('Step 8: Initializing agent contexts...');
  await prisma.agentContext.createMany({
    data: [
      {
        participantId: humanParticipantId,
        currentRound: 1,
        currentPhase: 'AUTHOR',
        ownStoryDrafts: [],
        partnerStoriesPlayed: [],
        feedbackGiven: [],
        feedbackReceived: [],
        cumulativeLearnings: [],
      },
      {
        participantId: syntheticParticipantId,
        currentRound: 1,
        currentPhase: 'AUTHOR',
        ownStoryDrafts: [],
        partnerStoriesPlayed: [],
        feedbackGiven: [],
        feedbackReceived: [],
        cumulativeLearnings: [],
      },
    ],
  });
  console.log('  Agent contexts initialized');

  // Output summary
  console.log();
  console.log('='.repeat(70));
  console.log('Hybrid Study Setup Complete!');
  console.log('='.repeat(70));
  console.log();
  console.log('Study Configuration:');
  console.log(`  Study ID: ${study.id}`);
  console.log(`  Session ID: ${session.id}`);
  console.log(`  Human Participant: ${humanParticipantId}`);
  console.log(`  Synthetic Partner: ${syntheticParticipantId}`);
  console.log(`  Enrollment Token: ${enrollmentToken}`);
  console.log(`  Rounds: ${config.rounds}`);
  console.log(`  Phases per round: AUTHOR → PLAY → REVIEW`);
  console.log();
  console.log('How it works:');
  console.log('  1. Human creates a story using the Twine editor in browser');
  console.log('  2. Human submits story → AI partner plays it and provides feedback');
  console.log('  3. AI partner creates their story (headless, via API)');
  console.log('  4. Human plays AI story in browser and leaves feedback');
  console.log('  5. Both revise based on feedback, repeat for all rounds');
  console.log();
  console.log('To start the study:');
  console.log();
  console.log('  1. Start the API server:');
  console.log('     cd packages/api && pnpm dev');
  console.log();
  console.log('  2. Start the web app:');
  console.log('     cd packages/web && pnpm dev');
  console.log();
  console.log('  3. Start the hybrid session worker (in another terminal):');
  console.log('     cd packages/api && pnpm tsx src/services/queue/workers/start-hybrid-worker.ts');
  console.log();
  console.log('  4. Access the participant interface:');
  console.log(`     http://localhost:${config.webPort}/session/${session.id}?token=${enrollmentToken}`);
  console.log();
  console.log('  Or use this enrollment URL:');
  console.log(`     http://localhost:${config.webPort}/enroll/${study.id}?token=${enrollmentToken}`);
  console.log();
  console.log('Monitoring:');
  console.log('  - View database: pnpm prisma studio');
  console.log('  - Monitor queue: Check BullMQ dashboard or Redis');
  console.log();

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
