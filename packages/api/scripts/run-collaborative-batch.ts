#!/usr/bin/env tsx
/**
 * Collaborative Batch Test Script
 *
 * This script sets up and runs a synthetic actor collaborative batch
 * that emulates the original dyad study design:
 * - Two AI actors create interactive stories
 * - They play and comment on each other's works
 * - They integrate feedback into iterations
 *
 * Usage:
 *   cd packages/api
 *   pnpm tsx scripts/run-collaborative-batch.ts
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - API key for Anthropic Claude
 *   OPENAI_API_KEY - API key for OpenAI (alternative)
 *   LLM_PROVIDER - 'anthropic' or 'openai' (default: anthropic)
 *   LLM_MODEL - Model name (default: claude-sonnet-4-20250514 or gpt-4o)
 *   PAIR_COUNT - Number of pairs to run (default: 1)
 *   ROUNDS - Number of rounds (default: 2)
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Configuration from environment
const config = {
  provider: process.env.LLM_PROVIDER || 'anthropic',
  model: process.env.LLM_MODEL || (process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514'),
  pairCount: parseInt(process.env.PAIR_COUNT || '1', 10),
  rounds: parseInt(process.env.ROUNDS || '2', 10),
  apiPort: parseInt(process.env.PORT || '3002', 10),
};

async function main() {
  console.log('='.repeat(60));
  console.log('Ariadne Collaborative Batch Setup');
  console.log('Emulating Original Dyad Study Design');
  console.log('='.repeat(60));
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

  if (config.provider === 'openai' && !hasOpenAIKey) {
    console.warn('Warning: OPENAI_API_KEY not set, falling back to Anthropic');
    config.provider = 'anthropic';
    config.model = 'claude-sonnet-4-20250514';
  }

  console.log('Configuration:');
  console.log(`  LLM Provider: ${config.provider}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Pairs: ${config.pairCount}`);
  console.log(`  Rounds: ${config.rounds}`);
  console.log();

  // Step 1: Create or find test researcher
  console.log('Step 1: Setting up test researcher...');
  let researcher = await prisma.researcher.findFirst({
    where: { email: 'synthetic-test@ariadne.local' },
  });

  if (!researcher) {
    researcher = await prisma.researcher.create({
      data: {
        email: 'synthetic-test@ariadne.local',
        passwordHash: '$2b$10$test-password-hash', // Not for real auth
        name: 'Synthetic Test Runner',
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
  console.log('Step 2: Setting up test project...');
  let project = await prisma.project.findFirst({
    where: {
      researcherId: researcher.id,
      name: 'FDG 2026 Synthetic Study',
    },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'FDG 2026 Synthetic Study',
        description: 'Collaborative dyad study with synthetic actors',
        researcherId: researcher.id,
      },
    });
    console.log(`  Created project: ${project.id}`);
  } else {
    console.log(`  Using existing project: ${project.id}`);
  }

  // Step 3: Create study for this batch
  console.log('Step 3: Creating study...');
  const studyName = `Collaborative Batch ${new Date().toISOString().slice(0, 19)}`;
  const study = await prisma.study.create({
    data: {
      projectId: project.id,
      name: studyName,
      description: 'Synthetic actor collaborative study emulating original dyad design',
      type: 'PAIRED_COLLABORATIVE',
      status: 'ACTIVE',
      config: JSON.stringify({
        collaborative: true,
        rounds: config.rounds,
        phases: ['AUTHOR', 'PLAY', 'REVIEW'],
        storyConstraints: {
          genre: 'mystery',
          theme: 'discovery',
          minPassages: 5,
          maxPassages: 12,
        },
      }),
    },
  });
  console.log(`  Created study: ${study.id}`);
  console.log(`  Study name: ${studyName}`);

  // Step 4: Create batch execution record
  console.log('Step 4: Creating batch execution...');
  const batchConfig = {
    collaborative: true,
    pairCount: config.pairCount,
    sessionConfig: {
      rounds: config.rounds,
      phases: ['AUTHOR', 'PLAY', 'REVIEW'],
      feedbackRequired: true,
      maxPlayActions: 20,
      storyConstraints: {
        genre: 'mystery',
        theme: 'discovery',
        minPassages: 5,
        maxPassages: 12,
      },
    },
    llmConfig: {
      provider: config.provider,
      model: config.model,
      temperature: 0.8,
      maxTokens: 4096,
    },
    varyPartnerConfig: false,
    priority: 'NORMAL',
  };

  const batch = await prisma.batchExecution.create({
    data: {
      studyId: study.id,
      name: `Collaborative Batch - ${config.pairCount} pair(s), ${config.rounds} rounds`,
      description: 'Test batch for FDG 2026 paper',
      type: 'SIMULATION',
      status: 'QUEUED',
      config: JSON.stringify(batchConfig),
    },
  });
  console.log(`  Created batch: ${batch.id}`);

  // Step 5: Output the API call to start the batch
  console.log();
  console.log('='.repeat(60));
  console.log('Setup Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('Database entities created:');
  console.log(`  Researcher: ${researcher.id}`);
  console.log(`  Project: ${project.id}`);
  console.log(`  Study: ${study.id}`);
  console.log(`  Batch: ${batch.id}`);
  console.log();
  console.log('To start the batch via API, run:');
  console.log();

  const apiCall = {
    studyId: study.id,
    name: batch.name,
    description: batch.description,
    pairCount: config.pairCount,
    sessionConfig: batchConfig.sessionConfig,
    llmConfig: batchConfig.llmConfig,
  };

  console.log(`curl -X POST http://localhost:${config.apiPort}/api/v1/batch-executions/collaborative \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \\`);
  console.log(`  -d '${JSON.stringify(apiCall, null, 2)}'`);
  console.log();
  console.log('Or to test the worker directly, run:');
  console.log(`  pnpm tsx scripts/run-collaborative-session.ts ${batch.id}`);
  console.log();

  // Clean up
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  prisma.$disconnect();
  process.exit(1);
});
