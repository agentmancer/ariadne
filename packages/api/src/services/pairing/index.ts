/**
 * Partner Pairing Service
 *
 * Handles pairing participants in collaborative studies with support for:
 * - HUMAN_HUMAN: Match human participants based on availability overlap
 * - SYNTHETIC_SYNTHETIC: Pair synthetic agents together
 * - HUMAN_SYNTHETIC: Pair human with LLM-driven synthetic partner
 * - AUTO: System decides based on availability and preferences
 */

import {
  PairingStrategy,
  PairingConfig,
  PairingResult,
  PairingMetadata,
  ParticipantState,
  ActorType,
  HTTP_STATUS,
  ERROR_CODES,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '../../middleware/error-handler';

/**
 * Availability slot for a participant
 */
interface AvailabilitySlot {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

/**
 * Parsed application data with availability
 */
interface ParsedApplication {
  availability?: AvailabilitySlot[];
  timezone?: string;
}

/**
 * Pair participants based on the provided configuration
 */
export async function pairParticipants(config: PairingConfig): Promise<PairingResult[]> {
  const { studyId, strategy, conditionId } = config;

  // Verify study exists and is collaborative
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { id: true, type: true, config: true },
  });

  if (!study) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      `Study not found: ${studyId}`
    );
  }

  // Get unpaired participants
  const whereClause: Record<string, unknown> = {
    studyId,
    partnerId: null,
    state: { in: [ParticipantState.ENROLLED, ParticipantState.SCHEDULED, ParticipantState.CONFIRMED] },
  };

  if (conditionId) {
    whereClause.conditionId = conditionId;
  }

  const participants = await prisma.participant.findMany({
    where: whereClause,
    select: {
      id: true,
      actorType: true,
      type: true,
      application: true,
      agentDefinitionId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  switch (strategy) {
    case PairingStrategy.HUMAN_HUMAN:
      return pairHumanWithHuman(participants, config);
    case PairingStrategy.SYNTHETIC_SYNTHETIC:
      return pairSyntheticWithSynthetic(participants, config);
    case PairingStrategy.HUMAN_SYNTHETIC:
      return pairHumanWithSynthetic(participants, config);
    case PairingStrategy.AUTO:
      return pairAuto(participants, config);
    default:
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        `Unknown pairing strategy: ${strategy}`
      );
  }
}

/**
 * Pair human participants based on availability overlap
 */
async function pairHumanWithHuman(
  participants: Array<{
    id: string;
    actorType: string;
    type: string | null;
    application: unknown;
    agentDefinitionId: string | null;
  }>,
  config: PairingConfig
): Promise<PairingResult[]> {
  const results: PairingResult[] = [];
  const humans = participants.filter(p => p.actorType === ActorType.HUMAN);

  if (humans.length < 2) {
    return results;
  }

  const paired = new Set<string>();
  const minOverlap = config.minOverlapHours ?? 2;

  for (let i = 0; i < humans.length; i++) {
    if (paired.has(humans[i].id)) continue;

    const participantA = humans[i];
    const availabilityA = parseAvailability(participantA.application);

    // Find best match based on availability overlap
    let bestMatch: { participant: typeof humans[0]; overlap: number } | null = null;

    for (let j = i + 1; j < humans.length; j++) {
      if (paired.has(humans[j].id)) continue;

      const participantB = humans[j];
      const availabilityB = parseAvailability(participantB.application);

      const overlap = calculateAvailabilityOverlap(availabilityA, availabilityB);

      if (config.requireAvailabilityOverlap && overlap < minOverlap) {
        continue;
      }

      if (!bestMatch || overlap > bestMatch.overlap) {
        bestMatch = { participant: participantB, overlap };
      }
    }

    if (bestMatch) {
      const pairingResult = await createPairing(
        participantA.id,
        bestMatch.participant.id,
        PairingStrategy.HUMAN_HUMAN,
        {
          matchedBy: 'system',
          overlapHours: bestMatch.overlap,
        }
      );
      results.push(pairingResult);
      paired.add(participantA.id);
      paired.add(bestMatch.participant.id);
    }
  }

  return results;
}

/**
 * Pair synthetic agents together
 */
async function pairSyntheticWithSynthetic(
  participants: Array<{
    id: string;
    actorType: string;
    type: string | null;
    application: unknown;
    agentDefinitionId: string | null;
  }>,
  _config: PairingConfig
): Promise<PairingResult[]> {
  const results: PairingResult[] = [];
  const synthetics = participants.filter(p => p.actorType === ActorType.SYNTHETIC);

  // Simple sequential pairing for synthetics
  for (let i = 0; i < synthetics.length - 1; i += 2) {
    const participantA = synthetics[i];
    const participantB = synthetics[i + 1];

    const pairingResult = await createPairing(
      participantA.id,
      participantB.id,
      PairingStrategy.SYNTHETIC_SYNTHETIC,
      {
        matchedBy: 'system',
        syntheticAgentId: participantA.agentDefinitionId ?? undefined,
      }
    );
    results.push(pairingResult);
  }

  return results;
}

/**
 * Pair human participants with synthetic partners
 */
async function pairHumanWithSynthetic(
  participants: Array<{
    id: string;
    actorType: string;
    type: string | null;
    application: unknown;
    agentDefinitionId: string | null;
  }>,
  config: PairingConfig
): Promise<PairingResult[]> {
  const results: PairingResult[] = [];
  const humans = participants.filter(p => p.actorType === ActorType.HUMAN);
  const synthetics = participants.filter(p => p.actorType === ActorType.SYNTHETIC);

  // Pair each human with an available synthetic
  for (let i = 0; i < humans.length && i < synthetics.length; i++) {
    const human = humans[i];
    const synthetic = synthetics[i];

    const pairingResult = await createPairing(
      human.id,
      synthetic.id,
      PairingStrategy.HUMAN_SYNTHETIC,
      {
        matchedBy: 'system',
        humanRole: config.syntheticRole === 'AUTHOR' ? 'READER' : 'AUTHOR',
        syntheticAgentId: synthetic.agentDefinitionId ?? undefined,
      }
    );
    results.push(pairingResult);
  }

  return results;
}

/**
 * Auto-pairing: try human-human first, fall back to human-synthetic
 */
async function pairAuto(
  participants: Array<{
    id: string;
    actorType: string;
    type: string | null;
    application: unknown;
    agentDefinitionId: string | null;
  }>,
  config: PairingConfig
): Promise<PairingResult[]> {
  const results: PairingResult[] = [];

  if (config.preferHumanPartners !== false) {
    // First, try to pair humans together
    const humanResults = await pairHumanWithHuman(participants, {
      ...config,
      strategy: PairingStrategy.HUMAN_HUMAN,
    });
    results.push(...humanResults);
  }

  // Get remaining unpaired participants
  let pairedIds = new Set(results.flatMap(r => [r.participantId, r.partnerId]));
  const remaining = participants.filter(p => !pairedIds.has(p.id));

  // Pair remaining humans with synthetics
  if (remaining.length > 0) {
    const hybridResults = await pairHumanWithSynthetic(remaining, {
      ...config,
      strategy: PairingStrategy.HUMAN_SYNTHETIC,
    });
    results.push(...hybridResults);

    // Update paired IDs
    pairedIds = new Set(results.flatMap(r => [r.participantId, r.partnerId]));
  }

  // Finally, pair any remaining synthetics together
  const remainingSynthetics = participants.filter(
    p => !pairedIds.has(p.id) && p.actorType === ActorType.SYNTHETIC
  );

  if (remainingSynthetics.length >= 2) {
    const syntheticResults = await pairSyntheticWithSynthetic(remainingSynthetics, {
      ...config,
      strategy: PairingStrategy.SYNTHETIC_SYNTHETIC,
    });
    results.push(...syntheticResults);
  }

  return results;
}

/**
 * Create a pairing between two participants
 */
async function createPairing(
  participantAId: string,
  participantBId: string,
  strategy: PairingStrategy,
  additionalMetadata: Partial<PairingMetadata>
): Promise<PairingResult> {
  const pairedAt = new Date().toISOString();

  const metadata: PairingMetadata = {
    pairedAt,
    strategy,
    matchedBy: additionalMetadata.matchedBy ?? 'system',
    ...additionalMetadata,
  };

  // Update both participants atomically
  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantAId },
      data: {
        partnerId: participantBId,
        pairingMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.participant.update({
      where: { id: participantBId },
      data: {
        partnerId: participantAId,
        pairingMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return {
    participantId: participantAId,
    partnerId: participantBId,
    strategy,
    pairedAt,
    metadata,
  };
}

/**
 * Get the current pairing for a participant
 */
export async function getPairing(participantId: string): Promise<PairingResult | null> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      partnerId: true,
      pairingMetadata: true,
    },
  });

  if (!participant || !participant.partnerId) {
    return null;
  }

  const metadata = (participant.pairingMetadata as unknown as PairingMetadata) || {
    pairedAt: new Date(0).toISOString(),
    strategy: PairingStrategy.AUTO,
    matchedBy: 'system' as const,
  };

  return {
    participantId: participant.id,
    partnerId: participant.partnerId,
    strategy: metadata.strategy,
    pairedAt: metadata.pairedAt,
    metadata,
  };
}

