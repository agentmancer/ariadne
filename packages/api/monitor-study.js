/**
 * Monitor main study progress
 * Usage: node monitor-study.js [studyId]
 */

const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();

async function monitor() {
  const studyId = process.argv[2] || 'cmj6lumk90001ylma094pomgo';

  const queue = new Queue('synthetic-execution', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    }
  });

  const counts = await queue.getJobCounts();

  // Get participant states
  const states = await prisma.participant.groupBy({
    by: ['state'],
    where: { studyId },
    _count: true
  });

  // Get batch progress
  const batches = await prisma.batchExecution.findMany({
    where: { studyId },
    select: {
      name: true,
      status: true,
      actorsCreated: true,
      actorsCompleted: true
    }
  });

  const stateMap = {};
  states.forEach(s => { stateMap[s.state] = s._count; });

  const total = Object.values(stateMap).reduce((a, b) => a + b, 0);
  const complete = stateMap['COMPLETE'] || 0;
  const excluded = stateMap['EXCLUDED'] || 0;
  const active = stateMap['ACTIVE'] || 0;
  const pending = stateMap['PENDING'] || 0;

  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FDG 2026 MAIN STUDY MONITOR');
  console.log('  Study ID: ' + studyId);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('QUEUE STATUS:');
  console.log('  Active:    ' + counts.active.toString().padStart(4));
  console.log('  Waiting:   ' + counts.waiting.toString().padStart(4));
  console.log('  Delayed:   ' + counts.delayed.toString().padStart(4));
  console.log('  Failed:    ' + counts.failed.toString().padStart(4));
  console.log('');
  console.log('PARTICIPANT STATUS:');
  console.log('  Complete:  ' + complete.toString().padStart(4) + ' / ' + total);
  console.log('  Active:    ' + active.toString().padStart(4));
  console.log('  Pending:   ' + pending.toString().padStart(4));
  console.log('  Excluded:  ' + excluded.toString().padStart(4));
  console.log('');
  console.log('PROGRESS: ' + (100 * complete / total).toFixed(1) + '%');
  console.log('');

  // Show batch summary
  const batchSummary = batches.reduce((acc, b) => {
    const parts = b.name.split('_');
    const mode = parts[0];
    const model = parts[1];
    if (!acc[mode]) acc[mode] = {};
    if (!acc[mode][model]) acc[mode][model] = { created: 0, completed: 0 };
    acc[mode][model].created += b.actorsCreated;
    acc[mode][model].completed += b.actorsCompleted;
    return acc;
  }, {});

  console.log('BY MODE × MODEL:');
  for (const mode of ['individual', 'team']) {
    console.log('  ' + mode.toUpperCase() + ':');
    for (const model of Object.keys(batchSummary[mode] || {})) {
      const s = batchSummary[mode][model];
      console.log('    ' + model.padEnd(15) + ': ' + s.completed + '/' + s.created);
    }
  }

  console.log('');
  console.log('Last updated: ' + new Date().toLocaleTimeString());

  await queue.close();
  await prisma.$disconnect();
}

monitor().catch(console.error);
