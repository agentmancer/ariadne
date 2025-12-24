/**
 * Launch Frontier Model Comparison Study
 *
 * Runs sessions with frontier models (Claude, GPT-4, Gemini) as baselines to compare
 * against local Ollama models.
 * Design: 2×3×3 factorial (Team/Individual × 3 Templates × 3 Models) with N=5 per cell = 90 total
 *
 * This runs alongside the main study (720 Ollama sessions) to provide rigorous comparison.
 *
 * Usage:
 *   node launch-frontier-study.js [--dry-run] [--provider=anthropic|openai|google|all]
 *
 *   API keys should be set in .env:
 *     ANTHROPIC_API_KEY=sk-ant-...
 *     OPENAI_API_KEY=sk-...
 *     GOOGLE_API_KEY=...
 */

const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();

// Frontier model configurations
// Pricing per 1K tokens (standard synchronous API - required for interactive playthroughs)
// Note: Batch API offers 50% discount but requires async processing (not suitable for interactive)
const FRONTIER_MODELS = {
  anthropic: {
    provider: 'anthropic',
    model: 'claude-opus-4-5-20251101',
    envKey: 'ANTHROPIC_API_KEY',
    costPer1kInput: 0.005,   // $5/MTok
    costPer1kOutput: 0.025,  // $25/MTok
  },
  openai: {
    provider: 'openai',
    model: 'gpt-5.2',
    envKey: 'OPENAI_API_KEY',
    costPer1kInput: 0.010,   // $10/MTok (estimated)
    costPer1kOutput: 0.030,  // $30/MTok (estimated)
  },
  google: {
    provider: 'google',
    model: 'gemini-3-pro-preview',
    envKey: 'GOOGLE_API_KEY',
    costPer1kInput: 0.005,   // $5/MTok (estimated)
    costPer1kOutput: 0.015,  // $15/MTok (estimated)
  },
};

// Study configuration
const CONFIG = {
  // Same templates as main study
  templates: [
    'jade_dragon_mystery',
    'romance_fantasy',
    'action_thriller'
  ],

  // Same modes as main study
  modes: ['individual', 'team'],

  // Fewer replications due to API cost - 5 per cell × 3 providers = 15 total per mode×template
  participantsPerCell: 5,

  // LLM settings
  temperature: 0.7,
  maxTokens: 1000,
  timeoutMs: 120000,  // 2 minutes (frontier models are fast)
};

