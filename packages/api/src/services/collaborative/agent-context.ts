/**
 * Agent Context Service
 *
 * Manages persistent memory for agents in collaborative studies.
 * The AgentContext preserves knowledge across phases (AUTHOR → PLAY → REVIEW)
 * and rounds, allowing agents to learn and improve over time.
 *
 * Uses PostgreSQL native JSON columns and transactions for atomic updates.
 */

import {
  AgentCollaborativeContext,
  CollaborativePhase,
  StoryDraftEntry,
  PlayExperienceEntry,
  FeedbackEntry,
  LearningEntry,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Convert database record to typed AgentCollaborativeContext
 * With native Json columns, no parsing needed
 */
function toAgentContext(record: any): AgentCollaborativeContext {
  return {
    id: record.id,
    participantId: record.participantId,
    currentRound: record.currentRound,
    currentPhase: record.currentPhase as CollaborativePhase,
    ownStoryDrafts: (record.ownStoryDrafts as StoryDraftEntry[]) || [],
    partnerStoriesPlayed: (record.partnerStoriesPlayed as PlayExperienceEntry[]) || [],
    feedbackGiven: (record.feedbackGiven as FeedbackEntry[]) || [],
    feedbackReceived: (record.feedbackReceived as FeedbackEntry[]) || [],
    cumulativeLearnings: (record.cumulativeLearnings as LearningEntry[]) || [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Get or create an AgentContext for a participant
 */
export async function getOrCreateAgentContext(
  participantId: string
): Promise<AgentCollaborativeContext> {
  const existing = await prisma.agentContext.findUnique({
    where: { participantId },
  });

  if (existing) {
    return toAgentContext(existing);
  }

  // Create new context with empty JSON arrays
  const created = await prisma.agentContext.create({
    data: {
      participantId,
      currentRound: 1,
      currentPhase: 'AUTHOR',
      ownStoryDrafts: [],
      partnerStoriesPlayed: [],
      feedbackGiven: [],
      feedbackReceived: [],
      cumulativeLearnings: [],
    },
  });

  return toAgentContext(created);
}

/**
 * Get an existing AgentContext
 */
export async function getAgentContext(
  participantId: string
): Promise<AgentCollaborativeContext | null> {
  const record = await prisma.agentContext.findUnique({
    where: { participantId },
  });

  return record ? toAgentContext(record) : null;
}

/**
 * Update the current phase
 */
export async function updatePhase(
  participantId: string,
  phase: CollaborativePhase
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.agentContext.update({
    where: { participantId },
    data: { currentPhase: phase },
  });

  return toAgentContext(updated);
}

/**
 * Advance to the next round (atomic operation)
 */
export async function advanceRound(
  participantId: string
): Promise<AgentCollaborativeContext> {
  // Use raw SQL for atomic increment to avoid race conditions
  const updated = await prisma.agentContext.update({
    where: { participantId },
    data: {
      currentRound: { increment: 1 },
      currentPhase: 'AUTHOR', // Reset to AUTHOR phase
    },
  });

  return toAgentContext(updated);
}

/**
 * Add a story draft entry (atomic append using PostgreSQL JSON)
 */
export async function addStoryDraft(
  participantId: string,
  draft: Omit<StoryDraftEntry, 'createdAt'>
): Promise<AgentCollaborativeContext> {
  const entry: StoryDraftEntry = {
    ...draft,
    createdAt: new Date().toISOString(),
  };

  // Use transaction with row-level locking for atomic append
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.agentContext.findUnique({
      where: { participantId },
    });

    if (!current) {
      throw new Error(`AgentContext not found for participant ${participantId}`);
    }

    const drafts = [...((current.ownStoryDrafts as unknown as StoryDraftEntry[]) || []), entry];

    return tx.agentContext.update({
      where: { participantId },
      data: { ownStoryDrafts: drafts as unknown as Prisma.InputJsonValue },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toAgentContext(updated);
}

/**
 * Add a play experience entry (atomic append)
 */
export async function addPlayExperience(
  participantId: string,
  experience: PlayExperienceEntry
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.agentContext.findUnique({
      where: { participantId },
    });

    if (!current) {
      throw new Error(`AgentContext not found for participant ${participantId}`);
    }

    const experiences = [...((current.partnerStoriesPlayed as unknown as PlayExperienceEntry[]) || []), experience];

    return tx.agentContext.update({
      where: { participantId },
      data: { partnerStoriesPlayed: experiences as unknown as Prisma.InputJsonValue },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toAgentContext(updated);
}

/**
 * Add feedback given to partner (atomic append)
 */
export async function addFeedbackGiven(
  participantId: string,
  feedback: FeedbackEntry
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.agentContext.findUnique({
      where: { participantId },
    });

    if (!current) {
      throw new Error(`AgentContext not found for participant ${participantId}`);
    }

    const feedbacks = [...((current.feedbackGiven as unknown as FeedbackEntry[]) || []), feedback];

    return tx.agentContext.update({
      where: { participantId },
      data: { feedbackGiven: feedbacks as unknown as Prisma.InputJsonValue },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toAgentContext(updated);
}

/**
 * Add feedback received from partner (atomic append)
 * Note: This is denormalized data - canonical feedback is in Comment table
 */
export async function addFeedbackReceived(
  participantId: string,
  feedback: FeedbackEntry
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.agentContext.findUnique({
      where: { participantId },
    });

    if (!current) {
      throw new Error(`AgentContext not found for participant ${participantId}`);
    }

    const feedbacks = [...((current.feedbackReceived as unknown as FeedbackEntry[]) || []), feedback];

    return tx.agentContext.update({
      where: { participantId },
      data: { feedbackReceived: feedbacks as unknown as Prisma.InputJsonValue },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toAgentContext(updated);
}

/**
 * Add a learning entry (atomic append)
 */
export async function addLearning(
  participantId: string,
  learning: LearningEntry
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.agentContext.findUnique({
      where: { participantId },
    });

    if (!current) {
      throw new Error(`AgentContext not found for participant ${participantId}`);
    }

    const learnings = [...((current.cumulativeLearnings as unknown as LearningEntry[]) || []), learning];

    return tx.agentContext.update({
      where: { participantId },
      data: { cumulativeLearnings: learnings as unknown as Prisma.InputJsonValue },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toAgentContext(updated);
}

/**
 * Get a summary of the agent's context for inclusion in prompts
 */
export function buildContextSummary(context: AgentCollaborativeContext): string {
  const lines: string[] = [];

  lines.push(`## Current State`);
  lines.push(`Round: ${context.currentRound}`);
  lines.push(`Phase: ${context.currentPhase}`);
  lines.push('');

  // Own stories written
  if (context.ownStoryDrafts.length > 0) {
    lines.push(`## Your Previous Stories`);
    for (const draft of context.ownStoryDrafts) {
      lines.push(`- Round ${draft.round}: ${draft.summary}`);
    }
    lines.push('');
  }

  // Partner stories played
  if (context.partnerStoriesPlayed.length > 0) {
    lines.push(`## Partner Stories You've Played`);
    for (const exp of context.partnerStoriesPlayed) {
      lines.push(`- Round ${exp.round}: ${exp.overallImpression || exp.playNotes}`);
      if (exp.observations.length > 0) {
        lines.push(`  Observations: ${exp.observations.join('; ')}`);
      }
    }
    lines.push('');
  }

  // Feedback received
  if (context.feedbackReceived.length > 0) {
    lines.push(`## Feedback You've Received`);
    for (const fb of context.feedbackReceived) {
      lines.push(`- Round ${fb.round}:`);
      if (fb.strengths.length > 0) {
        lines.push(`  Strengths: ${fb.strengths.join(', ')}`);
      }
      if (fb.improvements.length > 0) {
        lines.push(`  To improve: ${fb.improvements.join(', ')}`);
      }
    }
    lines.push('');
  }

  // Cumulative learnings
  if (context.cumulativeLearnings.length > 0) {
    lines.push(`## Your Learnings So Far`);
    for (const learning of context.cumulativeLearnings) {
      lines.push(`- [${learning.category}] ${learning.insight}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get the latest story draft for a participant
 */
export function getLatestStoryDraft(
  context: AgentCollaborativeContext
): StoryDraftEntry | null {
  if (context.ownStoryDrafts.length === 0) return null;
  return context.ownStoryDrafts[context.ownStoryDrafts.length - 1];
}

/**
 * Get story draft for a specific round
 */
export function getStoryDraftForRound(
  context: AgentCollaborativeContext,
  round: number
): StoryDraftEntry | null {
  return context.ownStoryDrafts.find((d) => d.round === round) || null;
}

/**
 * Get feedback received for a specific round
 */
export function getFeedbackForRound(
  context: AgentCollaborativeContext,
  round: number
): FeedbackEntry | null {
  return context.feedbackReceived.find((f) => f.round === round) || null;
}

/**
 * Delete an AgentContext (for cleanup/testing)
 */
export async function deleteAgentContext(participantId: string): Promise<void> {
  await prisma.agentContext.delete({
    where: { participantId },
  });
}

/**
 * Reset an AgentContext to initial state (for testing/debugging)
 */
export async function resetAgentContext(
  participantId: string
): Promise<AgentCollaborativeContext> {
  const updated = await prisma.agentContext.update({
    where: { participantId },
    data: {
      currentRound: 1,
      currentPhase: 'AUTHOR',
      ownStoryDrafts: [],
      partnerStoriesPlayed: [],
      feedbackGiven: [],
      feedbackReceived: [],
      cumulativeLearnings: [],
    },
  });

  return toAgentContext(updated);
}
