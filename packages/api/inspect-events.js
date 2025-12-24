const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectEvents() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get participant IDs
  const participants = await prisma.participant.findMany({
    where: { studyId },
    select: { id: true }
  });
  const participantIds = participants.map(p => p.id);

  // Get sample events of each type
  const eventTypes = ['SYNTHETIC_ACTION', 'TEAM_ACTION', 'SESSION_START', 'SESSION_END', 'SYNTHETIC_TIMEOUT', 'SYNTHETIC_ERROR'];

  for (const type of eventTypes) {
    const events = await prisma.event.findMany({
      where: {
        participantId: { in: participantIds },
        type: type
      },
      take: 2
    });

    console.log('\n=== ' + type + ' (sample) ===');
    events.forEach((e, i) => {
      console.log('Event ' + (i+1) + ':');
      console.log('  context: ' + (e.context || '(none)'));
      console.log('  data: ' + (e.data || '(none)').substring(0, 500));
    });
  }

  await prisma.$disconnect();
}

inspectEvents().catch(console.error);
