const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function queryEvents() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get all participants with their batch info
  const participants = await prisma.participant.findMany({
    where: { studyId },
    select: {
      id: true,
      batchId: true,
      state: true
    }
  });

  // Get batch info
  const batches = await prisma.batchExecution.findMany({
    where: { studyId }
  });

  const batchMap = {};
  batches.forEach(b => {
    batchMap[b.id] = b.name;
  });

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

  // Get all events for this study's participants
  const participantIds = participants.map(p => p.id);
  const events = await prisma.event.findMany({
    where: {
      participantId: { in: participantIds }
    },
    orderBy: [
      { participantId: 'asc' },
      { timestamp: 'asc' }
    ]
  });

  console.log('Total events: ' + events.length);

  // Analyze action sequences
  const actionEvents = events.filter(e =>
    e.type === 'SYNTHETIC_ACTION' || e.type === 'TEAM_ACTION'
  );

  console.log('\n=== ACTION EVENTS ===');
  console.log('Total action events: ' + actionEvents.length);

  // Parse action data and extract details
  const actionDetails = [];

  for (const event of actionEvents) {
    const pInfo = participantMap[event.participantId];
    let data = {};
    try {
      data = JSON.parse(event.data || '{}');
    } catch (e) {}

    actionDetails.push({
      participantId: event.participantId,
      mode: pInfo.mode,
      model: pInfo.model,
      template: pInfo.template,
      type: event.type,
      timestamp: event.timestamp,
      actionText: data.action || data.selectedAction || data.text || '',
      revised: data.revised || false,
      critiqueAccepted: data.critiqueAccepted || null,
      reasoning: data.reasoning || '',
      context: event.context || ''
    });
  }

  // Write detailed CSV
  const header = 'participantId,mode,model,template,eventType,timestamp,actionText,revised,critiqueAccepted,context\n';
  const csv = header + actionDetails.map(a =>
    [
      a.participantId,
      a.mode,
      a.model,
      a.template,
      a.type,
      a.timestamp.toISOString(),
      '"' + (a.actionText || '').replace(/"/g, '""').substring(0, 200) + '"',
      a.revised,
      a.critiqueAccepted || '',
      '"' + (a.context || '').replace(/"/g, '""') + '"'
    ].join(',')
  ).join('\n');

  fs.writeFileSync('/tmp/fdg-pilot-actions.csv', csv);
  console.log('\nExported ' + actionDetails.length + ' actions to /tmp/fdg-pilot-actions.csv');

  // Summary by mode
  console.log('\n=== ACTIONS BY MODE ===');
  const byMode = {};
  actionDetails.forEach(a => {
    if (!byMode[a.mode]) byMode[a.mode] = { count: 0, revised: 0 };
    byMode[a.mode].count++;
    if (a.revised) byMode[a.mode].revised++;
  });
  for (const [mode, data] of Object.entries(byMode)) {
    console.log('  ' + mode + ': ' + data.count + ' actions' + (data.revised > 0 ? ' (' + data.revised + ' revised)' : ''));
  }

  // Summary by model
  console.log('\n=== ACTIONS BY MODEL ===');
  const byModel = {};
  actionDetails.forEach(a => {
    if (!byModel[a.model]) byModel[a.model] = 0;
    byModel[a.model]++;
  });
  for (const [model, count] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + model + ': ' + count);
  }

  // Summary by template
  console.log('\n=== ACTIONS BY TEMPLATE ===');
  const byTemplate = {};
  actionDetails.forEach(a => {
    if (!byTemplate[a.template]) byTemplate[a.template] = 0;
    byTemplate[a.template]++;
  });
  for (const [template, count] of Object.entries(byTemplate).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + template + ': ' + count);
  }

  // Actions per session stats
  console.log('\n=== ACTIONS PER SESSION ===');
  const actionsByParticipant = {};
  actionDetails.forEach(a => {
    if (!actionsByParticipant[a.participantId]) {
      actionsByParticipant[a.participantId] = { count: 0, mode: a.mode, model: a.model, template: a.template };
    }
    actionsByParticipant[a.participantId].count++;
  });

  const sessionCounts = Object.values(actionsByParticipant);
  const individualCounts = sessionCounts.filter(s => s.mode === 'individual').map(s => s.count);
  const teamCounts = sessionCounts.filter(s => s.mode === 'team').map(s => s.count);

  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
  const std = arr => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance).toFixed(2);
  };

  console.log('  Individual: mean=' + avg(individualCounts) + ', std=' + std(individualCounts) + ', n=' + individualCounts.length);
  console.log('  Team: mean=' + avg(teamCounts) + ', std=' + std(teamCounts) + ', n=' + teamCounts.length);

  // Sample some action texts
  console.log('\n=== SAMPLE ACTIONS (first 5) ===');
  actionDetails.slice(0, 5).forEach((a, i) => {
    console.log((i+1) + '. [' + a.mode + '/' + a.model + '] ' + (a.actionText || '(no text)').substring(0, 100));
  });

  // Error/timeout analysis
  console.log('\n=== ERRORS & TIMEOUTS ===');
  const errorEvents = events.filter(e => e.type === 'SYNTHETIC_ERROR' || e.type === 'SYNTHETIC_TIMEOUT');
  const errorsByModel = {};
  errorEvents.forEach(e => {
    const pInfo = participantMap[e.participantId];
    const key = pInfo.model + '_' + e.type;
    errorsByModel[key] = (errorsByModel[key] || 0) + 1;
  });
  for (const [key, count] of Object.entries(errorsByModel).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + key + ': ' + count);
  }

  await prisma.$disconnect();
}

queryEvents().catch(console.error);
