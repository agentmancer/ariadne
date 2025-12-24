/**
 * Comment Service
 *
 * Manages feedback comments between participants in collaborative studies.
 * Comments can be attached to specific passages or the overall story.
 */

import {
  Comment,
  CommentType,
  CollaborativePhase,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';
import { CommentType as PrismaCommentType, CollaborativePhase as PrismaPhase } from '@prisma/client';

/**
 * Convert database record to typed Comment
 */
function toComment(record: any): Comment {
  return {
    id: record.id,
    authorId: record.authorId,
    targetParticipantId: record.targetParticipantId,
    storyDataId: record.storyDataId,
    passageId: record.passageId,
    content: record.content,
    commentType: record.commentType as CommentType,
    round: record.round,
    phase: record.phase as CollaborativePhase,
    parentId: record.parentId,
    resolved: record.resolved,
    addressedInRound: record.addressedInRound,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface CreateCommentInput {
  authorId: string;
  targetParticipantId: string;
  storyDataId?: string;
  passageId?: string;
  content: string;
  commentType?: CommentType;
  round: number;
  phase?: CollaborativePhase;
  parentId?: string;
}

/**
 * Create a new comment
 */
export async function createComment(input: CreateCommentInput): Promise<Comment> {
  // Map shared enum values to Prisma enum values
  const commentType = (input.commentType || CommentType.FEEDBACK) as PrismaCommentType;
  const phase = (input.phase || CollaborativePhase.REVIEW) as PrismaPhase;

  const created = await prisma.comment.create({
    data: {
      authorId: input.authorId,
      targetParticipantId: input.targetParticipantId,
      storyDataId: input.storyDataId,
      passageId: input.passageId,
      content: input.content,
      commentType,
      round: input.round,
      phase,
      parentId: input.parentId,
      resolved: false,
    },
  });

  return toComment(created);
}

/**
 * Get a comment by ID
 */
export async function getComment(id: string): Promise<Comment | null> {
  const record = await prisma.comment.findUnique({
    where: { id },
  });

  return record ? toComment(record) : null;
}

/**
 * Get comments received by a participant
 */
export async function getCommentsReceived(
  targetParticipantId: string,
  options?: {
    round?: number;
    phase?: CollaborativePhase;
    storyDataId?: string;
    includeResolved?: boolean;
  }
): Promise<Comment[]> {
  const where: any = { targetParticipantId };

  if (options?.round !== undefined) {
    where.round = options.round;
  }

  if (options?.phase) {
    where.phase = options.phase;
  }

  if (options?.storyDataId) {
    where.storyDataId = options.storyDataId;
  }

  if (!options?.includeResolved) {
    where.resolved = false;
  }

  const records = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toComment);
}

/**
 * Get comments authored by a participant
 */
export async function getCommentsAuthored(
  authorId: string,
  options?: {
    round?: number;
    phase?: CollaborativePhase;
    targetParticipantId?: string;
  }
): Promise<Comment[]> {
  const where: any = { authorId };

  if (options?.round !== undefined) {
    where.round = options.round;
  }

  if (options?.phase) {
    where.phase = options.phase;
  }

  if (options?.targetParticipantId) {
    where.targetParticipantId = options.targetParticipantId;
  }

  const records = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toComment);
}

/**
 * Get comments for a specific story
 */
export async function getStoryComments(
  storyDataId: string,
  options?: {
    passageId?: string;
    includeResolved?: boolean;
  }
): Promise<Comment[]> {
  const where: any = { storyDataId };

  if (options?.passageId) {
    where.passageId = options.passageId;
  }

  if (!options?.includeResolved) {
    where.resolved = false;
  }

  const records = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toComment);
}

/**
 * Get replies to a comment
 */
