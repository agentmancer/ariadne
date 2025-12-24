import { PrismaClient } from '@prisma/client';
import { addBatchCreationJob } from './src/services/queue/queues';

const prisma = new PrismaClient();

async function main() {
  const batchId = 'cmj644wlt000vavpsgapf8097';
  
  const batch = await prisma.batchExecution.findUnique({
    where: { id: batchId }
  });
  
  if (!batch) {
    console.log('Batch not found');
    return;
  }
  
  const config = JSON.parse(batch.config as string);
  const agentDef = await prisma.agentDefinition.findUnique({
    where: { id: config.agentDefinitionId }
  });
  
  if (!agentDef) {
    console.log('Agent def not found');
    return;
  }
  
  const llmConfig = agentDef.llmConfig ? JSON.parse(agentDef.llmConfig as string) : {};
  
  await addBatchCreationJob({
    batchExecutionId: batch.id,
    studyId: batch.studyId,
    actorCount: config.count,
    role: agentDef.role as any,
    llmConfig: {
      provider: llmConfig.provider || 'anthropic',
      model: llmConfig.model || 'claude-sonnet-4-20250514',
      systemPrompt: agentDef.systemPrompt || undefined,
    },
    agentDefinitionId: config.agentDefinitionId,
    taskConfig: {
      pluginType: 'dynamic-story',
      maxActions: 20,
    },
  });
  
  console.log('Queued batch with dynamic-story plugin');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);
