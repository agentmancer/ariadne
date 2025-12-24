const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function exportActions() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get participants with batch info
  const participants = await prisma.participant.findMany({
    where: { studyId },
    select: { id: true, batchId: true, state: true }
  });

  const batches = await prisma.batchExecution.findMany({ where: { studyId } });
  const batchMap = {};
  batches.forEach(b => { batchMap[b.id] = b.name; });

  const participantMap = {};
  participants.forEach(p => {
    const batchName = batchMap[p.batchId] || 'unknown';
    const parts = batchName.split('_');
    participantMap[p.id] = {
      mode: parts[0] || 'unknown',
      model: parts[1] || 'unknown',
      template: parts[2] || 'unknown',
      state: p.state
    };
  });

  const participantIds = participants.map(p => p.id);

  // Get all action events
  const events = await prisma.event.findMany({
    where: {
      participantId: { in: participantIds },
      type: { in: ['SYNTHETIC_ACTION', 'TEAM_ACTION'] }
    },
    orderBy: [{ participantId: 'asc' }, { timestamp: 'asc' }]
  });

  // Process action data
  const rows = [];
  for (const e of events) {
    const pInfo = participantMap[e.participantId];
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}

    let choiceText = '';
    let reasoning = '';
    let choiceIndex = null;

    if (e.type === 'SYNTHETIC_ACTION') {
      choiceText = data.actionParams?.choiceText || '';
      reasoning = data.reasoning || data.actionParams?._llmReasoning || '';
      choiceIndex = data.actionParams?.choiceIndex ?? data.actionParams?._llmChoiceIndex ?? null;
    } else if (e.type === 'TEAM_ACTION') {
      choiceIndex = data.proposedChoiceIndex ?? data.finalChoiceIndex ?? null;
      reasoning = data.proposerReasoning || data.criticFeedback || '';
      choiceText = data.proposedChoiceText || data.finalChoiceText || '';
    }

    rows.push({
      participantId: e.participantId,
      mode: pInfo.mode,
      model: pInfo.model,
      template: pInfo.template,
      eventType: e.type,
      actionIndex: data.actionIndex || 0,
      choiceIndex: choiceIndex,
      choiceText: choiceText,
      reasoning: reasoning,
      success: data.success ?? true,
      timestamp: e.timestamp.toISOString()
    });
  }

  // Write CSV
  const escape = s => '"' + String(s || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  const header = 'participantId,mode,model,template,eventType,actionIndex,choiceIndex,choiceText,reasoning,success,timestamp\n';
  const csv = header + rows.map(r => [
    r.participantId,
    r.mode,
    r.model,
    r.template,
    r.eventType,
    r.actionIndex,
    r.choiceIndex ?? '',
    escape(r.choiceText.substring(0, 300)),
    escape(r.reasoning.substring(0, 500)),
    r.success,
    r.timestamp
  ].join(',')).join('\n');

  fs.writeFileSync('/tmp/fdg-pilot-actions-detailed.csv', csv);
  console.log('Exported ' + rows.length + ' actions to /tmp/fdg-pilot-actions-detailed.csv');

  // Aggregate stats
  console.log('\n=== ACTIONS PER SESSION BY CONDITION ===');
  const byCondition = {};
  rows.forEach(r => {
    const key = r.mode + '_' + r.model + '_' + r.template;
    if (!byCondition[key]) byCondition[key] = {};
    if (!byCondition[key][r.participantId]) byCondition[key][r.participantId] = 0;
    byCondition[key][r.participantId]++;
  });

  const stats = [];
  for (const [condition, participants] of Object.entries(byCondition)) {
    const counts = Object.values(participants);
    const n = counts.length;
    const mean = counts.reduce((a, b) => a + b, 0) / n;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / (n - 1 || 1);
    const std = Math.sqrt(variance);
    const [mode, model, template] = condition.split('_');
    stats.push({ condition, mode, model, template, n, mean: mean.toFixed(2), std: std.toFixed(2), total: counts.reduce((a,b)=>a+b,0) });
  }

  // Sort by mode then model
  stats.sort((a, b) => a.mode.localeCompare(b.mode) || a.model.localeCompare(b.model));

  console.log('Condition                          | N  | Mean | Std  | Total');
  console.log('-----------------------------------|----:|-----:|-----:|------:');
  stats.forEach(s => {
    const cond = (s.mode + '_' + s.model + '_' + s.template).padEnd(35);
    console.log(cond + '| ' + String(s.n).padStart(2) + ' | ' + s.mean.padStart(4) + ' | ' + s.std.padStart(4) + ' | ' + String(s.total).padStart(5));
  });

  // Grand summary for t-test
  console.log('\n=== SUMMARY FOR STATISTICAL ANALYSIS ===');
  const indivActions = rows.filter(r => r.mode === 'individual');
  const teamActions = rows.filter(r => r.mode === 'team');

  const indivByP = {};
  indivActions.forEach(r => { indivByP[r.participantId] = (indivByP[r.participantId] || 0) + 1; });
  const teamByP = {};
  teamActions.forEach(r => { teamByP[r.participantId] = (teamByP[r.participantId] || 0) + 1; });

  const indivCounts = Object.values(indivByP);
  const teamCounts = Object.values(teamByP);

  const calcStats = arr => {
    const n = arr.length;
    const mean = arr.reduce((a,b) => a+b, 0) / n;
    const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
    return { n, mean, std: Math.sqrt(variance), sum: arr.reduce((a,b)=>a+b,0) };
  };

  const indivStats = calcStats(indivCounts);
  const teamStats = calcStats(teamCounts);

  console.log('Individual: n=' + indivStats.n + ', mean=' + indivStats.mean.toFixed(2) + ', std=' + indivStats.std.toFixed(2) + ', total=' + indivStats.sum);
  console.log('Team:       n=' + teamStats.n + ', mean=' + teamStats.mean.toFixed(2) + ', std=' + teamStats.std.toFixed(2) + ', total=' + teamStats.sum);

  // Effect size (Cohen's d)
  const pooledStd = Math.sqrt(((indivStats.n - 1) * Math.pow(indivStats.std, 2) + (teamStats.n - 1) * Math.pow(teamStats.std, 2)) / (indivStats.n + teamStats.n - 2));
  const cohensD = (indivStats.mean - teamStats.mean) / pooledStd;
  console.log('\nCohen\'s d (Individual - Team): ' + cohensD.toFixed(3));

  // T-test (two-sample, unequal variance - Welch's)
  const se = Math.sqrt(Math.pow(indivStats.std, 2) / indivStats.n + Math.pow(teamStats.std, 2) / teamStats.n);
  const t = (indivStats.mean - teamStats.mean) / se;
  console.log('Welch\'s t-statistic: ' + t.toFixed(3));

  // Sample choice texts
  console.log('\n=== SAMPLE INDIVIDUAL ACTIONS ===');
  rows.filter(r => r.mode === 'individual' && r.choiceText).slice(0, 3).forEach((r, i) => {
    console.log((i+1) + '. [' + r.model + '/' + r.template + '] ' + r.choiceText.substring(0, 100));
  });

  console.log('\n=== SAMPLE TEAM ACTIONS ===');
  rows.filter(r => r.mode === 'team' && r.reasoning).slice(0, 3).forEach((r, i) => {
    console.log((i+1) + '. [' + r.model + '/' + r.template + '] ' + r.reasoning.substring(0, 150));
  });

  await prisma.$disconnect();
}

exportActions().catch(console.error);