export async function getCommentReplies(parentId: string): Promise<Comment[]> {
  const records = await prisma.comment.findMany({
    where: { parentId },
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toComment);
}

/**
 * Get comment thread (comment + all nested replies)
 * Optimized: Fetches all related comments in a single query, then builds tree in memory
 */
export async function getCommentThread(commentId: string): Promise<Comment[]> {
  const root = await getComment(commentId);
  if (!root) return [];

  // Fetch all comments that could be descendants in a single query
  // This finds comments that have any parent in the chain
  const allComments = await prisma.comment.findMany({
    where: {
      OR: [
        { id: commentId },
        { parentId: commentId },
        // For deeper nesting, we'll do iterative fetching with collected IDs
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  // Build a map for efficient lookup
  const commentMap = new Map<string, Comment>();
  allComments.forEach(c => commentMap.set(c.id, toComment(c)));

  // Iteratively fetch deeper levels until no more found
  // Limit depth to prevent unbounded queries on deeply nested threads
  const MAX_DEPTH = 10;
  let currentIds = allComments.filter(c => c.parentId === commentId).map(c => c.id);
  let depth = 0;

  while (currentIds.length > 0 && depth < MAX_DEPTH) {
    const deeper = await prisma.comment.findMany({
      where: { parentId: { in: currentIds } },
      orderBy: { createdAt: 'asc' },
    });

    if (deeper.length === 0) break;

    deeper.forEach(c => commentMap.set(c.id, toComment(c)));
    currentIds = deeper.map(c => c.id);
    depth++;
  }

  // Build ordered result: root first, then replies in creation order
  const result: Comment[] = [root];
  const addReplies = (parentId: string) => {
    const replies = Array.from(commentMap.values())
      .filter(c => c.parentId === parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const reply of replies) {
      result.push(reply);
      addReplies(reply.id);
    }
  };

  addReplies(commentId);
  return result;
}

/**
 * Mark a comment as resolved
 */
export async function resolveComment(
  id: string,
  addressedInRound?: number
): Promise<Comment> {
  const updated = await prisma.comment.update({
    where: { id },
    data: {
      resolved: true,
      addressedInRound,
    },
  });

  return toComment(updated);
}

/**
 * Mark a comment as unresolved
 */
export async function unresolveComment(id: string): Promise<Comment> {
  const updated = await prisma.comment.update({
    where: { id },
    data: {
      resolved: false,
      addressedInRound: null,
    },
  });

  return toComment(updated);
}

/**
 * Update comment content
 */
export async function updateCommentContent(
  id: string,
  content: string
): Promise<Comment> {
  const updated = await prisma.comment.update({
    where: { id },
    data: { content },
  });

  return toComment(updated);
}

/**
 * Delete a comment
 */
export async function deleteComment(id: string): Promise<void> {
  // First delete any replies
  await prisma.comment.deleteMany({
    where: { parentId: id },
  });

  // Then delete the comment itself
  await prisma.comment.delete({
    where: { id },
  });
}

/**
 * Get comment statistics for a round
 */
export async function getCommentStats(
  participantId: string,
  round: number
): Promise<{
  received: number;
  given: number;
  resolved: number;
  unresolved: number;
  byType: Record<string, number>;
}> {
  const [received, given, resolved, byType] = await Promise.all([
    prisma.comment.count({
      where: { targetParticipantId: participantId, round },
    }),
    prisma.comment.count({
      where: { authorId: participantId, round },
    }),
    prisma.comment.count({
      where: { targetParticipantId: participantId, round, resolved: true },
    }),
    prisma.comment.groupBy({
      by: ['commentType'],
      where: { targetParticipantId: participantId, round },
      _count: true,
    }),
  ]);

  const typeStats = byType.reduce(
    (acc, curr) => {
      acc[curr.commentType] = curr._count;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    received,
    given,
    resolved,
    unresolved: received - resolved,
    byType: typeStats,
  };
}

/**
 * Get all feedback between two participants for a round
 */
export async function getFeedbackBetweenParticipants(
  participantA: string,
  participantB: string,
  round: number
): Promise<{
  aToB: Comment[];
  bToA: Comment[];
}> {
  const [aToB, bToA] = await Promise.all([
    prisma.comment.findMany({
      where: {
        authorId: participantA,
        targetParticipantId: participantB,
        round,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.comment.findMany({
      where: {
        authorId: participantB,
        targetParticipantId: participantA,
        round,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    aToB: aToB.map(toComment),
    bToA: bToA.map(toComment),
  };
}

/**
 * Build a summary of feedback for inclusion in prompts
 */
export function buildFeedbackSummary(comments: Comment[]): string {
  if (comments.length === 0) {
    return 'No feedback received yet.';
  }

  const lines: string[] = [];
  const byType = new Map<CommentType, Comment[]>();

  // Group by type
  for (const comment of comments) {
    const existing = byType.get(comment.commentType) || [];
    existing.push(comment);
    byType.set(comment.commentType, existing);
  }

  // Format each type
  if (byType.has(CommentType.PRAISE)) {
    lines.push('**Strengths noted:**');
    for (const c of byType.get(CommentType.PRAISE)!) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }

  if (byType.has(CommentType.SUGGESTION)) {
    lines.push('**Suggestions:**');
    for (const c of byType.get(CommentType.SUGGESTION)!) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }

  if (byType.has(CommentType.CRITIQUE)) {
    lines.push('**Areas to improve:**');
    for (const c of byType.get(CommentType.CRITIQUE)!) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }

  if (byType.has(CommentType.QUESTION)) {
    lines.push('**Questions raised:**');
    for (const c of byType.get(CommentType.QUESTION)!) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }

  // General feedback
  if (byType.has(CommentType.FEEDBACK)) {
    lines.push('**General feedback:**');
    for (const c of byType.get(CommentType.FEEDBACK)!) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
