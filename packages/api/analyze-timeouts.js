const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeTimeouts() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get participants
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

  // Get all events
  const events = await prisma.event.findMany({
    where: { participantId: { in: participantIds } }
  });

  // Analyze timeouts and errors
  const timeouts = events.filter(e => e.type === 'SYNTHETIC_TIMEOUT');
  const errors = events.filter(e => e.type === 'SYNTHETIC_ERROR');

  console.log('=== TIMEOUT & ERROR ANALYSIS ===\n');
  console.log('Total timeouts: ' + timeouts.length);
  console.log('Total errors: ' + errors.length);

  // By mode
  console.log('\n=== BY MODE ===');
  const modes = ['individual', 'team'];
  modes.forEach(mode => {
    const modeTimeouts = timeouts.filter(e => participantMap[e.participantId]?.mode === mode);
    const modeErrors = errors.filter(e => participantMap[e.participantId]?.mode === mode);
    const modeParticipants = participants.filter(p => participantMap[p.id]?.mode === mode);
    console.log(mode + ':');
    console.log('  Timeouts: ' + modeTimeouts.length + ' (' + (modeTimeouts.length / modeParticipants.length * 100).toFixed(1) + '% of sessions)');
    console.log('  Errors: ' + modeErrors.length);
  });

  // By model
  console.log('\n=== BY MODEL ===');
  const models = ['llama3.2:3b', 'qwen2.5vl:7b', 'gemma3:27b', 'deepcoder:14b'];
  const modelStats = [];
  models.forEach(model => {
    const modelParticipants = participants.filter(p => participantMap[p.id]?.model === model);
    const modelTimeouts = timeouts.filter(e => participantMap[e.participantId]?.model === model);
    const modelErrors = errors.filter(e => participantMap[e.participantId]?.model === model);
    const excluded = modelParticipants.filter(p => p.state === 'EXCLUDED').length;
    const completed = modelParticipants.filter(p => p.state === 'COMPLETE').length;
    modelStats.push({
      model,
      total: modelParticipants.length,
      completed,
      excluded,
      timeouts: modelTimeouts.length,
      errors: modelErrors.length,
      failRate: ((excluded / modelParticipants.length) * 100).toFixed(1)
    });
    console.log(model + ':');
    console.log('  Sessions: ' + modelParticipants.length + ' (completed: ' + completed + ', excluded: ' + excluded + ')');
    console.log('  Timeouts: ' + modelTimeouts.length + ', Errors: ' + modelErrors.length);
    console.log('  Failure rate: ' + ((excluded / modelParticipants.length) * 100).toFixed(1) + '%');
  });

  // By template
  console.log('\n=== BY TEMPLATE ===');
  const templates = ['jade', 'romance', 'action'];
  templates.forEach(template => {
    const tParticipants = participants.filter(p => participantMap[p.id]?.template === template);
    const tTimeouts = timeouts.filter(e => participantMap[e.participantId]?.template === template);
    const tErrors = errors.filter(e => participantMap[e.participantId]?.template === template);
    const excluded = tParticipants.filter(p => p.state === 'EXCLUDED').length;
    console.log(template + ':');
    console.log('  Sessions: ' + tParticipants.length + ' (excluded: ' + excluded + ')');
    console.log('  Timeouts: ' + tTimeouts.length + ', Errors: ' + tErrors.length);
  });

  // By condition (mode x model)
  console.log('\n=== FAILURE RATE BY CONDITION (mode x model) ===');
  console.log('Condition                    | Total | Completed | Excluded | Fail%');
  console.log('-----------------------------|------:|----------:|---------:|------:');
  modes.forEach(mode => {
    models.forEach(model => {
      const cParticipants = participants.filter(p =>
        participantMap[p.id]?.mode === mode && participantMap[p.id]?.model === model
      );
      if (cParticipants.length === 0) return;
      const completed = cParticipants.filter(p => p.state === 'COMPLETE').length;
      const excluded = cParticipants.filter(p => p.state === 'EXCLUDED').length;
      const failRate = ((excluded / cParticipants.length) * 100).toFixed(1);
      const label = (mode + '_' + model).padEnd(29);
      console.log(label + '| ' + String(cParticipants.length).padStart(5) + ' | ' +
        String(completed).padStart(9) + ' | ' + String(excluded).padStart(8) + ' | ' + failRate.padStart(5) + '%');
    });
  });

  // Error message analysis
  console.log('\n=== ERROR MESSAGES ===');
  const errorMsgs = {};
  errors.forEach(e => {
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}
    const msg = (data.error || 'unknown').substring(0, 80);
    errorMsgs[msg] = (errorMsgs[msg] || 0) + 1;
  });
  for (const [msg, count] of Object.entries(errorMsgs).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + count + 'x: ' + msg);
  }

  // Timeout duration analysis
  console.log('\n=== TIMEOUT DURATIONS ===');
  const durations = timeouts.map(e => {
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}
    return data.duration || 0;
  }).filter(d => d > 0);

  if (durations.length) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    console.log('Average timeout duration: ' + (avgDuration / 1000).toFixed(1) + 's');
    console.log('Min: ' + (Math.min(...durations) / 1000).toFixed(1) + 's');
    console.log('Max: ' + (Math.max(...durations) / 1000).toFixed(1) + 's');
  }

  await prisma.$disconnect();
}

analyzeTimeouts().catch(console.error);
