const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();

async function rerunFailed() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get pending participants (already reset from previous run)
  const pending = await prisma.participant.findMany({
    where: { studyId, state: 'PENDING' },
    include: {
      batch: true,
      condition: true,
      study: true
    }
  });

  console.log(`Found ${pending.length} pending participants to re-run`);

  // Queue jobs for re-execution
  const queue = new Queue('synthetic-execution', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    }
  });

  for (const p of pending) {
    const batchParts = (p.batch?.name || '').split('_');
    const mode = batchParts[0];
    const model = batchParts[1];
    const template = batchParts[2];

    const jobData = {
      participantId: p.id,
      studyId: p.studyId,
      ...(p.conditionId && { conditionId: p.conditionId }),
      batchExecutionId: p.batchId,
      llmConfig: {
        provider: 'ollama',
        model: model,
        temperature: 0.7,
        maxTokens: 1000,
      },
      taskConfig: {
        maxActions: 50,
        timeoutMs: 600000, // 10 minutes for CPU inference
        pluginType: 'dynamic-story',
        storyTemplate: template,
        teamMode: mode === 'team',
        criticLlmConfig: mode === 'team' ? {
          provider: 'ollama',
          model: model,
          temperature: 0.5,
          maxTokens: 1000,
        } : undefined,
      }
    };

    await queue.add('execute-synthetic', jobData, {
      jobId: `rerun-${p.id}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });

    console.log(`Queued: ${p.id} (${mode}/${model}/${template})`);
  }

  await queue.close();
  await prisma.$disconnect();

  console.log(`\nQueued ${pending.length} jobs for re-execution`);
}

rerunFailed().catch(console.error);