async function createFrontierStudy(dryRun = false, selectedProviders = ['all']) {
  // Determine which providers to run
  let providers = [];
  if (selectedProviders.includes('all')) {
    providers = Object.keys(FRONTIER_MODELS);
  } else {
    providers = selectedProviders.filter(p => FRONTIER_MODELS[p]);
  }

  if (providers.length === 0) {
    console.error('ERROR: No valid providers selected!');
    console.error('Valid providers: anthropic, openai, google, all');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FDG 2026 FRONTIER MODEL COMPARISON STUDY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Configuration:');
  console.log(`  Providers:   ${providers.join(', ')}`);
  console.log(`  Models:`);
  for (const p of providers) {
    console.log(`    - ${FRONTIER_MODELS[p].provider}: ${FRONTIER_MODELS[p].model}`);
  }
  console.log(`  Modes:       ${CONFIG.modes.join(', ')}`);
  console.log(`  Templates:   ${CONFIG.templates.join(', ')}`);
  console.log(`  Per cell:    ${CONFIG.participantsPerCell}`);
  const totalSessions = providers.length * CONFIG.modes.length * CONFIG.templates.length * CONFIG.participantsPerCell;
  console.log(`  Total:       ${totalSessions} (${providers.length} providers × ${CONFIG.modes.length} modes × ${CONFIG.templates.length} templates × ${CONFIG.participantsPerCell} reps)`);
  console.log('');

  // Check for API keys
  const missingKeys = [];
  for (const p of providers) {
    const { envKey } = FRONTIER_MODELS[p];
    const key = process.env[envKey];
    if (!key || key.includes('your-') || key.includes('-here')) {
      missingKeys.push(`  ${envKey} (for ${p})`);
    }
  }

  if (missingKeys.length > 0) {
    console.error('ERROR: Missing API keys!');
    console.error('Please configure in .env:');
    missingKeys.forEach(k => console.error(k));
    process.exit(1);
  }

  if (dryRun) {
    console.log('[DRY RUN] Would create study with above configuration');
    console.log('');

    // Estimate costs
    console.log('Estimated costs (assuming ~10K tokens per session):');
    let totalCost = 0;
    for (const p of providers) {
      const { costPer1kInput, costPer1kOutput } = FRONTIER_MODELS[p];
      const sessionsPerProvider = CONFIG.modes.length * CONFIG.templates.length * CONFIG.participantsPerCell;
      const costPerSession = (costPer1kInput * 8) + (costPer1kOutput * 2);  // ~8K input, ~2K output
      const providerCost = sessionsPerProvider * costPerSession;
      console.log(`  ${p}: $${providerCost.toFixed(2)} (${sessionsPerProvider} sessions)`);
      totalCost += providerCost;
    }
    console.log(`  TOTAL: $${totalCost.toFixed(2)}`);
    console.log('');
    return;
  }

  // Find or create the project
  let project = await prisma.project.findFirst({
    where: { name: 'FDG 2026 Main Study' }
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'FDG 2026 Main Study',
        description: 'Main study: Silent Bard - Team (SIG) vs Individual AI collaboration',
        researcherId: 'cmhxqdlvn0000115advxqdcdh',  // Default researcher
      }
    });
    console.log(`Created project: ${project.id}`);
  }

  // Create the frontier study
  const studyConfig = {
    modes: CONFIG.modes,
    models: providers.map(p => FRONTIER_MODELS[p].model),
    providers: providers,
    templates: CONFIG.templates,
    participantsPerCell: CONFIG.participantsPerCell,
    totalConditions: providers.length * CONFIG.modes.length * CONFIG.templates.length,
    totalSessions: totalSessions,
    frontierComparison: true,
  };

  const study = await prisma.study.create({
    data: {
      projectId: project.id,
      name: `FDG Frontier Study - ${new Date().toISOString().split('T')[0]}`,
      description: `Frontier model comparison (${providers.join(', ')}): 2×3×${providers.length} factorial, N=${CONFIG.participantsPerCell} per cell`,
      type: 'SINGLE_PARTICIPANT',
      config: JSON.stringify(studyConfig),
    }
  });
  console.log(`Created study: ${study.id}`);
  console.log('');

  // Create batches and participants
  const queue = new Queue('synthetic-execution', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    }
  });

  let totalQueued = 0;

  for (const providerKey of providers) {
    const { provider, model } = FRONTIER_MODELS[providerKey];

    for (const mode of CONFIG.modes) {
      for (const template of CONFIG.templates) {
        // Create batch
        const modelShort = model.replace(/[:.]/g, '-').replace('claude-3-5-', 'claude35-').replace('gemini-1.5-', 'gemini15-');
        const batchName = `${mode}_${modelShort}_${template.split('_')[0]}`;

        const batch = await prisma.batchExecution.create({
          data: {
            studyId: study.id,
            name: batchName,
            status: 'RUNNING',
            actorsCreated: CONFIG.participantsPerCell,
            actorsCompleted: 0,
            config: JSON.stringify({
              mode,
              model,
              template,
              provider,
            }),
          }
        });

        console.log(`Created batch: ${batchName}`);

        // Create participants and queue jobs
        for (let i = 1; i <= CONFIG.participantsPerCell; i++) {
          const uniqueId = `${mode}_${modelShort}_${template.split('_')[0]}-${i}`;

          const llmConfig = {
            provider,
            model,
            temperature: CONFIG.temperature,
            maxTokens: CONFIG.maxTokens,
            timeoutMs: CONFIG.timeoutMs,
          };

          const participant = await prisma.participant.create({
            data: {
              studyId: study.id,
              uniqueId,
              actorType: 'SYNTHETIC',
              role: 'PLAYER',
              llmConfig: JSON.stringify(llmConfig),
              batchId: batch.id,
              state: 'PENDING',
              metadata: JSON.stringify({
                createdByBatch: batch.id,
                batchIndex: i,
                frontierModel: true,
                providerKey,
              }),
            }
          });

          // Queue execution job
          const jobData = {
            participantId: participant.id,
            studyId: study.id,
            batchExecutionId: batch.id,
            llmConfig,
            taskConfig: {
              maxActions: 50,
              timeoutMs: CONFIG.timeoutMs,
              pluginType: 'dynamic-story',
              storyTemplate: template,
              teamMode: mode === 'team',
              criticLlmConfig: mode === 'team' ? {
                provider,
                model,
                temperature: 0.5,
                maxTokens: CONFIG.maxTokens,
              } : undefined,
            }
          };

          await queue.add('execute-synthetic', jobData, {
            jobId: `frontier-${participant.id}`,
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
          });

          totalQueued++;
        }
      }
    }
  }

  await queue.close();
  await prisma.$disconnect();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  QUEUED ${totalQueued} FRONTIER MODEL SESSIONS`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Monitor progress with:');
  console.log(`  node monitor-study.js ${study.id}`);
  console.log('');
}

// Parse args
const dryRun = process.argv.includes('--dry-run');

// Parse --provider=X argument
let selectedProviders = ['all'];
const providerArg = process.argv.find(arg => arg.startsWith('--provider='));
if (providerArg) {
  const value = providerArg.split('=')[1];
  selectedProviders = value.split(',').map(p => p.trim().toLowerCase());
}

createFrontierStudy(dryRun, selectedProviders).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
