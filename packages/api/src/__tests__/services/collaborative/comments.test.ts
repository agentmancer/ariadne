/**
 * Unit tests for Comments Service - Pure Functions
 *
 * These tests cover the pure utility functions that don't require database access.
 * Database-dependent functions should be tested via integration tests.
 */

import { describe, it, expect } from 'vitest';
import { CollaborativePhase, CommentType, Comment } from '@ariadne/shared';
import { buildFeedbackSummary } from '../../../services/collaborative/comments';

describe('Comments Service - Pure Functions', () => {
  const now = new Date();

  const createMockComment = (
    overrides: Partial<Comment> = {}
  ): Comment => ({
    id: 'comment-1',
    authorId: 'author-123',
    targetParticipantId: 'target-456',
    storyDataId: undefined,
    passageId: undefined,
    content: 'Test comment',
    commentType: CommentType.FEEDBACK,
    round: 1,
    phase: CollaborativePhase.REVIEW,
    parentId: undefined,
    resolved: false,
    addressedInRound: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  describe('buildFeedbackSummary', () => {
    it('should return "No feedback" for empty comments', () => {
      const summary = buildFeedbackSummary([]);

      expect(summary).toBe('No feedback received yet.');
    });

    it('should format praise comments under "Strengths noted"', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.PRAISE,
          content: 'Great narrative flow',
        }),
        createMockComment({
          id: 'c2',
          commentType: CommentType.PRAISE,
          content: 'Engaging characters',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**Strengths noted:**');
      expect(summary).toContain('- Great narrative flow');
      expect(summary).toContain('- Engaging characters');
    });

    it('should format suggestions under "Suggestions"', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.SUGGESTION,
          content: 'Consider adding more branches',
        }),
        createMockComment({
          id: 'c2',
          commentType: CommentType.SUGGESTION,
          content: 'Try a twist ending',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**Suggestions:**');
      expect(summary).toContain('- Consider adding more branches');
      expect(summary).toContain('- Try a twist ending');
    });

    it('should format critiques under "Areas to improve"', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.CRITIQUE,
          content: 'Pacing is too slow in the middle',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**Areas to improve:**');
      expect(summary).toContain('- Pacing is too slow in the middle');
    });

    it('should format questions under "Questions raised"', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.QUESTION,
          content: 'Why did the protagonist make that choice?',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**Questions raised:**');
      expect(summary).toContain('- Why did the protagonist make that choice?');
    });

    it('should format general feedback under "General feedback"', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.FEEDBACK,
          content: 'Overall good story, enjoyed playing',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**General feedback:**');
      expect(summary).toContain('- Overall good story, enjoyed playing');
    });

    it('should group comments by type in correct order', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.FEEDBACK,
          content: 'General thought',
        }),
        createMockComment({
          id: 'c2',
          commentType: CommentType.PRAISE,
          content: 'Well done',
        }),
        createMockComment({
          id: 'c3',
          commentType: CommentType.SUGGESTION,
          content: 'Try this',
        }),
        createMockComment({
          id: 'c4',
          commentType: CommentType.CRITIQUE,
          content: 'Needs work',
        }),
        createMockComment({
          id: 'c5',
          commentType: CommentType.QUESTION,
          content: 'What about X?',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      // Check order: PRAISE -> SUGGESTION -> CRITIQUE -> QUESTION -> FEEDBACK
      const praiseIndex = summary.indexOf('**Strengths noted:**');
      const suggestionIndex = summary.indexOf('**Suggestions:**');
      const critiqueIndex = summary.indexOf('**Areas to improve:**');
      const questionIndex = summary.indexOf('**Questions raised:**');
      const feedbackIndex = summary.indexOf('**General feedback:**');

      expect(praiseIndex).toBeLessThan(suggestionIndex);
      expect(suggestionIndex).toBeLessThan(critiqueIndex);
      expect(critiqueIndex).toBeLessThan(questionIndex);
      expect(questionIndex).toBeLessThan(feedbackIndex);
    });

    it('should handle multiple comments of the same type', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.SUGGESTION,
          content: 'First suggestion',
        }),
        createMockComment({
          id: 'c2',
          commentType: CommentType.SUGGESTION,
          content: 'Second suggestion',
        }),
        createMockComment({
          id: 'c3',
          commentType: CommentType.SUGGESTION,
          content: 'Third suggestion',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      // Should only have one "Suggestions:" header
      const matches = summary.match(/\*\*Suggestions:\*\*/g);
      expect(matches).toHaveLength(1);

      // Should have all three suggestions
      expect(summary).toContain('- First suggestion');
      expect(summary).toContain('- Second suggestion');
      expect(summary).toContain('- Third suggestion');
    });

    it('should skip types with no comments', () => {
      const comments = [
        createMockComment({
          id: 'c1',
          commentType: CommentType.PRAISE,
          content: 'Only praise here',
        }),
      ];

      const summary = buildFeedbackSummary(comments);

      expect(summary).toContain('**Strengths noted:**');
      expect(summary).not.toContain('**Suggestions:**');
      expect(summary).not.toContain('**Areas to improve:**');
      expect(summary).not.toContain('**Questions raised:**');
      expect(summary).not.toContain('**General feedback:**');
    });
  });
});