/**
 * Unpair a participant from their current partner
 */
export async function unpairParticipant(participantId: string): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { partnerId: true },
  });

  if (!participant || !participant.partnerId) {
    return;
  }

  // Clear partner references for both participants
  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: { partnerId: null, pairingMetadata: Prisma.DbNull },
    }),
    prisma.participant.update({
      where: { id: participant.partnerId },
      data: { partnerId: null, pairingMetadata: Prisma.DbNull },
    }),
  ]);
}

/**
 * Manually pair two participants (researcher-initiated)
 * Uses interactive transaction with row-level locking to prevent race conditions
 */
export async function manualPair(
  participantAId: string,
  participantBId: string,
  researcherId: string,
  studyId: string
): Promise<PairingResult> {
  const pairedAt = new Date().toISOString();

  // Use interactive transaction to ensure atomicity and prevent race conditions
  return prisma.$transaction(async (tx) => {
    // Lock and fetch both participants using SELECT FOR UPDATE via raw query
    // This prevents concurrent pairing requests from creating conflicts
    const participants = await tx.$queryRaw<Array<{
      id: string;
      study_id: string;
      partner_id: string | null;
      actor_type: string;
    }>>`
      SELECT id, study_id, partner_id, actor_type
      FROM "Participant"
      WHERE id IN (${participantAId}, ${participantBId})
      FOR UPDATE
    `;

    // Find each participant from results
    const participantA = participants.find(p => p.id === participantAId);
    const participantB = participants.find(p => p.id === participantBId);

    if (!participantA || !participantB) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'One or both participants not found'
      );
    }

    if (participantA.study_id !== studyId || participantB.study_id !== studyId) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Participants must belong to the specified study'
      );
    }

    if (participantA.partner_id || participantB.partner_id) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'One or both participants already have partners'
      );
    }

    // Determine strategy based on actor types
    let strategy: PairingStrategy;
    if (participantA.actor_type === ActorType.HUMAN && participantB.actor_type === ActorType.HUMAN) {
      strategy = PairingStrategy.HUMAN_HUMAN;
    } else if (participantA.actor_type === ActorType.SYNTHETIC && participantB.actor_type === ActorType.SYNTHETIC) {
      strategy = PairingStrategy.SYNTHETIC_SYNTHETIC;
    } else {
      strategy = PairingStrategy.HUMAN_SYNTHETIC;
    }

    const metadata: PairingMetadata = {
      pairedAt,
      strategy,
      matchedBy: 'manual',
      pairedByResearcherId: researcherId,
    };

    // Update both participants atomically within the same transaction
    await tx.participant.update({
      where: { id: participantAId },
      data: {
        partnerId: participantBId,
        pairingMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.participant.update({
      where: { id: participantBId },
      data: {
        partnerId: participantAId,
        pairingMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      participantId: participantAId,
      partnerId: participantBId,
      strategy,
      pairedAt,
      metadata,
    };
  });
}

/**
 * Get all pairings for a study
 */
export async function getStudyPairings(studyId: string): Promise<PairingResult[]> {
  const participants = await prisma.participant.findMany({
    where: {
      studyId,
      partnerId: { not: null },
    },
    select: {
      id: true,
      partnerId: true,
      pairingMetadata: true,
    },
  });

  // Deduplicate (each pair appears twice)
  const seen = new Set<string>();
  const results: PairingResult[] = [];

  for (const p of participants) {
    const pairKey = [p.id, p.partnerId!].sort().join('-');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const metadata = (p.pairingMetadata as unknown as PairingMetadata) || {
      pairedAt: new Date(0).toISOString(),
      strategy: PairingStrategy.AUTO,
      matchedBy: 'system' as const,
    };

    results.push({
      participantId: p.id,
      partnerId: p.partnerId!,
      strategy: metadata.strategy,
      pairedAt: metadata.pairedAt,
      metadata,
    });
  }

  return results;
}

/**
 * Parse availability from participant application data
 */
function parseAvailability(application: unknown): AvailabilitySlot[] {
  if (!application || typeof application !== 'object') {
    return [];
  }

  const app = application as ParsedApplication;
  return app.availability || [];
}

/**
 * Calculate hours of availability overlap between two participants
 */
function calculateAvailabilityOverlap(
  slotsA: AvailabilitySlot[],
  slotsB: AvailabilitySlot[]
): number {
  let totalOverlap = 0;

  for (const slotA of slotsA) {
    for (const slotB of slotsB) {
      if (slotA.dayOfWeek !== slotB.dayOfWeek) continue;

      const overlapStart = Math.max(slotA.startHour, slotB.startHour);
      const overlapEnd = Math.min(slotA.endHour, slotB.endHour);

      if (overlapEnd > overlapStart) {
        totalOverlap += overlapEnd - overlapStart;
      }
    }
  }

  return totalOverlap;
}
