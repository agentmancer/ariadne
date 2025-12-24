const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function exportStudyData() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get all participants for this study with events
  const participants = await prisma.participant.findMany({
    where: { studyId },
    include: {
      events: true,
      storyPlaythroughSessions: true
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

  // Process data for export
  const rows = [];

  for (const p of participants) {
    const batchName = batchMap[p.batchId] || 'unknown';
    const parts = batchName.split('_');
    const mode = parts[0] || 'unknown';
    const model = parts[1] || 'unknown';
    const template = parts[2] || 'unknown';

    // Get event metrics
    const events = p.events || [];
    const actionCount = events.filter(e => e.type === 'ACTION_SELECTED' || e.type === 'action_selected').length;
    const passageCount = events.filter(e => e.type === 'PASSAGE_DISPLAYED' || e.type === 'passage_displayed').length;
    const sessionStartCount = events.filter(e => e.type === 'session_started' || e.type === 'SESSION_STARTED').length;
    const sessionEndCount = events.filter(e => e.type === 'session_ended' || e.type === 'SESSION_ENDED').length;

    // Get playthrough session metrics
    const playthroughs = p.storyPlaythroughSessions || [];
    let totalScenes = 0;
    for (const pt of playthroughs) {
      totalScenes += pt.scenesReached || 0;
    }

    rows.push({
      participantId: p.id,
      batchName,
      mode,
      model,
      template,
      state: p.state,
      totalEvents: events.length,
      actionCount,
      passageCount,
      scenesReached: totalScenes,
      sessionStartCount,
      sessionEndCount,
      completedAt: p.completedAt
    });
  }

  // Write CSV
  const header = 'participantId,batchName,mode,model,template,state,totalEvents,actionCount,passageCount,scenesReached,sessionStartCount,sessionEndCount,completedAt\n';
  const csv = header + rows.map(r =>
    [r.participantId, r.batchName, r.mode, r.model, r.template, r.state, r.totalEvents, r.actionCount, r.passageCount, r.scenesReached, r.sessionStartCount, r.sessionEndCount, r.completedAt || ''].join(',')
  ).join('\n');

  fs.writeFileSync('/tmp/fdg-pilot-export.csv', csv);
  console.log('Exported ' + rows.length + ' participants to /tmp/fdg-pilot-export.csv');

  // Summary stats
  console.log('\n=== SUMMARY ===');
  const completed = rows.filter(r => r.state === 'COMPLETE');
  const excluded = rows.filter(r => r.state === 'EXCLUDED');
  console.log('Total participants: ' + rows.length);
  console.log('Completed: ' + completed.length);
  console.log('Excluded: ' + excluded.length);

  // Events summary
  console.log('\nTotal events: ' + rows.reduce((sum, r) => sum + r.totalEvents, 0));
  console.log('Total actions: ' + rows.reduce((sum, r) => sum + r.actionCount, 0));
  console.log('Total passages: ' + rows.reduce((sum, r) => sum + r.passageCount, 0));

  // Actions by mode
  const byMode = {};
  completed.forEach(r => {
    if (!byMode[r.mode]) byMode[r.mode] = { count: 0, actions: 0, events: 0 };
    byMode[r.mode].count++;
    byMode[r.mode].actions += r.actionCount;
    byMode[r.mode].events += r.totalEvents;
  });

  console.log('\nBy Mode:');
  for (const [mode, data] of Object.entries(byMode)) {
    console.log('  ' + mode + ': ' + data.actions + ' actions, ' + data.events + ' events across ' + data.count + ' sessions (avg actions: ' + (data.actions/data.count).toFixed(1) + ')');
  }

  // Actions by model
  const byModel = {};
  completed.forEach(r => {
    if (!byModel[r.model]) byModel[r.model] = { count: 0, actions: 0, events: 0 };
    byModel[r.model].count++;
    byModel[r.model].actions += r.actionCount;
    byModel[r.model].events += r.totalEvents;
  });

  console.log('\nBy Model:');
  for (const [model, data] of Object.entries(byModel)) {
    console.log('  ' + model + ': ' + data.actions + ' actions, ' + data.events + ' events across ' + data.count + ' sessions (avg actions: ' + (data.actions/data.count).toFixed(1) + ')');
  }

  // Actions by template
  const byTemplate = {};
  completed.forEach(r => {
    if (!byTemplate[r.template]) byTemplate[r.template] = { count: 0, actions: 0, events: 0 };
    byTemplate[r.template].count++;
    byTemplate[r.template].actions += r.actionCount;
    byTemplate[r.template].events += r.totalEvents;
  });

  console.log('\nBy Template:');
  for (const [template, data] of Object.entries(byTemplate)) {
    console.log('  ' + template + ': ' + data.actions + ' actions, ' + data.events + ' events across ' + data.count + ' sessions (avg actions: ' + (data.actions/data.count).toFixed(1) + ')');
  }

  // Event type breakdown
  console.log('\n=== EVENT TYPES ===');
  const allEvents = participants.flatMap(p => p.events || []);
  const eventTypes = {};
  allEvents.forEach(e => {
    eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
  });
  for (const [type, count] of Object.entries(eventTypes).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + type + ': ' + count);
  }

  await prisma.$disconnect();
}

exportStudyData().catch(console.error);
