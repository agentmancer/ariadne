import { PrismaClient } from '@prisma/client';
import { addBatchCreationJob } from './src/services/queue/queues';

const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.batchExecution.findMany({
    where: { status: 'QUEUED' }
  });
  
  console.log(`Found ${batches.length} queued batches`);
  
  for (const batch of batches) {
    const config = JSON.parse(batch.config as string);
    const agentDef = await prisma.agentDefinition.findUnique({
      where: { id: config.agentDefinitionId }
    });
    
    if (!agentDef) {
      console.log(`Skipping batch ${batch.id} - no agent def`);
      continue;
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
    });
    
    console.log(`Queued batch ${batch.id}`);
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);
