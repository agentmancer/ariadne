#!/usr/bin/env tsx
/**
 * Start Queue Workers
 *
 * Starts all background workers needed for collaborative and hybrid studies.
 *
 * Usage:
 *   cd packages/api
 *   pnpm tsx scripts/start-workers.ts
 *
 * Workers started:
 *   - Batch Creation Worker
 *   - Synthetic Execution Worker
 *   - Collaborative Batch Worker
 *   - Collaborative Session Worker
 *   - Hybrid Session Worker (for human-AI studies)
 *   - Data Export Worker
 */

import {
  startBatchCreationWorker,
  startSyntheticExecutionWorker,
  startCollaborativeBatchWorker,
  startCollaborativeSessionWorker,
  startHybridSessionWorker,
  startDataExportWorker,
  stopAllWorkers,
} from '../src/services/queue/workers';

async function main() {
  console.log('='.repeat(60));
  console.log('Ariadne Queue Workers');
  console.log('='.repeat(60));
  console.log();

  console.log('Starting workers...');

  // Start all workers
  startBatchCreationWorker();
  console.log('  ✓ Batch Creation Worker');

  startSyntheticExecutionWorker();
  console.log('  ✓ Synthetic Execution Worker');

  startCollaborativeBatchWorker();
  console.log('  ✓ Collaborative Batch Worker');

  startCollaborativeSessionWorker();
  console.log('  ✓ Collaborative Session Worker');

  startHybridSessionWorker();
  console.log('  ✓ Hybrid Session Worker');

  startDataExportWorker();
  console.log('  ✓ Data Export Worker');

  console.log();
  console.log('All workers started. Press Ctrl+C to stop.');
  console.log();

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down workers...');
    await stopAllWorkers();
    console.log('Workers stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('Error starting workers:', error);
  process.exit(1);
});
