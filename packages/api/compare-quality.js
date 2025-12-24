const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function compareQuality() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get participants
  const participants = await prisma.participant.findMany({
    where: { studyId },
    select: { id: true, batchId: true }
  });
  const batches = await prisma.batchExecution.findMany({ where: { studyId } });
  const batchMap = {};
  batches.forEach(b => { batchMap[b.id] = b.name; });

  const participantMap = {};
  participants.forEach(p => {
    const parts = (batchMap[p.batchId] || '').split('_');
    participantMap[p.id] = { mode: parts[0], model: parts[1], template: parts[2] };
  });

  const participantIds = participants.map(p => p.id);

  // Get action events
  const events = await prisma.event.findMany({
    where: {
      participantId: { in: participantIds },
      type: { in: ['SYNTHETIC_ACTION', 'TEAM_ACTION'] }
    }
  });

  // Extract reasoning quality metrics
  const individualReasons = [];
  const teamReasons = [];

  events.forEach(e => {
    const pInfo = participantMap[e.participantId];
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}

    let reasoning = '';
    let choiceText = '';

    if (e.type === 'SYNTHETIC_ACTION') {
      reasoning = data.reasoning || data.actionParams?._llmReasoning || '';
      choiceText = data.actionParams?.choiceText || '';
      if (reasoning || choiceText) {
        individualReasons.push({
          model: pInfo.model,
          template: pInfo.template,
          reasoning,
          choiceText,
          reasoningLength: reasoning.length,
          choiceLength: choiceText.length
        });
      }
    } else if (e.type === 'TEAM_ACTION') {
      reasoning = data.proposerReasoning || '';
      choiceText = data.proposedChoiceText || '';
      if (reasoning) {
        teamReasons.push({
          model: pInfo.model,
          template: pInfo.template,
          reasoning,
          choiceText,
          reasoningLength: reasoning.length,
          choiceLength: choiceText.length,
          hasCritique: !!data.criticFeedback,
          critiqueLength: (data.criticFeedback || '').length
        });
      }
    }
  });

  console.log('=== REASONING QUALITY COMPARISON ===\n');

  // Length stats
  const avgLen = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

  const indivLengths = individualReasons.map(r => r.reasoningLength);
  const teamLengths = teamReasons.map(r => r.reasoningLength);

  console.log('Reasoning Length (characters):');
  console.log('  Individual: n=' + indivLengths.length + ', avg=' + avgLen(indivLengths));
  console.log('  Team:       n=' + teamLengths.length + ', avg=' + avgLen(teamLengths));

  // By model
  console.log('\nReasoning Length by Model:');
  const models = ['llama3.2:3b', 'qwen2.5vl:7b', 'gemma3:27b', 'deepcoder:14b'];
  models.forEach(m => {
    const indiv = individualReasons.filter(r => r.model === m).map(r => r.reasoningLength);
    const team = teamReasons.filter(r => r.model === m).map(r => r.reasoningLength);
    console.log('  ' + m + ':');
    console.log('    Individual: n=' + indiv.length + ', avg=' + avgLen(indiv));
    console.log('    Team:       n=' + team.length + ', avg=' + avgLen(team));
  });

  // Sample comparisons - same model, same template
  console.log('\n=== SAMPLE REASONING COMPARISON (qwen2.5vl:7b, jade) ===\n');

  const indivSample = individualReasons.find(r => r.model === 'qwen2.5vl:7b' && r.template === 'jade' && r.reasoning.length > 50);
  const teamSample = teamReasons.find(r => r.model === 'qwen2.5vl:7b' && r.template === 'jade' && r.reasoning.length > 50);

  if (indivSample) {
    console.log('INDIVIDUAL reasoning:');
    console.log('  "' + indivSample.reasoning.substring(0, 400) + '..."');
    console.log('  Choice: ' + indivSample.choiceText.substring(0, 100));
  }

  if (teamSample) {
    console.log('\nTEAM proposer reasoning:');
    console.log('  "' + teamSample.reasoning.substring(0, 400) + '..."');
  }

  // Word count analysis
  const countWords = s => (s || '').split(/\s+/).filter(w => w.length > 0).length;

  console.log('\n=== WORD COUNT ANALYSIS ===');
  const indivWords = individualReasons.map(r => countWords(r.reasoning));
  const teamWords = teamReasons.map(r => countWords(r.reasoning));

  console.log('Individual reasoning words: avg=' + avgLen(indivWords) + ', max=' + Math.max(...indivWords));
  console.log('Team reasoning words:       avg=' + avgLen(teamWords) + ', max=' + Math.max(...teamWords));

  // Export samples for manual review
  const samples = [];
  models.forEach(m => {
    ['jade', 'romance', 'action'].forEach(t => {
      const indiv = individualReasons.filter(r => r.model === m && r.template === t).slice(0, 2);
      const team = teamReasons.filter(r => r.model === m && r.template === t).slice(0, 2);
      indiv.forEach(r => samples.push({ mode: 'individual', model: m, template: t, reasoning: r.reasoning, choice: r.choiceText }));
      team.forEach(r => samples.push({ mode: 'team', model: m, template: t, reasoning: r.reasoning, choice: r.choiceText }));
    });
  });

  const sampleCsv = 'mode,model,template,reasoning,choice\n' +
    samples.map(s => [
      s.mode,
      s.model,
      s.template,
      '"' + (s.reasoning || '').replace(/"/g, '""').replace(/\n/g, ' ').substring(0, 1000) + '"',
      '"' + (s.choice || '').replace(/"/g, '""').substring(0, 200) + '"'
    ].join(',')).join('\n');

  fs.writeFileSync('/tmp/fdg-pilot-reasoning-samples.csv', sampleCsv);
  console.log('\nExported ' + samples.length + ' samples to /tmp/fdg-pilot-reasoning-samples.csv');

  await prisma.$disconnect();
}

compareQuality().catch(console.error);
