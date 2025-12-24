const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeTimeoutDetails() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  const participants = await prisma.participant.findMany({
    where: { studyId },
    select: { id: true, batchId: true, state: true }
  });
  const batches = await prisma.batchExecution.findMany({ where: { studyId } });
  const batchMap = {};
  batches.forEach(b => { batchMap[b.id] = b.name; });

  const participantMap = {};
  participants.forEach(p => {
    const parts = (batchMap[p.batchId] || '').split('_');
    participantMap[p.id] = { mode: parts[0], model: parts[1], template: parts[2], state: p.state };
  });

  const participantIds = participants.map(p => p.id);

  const timeouts = await prisma.event.findMany({
    where: {
      participantId: { in: participantIds },
      type: 'SYNTHETIC_TIMEOUT'
    }
  });

  console.log('=== TIMEOUT ANALYSIS ===');
  console.log('Total timeouts:', timeouts.length);

  const byCondition = {};
  timeouts.forEach(e => {
    const pInfo = participantMap[e.participantId];
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}

    const key = pInfo.mode + '_' + pInfo.model;
    if (!byCondition[key]) byCondition[key] = { count: 0, durations: [], actions: [] };
    byCondition[key].count++;
    if (data.duration) byCondition[key].durations.push(data.duration / 1000);
    if (data.actionsExecuted !== undefined) byCondition[key].actions.push(data.actionsExecuted);
  });

  console.log('\n=== TIMEOUTS BY MODE × MODEL ===');
  for (const [key, stats] of Object.entries(byCondition).sort((a,b) => b[1].count - a[1].count)) {
    const avgDur = stats.durations.length ? (stats.durations.reduce((a,b)=>a+b,0)/stats.durations.length).toFixed(0) : 'N/A';
    const avgAct = stats.actions.length ? (stats.actions.reduce((a,b)=>a+b,0)/stats.actions.length).toFixed(1) : 'N/A';
    const maxDur = stats.durations.length ? Math.max(...stats.durations).toFixed(0) : 'N/A';
    console.log(`${key.padEnd(25)}: ${stats.count} timeouts, avg duration: ${avgDur}s (max: ${maxDur}s), avg actions: ${avgAct}`);
  }

  // Analyze duration distribution
  const allDurations = [];
  timeouts.forEach(e => {
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}
    if (data.duration) allDurations.push(data.duration / 1000);
  });

  if (allDurations.length > 0) {
    allDurations.sort((a, b) => a - b);
    console.log('\n=== TIMEOUT DURATION DISTRIBUTION ===');
    console.log('Min:', allDurations[0].toFixed(0), 's');
    console.log('25th percentile:', allDurations[Math.floor(allDurations.length * 0.25)].toFixed(0), 's');
    console.log('Median:', allDurations[Math.floor(allDurations.length * 0.5)].toFixed(0), 's');
    console.log('75th percentile:', allDurations[Math.floor(allDurations.length * 0.75)].toFixed(0), 's');
    console.log('Max:', allDurations[allDurations.length - 1].toFixed(0), 's');

    // How many would be saved with different timeout values?
    console.log('\n=== TIMEOUTS AVOIDED WITH LONGER TIMEOUT ===');
    [360, 420, 480, 540, 600].forEach(threshold => {
      const avoided = allDurations.filter(d => d > threshold).length;
      const pct = (avoided / allDurations.length * 100).toFixed(1);
      console.log(`${threshold}s (${threshold/60}min): ${avoided} timeouts would complete (${pct}% of current timeouts)`);
    });
  }

  // Actions completed before timeout
  const allActions = [];
  timeouts.forEach(e => {
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}
    if (data.actionsExecuted !== undefined) allActions.push(data.actionsExecuted);
  });

  if (allActions.length > 0) {
    console.log('\n=== ACTIONS COMPLETED BEFORE TIMEOUT ===');
    const actionDist = {};
    allActions.forEach(a => { actionDist[a] = (actionDist[a] || 0) + 1; });
    for (const [acts, count] of Object.entries(actionDist).sort((a,b) => Number(a[0]) - Number(b[0]))) {
      const bar = '█'.repeat(Math.min(count, 30));
      console.log(`${acts.padStart(2)} actions: ${bar} (${count})`);
    }

    const zeroActionTimeouts = allActions.filter(a => a === 0).length;
    console.log(`\n${zeroActionTimeouts} timeouts (${(zeroActionTimeouts/allActions.length*100).toFixed(1)}%) completed 0 actions - likely LLM connection issues`);
  }

  // Sample timeout data
  console.log('\n=== SAMPLE TIMEOUT DATA ===');
  timeouts.slice(0, 3).forEach((e, i) => {
    const pInfo = participantMap[e.participantId];
    console.log(`\nSample ${i+1} [${pInfo.mode}/${pInfo.model}/${pInfo.template}]:`);
    console.log(e.data ? e.data.substring(0, 500) : '(no data)');
  });

  await prisma.$disconnect();
}

analyzeTimeoutDetails().catch(console.error);
