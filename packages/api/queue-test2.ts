import { PrismaClient } from '@prisma/client';
import { addBatchCreationJob } from './src/services/queue/queues';

const prisma = new PrismaClient();

async function main() {
  // Create new batch
  const batch = await prisma.batchExecution.create({
    data: {
      studyId: 'cmj6306ph0001avpsedmym5c4',
      name: 'Test: dynamic-story',
      type: 'SIMULATION',
      status: 'QUEUED',
      config: JSON.stringify({ count: 1 })
    }
  });
  
  console.log('Created batch:', batch.id);
  
  const agentDef = await prisma.agentDefinition.findFirst();
  
  await addBatchCreationJob({
    batchExecutionId: batch.id,
    studyId: batch.studyId,
    actorCount: 1,
    role: 'PLAYER',
    llmConfig: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
    agentDefinitionId: agentDef?.id,
    taskConfig: {
      pluginType: 'dynamic-story',
      maxActions: 5, // Small test
    },
  });
  
  console.log('Queued batch with dynamic-story plugin');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);
