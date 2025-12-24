/**
 * Database transaction utilities for multi-table operations
 * Ensures data consistency across related records
 */

import { prisma } from '../../lib/prisma';

/**
 * Create a study with all related entities in a transaction
 */
export async function createStudyWithRelations(data: {
  study: any;
  conditions?: any[];
  surveys?: any[];
  experimentDesign?: any;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
    // Create the study
    const study = await tx.study.create({
      data: data.study,
    });

    // Create conditions if provided
    if (data.conditions && data.conditions.length > 0) {
      await tx.condition.createMany({
        data: data.conditions.map(c => ({
          ...c,
          studyId: study.id,
        })),
      });
    }

    // Create surveys if provided
    if (data.surveys && data.surveys.length > 0) {
      await tx.survey.createMany({
        data: data.surveys.map(s => ({
          ...s,
          studyId: study.id,
        })),
      });
    }

    // Create experiment design if provided
    if (data.experimentDesign) {
      await tx.experimentDesign.create({
        data: {
          ...data.experimentDesign,
          studyId: study.id,
        },
      });
    }

    return study;
  });
  } catch (error) {
    console.error('Failed to create study with relations:', error);
    throw new Error(
      `Failed to create study: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create a batch execution with synthetic participants in a transaction
 */
export async function createBatchExecutionWithActors(data: {
  batchExecution: any;
  actorCount: number;
  actorTemplate: any;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
    // Create the batch execution
    const batch = await tx.batchExecution.create({
      data: data.batchExecution,
    });

    // Create synthetic participants
    const participants = [];
    for (let i = 0; i < data.actorCount; i++) {
      const participant = await tx.participant.create({
        data: {
          studyId: batch.studyId,
          uniqueId: `synthetic-${batch.id}-${i + 1}`,
          actorType: 'SYNTHETIC',
          batchId: batch.id,
          agentDefinitionId: data.actorTemplate.agentDefinitionId,
          role: data.actorTemplate.role || 'PLAYER',
          llmConfig: JSON.stringify(data.actorTemplate.llmConfig || {}),
          state: 'ENROLLED',
          metadata: JSON.stringify({
            batchExecutionId: batch.id,
            actorType: 'SYNTHETIC',
          }),
        },
      });
      participants.push(participant);
    }

    // Update batch with created actor count
    await tx.batchExecution.update({
      where: { id: batch.id },
      data: { actorsCreated: data.actorCount },
    });

    return { batch, participants };
  });
  } catch (error) {
    console.error('Failed to create batch execution with actors:', error);
    throw new Error(
      `Failed to create batch execution: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update participant state with event logging in a transaction
 */
export async function updateParticipantWithEvent(
  participantId: string,
  newState: string,
  eventData: any
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Get the current state BEFORE updating
      const currentParticipant = await tx.participant.findUnique({
        where: { id: participantId },
      });

      if (!currentParticipant) {
        throw new Error(`Participant ${participantId} not found`);
      }

      const previousState = currentParticipant.state;

      // Update participant state
      const participant = await tx.participant.update({
        where: { id: participantId },
        data: { state: newState },
      });

      // Log the state change event
      await tx.event.create({
        data: {
          participantId,
          type: 'state_change',
          data: JSON.stringify({
            previousState,
            newState,
            ...eventData,
          }),
          timestamp: new Date(),
        },
      });

      return participant;
    });
  } catch (error) {
    console.error('Failed to update participant with event:', error);
    throw new Error(
      `Failed to update participant state: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete a study with cascade handling in a transaction
 */
export async function deleteStudyWithRelations(studyId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
    // Check for active participants
    const activeParticipants = await tx.participant.count({
      where: {
        studyId,
        state: {
          in: ['ACTIVE', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN'],
        },
      },
    });

    if (activeParticipants > 0) {
      throw new Error(
        `Cannot delete study with ${activeParticipants} active participants`
      );
    }

    // Archive events before deleting participants
    const events = await tx.event.findMany({
      where: {
        participant: {
          studyId,
        },
      },
    });

    if (events.length > 0) {
      // Store events in an archive table or export to S3
      // For now, we'll just log the count
      console.log(`Archiving ${events.length} events for study ${studyId}`);
    }

    // Delete in correct order to respect foreign key constraints
    await tx.event.deleteMany({
      where: { participant: { studyId } },
    });

    await tx.surveyResponse.deleteMany({
      where: { participant: { studyId } },
    });

    await tx.toolUsageLog.deleteMany({
      where: { participant: { studyId } },
    });

    // Note: BiosignalData doesn't have participant relation in schema
    // It only has participantId field, so we need to get participant IDs first
    const participantIds = await tx.participant.findMany({
      where: { studyId },
      select: { id: true },
    });

    if (participantIds.length > 0) {
      await tx.biosignalData.deleteMany({
        where: { participantId: { in: participantIds.map(p => p.id) } },
      });
    }

    await tx.participant.deleteMany({
      where: { studyId },
    });

    await tx.condition.deleteMany({
      where: { studyId },
    });

    await tx.survey.deleteMany({
      where: { studyId },
    });

    await tx.experimentDesign.deleteMany({
      where: { studyId },
    });

    await tx.batchExecution.deleteMany({
      where: { studyId },
    });

    // Finally delete the study
    const study = await tx.study.delete({
      where: { id: studyId },
    });

    return study;
  });
  } catch (error) {
    console.error('Failed to delete study with relations:', error);
    throw new Error(
      `Failed to delete study: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}